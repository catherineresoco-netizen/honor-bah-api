import test from 'node:test';
import assert from 'node:assert/strict';
import {openDb} from '../src/db.js';
import {createServer} from '../src/server.js';

test('site loads publicly while API usage remains authenticated', async () => {
  const db = openDb(':memory:');
  const server = createServer(db);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const home = await fetch(base + '/');
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-type'), /text\/html/);
    assert.match(await home.text(), /Honor BAH/);
    const stylesheet = await fetch(base + '/style.css');
    assert.equal(stylesheet.status, 200);
    assert.match(stylesheet.headers.get('content-type'), /text\/css/);
    const js = await fetch(base + '/main.js');
    assert.equal(js.status, 200);
    const usage = await fetch(base + '/v1/usage');
    assert.equal(usage.status, 401);
  } finally { await new Promise(resolve => server.close(resolve)); db.close(); }
});
