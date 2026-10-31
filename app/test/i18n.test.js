import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { en } from '../src/i18n.js';
import { ar } from '../src/i18n-ar.js';

const root = path.resolve(import.meta.dirname, '..');
const src = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? src(path.join(d, e.name)) : /\.jsx?$/.test(e.name) ? [path.join(d, e.name)] : []));
const files = src(path.join(root, 'src')).map((f) => fs.readFileSync(f, 'utf8'));
const server = ['app.js', 'seed.js', 'lib.js', 'safeguard.js'].map((f) => fs.readFileSync(path.join(root, 'server', f), 'utf8')).join('\n');

export function requiredKeys() {
  const keys = new Set();
  for (const s of files) for (const m of s.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) if (!m[1].endsWith('.')) keys.add(m[1]);
  // NAV tables reference keys as plain strings
  for (const s of files) for (const m of s.matchAll(/\['\/[^']*', '[a-zA-Z]+', '([a-z]+\.[a-zA-Z.]+)'/g)) keys.add(m[1]);
  const fam = (prefix, list) => list.forEach((x) => keys.add(prefix + x));
  const cats = ['cleanup', 'gardening', 'seniors', 'reading', 'pets', 'events', 'tutoring', 'other'];
  fam('cat.', cats);
  fam('repcat.', ['unsafe', 'suspicious', 'misrepresentation', 'privacy', 'harassment', 'inappropriate', 'other']);
  fam('safe.', ['dangerous_equipment', 'electrical', 'hazardous', 'private_meeting', 'unsafe_physical']);
  fam('role.', ['student', 'resident', 'guardian', 'moderator', 'admin']);
  fam('emirate.', ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah']);
  fam('status.membership.', ['pending', 'approved', 'rejected', 'revoked', 'suspended']);
  fam('status.opp.', ['draft', 'pending_review', 'published', 'full', 'closed', 'cancelled', 'completed']);
  fam('status.app.', ['submitted', 'pending_guardian', 'under_review', 'accepted', 'rejected', 'withdrawn', 'cancelled', 'completed']);
  fam('status.consent.', ['pending', 'approved', 'rejected', 'withdrawn', 'expired']);
  fam('status.hours.', ['awaiting_confirmation', 'pending_verification', 'correction_requested', 'verified', 'rejected']);
  fam('status.report.', ['open', 'in_review', 'resolved', 'dismissed']);
  fam('status.user.', ['active', 'suspended']);
  fam('mod.confirm.', ['rejected', 'suspended', 'revoked', 'reinstated']);
  fam('mod.btn.', ['rejected', 'suspended', 'revoked', 'reinstated']);
  fam('mod.action.', ['approved', 'rejected', 'suspended', 'revoked', 'reinstated', 'approve', 'reject', 'suspend', 'hours_approve', 'hours_reject', 'hours_correction', 'report_in_review', 'report_resolved', 'report_dismissed']);
  fam('app.step.state.', ['done', 'current', 'todo', 'failed']);
  fam('activities.', ['upcoming', 'completed']);
  fam('requests.', ['live', 'past']);
  [1, 2, 3, 4, 5].forEach((n) => { keys.add(`welcome.step${n}`); keys.add(`welcome.step${n}b`); });
  [1, 2, 3, 4, 5, 6].forEach((n) => { keys.add(`help.q${n}`); keys.add(`help.a${n}`); });
  ['about', 'safety', 'privacy', 'terms'].forEach((p) => { keys.add(`page.${p}.title`); keys.add(`page.${p}.body`); });
  // every notification kind the server can emit
  for (const m of server.matchAll(/notify(?:Mods)?\([^,]+,\s*'([a-z_]+)'/g)) if (!m[1].endsWith('_')) keys.add('notif.' + m[1]);
  if (/'membership_' \+ final/.test(server)) fam('notif.membership_', ['approved', 'rejected', 'suspended', 'revoked']);
  for (const k of ['consent_approved', 'consent_rejected', 'consent_withdrawn']) { keys.add('notif.' + k); keys.add('notif.' + k + '_host'); }
  // every error code the server can return
  for (const m of server.matchAll(/(?:bad|forbidden|notFound|conflict)\('([a-z_]+)'/g)) keys.add('err.' + m[1]);
  for (const m of server.matchAll(/new HttpError\(\d+, '([a-z_]+)'/g)) keys.add('err.' + m[1]);
  for (const m of server.matchAll(/errs?\.[a-z_]+ = '([a-z_]+)'/g)) keys.add('fld.' + m[1]);
  for (const m of server.matchAll(/errors\[k\] = '([a-z_]+)'/g)) keys.add('fld.' + m[1]);
  for (const m of server.matchAll(/bad\('validation', \{ [a-z_]+: '([a-z_]+)' \}\)/g)) keys.add('fld.' + m[1]);
  for (const m of server.matchAll(/audit\([^,]+, '([a-z_]+\.[a-z_]+)'/g)) keys.add('audit.' + m[1]);
  fam('audit.mod.', ['approved', 'rejected', 'suspended', 'revoked', 'reinstated', 'approve', 'reject', 'suspend', 'hours_approve', 'hours_reject', 'hours_correction', 'report_in_review', 'report_resolved', 'report_dismissed']);
  fam('audit.consent.', ['approved', 'rejected', 'withdrawn']);
  fam('audit.report.', ['in_review', 'resolved', 'dismissed']);
  fam('audit.user.', ['suspended', 'active']);
  fam('audit.community.', ['activate', 'deactivate']);
  ['lime', 'green', 'teal', 'deep', 'sand'].forEach((k) => keys.add('settings.colour.' + k));
  fam('settings.roleNote.', ['student', 'resident', 'guardian', 'moderator', 'admin']);
  fam('settings.safetyNoticesHint.', ['student', 'resident', 'guardian', 'moderator', 'admin']);
  for (const k of ['applications', 'new_opportunities', 'reminders', 'announcements', 'hours']) { keys.add('settings.notify.' + k); keys.add('settings.notify.' + k + 'Hint'); }
  fam('settings.day.', ['weekdays', 'weekends']); fam('settings.time.', ['morning', 'afternoon', 'evening']);
  ['settings.noGuardians', 'settings.unlinkBodyStudent', 'settings.unlinkBodyGuardian', 'mod.action.announcement', 'audit.mod.announcement'].forEach((k) => keys.add(k));
  keys.add('err.forbidden'); keys.add('err.not_found'); keys.add('err.generic'); keys.add('err.network'); keys.add('err.unauthenticated');
  return keys;
}

test('every UI key exists in English and Arabic', () => {
  const keys = requiredKeys();
  const missingEn = [...keys].filter((k) => !(k in en)).sort();
  const missingAr = [...keys].filter((k) => !(k in ar)).sort();
  assert.deepEqual(missingEn, [], 'missing en: ' + missingEn.join(' '));
  assert.deepEqual(missingAr, [], 'missing ar: ' + missingAr.join(' '));
});

test('Arabic and English dictionaries have identical key sets and matching placeholders', () => {
  assert.deepEqual(Object.keys(en).filter((k) => !(k in ar)), []);
  assert.deepEqual(Object.keys(ar).filter((k) => !(k in en)), []);
  for (const k of Object.keys(en)) {
    const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    assert.equal(ph(ar[k]), ph(en[k]), `placeholder mismatch in ${k}`);
  }
});

test('Arabic strings are actually Arabic (no untranslated English left)', () => {
  const allowLatin = new Set(['lang.switch', 'common.listSep']);
  const bad = Object.entries(ar).filter(([k, v]) => !allowLatin.has(k) && !/[؀-ۿ]/.test(v.replace(/\{\w+\}/g, '')) && /[A-Za-z]{3,}/.test(v.replace(/\{\w+\}/g, '')));
  assert.deepEqual(bad.map(([k]) => k), []);
});
