import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { openDb, tx, id, now } from './db.js';
import {
  HttpError, bad, forbidden, notFound, conflict, validate, todayUAE, hashPassword, verifyPassword,
  sha256, newToken, newLinkCode, hoursBetween, csvCell, makeLimiter,
} from './lib.js';
import { safeguardCheck, MATERIAL_FIELDS } from './safeguard.js';

const CATEGORIES = ['cleanup', 'gardening', 'seniors', 'reading', 'pets', 'events', 'tutoring', 'other'];
const REPORT_CATS = ['unsafe', 'suspicious', 'misrepresentation', 'privacy', 'harassment', 'inappropriate', 'other'];
const SESSION_MS = 1000 * 60 * 60 * 24 * 7;
const ACTIVE_APP = ['submitted', 'pending_guardian', 'under_review', 'accepted'];
const PLATFORM = 'Jeran — Team 26 UAE Community Volunteering';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.png': 'image/png', '.ico': 'image/x-icon',
};

export function createApp({ dbPath = ':memory:', demo = false, secureCookies = false, staticDir = null, authLimit = 20, trustProxy = false } = {}) {
  const db = openDb(dbPath);
  const q = (sql, ...a) => db.prepare(sql).all(...a);
  const q1 = (sql, ...a) => db.prepare(sql).get(...a);
  const run = (sql, ...a) => db.prepare(sql).run(...a);
  const authLimiter = makeLimiter(authLimit, 60_000);
  const writeLimiter = makeLimiter(300, 60_000);

  // ---------- shared helpers ----------
  const audit = (actor, action, type, tid, meta = {}) =>
    run('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?)', id(), actor, action, type, tid, JSON.stringify(meta), now());
  const modAct = (actor, communityId, type, tid, action, reason) => {
    run('INSERT INTO moderation_actions VALUES (?,?,?,?,?,?,?,?)', id(), actor, communityId, type, tid, action, reason || null, now());
    audit(actor, `mod.${action}`, type, tid, { communityId, reason: reason || null });
  };
  // Notification categories a user may switch off. Safety-critical kinds (consent requests, cancellations,
  // moderation outcomes, guardian links) have no category and are always delivered.
  const NOTIFY_CATEGORY = {
    new_application: 'applications', application_accepted: 'applications', application_rejected: 'applications',
    application_withdrawn: 'applications', activity_updated: 'applications', activity_closed: 'applications',
    consent_approved: 'applications', consent_approved_host: 'applications', consent_rejected: 'applications',
    consent_rejected_host: 'applications', consent_withdrawn: 'applications', consent_withdrawn_host: 'applications',
    new_opportunity: 'new_opportunities', activity_reminder: 'reminders', community_announcement: 'announcements',
    activity_completed: 'hours', hours_confirmed_pending: 'hours', hours_verified: 'hours', hours_rejected: 'hours',
    hours_correction: 'hours', hours_correction_student: 'hours', hours_review: 'hours',
  };
  const prefsOf = (u) => { try { return JSON.parse(u?.prefs || '{}'); } catch { return {}; } };
  const notify = (userId, kind, params = {}, link = null) => {
    const cat = NOTIFY_CATEGORY[kind];
    if (cat) {
      const u = q1('SELECT prefs FROM users WHERE id=?', userId);
      if (prefsOf(u).notify?.[cat] === false) return;
    }
    run('INSERT INTO notifications VALUES (?,?,?,?,?,?,?)', id(), userId, kind, JSON.stringify(params), link, 0, now());
  };
  // What a host (resident) sees of a student: display name, or initials if the student chose that.
  const hostFacingName = (studentId) => {
    const u = q1('SELECT display_name, prefs FROM users WHERE id=?', studentId);
    if (!u) return '';
    if (prefsOf(u).visibility !== 'initials') return u.display_name;
    return [...u.display_name].filter((ch, i, arr) => i === 0 || /[\s_.-]/.test(arr[i - 1])).filter((ch) => /\p{L}|\p{N}/u.test(ch)).join('.').toUpperCase() + '.';
  };
  const isModOf = (userId, cid) => !!q1('SELECT 1 FROM moderators WHERE user_id=? AND community_id=?', userId, cid);
  const modCommunityIds = (userId) => q('SELECT community_id FROM moderators WHERE user_id=?', userId).map((r) => r.community_id);
  const notifyMods = (cid, kind, params, link) => {
    for (const m of q('SELECT user_id FROM moderators WHERE community_id=?', cid)) notify(m.user_id, kind, params, link);
  };
  const approvedMember = (userId, cid) =>
    !!q1("SELECT 1 FROM memberships WHERE user_id=? AND community_id=? AND status='approved'", userId, cid);
  const guardiansOf = (studentId) =>
    q("SELECT guardian_id FROM guardian_links WHERE student_id=? AND status='active'", studentId).map((r) => r.guardian_id);
  const isGuardianOf = (guardianId, studentId) =>
    !!q1("SELECT 1 FROM guardian_links WHERE guardian_id=? AND student_id=? AND status='active'", guardianId, studentId);
  const acceptedCount = (oppId) =>
    q1("SELECT COUNT(*) c FROM applications WHERE opportunity_id=? AND status IN ('accepted','completed')", oppId).c;
  const communityOf = (cid) => q1('SELECT * FROM communities WHERE id=?', cid);
  const getOpp = (oid) => {
    const o = q1('SELECT * FROM opportunities WHERE id=?', oid);
    if (!o) throw notFound();
    return o;
  };
  const refreshFull = (opp) => {
    const o = q1('SELECT * FROM opportunities WHERE id=?', opp.id);
    const n = acceptedCount(o.id);
    if (o.status === 'published' && n >= o.capacity) run("UPDATE opportunities SET status='full', updated_at=? WHERE id=?", now(), o.id);
    else if (o.status === 'full' && n < o.capacity) run("UPDATE opportunities SET status='published', updated_at=? WHERE id=?", now(), o.id);
  };
  const requireOwner = (user, opp) => {
    if (opp.resident_id !== user.id) throw forbidden();
  };
  const requireReason = (body) => {
    const { reason } = validate(body, { reason: { t: 'str', min: 5, max: 500 } });
    return reason;
  };

  const sanitizeUser = (u) => ({
    id: u.id, email: u.email, role: u.role, display_name: u.display_name, lang: u.lang, status: u.status,
    age: u.role === 'student' ? u.age : undefined,
    interests: JSON.parse(u.interests || '[]'),
    link_code: u.role === 'student' ? u.link_code : undefined,
    moderator_of: u.role === 'moderator' ? modCommunityIds(u.id) : undefined,
    prefs: prefsOf(u),
  });

  function oppView(o, viewer, extra = {}) {
    const c = communityOf(o.community_id);
    const accepted = acceptedCount(o.id);
    const res = q1('SELECT display_name FROM users WHERE id=?', o.resident_id);
    let showAddress = false;
    if (viewer) {
      if (viewer.id === o.resident_id || viewer.role === 'admin' || isModOf(viewer.id, o.community_id)) showAddress = true;
      else if (viewer.role === 'student' && q1("SELECT 1 FROM applications WHERE opportunity_id=? AND student_id=? AND status IN ('accepted','completed')", o.id, viewer.id)) showAddress = true;
    }
    const { exact_address, ...rest } = o;
    return {
      ...rest,
      ...(showAddress ? { exact_address } : {}),
      community: c ? { id: c.id, name: c.name, name_ar: c.name_ar, type: c.type, emirate: c.emirate } : null,
      host_name: res?.display_name,
      spots_left: Math.max(0, o.capacity - accepted),
      accepted_count: accepted,
      requires_consent: true,
      ...extra,
    };
  }

  // ---------- route table ----------
  const routes = [];
  const route = (method, pattern, roles, handler) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
    routes.push({ method, re, keys, roles, handler });
  };
  const ANY = 'any';

  // ================= AUTH =================
  route('POST', '/api/auth/signup', null, ({ body, ip, setSession }) => {
    if (!authLimiter('signup:' + ip)) throw new HttpError(429, 'rate_limited');
    const base = validate(body, {
      email: { t: 'str', min: 5, max: 120 },
      password: { t: 'str', min: 8, max: 100 },
      display_name: { t: 'str', min: 2, max: 40 },
      role: { t: 'enum', values: ['student', 'resident', 'guardian'] }, // privileged roles can never be self-assigned
      lang: { t: 'enum', values: ['en', 'ar'], opt: true },
    });
    base.email = base.email.toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(base.email)) throw bad('validation', { email: 'invalid' });
    if (!/[A-Za-z؀-ۿ]/.test(base.password) || !/\d/.test(base.password)) throw bad('validation', { password: 'weak' });
    let age = null;
    if (base.role === 'student') age = validate(body, { age: { t: 'int', min: 12, max: 17 } }).age;
    if (q1('SELECT 1 FROM users WHERE email=?', base.email)) throw conflict('email_taken');
    const uid = id();
    run('INSERT INTO users (id, email, pass_hash, role, display_name, status, lang, age, interests, link_code, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', uid, base.email, hashPassword(base.password), base.role,
      base.display_name, 'active', base.lang || 'en', age, '[]', base.role === 'student' ? newLinkCode() : null, now(), now());
    audit(uid, 'user.signup', 'user', uid, { role: base.role });
    setSession(uid);
    return { user: sanitizeUser(q1('SELECT * FROM users WHERE id=?', uid)) };
  });

  route('POST', '/api/auth/login', null, ({ body, ip, setSession }) => {
    if (!authLimiter('login:' + ip)) throw new HttpError(429, 'rate_limited');
    const { email, password } = validate(body, { email: { t: 'str', max: 120 }, password: { t: 'str', max: 100 } });
    const u = q1('SELECT * FROM users WHERE email=?', email.toLowerCase());
    // same error for unknown user / wrong password
    if (!u || !verifyPassword(password, u.pass_hash)) throw new HttpError(401, 'bad_credentials');
    if (u.status !== 'active') throw forbidden('account_suspended');
    setSession(u.id);
    return { user: sanitizeUser(u) };
  });

  route('POST', '/api/auth/logout', null, ({ clearSession }) => {
    clearSession();
    return { ok: true };
  });

  route('GET', '/api/auth/me', null, ({ user }) => ({ user: user ? sanitizeUser(user) : null }));

  route('GET', '/api/demo-accounts', null, () => {
    if (!demo) throw notFound();
    return {
      password: 'Demo#2026',
      accounts: q("SELECT email, role, display_name FROM users WHERE email LIKE '%@team26.demo' ORDER BY role, email"),
    };
  });

  // ================= PROFILE / NOTIFICATIONS =================
  route('PATCH', '/api/me', [ANY], ({ user, body }) => {
    const v = validate(body, {
      lang: { t: 'enum', values: ['en', 'ar'], opt: true },
      display_name: { t: 'str', min: 2, max: 40, opt: true },
    });
    if (body.interests !== undefined) {
      if (!Array.isArray(body.interests) || body.interests.some((i) => !CATEGORIES.includes(i))) throw bad('validation', { interests: 'invalid' });
      run('UPDATE users SET interests=?, updated_at=? WHERE id=?', JSON.stringify(body.interests), now(), user.id);
    }
    if (v.lang) run('UPDATE users SET lang=?, updated_at=? WHERE id=?', v.lang, now(), user.id);
    if (v.display_name) run('UPDATE users SET display_name=?, updated_at=? WHERE id=?', v.display_name, now(), user.id);
    return { user: sanitizeUser(q1('SELECT * FROM users WHERE id=?', user.id)) };
  });

  // ================= SETTINGS =================
  const EMIRATES = ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'];
  const NOTIFY_KEYS = ['applications', 'new_opportunities', 'reminders', 'announcements', 'hours'];
  route('PATCH', '/api/me/prefs', [ANY], ({ user, body }) => {
    const p = prefsOf(user);
    const b = body && typeof body === 'object' ? body : {};
    if (b.notify !== undefined) {
      if (typeof b.notify !== 'object' || Object.entries(b.notify).some(([k, v]) => !NOTIFY_KEYS.includes(k) || typeof v !== 'boolean')) throw bad('validation', { notify: 'invalid' });
      p.notify = { ...(p.notify || {}), ...b.notify };
    }
    if (b.emirate !== undefined) {
      if (b.emirate !== null && !EMIRATES.includes(b.emirate)) throw bad('validation', { emirate: 'invalid' });
      p.emirate = b.emirate;
    }
    if (b.availability !== undefined) {
      const a = b.availability || {};
      const days = Array.isArray(a.days) ? a.days : [];
      const times = Array.isArray(a.times) ? a.times : [];
      if (days.some((d) => !['weekdays', 'weekends'].includes(d)) || times.some((x) => !['morning', 'afternoon', 'evening'].includes(x))) throw bad('validation', { availability: 'invalid' });
      p.availability = { days, times };
    }
    if (b.distance !== undefined) {
      if (!['walking', 'community', 'emirate'].includes(b.distance)) throw bad('validation', { distance: 'invalid' });
      p.distance = b.distance;
    }
    if (b.visibility !== undefined) {
      if (!['name', 'initials'].includes(b.visibility)) throw bad('validation', { visibility: 'invalid' });
      p.visibility = b.visibility;
    }
    if (b.avatar !== undefined) {
      if (!['lime', 'green', 'teal', 'deep', 'sand'].includes(b.avatar)) throw bad('validation', { avatar: 'invalid' });
      p.avatar = b.avatar;
    }
    run('UPDATE users SET prefs=?, updated_at=? WHERE id=?', JSON.stringify(p), now(), user.id);
    return { user: sanitizeUser(q1('SELECT * FROM users WHERE id=?', user.id)) };
  });

  route('POST', '/api/me/password', [ANY], ({ user, body, req }) => {
    const { current, next } = validate(body, { current: { t: 'str', max: 100 }, next: { t: 'str', min: 8, max: 100 } });
    if (!/[A-Za-z؀-ۿ]/.test(next) || !/\d/.test(next)) throw bad('validation', { next: 'weak' });
    if (!verifyPassword(current, user.pass_hash)) throw bad('validation', { current: 'wrong_password' });
    tx(db, () => {
      run('UPDATE users SET pass_hash=?, updated_at=? WHERE id=?', hashPassword(next), now(), user.id);
      run('DELETE FROM sessions WHERE user_id=? AND token_hash!=?', user.id, currentTokenHash(req)); // sign out other devices
      audit(user.id, 'user.password_change', 'user', user.id, {});
    });
    return { ok: true };
  });

  const sessionView = (row, req) => ({
    id: row.token_hash.slice(0, 16), created_at: row.created_at, expires_at: row.expires_at,
    device: row.user_agent || '', current: row.token_hash === currentTokenHash(req),
  });
  route('GET', '/api/me/sessions', [ANY], ({ user, req }) => ({
    sessions: q('SELECT * FROM sessions WHERE user_id=? AND expires_at>? ORDER BY created_at DESC', user.id, now()).map((r) => sessionView(r, req)),
  }));
  route('POST', '/api/me/sessions/:id/revoke', [ANY], ({ user, params, req }) => {
    const row = q('SELECT * FROM sessions WHERE user_id=?', user.id).find((r) => r.token_hash.slice(0, 16) === params.id);
    if (!row) throw notFound();
    if (row.token_hash === currentTokenHash(req)) throw conflict('invalid_state');
    run('DELETE FROM sessions WHERE token_hash=?', row.token_hash);
    return { ok: true };
  });
  route('POST', '/api/me/sessions/revoke-others', [ANY], ({ user, req }) => {
    run('DELETE FROM sessions WHERE user_id=? AND token_hash!=?', user.id, currentTokenHash(req));
    return { ok: true };
  });

  // Everything Jeran holds about the signed-in person, as a downloadable JSON file.
  route('GET', '/api/me/export', [ANY], ({ user }) => {
    const pick = (rows) => rows.map((r) => ({ ...r }));
    const data = {
      exported_at: now(), platform: PLATFORM,
      account: (({ pass_hash, link_code, ...rest }) => ({ ...rest, prefs: prefsOf(user), interests: JSON.parse(user.interests || '[]') }))(user),
      memberships: pick(q('SELECT community_id, status, decision_reason, created_at, updated_at FROM memberships WHERE user_id=?', user.id)),
      guardian_links: pick(q("SELECT g.status, g.created_at, CASE WHEN g.guardian_id=? THEN s.display_name ELSE gu.display_name END other_party FROM guardian_links g JOIN users s ON s.id=g.student_id JOIN users gu ON gu.id=g.guardian_id WHERE g.guardian_id=? OR g.student_id=?", user.id, user.id, user.id)),
      applications: pick(q('SELECT a.id, o.title, o.date, a.status, a.message, a.created_at FROM applications a JOIN opportunities o ON o.id=a.opportunity_id WHERE a.student_id=?', user.id)),
      consent_decisions: pick(q('SELECT id, application_id, status, reason, decided_at FROM consents WHERE guardian_id=?', user.id)),
      participation: pick(q('SELECT p.id, o.title, o.date, p.claimed_hours, p.confirmed_hours, p.verified_hours, p.status, p.verified_at FROM participation p JOIN opportunities o ON o.id=p.opportunity_id WHERE p.student_id=?', user.id)),
      requests_posted: pick(q('SELECT id, title, date, status, created_at FROM opportunities WHERE resident_id=?', user.id)),
      reports_filed: pick(q('SELECT id, category, details, status, created_at FROM reports WHERE reporter_id=?', user.id)),
      notifications: pick(q('SELECT kind, params, created_at, read FROM notifications WHERE user_id=?', user.id)),
    };
    return { __raw: JSON.stringify(data, null, 2), contentType: 'application/json; charset=utf-8', filename: 'jeran-my-data.json' };
  });

  // Deletion removes personal details and access. Verified records stay, de-identified, so other
  // people's hours and the audit trail remain consistent.
  route('POST', '/api/me/delete', [ANY], ({ user, body, clearSession }) => {
    const { password, confirm } = validate(body, { password: { t: 'str', max: 100 }, confirm: { t: 'str', max: 20 } });
    if (user.role === 'admin') throw forbidden('admin_cannot_delete');
    if (confirm !== 'DELETE' && confirm !== 'حذف') throw bad('validation', { confirm: 'invalid' });
    if (!verifyPassword(password, user.pass_hash)) throw bad('validation', { password: 'wrong_password' });
    tx(db, () => {
      for (const a of q("SELECT * FROM applications WHERE student_id=? AND status IN ('submitted','pending_guardian','under_review','accepted')", user.id)) {
        run("UPDATE applications SET status='withdrawn', updated_at=? WHERE id=?", now(), a.id);
        run("UPDATE consents SET status='expired', updated_at=? WHERE application_id=? AND status IN ('pending','approved')", now(), a.id);
        refreshFull(getOpp(a.opportunity_id));
      }
      for (const o of q("SELECT * FROM opportunities WHERE resident_id=? AND status IN ('draft','pending_review','published','full','closed')", user.id)) cancelOpportunity(o, user.id, 'activity_cancelled');
      run("UPDATE guardian_links SET status='revoked', updated_at=? WHERE guardian_id=? OR student_id=?", now(), user.id, user.id);
      run("UPDATE memberships SET status='revoked', decision_reason='account deleted', updated_at=? WHERE user_id=?", now(), user.id);
      run('DELETE FROM moderators WHERE user_id=?', user.id);
      run('DELETE FROM notifications WHERE user_id=?', user.id);
      run('DELETE FROM sessions WHERE user_id=?', user.id);
      run(`UPDATE users SET email=?, display_name=?, pass_hash=?, status='suspended', interests='[]', prefs='{}', link_code=NULL, age=NULL, updated_at=? WHERE id=?`,
        `deleted-${user.id}@deleted.invalid`, 'Deleted account', hashPassword(newToken()), now(), user.id);
      audit(user.id, 'user.delete', 'user', user.id, {});
    });
    clearSession();
    return { ok: true };
  });

  // Guardian connections can be ended from either side.
  route('GET', '/api/me/connections', ['student', 'guardian'], ({ user }) => ({
    connections: q(`SELECT g.id, g.created_at, u.display_name FROM guardian_links g JOIN users u ON u.id = CASE WHEN g.student_id=? THEN g.guardian_id ELSE g.student_id END
      WHERE (g.student_id=? OR g.guardian_id=?) AND g.status='active' ORDER BY g.created_at`, user.id, user.id, user.id),
  }));
  route('POST', '/api/me/connections/:id/remove', ['student', 'guardian'], ({ user, params }) => {
    const g = q1("SELECT * FROM guardian_links WHERE id=? AND status='active'", params.id);
    if (!g || (g.student_id !== user.id && g.guardian_id !== user.id)) throw notFound();
    tx(db, () => {
      run("UPDATE guardian_links SET status='revoked', updated_at=? WHERE id=?", now(), g.id);
      notify(g.student_id === user.id ? g.guardian_id : g.student_id, 'guardian_unlinked', { name: user.display_name }, '/settings/privacy');
      audit(user.id, 'guardian.unlink', 'user', g.student_id === user.id ? g.guardian_id : g.student_id, {});
    });
    return { ok: true };
  });

  function ensureReminders(user) {
    if (user.role !== 'student') return;
    const today = todayUAE();
    const tomorrow = new Date(Date.parse(today + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
    const due = q(`SELECT o.id, o.title, o.date, o.start_time FROM applications a JOIN opportunities o ON o.id=a.opportunity_id
      WHERE a.student_id=? AND a.status='accepted' AND o.date IN (?, ?)`, user.id, today, tomorrow);
    for (const o of due) {
      const sent = q1("SELECT 1 FROM notifications WHERE user_id=? AND kind='activity_reminder' AND link=?", user.id, `/opportunities/${o.id}`);
      if (!sent) notify(user.id, 'activity_reminder', { title: o.title, time: o.start_time, when: o.date === today ? 'today' : 'tomorrow' }, `/opportunities/${o.id}`);
    }
  }
  route('GET', '/api/notifications', [ANY], ({ user }) => (ensureReminders(user), {
    notifications: q('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 60', user.id)
      .map((n) => ({ ...n, params: JSON.parse(n.params), read: !!n.read })),
    unread: q1('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read=0', user.id).c,
  }));
  route('POST', '/api/notifications/read', [ANY], ({ user }) => {
    run('UPDATE notifications SET read=1 WHERE user_id=?', user.id);
    return { ok: true };
  });

  // ================= COMMUNITIES & MEMBERSHIP =================
  const communityPublic = (c) => ({
    id: c.id, name: c.name, name_ar: c.name_ar, emirate: c.emirate, general_location: c.general_location,
    general_location_ar: c.general_location_ar, type: c.type, description: c.description,
    description_ar: c.description_ar, membership_policy: c.membership_policy,
  });
  // Public discovery shows general info only, never members or private listings.
  route('GET', '/api/communities', null, () => ({
    communities: q('SELECT * FROM communities WHERE active=1 ORDER BY name').map(communityPublic),
  }));

  route('GET', '/api/communities/:id', null, ({ params }) => {
    const c = communityOf(params.id);
    if (!c || !c.active) throw notFound();
    const live = c.type === 'open'
      ? q1("SELECT COUNT(*) n FROM opportunities WHERE community_id=? AND status IN ('published','full') AND date>=?", c.id, todayUAE()).n
      : null; // gated communities never disclose activity
    return { community: { ...communityPublic(c), live_opportunities: live } };
  });

  // Public browsing: only open-neighbourhood listings, general location only, no applicant data.
  const publicOpp = (o) => {
    const v = oppView(o, null);
    return { ...v, accepted_count: undefined, review_note: undefined, resident_id: undefined };
  };
  route('GET', '/api/public/opportunities', null, ({ query }) => {
    let list = q(`SELECT o.* FROM opportunities o JOIN communities c ON c.id=o.community_id
      WHERE c.type='open' AND c.active=1 AND o.status IN ('published','full') AND o.date>=? ORDER BY o.date, o.start_time`, todayUAE());
    if (query.category && CATEGORIES.includes(query.category)) list = list.filter((o) => o.category === query.category);
    const needle = (query.q || '').trim().toLowerCase();
    if (needle) list = list.filter((o) => `${o.title} ${o.description} ${o.general_location}`.toLowerCase().includes(needle));
    return { opportunities: list.map(publicOpp) };
  });
  route('GET', '/api/public/opportunities/:id', null, ({ params }) => {
    const o = q1(`SELECT o.* FROM opportunities o JOIN communities c ON c.id=o.community_id
      WHERE o.id=? AND c.type='open' AND c.active=1 AND o.status IN ('published','full')`, params.id);
    if (!o) throw notFound();
    return { opportunity: publicOpp(o) };
  });

  route('GET', '/api/memberships/mine', [ANY], ({ user }) => ({
    memberships: q('SELECT * FROM memberships WHERE user_id=?', user.id).map((m) => ({
      id: m.id, community_id: m.community_id, status: m.status, decision_reason: m.decision_reason, updated_at: m.updated_at,
    })),
  }));

  route('POST', '/api/communities/:id/join', ['student', 'resident'], ({ user, params }) => {
    const c = communityOf(params.id);
    if (!c || !c.active) throw notFound();
    const existing = q1('SELECT * FROM memberships WHERE user_id=? AND community_id=?', user.id, c.id);
    if (existing && existing.status !== 'rejected') throw conflict('membership_exists');
    const auto = user.role === 'student' && c.membership_policy === 'auto_approve_students';
    const status = auto ? 'approved' : 'pending';
    if (existing) run('UPDATE memberships SET status=?, decided_by=NULL, decision_reason=NULL, updated_at=? WHERE id=?', status, now(), existing.id);
    else run('INSERT INTO memberships VALUES (?,?,?,?,?,?,?,?)', id(), user.id, c.id, status, null, null, now(), now());
    if (!auto) notifyMods(c.id, 'membership_requested', { name: user.display_name, community: c.name, community_ar: c.name_ar }, '/moderator/memberships');
    return { status };
  });

  // ================= OPPORTUNITIES =================
  const OPP_SPEC = {
    title: { t: 'str', min: 5, max: 100 },
    description: { t: 'str', min: 20, max: 1200 },
    category: { t: 'enum', values: CATEGORIES },
    community_id: { t: 'str', min: 1, max: 60 },
    general_location: { t: 'str', min: 3, max: 100 },
    exact_address: { t: 'str', max: 160, opt: true },
    date: { t: 'date' },
    start_time: { t: 'time' },
    end_time: { t: 'time' },
    capacity: { t: 'int', min: 1, max: 50 },
    min_age: { t: 'int', min: 10, max: 18 },
    requirements: { t: 'str', max: 400, opt: true },
    supervision: { t: 'str', min: 10, max: 400 },
    accessibility: { t: 'str', max: 300, opt: true },
    deadline: { t: 'date' },
  };

  function validateOpp(body, partial = false) {
    const spec = { ...OPP_SPEC };
    if (partial) delete spec.community_id;
    const v = validate(body, spec);
    const errs = {};
    const today = todayUAE();
    if (v.date < today) errs.date = 'past_date';
    if (v.deadline > v.date) errs.deadline = 'after_date';
    if (v.deadline < today) errs.deadline = 'past_date';
    const dur = hoursBetween(v.start_time, v.end_time);
    if (dur <= 0) errs.end_time = 'before_start';
    else if (dur > 6) errs.end_time = 'too_long_duration';
    if (Object.keys(errs).length) throw bad('validation', errs);
    const hits = safeguardCheck(v.title, v.description, v.requirements);
    if (hits.length) throw new HttpError(422, 'safeguarding_blocked', { reasons: hits });
    v.duration_hours = Math.round(dur * 4) / 4;
    return v;
  }

  route('POST', '/api/opportunities', ['resident'], ({ user, body }) => {
    const v = validateOpp(body);
    const c = communityOf(v.community_id);
    if (!c || !c.active) throw notFound('community_not_found');
    if (!approvedMember(user.id, c.id)) throw forbidden('not_verified_resident');
    const draft = body.draft === true;
    const oid = id();
    run('INSERT INTO opportunities VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      oid, user.id, c.id, v.title, v.description, v.category, v.general_location, v.exact_address || null,
      v.date, v.start_time, v.end_time, v.duration_hours, v.capacity, v.min_age, v.requirements, v.supervision,
      v.accessibility, v.deadline, draft ? 'draft' : 'pending_review', null, now(), now());
    if (!draft) notifyMods(c.id, 'opportunity_review', { title: v.title }, '/moderator/opportunities');
    return { opportunity: oppView(getOpp(oid), user) };
  });

  route('PATCH', '/api/opportunities/:id', ['resident'], ({ user, params, body }) => {
    const opp = getOpp(params.id);
    requireOwner(user, opp);
    if (!['draft', 'pending_review', 'published', 'full'].includes(opp.status)) throw conflict('opportunity_not_editable');
    const v = validateOpp({ ...opp, ...body, community_id: opp.community_id }, true);
    const acc = acceptedCount(opp.id);
    if (v.capacity < acc) throw bad('validation', { capacity: 'below_accepted' });
    return tx(db, () => {
      const changedMaterial = MATERIAL_FIELDS.some((f) => v[f] !== opp[f]);
      run(`UPDATE opportunities SET title=?, description=?, category=?, general_location=?, exact_address=?, date=?, start_time=?,
        end_time=?, duration_hours=?, capacity=?, min_age=?, requirements=?, supervision=?, accessibility=?, deadline=?, updated_at=? WHERE id=?`,
      v.title, v.description, v.category, v.general_location, v.exact_address || null, v.date, v.start_time, v.end_time,
      v.duration_hours, v.capacity, v.min_age, v.requirements, v.supervision, v.accessibility, v.deadline, now(), opp.id);
      const live = q(`SELECT * FROM applications WHERE opportunity_id=? AND status IN ('pending_guardian','under_review','accepted')`, opp.id);
      for (const a of live) {
        if (changedMaterial) {
          // Important change: prior guardian approval no longer covers the activity -> renewed consent required.
          run("UPDATE consents SET status='expired', updated_at=? WHERE application_id=? AND status IN ('approved','pending')", now(), a.id);
          run("UPDATE consents SET status='pending', guardian_id=NULL, decided_at=NULL, reason=NULL WHERE application_id=?", a.id);
          run("UPDATE applications SET status='pending_guardian', updated_at=? WHERE id=?", now(), a.id);
          notify(a.student_id, 'activity_changed_reconsent', { title: v.title }, '/student/applications');
          for (const g of guardiansOf(a.student_id)) notify(g, 'consent_requested', { title: v.title }, '/guardian/consents');
        } else {
          notify(a.student_id, 'activity_updated', { title: v.title }, `/opportunities/${opp.id}`);
        }
      }
      refreshFull(opp);
      audit(user.id, 'opportunity.edit', 'opportunity', opp.id, { materialChange: changedMaterial });
      return { opportunity: oppView(getOpp(opp.id), user) };
    });
  });

  route('POST', '/api/opportunities/:id/submit', ['resident'], ({ user, params }) => {
    const opp = getOpp(params.id);
    requireOwner(user, opp);
    if (opp.status !== 'draft') throw conflict('invalid_state');
    if (!approvedMember(user.id, opp.community_id)) throw forbidden('not_verified_resident');
    run("UPDATE opportunities SET status='pending_review', updated_at=? WHERE id=?", now(), opp.id);
    notifyMods(opp.community_id, 'opportunity_review', { title: opp.title }, '/moderator/opportunities');
    return { opportunity: oppView(getOpp(opp.id), user) };
  });

  route('POST', '/api/opportunities/:id/cancel', ['resident'], ({ user, params }) => {
    const opp = getOpp(params.id);
    requireOwner(user, opp);
    if (['cancelled', 'completed'].includes(opp.status)) throw conflict('invalid_state');
    return tx(db, () => {
      cancelOpportunity(opp, user.id, 'activity_cancelled');
      return { opportunity: oppView(getOpp(opp.id), user) };
    });
  });

  route('POST', '/api/opportunities/:id/close', ['resident'], ({ user, params }) => {
    const opp = getOpp(params.id);
    requireOwner(user, opp);
    if (!['published', 'full'].includes(opp.status)) throw conflict('invalid_state');
    tx(db, () => {
      run("UPDATE opportunities SET status='closed', updated_at=? WHERE id=?", now(), opp.id);
      // applicants not yet accepted can no longer be offered a place
      for (const a of q("SELECT * FROM applications WHERE opportunity_id=? AND status IN ('submitted','pending_guardian','under_review')", opp.id)) {
        run("UPDATE applications SET status='cancelled', updated_at=? WHERE id=?", now(), a.id);
        run("UPDATE consents SET status='expired', updated_at=? WHERE application_id=? AND status IN ('pending','approved')", now(), a.id);
        notify(a.student_id, 'activity_closed', { title: opp.title }, `/student/applications/${a.id}`);
      }
      audit(user.id, 'opportunity.close', 'opportunity', opp.id, {});
    });
    return { opportunity: oppView(getOpp(opp.id), user) };
  });

  function cancelOpportunity(opp, actorId, kind) {
    run("UPDATE opportunities SET status='cancelled', updated_at=? WHERE id=?", now(), opp.id);
    for (const a of q('SELECT * FROM applications WHERE opportunity_id=? AND status IN (\'submitted\',\'pending_guardian\',\'under_review\',\'accepted\')', opp.id)) {
      run("UPDATE applications SET status='cancelled', updated_at=? WHERE id=?", now(), a.id);
      run("UPDATE consents SET status='expired', updated_at=? WHERE application_id=? AND status IN ('pending','approved')", now(), a.id);
      notify(a.student_id, kind, { title: opp.title }, '/student/applications');
      for (const g of guardiansOf(a.student_id)) notify(g, kind, { title: opp.title }, '/guardian/consents');
    }
    audit(actorId, 'opportunity.cancel', 'opportunity', opp.id, {});
  }

  route('POST', '/api/opportunities/:id/complete', ['resident'], ({ user, params }) => {
    const opp = getOpp(params.id);
    requireOwner(user, opp);
    if (!['published', 'full', 'closed'].includes(opp.status)) throw conflict('invalid_state');
    if (opp.date > todayUAE()) throw conflict('activity_not_started');
    return tx(db, () => {
      run("UPDATE opportunities SET status='completed', updated_at=? WHERE id=?", now(), opp.id);
      for (const a of q("SELECT * FROM applications WHERE opportunity_id=? AND status='accepted'", opp.id)) {
        run("UPDATE applications SET status='completed', updated_at=? WHERE id=?", now(), a.id);
        run('INSERT INTO participation VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', id(), a.id, opp.id, a.student_id, null, null, null,
          'awaiting_confirmation', null, null, null, now(), now());
        notify(a.student_id, 'activity_completed', { title: opp.title }, '/student/hours');
      }
      run("UPDATE applications SET status='cancelled', updated_at=? WHERE opportunity_id=? AND status IN ('submitted','pending_guardian','under_review')", now(), opp.id);
      audit(user.id, 'opportunity.complete', 'opportunity', opp.id, {});
      return { opportunity: oppView(getOpp(opp.id), user) };
    });
  });

  route('GET', '/api/opportunities/mine', ['resident'], ({ user }) => ({
    opportunities: q('SELECT * FROM opportunities WHERE resident_id=? ORDER BY date DESC, created_at DESC', user.id).map((o) => {
      const pending = q1("SELECT COUNT(*) c FROM applications WHERE opportunity_id=? AND status IN ('pending_guardian','under_review')", o.id).c;
      const toConfirm = q1("SELECT COUNT(*) c FROM participation WHERE opportunity_id=? AND status IN ('awaiting_confirmation','correction_requested')", o.id).c;
      return oppView(o, user, { pending_applications: pending, awaiting_confirmation: toConfirm });
    }),
  }));

  // Student discovery: only listings from communities the student is an approved member of.
  route('GET', '/api/opportunities', ['student'], ({ user, query }) => {
    const mine = q("SELECT community_id FROM memberships WHERE user_id=? AND status='approved'", user.id).map((m) => m.community_id);
    if (!mine.length) return { opportunities: [], member_communities: 0 };
    const marks = mine.map(() => '?').join(',');
    let sql = `SELECT * FROM opportunities WHERE community_id IN (${marks}) AND status IN ('published','full') AND date >= ?`;
    const args = [...mine, todayUAE()];
    if (query.category && CATEGORIES.includes(query.category)) { sql += ' AND category=?'; args.push(query.category); }
    if (query.community_id && mine.includes(query.community_id)) { sql += ' AND community_id=?'; args.push(query.community_id); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(query.date || '')) { sql += ' AND date=?'; args.push(query.date); }
    sql += ' ORDER BY date, start_time';
    let list = q(sql, ...args);
    const needle = (query.q || '').trim().toLowerCase();
    if (needle) list = list.filter((o) => `${o.title} ${o.description} ${o.general_location}`.toLowerCase().includes(needle));
    const loc = (query.location || '').trim().toLowerCase();
    if (loc) list = list.filter((o) => o.general_location.toLowerCase().includes(loc));
    const views = list.map((o) => {
      const app = q1('SELECT status FROM applications WHERE opportunity_id=? AND student_id=?', o.id, user.id);
      return oppView(o, user, { eligible: user.age >= o.min_age, my_application: app?.status || null });
    });
    // Preferences only change the order. Eligibility and visibility stay deterministic above.
    const pr = prefsOf(user);
    const interests = JSON.parse(user.interests || '[]');
    const score = (o) => {
      let n = 0;
      if (interests.includes(o.category)) n += 2;
      if (pr.emirate && o.community?.emirate === pr.emirate) n += 1;
      const day = new Date(o.date + 'T12:00:00Z').getUTCDay(); // UAE weekend: Saturday, Sunday
      const part = (pr.availability?.days || []);
      if (part.includes(day === 0 || day === 6 ? 'weekends' : 'weekdays')) n += 1;
      const h = Number(o.start_time.slice(0, 2));
      if ((pr.availability?.times || []).includes(h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening')) n += 1;
      return n;
    };
    views.forEach((o) => { o.match = score(o); });
    views.sort((a, b) => b.match - a.match || a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));
    let out = views;
    if (query.eligible === '1') out = out.filter((o) => o.eligible);
    if (query.available === '1') out = out.filter((o) => o.spots_left > 0 && o.deadline >= todayUAE());
    return { opportunities: out, member_communities: mine.length };
  });

  route('GET', '/api/opportunities/:id', [ANY], ({ user, params }) => {
    const opp = getOpp(params.id);
    let allowed = false;
    let extra = {};
    // Listings in open neighbourhoods are public information for any signed-in user.
    const openListing = ['published', 'full'].includes(opp.status) && communityOf(opp.community_id)?.type === 'open';
    if (openListing) allowed = true;
    if (user.role === 'admin' || opp.resident_id === user.id || isModOf(user.id, opp.community_id)) allowed = true;
    else if (user.role === 'student') {
      const app = q1('SELECT * FROM applications WHERE opportunity_id=? AND student_id=?', opp.id, user.id);
      const visible = ['published', 'full'].includes(opp.status) && approvedMember(user.id, opp.community_id);
      allowed = allowed || visible || !!app;
      extra = { eligible: user.age >= opp.min_age, my_application: app?.status || null, my_application_id: app?.id || null, is_member: approvedMember(user.id, opp.community_id) };
    } else if (user.role === 'guardian') {
      allowed = allowed || !!q1(`SELECT 1 FROM applications a JOIN guardian_links g ON g.student_id=a.student_id
        WHERE a.opportunity_id=? AND g.guardian_id=? AND g.status='active'`, opp.id, user.id);
    }
    if (!allowed) throw notFound(); // do not reveal that a private listing exists
    return { opportunity: oppView(opp, user, extra) };
  });

  // ================= APPLICATIONS =================
  route('POST', '/api/opportunities/:id/apply', ['student'], ({ user, params, body }) => {
    const opp = getOpp(params.id);
    if (!approvedMember(user.id, opp.community_id)) throw notFound();
    if (opp.status === 'full') throw conflict('opportunity_full');
    if (opp.status !== 'published') throw conflict('opportunity_unavailable');
    if (opp.date < todayUAE() || opp.deadline < todayUAE()) throw conflict('deadline_passed');
    if (user.age < opp.min_age) throw forbidden('too_young');
    if (!guardiansOf(user.id).length) throw conflict('no_guardian');
    const { message } = validate(body, { message: { t: 'str', max: 300, opt: true } });
    return tx(db, () => {
      const dup = q1('SELECT * FROM applications WHERE opportunity_id=? AND student_id=?', opp.id, user.id);
      if (dup && dup.status !== 'withdrawn') throw conflict('already_applied');
      let aid;
      if (dup) {
        aid = dup.id;
        run("UPDATE applications SET status='pending_guardian', message=?, decision_reason=NULL, updated_at=? WHERE id=?", message, now(), aid);
        run("UPDATE consents SET status='pending', guardian_id=NULL, decided_at=NULL, reason=NULL, updated_at=? WHERE application_id=?", now(), aid);
      } else {
        aid = id();
        run('INSERT INTO applications VALUES (?,?,?,?,?,?,?,?)', aid, opp.id, user.id, 'pending_guardian', message, null, now(), now());
        run('INSERT INTO consents VALUES (?,?,?,?,?,?,?,?,?)', id(), aid, user.id, null, 'pending', null, null, now(), now());
      }
      for (const g of guardiansOf(user.id)) notify(g, 'consent_requested', { title: opp.title, student: user.display_name }, '/guardian/consents');
      notify(opp.resident_id, 'new_application', { title: opp.title, student: hostFacingName(user.id) }, `/resident/opportunities/${opp.id}/applicants`);
      return { application_id: aid, status: 'pending_guardian' };
    });
  });

  const appView = (a) => {
    const o = getOpp(a.opportunity_id);
    const c = q1('SELECT status, reason FROM consents WHERE application_id=?', a.id);
    return { ...a, consent_status: c?.status, consent_reason: c?.reason, opportunity: oppView(o, { id: a.student_id, role: 'student' }) };
  };
  // literal path before the :id route, or 'mine' is read as an id and the student's Applied tab gets a 404
  route('GET', '/api/applications/mine', ['student'], ({ user }) => ({
    applications: q('SELECT * FROM applications WHERE student_id=? ORDER BY created_at DESC', user.id).map(appView),
  }));
  route('GET', '/api/applications/:id', ['student'], ({ user, params }) => {
    const a = q1('SELECT * FROM applications WHERE id=?', params.id);
    if (!a || a.student_id !== user.id) throw notFound();
    const p = q1('SELECT * FROM participation WHERE application_id=?', a.id);
    return { application: { ...appView(a), participation: p ? partView(p) : null } };
  });

  route('GET', '/api/opportunities/:id/applications', ['resident'], ({ user, params }) => {
    const opp = getOpp(params.id);
    requireOwner(user, opp);
    return {
      opportunity: oppView(opp, user),
      applications: q('SELECT * FROM applications WHERE opportunity_id=? ORDER BY created_at', opp.id).map((a) => {
        const s = { display_name: hostFacingName(a.student_id) }; // pseudonymous name, or initials by the student's choice
        const c = q1('SELECT status FROM consents WHERE application_id=?', a.id);
        const p = q1('SELECT id, status, claimed_hours, confirmed_hours, verified_hours, note FROM participation WHERE application_id=?', a.id);
        return { id: a.id, status: a.status, message: a.message, student_name: s.display_name, consent_status: c?.status, participation: p || null, created_at: a.created_at };
      }),
    };
  });

  route('POST', '/api/applications/:id/accept', ['resident'], ({ user, params }) => {
    return tx(db, () => {
      const a = q1('SELECT * FROM applications WHERE id=?', params.id);
      if (!a) throw notFound();
      const opp = getOpp(a.opportunity_id);
      requireOwner(user, opp);
      if (a.status !== 'under_review') throw conflict('invalid_state');
      const c = q1('SELECT status FROM consents WHERE application_id=?', a.id);
      if (c?.status !== 'approved') throw conflict('consent_required'); // guardian consent can never be bypassed
      if (opp.status !== 'published') throw conflict(opp.status === 'full' ? 'opportunity_full' : 'opportunity_unavailable');
      if (!approvedMember(a.student_id, opp.community_id)) throw conflict('student_not_member');
      if (acceptedCount(opp.id) >= opp.capacity) throw conflict('opportunity_full');
      run("UPDATE applications SET status='accepted', updated_at=? WHERE id=?", now(), a.id);
      refreshFull(opp);
      notify(a.student_id, 'application_accepted', { title: opp.title }, '/student/applications');
      for (const g of guardiansOf(a.student_id)) notify(g, 'application_accepted', { title: opp.title }, '/guardian/consents');
      audit(user.id, 'application.accept', 'application', a.id, {});
      return { status: 'accepted' };
    });
  });

  route('POST', '/api/applications/:id/reject', ['resident'], ({ user, params, body }) => {
    const a = q1('SELECT * FROM applications WHERE id=?', params.id);
    if (!a) throw notFound();
    const opp = getOpp(a.opportunity_id);
    requireOwner(user, opp);
    if (!['pending_guardian', 'under_review', 'accepted'].includes(a.status)) throw conflict('invalid_state');
    const { reason } = validate(body, { reason: { t: 'str', max: 300, opt: true } });
    tx(db, () => {
      run("UPDATE applications SET status='rejected', decision_reason=?, updated_at=? WHERE id=?", reason, now(), a.id);
      refreshFull(opp);
      notify(a.student_id, 'application_rejected', { title: opp.title }, '/student/applications');
      audit(user.id, 'application.reject', 'application', a.id, {});
    });
    return { status: 'rejected' };
  });

  route('POST', '/api/applications/:id/withdraw', ['student'], ({ user, params }) => {
    const a = q1('SELECT * FROM applications WHERE id=?', params.id);
    if (!a || a.student_id !== user.id) throw notFound();
    if (!ACTIVE_APP.includes(a.status)) throw conflict('invalid_state');
    const opp = getOpp(a.opportunity_id);
    tx(db, () => {
      run("UPDATE applications SET status='withdrawn', updated_at=? WHERE id=?", now(), a.id);
      run("UPDATE consents SET status=CASE status WHEN 'approved' THEN 'withdrawn' ELSE 'expired' END, updated_at=? WHERE application_id=? AND status IN ('pending','approved')", now(), a.id);
      refreshFull(opp);
      notify(opp.resident_id, 'application_withdrawn', { title: opp.title, student: hostFacingName(user.id) }, `/resident/opportunities/${opp.id}/applicants`);
    });
    return { status: 'withdrawn' };
  });

  // ================= GUARDIAN =================
  route('POST', '/api/guardian/link', ['guardian'], ({ user, body }) => {
    const { code } = validate(body, { code: { t: 'str', min: 8, max: 8 } });
    if (!authLimiter('link:' + user.id)) throw new HttpError(429, 'rate_limited');
    const s = q1("SELECT * FROM users WHERE link_code=? AND role='student' AND status='active'", code.toUpperCase());
    if (!s) throw notFound('invalid_link_code');
    if (guardiansOf(s.id).length >= 3) throw conflict('too_many_guardians');
    tx(db, () => {
      const ex = q1('SELECT * FROM guardian_links WHERE guardian_id=? AND student_id=?', user.id, s.id);
      if (ex) run("UPDATE guardian_links SET status='active', updated_at=? WHERE id=?", now(), ex.id);
      else run('INSERT INTO guardian_links VALUES (?,?,?,?,?,?)', id(), user.id, s.id, 'active', now(), now());
      run('UPDATE users SET link_code=? WHERE id=?', newLinkCode(), s.id); // single-use code
      notify(s.id, 'guardian_linked', { guardian: user.display_name }, '/profile');
      audit(user.id, 'guardian.link', 'user', s.id, {});
    });
    return { student: { id: s.id, display_name: s.display_name } };
  });

  const consentView = (c) => {
    const a = q1('SELECT * FROM applications WHERE id=?', c.application_id);
    const o = getOpp(a.opportunity_id);
    const s = q1('SELECT display_name, age FROM users WHERE id=?', c.student_id);
    return {
      id: c.id, status: c.status, reason: c.reason, decided_at: c.decided_at, created_at: c.created_at,
      application_status: a.status,
      student: { id: c.student_id, display_name: s.display_name, age: s.age },
      opportunity: {
        id: o.id, title: o.title, description: o.description, category: o.category, general_location: o.general_location,
        date: o.date, start_time: o.start_time, end_time: o.end_time, duration_hours: o.duration_hours,
        supervision: o.supervision, requirements: o.requirements, accessibility: o.accessibility, status: o.status,
        community: communityOf(o.community_id)?.name, community_ar: communityOf(o.community_id)?.name_ar, host_name: q1('SELECT display_name FROM users WHERE id=?', o.resident_id).display_name,
      },
    };
  };

  route('GET', '/api/guardian/dashboard', ['guardian'], ({ user }) => {
    const students = q(`SELECT u.id, u.display_name, u.age FROM guardian_links g JOIN users u ON u.id=g.student_id
      WHERE g.guardian_id=? AND g.status='active'`, user.id).map((s) => ({
      ...s,
      verified_hours: q1("SELECT COALESCE(SUM(verified_hours),0) h FROM participation WHERE student_id=? AND status='verified'", s.id).h,
      active_activities: q1("SELECT COUNT(*) c FROM applications WHERE student_id=? AND status='accepted'", s.id).c,
    }));
    const ids = students.map((s) => s.id);
    const all = ids.length
      ? q(`SELECT * FROM consents WHERE student_id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at DESC`, ...ids).map(consentView)
      : [];
    return {
      students,
      pending: all.filter((c) => c.status === 'pending'),
      history: all.filter((c) => c.status !== 'pending'),
    };
  });

  function decideConsent(user, consentId, decision, reason) {
    return tx(db, () => {
      const c = q1('SELECT * FROM consents WHERE id=?', consentId);
      if (!c || !isGuardianOf(user.id, c.student_id)) throw notFound(); // unrelated students are invisible
      const a = q1('SELECT * FROM applications WHERE id=?', c.application_id);
      const opp = getOpp(a.opportunity_id);
      if (decision === 'withdrawn') {
        if (c.status !== 'approved' || !['under_review', 'accepted'].includes(a.status)) throw conflict('invalid_state');
      } else if (c.status !== 'pending' || a.status !== 'pending_guardian') throw conflict('invalid_state');
      if (decision === 'approved' && (opp.date < todayUAE() || !['published', 'full'].includes(opp.status))) throw conflict('opportunity_unavailable');
      run('UPDATE consents SET status=?, guardian_id=?, reason=?, decided_at=?, updated_at=? WHERE id=?', decision, user.id, reason || null, now(), now(), c.id);
      if (decision === 'approved') run("UPDATE applications SET status='under_review', updated_at=? WHERE id=?", now(), a.id);
      else {
        run("UPDATE applications SET status=?, decision_reason=?, updated_at=? WHERE id=?", decision === 'rejected' ? 'rejected' : 'cancelled', 'guardian', now(), a.id);
        refreshFull(opp);
      }
      const kind = { approved: 'consent_approved', rejected: 'consent_rejected', withdrawn: 'consent_withdrawn' }[decision];
      notify(c.student_id, kind, { title: opp.title }, '/student/applications');
      notify(opp.resident_id, kind + '_host', { title: opp.title, student: hostFacingName(c.student_id) }, `/resident/opportunities/${opp.id}/applicants`);
      audit(user.id, `consent.${decision}`, 'consent', c.id, {});
      return { status: decision };
    });
  }
  route('POST', '/api/consents/:id/decide', ['guardian'], ({ user, params, body }) => {
    const { decision } = validate(body, { decision: { t: 'enum', values: ['approved', 'rejected'] } });
    const { reason } = validate(body, { reason: { t: 'str', max: 300, opt: true } });
    return decideConsent(user, params.id, decision, reason);
  });
  route('POST', '/api/consents/:id/withdraw', ['guardian'], ({ user, params, body }) => {
    const { reason } = validate(body, { reason: { t: 'str', max: 300, opt: true } });
    return decideConsent(user, params.id, 'withdrawn', reason);
  });

  // ================= PARTICIPATION & HOURS =================
  const partView = (p) => {
    const o = getOpp(p.opportunity_id);
    return {
      id: p.id, status: p.status, claimed_hours: p.claimed_hours, confirmed_hours: p.confirmed_hours, verified_hours: p.verified_hours,
      verified_at: p.verified_at, note: p.note, created_at: p.created_at,
      reviewer_name: p.reviewer_id ? q1('SELECT display_name FROM users WHERE id=?', p.reviewer_id)?.display_name : null,
      opportunity: { id: o.id, title: o.title, date: o.date, duration_hours: o.duration_hours, general_location: o.general_location, community: communityOf(o.community_id)?.name, community_ar: communityOf(o.community_id)?.name_ar },
    };
  };
  route('GET', '/api/participation/mine', ['student'], ({ user }) => {
    const records = q('SELECT * FROM participation WHERE student_id=? ORDER BY created_at DESC', user.id).map(partView);
    return {
      records,
      totals: {
        verified: records.filter((r) => r.status === 'verified').reduce((s, r) => s + r.verified_hours, 0),
        pending: records.filter((r) => r.status === 'pending_verification').reduce((s, r) => s + (r.confirmed_hours || 0), 0),
      },
    };
  });

  route('POST', '/api/participation/:id/confirm', ['resident'], ({ user, params, body }) => {
    const p = q1('SELECT * FROM participation WHERE id=?', params.id);
    if (!p) throw notFound();
    const opp = getOpp(p.opportunity_id);
    requireOwner(user, opp);
    if (!['awaiting_confirmation', 'correction_requested'].includes(p.status)) throw conflict('invalid_state');
    const { hours, note } = { ...validate(body, { hours: { t: 'num', min: 0.25, max: opp.duration_hours } }), ...validate(body, { note: { t: 'str', max: 300, opt: true } }) };
    tx(db, () => {
      run("UPDATE participation SET claimed_hours=?, confirmed_hours=?, status='pending_verification', note=?, updated_at=? WHERE id=?", hours, hours, note, now(), p.id);
      notify(p.student_id, 'hours_confirmed_pending', { title: opp.title, hours }, '/student/hours');
      notifyMods(opp.community_id, 'hours_review', { title: opp.title }, '/moderator/hours');
      audit(user.id, 'participation.confirm', 'participation', p.id, { hours });
    });
    return { status: 'pending_verification' };
  });

  // Student exports only their own records, and the file never implies official certification.
  route('GET', '/api/me/participation/export', ['student'], ({ user, query }) => {
    const rows = q('SELECT * FROM participation WHERE student_id=? ORDER BY created_at', user.id).map((p) => {
      const o = getOpp(p.opportunity_id);
      return {
        record_id: p.id, student: user.display_name, activity: o.title, date: o.date, claimed_hours: p.claimed_hours,
        verified_hours: p.verified_hours, status: p.status, platform: PLATFORM,
      };
    });
    if (query.format === 'csv') {
      const head = ['student', 'activity', 'date', 'claimed_hours', 'verified_hours', 'verification_status', 'record_id', 'platform'];
      const csv = [head.join(',')].concat(rows.map((r) => [r.student, r.activity, r.date, r.claimed_hours, r.verified_hours, r.status, r.record_id, r.platform].map(csvCell).join(','))).join('\r\n');
      return { __raw: csv, contentType: 'text/csv; charset=utf-8', filename: 'participation-summary.csv' };
    }
    return { platform: PLATFORM, generated_at: now(), student: user.display_name, rows, notice: 'not_official' };
  });

  // ================= REPORTS =================
  route('POST', '/api/reports', [ANY], ({ user, body }) => {
    const v = validate(body, {
      category: { t: 'enum', values: REPORT_CATS },
      details: { t: 'str', min: 10, max: 1000 },
      opportunity_id: { t: 'str', max: 60, opt: true },
      community_id: { t: 'str', max: 60, opt: true },
    });
    let cid = v.community_id || null;
    let oid = null;
    if (v.opportunity_id) {
      const o = q1('SELECT * FROM opportunities WHERE id=?', v.opportunity_id);
      if (!o) throw notFound();
      oid = o.id;
      cid = o.community_id;
    } else if (cid && !communityOf(cid)) throw notFound();
    const rid = id();
    run('INSERT INTO reports VALUES (?,?,?,?,?,?,?,?,?,?,?)', rid, user.id, cid, oid, v.category, v.details, 'open', null, null, now(), now());
    if (cid) notifyMods(cid, 'report_filed', { category: v.category }, '/moderator/reports');
    return { id: rid, status: 'open' };
  });
  route('GET', '/api/reports/mine', [ANY], ({ user }) => ({
    reports: q('SELECT id, category, status, created_at FROM reports WHERE reporter_id=? ORDER BY created_at DESC', user.id),
  }));

  // ================= MODERATOR =================
  const MOD = ['moderator'];
  const modIn = (user, cid) => {
    if (!cid || !isModOf(user.id, cid)) throw notFound(); // other communities are invisible, not merely forbidden
  };
  const inList = (arr) => (arr.length ? arr.map(() => '?').join(',') : "''");

  route('GET', '/api/mod/overview', MOD, ({ user }) => {
    const cids = modCommunityIds(user.id);
    const m = inList(cids);
    const count = (sql) => q1(sql, ...cids).c;
    return {
      communities: cids.map((cid) => {
        const c = communityOf(cid);
        return {
          id: c.id, name: c.name, name_ar: c.name_ar, type: c.type,
          members: q1("SELECT COUNT(*) c FROM memberships WHERE community_id=? AND status='approved'", cid).c,
          active_opportunities: q1("SELECT COUNT(*) c FROM opportunities WHERE community_id=? AND status IN ('published','full')", cid).c,
          verified_hours: q1("SELECT COALESCE(SUM(p.verified_hours),0) h FROM participation p JOIN opportunities o ON o.id=p.opportunity_id WHERE o.community_id=? AND p.status='verified'", cid).h,
        };
      }),
      counts: {
        memberships: count(`SELECT COUNT(*) c FROM memberships WHERE status='pending' AND community_id IN (${m})`),
        opportunities: count(`SELECT COUNT(*) c FROM opportunities WHERE status='pending_review' AND community_id IN (${m})`),
        hours: count(`SELECT COUNT(*) c FROM participation p JOIN opportunities o ON o.id=p.opportunity_id WHERE p.status='pending_verification' AND o.community_id IN (${m})`),
        reports: count(`SELECT COUNT(*) c FROM reports WHERE status IN ('open','in_review') AND community_id IN (${m})`),
      },
    };
  });

  route('GET', '/api/mod/memberships', MOD, ({ user, query }) => {
    const cids = modCommunityIds(user.id);
    const status = query.status === 'all' ? null : 'pending';
    const rows = q(`SELECT m.*, u.display_name, u.role, c.name community, c.name_ar community_ar FROM memberships m
      JOIN users u ON u.id=m.user_id JOIN communities c ON c.id=m.community_id
      WHERE m.community_id IN (${inList(cids)}) ${status ? "AND m.status='pending'" : "AND m.status!='pending'"} ORDER BY m.updated_at DESC LIMIT 100`, ...cids);
    return { memberships: rows.map((r) => ({ id: r.id, status: r.status, display_name: r.display_name, role: r.role, community: r.community, community_ar: r.community_ar, decision_reason: r.decision_reason, created_at: r.created_at, updated_at: r.updated_at })) };
  });

  route('POST', '/api/mod/memberships/:id/decide', MOD, ({ user, params, body }) => {
    const m = q1('SELECT * FROM memberships WHERE id=?', params.id);
    if (!m) throw notFound();
    modIn(user, m.community_id);
    const { decision } = validate(body, { decision: { t: 'enum', values: ['approved', 'rejected', 'suspended', 'revoked', 'reinstated'] } });
    const reason = ['approved'].includes(decision) ? (validate(body, { reason: { t: 'str', max: 500, opt: true } }).reason) : requireReason(body);
    const allowed = {
      approved: ['pending'], rejected: ['pending'], suspended: ['approved'], revoked: ['approved', 'suspended'], reinstated: ['suspended', 'revoked'],
    };
    if (!allowed[decision].includes(m.status)) throw conflict('invalid_state');
    if (m.user_id === user.id) throw forbidden();
    const final = decision === 'reinstated' ? 'approved' : decision;
    tx(db, () => {
      run('UPDATE memberships SET status=?, decided_by=?, decision_reason=?, updated_at=? WHERE id=?', final, user.id, reason || null, now(), m.id);
      modAct(user.id, m.community_id, 'membership', m.id, decision, reason);
      const c = communityOf(m.community_id);
      notify(m.user_id, 'membership_' + final, { community: c.name, community_ar: c.name_ar, reason: reason || '' }, '/me/communities');
    });
    return { status: final };
  });

  route('GET', '/api/mod/opportunities', MOD, ({ user, query }) => {
    const cids = modCommunityIds(user.id);
    const statuses = query.scope === 'live' ? "('published','full')" : "('pending_review')";
    return {
      opportunities: q(`SELECT * FROM opportunities WHERE community_id IN (${inList(cids)}) AND status IN ${statuses} ORDER BY date`, ...cids).map((o) => oppView(o, user)),
    };
  });
  route('POST', '/api/mod/opportunities/:id/decide', MOD, ({ user, params, body }) => {
    const opp = getOpp(params.id);
    modIn(user, opp.community_id);
    const { decision } = validate(body, { decision: { t: 'enum', values: ['approve', 'reject', 'suspend'] } });
    const reason = decision === 'approve' ? null : requireReason(body);
    tx(db, () => {
      if (decision === 'approve') {
        if (opp.status !== 'pending_review') throw conflict('invalid_state');
        run("UPDATE opportunities SET status='published', review_note=NULL, updated_at=? WHERE id=?", now(), opp.id);
        notify(opp.resident_id, 'opportunity_approved', { title: opp.title }, `/resident/opportunities/${opp.id}/applicants`);
        for (const m of q(`SELECT u.id FROM memberships m JOIN users u ON u.id=m.user_id
          WHERE m.community_id=? AND m.status='approved' AND u.role='student' AND u.status='active' AND u.age>=?`, opp.community_id, opp.min_age)) {
          notify(m.id, 'new_opportunity', { title: opp.title }, `/opportunities/${opp.id}`);
        }
      } else if (decision === 'reject') {
        if (opp.status !== 'pending_review') throw conflict('invalid_state');
        run("UPDATE opportunities SET status='draft', review_note=?, updated_at=? WHERE id=?", reason, now(), opp.id);
        notify(opp.resident_id, 'opportunity_rejected', { title: opp.title, reason }, `/resident/opportunities/${opp.id}/applicants`);
      } else {
        if (!['published', 'full', 'pending_review'].includes(opp.status)) throw conflict('invalid_state');
        cancelOpportunity(opp, user.id, 'activity_suspended');
        run('UPDATE opportunities SET review_note=? WHERE id=?', reason, opp.id);
        notify(opp.resident_id, 'opportunity_suspended', { title: opp.title, reason }, `/resident/opportunities/${opp.id}/applicants`);
      }
      modAct(user.id, opp.community_id, 'opportunity', opp.id, decision, reason);
    });
    return { opportunity: oppView(getOpp(opp.id), user) };
  });

  route('GET', '/api/mod/participation', MOD, ({ user }) => {
    const cids = modCommunityIds(user.id);
    const rows = q(`SELECT p.* FROM participation p JOIN opportunities o ON o.id=p.opportunity_id
      WHERE p.status='pending_verification' AND o.community_id IN (${inList(cids)}) ORDER BY p.updated_at`, ...cids);
    return {
      records: rows.map((p) => ({
        ...partView(p),
        student_name: q1('SELECT display_name FROM users WHERE id=?', p.student_id).display_name,
        host_name: q1('SELECT display_name FROM users WHERE id=?', getOpp(p.opportunity_id).resident_id).display_name,
      })),
    };
  });
  route('POST', '/api/mod/participation/:id/decide', MOD, ({ user, params, body }) => {
    const p = q1('SELECT * FROM participation WHERE id=?', params.id);
    if (!p) throw notFound();
    const opp = getOpp(p.opportunity_id);
    modIn(user, opp.community_id);
    if (p.status !== 'pending_verification') throw conflict('invalid_state'); // blocks double credit
    if ([p.student_id, opp.resident_id].includes(user.id)) throw forbidden(); // independence
    const { decision } = validate(body, { decision: { t: 'enum', values: ['approve', 'reject', 'correction'] } });
    let hours = null;
    let reason = null;
    if (decision === 'approve') {
      hours = validate(body, { hours: { t: 'num', min: 0.25, max: p.confirmed_hours, opt: true } }).hours ?? p.confirmed_hours;
      reason = validate(body, { reason: { t: 'str', max: 500, opt: true } }).reason;
    } else reason = requireReason(body);
    tx(db, () => {
      if (decision === 'approve') {
        run("UPDATE participation SET status='verified', verified_hours=?, reviewer_id=?, verified_at=?, updated_at=? WHERE id=? AND status='pending_verification'", hours, user.id, now(), now(), p.id);
        notify(p.student_id, 'hours_verified', { title: opp.title, hours }, '/student/hours');
      } else if (decision === 'reject') {
        run("UPDATE participation SET status='rejected', reviewer_id=?, verified_at=?, note=?, updated_at=? WHERE id=?", user.id, now(), reason, now(), p.id);
        notify(p.student_id, 'hours_rejected', { title: opp.title, reason }, '/student/hours');
      } else {
        run("UPDATE participation SET status='correction_requested', reviewer_id=?, note=?, updated_at=? WHERE id=?", user.id, reason, now(), p.id);
        notify(opp.resident_id, 'hours_correction', { title: opp.title, reason }, `/resident/opportunities/${opp.id}/participation`);
        notify(p.student_id, 'hours_correction_student', { title: opp.title }, '/student/hours');
      }
      modAct(user.id, opp.community_id, 'participation', p.id, 'hours_' + decision, reason);
    });
    return { record: partView(q1('SELECT * FROM participation WHERE id=?', p.id)) };
  });

  route('GET', '/api/mod/reports', MOD, ({ user, query }) => {
    const cids = modCommunityIds(user.id);
    const closed = query.scope === 'closed';
    return {
      reports: q(`SELECT * FROM reports WHERE community_id IN (${inList(cids)}) AND status ${closed ? "IN ('resolved','dismissed')" : "IN ('open','in_review')"} ORDER BY created_at DESC`, ...cids)
        .map((r) => reportView(r)),
    };
  });
  const reportView = (r) => ({
    id: r.id, category: r.category, details: r.details, status: r.status, resolution: r.resolution, created_at: r.created_at,
    opportunity: r.opportunity_id ? { id: r.opportunity_id, title: q1('SELECT title FROM opportunities WHERE id=?', r.opportunity_id)?.title, status: q1('SELECT status FROM opportunities WHERE id=?', r.opportunity_id)?.status } : null,
    community: r.community_id ? communityOf(r.community_id)?.name : null,
  });
  function updateReport(user, rid, body, isAdmin) {
    const r = q1('SELECT * FROM reports WHERE id=?', rid);
    if (!r) throw notFound();
    if (!isAdmin) modIn(user, r.community_id);
    const { status } = validate(body, { status: { t: 'enum', values: ['in_review', 'resolved', 'dismissed'] } });
    const resolution = status === 'in_review' ? null : requireReason({ reason: body.resolution });
    if (['resolved', 'dismissed'].includes(r.status)) throw conflict('invalid_state');
    tx(db, () => {
      run('UPDATE reports SET status=?, resolution=?, handled_by=?, updated_at=? WHERE id=?', status, resolution, user.id, now(), r.id);
      if (body.suspend_opportunity === true && r.opportunity_id) {
        const opp = getOpp(r.opportunity_id);
        if (['published', 'full', 'pending_review'].includes(opp.status)) {
          cancelOpportunity(opp, user.id, 'activity_suspended');
          run('UPDATE opportunities SET review_note=? WHERE id=?', resolution || 'report', opp.id);
          notify(opp.resident_id, 'opportunity_suspended', { title: opp.title, reason: resolution || '' }, `/resident/opportunities/${opp.id}/applicants`);
        }
      }
      if (r.community_id) modAct(user.id, r.community_id, 'report', r.id, 'report_' + status, resolution);
      else audit(user.id, 'report.' + status, 'report', r.id, {});
      notify(r.reporter_id, 'report_update', { status }, '/profile');
    });
    return { report: reportView(q1('SELECT * FROM reports WHERE id=?', r.id)) };
  }
  route('POST', '/api/mod/reports/:id/update', MOD, ({ user, params, body }) => updateReport(user, params.id, body, false));

  // Detail reads for deep links. Out-of-scope records 404 exactly like missing ones.
  route('GET', '/api/mod/memberships/:id', MOD, ({ user, params }) => {
    const m = q1(`SELECT m.*, u.display_name, u.role, c.name community, c.name_ar community_ar, c.type FROM memberships m
      JOIN users u ON u.id=m.user_id JOIN communities c ON c.id=m.community_id WHERE m.id=?`, params.id);
    if (!m) throw notFound();
    modIn(user, m.community_id);
    const history = q(`SELECT a.action, a.reason, a.created_at, u.display_name actor FROM moderation_actions a JOIN users u ON u.id=a.actor_id
      WHERE a.target_type='membership' AND a.target_id=? ORDER BY a.created_at DESC`, m.id);
    return {
      membership: {
        id: m.id, status: m.status, display_name: m.display_name, role: m.role, community: m.community, community_ar: m.community_ar,
        community_type: m.type, decision_reason: m.decision_reason, created_at: m.created_at, updated_at: m.updated_at,
        other_memberships: q1("SELECT COUNT(*) n FROM memberships WHERE user_id=? AND status='approved' AND community_id!=?", m.user_id, m.community_id).n,
      },
      history,
    };
  });
  route('GET', '/api/mod/participation/:id', MOD, ({ user, params }) => {
    const p = q1('SELECT * FROM participation WHERE id=?', params.id);
    if (!p) throw notFound();
    const opp = getOpp(p.opportunity_id);
    modIn(user, opp.community_id);
    return {
      record: {
        ...partView(p),
        student_name: q1('SELECT display_name FROM users WHERE id=?', p.student_id).display_name,
        host_name: q1('SELECT display_name FROM users WHERE id=?', opp.resident_id).display_name,
        scheduled: { date: opp.date, start_time: opp.start_time, end_time: opp.end_time, supervision: opp.supervision },
      },
      history: q(`SELECT a.action, a.reason, a.created_at, u.display_name actor FROM moderation_actions a JOIN users u ON u.id=a.actor_id
        WHERE a.target_type='participation' AND a.target_id=? ORDER BY a.created_at DESC`, p.id),
    };
  });
  route('GET', '/api/mod/reports/:id', MOD, ({ user, params }) => {
    const r = q1('SELECT * FROM reports WHERE id=?', params.id);
    if (!r) throw notFound();
    modIn(user, r.community_id);
    return { report: reportView(r) };
  });
  route('GET', '/api/mod/listing-history', MOD, ({ user }) => {
    const cids = modCommunityIds(user.id);
    return {
      memberships: q(`SELECT m.id, m.status, m.updated_at, m.decision_reason, u.display_name, c.name community, c.name_ar community_ar FROM memberships m
        JOIN users u ON u.id=m.user_id JOIN communities c ON c.id=m.community_id
        WHERE m.community_id IN (${inList(cids)}) AND m.status IN ('approved','suspended') ORDER BY m.updated_at DESC LIMIT 100`, ...cids),
    };
  });

  route('POST', '/api/mod/announcements', MOD, ({ user, body }) => {
    const v = validate(body, { community_id: { t: 'str', max: 60 }, message: { t: 'str', min: 10, max: 400 } });
    modIn(user, v.community_id);
    const c = communityOf(v.community_id);
    const members = q("SELECT user_id FROM memberships WHERE community_id=? AND status='approved'", c.id);
    tx(db, () => {
      for (const m of members) notify(m.user_id, 'community_announcement', { community: c.name, community_ar: c.name_ar, message: v.message }, '/notifications');
      modAct(user.id, c.id, 'community', c.id, 'announcement', v.message);
    });
    return { recipients: members.length };
  });

  route('GET', '/api/mod/history', MOD, ({ user }) => {
    const cids = modCommunityIds(user.id);
    return {
      actions: q(`SELECT a.*, u.display_name actor FROM moderation_actions a JOIN users u ON u.id=a.actor_id
        WHERE a.community_id IN (${inList(cids)}) ORDER BY a.created_at DESC LIMIT 80`, ...cids),
    };
  });

  // ================= ADMIN =================
  const ADMIN = ['admin'];
  route('GET', '/api/admin/communities', ADMIN, () => ({
    communities: q('SELECT * FROM communities ORDER BY name').map((c) => ({
      ...c,
      moderators: q('SELECT u.id, u.display_name FROM moderators m JOIN users u ON u.id=m.user_id WHERE m.community_id=?', c.id),
      members: q1("SELECT COUNT(*) n FROM memberships WHERE community_id=? AND status='approved'", c.id).n,
    })),
  }));
  const COMMUNITY_SPEC = {
    name: { t: 'str', min: 3, max: 80 }, name_ar: { t: 'str', min: 3, max: 80 },
    emirate: { t: 'enum', values: ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'] },
    general_location: { t: 'str', min: 3, max: 100 }, general_location_ar: { t: 'str', min: 3, max: 100 },
    type: { t: 'enum', values: ['gated', 'open'] },
    description: { t: 'str', min: 10, max: 400 }, description_ar: { t: 'str', min: 10, max: 400 },
  };
  route('POST', '/api/admin/communities', ADMIN, ({ user, body }) => {
    const v = validate(body, COMMUNITY_SPEC);
    const cid = id();
    run('INSERT INTO communities VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', cid, v.name, v.name_ar, v.emirate, v.general_location, v.general_location_ar, v.type,
      v.description, v.description_ar, v.type === 'gated' ? 'members' : 'public', v.type === 'gated' ? 'moderator_approval' : 'auto_approve_students', 1, now(), now());
    audit(user.id, 'community.create', 'community', cid, {});
    return { community: communityPublic(communityOf(cid)) };
  });
  route('POST', '/api/admin/communities/:id/active', ADMIN, ({ user, params, body }) => {
    const c = communityOf(params.id);
    if (!c) throw notFound();
    const { active } = validate(body, { active: { t: 'bool' } });
    run('UPDATE communities SET active=?, updated_at=? WHERE id=?', active ? 1 : 0, now(), c.id);
    audit(user.id, active ? 'community.activate' : 'community.deactivate', 'community', c.id, {});
    return { active };
  });
  route('GET', '/api/admin/users', ADMIN, ({ query }) => {
    const needle = `%${(query.q || '').toLowerCase()}%`;
    return {
      users: q('SELECT id, display_name, email, role, status, created_at FROM users WHERE lower(display_name) LIKE ? OR lower(email) LIKE ? ORDER BY created_at DESC LIMIT 100', needle, needle)
        .map((u) => ({ ...u, moderator_of: q('SELECT community_id FROM moderators WHERE user_id=?', u.id).map((r) => r.community_id) })),
    };
  });
  route('POST', '/api/admin/users/:id/status', ADMIN, ({ user, params, body }) => {
    const u = q1('SELECT * FROM users WHERE id=?', params.id);
    if (!u) throw notFound();
    if (u.role === 'admin') throw forbidden();
    const { status } = validate(body, { status: { t: 'enum', values: ['active', 'suspended'] } });
    const reason = requireReason(body);
    tx(db, () => {
      run('UPDATE users SET status=?, updated_at=? WHERE id=?', status, now(), u.id);
      if (status === 'suspended') run('DELETE FROM sessions WHERE user_id=?', u.id);
      audit(user.id, 'user.' + status, 'user', u.id, { reason });
    });
    return { status };
  });
  route('POST', '/api/admin/moderators', ADMIN, ({ user, body }) => {
    const { user_id, community_id } = validate(body, { user_id: { t: 'str', max: 60 }, community_id: { t: 'str', max: 60 } });
    const u = q1('SELECT * FROM users WHERE id=?', user_id);
    if (!u || !communityOf(community_id)) throw notFound();
    if (!['resident', 'moderator'].includes(u.role)) throw conflict('cannot_moderate');
    tx(db, () => {
      run("UPDATE users SET role='moderator', updated_at=? WHERE id=?", now(), u.id);
      run('INSERT OR IGNORE INTO moderators VALUES (?,?,?)', u.id, community_id, now());
      audit(user.id, 'moderator.assign', 'user', u.id, { community_id });
      notify(u.id, 'moderator_assigned', { community: communityOf(community_id).name, community_ar: communityOf(community_id).name_ar }, '/moderator');
    });
    return { ok: true };
  });
  route('POST', '/api/admin/moderators/remove', ADMIN, ({ user, body }) => {
    const { user_id, community_id } = validate(body, { user_id: { t: 'str', max: 60 }, community_id: { t: 'str', max: 60 } });
    tx(db, () => {
      run('DELETE FROM moderators WHERE user_id=? AND community_id=?', user_id, community_id);
      if (!q1('SELECT 1 FROM moderators WHERE user_id=?', user_id)) run("UPDATE users SET role='resident', updated_at=? WHERE id=? AND role='moderator'", now(), user_id);
      audit(user.id, 'moderator.remove', 'user', user_id, { community_id });
    });
    return { ok: true };
  });
  route('GET', '/api/admin/audit', ADMIN, () => ({
    events: q(`SELECT e.*, u.display_name actor FROM audit_events e LEFT JOIN users u ON u.id=e.actor_id ORDER BY e.created_at DESC, e.rowid DESC LIMIT 100`)
      .map((e) => ({ ...e, meta: JSON.parse(e.meta) })),
  }));
  route('GET', '/api/admin/reports', ADMIN, () => ({
    reports: q("SELECT * FROM reports WHERE status IN ('open','in_review') ORDER BY created_at DESC").map(reportView),
  }));
  route('POST', '/api/admin/reports/:id/update', ADMIN, ({ user, params, body }) => updateReport(user, params.id, body, true));
  route('GET', '/api/admin/participation', ADMIN, ({ query }) => {
    const st = ['awaiting_confirmation', 'pending_verification', 'correction_requested', 'verified', 'rejected'].includes(query.status) ? query.status : null;
    const rows = q(`SELECT * FROM participation ${st ? 'WHERE status=?' : ''} ORDER BY updated_at DESC LIMIT 200`, ...(st ? [st] : []));
    return {
      records: rows.map((p) => ({
        ...partView(p),
        student_name: q1('SELECT display_name FROM users WHERE id=?', p.student_id).display_name,
      })),
    };
  });
  route('GET', '/api/admin/settings', ADMIN, () => ({
    settings: {
      demo_mode: demo,
      secure_cookies: secureCookies,
      session_days: SESSION_MS / 86400000,
      max_activity_hours: 6,
      student_age_range: [12, 17],
      max_guardians_per_student: 3,
      categories: CATEGORIES,
      safeguarding_rules: ['dangerous_equipment', 'electrical', 'hazardous', 'private_meeting', 'unsafe_physical'],
      auth_rate_limit_per_minute: authLimit,
    },
  }));
  route('GET', '/api/admin/analytics', ADMIN, () => {
    const group = (sql) => Object.fromEntries(q(sql).map((r) => [r.k, r.n]));
    return {
      users: group('SELECT role k, COUNT(*) n FROM users GROUP BY role'),
      opportunities: group('SELECT status k, COUNT(*) n FROM opportunities GROUP BY status'),
      applications: group('SELECT status k, COUNT(*) n FROM applications GROUP BY status'),
      participation: group('SELECT status k, COUNT(*) n FROM participation GROUP BY status'),
      verified_hours: q1("SELECT COALESCE(SUM(verified_hours),0) h FROM participation WHERE status='verified'").h,
      open_reports: q1("SELECT COUNT(*) c FROM reports WHERE status IN ('open','in_review')").c,
      communities: q1('SELECT COUNT(*) c FROM communities WHERE active=1').c,
    };
  });

  // ================= DASHBOARDS =================
  route('GET', '/api/student/dashboard', ['student'], ({ user }) => {
    const apps = q('SELECT * FROM applications WHERE student_id=? ORDER BY updated_at DESC', user.id).map(appView);
    const by = (s) => apps.filter((a) => s.includes(a.status));
    const part = q('SELECT * FROM participation WHERE student_id=?', user.id);
    const today = todayUAE();
    return {
      upcoming: by(['accepted']).filter((a) => a.opportunity.date >= today).sort((a, b) => a.opportunity.date.localeCompare(b.opportunity.date)),
      awaiting_guardian: by(['pending_guardian']),
      under_review: by(['under_review']),
      completed: part.length,
      pending_verification: part.filter((p) => p.status === 'pending_verification').length,
      awaiting_resident: part.filter((p) => ['awaiting_confirmation', 'correction_requested'].includes(p.status)).length,
      verified_hours: part.filter((p) => p.status === 'verified').reduce((s, p) => s + p.verified_hours, 0),
      pending_hours: part.filter((p) => p.status === 'pending_verification').reduce((s, p) => s + p.confirmed_hours, 0),
      guardians: guardiansOf(user.id).length,
      memberships: q('SELECT community_id, status FROM memberships WHERE user_id=?', user.id),
    };
  });

  route('GET', '/api/resident/dashboard', ['resident'], ({ user }) => {
    const mems = q('SELECT m.*, c.name, c.name_ar, c.type FROM memberships m JOIN communities c ON c.id=m.community_id WHERE m.user_id=?', user.id)
      .map((m) => ({ community_id: m.community_id, status: m.status, name: m.name, name_ar: m.name_ar, type: m.type, decision_reason: m.decision_reason }));
    const opps = q('SELECT * FROM opportunities WHERE resident_id=? ORDER BY date', user.id);
    const ids = opps.map((o) => o.id);
    const inIds = inList(ids);
    return {
      memberships: mems,
      verified: mems.some((m) => m.status === 'approved'),
      active: opps.filter((o) => ['pending_review', 'published', 'full'].includes(o.status)).length,
      pending_applicants: ids.length ? q1(`SELECT COUNT(*) c FROM applications WHERE opportunity_id IN (${inIds}) AND status='under_review'`, ...ids).c : 0,
      accepted_volunteers: ids.length ? q1(`SELECT COUNT(*) c FROM applications WHERE opportunity_id IN (${inIds}) AND status='accepted'`, ...ids).c : 0,
      upcoming: opps.filter((o) => ['published', 'full'].includes(o.status) && o.date >= todayUAE()).map((o) => oppView(o, user)),
      awaiting_confirmation: ids.length ? q1(`SELECT COUNT(*) c FROM participation WHERE opportunity_id IN (${inIds}) AND status IN ('awaiting_confirmation','correction_requested')`, ...ids).c : 0,
      completed: opps.filter((o) => o.status === 'completed').length,
    };
  });

  // ---------- HTTP plumbing ----------
  function currentTokenHash(req) {
    const c = (req.headers.cookie || '').split(/;\s*/).find((x) => x.startsWith('sid='));
    return c ? sha256(c.slice(4)) : '';
  }

  function getUserFromReq(req) {
    const cookie = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith('sid='));
    if (!cookie) return null;
    const row = q1('SELECT * FROM sessions WHERE token_hash=?', sha256(cookie.slice(4)));
    if (!row || row.expires_at < now()) return null;
    const u = q1('SELECT * FROM users WHERE id=?', row.user_id);
    return u && u.status === 'active' ? u : null;
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      let tooLarge = false;
      req.on('data', (c) => {
        size += c.length;
        if (tooLarge) return; // keep draining so the 413 response can be delivered
        if (size > 100_000) { tooLarge = true; chunks.length = 0; reject(new HttpError(413, 'too_large')); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        if (!chunks.length) return resolve({});
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(bad('invalid_json')); }
      });
      req.on('error', reject);
    });
  }

  const SEC_HEADERS = {
    // HTTPS-only deployments: tell browsers to refuse plain HTTP for this host (6 months, no subdomains, no preload).
    ...(secureCookies ? { 'Strict-Transport-Security': 'max-age=15552000' } : {}),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  };

  // Behind a TLS-terminating proxy every request arrives from the proxy's address, which would put the whole room
  // in one rate-limit bucket. With TRUST_PROXY=1 we use the address the single trusted proxy appended (the last
  // X-Forwarded-For entry), which a client cannot forge. Only enable it when exactly one proxy sits in front.
  function clientIp(req) {
    if (trustProxy) {
      const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean);
      if (xff.length) return xff[xff.length - 1];
    }
    return req.socket.remoteAddress || 'x';
  }

  function send(res, status, payload, extra = {}) {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEC_HEADERS, ...extra });
    res.end(body);
  }

  async function handleApi(req, res, url) {
    const ip = clientIp(req);
    const method = req.method;
    let matched = null;
    let pathAllowed = false;
    for (const r of routes) {
      const m = r.re.exec(url.pathname);
      if (!m) continue;
      pathAllowed = true;
      if (r.method !== method) continue;
      matched = { r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
      break;
    }
    if (!matched) return send(res, pathAllowed ? 405 : 404, { error: pathAllowed ? 'method_not_allowed' : 'not_found' });
    const { r, params } = matched;
    const cookies = [];
    const cookieBase = `Path=/; HttpOnly; SameSite=Lax${secureCookies ? '; Secure' : ''}`;
    try {
      if (method !== 'GET') {
        // CSRF: custom header cannot be sent cross-site without a CORS preflight, which we never allow.
        if (req.headers['x-requested-with'] !== 'team26') throw forbidden('csrf');
      }
      const user = getUserFromReq(req);
      if (r.roles) {
        if (!user) throw new HttpError(401, 'unauthenticated');
        if (!r.roles.includes(ANY) && !r.roles.includes(user.role)) throw forbidden();
      }
      if (user && method !== 'GET' && !writeLimiter(user.id)) throw new HttpError(429, 'rate_limited');
      const body = method === 'GET' ? {} : await readBody(req);
      const query = Object.fromEntries(url.searchParams);
      const result = r.handler({
        user, params, query, body, ip, req,
        setSession: (uid) => {
          const token = newToken();
          run('INSERT INTO sessions (token_hash, user_id, expires_at, created_at, user_agent) VALUES (?,?,?,?,?)', sha256(token), uid, new Date(Date.now() + SESSION_MS).toISOString(), now(), String(req.headers['user-agent'] || '').slice(0, 200));
          cookies.push(`sid=${token}; ${cookieBase}; Max-Age=${SESSION_MS / 1000}`);
        },
        clearSession: () => {
          const c = (req.headers.cookie || '').split(/;\s*/).find((x) => x.startsWith('sid='));
          if (c) run('DELETE FROM sessions WHERE token_hash=?', sha256(c.slice(4)));
          cookies.push(`sid=; ${cookieBase}; Max-Age=0`);
        },
      });
      if (result && result.__raw !== undefined) {
        res.writeHead(200, { 'Content-Type': result.contentType, 'Content-Disposition': `attachment; filename="${result.filename}"`, 'Cache-Control': 'no-store', ...SEC_HEADERS });
        return res.end(result.__raw);
      }
      return send(res, 200, result ?? { ok: true }, cookies.length ? { 'Set-Cookie': cookies } : {});
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.code, fields: e.fields });
      console.error('[api error]', method, url.pathname, e?.message);
      return send(res, 500, { error: 'server_error' });
    }
  }

  // Static files are compressed once and kept in memory; index.html gets absolute share URLs.
  const compressedCache = new Map();
  const originOf = (req) => `${req.headers['x-forwarded-proto'] === 'https' || secureCookies ? 'https' : 'http'}://${req.headers.host || 'localhost'}`;
  function serveStatic(req, res, url) {
    if (!staticDir) return send(res, 404, { error: 'not_found' });
    let rel;
    try { rel = decodeURIComponent(url.pathname); } catch { return send(res, 400, { error: 'bad_request' }); }
    if (rel.includes('..')) return send(res, 400, { error: 'bad_request' });
    let file = path.join(staticDir, rel);
    let status = 200;
    if (!file.startsWith(staticDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      // unknown /assets/ files are real 404s; every other path is an app route
      if (rel.startsWith('/assets/')) return send(res, 404, { error: 'not_found' });
      file = path.join(staticDir, 'index.html');
    }
    if (!fs.existsSync(file)) return send(res, 404, { error: 'not_found' });
    const ext = path.extname(file);
    const immutable = file.includes(`${path.sep}assets${path.sep}`);
    let body = fs.readFileSync(file);
    if (file.endsWith('index.html')) body = Buffer.from(body.toString('utf8').replaceAll('content="/og-image.png"', `content="${originOf(req)}/og-image.png"`));
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      Vary: 'Accept-Encoding',
      ...SEC_HEADERS,
    };
    const compressible = ['.js', '.css', '.html', '.svg', '.json', '.webmanifest'].includes(ext);
    const accepts = String(req.headers['accept-encoding'] || '');
    if (compressible && /\bbr\b|gzip/.test(accepts)) {
      const enc = /\bbr\b/.test(accepts) ? 'br' : 'gzip';
      const key = `${file}|${fs.statSync(file).mtimeMs}|${enc}|${file.endsWith('index.html') ? originOf(req) : ''}`; // mtime: a rebuild must never serve stale bytes
      let z = compressedCache.get(key);
      if (!z) {
        z = enc === 'br' ? zlib.brotliCompressSync(body) : zlib.gzipSync(body, { level: 9 });
        compressedCache.set(key, z);
      }
      headers['Content-Encoding'] = enc;
      res.writeHead(status, headers);
      return res.end(z);
    }
    res.writeHead(status, headers);
    res.end(body);
  }

  // Only the public information pages are indexable; every account area is private.
  const PUBLIC_PAGES = ['/', '/about', '/safety', '/privacy', '/terms', '/help'];
  function crawlerFiles(req, res, url) {
    const proto = req.headers['x-forwarded-proto'] === 'https' || secureCookies ? 'https' : 'http';
    const origin = `${proto}://${req.headers.host || 'localhost'}`;
    if (url.pathname === '/robots.txt') {
      const body = ['User-agent: *', 'Allow: /$', ...PUBLIC_PAGES.slice(1).map((p) => `Allow: ${p}`), 'Disallow: /', '', `Sitemap: ${origin}/sitemap.xml`, ''].join('\n');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', ...SEC_HEADERS });
      return res.end(body);
    }
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PUBLIC_PAGES.map((p) => `  <url><loc>${origin}${p}</loc></url>`).join('\n')}\n</urlset>\n`;
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', ...SEC_HEADERS });
    return res.end(body);
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    // Plain HTTP that reached us through the proxy is sent to HTTPS (the proxy marks it; direct/health-check calls are untouched).
    if (secureCookies && req.headers['x-forwarded-proto'] === 'http' && req.headers.host) {
      res.writeHead(308, { Location: `https://${req.headers.host}${req.url}`, ...SEC_HEADERS });
      return res.end();
    }
    if (url.pathname === '/robots.txt' || url.pathname === '/sitemap.xml') crawlerFiles(req, res, url);
    else if (url.pathname.startsWith('/api/')) handleApi(req, res, url);
    else serveStatic(req, res, url);
  });

  return { server, db, close: () => { server.close(); db.close(); } };
}
