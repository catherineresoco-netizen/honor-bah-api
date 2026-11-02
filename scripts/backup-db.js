import { DatabaseSync } from 'node:sqlite';
import {existsSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {DB_FILE} from '../src/db.js';
const source=DB_FILE;
const destination=resolve(process.argv[2]||`backups/bah-${new Date().toISOString().replaceAll(':','-')}.sqlite`);
if(!existsSync(source)) throw Error('Source database does not exist: '+source);
if(source===destination || existsSync(destination)) throw Error('Refusing to overwrite source or existing backup');
mkdirSync(dirname(destination),{recursive:true});
const db=new DatabaseSync(source,{readOnly:true});
try{
  // SQLite VACUUM INTO creates a consistent point-in-time copy without overwriting a file.
  db.exec(`VACUUM INTO '${destination.replaceAll("'","''")}'`);
  console.log('Backup created:',destination);
} finally {db.close();}
