import {readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {openDb} from '../src/db.js';

const args=process.argv.slice(2);
const arg=(name)=>{const i=args.indexOf(name);return i===-1?null:args[i+1];};
const year=Number(arg('--year')||'2026');
if(!Number.isInteger(year)||year<2020||year>2099)throw Error('Invalid --year');
const sourceUrl=`https://www.travel.dod.mil/Portals/119/Documents/BAH/BAH_Rates_All_Locations_All_Pay_Grades/ASCII/BAH-ASCII-${year}.zip`;
const mode=args.includes('--check')?'check':'apply';
const local=arg('--file');
const maxArchive=15_000_000, maxEntry=6_000_000;

// Read only the names explicitly expected from the archive. Never unzip paths to disk.
function readZip(buffer){
  const endSearch=Math.max(0,buffer.length-65557); let eocd=-1;
  for(let i=buffer.length-22;i>=endSearch;i--){if(buffer.readUInt32LE(i)===0x06054b50){eocd=i;break;}}
  if(eocd<0)throw Error('Invalid ZIP: no central directory');
  const count=buffer.readUInt16LE(eocd+10),dir=buffer.readUInt32LE(eocd+16);
  if(count>100)throw Error('Unexpected number of ZIP members');
  const files=new Map();let p=dir;
  for(let i=0;i<count;i++){
    if(p+46>buffer.length||buffer.readUInt32LE(p)!==0x02014b50)throw Error('Malformed ZIP directory');
    const method=buffer.readUInt16LE(p+10),compressed=buffer.readUInt32LE(p+20),original=buffer.readUInt32LE(p+24);
    const nameLen=buffer.readUInt16LE(p+28),extra=buffer.readUInt16LE(p+30),comment=buffer.readUInt16LE(p+32);
    const loc=buffer.readUInt32LE(p+42),name=buffer.subarray(p+46,p+46+nameLen).toString('utf8');
    p+=46+nameLen+extra+comment;
    if(original>maxEntry)throw Error(`ZIP member too large: ${name}`);
    if(loc+30>buffer.length||buffer.readUInt32LE(loc)!==0x04034b50)throw Error('Malformed ZIP entry');
    const start=loc+30+buffer.readUInt16LE(loc+26)+buffer.readUInt16LE(loc+28);
    if(start+compressed>buffer.length)throw Error('Truncated ZIP entry');
    if(files.has(name))throw Error(`Duplicate ZIP member: ${name}`);
    if(!/^([a-zA-Z0-9_. -]+)$/.test(name))throw Error('Unexpected ZIP path');
    if(method!==0&&method!==8)throw Error('Unsupported ZIP compression');
    const body=buffer.subarray(start,start+compressed);
    const out=method===0?body:inflateRawSync(body,{maxOutputLength:maxEntry});
    if(out.length!==original)throw Error(`Incorrect ZIP length for ${name}`);
    files.set(name,out.toString('utf8').replace(/\r/g,''));
  }
  return files;
}
const grades=[...Array.from({length:9},(_,i)=>`E-${i+1}`),...Array.from({length:5},(_,i)=>`W-${i+1}`),'O-1E','O-2E','O-3E',...Array.from({length:10},(_,i)=>`O-${i+1}`)];
function parseRates(text,dep){
  const rows=new Map();
  for(const line of text.trim().split('\n')){
    const cells=line.trim().split(',');
    if(cells.length!==28||!/^[A-Z]{2}\d{3}$/.test(cells[0])||rows.has(cells[0]))throw Error('Malformed or duplicated BAH rate row');
    const vals=cells.slice(1).map(v=>{if(!/^\d+\.00$/.test(v))throw Error(`Unexpected BAH value: ${v}`);return Number(v.slice(0,-3));});
    if(!vals.slice(24).every(v=>v===vals[23]))throw Error(`O-7+ high-grade columns inconsistent: ${cells[0]}`);
    rows.set(cells[0],vals);
  }
  if(rows.size<300)throw Error('Incomplete BAH rate table');
  return rows;
}
const esc=v=>'"'+String(v).replaceAll('"','""')+'"';
function convert(fileMap){
  const yy=String(year).slice(-2);
  const need=name=>{if(!fileMap.has(name))throw Error(`Missing required DoD file: ${name}`);return fileMap.get(name);};
  // Explicitly choose current .txt files. The similarly named bahw_YY.dat is stale in the 2026 archive.
  const withRates=parseRates(need(`bahw${yy}.txt`),1);
  const withoutRates=parseRates(need(`bahwo${yy}.txt`),0);
  if(withRates.size!==withoutRates.size||[...withRates.keys()].some(k=>!withoutRates.has(k)))throw Error('With/without-dependents coverage mismatch');
  // 2026 revision sentinel: superseded Dec data is E-5 with deps $1,554; May is $1,872.
  if(year===2026&&withRates.get('TX270')?.[4]!==1872)throw Error('2026 archive appears superseded: TX270 E-5 with dependents is not $1,872');
  const names=new Map();
  for(const line of need(`mhanames${yy}.txt`).trim().split('\n')){
    const sep=line.indexOf(';'),mha=line.slice(0,sep),name=line.slice(sep+1).trim();
    if(sep<0||!/^[A-Z]{2}\d{3}$/.test(mha)||!name||names.has(mha))throw Error('Malformed MHA name record');
    names.set(mha,name);
  }
  const zips=new Map();
  for(const line of need(`sorted_zipmha${yy}.txt`).trim().split('\n')){
    const match=/^(\d{5})\s+([A-Z]{2}\d{3})\s*$/.exec(line);
    if(!match||zips.has(match[1]))throw Error('Malformed or duplicate ZIP mapping');
    zips.set(match[1],match[2]);
  }
  if(zips.size<10000||names.size<300)throw Error('Incomplete ZIP/MHA coverage');
  for(const mha of zips.values())if(!names.has(mha))throw Error(`ZIP points at unknown MHA ${mha}`);
  for(const mha of withRates.keys())if(!names.has(mha))throw Error(`Rates have unknown MHA ${mha}`);
  // XX499 refers to locations without a published BAH table; preserve the mapping, not synthetic rates.
  const noRate=[...new Set(zips.values())].filter(mha=>!withRates.has(mha));
  if(noRate.some(mha=>mha!=='XX499'))throw Error(`Unexpected MHAs without published rates: ${noRate}`);
  const areas=['year,mha,name',...[...names].map(([mha,name])=>`${year},${mha},${esc(name)}`)].join('\n')+'\n';
  const zipText=['year,zip,mha',...[...zips].map(([zip,mha])=>`${year},${zip},${mha}`)].join('\n')+'\n';
  const rateLines=['year,mha,grade,dependents,monthly'];
  for(const [mha,vals] of withRates){
    const without=withoutRates.get(mha);
    for(let i=0;i<grades.length;i++){
      rateLines.push(`${year},${mha},${grades[i]},1,${vals[i]}`);
      rateLines.push(`${year},${mha},${grades[i]},0,${without[i]}`);
    }
  }
  return {areas,zips:zipText,rates:rateLines.join('\n')+'\n',stats:{areas:names.size,zips:zips.size,rateRows:rateLines.length-1,noRate}};
}
async function download(url){
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),30000);
  try{
    const response=await fetch(url,{signal:controller.signal,headers:{'User-Agent':'HonorBAH-DataUpdater/0.2'}});
    if(!response.ok)throw Error(`DoD server responded HTTP ${response.status}`);
    const len=Number(response.headers.get('content-length')||0);
    if(len>maxArchive)throw Error('DoD ZIP file exceeds size limit');
    const chunks=[];let total=0;
    for await(const chunk of response.body){total+=chunk.length;if(total>maxArchive)throw Error('Download too large');chunks.push(chunk);}
    return Buffer.concat(chunks);
  }finally{clearTimeout(timeout);}
}
const bytes=local?readFileSync(local):await download(sourceUrl);
if(bytes.length>maxArchive)throw Error('Archive exceeds size limit');
const sha=createHash('sha256').update(bytes).digest('hex');
const db=openDb();let prev;
try{prev=db.prepare('SELECT source FROM imports WHERE year=? AND dataset_type=?').get(year,'official')?.source||'';}finally{db.close();}
if(prev.includes(`sha256:${sha}`)){console.log(`No update: ${year} official archive SHA-256 unchanged (${sha.slice(0,16)}...)`);process.exit(0);}
const converted=convert(readZip(bytes));
console.log(`Validated DoD ${year} ZIP: ${converted.stats.areas} areas, ${converted.stats.zips} ZIPs, ${converted.stats.rateRows} rates; special no-rate MHAs: ${converted.stats.noRate.join(',')||'none'}.`);
if(mode==='check'){
  console.log(`UPDATE_AVAILABLE: new validated file; SHA-256 ${sha}`);
  console.log('To import after review, run npm.cmd run update:apply');
  process.exit(0);
}
const staging=mkdtempSync(join(tmpdir(),'honor-bah-import-'));
try{
  for(const key of ['areas','zips','rates'])writeFileSync(join(staging,`${key}.csv`),converted[key]);
  const source=`DoD DTMO BAH-ASCII-${year}.zip current bahw${String(year).slice(-2)}.txt/bahwo${String(year).slice(-2)}.txt sha256:${sha}`;
  const task=spawnSync(process.execPath,['scripts/import-csv.js','--year',String(year),'--dir',staging,'--source',source],{stdio:'inherit'});
  if(task.error)throw task.error;
  if(task.status!==0)throw Error(`Official import failed (exit ${task.status}); existing database remains intact`);
  console.log(`Update published successfully. SHA-256: ${sha}`);
}finally{rmSync(staging,{recursive:true,force:true});}
