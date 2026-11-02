import {openDb} from '../src/db.js';
import {createKey,listKeys,revokeKey,PLANS} from '../src/auth.js';
const [command,...rest]=process.argv.slice(2);
const db=openDb();
try{
 if(command==='create'){
  const [name,plan='free']=rest;
  if(!name||!Object.hasOwn(PLANS,plan)) throw new Error('Usage: npm.cmd run keys:create -- "Developer Name" free|developer|business');
  const k=createKey(db,{name,plan});
  console.log(`Created key #${k.id} (${k.plan}) for ${k.name}.\n\n${k.key}\n\nCOPY THIS NOW: the full key is never shown again.`);
 }else if(command==='list') console.table(listKeys(db));
 else if(command==='revoke'){
  const id=Number(rest[0]);
  if(!Number.isSafeInteger(id)||id<=0) throw new Error('Usage: npm.cmd run keys:revoke -- 1');
  if(!revokeKey(db,id)) throw new Error('Active key ID not found');
  console.log(`Key #${id} revoked.`);
 }else throw new Error('Usage: node scripts/keys.js create NAME PLAN | list | revoke ID');
}catch(err){console.error(err.message);process.exitCode=1;}finally{db.close();}
