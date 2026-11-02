import test from 'node:test';
import assert from 'node:assert/strict';
import {openDb} from '../src/db.js';
import {createKey,getKey,consume,listKeys,revokeKey} from '../src/auth.js';
import {createServer} from '../src/server.js';

test('key stored hashed, quotas enforced, revoked key denied, separate monthly usage',()=>{
 const db=openDb(':memory:');
 try{
  const k=createKey(db,{name:'Alice',plan:'free'});
  assert.ok(k.key.startsWith('hbah_live_'));
  assert.equal(db.prepare('SELECT key_hash FROM api_keys WHERE id=?').get(k.id).key_hash.includes(k.key),false);
  assert.equal(getKey(db,k.key).id,k.id);
  assert.equal(getKey(db,'wrong'),null);
  for(let i=0;i<100;i++) assert.equal(consume(db,k.id,'2026-11').allowed,true);
  assert.equal(consume(db,k.id,'2026-11').reason,'PLAN_LIMIT_EXCEEDED');
  assert.equal(consume(db,k.id,'2026-12').allowed,true);
  assert.equal(listKeys(db).length,1);
  assert.equal(revokeKey(db,k.id),true);
  assert.equal(getKey(db,k.key),null);
  assert.equal(consume(db,k.id).allowed,false);
 }finally{db.close();}
});
test('HTTP authentication, quota headers, usage and revocation',async()=>{
 const db=openDb(':memory:');
 const k=createKey(db,{name:'Integration test',plan:'free'});
 db.prepare('INSERT INTO imports(year,dataset_type,source) VALUES (?,?,?)').run(2026,'demo','test');
 db.prepare('INSERT INTO areas(year,mha,name) VALUES (?,?,?)').run(2026,'CA038','SAN DIEGO');
 db.prepare('INSERT INTO zip_areas(year,zip,mha) VALUES (?,?,?)').run(2026,'92136','CA038');
 db.prepare('INSERT INTO rates(year,mha,grade,dependents,monthly) VALUES (?,?,?,?,?)').run(2026,'CA038','E-5',1,3975);
 const server=createServer(db);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const path='/v1/bah?zip=92136&grade=E-5&dependents=true&year=2026';
  assert.equal((await fetch(base+path)).status,401);
  const opts={headers:{'X-API-Key':k.key}};
  const invalid=await fetch(base+'/v1/bah?zip=oops',opts);
  assert.equal(invalid.status,400);
  const result=await fetch(base+path,opts);
  assert.equal(result.status,200);
  assert.equal(result.headers.get('X-RateLimit-Remaining'),'99');
  assert.equal((await result.json()).monthly_bah,3975);
  const usage=await (await fetch(base+'/v1/usage',opts)).json();
  assert.equal(usage.requests_used,1);
  revokeKey(db,k.id);
  assert.equal((await fetch(base+path,opts)).status,401);
 }finally{await new Promise(r=>server.close(r));db.close();}
});
