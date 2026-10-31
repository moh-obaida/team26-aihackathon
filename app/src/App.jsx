import { lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, patch } from './api.js';
import { dicts, I18nContext, loadLanguage, makeFormat, makeT } from './i18n.js';
import { Icon } from './icons.jsx';
import { Link, matchPath, RouterProvider, useRouter } from './router.jsx';
import { AuthCtx, Avatar, EmptyState, LoadingState, ToastHost, useApi } from './ui.jsx';
import * as Pub from './screens/public.jsx';
import * as Sh from './screens/shared.jsx';


// Each role's screens load on demand, so a student never downloads the admin console.
// After a new deploy an open tab may ask for a chunk that no longer exists: reload once to pick up the new build.
const recover = (e) => {
  try { if (!sessionStorage.getItem('jeran.reloaded')) { sessionStorage.setItem('jeran.reloaded', '1'); window.location.reload(); } } catch { /* ignore */ }
  throw e;
};
const lazyNs = (load) => new Proxy({}, { get: (_, key) => lazy(() => load().then((m) => { try { sessionStorage.removeItem('jeran.reloaded'); } catch { /* ignore */ } return { default: m[key] }; }, recover)) });
const memo = (ns) => { const c = {}; return new Proxy({}, { get: (_, k) => (c[k] ??= ns[k]) }); };
const Stu = memo(lazyNs(() => import('./screens/student.jsx')));
const Res = memo(lazyNs(() => import('./screens/resident.jsx')));
const Gua = memo(lazyNs(() => import('./screens/guardian.jsx')));
const Mod = memo(lazyNs(() => import('./screens/moderator.jsx')));
const Adm = memo(lazyNs(() => import('./screens/admin.jsx')));
const St = memo(lazyNs(() => import('./screens/settings.jsx')));

const S = ['student'];
const R = ['resident'];
const G = ['guardian'];
const M = ['moderator'];
const A = ['admin'];
const AUTH = 'auth';

// [pattern, component, access]. access: null = public, AUTH = any signed-in user, [roles].
export const ROUTES = [
  // The app opens on sign-in; everything else is behind it (legal pages and help stay readable).
  ['/', Pub.Start, null],
  ['/explore', Pub.Explore, AUTH],
  ['/opportunities/:id', Pub.OpportunityDetail, AUTH],
  ['/communities', Pub.Communities, AUTH],
  ['/communities/:id', Pub.CommunityDetail, AUTH],
  ['/login', Pub.Login, null],
  ['/register', Pub.Register, null],
  ['/forgot-password', Pub.ForgotPassword, null],
  ['/about', Pub.About, null],
  ['/safety', Pub.Safety, null],
  ['/privacy', Pub.Privacy, null],
  ['/terms', Pub.Terms, null],

  ['/student', Stu.Home, S],
  ['/student/discover', Stu.Discover, S],
  ['/student/applications', Stu.Applications, S],
  ['/student/applications/:id', Stu.ApplicationDetail, S],
  ['/student/activities', Stu.Activities, S],
  ['/student/hours', Stu.Hours, S],
  ['/student/hours/summary', Stu.HoursSummaryPrint, S],
  ['/student/history', Stu.History, S],
  ['/student/communities', Sh.MyCommunities, S],
  ['/student/profile', St.Hub, S],
  ['/student/settings', St.Hub, S],

  ['/resident', Res.Home, R],
  ['/resident/verification', Res.Verification, R],
  ['/resident/communities', Sh.MyCommunities, R],
  ['/resident/opportunities', Res.Opportunities, R],
  ['/resident/opportunities/new', Res.CreateOpportunity, R],
  ['/resident/opportunities/:id/edit', Res.EditOpportunity, R],
  ['/resident/opportunities/:id/applicants', Res.Applicants, R],
  ['/resident/opportunities/:id/participation', Res.Participation, R],
  ['/resident/history', Res.History, R],
  ['/resident/profile', St.Hub, R],
  ['/resident/settings', St.Hub, R],

  ['/guardian', Gua.Home, G],
  ['/guardian/students', Gua.Students, G],
  ['/guardian/consents', Gua.Consents, G],
  ['/guardian/consents/:id', Gua.ConsentDetail, G],
  ['/guardian/settings', St.Hub, G],

  ['/moderator', Mod.Overview, M],
  ['/moderator/memberships', Mod.Memberships, M],
  ['/moderator/memberships/:id', Mod.MembershipDetail, M],
  ['/moderator/opportunities', Mod.Opportunities, M],
  ['/moderator/hours', Mod.Hours, M],
  ['/moderator/hours/:id', Mod.HoursDetail, M],
  ['/moderator/reports', Mod.Reports, M],
  ['/moderator/reports/:id', Mod.ReportDetail, M],
  ['/moderator/community', Mod.Community, M],

  ['/admin', Adm.Overview, A],
  ['/admin/communities', Adm.Communities, A],
  ['/admin/users', Adm.Users, A],
  ['/admin/moderators', Adm.Moderators, A],
  ['/admin/reports', Adm.Reports, A],
  ['/admin/verification', Adm.Verification, A],
  ['/admin/audit', Adm.Audit, A],
  ['/admin/settings', Adm.PlatformSettings, A],

  ['/notifications', Sh.Notifications, AUTH],
  ['/profile', St.Hub, AUTH],
  ['/settings', St.Hub, AUTH],
  ['/settings/account', St.Account, AUTH],
  ['/settings/appearance', St.Appearance, AUTH],
  ['/settings/notifications', St.Notifications, AUTH],
  ['/settings/preferences', St.Preferences, ['student', 'resident']],
  ['/settings/privacy', St.Privacy, AUTH],
  ['/settings/help', St.Help, AUTH],
  ['/help', Sh.Help, null],
  ['/me/communities', Sh.MyCommunitiesRedirect, AUTH],
];

export const HOME = { student: '/student', resident: '/resident', guardian: '/guardian', moderator: '/moderator', admin: '/admin' };

const NAV = {
  public: [],
  student: [['/student', 'home', 'nav.home'], ['/student/discover', 'search', 'nav.discover'], ['/student/applications', 'inbox', 'nav.applications'], ['/student/hours', 'clock', 'nav.hours'], ['/student/settings', 'gear', 'nav.settings']],
  resident: [['/resident', 'home', 'nav.home'], ['/resident/opportunities', 'list', 'nav.requests'], ['/resident/opportunities/new', 'plus', 'nav.create', true], ['/resident/communities', 'building', 'nav.community'], ['/resident/settings', 'gear', 'nav.settings']],
  guardian: [['/guardian', 'home', 'nav.home'], ['/guardian/consents', 'shieldCheck', 'nav.consents'], ['/guardian/students', 'users', 'nav.students'], ['/guardian/settings', 'gear', 'nav.settings']],
  moderator: [['/moderator', 'home', 'nav.overview'], ['/moderator/memberships', 'inbox', 'nav.reviews'], ['/moderator/reports', 'flag', 'nav.reports'], ['/moderator/community', 'building', 'nav.community']],
  admin: [['/admin', 'chart', 'nav.overview'], ['/admin/communities', 'building', 'nav.communities'], ['/admin/users', 'users', 'nav.users'], ['/admin/reports', 'flag', 'nav.reports']],
};
const isReviewPath = (p) => /^\/moderator\/(memberships|opportunities|hours)/.test(p);

function readLang() {
  try { return (localStorage.getItem('jeran.lang') || localStorage.getItem('jiran.lang')) === 'ar' ? 'ar' : 'en'; } catch { return 'en'; }
}

export default function App() {
  return (
    <RouterProvider>
      <ToastHost>
        <Root />
      </ToastHost>
    </RouterProvider>
  );
}

function Root() {
  const [lang, setLangState] = useState(readLang);
  const [langReady, setLangReady] = useState(() => lang !== 'ar' || !!dicts.ar);
  const [user, setUser] = useState(undefined); // undefined = still checking session
  const value = useMemo(() => ({ lang, t: makeT(lang), fmt: makeFormat(lang) }), [lang, langReady]);
  // Arabic text loads on demand; switch only once it has arrived so the screen never flashes English.
  const switchLang = useCallback((l) => loadLanguage(l).then(() => { setLangState(l); setLangReady(true); }), []);
  useEffect(() => { if (!langReady) switchLang(lang); }, [langReady, lang, switchLang]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    try { localStorage.setItem('jeran.lang', lang); localStorage.removeItem('jiran.lang'); } catch { /* storage unavailable */ }
  }, [lang]);

  const refresh = useCallback(() => api('/auth/me').then((r) => setUser(r.user)).catch(() => setUser(null)), []);
  useEffect(() => { refresh(); }, [refresh]);

  const setLang = useCallback((l) => {
    switchLang(l);
    if (user) patch('/me', { lang: l }).catch(() => {});
  }, [user, switchLang]);
  const onAuth = useCallback((u) => {
    setUser(u);
    if (u?.lang) switchLang(u.lang);
  }, [switchLang]);

  if (!langReady) return null;

  return (
    <I18nContext.Provider value={{ ...value, setLang }}>
      <AuthCtx.Provider value={{ user, setUser: onAuth, refresh }}>
        <Shell />
      </AuthCtx.Provider>
    </I18nContext.Provider>
  );
}

function useOnline() {
  const [on, setOn] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true);
    const down = () => setOn(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return on;
}

function Shell() {
  const { path, navigate } = useRouter();
  const ctx = useMemo(() => ({ path }), [path]);
  return <ShellInner {...ctx} navigate={navigate} />;
}

function ShellInner({ path, navigate }) {
  const auth = useAuthValue();
  const { user } = auth;
  const i18n = useI18nValue();
  const { t, lang, setLang } = i18n;
  const online = useOnline();
  const mainRef = useRef(null);
  const scrollerRef = useRef(null);

  let match = null;
  for (const [pattern, Comp, access] of ROUTES) {
    const params = matchPath(pattern, path);
    if (params) { match = { pattern, Comp, access, params }; break; }
  }

  // Signed-in users landing on the public welcome or auth screens go to their own home.
  const redirect = user && (path === '/' || path === '/login' || path === '/register') ? HOME[user.role] : null;
  useEffect(() => { if (redirect) navigate(redirect, { replace: true }); }, [redirect, navigate]);
  const needLogin = user === null && match && match.access !== null;
  useEffect(() => { if (needLogin) navigate('/login?next=' + encodeURIComponent(path), { replace: true }); }, [needLogin, path, navigate]);

  // Canonical link and document title follow the route.
  useEffect(() => {
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); }
    link.href = window.location.origin + path;
    const h = document.querySelector('main h1');
    document.title = h && path !== '/' ? `${h.textContent.trim()} — ${t('app.name')}` : `${t('app.name')} — ${t('app.tagline')}`;
  });
  // Move focus to main content on navigation so screen readers announce the new page.
  useEffect(() => { mainRef.current?.focus({ preventScroll: true }); if (scrollerRef.current) scrollerRef.current.scrollTop = 0; }, [path]);

  const notif = useApi(user ? '/notifications' : null, [path]);
  const unread = notif.data?.unread || 0;

  const role = user ? user.role : 'public';
  const nav = NAV[role];
  const isActive = (to) => {
    if (/\/settings$/.test(to)) return path === to || path.startsWith('/settings') || path === '/profile';
    if (role === 'moderator' && to === '/moderator/memberships') return isReviewPath(path);
    return to === path || (to !== HOME[role] && to !== '/' && path.startsWith(to + '/') && !(to === '/resident/opportunities' && path === '/resident/opportunities/new'));
  };

  let content;
  if (user === undefined || redirect || needLogin) content = <LoadingState rows={2} />;
  else if (!match) content = <Pub.NotFound />;
  else if (Array.isArray(match.access) && !match.access.includes(user.role)) {
    content = (
      <EmptyState icon="lock" title={t('route.deniedTitle')} body={t('route.deniedBody')}
        action={<Link className="btn btn-primary" to={HOME[user.role]}>{t('route.goHome')}</Link>} />
    );
  } else {
    const { Comp } = match;
    content = <Suspense fallback={<LoadingState rows={2} />}><Comp params={match.params} key={match.pattern + JSON.stringify(match.params)} /></Suspense>;
  }

  const showNav = !!user && path !== '/student/hours/summary';
  const authScreen = !user && ['/', '/login', '/register', '/forgot-password'].includes(path);
  const startScreen = !user && path === '/';

  return (
    <div className="shell">
      <a href="#main" className="skip">{t('common.skip')}</a>
      <header className={`app-header ${startScreen ? 'hidden' : ''}`}>
        {!authScreen && (
          <Link to={user ? HOME[user.role] : '/'} className="brand" aria-label={`${t('app.name')}${user ? ', ' + t('nav.home') : ''}`}>
            <img src="/logo-wordmark.png" alt="" width="73" height="34" />
          </Link>
        )}
        <div className="grow" />
        <div className="lang-pill" role="group" aria-label={t('lang.switchLabel')}>
          <button type="button" lang="en" aria-pressed={lang === 'en'} onClick={() => lang !== 'en' && setLang('en')}>EN</button>
          <button type="button" lang="ar" aria-pressed={lang === 'ar'} onClick={() => lang !== 'ar' && setLang('ar')}>العربية</button>
        </div>
        {user && !nav.some(([to]) => /\/settings$/.test(to)) && (
          <Link to="/settings" className="icon-btn avatar-btn" aria-label={t('nav.settings')}>
            <Avatar user={user} size={32} />
          </Link>
        )}
        {user && (
          <Link to="/notifications" className="icon-btn" aria-label={`${t('nav.notifications')}${unread ? ', ' + t('nav.unread', { n: unread }) : ''}`}>
            <Icon name="bell" />
            {unread > 0 && <span className="dot" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
          </Link>
        )}
      </header>
      {!online && <div className="offline" role="status">{t('common.offline')}</div>}
      <div className="body" ref={scrollerRef}>
        <main id="main" ref={mainRef} tabIndex={-1} className={`${showNav ? '' : 'no-nav'} ${startScreen ? 'start' : ''}`}>
          <div className="screen" key={path}>{content}</div>
        </main>
      </div>
      {showNav && (
        <nav className="bottom-nav" aria-label={t('nav.main')}>
          {nav.map(([to, icon, label, create]) => (
            <Link key={to} to={to} aria-current={isActive(to) ? 'page' : undefined} className={create ? 'create' : ''}>
              {create ? <span className="ic-wrap"><Icon name={icon} size={20} /></span> : <Icon name={icon} />}
              <span>{t(label)}</span>
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

function useAuthValue() { return useContext(AuthCtx); }
function useI18nValue() { return useContext(I18nContext); }
