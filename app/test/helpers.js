import { createApp } from '../server/app.js';
import { seed, DEMO_PASSWORD } from '../server/seed.js';
import { todayUAE, addDays } from '../server/lib.js';

export async function boot(opts = {}) {
  const app = createApp({ demo: true, authLimit: 1000, ...opts });
  seed(app.db);
  await new Promise((r) => app.server.listen(0, r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const client = () => {
    let cookie = '';
    const call = async (method, path, body, headers = {}) => {
      const res = await fetch(base + path, {
        method,
        headers: { 'content-type': 'application/json', 'x-requested-with': 'team26', ...(cookie ? { cookie } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
      const text = await res.text();
      let data; try { data = JSON.parse(text); } catch { data = text; }
      return { status: res.status, data, headers: res.headers };
    };
    return {
      get: (p) => call('GET', p), post: (p, b = {}) => call('POST', p, b), patch: (p, b) => call('PATCH', p, b), call,
      async login(name) {
        const r = await call('POST', '/api/auth/login', { email: `${name}@team26.demo`, password: DEMO_PASSWORD });
        if (r.status !== 200) throw new Error('login failed ' + name + ' ' + JSON.stringify(r.data));
        return r.data.user;
      },
    };
  };
  const id = (sql, ...a) => app.db.prepare(sql).get(...a);
  return { app, base, client, db: app.db, id, close: () => app.close(), T: todayUAE(), addDays };
}

export const oppBody = (communityId, over = {}) => ({
  title: 'Neighbourhood cleanup morning', description: 'Pick up litter along the shared paths with gloves and bags provided by the host.',
  category: 'cleanup', community_id: communityId, general_location: 'Shared garden path', date: todayUAE(), start_time: '08:00', end_time: '09:30',
  capacity: 2, min_age: 13, requirements: 'Closed shoes', supervision: 'Two adult residents supervise throughout.', accessibility: 'Step-free', deadline: todayUAE(), ...over,
});
