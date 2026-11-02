import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';

export const PLANS=Object.freeze({free:100,developer:10000,business:100000});
const digest=(key)=>createHash('sha256').update(key).digest('hex');
const monthNow=()=>new Date().toISOString().slice(0,7);
export function createKey(db,{name,plan='free'}={}){
  if(typeof name!=='string'||!name.trim()||name.length>120) throw new Error('name must be 1-120 characters');
  if(!Object.hasOwn(PLANS,plan)) throw new Error('plan must be free, developer, or business');
  const key=`hbah_live_${randomBytes(32).toString('base64url')}`;
  const prefix=key.slice(0,18);
  const result=db.prepare('INSERT INTO api_keys(name,plan,key_hash,key_prefix) VALUES (?,?,?,?)').run(name.trim(),plan,digest(key),prefix);
  return {id:Number(result.lastInsertRowid),name:name.trim(),plan,prefix,key};
}
export function getKey(db,secret){
  if(typeof secret!=='string'||!/^hbah_live_[A-Za-z0-9_-]{43}$/.test(secret)) return null;
  const hash=digest(secret);
  const row=db.prepare('SELECT id,name,plan,key_hash,key_prefix,revoked_at FROM api_keys WHERE key_hash=?').get(hash);
  if(!row || !timingSafeEqual(Buffer.from(hash),Buffer.from(row.key_hash)) || row.revoked_at) return null;
  return row;
}
export function consume(db,id,month=monthNow()){
  // Serialize read/check/write to prevent simultaneous requests from exceeding the cap.
  db.exec('BEGIN IMMEDIATE');
  try {
    const key=db.prepare('SELECT plan,revoked_at FROM api_keys WHERE id=?').get(id);
    if(!key||key.revoked_at){db.exec('ROLLBACK');return {allowed:false,reason:'INVALID_API_KEY'};}
    const limit=PLANS[key.plan];
    if(!limit){db.exec('ROLLBACK');return {allowed:false,reason:'INVALID_PLAN'};}
    const current=db.prepare('SELECT count FROM usage_monthly WHERE key_id=? AND month=?').get(id,month)?.count??0;
    if(current>=limit){db.exec('COMMIT');return {allowed:false,reason:'PLAN_LIMIT_EXCEEDED',used:current,limit,month};}
    db.prepare('INSERT INTO usage_monthly(key_id,month,count) VALUES (?,?,1) ON CONFLICT(key_id,month) DO UPDATE SET count=count+1').run(id,month);
    db.exec('COMMIT');
    return {allowed:true,used:current+1,limit,remaining:limit-current-1,month};
  } catch(e){db.exec('ROLLBACK');throw e;}
}
export function listKeys(db){return db.prepare(`SELECT k.id,k.name,k.plan,k.key_prefix,k.created_at,k.revoked_at,COALESCE(u.count,0) AS month_requests FROM api_keys k LEFT JOIN usage_monthly u ON u.key_id=k.id AND u.month=? ORDER BY k.id`).all(monthNow());}
export function revokeKey(db,id){return db.prepare('UPDATE api_keys SET revoked_at=CURRENT_TIMESTAMP WHERE id=? AND revoked_at IS NULL').run(id).changes>0;}
