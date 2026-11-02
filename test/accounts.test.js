import test from 'node:test';
import assert from 'node:assert/strict';
import {openDb} from '../src/db.js';
import {createServer} from '../src/server.js';

test('local account registration, login, key management, quota, logout and CSRF',async()=>{
 const db=openDb(':memory:');const server=createServer(db);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 const post=(path,body,cookie,csrf=true)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(csrf?{'Origin':base,'X-HBAH-CSRF':'1'}:{}),...(cookie?{'Cookie':cookie}:{})},body:JSON.stringify(body)});
 try {
  assert.equal((await post('/v1/account/signup',{email:'dev@example.com',password:'very strong passphrase'},null,false)).status,403);
  const signup=await post('/v1/account/signup',{email:'dev@example.com',password:'very strong passphrase'});
  assert.equal(signup.status,201);
  const cookie=signup.headers.get('set-cookie').split(';')[0];
  assert.match(cookie,/hbah_session=/);
  assert.equal((await fetch(base+'/v1/account/me')).status,401);
  const me=await fetch(base+'/v1/account/me',{headers:{Cookie:cookie}});
  assert.equal((await me.json()).email,'dev@example.com');
  const created=await post('/v1/account/keys',{name:'My client'},cookie);assert.equal(created.status,201);
  const {key,id}=await created.json();assert.match(key,/^hbah_live_/);
  const bah=await fetch(base+'/v1/usage',{headers:{'X-API-Key':key}});assert.equal(bah.status,200);
  const keys=await (await fetch(base+'/v1/account/keys',{headers:{Cookie:cookie}})).json();
  assert.equal(keys.keys.length,1);assert.equal(JSON.stringify(keys).includes(key),false);
  assert.equal((await post('/v1/account/keys/revoke',{id},cookie)).status,200);
  assert.equal((await fetch(base+'/v1/usage',{headers:{'X-API-Key':key}})).status,401);
  assert.equal((await post('/v1/account/logout',{},cookie)).status,200);
  assert.equal((await fetch(base+'/v1/account/me',{headers:{Cookie:cookie}})).status,401);
  const denied=await post('/v1/account/login',{email:'dev@example.com',password:'wrong'});assert.equal(denied.status,401);
  assert.equal((await post('/v1/account/login',{email:'dev@example.com',password:'very strong passphrase'})).status,200);
 }finally{await new Promise(r=>server.close(r));db.close();}
});
