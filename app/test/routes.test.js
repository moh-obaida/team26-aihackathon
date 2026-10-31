import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { boot } from './helpers.js';

test('a student can list their own applications (GET /api/applications/mine is not read as an id)', async () => {
  const t = await boot();
  try {
    const c = t.client();
    await c.login('yusuf.student');
    const r = await c.get('/api/applications/mine');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.data.applications) && r.data.applications.length > 0);
    const one = await c.get('/api/applications/' + r.data.applications[0].id);
    assert.equal(one.status, 200, 'the :id route still works');
  } finally { t.close(); }
});

test('no :param route is registered before a literal route it would swallow', () => {
  const src = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'server', 'app.js'), 'utf8');
  const rs = [...src.matchAll(/route\('(GET|POST|PATCH|PUT|DELETE)', '(\/api[^']*)'/g)].map((m) => ({ m: m[1], p: m[2] }));
  const re = (p) => new RegExp('^' + p.replace(/:(\w+)/g, '([^/]+)') + '$');
  const shadowed = [];
  rs.forEach((b, j) => rs.slice(0, j).forEach((a) => { if (a.m === b.m && a.p !== b.p && a.p.includes(':') && re(a.p).test(b.p)) shadowed.push(`${b.m} ${b.p} is shadowed by ${a.p}`); }));
  assert.deepEqual(shadowed, []);
});
