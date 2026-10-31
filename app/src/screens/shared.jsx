import { useEffect, useState } from 'react';
import { patch, post } from '../api.js';
import { useI18n } from '../i18n.js';
import { Icon } from '../icons.jsx';
import { Link, useRouter } from '../router.jsx';
import {
  Button, CommunityCard, EmptyState, FormField, Load, NotificationItem, PageHeader, Section, Sheet, StatusBadge,
  useAction, useApi, useAuth, Meta,
} from '../ui.jsx';

const CATS = ['cleanup', 'gardening', 'seniors', 'reading', 'pets', 'events', 'tutoring', 'other'];
const REPORT_CATS = ['unsafe', 'suspicious', 'misrepresentation', 'privacy', 'harassment', 'inappropriate', 'other'];
const SETTINGS = { student: '/student/settings', resident: '/resident/settings', guardian: '/guardian/settings' };

export function ReportSheet({ open, onClose, opportunityId, communityId, onSent }) {
  const { t } = useI18n();
  const [category, setCategory] = useState('unsafe');
  const [details, setDetails] = useState('');
  const act = useAction();
  useEffect(() => { if (open) { setDetails(''); setCategory('unsafe'); } }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title={t('report.title')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button busy={act.busy} disabled={details.trim().length < 10} onClick={async () => {
          const r = await act.run(() => post('/reports', { category, details, opportunity_id: opportunityId, community_id: communityId }));
          if (r) { onSent?.(); onClose(); }
        }}>{t('report.send')}</Button></>}>
      <p className="note danger small">{t('report.emergency')}</p>
      <FormField label={t('report.category')}>
        {(p) => <select className="select" {...p} value={category} onChange={(e) => setCategory(e.target.value)}>{REPORT_CATS.map((c) => <option key={c} value={c}>{t('repcat.' + c)}</option>)}</select>}
      </FormField>
      <FormField label={t('report.details')} hint={t('report.detailsHint')} error={act.fields.details}>
        {(p) => <textarea className="textarea" {...p} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} dir="auto" />}
      </FormField>
      {act.error && <p className="form-error" role="alert">{act.error}</p>}
    </Sheet>
  );
}

export function Notifications() {
  const { t } = useI18n();
  const q = useApi('/notifications');
  const act = useAction();
  return (
    <>
      <PageHeader title={t('notif.title')} action={q.data?.unread ? <Button variant="ghost" size="sm" busy={act.busy} onClick={async () => { if (await act.run(() => post('/notifications/read'))) q.reload(); }}>{t('notif.markRead')}</Button> : null} />
      <Load q={q}>
        {(d) => (d.notifications.length === 0
          ? <EmptyState icon="bell" title={t('notif.empty')} body={t('notif.emptyBody')} />
          : <div className="panel-flush"><ul className="list">{d.notifications.map((n) => <li key={n.id}><NotificationItem n={n} /></li>)}</ul></div>)}
      </Load>
    </>
  );
}

const MEMBERSHIP_LABEL = { approved: 'comm.joined', pending: 'comm.pending', rejected: 'comm.rejected', suspended: 'comm.suspended', revoked: 'comm.revoked' };

export function MyCommunities() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const all = useApi('/communities');
  const mine = useApi('/memberships/mine');
  const act = useAction();
  const join = async (c) => {
    const r = await act.run(() => post(`/communities/${c.id}/join`));
    if (r) mine.reload();
    return r;
  };
  const [msg, setMsg] = useState(null);
  return (
    <>
      <PageHeader title={t(user.role === 'resident' ? 'nav.community' : 'nav.communities')} sub={t('comm.intro')} />
      {user.role === 'resident' && <p className="note small" style={{ marginBottom: 16 }}>{t('resident.notVerifiedBody')}</p>}
      {msg && <p className="note small" role="status" style={{ marginBottom: 16 }}>{msg}</p>}
      <Load q={all}>
        {(d) => (
          <Load q={mine}>
            {(m) => {
              const map = Object.fromEntries(m.memberships.map((x) => [x.community_id, x]));
              const sorted = [...d.communities].sort((a, b) => (map[b.id] ? 1 : 0) - (map[a.id] ? 1 : 0));
              return (
                <div className="cards two">
                  {sorted.map((c) => {
                    const ms = map[c.id];
                    const canJoin = !ms || ms.status === 'rejected';
                    const instant = user.role === 'student' && c.type === 'open';
                    return (
                      <CommunityCard key={c.id} c={c} membership={ms?.status} to={`/communities/${c.id}`}
                        action={
                          <>
                            {ms?.status === 'rejected' && ms.decision_reason && <p className="xs muted" dir="auto">{t('verification.reason', { reason: ms.decision_reason })}</p>}
                            {canJoin
                              ? <Button busy={act.busy} aria-label={`${ms ? t('comm.reapply') : instant ? t('comm.joinOpen') : t('comm.join')}: ${lang === 'ar' ? c.name_ar : c.name}`} onClick={async () => { const r = await join(c); if (r) setMsg(t(r.status === 'approved' ? 'comm.joinedNow' : 'comm.requested')); }}>
                                {ms ? t('comm.reapply') : instant ? t('comm.joinOpen') : t('comm.join')}
                              </Button>
                              : <p className="small muted">{t(MEMBERSHIP_LABEL[ms.status])}</p>}
                            {canJoin && <p className="xs muted">{t(c.type === 'gated' ? 'comm.gatedNote' : 'comm.openNote')}</p>}
                          </>
                        } />
                    );
                  })}
                </div>
              );
            }}
          </Load>
        )}
      </Load>
    </>
  );
}

export function MyCommunitiesRedirect() {
  const { user } = useAuth();
  const { navigate } = useRouter();
  useEffect(() => {
    const to = { student: '/student/communities', resident: '/resident/verification', moderator: '/moderator', guardian: '/guardian', admin: '/admin/communities' }[user.role];
    navigate(to, { replace: true });
  }, [user, navigate]);
  return null;
}

export function Profile() {
  const { t, fmt } = useI18n();
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user.display_name);
  const act = useAction();
  const dash = useApi(user.role === 'student' ? '/student/dashboard' : null);
  const reports = useApi('/reports/mine');
  const { navigate } = useRouter();
  return (
    <>
      <PageHeader title={t('profile.title')} sub={<Meta className="" parts={[t('role.' + user.role), <span className="email" key="e">{user.email}</span>]} />} />
      <div className="stack-l">
        <form className="panel stack" onSubmit={async (e) => {
          e.preventDefault();
          const r = await act.run(() => patch('/me', { display_name: name }), { success: t('profile.saved') });
          if (r) setUser(r.user);
        }}>
          <FormField label={t('profile.name')} hint={t('auth.displayNameHint')} error={act.fields.display_name}>
            {(p) => <input className="input" {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} dir="auto" />}
          </FormField>
          <Button type="submit" variant="secondary" busy={act.busy} disabled={name === user.display_name}>{t('common.save')}</Button>
        </form>
        {user.role === 'student' && (
          <div className="panel stack">
            <h2 style={{ fontSize: 'var(--fs-m)' }}>{t('profile.linkCode')}</h2>
            <div className="code-box" aria-label={t('profile.linkCode')}>{user.link_code}</div>
            <p className="small muted">{t('profile.linkCodeHint')}</p>
            {dash.data && <p className="small"><Icon name="link" size={16} /> {t('profile.guardians', { n: fmt.num(dash.data.guardians) })}</p>}
          </div>
        )}
        {user.role === 'moderator' && <p className="note small">{t('profile.moderatesFor', { n: fmt.num(user.moderator_of?.length || 0) })}</p>}
        <div className="panel-flush"><ul className="list">
          <li><Link to={SETTINGS[user.role] || '/settings'} className="list-row"><Icon name="gear" /><span className="grow">{t('nav.settings')}</span><Icon name="chev" size={18} className="chev" /></Link></li>
          {user.role === 'student' && <li><Link to="/student/communities" className="list-row"><Icon name="building" /><span className="grow">{t('nav.communities')}</span><Icon name="chev" size={18} className="chev" /></Link></li>}
          {user.role === 'student' && <li><Link to="/student/activities" className="list-row"><Icon name="calendar" /><span className="grow">{t('nav.activities')}</span><Icon name="chev" size={18} className="chev" /></Link></li>}
          {user.role === 'student' && <li><Link to="/student/history" className="list-row"><Icon name="history" /><span className="grow">{t('nav.history')}</span><Icon name="chev" size={18} className="chev" /></Link></li>}
          {user.role === 'resident' && <li><Link to="/resident/verification" className="list-row"><Icon name="shieldCheck" /><span className="grow">{t('nav.verification')}</span><Icon name="chev" size={18} className="chev" /></Link></li>}
          {user.role === 'resident' && <li><Link to="/resident/history" className="list-row"><Icon name="history" /><span className="grow">{t('nav.history')}</span><Icon name="chev" size={18} className="chev" /></Link></li>}
          <li><Link to="/notifications" className="list-row"><Icon name="bell" /><span className="grow">{t('nav.notifications')}</span><Icon name="chev" size={18} className="chev" /></Link></li>
          <li><Link to="/help" className="list-row"><Icon name="help" /><span className="grow">{t('nav.help')}</span><Icon name="chev" size={18} className="chev" /></Link></li>
        </ul></div>
        <Section title={t('report.mine')}>
          <Load q={reports} rows={1}>
            {(d) => (d.reports.length === 0
              ? <p className="small muted">{t('report.none')}</p>
              : <div className="panel-flush"><ul className="list">{d.reports.map((r) => (
                <li key={r.id} className="list-row"><div className="grow"><div className="title">{t('repcat.' + r.category)}</div><div className="sub">{fmt.dateTime(r.created_at)}</div></div><StatusBadge kind="report" status={r.status} /></li>
              ))}</ul></div>)}
          </Load>
        </Section>
        <div className="panel stack">
          <h2 style={{ fontSize: 'var(--fs-m)' }}>{t('profile.privacy')}</h2>
          <p className="small">{t('profile.privacyBody')}</p>
          <Link to="/privacy" className="small">{t('nav.privacy')}</Link>
        </div>
        <Button variant="danger" onClick={async () => { await post('/auth/logout').catch(() => {}); setUser(null); navigate('/', { replace: true }); }}>
          <Icon name="logout" size={18} />{t('auth.logout')}
        </Button>
      </div>
    </>
  );
}

export function Settings() {
  const { t, lang, setLang } = useI18n();
  const { user, setUser } = useAuth();
  const [interests, setInterests] = useState(user.interests || []);
  const act = useAction();
  const { navigate } = useRouter();
  return (
    <>
      <PageHeader title={t('nav.settings')} />
      <div className="stack-l">
        <fieldset className="panel stack">
          <legend style={{ marginBottom: 8 }}>{t('profile.language')}</legend>
          {[['en', 'English'], ['ar', 'العربية']].map(([code, label]) => (
            <label key={code} className="choice">
              <input type="radio" name="lang" checked={lang === code} onChange={() => setLang(code)} />
              <span lang={code}><strong>{label}</strong></span>
            </label>
          ))}
        </fieldset>
        {user.role === 'student' && (
          <fieldset className="panel stack">
            <legend style={{ marginBottom: 8 }}>{t('profile.interests')}</legend>
            <p className="small muted">{t('profile.interestsHint')}</p>
            <div className="chips" style={{ flexWrap: 'wrap' }}>
              {CATS.map((c) => (
                <button key={c} type="button" className="chip" aria-pressed={interests.includes(c)}
                  onClick={() => setInterests(interests.includes(c) ? interests.filter((x) => x !== c) : [...interests, c])}>{t('cat.' + c)}</button>
              ))}
            </div>
            <Button variant="secondary" busy={act.busy} onClick={async () => { const r = await act.run(() => patch('/me', { interests }), { success: t('profile.saved') }); if (r) setUser(r.user); }}>{t('common.save')}</Button>
          </fieldset>
        )}
        <div className="panel stack">
          <h2 style={{ fontSize: 'var(--fs-m)' }}>{t('profile.safety')}</h2>
          <p className="small">{t('common.emergency')}</p>
          <Link to="/safety" className="small">{t('nav.safety')}</Link>
        </div>
        <Button variant="danger" onClick={async () => { await post('/auth/logout').catch(() => {}); setUser(null); navigate('/', { replace: true }); }}>
          <Icon name="logout" size={18} />{t('auth.logout')}
        </Button>
      </div>
    </>
  );
}

export function Help() {
  const { t } = useI18n();
  const { user } = useAuth();
  const items = [1, 2, 3, 4, 5, 6];
  return (
    <>
      <PageHeader title={t('help.title')} sub={t('help.sub')} />
      <div className="stack">
        {items.map((n) => (
          <details key={n} className="panel">
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{t(`help.q${n}`)}</summary>
            <p className="small" style={{ marginTop: 8 }}>{t(`help.a${n}`)}</p>
          </details>
        ))}
        <p className="note danger small">{t('common.emergency')}</p>
        <div className="row-wrap small">
          <Link to="/safety">{t('nav.safety')}</Link><Link to="/privacy">{t('nav.privacy')}</Link><Link to="/terms">{t('nav.terms')}</Link><Link to="/about">{t('nav.about')}</Link>
        </div>
        {!user && <Link to="/login" className="btn btn-primary">{t('auth.login')}</Link>}
      </div>
    </>
  );
}
