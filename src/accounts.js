import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import {createKey, PLANS} from './auth.js';
const hash = s => createHash('sha256').update(s).digest('hex');
const badPassword = p => typeof p !== 'string' || p.length < 12 || Buffer.byteLength(p)>1024;
function passwordHash(p,salt=randomBytes(16).toString('hex')) { return `scrypt$${salt}$${scryptSync(p,salt,64).toString('hex')}`; }
function verify(p,stored){try {const [,salt,digest]=stored.split('$');const computed=scryptSync(p,salt,64);return timingSafeEqual(computed,Buffer.from(digest,'hex'));}catch{return false;}}
export function signup(db,email,password){
 if(typeof email!=='string'||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error('Valid email required');
 if(badPassword(password)) throw Error('Password must be at least 12 characters');
 const clean=email.toLowerCase().trim();
 try {const ret=db.prepare('INSERT INTO developers (email,password_hash) VALUES (?,?)').run(clean,passwordHash(password));return Number(ret.lastInsertRowid);}
 catch(e){if(e.code==='ERR_SQLITE_ERROR'&&e.message.includes('UNIQUE')) throw Error('Account already exists');throw e;}
}
export function login(db,email,password){
 if(typeof email!=='string'||typeof password!=='string') return null;
 const row=db.prepare('SELECT id,password_hash FROM developers WHERE email=?').get(email.toLowerCase().trim());
 if(!row||!verify(password,row.password_hash)) return null;
 return startSession(db,row.id);
}
export function startSession(db,developerId){
 const token=randomBytes(32).toString('base64url');
 const expiry=new Date(Date.now()+8*3600_000).toISOString();
 db.prepare('INSERT INTO sessions(token_hash,developer_id,expires_at) VALUES (?,?,?)').run(hash(token),developerId,expiry);
 return token;
}
export function getSession(db,token){
 if(typeof token!=='string'||!/^[\w-]{43}$/.test(token)) return null;
 return db.prepare('SELECT d.id,d.email FROM sessions s JOIN developers d ON d.id=s.developer_id WHERE s.token_hash=? AND s.expires_at>?').get(hash(token),new Date().toISOString())||null;
}
export function endSession(db,token){if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token));}
export function createDeveloperKey(db,developerId,label){
 if(typeof label!=='string'||!label.trim()||label.length>80) throw Error('Key name must be 1–80 characters');
 const existing=db.prepare('SELECT COUNT(*) n FROM api_keys WHERE developer_id=? AND revoked_at IS NULL').get(developerId).n;
 if(existing>=5) throw Error('Maximum 5 active keys per account');
 const key=createKey(db,{name:label,plan:'free'});
 db.prepare('UPDATE api_keys SET developer_id=? WHERE id=?').run(developerId,key.id);
 return key;
}
export function listDeveloperKeys(db,developerId){
 const month=new Date().toISOString().slice(0,7);
 return db.prepare(`SELECT k.id,k.name,k.plan,k.key_prefix,k.created_at,k.revoked_at,COALESCE(u.count,0) AS requests_used FROM api_keys k LEFT JOIN usage_monthly u ON u.key_id=k.id AND u.month=? WHERE k.developer_id=? ORDER BY k.id DESC`).all(month,developerId).map(k=>({...k,monthly_limit:PLANS[k.plan]}));
}
export function revokeDeveloperKey(db,developerId,id){
 return db.prepare('UPDATE api_keys SET revoked_at=CURRENT_TIMESTAMP WHERE id=? AND developer_id=? AND revoked_at IS NULL').run(id,developerId).changes>0;
}
