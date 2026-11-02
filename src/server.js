import http from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openDb} from './db.js';
import {parseQuery,lookup} from './lookup.js';
import {getKey,consume,PLANS} from './auth.js';
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
export function createServer(db){
 return http.createServer((req,res)=>{
  let url;
  try{url=new URL(req.url,'http://localhost');}catch{return send(res,400,{error:'INVALID_URL'});}
  if(req.method!=='GET') return send(res,405,{error:'METHOD_NOT_ALLOWED'});
  if(serveSite(res,url.pathname)) return;
  if(url.pathname==='/health') return send(res,200,{status:'ok',service:'honor-bah-api'});
  if(url.pathname!=='/v1/bah'&&url.pathname!=='/v1/usage') return send(res,404,{error:'NOT_FOUND'});
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
 const db=openDb();
 const port=Number(process.env.PORT||3000);
 const server=createServer(db);
 server.listen(port,'127.0.0.1',()=>console.log(`Honor BAH API v0.4 listening at http://localhost:${port} (API key required)`));
 const stop=()=>server.close(()=>{db.close();process.exit(0);});
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
