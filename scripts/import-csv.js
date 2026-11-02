import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {openDb} from '../src/db.js';
// Expected normalized CSVs: areas(year,mha,name), zips(year,zip,mha), rates(year,mha,grade,dependents,monthly).
// Important: official DoD ASCII archive is NOT automatically parsed here. Convert and verify it first.
function csv(text){
  const records=[]; let row=[],field='',quote=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quote&&text[i+1]==='"'){field+='"';i++;}else quote=!quote;}
    else if(c===','&&!quote){row.push(field);field='';}
    else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);field='';if(row.some(x=>x.length))records.push(row);row=[];}
    else field+=c;
  }
  if(quote)throw Error('Unclosed CSV quote');
  if(field||row.length){row.push(field);records.push(row);}
  const headers=records.shift().map(s=>s.trim().replace(/^\uFEFF/,''));
  return records.map((r,i)=>{if(r.length!==headers.length)throw Error(`Malformed CSV row ${i+2}`);return Object.fromEntries(headers.map((h,j)=>[h,r[j].trim()]));});
}
const args=process.argv.slice(2);const demo=args.includes('--demo');
function val(flag, fallback){const idx=args.indexOf(flag);return idx>=0?args[idx+1]:fallback;}
const year=Number(val('--year','2026'));
const base=resolve(demo?'data/demo':val('--dir','data/import'));
if(!Number.isInteger(year)||year<2000||year>2099)throw Error('Invalid --year');
const datasetType=demo?'demo':'official';
const source=demo?'Demo subset manually verified against published 2026 San Diego rates':val('--source',null);
if(!source)throw Error('Official imports require --source with exact DoD file/revision and verification details');
const areas=csv(readFileSync(`${base}/areas.csv`,'utf8'));
const zips=csv(readFileSync(`${base}/zips.csv`,'utf8'));
const rates=csv(readFileSync(`${base}/rates.csv`,'utf8'));
function check(cond,msg){if(!cond)throw Error(msg);}
check(areas.length>0&&zips.length>0&&rates.length>0,'Empty file(s)');
// Explicit guard against accidentally publishing a tiny 'official' dataset.
if(!demo) check(areas.length>=300&&zips.length>=10000&&rates.length>=15000,'Official import incomplete: expected >=300 areas, >=10,000 ZIPs, >=15,000 rate rows');
const db=openDb();
try{
  const existing=db.prepare('SELECT dataset_type FROM imports WHERE year=?').get(year);
  if(demo && existing?.dataset_type==='official' && !args.includes('--force-demo'))throw Error('Refusing to overwrite official data with demo. Use --force-demo only if intentional.');
  db.exec('BEGIN IMMEDIATE');
  for(const table of ['rates','zip_areas','areas','imports'])db.prepare(`DELETE FROM ${table} WHERE year=?`).run(year);
  db.prepare('INSERT INTO imports(year,dataset_type,source) VALUES (?,?,?)').run(year,datasetType,source);
  const addArea=db.prepare('INSERT INTO areas(year,mha,name) VALUES (?,?,?)');
  for(const a of areas){check(Number(a.year)===year&&/^[A-Z]{2}\d{3}$/.test(a.mha)&&a.name,'Invalid area record');addArea.run(year,a.mha,a.name);}
  const addZip=db.prepare('INSERT INTO zip_areas(year,zip,mha) VALUES (?,?,?)');
  for(const z of zips){check(Number(z.year)===year&&/^\d{5}$/.test(z.zip),'Invalid ZIP record');addZip.run(year,z.zip,z.mha);}
  const addRate=db.prepare('INSERT INTO rates(year,mha,grade,dependents,monthly) VALUES (?,?,?,?,?)');
  for(const r of rates){const dep=Number(r.dependents),monthly=Number(r.monthly);check(Number(r.year)===year&&[0,1].includes(dep)&&Number.isInteger(monthly)&&monthly>=0,'Invalid rate record');addRate.run(year,r.mha,r.grade.toUpperCase(),dep,monthly);}
  // Require both dependent statuses for every grade/MHA provided.
  const bad=db.prepare(`SELECT mha,grade,COUNT(*) AS count FROM rates WHERE year=? GROUP BY mha,grade HAVING count<>2 LIMIT 1`).get(year);
  check(!bad,`Missing dependent status for ${bad?.mha||''} ${bad?.grade||''}`);
  if(!demo){
    const unknown=db.prepare(`SELECT z.mha FROM zip_areas z LEFT JOIN areas a ON a.year=z.year AND a.mha=z.mha WHERE z.year=? AND a.mha IS NULL LIMIT 1`).get(year);
    check(!unknown,'ZIP points to missing MHA');
    const incomplete=db.prepare(`SELECT a.mha,COUNT(r.grade) n FROM areas a LEFT JOIN rates r ON a.year=r.year AND a.mha=r.mha WHERE a.year=? GROUP BY a.mha HAVING n<54 AND a.mha<>'XX499' LIMIT 1`).get(year);
    check(!incomplete,`Incomplete MHA grade table: ${incomplete?.mha}`);
  }
  db.exec('COMMIT');
  console.log(`Imported ${datasetType} ${year}: ${areas.length} areas, ${zips.length} ZIPs, ${rates.length} rates`);
}catch(e){if(db.isTransaction)db.exec('ROLLBACK');throw e;}finally{db.close();}
