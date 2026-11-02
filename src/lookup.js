const GRADES = new Set([
  ...Array.from({length:9},(_,i)=>`E-${i+1}`),
  ...Array.from({length:5},(_,i)=>`W-${i+1}`),
  ...Array.from({length:10},(_,i)=>`O-${i+1}`),
  'O-1E','O-2E','O-3E'
]);
export function parseQuery(q){
  const zip = q.get('zip'); const grade=(q.get('grade')||'').toUpperCase();
  const dep=q.get('dependents'); const year=q.get('year') || '2026';
  if (!/^\d{5}$/.test(zip||'')) return {error:'zip must be a 5-digit duty-station ZIP'};
  if (!GRADES.has(grade)) return {error:'grade must be a valid pay grade (e.g. E-5, W-2, O-3E)'};
  if (dep !== 'true' && dep !== 'false') return {error:'dependents must be true or false'};
  if (!/^20\d{2}$/.test(year)) return {error:'year must be a four-digit year (20xx)'};
  return {zip,grade,dependents:dep==='true'?1:0,year:Number(year)};
}
export function lookup(db,{zip,grade,dependents,year}) {
  const imported=db.prepare('SELECT * FROM imports WHERE year=?').get(year);
  if (!imported) return {status:503, body:{error:'DATASET_NOT_LOADED',message:`No verified rate dataset loaded for ${year}`}};
  const area=db.prepare(`SELECT z.mha,a.name FROM zip_areas z JOIN areas a ON a.year=z.year AND a.mha=z.mha WHERE z.year=? AND z.zip=?`).get(year,zip);
  if (!area) return {status:404,body:{error:'ZIP_NOT_FOUND',message:'ZIP code not present in loaded coverage',coverage:imported.dataset_type}};
  const rate=db.prepare('SELECT monthly FROM rates WHERE year=? AND mha=? AND grade=? AND dependents=?').get(year,area.mha,grade,dependents);
  if (!rate) return {status:404,body:{error:'RATE_NOT_FOUND',message:'No published rate loaded for this combination'}};
  return {status:200,body:{zip_code:zip,year,pay_grade:grade,with_dependents:Boolean(dependents),military_housing_area:{code:area.mha,name:area.name},monthly_bah:rate.monthly,annual_bah:rate.monthly*12,currency:'USD',dataset_type:imported.dataset_type,source:imported.source,note:'Published BAH rate only; not an individual entitlement determination.'}};
}
