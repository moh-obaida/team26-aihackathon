import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { seed } from './seed.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(root, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = process.env.DB_PATH || path.join(dataDir, 'team26.db');
const dist = path.join(root, '..', 'dist');
const { server, db } = createApp({
  dbPath,
  demo: process.env.DEMO === '1',
  secureCookies: process.env.SECURE_COOKIES === '1',
  trustProxy: process.env.TRUST_PROXY === '1',
  // Cross-origin frontend (e.g. Vercel): comma-separated list of allowed browser origins.
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  // Only needed when the frontend is on a different site (not just a different subdomain).
  crossSiteCookies: process.env.COOKIE_SAMESITE === 'none',
  staticDir: fs.existsSync(dist) ? dist : null,
});
if (!db.prepare('SELECT 1 FROM users LIMIT 1').get() && process.env.DEMO === '1') seed(db);
const port = Number(process.env.PORT || 8787);
server.listen(port, process.env.HOST || undefined, () => console.log(`Team 26 API on http://localhost:${port}${fs.existsSync(dist) ? ' (serving built app)' : ''}`));
