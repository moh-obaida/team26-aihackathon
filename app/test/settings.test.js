import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, oppBody } from './helpers.js';

test('notification categories can be switched off; safety notices still arrive', async (t) => {
  const h = await boot();
  t.after(h.close);
  const noor = h.client(); await noor.login('noor.student');
  assert.equal((await noor.patch('/api/me/prefs', { notify: { new_opportunities: false } })).status, 200);
  assert.equal((await noor.patch('/api/me/prefs', { notify: { nonsense: true } })).status, 400);
  const yusuf = h.client(); await yusuf.login('yusuf.student');
  const palm = h.id("SELECT id FROM communities WHERE name='Palm Court Residences'").id;
  const host = h.client(); await host.login('huda.resident');
  const mod = h.client(); await mod.login('layla.mod');
  const o = (await host.post('/api/opportunities', oppBody(palm))).data.opportunity;
  await mod.post(`/api/mod/opportunities/${o.id}/decide`, { decision: 'approve' });
  const count = (name) => h.id("SELECT COUNT(*) c FROM notifications n JOIN users u ON u.id=n.user_id WHERE u.display_name=? AND n.kind='new_opportunity'", name).c;
  assert.equal(count('Noor_15'), 0); // opted out
  assert.equal(count('Yusuf_16'), 1); // default on
  // cancellations are always delivered even with every category off
  await noor.patch('/api/me/prefs', { notify: { applications: false, hours: false, reminders: false, announcements: false } });
  await noor.post(`/api/opportunities/${o.id}/apply`);
  await host.post(`/api/opportunities/${o.id}/cancel`);
  assert.equal(h.id("SELECT COUNT(*) c FROM notifications n JOIN users u ON u.id=n.user_id WHERE u.display_name='Noor_15' AND n.kind='activity_cancelled'").c, 1);
  // announcements reach approved members only
  const r = await mod.post('/api/mod/announcements', { community_id: palm, message: 'Garden tools are now stored in Building C.' });
  assert.equal(r.status, 200);
  assert.ok(r.data.recipients >= 3);
  const omar = h.client(); await omar.login('omar.mod');
  assert.equal((await omar.post('/api/mod/announcements', { community_id: palm, message: 'Not my community at all.' })).status, 404);
});

test('initials-only visibility hides the display name from hosts but not moderators', async (t) => {
  const h = await boot();
  t.after(h.close);
  const noor = h.client(); await noor.login('noor.student');
  await noor.patch('/api/me/prefs', { visibility: 'initials' });
  const host = h.client(); await host.login('huda.resident');
  const opp = h.id("SELECT id FROM opportunities WHERE title LIKE 'Courtyard%'");
  const apps = (await host.get(`/api/opportunities/${opp.id}/applications`)).data.applications;
  assert.ok(apps.length && apps.every((a) => !a.student_name.includes('Noor')), JSON.stringify(apps.map((a) => a.student_name)));
});

test('password change signs out other devices; wrong current password refused', async (t) => {
  const h = await boot();
  t.after(h.close);
  const a = h.client(); await a.login('yusuf.student');
  const b = h.client(); await b.login('yusuf.student');
  assert.equal((await a.get('/api/me/sessions')).data.sessions.length, 2);
  assert.equal((await a.post('/api/me/password', { current: 'nope12345', next: 'NewPass2026' })).data.fields.current, 'wrong_password');
  assert.equal((await a.post('/api/me/password', { current: 'Demo#2026', next: 'NewPass2026' })).status, 200);
  assert.equal((await b.get('/api/notifications')).status, 401); // other device signed out
  assert.equal((await a.get('/api/notifications')).status, 200); // this device kept
  const c = h.client();
  assert.equal((await c.call('POST', '/api/auth/login', { email: 'yusuf.student@team26.demo', password: 'NewPass2026' })).status, 200);
});

test('data export contains only the caller, and deletion de-identifies and blocks sign-in', async (t) => {
  const h = await boot();
  t.after(h.close);
  const y = h.client(); await y.login('yusuf.student');
  const ex = await y.get('/api/me/export');
  assert.equal(ex.status, 200);
  assert.match(ex.headers.get('content-disposition'), /jeran-my-data\.json/);
  assert.equal(ex.data.account.display_name, 'Yusuf_16');
  assert.equal(ex.data.account.pass_hash, undefined);
  assert.ok(!JSON.stringify(ex.data).includes('Noor_15') || ex.data.applications.every((a) => !a.title.includes('Noor')));
  assert.equal((await y.post('/api/me/delete', { password: 'Demo#2026', confirm: 'nope' })).status, 400);
  assert.equal((await y.post('/api/me/delete', { password: 'Demo#2026', confirm: 'DELETE' })).status, 200);
  const row = h.id("SELECT display_name, email, status FROM users WHERE email LIKE 'deleted-%'");
  assert.equal(row.display_name, 'Deleted account');
  assert.equal((await h.client().call('POST', '/api/auth/login', { email: 'yusuf.student@team26.demo', password: 'Demo#2026' })).status, 401);
  assert.equal(h.id("SELECT COUNT(*) c FROM guardian_links g JOIN users u ON u.id=g.student_id WHERE u.email LIKE 'deleted-%' AND g.status='active'").c, 0);
  const ad = h.client(); await ad.login('admin');
  assert.equal((await ad.post('/api/me/delete', { password: 'Demo#2026', confirm: 'DELETE' })).status, 403);
});

test('guardian connections can be removed only by the two people involved', async (t) => {
  const h = await boot();
  t.after(h.close);
  const noor = h.client(); await noor.login('noor.student');
  const conns = (await noor.get('/api/me/connections')).data.connections;
  assert.equal(conns.length, 1);
  const fatima = h.client(); await fatima.login('fatima.guardian');
  assert.equal((await fatima.post(`/api/me/connections/${conns[0].id}/remove`)).status, 404);
  assert.equal((await noor.post(`/api/me/connections/${conns[0].id}/remove`)).status, 200);
  const opp = h.id("SELECT id FROM opportunities WHERE title LIKE 'Reading%'");
  assert.equal((await noor.post(`/api/opportunities/${opp.id}/apply`)).data.error, 'no_guardian');
});
