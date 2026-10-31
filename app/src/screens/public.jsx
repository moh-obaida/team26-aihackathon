import { useEffect, useState } from 'react';
import { api, post } from '../api.js';
import { useI18n } from '../i18n.js';
import { Icon, CATEGORY_ICON } from '../icons.jsx';
import { Link, useRouter } from '../router.jsx';
import {
  Button, CommunityCard, ConfirmDialog, DemoPeople, EmptyState, Fact, FormField, Load, LoadingState, OpportunityCard, PageHeader, SearchField,
  Section, StatusBadge, useAction, useApi, useAuth, useDemoEnter, useToast, Meta,
} from '../ui.jsx';
import { ReportSheet } from './shared.jsx';

const CATS = ['cleanup', 'gardening', 'seniors', 'reading', 'pets', 'events', 'tutoring', 'other'];
const HOME = { student: '/student', resident: '/resident', guardian: '/guardian', moderator: '/moderator', admin: '/admin' };

function HowItWorks() {
  const { t } = useI18n();
  return (
    <>
      <Section title={t('welcome.howTitle')}>
        <ol className="journey">
          {[1, 2, 3, 4, 5].map((n) => (
            <li key={n}><div><strong>{t(`welcome.step${n}`)}</strong><p className="small muted">{t(`welcome.step${n}b`)}</p></div></li>
          ))}
        </ol>
      </Section>
      <Section title={t('welcome.rolesTitle')}>
        <div className="panel-flush">
          <ul className="list">
            {['student', 'resident', 'guardian'].map((r) => (
              <li key={r} className="list-row">
                <Icon name={r === 'student' ? 'star' : r === 'resident' ? 'home' : 'shieldCheck'} />
                <div className="grow"><div className="title">{t('role.' + r)}</div><div className="sub">{t(`auth.role${r[0].toUpperCase()}${r.slice(1)}Desc`)}</div></div>
              </li>
            ))}
          </ul>
        </div>
      </Section>
      <Section title={t('welcome.safetyTitle')}>
        <div className="note"><p>{t('detail.safeguardsBody')}</p></div>
      </Section>
    </>
  );
}

export function Explore() {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const h = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(h); }, [q]);
  const params = new URLSearchParams();
  if (debounced) params.set('q', debounced);
  if (cat) params.set('category', cat);
  const data = useApi('/public/opportunities?' + params.toString());
  return (
    <>
      <PageHeader title={t('explore.title')} sub={t('explore.sub')} />
      <div className="stack">
        <SearchField value={q} onChange={setQ} placeholder={t('student.searchPlaceholder')} />
        <CategoryChips value={cat} onChange={setCat} />
        <Load q={data}>
          {(d) => d.opportunities.length === 0
            ? <EmptyState icon="search" title={debounced || cat ? t('student.noResults') : t('explore.empty')} body={debounced || cat ? t('student.noResultsBody') : t('explore.emptyBody')}
              action={debounced || cat ? <Button variant="secondary" onClick={() => { setQ(''); setCat(''); }}>{t('common.clear')}</Button> : null} />
            : <div className="cards two" aria-live="polite">{d.opportunities.map((o) => <OpportunityCard key={o.id} o={o} to={`/opportunities/${o.id}`} />)}</div>}
        </Load>
        <div className="note"><strong>{t('explore.gatedTitle')}</strong>{t('explore.gatedBody')}</div>
      </div>
    </>
  );
}

export function CategoryChips({ value, onChange }) {
  const { t } = useI18n();
  return (
    <div className="chips" role="group" aria-label={t('student.category')}>
      <button type="button" className="chip" aria-pressed={value === ''} onClick={() => onChange('')}>{t('common.all')}</button>
      {CATS.map((c) => (
        <button key={c} type="button" className="chip" aria-pressed={value === c} onClick={() => onChange(value === c ? '' : c)}>
          <Icon name={CATEGORY_ICON[c]} size={16} />{t('cat.' + c)}
        </button>
      ))}
    </div>
  );
}

export function OpportunityDetail({ params }) {
  const { t, lang, fmt } = useI18n();
  const { user } = useAuth();
  const { navigate } = useRouter();
  const toast = useToast();
  const path = `/opportunities/${params.id}`;
  const q = useApi(path);
  const [applyOpen, setApplyOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const act = useAction();
  const backTo = user?.role === 'student' ? '/student/discover' : user?.role === 'resident' ? '/resident/opportunities' : user ? HOME[user.role] : '/explore';

  return (
    <Load q={q}>
      {({ opportunity: o }) => {
        const canApply = user?.role === 'student' && o.is_member && o.status === 'published' && !o.my_application && o.eligible && o.spots_left > 0;
        const withdrawable = ['withdrawn'].includes(o.my_application);
        return (
          <>
            <PageHeader backTo={backTo} title={<bdi>{o.title}</bdi>}
              sub={<Meta className="" parts={[lang === 'ar' ? o.community?.name_ar : o.community?.name, t('common.by', { name: o.host_name })]} />} />
            <div className="row-wrap" style={{ marginBottom: 16 }}>
              <span className="badge plain teal"><Icon name={CATEGORY_ICON[o.category]} size={13} />{t('cat.' + o.category)}</span>
              <span className="badge plain">{t('common.age', { n: fmt.num(o.min_age) })}</span>
              {o.spots_left > 0 ? <span className="badge plain">{o.spots_left === 1 ? t('common.spotsOne') : t('common.spots', { n: fmt.num(o.spots_left) })}</span> : <span className="badge info">{t('common.noSpots')}</span>}
              {o.status !== 'published' && <StatusBadge kind="opp" status={o.status} />}
              {o.my_application && <StatusBadge kind="app" status={o.my_application} />}
            </div>
            <div className="wide-2">
              <div className="panel facts">
                <Fact icon="info" k={t('detail.about')} v={o.description} ugc />
                <Fact icon="calendar" k={t('detail.when')} v={`${fmt.date(o.date, { weekday: 'long', day: 'numeric', month: 'long' })}${fmt.sep}${fmt.time(o.start_time)}–${fmt.time(o.end_time)}`} />
                <Fact icon="hourglass" k={t('detail.duration')} v={t('common.hours', { n: fmt.num(o.duration_hours) })} />
                <Fact icon="pin" k={t('detail.where')} v={<><bdi>{o.general_location}</bdi><div className="xs muted">{o.exact_address ? <><strong>{t('detail.exactAddress')}: </strong><bdi>{o.exact_address}</bdi></> : t('detail.generalLocation')}</div></>} />
                <Fact icon="shieldCheck" k={t('detail.supervision')} v={o.supervision} ugc />
                {o.requirements && <Fact icon="doc" k={t('detail.requirements')} v={o.requirements} ugc />}
                {o.accessibility && <Fact icon="access" k={t('detail.accessibility')} v={o.accessibility} ugc />}
              </div>
              <div className="stack">
                <div className="note"><strong>{t('student.consentNeeded')}</strong>{t('detail.consent')}</div>
                <p className="small muted">{t('detail.deadline', { date: fmt.date(o.deadline) })}</p>
                {user?.role === 'student' && o.eligible === false && <div className="note warn">{t('student.tooYoung', { n: fmt.num(o.min_age) })}</div>}
                
                {user?.role === 'student' && o.is_member === false && <Link to="/student/communities" className="btn btn-secondary btn-block">{t('detail.joinToApply')}</Link>}
                {user?.role === 'student' && o.is_member && (canApply || withdrawable) && <Button block onClick={() => setApplyOpen(true)}>{t('detail.apply')}</Button>}
                {user?.role === 'student' && o.my_application_id && !withdrawable && (
                  <Link to={`/student/applications/${o.my_application_id}`} className="btn btn-secondary btn-block">{t('detail.yourApplication')}</Link>
                )}
                {user?.role === 'resident' && o.resident_id === user.id && (
                  <Link to={`/resident/opportunities/${o.id}/applicants`} className="btn btn-secondary btn-block">{t('manage.applicants')}</Link>
                )}
                <details className="panel small">
                  <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{t('detail.safeguards')}</summary>
                  <p style={{ marginTop: 8 }}>{t('detail.safeguardsBody')}</p>
                </details>
                {user && <Button variant="ghost" onClick={() => setReportOpen(true)}><Icon name="flag" size={18} />{t('common.report')}</Button>}
              </div>
            </div>
            <ConfirmDialog open={applyOpen} onClose={() => setApplyOpen(false)} title={t('detail.applyConfirmTitle', { title: o.title })}
              body={t('detail.applyConfirmBody')} confirmLabel={t('detail.apply')} busy={act.busy}
              onConfirm={async () => {
                const r = await act.run(() => post(`/opportunities/${o.id}/apply`, { message: msg }), { success: t('detail.applied') });
                if (r) { setApplyOpen(false); navigate(`/student/applications/${r.application_id}`); }
              }}>
              <FormField label={t('detail.applyMessage')} optional>
                {(p) => <textarea className="textarea" {...p} value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={300} dir="auto" />}
              </FormField>
              {act.error && <p className="form-error" role="alert">{act.error}</p>}
            </ConfirmDialog>
            <ReportSheet open={reportOpen} onClose={() => setReportOpen(false)} opportunityId={o.id} onSent={() => toast(t('report.sent'))} />
          </>
        );
      }}
    </Load>
  );
}

export function Communities() {
  const { t } = useI18n();
  const q = useApi('/communities');
  return (
    <>
      <PageHeader title={t('comm.title')} sub={t('comm.intro')} />
      <Load q={q}>
        {(d) => d.communities.length === 0
          ? <EmptyState icon="building" title={t('comm.empty')} body={t('comm.emptyBody')} />
          : <div className="cards two">{d.communities.map((c) => <CommunityCard key={c.id} c={c} to={`/communities/${c.id}`} />)}</div>}
      </Load>
    </>
  );
}

export function CommunityDetail({ params }) {
  const { t, lang, fmt } = useI18n();
  const { user } = useAuth();
  const q = useApi(`/communities/${params.id}`);
  return (
    <Load q={q}>
      {({ community: c }) => (
        <>
          <PageHeader backTo="/communities" title={lang === 'ar' ? c.name_ar : c.name} sub={<Meta className="" parts={[lang === 'ar' ? c.general_location_ar : c.general_location, t('emirate.' + c.emirate)]} />} />
          <div className="stack">
            <CommunityCard c={c} />
            <div className="note">{t(c.type === 'gated' ? 'comm.gatedNote' : 'comm.openNote')}</div>
            {c.type === 'open' && c.live_opportunities != null && (
              <p className="small">{t('comm.liveCount', { n: fmt.num(c.live_opportunities) })} <Link to="/explore">{t('welcome.browse')}</Link></p>
            )}
            
            {user && ['student', 'resident'].includes(user.role) && <Link to={`/${user.role}/communities`} className="btn btn-primary">{t('comm.manageMembership')}</Link>}
          </div>
        </>
      )}
    </Load>
  );
}

function LegalLinks() {
  const { t } = useI18n();
  return (
    <nav className="landing-links" aria-label={t('nav.about')}>
      <Link to="/about">{t('nav.about')}</Link><Link to="/safety">{t('nav.safety')}</Link>
      <Link to="/privacy">{t('nav.privacy')}</Link><Link to="/terms">{t('nav.terms')}</Link><Link to="/help">{t('nav.help')}</Link>
    </nav>
  );
}

function LandingLogo({ intro }) {
  const { t } = useI18n();
  return (
    <div className="landing-logo">
      {/* the wordmark carries the English tagline; Arabic gets it as text below */}
      <img src="/logo-full.png" alt={`${t('app.name')}, ${t('app.tagline')}`} width="260" height="139" />
      {intro && <p>{intro}</p>}
    </div>
  );
}

/** First screen for someone who is not signed in. */
export function Start() {
  const { t, lang, setLang } = useI18n();
  const demo = !!useApi('/demo-accounts').data;
  return (
    <div className="start-screen">
      <div className="lang-seg" role="radiogroup" aria-label={t('profile.language')}>
        <button type="button" role="radio" aria-checked={lang === 'en'} onClick={() => setLang('en')} lang="en">EN</button>
        <button type="button" role="radio" aria-checked={lang === 'ar'} onClick={() => setLang('ar')} lang="ar">العربية</button>
      </div>
      <div className="start-top">
        <img src="/logo-full.png" alt={`${t('app.name')}, ${t('app.tagline')}`} width="260" height="139" className="start-logo" />
        <h1>{t('start.title')}</h1>
        <p>{t('start.body')}</p>
      </div>
      <div className="start-scene" role="img" aria-label={t('start.sceneAlt')} />
      <div className="start-sheet">
        <ul className="start-features">
          {[['shieldCheck', 'start.f1'], ['users', 'start.f2'], ['globe', 'start.f3']].map(([ic, k]) => (
            <li key={k}><span aria-hidden="true"><Icon name={ic} size={22} /></span>{t(k)}</li>
          ))}
        </ul>
        <div className="stack">
          {demo
            ? (
              <>
                <Link to="/login" className="btn btn-signal btn-block start-cta">{t('demo.enter')}<Icon name="chev" size={18} /></Link>
                <Link to="/register" className="btn btn-secondary btn-block start-cta">{t('auth.signup')}</Link>
              </>
            )
            : (
              <>
                <Link to="/register" className="btn btn-signal btn-block start-cta">{t('start.cta')}<Icon name="chev" size={18} /></Link>
                <Link to="/login" className="btn btn-secondary btn-block start-cta">{t('auth.login')}</Link>
              </>
            )}
        </div>
        <LegalLinks />
      </div>
    </div>
  );
}

/** Demo mode: no credentials, just pick who to be. Otherwise the normal sign-in form. */
export function Login() {
  const demo = useApi('/demo-accounts');
  if (demo.loading && !demo.data) return <LoadingState rows={2} />;
  return demo.data ? <DemoEntry accounts={demo.data.accounts} /> : <PasswordLogin />;
}

function DemoEntry({ accounts }) {
  const { t } = useI18n();
  const { search } = useRouter();
  const next = new URLSearchParams(search).get('next');
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null;
  const d = useDemoEnter();
  return (
    <div className="landing" style={{ justifyContent: 'flex-start' }}>
      <div className="row"><Link to="/" className="icon-btn" aria-label={t('common.back')} style={{ color: 'var(--teal-strong)' }}><Icon name="back" /></Link></div>
      <div className="stack">
        <h1>{t('demo.pickTitle')}</h1>
        <p className="small muted">{t('demo.pickBody')}</p>
      </div>
      {d.error && <p className="form-error" role="alert">{d.error}</p>}
      <DemoPeople accounts={accounts} onPick={(email) => d.enter(email, safeNext)} busyEmail={d.who} />
      <p className="small" style={{ textAlign: 'center' }}><Link to="/register">{t('demo.newAccount')}</Link></p>
      <LegalLinks />
    </div>
  );
}

function PasswordLogin() {
  const { t, lang } = useI18n();
  const { setUser } = useAuth();
  const { navigate, search } = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const act = useAction();
  const next = new URLSearchParams(search).get('next');
  const submit = async (em = email, pw = password) => {
    const r = await act.run(() => post('/auth/login', { email: em, password: pw }));
    if (r) {
      setUser(r.user);
      navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : HOME[r.user.role], { replace: true });
    }
  };
  return (
    <div className="landing">
      <div className="row"><Link to="/" className="icon-btn" aria-label={t('common.back')} style={{ color: 'var(--teal-strong)' }}><Icon name="back" /></Link></div>
      <LandingLogo intro={`${lang === 'ar' ? t('app.tagline') + '. ' : ''}${t('auth.intro')}`} />
      <form className="panel stack" method="post" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        <h1 style={{ fontSize: 'var(--fs-l)' }}>{t('auth.login')}</h1>
        {act.error && <p className="form-error" role="alert">{act.error}</p>}
        <FormField label={t('auth.email')} error={act.fields.email}>
          {(p) => <input className="input" {...p} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" required />}
        </FormField>
        <FormField label={t('auth.password')} error={act.fields.password}>
          {(p) => <input className="input" {...p} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" required />}
        </FormField>
        <Button type="submit" variant="signal" busy={act.busy} block>{t('auth.login')}</Button>
        <Link to="/forgot-password" className="small" style={{ alignSelf: 'center' }}>{t('auth.forgot')}</Link>
        <div className="divider">{t('auth.noAccount')}</div>
        <Link to="/register" className="btn btn-secondary btn-block">{t('auth.signup')}</Link>
      </form>
      <p className="xs muted" style={{ textAlign: 'center' }}>{t('auth.demoNotice')}</p>
      <LegalLinks />
    </div>
  );
}

export function Register() {
  const { t, lang } = useI18n();
  const { setUser } = useAuth();
  const { navigate } = useRouter();
  const [f, setF] = useState({ role: 'student', email: '', password: '', display_name: '', age: '' });
  const act = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    const body = { ...f, lang, age: f.role === 'student' ? Number(f.age) || f.age : undefined };
    const r = await act.run(() => post('/auth/signup', body), { success: t('auth.created') });
    if (r) {
      setUser(r.user);
      navigate(r.user.role === 'student' ? '/student/communities' : r.user.role === 'resident' ? '/resident/verification' : '/guardian/students', { replace: true });
    }
  };
  return (
    <div className="landing" style={{ justifyContent: 'flex-start' }}>
      <div className="row">
        <Link to="/" className="icon-btn" aria-label={t('common.back')}><Icon name="back" /></Link>
        <img src="/logo-wordmark.png" alt={t('app.name')} width="86" height="40" style={{ height: 40, width: 'auto' }} />
      </div>
      <form className="panel stack" method="post" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        <h1 style={{ fontSize: 'var(--fs-l)' }}>{t('auth.signup')}</h1>
        <p className="small muted">{t('auth.demoNotice')}</p>
        {act.error && <p className="form-error" role="alert">{act.error}</p>}
        <fieldset className="stack">
          <legend>{t('auth.iAm')}</legend>
          {['student', 'resident', 'guardian'].map((r) => (
            <label key={r} className="choice">
              <input type="radio" name="role" value={r} checked={f.role === r} onChange={set('role')} />
              <span><strong>{t('role.' + r)}</strong><span className="small muted">{t(`auth.role${r[0].toUpperCase()}${r.slice(1)}Desc`)}</span></span>
            </label>
          ))}
        </fieldset>
        <FormField label={t('auth.displayName')} hint={t('auth.displayNameHint')} error={act.fields.display_name}>
          {(p) => <input className="input" {...p} value={f.display_name} onChange={set('display_name')} maxLength={40} autoComplete="nickname" dir="auto" />}
        </FormField>
        {f.role === 'student' && (
          <FormField label={t('auth.age')} hint={t('auth.ageHint')} error={act.fields.age}>
            {(p) => <input className="input" {...p} type="number" inputMode="numeric" min={12} max={17} value={f.age} onChange={set('age')} />}
          </FormField>
        )}
        <FormField label={t('auth.email')} error={act.fields.email}>
          {(p) => <input className="input" {...p} type="email" autoComplete="email" value={f.email} onChange={set('email')} dir="ltr" />}
        </FormField>
        <FormField label={t('auth.password')} hint={t('auth.passwordHint')} error={act.fields.password}>
          {(p) => <input className="input" {...p} type="password" autoComplete="new-password" value={f.password} onChange={set('password')} dir="ltr" />}
        </FormField>
        <Button type="submit" variant="signal" busy={act.busy} block>{t('auth.signup')}</Button>
        <p className="small">{t('auth.haveAccount')} <Link to="/login">{t('auth.login')}</Link></p>
        <p className="xs muted">{t('auth.termsNote')} <Link to="/terms">{t('nav.terms')}</Link>{t('common.listSep')}<Link to="/privacy">{t('nav.privacy')}</Link></p>
      </form>
    </div>
  );
}

export function ForgotPassword() {
  const { t } = useI18n();
  return (
    <div className="auth-wrap stack-l">
      <PageHeader backTo="/login" title={t('forgot.title')} />
      <div className="note warn"><strong>{t('forgot.unavailableTitle')}</strong>{t('forgot.unavailableBody')}</div>
      <p className="small">{t('forgot.demo')}</p>
      <Link to="/login" className="btn btn-primary">{t('auth.login')}</Link>
    </div>
  );
}

function ProsePage({ k, backTo = '/' }) {
  const { t } = useI18n();
  const paras = t(`page.${k}.body`).split('\n\n');
  return (
    <>
      <PageHeader backTo={backTo} title={t(`page.${k}.title`)} />
      <div className="prose">
        {paras.map((p, i) => (p.startsWith('## ')
          ? <h2 key={i}>{p.slice(3)}</h2>
          : p.startsWith('- ') ? <ul key={i}>{p.split('\n').map((li, j) => <li key={j}>{li.slice(2)}</li>)}</ul> : <p key={i}>{p}</p>))}
      </div>
    </>
  );
}
export function About() {
  const { t } = useI18n();
  const { user } = useAuth();
  return (
    <div className="stack-l">
      <LandingLogo />
      <ProsePage k="about" backTo={user ? HOME[user.role] : '/'} />
      <HowItWorks />
    </div>
  );
}
export const Safety = () => { const { user } = useAuth(); return <ProsePage k="safety" backTo={user ? HOME[user.role] : '/'} />; };
export const Privacy = () => { const { user } = useAuth(); return <ProsePage k="privacy" backTo={user ? HOME[user.role] : '/'} />; };
export const Terms = () => { const { user } = useAuth(); return <ProsePage k="terms" backTo={user ? HOME[user.role] : '/'} />; };

export function NotFound() {
  const { t } = useI18n();
  const { user } = useAuth();
  return (
    <EmptyState icon="search" title={t('route.notFoundTitle')} body={t('route.notFoundBody')}
      action={<Link className="btn btn-primary" to={user ? HOME[user.role] : '/'}>{t('route.goHome')}</Link>} />
  );
}
