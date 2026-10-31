import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';

export const id = () => crypto.randomUUID();
export const now = () => new Date().toISOString();

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student','resident','guardian','moderator','admin')),
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  lang TEXT NOT NULL DEFAULT 'en' CHECK (lang IN ('en','ar')),
  age INTEGER,
  interests TEXT NOT NULL DEFAULT '[]',
  link_code TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS communities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  emirate TEXT NOT NULL,
  general_location TEXT NOT NULL,
  general_location_ar TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('gated','open')),
  description TEXT NOT NULL,
  description_ar TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','members')),
  membership_policy TEXT NOT NULL CHECK (membership_policy IN ('moderator_approval','auto_approve_students')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS moderators (
  user_id TEXT NOT NULL REFERENCES users(id),
  community_id TEXT NOT NULL REFERENCES communities(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, community_id)
);
CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  community_id TEXT NOT NULL REFERENCES communities(id),
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','revoked','suspended')),
  decided_by TEXT REFERENCES users(id),
  decision_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, community_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_community ON memberships(community_id, status);
CREATE TABLE IF NOT EXISTS guardian_links (
  id TEXT PRIMARY KEY,
  guardian_id TEXT NOT NULL REFERENCES users(id),
  student_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (guardian_id, student_id)
);
CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY,
  resident_id TEXT NOT NULL REFERENCES users(id),
  community_id TEXT NOT NULL REFERENCES communities(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  general_location TEXT NOT NULL,
  exact_address TEXT,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  duration_hours REAL NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 50),
  min_age INTEGER NOT NULL CHECK (min_age BETWEEN 10 AND 18),
  requirements TEXT NOT NULL DEFAULT '',
  supervision TEXT NOT NULL,
  accessibility TEXT NOT NULL DEFAULT '',
  deadline TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','pending_review','published','full','closed','cancelled','completed')),
  review_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_opps_community ON opportunities(community_id, status, date);
CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id),
  student_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('submitted','pending_guardian','under_review','accepted','rejected','withdrawn','cancelled','completed')),
  message TEXT,
  decision_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (opportunity_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_apps_student ON applications(student_id, status);
CREATE TABLE IF NOT EXISTS consents (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL UNIQUE REFERENCES applications(id),
  student_id TEXT NOT NULL REFERENCES users(id),
  guardian_id TEXT REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','withdrawn','expired')),
  reason TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_consents_student ON consents(student_id, status);
CREATE TABLE IF NOT EXISTS participation (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL UNIQUE REFERENCES applications(id),
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id),
  student_id TEXT NOT NULL REFERENCES users(id),
  claimed_hours REAL,
  confirmed_hours REAL,
  verified_hours REAL,
  status TEXT NOT NULL CHECK (status IN ('awaiting_confirmation','pending_verification','correction_requested','verified','rejected')),
  reviewer_id TEXT REFERENCES users(id),
  verified_at TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_part_student ON participation(student_id, status);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  params TEXT NOT NULL DEFAULT '{}',
  link TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read, created_at);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id),
  community_id TEXT REFERENCES communities(id),
  opportunity_id TEXT REFERENCES opportunities(id),
  category TEXT NOT NULL CHECK (category IN ('unsafe','suspicious','misrepresentation','privacy','harassment','inappropriate','other')),
  details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','resolved','dismissed')),
  resolution TEXT,
  handled_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS moderation_actions (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES users(id),
  community_id TEXT,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
`;

export function openDb(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  // additive migrations for databases created before these columns existed
  for (const sql of [
    "ALTER TABLE users ADD COLUMN prefs TEXT NOT NULL DEFAULT '{}'",
    'ALTER TABLE sessions ADD COLUMN created_at TEXT',
    'ALTER TABLE sessions ADD COLUMN user_agent TEXT',
  ]) {
    try { db.exec(sql); } catch (e) { if (!/duplicate column/i.test(e.message)) throw e; }
  }
  return db;
}

/** Run fn inside an immediate transaction; roll back on throw. */
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
