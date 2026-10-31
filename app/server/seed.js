import { id, now, tx } from './db.js';
import { hashPassword, addDays, todayUAE, newLinkCode } from './lib.js';

export const DEMO_PASSWORD = 'Demo#2026';
// The fixed set of fictional people the demo can switch between (never self-registered users).
export const DEMO_ACCOUNTS = ['yusuf.student', 'noor.student', 'maryam.student', 'khalid.guardian', 'fatima.guardian', 'huda.resident', 'rashid.resident', 'new.resident', 'layla.mod', 'omar.mod', 'admin'].map((n) => `${n}@team26.demo`);

/** Fictional, repeatable demo data. Wipes everything first. */
export function seed(db) {
  const run = (sql, ...a) => db.prepare(sql).run(...a);
  const T = todayUAE();
  const hash = hashPassword(DEMO_PASSWORD);
  tx(db, () => {
    for (const t of ['audit_events', 'moderation_actions', 'reports', 'notifications', 'participation', 'consents', 'applications', 'opportunities', 'guardian_links', 'memberships', 'moderators', 'sessions', 'communities', 'users']) run(`DELETE FROM ${t}`);

    const comm = (name, name_ar, emirate, loc, loc_ar, type, d, d_ar) => {
      const cid = id();
      run('INSERT INTO communities VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', cid, name, name_ar, emirate, loc, loc_ar, type, d, d_ar,
        type === 'gated' ? 'members' : 'public', type === 'gated' ? 'moderator_approval' : 'auto_approve_students', 1, now(), now());
      return cid;
    };
    const palm = comm('Palm Court Residences', 'بالم كورت ريزيدنسز', 'Dubai', 'Dubai Hills area', 'منطقة دبي هيلز', 'gated',
      'A gated residential community with shared gardens, a library corner and a weekly neighbours’ majlis.',
      'مجتمع سكني مسوّر يضم حدائق مشتركة وركن مكتبة ومجلسًا أسبوعيًا للجيران.');
    const rawda = comm('Al Rawda Neighbourhood', 'حي الروضة', 'Sharjah', 'Al Rawda, Sharjah', 'الروضة، الشارقة', 'open',
      'An open neighbourhood of villas and low-rise homes around a shared park and a corner mosque.',
      'حي مفتوح من الفلل والمباني المنخفضة حول حديقة مشتركة ومسجد الحي.');
    const marina = comm('Marina Heights', 'مرينا هايتس', 'Abu Dhabi', 'Al Reem Island', 'جزيرة الريم', 'gated',
      'A gated tower community on the waterfront with a residents’ clubhouse and a community garden.',
      'مجتمع أبراج مسوّر على الواجهة البحرية يضم نادي السكان وحديقة مجتمعية.');

    const user = (email, role, name, age = null, lang = 'en', interests = []) => {
      const uid = id();
      run('INSERT INTO users (id, email, pass_hash, role, display_name, status, lang, age, interests, link_code, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', uid, `${email}@team26.demo`, hash, role, name, 'active', lang, age,
        JSON.stringify(interests), role === 'student' ? newLinkCode() : null, now(), now());
      return uid;
    };
    const admin = user('admin', 'admin', 'Platform Admin');
    const layla = user('layla.mod', 'moderator', 'Layla (Moderator)', null, 'ar');
    const omar = user('omar.mod', 'moderator', 'Omar (Moderator)');
    run('INSERT INTO moderators VALUES (?,?,?)', layla, palm, now());
    run('INSERT INTO moderators VALUES (?,?,?)', layla, rawda, now());
    run('INSERT INTO moderators VALUES (?,?,?)', omar, marina, now());

    const huda = user('huda.resident', 'resident', 'Huda S.', null, 'ar');
    const newRes = user('new.resident', 'resident', 'Sami R.');
    const rashid = user('rashid.resident', 'resident', 'Rashid K.');
    const noor = user('noor.student', 'student', 'Noor_15', 15, 'ar', ['cleanup', 'gardening']);
    const yusuf = user('yusuf.student', 'student', 'Yusuf_16', 16, 'en', ['seniors', 'reading']);
    const maryam = user('maryam.student', 'student', 'Maryam_14', 14, 'en', ['pets']);
    const khalid = user('khalid.guardian', 'guardian', 'Khalid (guardian)', null, 'ar');
    const fatima = user('fatima.guardian', 'guardian', 'Fatima (guardian)');

    const member = (u, c, status = 'approved', by = null) =>
      run('INSERT INTO memberships VALUES (?,?,?,?,?,?,?,?)', id(), u, c, status, by, null, now(), now());
    member(huda, palm, 'approved', layla);
    member(rashid, rawda, 'approved', layla);
    member(noor, palm, 'approved', layla);
    member(yusuf, palm, 'approved', layla);
    member(maryam, rawda, 'approved');
    member(yusuf, rawda, 'approved');

    const link = (g, s) => run('INSERT INTO guardian_links VALUES (?,?,?,?,?,?)', id(), g, s, 'active', now(), now());
    link(khalid, noor); link(khalid, yusuf); link(fatima, maryam);

    const opp = (o) => {
      const oid = id();
      run('INSERT INTO opportunities VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', oid, o.res, o.c, o.title, o.desc, o.cat, o.loc, o.addr || null,
        o.date, o.s, o.e, o.dur, o.cap, o.age, o.req || '', o.sup, o.acc || '', o.dl, o.status, null, now(), now());
      return oid;
    };
    const garden = opp({ res: huda, c: palm, title: 'Courtyard garden planting morning', desc: 'Help neighbours plant herbs and shade flowers in the shared courtyard beds. Hand trowels and gloves are provided; we finish with cold drinks in the shade.',
      cat: 'gardening', loc: 'Palm Court central courtyard', addr: 'Building C, Courtyard 2, Palm Court', date: addDays(T, 3), s: '08:00', e: '10:00', dur: 2, cap: 4, age: 13,
      req: 'Closed shoes and a water bottle.', sup: 'Two adult residents supervise at all times; a first-aider is present.', acc: 'Step-free access; seated tasks available.', dl: addDays(T, 2), status: 'published' });
    const reading = opp({ res: huda, c: palm, title: 'Reading hour with the Palm Court seniors', desc: 'Read short stories aloud in Arabic or English to seniors in the community library corner. Conversation and tea afterwards.',
      cat: 'reading', loc: 'Palm Court library corner', date: addDays(T, 5), s: '16:30', e: '17:30', dur: 1, cap: 3, age: 14, sup: 'A resident volunteer coordinator stays in the room; the door stays open.', dl: addDays(T, 4), status: 'published' });
    opp({ res: rashid, c: rawda, title: 'Park litter pick and recycling sort', desc: 'Walk the shared park paths with grabbers and bags, then sort recyclables into the neighbourhood bins. Gloves and bags provided.',
      cat: 'cleanup', loc: 'Al Rawda shared park', date: addDays(T, 4), s: '07:30', e: '09:00', dur: 1.5, cap: 6, age: 12, sup: 'Rashid and two adult neighbours supervise in the open park.', dl: addDays(T, 3), status: 'published' });
    opp({ res: huda, c: palm, title: 'Book swap table set-up', desc: 'Help arrange donated books by age group on tables in the lobby and make simple shelf labels.',
      cat: 'events', loc: 'Palm Court lobby', date: addDays(T, 9), s: '10:00', e: '11:30', dur: 1.5, cap: 3, age: 12, sup: 'Building management staff and Huda are present throughout.', dl: addDays(T, 8), status: 'pending_review' });
    const past1 = opp({ res: huda, c: palm, title: 'Community majlis tidy-up', desc: 'Fold chairs, wipe tables and sweep the majlis hall after the Friday neighbours’ gathering.',
      cat: 'cleanup', loc: 'Palm Court majlis hall', date: addDays(T, -6), s: '18:00', e: '19:30', dur: 1.5, cap: 3, age: 12, sup: 'Adult residents supervise; light tasks only.', dl: addDays(T, -8), status: 'completed' });
    const past2 = opp({ res: huda, c: palm, title: 'Herb garden watering week', desc: 'Water and label the herb beds each evening and note which ones need replanting.',
      cat: 'gardening', loc: 'Palm Court herb beds', date: addDays(T, -2), s: '17:00', e: '18:00', dur: 1, cap: 2, age: 12, sup: 'A resident gardener is present each evening.', dl: addDays(T, -4), status: 'completed' });

    const app = (o, s, status) => {
      const aid = id();
      run('INSERT INTO applications VALUES (?,?,?,?,?,?,?,?)', aid, o, s, status, null, null, now(), now());
      return aid;
    };
    const cons = (aid, s, g, status) => run('INSERT INTO consents VALUES (?,?,?,?,?,?,?,?,?)', id(), aid, s, g, status, null, g ? now() : null, now(), now());
    const part = (aid, o, s, claimed, conf, ver, status, rev) =>
      run('INSERT INTO participation VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', id(), aid, o, s, claimed, conf, ver, status, rev, ver ? now() : null, null, now(), now());

    const a1 = app(past1, noor, 'completed'); cons(a1, noor, khalid, 'approved'); part(a1, past1, noor, 1.5, 1.5, 1.5, 'verified', layla);
    const a2 = app(past2, noor, 'completed'); cons(a2, noor, khalid, 'approved'); part(a2, past2, noor, 1, 1, null, 'pending_verification', null);
    const a3 = app(past1, yusuf, 'completed'); cons(a3, yusuf, khalid, 'approved'); part(a3, past1, yusuf, null, null, null, 'awaiting_confirmation', null);
    const a4 = app(reading, yusuf, 'pending_guardian'); cons(a4, yusuf, null, 'pending');
    const a5 = app(garden, noor, 'under_review'); cons(a5, noor, khalid, 'approved');

    run('INSERT INTO notifications VALUES (?,?,?,?,?,?,?)', id(), khalid, 'consent_requested', JSON.stringify({ title: 'Reading hour with the Palm Court seniors', student: 'Yusuf_16' }), '/guardian/consents', 0, now());
    run('INSERT INTO notifications VALUES (?,?,?,?,?,?,?)', id(), huda, 'new_application', JSON.stringify({ title: 'Courtyard garden planting morning', student: 'Noor_15' }), `/resident/opportunities/${garden}/applicants`, 0, now());
    run('INSERT INTO notifications VALUES (?,?,?,?,?,?,?)', id(), noor, 'hours_verified', JSON.stringify({ title: 'Community majlis tidy-up', hours: 1.5 }), '/student/hours', 0, now());
    run('INSERT INTO reports VALUES (?,?,?,?,?,?,?,?,?,?,?)', id(), yusuf, palm, garden, 'other', 'The meeting spot is hard to find from the main gate; please add a clearer description.', 'open', null, null, now(), now());
    run('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?)', id(), admin, 'seed.demo', 'system', null, '{}', now());
  });
}
