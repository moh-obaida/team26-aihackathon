// End-to-end check of the nine-step live demo plus the installability/offline behaviour, on phone-sized viewports.
//   npm run build && npm run seed && DEMO=1 npm start      (in another terminal)
//   npm run demo:check                                       (BASE_URL=https://your-host to test a deployment)
// Drives real Chromium with touch emulation. It is NOT a test on physical iPhones/Android phones or in WebKit.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { en } from '../src/i18n.js';
import { ar } from '../src/i18n-ar.js';

const { chromium } = createRequire(import.meta.url)('playwright-core');
const BASE = (process.env.BASE_URL || 'http://localhost:8787').replace(/\/$/, '');
const SHOTS = process.env.SHOTS_DIR;
const CHROMIUM = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const PASSWORD = 'Demo#2026';
const dict = { en, ar };
const DEVICES = {
  iphone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' },
  pixel: { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36' },
};

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : '  → ' + detail}`); };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

class Session {
  constructor(browser, device, lang, tag) { this.browser = browser; this.device = device; this.lang = lang; this.tag = tag; }
  async open() {
    this.ctx = await this.browser.newContext({ ...DEVICES[this.device], baseURL: BASE, ignoreHTTPSErrors: !!process.env.INSECURE_TLS });
    await this.ctx.addInitScript((l) => { if (!localStorage.getItem('jeran.lang')) localStorage.setItem('jeran.lang', l); }, this.lang);
    this.page = await this.ctx.newPage();
    this.errors = [];
    this.page.on('pageerror', (e) => this.errors.push(e.message));
    this.page.setDefaultTimeout(15000);
  }
  // text in the language the screen is showing right now (a user's saved language wins over the browser default)
  async t(key, params = {}) {
    const lang = await this.page.evaluate(() => document.documentElement.lang);
    return (dict[lang]?.[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`);
  }
  async go(path) { await this.page.goto(path, { waitUntil: 'networkidle' }); }
  async shot(name) { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await this.page.screenshot({ path: `${SHOTS}/${this.tag}-${name}.png` }); } }
  async login(user) {
    await this.ctx.clearCookies();
    await this.go('/login');
    await this.page.getByLabel(await this.t('auth.email'), { exact: true }).fill(`${user}@team26.demo`);
    await this.page.getByLabel(await this.t('auth.password'), { exact: true }).fill(PASSWORD);
    await this.page.locator('form').getByRole('button', { name: await this.t('auth.login') }).click();
    await this.page.waitForURL((u) => !u.pathname.startsWith('/login'));
    await this.page.waitForLoadState('networkidle');
  }
  btn(name, scope) { return (scope || this.page).getByRole('button', { name, exact: true }); }
  dialog() { return this.page.locator('dialog[open]'); }
  async confirmDialog(label) { await this.btn(label, this.dialog()).click(); await this.dialog().waitFor({ state: 'detached' }).catch(() => {}); }
  async noHorizontalScroll() { return this.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1); }
}

async function demoWorkflow(browser, device, lang) {
  const tag = `${device}-${lang}`;
  const s = new Session(browser, device, lang, tag);
  await s.open();
  const step = async (n, name, fn) => {
    try { await fn(); check(`[${tag}] step ${n}: ${name}`, true); return true; }
    catch (e) { check(`[${tag}] step ${n}: ${name}`, false, e.message.split('\n')[0]); await s.shot(`FAIL-step${n}`); return false; }
  };
  const stamp = Date.now().toString(36);
  const resident = { name: lang === 'ar' ? `جارة ${stamp}` : `Neighbour ${stamp}`, email: `res.${stamp}@team26.demo` };
  const title = lang === 'ar' ? `تنظيف حديقة الحي ${stamp}` : `Courtyard tidy ${stamp}`;
  const palm = 'Palm Court Residences';

  await step(1, 'register a resident and request to join Palm Court', async () => {
    await s.go('/register');
    await s.page.locator('input[name=role][value=resident]').check();
    await s.page.getByLabel(await s.t('auth.displayName'), { exact: true }).fill(resident.name);
    await s.page.getByLabel(await s.t('auth.email'), { exact: true }).fill(resident.email);
    await s.page.getByLabel(await s.t('auth.password'), { exact: true }).fill(PASSWORD);
    await s.shot('1-register');
    await s.page.locator('form').getByRole('button', { name: await s.t('auth.signup') }).click();
    await s.page.waitForURL('**/resident/verification');
    await s.go('/resident/communities');
    const joinWord = await s.t('comm.join');
    await s.page.locator(`button[aria-label^="${joinWord}"][aria-label*="${lang === 'ar' ? ar.__palm || 'بالم' : palm}"]`).first().click();
    await s.page.waitForFunction(() => !document.querySelector('.spin'));
    await s.shot('1-requested');
  });

  await step(2, 'moderator approves the membership', async () => {
    await s.login('layla.mod');
    await s.go('/moderator/memberships');
    await s.page.locator('a.list-row', { hasText: resident.name }).first().click();
    await s.btn(await s.t('mod.approve')).click();
    await s.page.waitForURL('**/moderator/memberships');
    await s.shot('2-moderator');
  });

  await step(3, 'resident drafts a request: unsafe wording is blocked, safe wording is sent for review', async () => {
    await s.login(resident.email.replace('@team26.demo', ''));
    await s.go('/resident/opportunities/new');
    const unsafe = lang === 'ar' ? 'نحتاج متطوعين لاستخدام منشار كهربائي' : 'Volunteers will use a chainsaw to trim the trees';
    const safe = lang === 'ar' ? 'جمع الأوراق وترتيب الكراسي في الحديقة المشتركة' : 'Collect leaves and set out chairs in the shared garden';
    const fill = async (key, v) => s.page.getByLabel(await s.t(key), { exact: true }).fill(v);
    await fill('form.title', title);
    await fill('form.description', unsafe + '. ' + safe + ' together with neighbours.');
    await fill('form.generalLocation', lang === 'ar' ? 'حديقة الحي' : 'Neighbourhood garden');
    await fill('form.supervision', lang === 'ar' ? 'يشرف بالغان من الجيران طوال الوقت.' : 'Two adult neighbours supervise throughout.');
    await s.btn(await s.t('form.publish')).click();
    await s.page.locator('.form-error').waitFor();
    check(`[${tag}]   unsafe wording blocked with a reason`, true);
    await s.shot('3-blocked');
    await fill('form.description', safe + ' ' + (lang === 'ar' ? 'مع الجيران في الصباح.' : 'with neighbours in the morning.'));
    await s.btn(await s.t('form.publish')).click();
    await s.page.waitForURL((u) => /\/resident\/opportunities\/[^/]+\/applicants/.test(u.pathname));
    await s.shot('3-sent');
  });

  await step(4, 'moderator publishes the listing', async () => {
    await s.login('layla.mod');
    await s.go('/moderator/opportunities');
    const card = s.page.locator('article', { hasText: title });
    await s.btn(await s.t('mod.publish'), card).click();
    await card.waitFor({ state: 'detached' });
  });

  await step(5, 'student finds it in Discover and applies', async () => {
    await s.login('yusuf.student');
    await s.go('/student/discover');
    await s.page.locator('a.opp', { hasText: title }).first().click();
    await s.btn(await s.t('detail.apply')).click();
    await s.confirmDialog(await s.t('detail.apply'));
    await s.shot('5-applied');
  });

  await step(6, 'guardian approves participation', async () => {
    await s.login('khalid.guardian');
    await s.go('/guardian');
    const card = s.page.locator('.consent', { hasText: title });
    await card.getByRole('button', { name: await s.t('guardian.approve'), exact: true }).click();
    await s.confirmDialog(await s.t('guardian.approve'));
    await card.waitFor({ state: 'detached' });
    await s.shot('6-guardian');
  });

  await step(7, 'resident accepts, completes the activity and confirms hours', async () => {
    await s.login(resident.email.replace('@team26.demo', ''));
    await s.go('/resident/opportunities');
    await s.page.locator('a.opp', { hasText: title }).first().click();
    await s.btn(await s.t('manage.accept')).click();
    await s.page.waitForLoadState('networkidle');
    await s.btn(await s.t('manage.complete')).click();
    await s.confirmDialog(await s.t('manage.complete'));
    await s.page.waitForURL('**/participation');
    await s.btn(await s.t('manage.confirmHours')).click();
    await s.confirmDialog(await s.t('manage.confirmHours'));
    await s.page.locator('.badge', { hasText: await s.t('status.hours.pending_verification') }).first().waitFor();
    await s.shot('7-hours-confirmed');
  });

  await step(8, 'moderator verifies the hours', async () => {
    await s.login('layla.mod');
    await s.go('/moderator/hours');
    await s.page.locator('a.list-row', { hasText: title }).first().click();
    await s.shot('8-verify');
    await s.btn(await s.t('mod.verify')).click();
    await s.page.waitForURL('**/moderator/hours');
  });

  await step(9, 'student sees verified hours and can export them', async () => {
    await s.login('yusuf.student');
    const verified = await s.page.evaluate(async () => (await (await fetch('/api/student/dashboard')).json()).verified_hours);
    if (!(verified >= 1)) throw new Error('dashboard verified_hours = ' + verified);
    await s.go('/student');
    const shown = await s.page.locator('.hours-card .big').innerText();
    if (/^[0٠]$/.test(shown.trim())) throw new Error('hours card still shows zero');
    await s.shot('9-home');
    await s.go('/student/hours');
    await s.page.locator('a[href="/api/me/participation/export?format=csv"]').waitFor();
    await s.shot('9-hours');
    const csv = await s.page.evaluate(async () => { const r = await fetch('/api/me/participation/export?format=csv'); return { status: r.status, text: await r.text() }; });
    if (csv.status !== 200 || !csv.text.includes(title)) throw new Error('CSV export missing the activity');
  });

  // layout sanity on the screens people will project/hold
  for (const [path, who] of [['/student', 'yusuf.student'], ['/student/discover', null], ['/student/hours', null]]) {
    if (who) await s.login(who); await s.go(path);
    check(`[${tag}] no sideways scrolling on ${path}`, await s.noHorizontalScroll());
  }
  check(`[${tag}] no uncaught page errors`, s.errors.length === 0, s.errors[0]);
  await s.ctx.close();
}

async function pwaChecks(browser) {
  const tag = 'pwa';
  const s = new Session(browser, 'iphone', 'en', tag);
  await s.open();
  const get = (p) => s.ctx.request.get(p);

  // manifest, icons, iOS metadata
  const mr = await get('/manifest.webmanifest');
  const m = await mr.json();
  check('manifest served as application/manifest+json with name/short_name Jeran', mr.headers()['content-type']?.includes('manifest+json') && m.name === 'Jeran' && m.short_name === 'Jeran', JSON.stringify([mr.headers()['content-type'], m.name]));
  check('manifest is standalone with a brand theme colour and start_url /', m.display === 'standalone' && /^#0b4f63$/i.test(m.theme_color) && m.start_url === '/');
  for (const i of m.icons) {
    const r = await get(i.src); const b = await r.body();
    check(`icon ${i.src} (${i.purpose}) is a ${i.sizes} PNG`, r.ok() && b.subarray(1, 4).toString() === 'PNG' && `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}` === i.sizes);
  }
  await s.go('/');
  const head = await s.page.evaluate(() => ({
    touch: document.querySelector('link[rel=apple-touch-icon]')?.getAttribute('href'),
    capable: document.querySelector('meta[name=apple-mobile-web-app-capable]')?.content,
    viewport: document.querySelector('meta[name=viewport]')?.content,
  }));
  check('iOS home-screen icon, web-app-capable and viewport-fit=cover are present', head.touch === '/apple-touch-icon.png' && head.capable === 'yes' && /viewport-fit=cover/.test(head.viewport), JSON.stringify(head));
  check('apple-touch-icon is a 180×180 PNG', await (async () => { const b = await (await get('/apple-touch-icon.png')).body(); return b.readUInt32BE(16) === 180 && b.readUInt32BE(20) === 180; })());

  // service worker takes control and caches only the shell
  await s.page.evaluate(() => navigator.serviceWorker.ready);
  await s.page.reload({ waitUntil: 'networkidle' });
  check('service worker is active and controls the page', await s.page.evaluate(() => !!navigator.serviceWorker.controller));
  await s.login('yusuf.student');
  await s.go('/student/hours');
  const cached = await s.page.evaluate(async () => { const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname); return out; });
  check('service-worker cache holds no /api/ responses (no private data)', cached.length > 0 && !cached.some((p) => p.startsWith('/api/')), cached.filter((p) => p.startsWith('/api/')).join(','));
  const apiHeaders = await s.page.evaluate(async () => { const r = await fetch('/api/student/dashboard'); return r.headers.get('cache-control'); });
  check('API responses are Cache-Control: no-store', apiHeaders === 'no-store', apiHeaders);

  // offline: signed-in user is told clearly, not signed out; app recovers by itself
  await s.go('/student/hours');
  await s.ctx.setOffline(true);
  await s.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  const connTitle = en['conn.title'];
  await s.page.getByText(connTitle).waitFor();
  await s.shot('offline');
  check('offline launch shows "Can\'t reach Jeran" (not the sign-in screen)', !(await s.page.locator('form input[type=password]').count()) && await s.page.getByText(connTitle).isVisible());
  check('offline screen keeps the page URL (deep link preserved)', new URL(s.page.url()).pathname === '/student/hours');
  await s.ctx.setOffline(false);
  await s.page.getByText(connTitle).waitFor({ state: 'detached', timeout: 20000 });
  check('app reconnects by itself and returns to the same screen with the user still signed in', new URL(s.page.url()).pathname === '/student/hours' && await s.page.locator('main h1').count() > 0);

  // offline while already inside the app: banner + readable failure, then self-heal
  await s.go('/student');
  await s.ctx.setOffline(true);
  await s.page.getByText(en['common.offline']).waitFor();
  check('in-app offline banner appears', true);
  await s.page.getByRole('link', { name: en['nav.applications'] }).click().catch(() => {});
  await s.page.getByText(en['err.network']).first().waitFor();
  check('a screen that cannot load says why and offers retry', await s.page.getByRole('button', { name: en['common.retry'] }).first().isVisible());
  await s.ctx.setOffline(false);
  await s.page.getByText(en['err.network']).first().waitFor({ state: 'detached', timeout: 20000 });
  check('failed screen reloads itself when the connection returns', true);
  await s.ctx.close();

  // deep links
  const d = new Session(browser, 'pixel', 'en', 'deeplink');
  await d.open();
  await d.go('/guardian/consents');
  check('signed-out deep link goes to sign-in and remembers the destination', new URL(d.page.url()).pathname === '/login' && new URL(d.page.url()).searchParams.get('next') === '/guardian/consents');
  await d.page.getByLabel(en['auth.email'], { exact: true }).fill('khalid.guardian@team26.demo');
  await d.page.getByLabel(en['auth.password'], { exact: true }).fill(PASSWORD);
  await d.page.locator('form').getByRole('button', { name: en['auth.login'] }).click();
  await d.page.waitForURL('**/guardian/consents');
  check('after sign-in the deep link opens the requested page', true);
  await d.page.reload({ waitUntil: 'networkidle' });
  check('reloading a deep link while signed in stays on it', new URL(d.page.url()).pathname === '/guardian/consents' && await d.page.locator('main h1').count() > 0);
  const nf = await d.ctx.request.get('/assets/does-not-exist.js');
  check('missing build files are real 404s (not the app shell)', nf.status() === 404);
  const wrongRole = await d.go('/admin').then(() => d.page.locator('main').innerText());
  check('a route for another role is refused, not shown', wrongRole.includes(en['route.deniedTitle']));
  await d.ctx.close();
}

const browser = await chromium.launch({ executablePath: CHROMIUM });
try {
  await demoWorkflow(browser, 'iphone', 'en');
  await demoWorkflow(browser, 'pixel', 'ar');
  await pwaChecks(browser);
} finally { await browser.close(); }
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed against ${BASE}`);
process.exit(failed.length ? 1 : 0);
