import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDb} from '../src/db.js';
import {datasetStatus} from '../src/readiness.js';
import {createServer} from '../src/server.js';
import {ensureOfficialDataset} from '../scripts/ensure-official.js';

test('readiness refuses empty and demo datasets', async()=>{
 const db=openDb(':memory:');
 assert.equal(datasetStatus(db).ready,false);
 const server=createServer(db,{API_MODE:'rapidapi',RAPIDAPI_PROXY_SECRET:'test-secret'});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try {let r=await fetch(`http://127.0.0.1:${server.address().port}/ready`);
  assert.equal(r.status,503);assert.equal((await r.json()).reason,'OFFICIAL_DATASET_NOT_LOADED');
 }finally{await new Promise(r=>server.close(r));db.close();}
});

test('bundled official data initializes offline and survives cold start with ephemeral DB',()=>{
 const dir=mkdtempSync(join(tmpdir(),'hbah-coldstart-'));const file=join(dir,'bah.sqlite');
 try {
  const first=ensureOfficialDataset({dbFile:file});
  assert.equal(first.ready,true);assert.ok(first.zips>40000);
  const db=openDb(file);
  try {assert.equal(datasetStatus(db).ready,true);
   const row=db.prepare(`SELECT r.monthly FROM rates r JOIN zip_areas z ON z.year=r.year AND z.mha=r.mha WHERE z.zip='92136' AND z.year=2026 AND r.grade='E-5' AND r.dependents=1`).get();
   assert.equal(row.monthly,3975);
  }finally{db.close();}
  const second=ensureOfficialDataset({dbFile:file});assert.equal(second.ready,true);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
