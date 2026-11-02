// Readiness requires a sufficiently complete, official rate table, not just an HTTP listener.
export const REQUIRED_YEAR = 2026;
export function datasetStatus(db, year=REQUIRED_YEAR) {
  const row=db.prepare('SELECT dataset_type,source FROM imports WHERE year=?').get(year);
  if(row?.dataset_type!=='official') return {ready:false,year,reason:'OFFICIAL_DATASET_NOT_LOADED'};
  const areas=db.prepare('SELECT COUNT(*) AS n FROM areas WHERE year=?').get(year).n;
  const zips=db.prepare('SELECT COUNT(*) AS n FROM zip_areas WHERE year=?').get(year).n;
  const rates=db.prepare('SELECT COUNT(*) AS n FROM rates WHERE year=?').get(year).n;
  const sentinel=db.prepare(`SELECT r.monthly FROM rates r JOIN zip_areas z ON z.year=r.year AND z.mha=r.mha
    WHERE z.year=? AND z.zip='92136' AND r.grade='E-5' AND r.dependents=1`).get(year);
  // These limits catch demo/corrupt/incomplete data. The sentinel catches old or wrong values.
  if(areas<300||zips<40000||rates<18000||sentinel?.monthly!==3975)
    return {ready:false,year,reason:'OFFICIAL_DATASET_INCOMPLETE'};
  return {ready:true,year,areas,zips,rates};
}
