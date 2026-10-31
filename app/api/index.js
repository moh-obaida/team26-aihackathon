// Vercel entry for the Jeran API: runs the same server as `npm start` inside a serverless function.
// vercel.json rewrites every /api/* request here as /api/index?__p=<original path>; we restore the path before routing.
// Demo hosting only: data lives in this instance's /tmp and is re-seeded on a cold start (see DEPLOY.md for a persistent host).
import { createApp } from '../server/app.js';
import { seed } from '../server/seed.js';

let app;
function instance() {
  if (!app) {
    app = createApp({ dbPath: process.env.DB_PATH || '/tmp/jeran.db', demo: process.env.DEMO !== '0', secureCookies: true, trustProxy: true, authLimit: 200 });
    if (!app.db.prepare('SELECT 1 FROM users LIMIT 1').get()) seed(app.db);
  }
  return app;
}

export default function handler(req, res) {
  const u = new URL(req.url, 'http://localhost');
  const p = u.searchParams.get('__p');
  if (p !== null) {
    u.searchParams.delete('__p');
    req.url = `/api/${p}${u.search}`;
  }
  instance().server.emit('request', req, res);
}
