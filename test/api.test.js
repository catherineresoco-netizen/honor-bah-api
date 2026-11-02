import test from 'node:test';
import assert from 'node:assert/strict';
import {openDb} from '../src/db.js';
import {lookup,parseQuery} from '../src/lookup.js';
const db=openDb(':memory:');
db.prepare('INSERT INTO imports(year,dataset_type,source) VALUES (?,?,?)').run(2026,'demo','test');
db.prepare('INSERT INTO areas(year,mha,name) VALUES (?,?,?)').run(2026,'CA038','SAN DIEGO, CA');
db.prepare('INSERT INTO zip_areas(year,zip,mha) VALUES (?,?,?)').run(2026,'92136','CA038');
db.prepare('INSERT INTO rates(year,mha,grade,dependents,monthly) VALUES (?,?,?,?,?)').run(2026,'CA038','E-5',1,3975);
test('published demo lookup',()=>{
 const response=lookup(db,{zip:'92136',grade:'E-5',dependents:1,year:2026});
 assert.equal(response.status,200);assert.equal(response.body.monthly_bah,3975);assert.equal(response.body.annual_bah,47700);assert.equal(response.body.dataset_type,'demo');
});
test('missing ZIP is 404, never guessed',()=>assert.equal(lookup(db,{zip:'99999',grade:'E-5',dependents:1,year:2026}).status,404));
test('unloaded year is 503',()=>assert.equal(lookup(db,{zip:'92136',grade:'E-5',dependents:1,year:2025}).status,503));
test('validates duty ZIP and dependent status',()=>{
 assert.ok(parseQuery(new URLSearchParams('zip=bad&grade=E-5&dependents=true')).error);
 assert.ok(parseQuery(new URLSearchParams('zip=92136&grade=E-5&dependents=maybe')).error);
 assert.equal(parseQuery(new URLSearchParams('zip=92136&grade=e-5&dependents=false')).dependents,0);
});
