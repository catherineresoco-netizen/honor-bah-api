import test from 'node:test';
import assert from 'node:assert/strict';
import {openDb} from '../src/db.js';
import {createServer} from '../src/server.js';
import {createKey} from '../src/auth.js';
const secret='test-proxy-secret-which-is-long-enough-2026';
test('RapidAPI gateway mode denies bypass and accepts only valid proxy secret',async()=>{
 const db=openDb(':memory:');
 db.prepare('INSERT INTO imports(year,dataset_type,source) VALUES (?,?,?)').run(2026,'demo','fixture');
 db.prepare('INSERT INTO areas(year,mha,name) VALUES (?,?,?)').run(2026,'CA038','SAN DIEGO');
 db.prepare('INSERT INTO zip_areas(year,zip,mha) VALUES (?,?,?)').run(2026,'92136','CA038');
 db.prepare('INSERT INTO rates(year,mha,grade,dependents,monthly) VALUES (?,?,?,?,?)').run(2026,'CA038','E-5',1,3975);
 const key=createKey(db,{name:'Direct',plan:'free'});
 const server=createServer(db,{API_MODE:'rapidapi',RAPIDAPI_PROXY_SECRET:secret});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 const path='/v1/bah?zip=92136&grade=E-5&dependents=true&year=2026';
 try {
  assert.equal((await fetch(base+path)).status,403);
  assert.equal((await fetch(base+path,{headers:{'X-RapidAPI-Key':'fake-client-key','X-API-Key':key.key}})).status,403);
  assert.equal((await fetch(base+path,{headers:{'X-RapidAPI-Proxy-Secret':'wrong'}})).status,403);
  const res=await fetch(base+path,{headers:{'X-RapidAPI-Proxy-Secret':secret}});
  assert.equal(res.status,200);
  assert.equal((await res.json()).monthly_bah,3975);
  assert.equal((await fetch(base+'/v1/usage',{headers:{'X-RapidAPI-Proxy-Secret':secret}})).status,404);
  assert.equal((await fetch(base+'/v1/account/me',{headers:{'X-RapidAPI-Proxy-Secret':secret}})).status,404);
  assert.equal((await fetch(base+'/v1/bah?zip=wrong',{headers:{'X-RapidAPI-Proxy-Secret':secret}})).status,400);
  assert.equal((await fetch(base+'/v1/bah?zip=00000&grade=E-5&dependents=true&year=2026',{headers:{'X-RapidAPI-Proxy-Secret':secret}})).status,404);
 } finally {await new Promise(r=>server.close(r));db.close();}
});
