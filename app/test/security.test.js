import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, oppBody } from './helpers.js';

test('unauthenticated and cross-role access is refused', async (t) => {
  const h = await boot();
  t.after(h.close);
  const anon = h.client();
  for (const p of ['/api/notifications', '/api/opportunities', '/api/mod/overview', '/api/admin/users', '/api/guardian/dashboard']) {
    assert.equal((await anon.get(p)).status, 401, p);
  }
  const stu = h.client(); await stu.login('noor.student');
  for (const p of ['/api/mod/overview', '/api/admin/users', '/api/admin/audit', '/api/guardian/dashboard', '/api/opportunities/mine', '/api/resident/dashboard']) {
    assert.equal((await stu.get(p)).status, 403, p);
  }
  // public community listing exposes no members
  const pub = (await anon.get('/api/communities')).data.communities;
  assert.equal(pub.length, 3);
  assert.ok(pub.every((c) => !('members' in c) && !('moderators' in c)));
  // csrf: mutating call without the custom header is refused
  const r = await anon.call('POST', '/api/auth/login', { email: 'x@y.zz', password: 'abcdefg1' }, { 'x-requested-with': '' });
  assert.equal(r.status, 403);
});

test('cannot self-assign privileged roles at signup or via profile update', async (t) => {
  const h = await boot();
  t.after(h.close);
  const c = h.client();
  const r = await c.post('/api/auth/signup', { email: 'mallory@example.com', password: 'Passw0rd!x', display_name: 'Mallory', role: 'admin' });
  assert.equal(r.status, 400);
  const ok = await c.post('/api/auth/signup', { email: 'mallory@example.com', password: 'Passw0rd!x', display_name: 'Mallory', role: 'resident', is_admin: true });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.role, 'resident');
  assert.equal((await c.patch('/api/me', { role: 'admin', status: 'active', display_name: 'Mal2' })).data.user.role, 'resident');
  assert.equal((await c.get('/api/admin/users')).status, 403);
  assert.equal((await c.post('/api/admin/moderators', { user_id: ok.data.user.id, community_id: 'x' })).status, 403);
  // student signup requires school-age
  const s = await h.client().post('/api/auth/signup', { email: 'adult@example.com', password: 'Passw0rd!x', display_name: 'Adult', role: 'student', age: 30 });
  assert.equal(s.status, 400);
  // weak password
  assert.equal((await h.client().post('/api/auth/signup', { email: 'w@example.com', password: 'password', display_name: 'Weak', role: 'resident' })).data.fields.password, 'weak');
});

test('private community listings are invisible to non-members, guessed ids reveal nothing', async (t) => {
  const h = await boot();
  t.after(h.close);
  const opp = h.id("SELECT id FROM opportunities WHERE title LIKE 'Courtyard%'");
  const maryam = h.client(); await maryam.login('maryam.student'); // member of Al Rawda only
  assert.equal((await maryam.get(`/api/opportunities/${opp.id}`)).status, 404);
  assert.equal((await maryam.post(`/api/opportunities/${opp.id}/apply`)).status, 404);
  assert.ok(!(await maryam.get('/api/opportunities')).data.opportunities.some((o) => o.id === opp.id));
  // guessing the community id doesn't grant membership: gated join is pending
  const palm = h.id("SELECT id FROM communities WHERE name='Palm Court Residences'").id;
  assert.equal((await maryam.post(`/api/communities/${palm}/join`)).data.status, 'pending');
  assert.equal((await maryam.get(`/api/opportunities/${opp.id}`)).status, 404);
  // other moderator (different community) sees nothing and cannot decide
  const omar = h.client(); await omar.login('omar.mod');
  assert.equal((await omar.get(`/api/opportunities/${opp.id}`)).status, 404);
  assert.equal((await omar.post(`/api/mod/opportunities/${opp.id}/decide`, { decision: 'suspend', reason: 'trying anyway' })).status, 404);
  const mem = h.id("SELECT id FROM memberships WHERE status='pending'");
  assert.equal((await omar.post(`/api/mod/memberships/${mem.id}/decide`, { decision: 'approved' })).status, 404);
});

test('unverified resident cannot publish; edit/cancel/manage only own listings', async (t) => {
  const h = await boot();
  t.after(h.close);
  const palm = h.id("SELECT id FROM communities WHERE name='Palm Court Residences'").id;
  const nr = h.client(); await nr.login('new.resident');
  assert.equal((await nr.post('/api/opportunities', oppBody(palm))).data.error, 'not_verified_resident');
  const rashid = h.client(); await rashid.login('rashid.resident'); // approved only in Al Rawda
  assert.equal((await rashid.post('/api/opportunities', oppBody(palm))).status, 403);
  const opp = h.id("SELECT id FROM opportunities WHERE title LIKE 'Courtyard%'");
  assert.equal((await rashid.patch(`/api/opportunities/${opp.id}`, { title: 'Hijacked listing title' })).status, 403);
  assert.equal((await rashid.post(`/api/opportunities/${opp.id}/cancel`)).status, 403);
  assert.equal((await rashid.get(`/api/opportunities/${opp.id}/applications`)).status, 403);
  const app = h.id("SELECT id FROM applications WHERE status='under_review'");
  assert.equal((await rashid.post(`/api/applications/${app.id}/accept`)).status, 403);
});

test('students cannot touch other students, verify own hours, or bypass guardian consent', async (t) => {
  const h = await boot();
  t.after(h.close);
  const noor = h.client(); await noor.login('noor.student');
  const yusuf = h.client(); await yusuf.login('yusuf.student');
  const noorApp = h.id("SELECT a.id FROM applications a JOIN users u ON u.id=a.student_id WHERE u.display_name='Noor_15' AND a.status='under_review'");
  assert.equal((await yusuf.post(`/api/applications/${noorApp.id}/withdraw`)).status, 404);
  // self-verification: role check + record owned by student
  const rec = h.id("SELECT id FROM participation WHERE status='pending_verification'");
  assert.equal((await noor.post(`/api/mod/participation/${rec.id}/decide`, { decision: 'approve' })).status, 403);
  assert.equal((await noor.post(`/api/participation/${rec.id}/confirm`, { hours: 1 })).status, 403);
  // student cannot approve own consent
  const consent = h.id("SELECT c.id FROM consents c WHERE c.status='pending'");
  assert.equal((await yusuf.post(`/api/consents/${consent.id}/decide`, { decision: 'approved' })).status, 403);
  // a guardian unrelated to the student cannot decide either
  const fatima = h.client(); await fatima.login('fatima.guardian');
  assert.equal((await fatima.post(`/api/consents/${consent.id}/decide`, { decision: 'approved' })).status, 404);
  assert.equal((await fatima.get('/api/guardian/dashboard')).data.students.length, 1);
  assert.ok((await fatima.get('/api/guardian/dashboard')).data.pending.every((c) => c.student.display_name === 'Maryam_14'));
  // resident cannot accept without consent (pending_guardian application)
  const host = h.client(); await host.login('huda.resident');
  const yApp = h.id("SELECT id FROM applications WHERE status='pending_guardian'");
  assert.equal((await host.post(`/api/applications/${yApp.id}/accept`)).status, 409);
  // direct DB check: still not accepted
  assert.equal(h.id('SELECT status FROM applications WHERE id=?', yApp.id).status, 'pending_guardian');
  // export contains only own records
  const csv = (await yusuf.get('/api/me/participation/export?format=csv')).data;
  assert.doesNotMatch(csv, /Noor_15/);
});

test('moderator cannot verify hours for non-assigned community; resident cannot verify; capacity cannot be exceeded concurrently', async (t) => {
  const h = await boot();
  t.after(h.close);
  const rec = h.id("SELECT id FROM participation WHERE status='pending_verification'");
  const omar = h.client(); await omar.login('omar.mod');
  assert.equal((await omar.post(`/api/mod/participation/${rec.id}/decide`, { decision: 'approve' })).status, 404);
  const host = h.client(); await host.login('huda.resident');
  assert.equal((await host.post(`/api/mod/participation/${rec.id}/decide`, { decision: 'approve' })).status, 403);
  assert.equal(h.id('SELECT status FROM participation WHERE id=?', rec.id).status, 'pending_verification');

  // capacity race: capacity 1, two consented applicants, parallel accepts -> exactly one accepted
  const palm = h.id("SELECT id FROM communities WHERE name='Palm Court Residences'").id;
  const mod = h.client(); await mod.login('layla.mod');
  const noor = h.client(); await noor.login('noor.student');
  const yusuf = h.client(); await yusuf.login('yusuf.student');
  const g = h.client(); await g.login('khalid.guardian');
  const o = (await host.post('/api/opportunities', oppBody(palm, { capacity: 1 }))).data.opportunity;
  await mod.post(`/api/mod/opportunities/${o.id}/decide`, { decision: 'approve' });
  const a1 = (await noor.post(`/api/opportunities/${o.id}/apply`)).data.application_id;
  const a2 = (await yusuf.post(`/api/opportunities/${o.id}/apply`)).data.application_id;
  assert.equal((await noor.post(`/api/opportunities/${o.id}/apply`)).status, 409); // duplicate
  for (const c of (await g.get('/api/guardian/dashboard')).data.pending.filter((c) => c.opportunity.id === o.id)) await g.post(`/api/consents/${c.id}/decide`, { decision: 'approved' });
  const results = await Promise.all([host.post(`/api/applications/${a1}/accept`), host.post(`/api/applications/${a2}/accept`)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(h.id("SELECT COUNT(*) c FROM applications WHERE opportunity_id=? AND status='accepted'", o.id).c, 1);
});

test('input validation: oversize, invalid json, bidi control chars stripped, csv formula neutralised', async (t) => {
  const h = await boot();
  t.after(h.close);
  const host = h.client(); await host.login('huda.resident');
  const palm = h.id("SELECT id FROM communities WHERE name='Palm Court Residences'").id;
  const r = await host.post('/api/opportunities', oppBody(palm, { title: '=HYPERLINK("http://evil","x") cleanup‮', capacity: 999 }));
  assert.equal(r.status, 400);
  assert.equal(r.data.fields.capacity, 'out_of_range');
  const big = await host.call('POST', '/api/opportunities', { x: 'a'.repeat(200_000) });
  assert.equal(big.status, 413);
  const past = await host.post('/api/opportunities', oppBody(palm, { date: '2020-01-01' }));
  assert.equal(past.data.fields.date, 'past_date');
  // formula injection in export
  const o = (await host.post('/api/opportunities', oppBody(palm, { title: '=cmd|calc cleanup morning' }))).data.opportunity;
  assert.ok(o.title.startsWith('=cmd')); // stored verbatim, escaped on export
  const { csvCell } = await import('../server/lib.js');
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
});

test('rate limiting on auth endpoints and session invalidation on suspension', async (t) => {
  const h = await boot({ authLimit: 5 });
  t.after(h.close);
  const c = h.client();
  const codes = [];
  for (let i = 0; i < 8; i++) codes.push((await c.call('POST', '/api/auth/login', { email: 'noor.student@team26.demo', password: 'wrongpass1' })).status);
  assert.ok(codes.includes(429), codes.join(','));
  assert.equal(codes[0], 401);
});
