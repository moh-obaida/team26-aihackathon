import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './helpers.js';
import { DEMO_ACCOUNTS } from '../server/seed.js';

test('demo mode lists only the fixed demo people and lets anyone become one without a password', async () => {
  const t = await boot();
  try {
    const c = t.client();
    // a self-registered user must never show up in (or be enterable through) the demo list
    await c.post('/api/auth/signup', { role: 'resident', email: 'res.test@team26.demo', password: 'Passw0rd#2026', display_name: 'Some Neighbour', lang: 'en' });
    const c2 = t.client();
    const list = await c2.get('/api/demo-accounts');
    assert.equal(list.status, 200);
    assert.deepEqual(list.data.accounts.map((a) => a.email).sort(), [...DEMO_ACCOUNTS].sort());
    assert.equal(list.data.password, undefined, 'no password is published');
    assert.deepEqual([...new Set(list.data.accounts.map((a) => a.role))], ['student', 'guardian', 'resident', 'moderator', 'admin']);
    const enter = await c2.post('/api/demo/enter', { email: 'khalid.guardian@team26.demo' });
    assert.equal(enter.status, 200);
    assert.equal(enter.data.user.role, 'guardian');
    assert.equal((await c2.get('/api/auth/me')).data.user.email, 'khalid.guardian@team26.demo');
    const switched = await c2.post('/api/demo/enter', { email: 'layla.mod@team26.demo' });
    assert.equal(switched.data.user.role, 'moderator');
    assert.equal((await c2.get('/api/guardian/dashboard')).status, 403, 'switching really changes who you are');
    assert.equal((await c2.post('/api/demo/enter', { email: 'res.test@team26.demo' })).status, 404, 'registered users cannot be entered');
    assert.equal((await c2.post('/api/demo/enter', { email: 'nobody@example.com' })).status, 404);
  } finally { t.close(); }
});

test('without demo mode the demo endpoints do not exist', async () => {
  const t = await boot({ demo: false });
  try {
    const c = t.client();
    assert.equal((await c.get('/api/demo-accounts')).status, 404);
    assert.equal((await c.post('/api/demo/enter', { email: 'yusuf.student@team26.demo' })).status, 404);
    assert.equal((await c.get('/api/auth/me')).data.user, null);
  } finally { t.close(); }
});
