import { createContext, Fragment, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { api } from './api.js';
import { useI18n } from './i18n.js';
import { Icon, Seal, Skyline, CATEGORY_ICON, CATEGORY_HUE } from './icons.jsx';
import { Link } from './router.jsx';

// ---------- contexts ----------
export const AuthCtx = createContext({ user: null, setUser: () => {}, refresh: () => {} });
export const useAuth = () => useContext(AuthCtx);
export const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastHost({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((text, tone = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setItems((x) => [...x.slice(-2), { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} className={`toast ${i.tone === 'bad' ? 'bad' : ''}`}>
            <Icon name={i.tone === 'bad' ? 'alert' : 'check'} size={18} />
            <span>{i.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- data hooks ----------
export function useApi(path, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return undefined;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    api(path)
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error) => alive && setState({ data: null, error, loading: false }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { ...state, reload };
}

/** Wraps a mutating call: busy flag, double-submit guard, translated errors, field errors. */
export function useAction() {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState({});
  const [error, setError] = useState(null);
  const inflight = useRef(false);
  const run = useCallback(async (fn, { success, onError } = {}) => {
    if (inflight.current) return undefined;
    inflight.current = true;
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const r = await fn();
      if (success) toast(success);
      return r ?? true;
    } catch (e) {
      const msg = errorText(t, e);
      if (e.fields && e.code === 'validation') {
        setFields(e.fields);
        requestAnimationFrame(() => document.querySelector('[aria-invalid="true"]')?.focus());
      }
      setError(e.code === 'safeguarding_blocked'
        ? t('form.blocked', { reasons: (e.fields?.reasons || []).map((r) => t('safe.' + r)).join(t('common.listSep')) })
        : msg);
      if (e.code !== 'validation' && e.code !== 'safeguarding_blocked') toast(msg, 'bad');
      // bring the form-level message into view; it may sit above a long form
      requestAnimationFrame(() => document.querySelector('.form-error')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      onError?.(e);
      return undefined;
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }, [t, toast]);
  return { run, busy, fields, error, setError };
}

export function errorText(t, e) {
  const key = 'err.' + (e?.code || 'generic');
  const s = t(key);
  return s === key ? t('err.generic') : s;
}

// ---------- layout ----------
export function PageHeader({ title, sub, action, backTo }) {
  const { t } = useI18n();
  return (
    <div className="page-head">
      {backTo && (
        <Link to={backTo} className="icon-btn" aria-label={t('common.back')} style={{ marginInlineStart: -10 }}>
          <Icon name="back" />
        </Link>
      )}
      <div className="grow">
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/** Time-of-day greeting in UAE time. */
export function useGreeting() {
  const { t, lang } = useI18n();
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Dubai' }).format(new Date()));
  return t(h < 12 ? 'home.greet.morning' : h < 18 ? 'home.greet.afternoon' : 'home.greet.evening') + (lang === 'ar' ? '،' : ',');
}

/** Top of a home screen: the skyline sits behind the first words, so the screen opens with a sense of place. */
export function Hero({ eyebrow, title, sub, compact }) {
  return (
    <header className={`hero ${compact ? 'compact' : ''}`}>
      <Skyline />
      <div className="hero-text">
        {eyebrow && <p className="hero-eyebrow">{eyebrow}</p>}
        <h1><bdi>{title}</bdi></h1>
        {sub && <p className="hero-sub">{sub}</p>}
      </div>
    </header>
  );
}

export function Section({ title, action, children, id }) {
  const hid = useId();
  return (
    <section className="section" aria-labelledby={hid} id={id}>
      <div className="section-head">
        <h2 id={hid}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Tabs({ items, current, label, tiles }) {
  return (
    <nav className={tiles ? 'queue-tiles' : 'tabs'} aria-label={label}>
      {items.map((i) => (
        <Link key={i.to} to={i.to} aria-current={current === i.to ? 'page' : undefined}>
          {tiles && i.icon && <Icon name={i.icon} size={22} />}
          <span className="tab-label">{i.label}</span>
          {i.count ? <span className="count" aria-label={String(i.count)}>{i.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

// ---------- states ----------
export function LoadingState({ rows = 3, label }) {
  const { t } = useI18n();
  return (
    <div className="stack" aria-busy="true" role="status">
      <span className="sr-only">{label || t('common.loading')}</span>
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="skel" style={{ height: 84 }} />)}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  const { t } = useI18n();
  const notFound = error?.status === 404;
  const denied = error?.status === 403;
  if (notFound || denied) {
    return <EmptyState icon={denied ? 'lock' : 'search'} title={denied ? t('route.deniedTitle') : t('detail.notFound')} body={denied ? t('route.deniedBody') : t('detail.notFoundBody')} />;
  }
  return (
    <div className="panel error-state" role="alert">
      <Icon name="alert" />
      <div className="stack grow">
        <p>{errorText(t, error)}</p>
        {onRetry && <div><button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>{t('common.retry')}</button></div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon = 'inbox', title, body, action }) {
  return (
    <div className="empty">
      <div className="ic"><Icon name={icon} size={26} /></div>
      <h2>{title}</h2>
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}

/** Renders loading / error / children(data) consistently. */
export function Load({ q, children, rows }) {
  if (q.loading && !q.data) return <LoadingState rows={rows} />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!q.data) return null;
  return children(q.data);
}

// ---------- buttons & forms ----------
export function Button({ variant = 'primary', busy, children, className = '', size, block, ...rest }) {
  return (
    <button
      type="button"
      className={`btn btn-${variant} ${size === 'sm' ? 'btn-sm' : ''} ${block ? 'btn-block' : ''} ${className}`}
      disabled={busy || rest.disabled}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy && <span className="spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function FormField({ label, hint, error, children, optional, id: givenId }) {
  const { t } = useI18n();
  const auto = useId();
  const id = givenId || auto;
  const hintId = hint ? id + '-h' : undefined;
  const errId = error ? id + '-e' : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label} {optional && <span className="muted xs">({t('common.optional')})</span>}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? 'true' : undefined })}
      {hint && <span className="hint" id={hintId}>{hint}</span>}
      {error && <span className="err" id={errId}><Icon name="alert" size={14} />{t('fld.' + error) === 'fld.' + error ? t('fld.invalid') : t('fld.' + error)}</span>}
    </div>
  );
}

export function SearchField({ value, onChange, placeholder, label }) {
  return (
    <div className="search">
      <Icon name="search" size={20} />
      <input className="input" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label || placeholder} />
    </div>
  );
}

// ---------- dialogs ----------
/** Native <dialog> gives a real focus trap, Esc to close and an inert background. */
export function Sheet({ open, onClose, title, children, footer }) {
  const ref = useRef(null);
  const { t } = useI18n();
  const hid = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={hid}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
    >
      {open && (
        <div className="sheet-inner">
          <div className="sheet-head">
            <h2 id={hid}>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label={t('common.close')}><Icon name="x" /></button>
          </div>
          <div className="sheet-body">{children}</div>
          {footer && <div className="sheet-foot">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({ open, title, body, confirmLabel, tone = 'primary', busy, onConfirm, onClose, children, confirmDisabled }) {
  const { t } = useI18n();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant={tone} busy={busy} onClick={onConfirm} disabled={confirmDisabled}>{confirmLabel}</Button>
        </>
      }
    >
      {body && <p>{body}</p>}
      {children}
    </Sheet>
  );
}

/** Decision with a mandatory reason (moderation). */
export function ReasonDialog({ open, title, body, confirmLabel, tone = 'danger', onConfirm, onClose, busy, error, extra, required = true }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  useEffect(() => { if (open) setReason(''); }, [open]);
  const tooShort = required && reason.trim().length < 5;
  return (
    <ConfirmDialog open={open} title={title} body={body} confirmLabel={confirmLabel} tone={tone} busy={busy} onClose={onClose}
      onConfirm={() => onConfirm(reason.trim())} confirmDisabled={tooShort}>
      <FormField label={t('common.reason')} hint={required ? t('mod.reasonNeeded') : undefined} error={error} optional={!required}>
        {(p) => <textarea className="textarea" {...p} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} dir="auto" />}
      </FormField>
      {extra}
    </ConfirmDialog>
  );
}

// ---------- domain components ----------
const TONE = {
  approved: 'ok', verified: 'ok', accepted: 'ok', published: 'ok', completed: 'teal', resolved: 'ok', active: 'ok',
  pending: 'wait', pending_guardian: 'wait', pending_review: 'wait', pending_verification: 'wait', under_review: 'info',
  awaiting_confirmation: 'wait', in_review: 'info', open: 'wait', submitted: 'info', draft: 'plain', full: 'info',
  correction_requested: 'wait', closed: 'plain',
  rejected: 'bad', cancelled: 'bad', withdrawn: 'plain', revoked: 'bad', suspended: 'bad', expired: 'plain', dismissed: 'plain',
};
export function StatusBadge({ kind, status }) {
  const { t } = useI18n();
  const tone = TONE[status] || 'plain';
  return <span className={`badge ${tone}`}>{t(`status.${kind}.${status}`)}</span>;
}

export function useFmt() {
  const { fmt } = useI18n();
  return fmt;
}

export function OpportunityCard({ o, to, showStatus, flat, hostView }) {
  const { t, lang } = useI18n();
  const fmt = useFmt();
  const d = new Date(o.date + 'T12:00:00Z');
  const part = (opts) => new Intl.DateTimeFormat(fmt.locale, { ...opts, timeZone: 'UTC' }).format(d);
  const full = o.status === 'full' || o.spots_left === 0;
  return (
    <Link to={to} className={`opp ${flat ? 'flat' : ''}`} style={{ '--cat': CATEGORY_HUE[o.category] || CATEGORY_HUE.other }}>
      <div className="datetab" aria-hidden="true">
        <div className="w">{part({ weekday: 'short' })}</div>
        <div className="d num">{fmt.num(d.getUTCDate())}</div>
        <div className="m">{part({ month: 'short' })}</div>
      </div>
      <div className="opp-body">
        <div className="opp-cat"><Icon name={CATEGORY_ICON[o.category] || 'star'} size={15} />{t('cat.' + o.category)}</div>
        <h3><bdi>{o.title}</bdi></h3>
        <div className="meta">
          <span><Icon name="clock" size={15} /><span className="sr-only">{fmt.date(o.date)}{fmt.sep}</span>{fmt.time(o.start_time)}–{fmt.time(o.end_time)}</span>
          <span><Icon name="pin" size={15} /><span><bdi>{o.general_location}</bdi>{o.community && <span className="muted"> · {lang === 'ar' ? o.community.name_ar : o.community.name}</span>}</span></span>
        </div>
        <div className="opp-foot">
          <div className="row-wrap">
            {hostView
              ? <span className="badge plain">{t('resident.volunteersOf', { a: fmt.num(o.accepted_count ?? 0), b: fmt.num(o.capacity) })}</span>
              : full
                ? <span className="badge info">{t('common.noSpots')}</span>
                : o.spots_left === 1 ? <span className="badge wait">{t('common.spotsOne')}</span>
                  : <span className="badge plain">{t('common.spots', { n: fmt.num(o.spots_left) })}</span>}
            <span className="badge plain">{t('common.age', { n: fmt.num(o.min_age) })}</span>
            {o.my_application && <StatusBadge kind="app" status={o.my_application} />}
            {showStatus && <StatusBadge kind="opp" status={o.status} />}
            {o.eligible === false && <span className="badge bad">{t('student.tooYoung', { n: fmt.num(o.min_age) })}</span>}
          </div>
          <Icon name="arrow" size={18} className="go" />
        </div>
      </div>
    </Link>
  );
}

export function CommunityCard({ c, membership, action, to }) {
  const { t, lang } = useI18n();
  const name = lang === 'ar' ? c.name_ar : c.name;
  const inner = (
    <>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <h3>{name}</h3>
          <p className="muted small">{lang === 'ar' ? c.general_location_ar : c.general_location}</p>
        </div>
        <span className={`badge plain ${c.type === 'gated' ? 'info' : 'teal'}`}><Icon name={c.type === 'gated' ? 'lock' : 'globe'} size={13} />{t(c.type === 'gated' ? 'comm.gated' : 'comm.open')}</span>
      </div>
      <p className="small" style={{ marginTop: 8 }}>{lang === 'ar' ? c.description_ar : c.description}</p>
      {membership && <div style={{ marginTop: 8 }}><StatusBadge kind="membership" status={membership} /></div>}
    </>
  );
  return (
    <div className="panel stack">
      {to ? <Link to={to} style={{ textDecoration: 'none', color: 'inherit' }}>{inner}</Link> : inner}
      {action}
    </div>
  );
}

/** Application progress: applied -> guardian -> host -> completed. */
export function ApplicationTimeline({ app }) {
  const { t } = useI18n();
  const s = app.status;
  const c = app.consent_status;
  const failedAt = ['rejected', 'cancelled', 'withdrawn'].includes(s)
    ? (c === 'rejected' || c === 'withdrawn' || s === 'withdrawn' && c !== 'approved' ? 1 : 2) : -1;
  const reached = { submitted: 0, pending_guardian: 1, under_review: 2, accepted: 3, completed: 4 }[s] ?? failedAt;
  const steps = ['app.step.applied', 'app.step.guardian', 'app.step.host', 'app.step.done'];
  return (
    <ol className="timeline" aria-label={t('app.timeline')}>
      {steps.map((k, i) => {
        let st = i < reached ? 'done' : i === reached ? 'current' : 'todo';
        if (failedAt === i) st = 'failed';
        if (failedAt >= 0 && i > failedAt) st = 'todo';
        if (s === 'completed') st = 'done';
        return (
          <li key={k} className={st}>
            <span className="node"><Icon name={st === 'done' ? 'check' : st === 'failed' ? 'x' : st === 'current' ? 'hourglass' : 'clock'} size={14} /></span>
            <div>
              <div className="step-title">{t(k)}</div>
              <div className="xs muted">{t('app.step.state.' + st)}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Trust ladder for one participation record. */
export function VerificationTimeline({ r }) {
  const { t } = useI18n();
  const fmt = useFmt();
  const claimed = r.claimed_hours != null;
  const confirmed = r.confirmed_hours != null && r.status !== 'awaiting_confirmation';
  const verified = r.status === 'verified';
  const v = (n) => (n == null ? t('hours.notYet') : t('common.hours', { n: fmt.num(n) }));
  return (
    <div className="ladder">
      <div className={`rung ${claimed ? 'on' : ''}`}>
        <span className="pip"><Icon name="clock" size={15} /></span>
        <span>{t('hours.claimed')}</span><span className="val">{v(r.claimed_hours)}</span>
      </div>
      <div className={`rung ${confirmed ? 'on' : ''}`}>
        <span className="pip"><Icon name="user" size={15} /></span>
        <span>{t('hours.confirmed')}</span><span className="val">{v(confirmed ? r.confirmed_hours : null)}</span>
      </div>
      <div className={`rung ${verified ? 'on' : ''}`}>
        {verified ? <span className="seal-pip"><Seal size={36} label={t('status.hours.verified')} /></span> : <span className="pip"><Icon name="shield" size={15} /></span>}
        <span>{t('hours.verifiedStep')}</span><span className="val">{v(verified ? r.verified_hours : null)}</span>
      </div>
    </div>
  );
}

export function ParticipationRecord({ r }) {
  const { t, lang } = useI18n();
  const fmt = useFmt();
  return (
    <article className="panel stack">
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <h3><bdi>{r.opportunity.title}</bdi></h3>
          <p className="xs muted">{fmt.date(r.opportunity.date)}{fmt.sep}{lang === 'ar' ? r.opportunity.community_ar : r.opportunity.community}</p>
        </div>
        <StatusBadge kind="hours" status={r.status} />
      </div>
      <VerificationTimeline r={r} />
      {r.status === 'verified' && r.reviewer_name && <p className="xs muted">{t('hours.reviewer', { name: r.reviewer_name, date: fmt.date(r.verified_at.slice(0, 10)) })}</p>}
      {r.status === 'correction_requested' && r.note && <p className="note warn small" dir="auto">{t('hours.noteCorrection', { note: r.note })}</p>}
      {r.status === 'rejected' && r.note && <p className="note danger small" dir="auto">{t('hours.noteRejected', { note: r.note })}</p>}
      <p className="xs muted ltr">{t('hours.recordId', { id: r.id.slice(0, 8).toUpperCase() })}</p>
    </article>
  );
}

export function HoursSummary({ verified, pending, to, waitingHost = 0 }) {
  const { t } = useI18n();
  const fmt = useFmt();
  const logged = verified + pending;
  const share = logged > 0 ? Math.round((verified / logged) * 100) : 0;
  return (
    <section className="hours-card" aria-label={t('home.hoursVerified')}>
      <div className="hours-main">
        <Seal size={54} />
        <div className="grow">
          <div className="hours-figure"><span className="big num">{fmt.num(verified)}</span><span className="lbl">{t('home.hoursVerified')}</span></div>
          {logged > 0 && (
            <div className="hours-bar" role="img" aria-label={t('home.hoursPending', { n: fmt.num(pending) })}>
              <span style={{ inlineSize: `${share}%` }} />
            </div>
          )}
        </div>
      </div>
      <ul className="hours-notes">
        {pending > 0 && <li><Icon name="hourglass" size={15} />{t('home.hoursPending', { n: fmt.num(pending) })}</li>}
        {waitingHost > 0 && <li><Icon name="clock" size={15} />{t('home.hoursWithHost')} · {t('student.recordsCount', { n: fmt.num(waitingHost) })}</li>}
        {pending === 0 && waitingHost === 0 && <li className="muted">{t('home.hoursNone')}</li>}
      </ul>
      {to && <Link to={to} className="hours-link">{t('home.hoursDetails')}<Icon name="chev" size={16} className="chev" /></Link>}
    </section>
  );
}

const notifIcon = (k) => (k.startsWith('consent') || k === 'guardian_linked' ? 'shieldCheck'
  : k.startsWith('hours') || k === 'activity_completed' ? 'clock'
    : k.startsWith('membership') || k === 'moderator_assigned' ? 'building'
      : k.startsWith('report') ? 'flag'
        : k.startsWith('application') || k === 'new_application' ? 'inbox'
          : k.startsWith('opportunity') ? 'list' : 'calendar');

export function NotificationItem({ n }) {
  const { t, lang } = useI18n();
  const fmt = useFmt();
  const p = { ...n.params };
  if (lang === 'ar' && p.community_ar) p.community = p.community_ar;
  if (p.category) p.category = t('repcat.' + p.category);
  if (p.status) p.status = t('status.report.' + p.status);
  if (p.hours != null) p.hours = fmt.num(p.hours);
  const text = t('notif.' + n.kind, p);
  const body = (
    <>
      <span className="ic" aria-hidden="true" style={{ color: n.read ? 'var(--ink-3)' : 'var(--brand-green)' }}><Icon name={notifIcon(n.kind)} size={20} /></span>
      <div className="grow">
        <div className="small" dir="auto">{text}</div>
        <div className="xs muted">{fmt.dateTime(n.created_at)}</div>
      </div>
      {n.link && <Icon name="chev" size={18} className="chev" />}
    </>
  );
  return n.link
    ? <Link to={n.link} className={`list-row ${n.read ? '' : 'unread'}`}>{body}</Link>
    : <div className={`list-row ${n.read ? '' : 'unread'}`}>{body}</div>;
}

export function ReviewQueueItem({ to, title, sub, badge }) {
  return (
    <li>
      <Link to={to} className="list-row">
        <div className="grow">
          <div className="title">{title}</div>
          {sub && <div className="sub" dir="auto">{sub}</div>}
        </div>
        {badge}
        <Icon name="chev" size={18} className="chev" />
      </Link>
    </li>
  );
}

export function ConsentCard({ c, children, full }) {
  const { t, lang } = useI18n();
  const fmt = useFmt();
  const o = c.opportunity;
  const name = c.student.display_name;
  return (
    <article className="consent" style={{ '--cat': CATEGORY_HUE[o.category] || CATEGORY_HUE.other }}>
      <div className="consent-who">
        <span className="initial" aria-hidden="true">{[...name][0]}</span>
        <div className="grow">
          <p className="who"><bdi>{t('guardian.joinLine', { student: name })}</bdi></p>
          {c.student.age != null && <p className="xs muted">{t('guardian.studentAge', { n: fmt.num(c.student.age) })}</p>}
        </div>
        {c.status !== 'pending' && <StatusBadge kind="consent" status={c.status} />}
      </div>
      <div className="consent-act">
        {o.category && <div className="opp-cat"><Icon name={CATEGORY_ICON[o.category] || 'star'} size={15} />{t('cat.' + o.category)}</div>}
        <h3><bdi>{o.title}</bdi></h3>
        <p className={`small ugc ${full ? '' : 'clamp'}`} dir="auto">{o.description}</p>
        <p className="xs muted">{t('guardian.whoHosts', { name: o.host_name, community: lang === 'ar' ? o.community_ar : o.community })}</p>
      </div>
      <div className="facts">
        <Fact icon="calendar" k={t('detail.when')} v={`${fmt.date(o.date, { weekday: 'long', day: 'numeric', month: 'long' })}${fmt.sep}${fmt.time(o.start_time)}–${fmt.time(o.end_time)} (${t('common.hours', { n: fmt.num(o.duration_hours) })})`} />
        <Fact icon="pin" k={t('detail.where')} v={o.general_location} ugc />
        <Fact icon="shieldCheck" k={t('detail.supervision')} v={o.supervision} ugc />
        {o.requirements && <Fact icon="doc" k={t('detail.requirements')} v={o.requirements} ugc />}
      </div>
      {children && <div className="consent-actions">{children}</div>}
    </article>
  );
}

export function Fact({ icon, k, v, ugc }) {
  return (
    <div className="fact">
      <Icon name={icon} size={20} />
      <div>
        <div className="k">{k}</div>
        <div className={ugc ? 'ugc' : ''} dir={ugc ? 'auto' : undefined}>{v}</div>
      </div>
    </div>
  );
}

/** Secondary metadata line. Each part is bidi-isolated so Arabic names never scramble English dates. */
export function Meta({ parts, className = 'sub' }) {
  const { fmt } = useI18n();
  const items = parts.filter((p) => p !== null && p !== undefined && p !== false && p !== '');
  return (
    <span className={className}>
      {items.map((p, i) => <Fragment key={i}>{i > 0 && <span aria-hidden="true">{fmt.sep}</span>}<bdi>{p}</bdi></Fragment>)}
    </span>
  );
}

export const AVATARS = { lime: '#5fae1f', green: '#1fa453', teal: '#0f8f92', deep: '#0b4f63', sand: '#a0763a' };

export function Avatar({ user, size = 48 }) {
  const color = AVATARS[user.prefs?.avatar] || AVATARS.deep;
  return (
    <span className="avatar" aria-hidden="true" style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}>
      {[...user.display_name][0]}
    </span>
  );
}

