import http from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openDb} from './db.js';
import {parseQuery,lookup} from './lookup.js';
import {getKey,consume,PLANS} from './auth.js';
import {signup,login,startSession,getSession,endSession,createDeveloperKey,listDeveloperKeys,revokeDeveloperKey} from './accounts.js';
const siteRoot = resolve(fileURLToPath(new URL('../docs/', import.meta.url)));
const staticAssets = Object.freeze({
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/main.js': ['main.js', 'application/javascript; charset=utf-8']
});
function serveSite(res,pathname){
  const asset=staticAssets[pathname];
  if(!asset) return false;
  try {
    const data=readFileSync(resolve(siteRoot,asset[0]));
    res.writeHead(200,{'Content-Type':asset[1],'Content-Length':data.length,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'"});
    res.end(data);
  } catch { send(res,500,{error:'STATIC_ASSET_UNAVAILABLE'}); }
  return true;
}
function send(res,status,body,extra={}){
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});
  res.end(JSON.stringify(body,null,2));
}
function sessionToken(req){const raw=req.headers.cookie||'';return raw.split(';').map(x=>x.trim()).find(x=>x.startsWith('hbah_session='))?.slice(13)||'';}
function sessionCookie(token='',expire=false){return `hbah_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${expire?0:28800}`;}
function readJson(req){return new Promise((resolve,reject)=>{
 let chunks=[],bytes=0;
 req.on('data',chunk=>{bytes+=chunk.length;if(bytes>8192){reject(Error('Request too large'));req.destroy();}else chunks.push(chunk);});
 req.on('end',()=>{try {resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(Error('Invalid JSON'));}});
 req.on('error',reject);
 });}
function csrfAllowed(req){
 const host=req.headers.host;
 const origin=req.headers.origin;
 const fetchSite=req.headers['sec-fetch-site'];
 return req.headers['x-hbah-csrf']==='1' && !!origin && origin===`http://${host}` && (!fetchSite||fetchSite==='same-origin');
}
const loginAttempts=new Map();
// RapidAPI's gateway authenticates subscribers, sets quotas and invoices them.
// The origin must verify ONLY the proxy-injected secret; client X-RapidAPI-Key
// headers are never proof of authentication at the origin.
function validRapidProxy(req, env){
 const configured=env.RAPIDAPI_PROXY_SECRET;
 const received=req.headers['x-rapidapi-proxy-secret'];
 if(!configured || typeof received!=='string') return false;
 const a=Buffer.from(received),b=Buffer.from(configured);
 return a.length===b.length && timingSafeEqual(a,b);
}
function operatingMode(env){return env.API_MODE==='rapidapi'?'rapidapi':'local';}

export function createServer(db,env=process.env){
 return http.createServer(async(req,res)=>{
  let url;
  try{url=new URL(req.url,'http://localhost');}catch{return send(res,400,{error:'INVALID_URL'});}
  if(url.pathname.startsWith('/v1/account/')){
    if(operatingMode(env)==='rapidapi') return send(res,404,{error:'NOT_FOUND'});
    // Local-only account prototype. Never expose these routes on GitHub Pages or a public bind.
    if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.localAddress)) return send(res,403,{error:'LOCAL_ONLY'});
    if(req.method==='POST' && !csrfAllowed(req)) return send(res,403,{error:'CSRF_CHECK_FAILED'});
    const session=getSession(db,sessionToken(req));
    if(url.pathname==='/v1/account/me' && req.method==='GET') return session?send(res,200,{email:session.email,keys:listDeveloperKeys(db,session.id)}):send(res,401,{error:'NOT_LOGGED_IN'});
    if(url.pathname==='/v1/account/keys' && req.method==='GET') return session?send(res,200,{keys:listDeveloperKeys(db,session.id)}):send(res,401,{error:'NOT_LOGGED_IN'});
    if(req.method!=='POST') return send(res,405,{error:'METHOD_NOT_ALLOWED'});
    let body;try{body=await readJson(req);}catch{return send(res,400,{error:'INVALID_JSON'});}
    if(!body||typeof body!=='object'||Array.isArray(body)) return send(res,400,{error:'INVALID_BODY'});
    if(url.pathname==='/v1/account/signup'){
      if(process.env.ENABLE_LOCAL_SIGNUP==='0') return send(res,403,{error:'SIGNUP_DISABLED'});
      try{const id=signup(db,body.email,body.password);const token=startSession(db,id);return send(res,201,{email:body.email.toLowerCase().trim()},{'Set-Cookie':sessionCookie(token)});}
      catch(e){return send(res,400,{error:'SIGNUP_FAILED',message:e.message});}
    }
    if(url.pathname==='/v1/account/login'){
      const ip=req.socket.remoteAddress;
      const now=Date.now();
      const failures=loginAttempts.get(ip)||[];
      const recent=failures.filter(t=>now-t<15*60_000);
      if(recent.length>=10) return send(res,429,{error:'TOO_MANY_ATTEMPTS'});
      const token=login(db,body.email,body.password);
      if(!token){recent.push(now);loginAttempts.set(ip,recent);return send(res,401,{error:'INVALID_CREDENTIALS'});}
      loginAttempts.delete(ip);
      return send(res,200,{ok:true},{'Set-Cookie':sessionCookie(token)});
    }
    if(!session) return send(res,401,{error:'NOT_LOGGED_IN'});
    if(url.pathname==='/v1/account/logout'){
      endSession(db,sessionToken(req));return send(res,200,{ok:true},{'Set-Cookie':sessionCookie('',true)});
    }
    if(url.pathname==='/v1/account/keys'){
      try{const key=createDeveloperKey(db,session.id,body.name);return send(res,201,{key:key.key,id:key.id,name:key.name,plan:key.plan,prefix:key.prefix});}
      catch(e){return send(res,400,{error:'KEY_CREATE_FAILED',message:e.message});}
    }
    if(url.pathname==='/v1/account/keys/revoke'){
      if(!Number.isSafeInteger(body.id)||body.id<1) return send(res,400,{error:'INVALID_KEY_ID'});
      const ok=revokeDeveloperKey(db,session.id,body.id);
      return send(res,ok?200:404,ok?{ok:true}:{error:'KEY_NOT_FOUND'});
    }
    return send(res,404,{error:'NOT_FOUND'});
  }
  if(req.method!=='GET') return send(res,405,{error:'METHOD_NOT_ALLOWED'});
  if(serveSite(res,url.pathname)) return;
  if(url.pathname==='/health') return send(res,200,{status:'ok',service:'honor-bah-api'});
  if(url.pathname!=='/v1/bah'&&url.pathname!=='/v1/usage') return send(res,404,{error:'NOT_FOUND'});
  if(operatingMode(env)==='rapidapi'){
    // Never expose direct-plan usage or account routes through the marketplace.
    if(url.pathname==='/v1/usage') return send(res,404,{error:'NOT_FOUND'});
    if(!validRapidProxy(req,env)) return send(res,403,{error:'INVALID_GATEWAY_SECRET'});
    const input=parseQuery(url.searchParams);
    if(input.error) return send(res,400,{error:'VALIDATION_ERROR',message:input.error});
    const result=lookup(db,input);
    return send(res,result.status,result.body);
  }
  const key=getKey(db,req.headers['x-api-key']);
  if(!key) return send(res,401,{error:'INVALID_API_KEY',message:'Provide a valid active X-API-Key header.'});
  if(url.pathname==='/v1/usage'){
    const month=new Date().toISOString().slice(0,7);
    const used=db.prepare('SELECT count FROM usage_monthly WHERE key_id=? AND month=?').get(key.id,month)?.count??0;
    return send(res,200,{plan:key.plan,month,requests_used:used,monthly_limit:PLANS[key.plan],requests_remaining:Math.max(0,PLANS[key.plan]-used)});
  }
  // Invalid requests do not consume quota; successfully authenticated, valid lookup attempts do.
  const input=parseQuery(url.searchParams);
  if(input.error) return send(res,400,{error:'VALIDATION_ERROR',message:input.error});
  const quota=consume(db,key.id);
  if(!quota.allowed){return send(res,quota.reason==='PLAN_LIMIT_EXCEEDED'?429:401,{error:quota.reason,month:quota.month,monthly_limit:quota.limit,requests_used:quota.used},{'Retry-After':'3600'});}
  const result=lookup(db,input);
  return send(res,result.status,result.body,{'X-RateLimit-Limit':String(quota.limit),'X-RateLimit-Remaining':String(quota.remaining)});
 });
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===fileURLToPath(new URL(`file://${process.argv[1].replaceAll('\\','/')}`))){
 if(process.env.API_MODE==='rapidapi' && (!process.env.RAPIDAPI_PROXY_SECRET || process.env.RAPIDAPI_PROXY_SECRET.length<32)){
   console.error('Refusing to start: RAPIDAPI_PROXY_SECRET must contain at least 32 characters in rapidapi mode.');
   process.exit(1);
 }
 const db=openDb();
 const port=Number(process.env.PORT||3000);
 const server=createServer(db);
 const host=process.env.HOST||(process.env.API_MODE==='rapidapi'?'0.0.0.0':'127.0.0.1');
 server.listen(port,host,()=>console.log(`Honor BAH API v0.6 listening on ${host}:${port} (mode: ${operatingMode(process.env)})`));
 const stop=()=>server.close(()=>{db.close();process.exit(0);});
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
