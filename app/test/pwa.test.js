import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { boot } from './helpers.js';

const pub = path.resolve(import.meta.dirname, '..', 'public');
const read = (f) => fs.readFileSync(path.join(pub, f), 'utf8');
const png = (f) => {
  const b = fs.readFileSync(path.join(pub, f));
  assert.equal(b.subarray(1, 4).toString(), 'PNG', f + ' is a PNG');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};

// ---------- manifest & icons ----------
test('manifest identifies Jeran as an installable standalone app', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.name, 'Jeran');
  assert.equal(m.short_name, 'Jeran');
  assert.equal(m.start_url, '/');
  assert.equal(m.scope, '/');
  assert.equal(m.display, 'standalone');
  assert.match(m.theme_color, /^#[0-9a-f]{6}$/i);
  assert.match(m.background_color, /^#[0-9a-f]{6}$/i);
  assert.ok(m.id);
});

test('manifest icons exist at their declared sizes (192, 512, maskable)', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  const any = m.icons.filter((i) => i.purpose === 'any');
  for (const size of [192, 512]) assert.ok(any.some((i) => i.sizes === `${size}x${size}`), `any ${size}`);
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'), 'maskable icon');
  for (const i of m.icons) {
    const { w, h } = png(i.src.slice(1));
    assert.equal(`${w}x${h}`, i.sizes, i.src);
    assert.equal(i.type, 'image/png');
  }
});

test('index.html carries the iOS and mobile web-app metadata', () => {
  const html = read('../index.html');
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /name="mobile-web-app-capable" content="yes"/);
  assert.match(html, /name="apple-mobile-web-app-title" content="Jeran"/);
  assert.match(html, /name="theme-color"/);
  const icon = /rel="apple-touch-icon" sizes="180x180" href="\/([^"]+)"/.exec(html);
  assert.ok(icon, 'apple-touch-icon link');
  assert.deepEqual(png(icon[1]), { w: 180, h: 180 });
});

// ---------- service worker ----------
function loadWorker() {
  const listeners = {};
  const store = new Map();
  const keyOf = (k) => (typeof k === 'string' ? k : new URL(k.url).pathname);
  const calls = [];
  const cache = { put: async (k, r) => { store.set(keyOf(k), r); }, addAll: async () => {} };
  const ctx = {
    self: { addEventListener: (t, f) => { listeners[t] = f; }, location: { origin: 'https://jeran.test' }, skipWaiting() {}, clients: { claim() {} } },
    caches: { open: async () => cache, match: async (k) => store.get(keyOf(k)), keys: async () => [], delete: async () => true },
    fetch: async () => { throw new Error('no fetch set'); },
    Request, Response, URL,
  };
  vm.runInNewContext(read('sw.js'), ctx);
  const res = (status, headers = {}, type = 'basic') => ({ ok: status < 400, status, type, headers: new Headers(headers), clone() { return this; }, tag: Math.random() });
  const fire = async (method, urlPath, { mode = 'cors', network } = {}) => {
    ctx.fetch = async (r) => { calls.push(keyOf(r)); if (network instanceof Error) throw network; return network; };
    let responded;
    listeners.fetch({ request: { method, url: 'https://jeran.test' + urlPath, mode }, respondWith: (p) => { responded = p; } });
    await new Promise((r) => setImmediate(r));
    return responded === undefined ? { passedThrough: true } : { passedThrough: false, response: await responded };
  };
  return { fire, store, calls, res };
}

test('service worker never touches API calls, writes or other origins', async () => {
  const sw = loadWorker();
  assert.ok((await sw.fire('GET', '/api/student/dashboard', { network: sw.res(200) })).passedThrough);
  assert.ok((await sw.fire('GET', '/api/auth/me', { mode: 'navigate', network: sw.res(200) })).passedThrough);
  assert.ok((await sw.fire('POST', '/api/applications', { network: sw.res(200) })).passedThrough);
  assert.deepEqual([...sw.store.keys()], []);
});

test('service worker does not cache error pages, no-store or private responses', async () => {
  const sw = loadWorker();
  const bad = await sw.fire('GET', '/student', { mode: 'navigate', network: sw.res(500) });
  assert.equal(bad.response.status, 500);
  await sw.fire('GET', '/icon-192.png', { network: sw.res(200, { 'cache-control': 'no-store' }) });
  await sw.fire('GET', '/logo-wordmark.png', { network: sw.res(200, { 'cache-control': 'private, max-age=60' }) });
  await sw.fire('GET', '/assets/missing.js', { network: sw.res(404) });
  assert.deepEqual([...sw.store.keys()], []);
});

test('service worker serves the cached shell only when the network fails, and refreshes it when it works', async () => {
  const sw = loadWorker();
  const shell = sw.res(200);
  const ok = await sw.fire('GET', '/student/hours', { mode: 'navigate', network: shell });
  assert.equal(ok.response, shell, 'online: network response wins');
  assert.equal(sw.store.get('/'), shell, 'shell refreshed');
  const off = await sw.fire('GET', '/guardian/consents', { mode: 'navigate', network: new TypeError('offline') });
  assert.equal(off.response, shell, 'offline: cached shell');
});

test('hashed assets are cache-first; other static files are network-first', async () => {
  const sw = loadWorker();
  const a = sw.res(200);
  await sw.fire('GET', '/assets/index-abc.js', { network: a });
  const again = await sw.fire('GET', '/assets/index-abc.js', { network: sw.res(200) });
  assert.equal(again.response, a, 'second request comes from cache');
  assert.equal(sw.calls.filter((c) => c === '/assets/index-abc.js').length, 1, 'network hit once');
  const fresh = sw.res(200);
  await sw.fire('GET', '/icon-192.png', { network: sw.res(200) });
  const r = await sw.fire('GET', '/icon-192.png', { network: fresh });
  assert.equal(r.response, fresh, 'icons prefer the network so a rebrand is not stuck');
  const off = await sw.fire('GET', '/icon-192.png', { network: new TypeError('offline') });
  assert.equal(off.response, fresh, 'offline falls back to the last good copy');
});

test('service worker is stamped per build so deploys replace the old cache', () => {
  assert.match(read('sw.js'), /__BUILD__/, 'source keeps the placeholder');
  const built = path.resolve(import.meta.dirname, '..', 'dist', 'sw.js');
  if (fs.existsSync(built)) assert.doesNotMatch(fs.readFileSync(built, 'utf8'), /__BUILD__/, 'dist worker is stamped');
});

// ---------- HTTPS and proxy behaviour ----------
test('HTTPS deployments send HSTS and redirect proxied plain-HTTP requests', async () => {
  const t = await boot({ secureCookies: true });
  try {
    const ok = await fetch(t.base + '/api/auth/me', { headers: { 'x-forwarded-proto': 'https' } });
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get('strict-transport-security'), /max-age=\d+/);
    const redirected = await fetch(t.base + '/student/hours?x=1', { headers: { 'x-forwarded-proto': 'http' }, redirect: 'manual' });
    assert.equal(redirected.status, 308);
    assert.match(redirected.headers.get('location'), /^https:\/\/127\.0\.0\.1:\d+\/student\/hours\?x=1$/);
    const direct = await fetch(t.base + '/api/auth/me');
    assert.equal(direct.status, 200, 'health checks without the proxy header are not redirected');
  } finally { t.close(); }
});

test('plain-HTTP development does not send HSTS or redirect', async () => {
  const t = await boot();
  try {
    const r = await fetch(t.base + '/api/auth/me', { headers: { 'x-forwarded-proto': 'http' } });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('strict-transport-security'), null);
  } finally { t.close(); }
});

test('TRUST_PROXY gives each client its own sign-in rate limit; without it they share the proxy address', async () => {
  const login = (base, ip) => fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'team26', 'x-forwarded-for': `203.0.113.200, ${ip}` },
    body: JSON.stringify({ email: 'nobody@team26.demo', password: 'wrong-password' }),
  }).then((r) => r.status);
  const shared = await boot({ authLimit: 2 });
  try {
    await login(shared.base, '198.51.100.1'); await login(shared.base, '198.51.100.2');
    assert.equal(await login(shared.base, '198.51.100.3'), 429, 'untrusted: one bucket for everyone');
  } finally { shared.close(); }
  const proxied = await boot({ authLimit: 2, trustProxy: true });
  try {
    await login(proxied.base, '198.51.100.1'); await login(proxied.base, '198.51.100.1');
    assert.equal(await login(proxied.base, '198.51.100.1'), 429, 'same client is still limited');
    assert.notEqual(await login(proxied.base, '198.51.100.9'), 429, 'a different client is not');
  } finally { proxied.close(); }
});
