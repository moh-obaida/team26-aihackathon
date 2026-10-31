import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, oppBody } from './helpers.js';

test('demo scenario end to end: resident -> moderator -> student -> guardian -> hours -> export', async (t) => {
  const h = await boot();
  t.after(h.close);
  const palm = h.id("SELECT id FROM communities WHERE name='Palm Court Residences'").id;

  // 1. resident joins the gated community; cannot publish until approved
  const res = h.client(); await res.login('new.resident');
  assert.equal((await res.post(`/api/communities/${palm}/join`)).data.status, 'pending');
  assert.equal((await res.post('/api/opportunities', oppBody(palm))).status, 403);

  // 2. moderator approves with a decision on record
  const mod = h.client(); await mod.login('layla.mod');
  const pend = (await mod.get('/api/mod/memberships')).data.memberships;
  const m = pend.find((x) => x.display_name === 'Sami R.');
  assert.ok(m);
  assert.equal((await mod.post(`/api/mod/memberships/${m.id}/decide`, { decision: 'approved' })).status, 200);
  assert.ok(h.id("SELECT 1 x FROM moderation_actions WHERE target_id=? AND action='approved'", m.id));

  // 3. resident creates a supervised cleanup -> pending review, invisible to students
  const created = await res.post('/api/opportunities', oppBody(palm));
  assert.equal(created.status, 200);
  const oid = created.data.opportunity.id;
  assert.equal(created.data.opportunity.status, 'pending_review');
  const student = h.client(); await student.login('noor.student');
  assert.ok(!(await student.get('/api/opportunities')).data.opportunities.some((o) => o.id === oid));

  // 4. moderator publishes -> student discovers
  assert.equal((await mod.post(`/api/mod/opportunities/${oid}/decide`, { decision: 'approve' })).status, 200);
  const found = (await student.get('/api/opportunities?q=cleanup&eligible=1')).data.opportunities.find((o) => o.id === oid);
  assert.ok(found && found.eligible && found.requires_consent);
  assert.equal(found.exact_address, undefined);

  // 5. apply -> pending guardian; resident cannot accept before consent
  const ap = await student.post(`/api/opportunities/${oid}/apply`, { message: 'Happy to help' });
  assert.equal(ap.data.status, 'pending_guardian');
  assert.equal((await res.post(`/api/applications/${ap.data.application_id}/accept`)).status, 409);

  // 6. guardian approves; resident accepts
  const g = h.client(); await g.login('khalid.guardian');
  const dash = (await g.get('/api/guardian/dashboard')).data;
  const consent = dash.pending.find((c) => c.opportunity.id === oid);
  assert.ok(consent.opportunity.supervision && consent.opportunity.general_location);
  assert.equal((await g.post(`/api/consents/${consent.id}/decide`, { decision: 'approved' })).status, 200);
  assert.equal((await res.post(`/api/applications/${ap.data.application_id}/accept`)).status, 200);

  // 7. complete, confirm -> hours pending, NOT verified
  assert.equal((await res.post(`/api/opportunities/${oid}/complete`)).status, 200);
  const part = h.id('SELECT * FROM participation WHERE application_id=?', ap.data.application_id);
  assert.equal(part.status, 'awaiting_confirmation');
  assert.equal((await res.post(`/api/participation/${part.id}/confirm`, { hours: 1.5 })).status, 200);
  let sh = (await student.get('/api/participation/mine')).data;
  assert.equal(sh.totals.verified, 1.5); // only the seeded, already verified record
  assert.ok(sh.records.find((r) => r.id === part.id).status === 'pending_verification');

  // 8. moderator independently verifies; double verification refused
  assert.equal((await mod.post(`/api/mod/participation/${part.id}/decide`, { decision: 'approve' })).status, 200);
  assert.equal((await mod.post(`/api/mod/participation/${part.id}/decide`, { decision: 'approve' })).status, 409);
  sh = (await student.get('/api/participation/mine')).data;
  assert.equal(sh.totals.verified, 3);

  // 9. student export (csv) contains the record, id and platform; own records only
  const csv = await student.get('/api/me/participation/export?format=csv');
  assert.equal(csv.status, 200);
  assert.match(csv.data, /Neighbourhood cleanup morning/);
  assert.match(csv.data, new RegExp(part.id));
  assert.match(csv.data, /Team 26 UAE Community Volunteering/);
  assert.doesNotMatch(csv.data, /Yusuf_16/);
});

test('guardian can reject and withdraw; edit invalidates consent; withdraw frees seat', async (t) => {
  const h = await boot();
  t.after(h.close);
  const palm = h.id("SELECT id FROM communities WHERE name='Palm Court Residences'").id;
  const host = h.client(); await host.login('huda.resident');
  const noor = h.client(); await noor.login('noor.student');
  const yusuf = h.client(); await yusuf.login('yusuf.student');
  const g = h.client(); await g.login('khalid.guardian');
  const mod = h.client(); await mod.login('layla.mod');
  const o = (await host.post('/api/opportunities', oppBody(palm, { capacity: 1, deadline: h.addDays(h.T, 1), date: h.addDays(h.T, 1) }))).data.opportunity;
  await mod.post(`/api/mod/opportunities/${o.id}/decide`, { decision: 'approve' });
  const a1 = (await noor.post(`/api/opportunities/${o.id}/apply`)).data.application_id;
  const a2 = (await yusuf.post(`/api/opportunities/${o.id}/apply`)).data.application_id;
  const pending = (await g.get('/api/guardian/dashboard')).data.pending.filter((c) => c.opportunity.id === o.id);
  for (const c of pending) await g.post(`/api/consents/${c.id}/decide`, { decision: 'approved' });
  assert.equal((await host.post(`/api/applications/${a1}/accept`)).status, 200);
  assert.equal(h.id('SELECT status FROM opportunities WHERE id=?', o.id).status, 'full');
  assert.equal((await host.post(`/api/applications/${a2}/accept`)).status, 409); // capacity
  // material edit expires consent and re-opens guardian review
  const ed = await host.patch(`/api/opportunities/${o.id}`, { start_time: '09:00', end_time: '10:30' });
  assert.equal(ed.status, 200);
  assert.equal(h.id('SELECT status FROM applications WHERE id=?', a1).status, 'pending_guardian');
  assert.equal(h.id('SELECT status FROM consents WHERE application_id=?', a1).status, 'pending');
  assert.equal(h.id('SELECT status FROM opportunities WHERE id=?', o.id).status, 'published'); // seat freed
  // guardian rejection ends the application
  const c = (await g.get('/api/guardian/dashboard')).data.pending.find((x) => x.opportunity.id === o.id && x.student.display_name === 'Noor_15');
  assert.equal((await g.post(`/api/consents/${c.id}/decide`, { decision: 'rejected' })).status, 200);
  assert.equal(h.id('SELECT status FROM applications WHERE id=?', a1).status, 'rejected');
  // student withdrawal + reapply path
  assert.equal((await yusuf.post(`/api/applications/${a2}/withdraw`)).status, 200);
  assert.equal((await yusuf.post(`/api/applications/${a2}/withdraw`)).status, 409);
});

test('resident can request correction flow and cancel; unsafe tasks are blocked', async (t) => {
  const h = await boot();
  t.after(h.close);
  const palm = h.id("SELECT id FROM communities WHERE name='Palm Court Residences'").id;
  const host = h.client(); await host.login('huda.resident');
  const bad = await host.post('/api/opportunities', oppBody(palm, { description: 'Climb a ladder and fix the electrical wiring in the garage together.' }));
  assert.equal(bad.status, 422);
  assert.equal(bad.data.error, 'safeguarding_blocked');
  const ar = await host.post('/api/opportunities', oppBody(palm, { description: 'استخدام مواد كيميائية لتنظيف المسبح مع الأطفال في المساء.' }));
  assert.equal(ar.status, 422);
  const noSup = await host.post('/api/opportunities', oppBody(palm, { supervision: 'n/a' }));
  assert.equal(noSup.data.fields.supervision, 'too_short');
  // correction request
  const mod = h.client(); await mod.login('layla.mod');
  const rec = h.id("SELECT id FROM participation WHERE status='pending_verification'");
  assert.equal((await mod.post(`/api/mod/participation/${rec.id}/decide`, { decision: 'correction' })).status, 400); // reason required
  assert.equal((await mod.post(`/api/mod/participation/${rec.id}/decide`, { decision: 'correction', reason: 'Duration looks too long' })).status, 200);
  assert.equal(h.id('SELECT status FROM participation WHERE id=?', rec.id).status, 'correction_requested');
  assert.equal((await host.post(`/api/participation/${rec.id}/confirm`, { hours: 0.5 })).status, 200);
});

test('safety reports reach moderation queue and can suspend a listing', async (t) => {
  const h = await boot();
  t.after(h.close);
  const stu = h.client(); await stu.login('noor.student');
  const opp = h.id("SELECT id FROM opportunities WHERE title LIKE 'Courtyard%'");
  assert.equal((await stu.post('/api/reports', { category: 'unsafe', details: 'The planned task seems to involve tools.', opportunity_id: opp.id })).status, 200);
  const mod = h.client(); await mod.login('layla.mod');
  const reports = (await mod.get('/api/mod/reports')).data.reports;
  const r = reports.find((x) => x.category === 'unsafe');
  assert.ok(r);
  assert.equal((await mod.post(`/api/mod/reports/${r.id}/update`, { status: 'resolved' })).status, 400);
  assert.equal((await mod.post(`/api/mod/reports/${r.id}/update`, { status: 'resolved', resolution: 'Listing suspended pending review', suspend_opportunity: true })).status, 200);
  assert.equal(h.id('SELECT status FROM opportunities WHERE id=?', opp.id).status, 'cancelled');
  const other = h.client(); await other.login('omar.mod');
  assert.equal((await other.get('/api/mod/reports')).data.reports.length, 0);
});

test('admin: create community, assign moderator, suspend user, audit trail, analytics', async (t) => {
  const h = await boot();
  t.after(h.close);
  const ad = h.client(); await ad.login('admin');
  const c = await ad.post('/api/admin/communities', { name: 'Khalidiya Court', name_ar: 'خالدية كورت', emirate: 'Abu Dhabi', general_location: 'Khalidiya', general_location_ar: 'الخالدية', type: 'gated', description: 'A gated courtyard community.', description_ar: 'مجتمع مسوّر حول فناء مشترك.' });
  assert.equal(c.status, 200);
  const users = (await ad.get('/api/admin/users?q=rashid')).data.users;
  const rashid = users[0];
  assert.equal((await ad.post('/api/admin/moderators', { user_id: rashid.id, community_id: c.data.community.id })).status, 200);
  assert.equal(h.id('SELECT role FROM users WHERE id=?', rashid.id).role, 'moderator');
  const su = (await ad.get('/api/admin/users?q=maryam')).data.users[0];
  assert.equal((await ad.post(`/api/admin/users/${su.id}/status`, { status: 'suspended' })).status, 400); // reason required
  assert.equal((await ad.post(`/api/admin/users/${su.id}/status`, { status: 'suspended', reason: 'Safety investigation' })).status, 200);
  const sc = h.client();
  const l = await sc.call('POST', '/api/auth/login', { email: 'maryam.student@team26.demo', password: 'Demo#2026' });
  assert.equal(l.status, 403);
  const audit = (await ad.get('/api/admin/audit')).data.events.map((e) => e.action);
  for (const a of ['community.create', 'moderator.assign', 'user.suspended']) assert.ok(audit.includes(a), a);
  assert.ok((await ad.get('/api/admin/analytics')).data.verified_hours >= 1.5);
});
