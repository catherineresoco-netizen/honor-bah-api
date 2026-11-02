import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {openDb} from '../src/db.js';
import {datasetStatus,REQUIRED_YEAR} from '../src/readiness.js';

export function ensureOfficialDataset({dbFile=process.env.DB_FILE, archive=resolve('data/source/BAH-ASCII-2026.zip')}={}) {
  const db = openDb(dbFile);
  let state;
  try { state = datasetStatus(db); } finally { db.close(); }
  if(state.ready) {console.log('Official BAH rates already verified in database.');return state;}
  if(!existsSync(archive))throw Error('Bundled verified DoD archive missing: '+archive);
  console.log('Official BAH dataset missing/incomplete. Importing bundled verified archive...');
  const child=spawnSync(process.execPath, [resolve('scripts/update-dod.js'),'--year',String(REQUIRED_YEAR),'--file',archive],
    {cwd:resolve('.'),env:{...process.env,...(dbFile?{DB_FILE:dbFile}:{})},stdio:'inherit',timeout:120000});
  if(child.error)throw child.error;
  if(child.status!==0)throw Error(`Data initialization failed (exit ${child.status}); refusing to serve BAH requests`);
  const check=openDb(dbFile);
  try {state=datasetStatus(check);} finally {check.close();}
  if(!state.ready)throw Error('Dataset import finished but readiness validation failed: '+state.reason);
  console.log(`Official ${state.year} BAH dataset ready (${state.zips} ZIP mappings, ${state.rates} rates).`);
  return state;
}
if(process.argv[1] && process.argv[1].replaceAll('\\','/').endsWith('/ensure-official.js')){
  try {ensureOfficialDataset();} catch(err) {console.error(err.message);process.exitCode=1;}
}
