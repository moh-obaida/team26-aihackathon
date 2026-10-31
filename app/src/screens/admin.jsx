import { useEffect, useState } from 'react';
import { post } from '../api.js';
import { useI18n } from '../i18n.js';
import { Icon } from '../icons.jsx';
import { Link } from '../router.jsx';
import {
  Button, EmptyState, FormField, Load, PageHeader, ReasonDialog, SearchField, Section, Sheet, StatusBadge,
  useAction, useApi, Meta,
} from '../ui.jsx';
import { ReportDecision } from './moderator.jsx';

const EMIRATES = ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'];
const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);

export function Overview() {
  const { t, fmt } = useI18n();
  const q = useApi('/admin/analytics');
  return (
    <>
      <PageHeader title={t('admin.title')} sub={t('admin.overviewSub')} />
      <Load q={q}>
        {(d) => (
          <>
            <div className="stat-grid">
              <Link className="stat" to="/admin/users"><div className="v">{fmt.num(sum(d.users))}</div><div className="k">{t('admin.stat.users')}</div></Link>
              <Link className="stat" to="/admin/communities"><div className="v">{fmt.num(d.communities)}</div><div className="k">{t('admin.stat.communities')}</div></Link>
              <Link className="stat" to="/admin/reports"><div className="v">{fmt.num(d.open_reports)}</div><div className="k">{t('admin.stat.reports')}</div></Link>
              <div className="stat"><div className="v">{fmt.num(sum(d.opportunities))}</div><div className="k">{t('admin.stat.opps')}</div></div>
              <div className="stat"><div className="v">{fmt.num(sum(d.applications))}</div><div className="k">{t('admin.stat.apps')}</div></div>
              <Link className="stat" to="/admin/verification"><div className="v">{fmt.num(d.verified_hours)}</div><div className="k">{t('admin.stat.hours')}</div></Link>
            </div>
            <Section title={t('admin.tools')}>
              <div className="panel-flush"><ul className="list">
                {[['/admin/audit', 'history', 'nav.audit'], ['/admin/moderators', 'shield', 'nav.moderators'], ['/admin/verification', 'clock', 'nav.verificationOversight'], ['/admin/settings', 'gear', 'nav.platformSettings']].map(([to, ic, k]) => (
                  <li key={to}><Link to={to} className="list-row"><Icon name={ic} /><span className="grow"><span className="title">{t(k)}</span></span><Icon name="chev" size={18} className="chev" /></Link></li>
                ))}
              </ul></div>
            </Section>
            <div className="wide-2">
              <Breakdown title={t('admin.byRole')} data={d.users} label={(k) => t('role.' + k)} />
              <Breakdown title={t('admin.byListing')} data={d.opportunities} label={(k) => t('status.opp.' + k)} />
              <Breakdown title={t('admin.byApplication')} data={d.applications} label={(k) => t('status.app.' + k)} />
              <Breakdown title={t('admin.byHours')} data={d.participation} label={(k) => t('status.hours.' + k)} />
            </div>
          </>
        )}
      </Load>
    </>
  );
}

function Breakdown({ title, data, label }) {
  const { fmt } = useI18n();
  const entries = Object.entries(data || {});
  return (
    <Section title={title}>
      <div className="panel-flush"><ul className="list">
        {entries.length === 0 && <li className="list-row muted small">—</li>}
        {entries.map(([k, v]) => <li key={k} className="list-row" style={{ minHeight: 44 }}><span className="grow small">{label(k)}</span><strong className="num">{fmt.num(v)}</strong></li>)}
      </ul></div>
    </Section>
  );
}

export function Communities() {
  const { t, lang, fmt } = useI18n();
  const q = useApi('/admin/communities');
  const [open, setOpen] = useState(false);
  const act = useAction();
  const empty = { name: '', name_ar: '', emirate: 'Dubai', general_location: '', general_location_ar: '', type: 'gated', description: '', description_ar: '' };
  const [f, setF] = useState(empty);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggle = async (c) => { if (await act.run(() => post(`/admin/communities/${c.id}/active`, { active: !c.active }), { success: t('ok.saved') })) q.reload(); };
  const field = (k, label, input) => <FormField label={label} error={act.fields[k]}>{(p) => input(p)}</FormField>;
  return (
    <>
      <PageHeader title={t('admin.communities')} action={<Button size="sm" onClick={() => { setF(empty); setOpen(true); }}><Icon name="plus" size={16} />{t('admin.newCommunity')}</Button>} />
      <Load q={q}>
        {(d) => (
          <div className="cards two">
            {d.communities.map((c) => (
              <article key={c.id} className="panel stack">
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <div className="grow"><h3>{lang === 'ar' ? c.name_ar : c.name}</h3><p className="xs muted">{t('emirate.' + c.emirate)}{fmt.sep}{t(c.type === 'gated' ? 'comm.gated' : 'comm.open')}</p></div>
                  {c.active ? <span className="badge ok">{t('status.user.active')}</span> : <span className="badge plain">{t('admin.inactive')}</span>}
                </div>
                <p className="small">{t('admin.members', { n: fmt.num(c.members) })}</p>
                <p className="small"><strong>{t('admin.moderators')}: </strong>{c.moderators.length ? c.moderators.map((m) => m.display_name).join(t('common.listSep')) : t('admin.noModerators')}</p>
                <div className="actions">
                  <Link to="/admin/moderators" className="btn btn-secondary btn-sm">{t('admin.assignMod')}</Link>
                  <Button size="sm" variant={c.active ? 'danger' : 'secondary'} onClick={() => toggle(c)} busy={act.busy}>{c.active ? t('admin.deactivate') : t('admin.activate')}</Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </Load>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('admin.newCommunity')}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          <Button busy={act.busy} onClick={async () => { if (await act.run(() => post('/admin/communities', f), { success: t('admin.communityCreated') })) { setOpen(false); q.reload(); } }}>{t('admin.newCommunity')}</Button></>}>
        {act.error && <p className="form-error" role="alert">{act.error}</p>}
        {field('name', t('admin.nameEn'), (p) => <input className="input" {...p} value={f.name} onChange={set('name')} dir="ltr" />)}
        {field('name_ar', t('admin.nameAr'), (p) => <input className="input" {...p} value={f.name_ar} onChange={set('name_ar')} dir="rtl" lang="ar" />)}
        <div className="grid-2">
          {field('emirate', t('admin.emirate'), (p) => <select className="select" {...p} value={f.emirate} onChange={set('emirate')}>{EMIRATES.map((e) => <option key={e} value={e}>{t('emirate.' + e)}</option>)}</select>)}
          {field('type', t('admin.type'), (p) => <select className="select" {...p} value={f.type} onChange={set('type')}><option value="gated">{t('comm.gated')}</option><option value="open">{t('comm.open')}</option></select>)}
        </div>
        {field('general_location', t('admin.locationEn'), (p) => <input className="input" {...p} value={f.general_location} onChange={set('general_location')} dir="ltr" />)}
        {field('general_location_ar', t('admin.locationAr'), (p) => <input className="input" {...p} value={f.general_location_ar} onChange={set('general_location_ar')} dir="rtl" lang="ar" />)}
        {field('description', t('admin.descEn'), (p) => <textarea className="textarea" {...p} value={f.description} onChange={set('description')} dir="ltr" />)}
        {field('description_ar', t('admin.descAr'), (p) => <textarea className="textarea" {...p} value={f.description_ar} onChange={set('description_ar')} dir="rtl" lang="ar" />)}
      </Sheet>
    </>
  );
}

function useUserSearch() {
  const [q, setQ] = useState('');
  const [deb, setDeb] = useState('');
  useEffect(() => { const h = setTimeout(() => setDeb(q), 250); return () => clearTimeout(h); }, [q]);
  return { q, setQ, data: useApi('/admin/users?q=' + encodeURIComponent(deb)) };
}

const ROLES = ['student', 'resident', 'guardian', 'moderator', 'admin'];

export function Users() {
  const { t, fmt, lang } = useI18n();
  const { q, setQ, data } = useUserSearch();
  const comms = useApi('/admin/communities');
  const [role, setRole] = useState('');
  const [open, setOpen] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const act = useAction();
  const communityName = (id) => {
    const c = comms.data?.communities.find((x) => x.id === id);
    return c ? (lang === 'ar' ? c.name_ar : c.name) : '';
  };
  return (
    <>
      <PageHeader title={t('admin.users')} />
      <div className="stack">
        <SearchField value={q} onChange={setQ} placeholder={t('admin.searchUsers')} />
        <div className="chips" role="group" aria-label={t('mod.kv.role')}>
          <button type="button" className="chip" aria-pressed={role === ''} onClick={() => setRole('')}>{t('common.all')}</button>
          {ROLES.map((r) => <button key={r} type="button" className="chip" aria-pressed={role === r} onClick={() => setRole(r)}>{t('role.' + r)}</button>)}
        </div>
        <Load q={data}>
          {(d) => {
            const list = d.users.filter((u) => !role || u.role === role);
            if (!list.length) return <EmptyState icon="search" title={t('student.noResults')} body={t('student.noResultsBody')} />;
            return (
              <>
                <p className="small muted" aria-live="polite">{t('admin.userCount', { n: fmt.num(list.length) })}</p>
                <div className="panel-flush"><ul className="list">
                  {list.map((u) => (
                    <li key={u.id}>
                      <button type="button" className="list-row person-row" onClick={() => setOpen(u)} aria-haspopup="dialog">
                        <span className="initial" aria-hidden="true">{[...u.display_name][0]}</span>
                        <span className="grow">
                          <span className="title"><bdi>{u.display_name}</bdi></span>
                          <span className="sub">{t('role.' + u.role)}</span>
                          <span className="sub email">{u.email}</span>
                        </span>
                        {u.status !== 'active' && <StatusBadge kind="user" status={u.status} />}
                        <Icon name="chev" size={18} className="chev" />
                      </button>
                    </li>
                  ))}
                </ul></div>
              </>
            );
          }}
        </Load>
      </div>
      <Sheet open={!!open && !confirm} onClose={() => setOpen(null)} title={open?.display_name || ''}
        footer={open && open.role !== 'admin' ? (
          <Button variant={open.status === 'active' ? 'danger' : 'primary'} onClick={() => setConfirm(true)}>
            {open.status === 'active' ? t('admin.suspendUser') : t('admin.restoreUser')}
          </Button>
        ) : null}>
        {open && (
          <dl className="kv">
            <dt>{t('mod.kv.role')}</dt><dd>{t('role.' + open.role)}</dd>
            <dt>{t('auth.email')}</dt><dd className="email">{open.email}</dd>
            <dt>{t('mod.kv.status')}</dt><dd><StatusBadge kind="user" status={open.status} /></dd>
            <dt>{t('admin.joined')}</dt><dd>{fmt.date(open.created_at.slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
            {open.moderator_of?.length > 0 && <><dt>{t('admin.moderates')}</dt><dd>{open.moderator_of.map(communityName).join(t('common.listSep'))}</dd></>}
          </dl>
        )}
        {open?.role === 'admin' && <p className="small muted">{t('admin.adminProtected')}</p>}
      </Sheet>
      <ReasonDialog open={confirm} onClose={() => setConfirm(false)} title={open ? `${open.status === 'active' ? t('admin.suspendUser') : t('admin.restoreUser')}: ${open.display_name}` : ''}
        body={open?.status === 'active' ? t('admin.suspendBody') : t('admin.restoreBody')} confirmLabel={open?.status === 'active' ? t('admin.suspendUser') : t('admin.restoreUser')}
        tone={open?.status === 'active' ? 'danger' : 'primary'} busy={act.busy}
        onConfirm={async (reason) => {
          if (await act.run(() => post(`/admin/users/${open.id}/status`, { status: open.status === 'active' ? 'suspended' : 'active', reason }), { success: t('admin.userUpdated') })) {
            setConfirm(false); setOpen(null); data.reload();
          }
        }} />
    </>
  );
}

export function Moderators() {
  const { t, lang } = useI18n();
  const comms = useApi('/admin/communities');
  const users = useApi('/admin/users?q=');
  const act = useAction();
  const [userId, setUserId] = useState('');
  const [cid, setCid] = useState('');
  const reload = () => { comms.reload(); users.reload(); };
  const candidates = (users.data?.users || []).filter((u) => ['resident', 'moderator'].includes(u.role) && u.status === 'active');
  return (
    <>
      <PageHeader title={t('nav.moderators')} sub={t('admin.moderatorsSub')} />
      <form className="panel stack" onSubmit={async (e) => {
        e.preventDefault();
        if (await act.run(() => post('/admin/moderators', { user_id: userId, community_id: cid }), { success: t('admin.modAssigned') })) { setUserId(''); reload(); }
      }}>
        <h2 style={{ fontSize: 'var(--fs-m)' }}>{t('admin.assignMod')}</h2>
        <div className="grid-2">
          <FormField label={t('admin.pickUser')}>
            {(p) => <select className="select" {...p} value={userId} onChange={(e) => setUserId(e.target.value)}><option value="">{t('form.choose')}</option>{candidates.map((u) => <option key={u.id} value={u.id}>{u.display_name} ({t('role.' + u.role)})</option>)}</select>}
          </FormField>
          <FormField label={t('admin.pickModTarget')}>
            {(p) => <select className="select" {...p} value={cid} onChange={(e) => setCid(e.target.value)}><option value="">{t('form.choose')}</option>{(comms.data?.communities || []).map((c) => <option key={c.id} value={c.id}>{lang === 'ar' ? c.name_ar : c.name}</option>)}</select>}
          </FormField>
        </div>
        <p className="xs muted">{t('admin.assignNote')}</p>
        <Button type="submit" busy={act.busy} disabled={!userId || !cid}>{t('admin.assignMod')}</Button>
      </form>
      <Section title={t('admin.currentModerators')}>
        <Load q={comms}>
          {(d) => (
            <div className="panel-flush"><ul className="list">
              {d.communities.flatMap((c) => (c.moderators.length ? c.moderators : [null]).map((m) => (
                <li key={c.id + (m?.id || '')} className="list-row">
                  <div className="grow"><div className="title">{m ? m.display_name : t('admin.noModerators')}</div><div className="sub">{lang === 'ar' ? c.name_ar : c.name}</div></div>
                  {m && <Button size="sm" variant="danger" busy={act.busy} onClick={async () => { if (await act.run(() => post('/admin/moderators/remove', { user_id: m.id, community_id: c.id }), { success: t('admin.modRemoved') })) reload(); }}>{t('admin.removeMod')}</Button>}
                </li>
              )))}
            </ul></div>
          )}
        </Load>
      </Section>
    </>
  );
}

export function Reports() {
  const { t, fmt } = useI18n();
  const q = useApi('/admin/reports');
  const [openId, setOpenId] = useState(null);
  return (
    <>
      <PageHeader title={t('admin.reports')} sub={t('admin.reportsSub')} />
      <Load q={q}>
        {(d) => (d.reports.length === 0
          ? <EmptyState icon="flag" title={t('mod.noReports')} body={t('mod.noItemsBody')} />
          : (
            <div className="cards">
              {d.reports.map((r) => (
                <article key={r.id} className="panel stack">
                  <div className="row between"><h3>{t('repcat.' + r.category)}</h3><StatusBadge kind="report" status={r.status} /></div>
                  <p className="xs muted">{r.community || t('admin.platformWide')}{fmt.sep}{fmt.dateTime(r.created_at)}</p>
                  <p className="ugc small" dir="auto">{r.details}</p>
                  {openId === r.id
                    ? <ReportDecision r={r} base="/admin/reports" onDone={() => { setOpenId(null); q.reload(); }} />
                    : <Button variant="secondary" size="sm" onClick={() => setOpenId(r.id)}>{t('admin.handleReport')}</Button>}
                </article>
              ))}
            </div>
          ))}
      </Load>
    </>
  );
}

export function Verification() {
  const { t, lang, fmt } = useI18n();
  const [st, setSt] = useState('');
  const q = useApi('/admin/participation' + (st ? '?status=' + st : ''));
  const statuses = ['pending_verification', 'verified', 'correction_requested', 'rejected', 'awaiting_confirmation'];
  return (
    <>
      <PageHeader title={t('nav.verificationOversight')} sub={t('admin.verificationSub')} />
      <div className="chips" role="group" aria-label={t('hours.colStatus')} style={{ marginBottom: 12 }}>
        <button type="button" className="chip" aria-pressed={st === ''} onClick={() => setSt('')}>{t('common.all')}</button>
        {statuses.map((s) => <button key={s} type="button" className="chip" aria-pressed={st === s} onClick={() => setSt(s)}>{t('status.hours.' + s)}</button>)}
      </div>
      <Load q={q}>
        {(d) => (d.records.length === 0
          ? <EmptyState icon="clock" title={t('admin.noRecords')} />
          : (
            <div className="panel-flush"><ul className="list">
              {d.records.map((r) => (
                <li key={r.id} className="list-row">
                  <div className="grow">
                    <div className="title">{r.opportunity.title}</div>
                    <Meta parts={[r.student_name, lang === 'ar' ? r.opportunity.community_ar : r.opportunity.community, fmt.date(r.opportunity.date)]} />
                    <Meta parts={[`${t('hours.confirmed')}: ${r.confirmed_hours == null ? '—' : fmt.num(r.confirmed_hours)}`, `${t('hours.colVerified')}: ${r.verified_hours == null ? '—' : fmt.num(r.verified_hours)}`, r.reviewer_name]} />
                  </div>
                  <StatusBadge kind="hours" status={r.status} />
                </li>
              ))}
            </ul></div>
          ))}
      </Load>
    </>
  );
}

/** A human sentence for each audit action; the raw code stays available as a secondary line. */
function auditSentence(t, e) {
  const key = 'audit.' + e.action;
  const s = t(key, { actor: e.actor || t('admin.system') });
  return s === key ? null : s;
}

export function Audit() {
  const { t, fmt } = useI18n();
  const q = useApi('/admin/audit');
  return (
    <>
      <PageHeader title={t('admin.audit')} sub={t('admin.auditSub')} />
      <Load q={q}>
        {(d) => {
          if (d.events.length === 0) return <EmptyState icon="history" title={t('admin.auditEmpty')} />;
          const days = [];
          for (const e of d.events) {
            const day = new Date(e.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
            if (!days.length || days[days.length - 1].day !== day) days.push({ day, items: [] });
            days[days.length - 1].items.push(e);
          }
          return days.map((g) => (
            <section key={g.day} className="audit-day" aria-label={fmt.date(g.day, { weekday: 'long', day: 'numeric', month: 'long' })}>
              <h2 className="day-head">{fmt.date(g.day, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
              <ol className="panel-flush list">
                {g.items.map((e) => (
                  <li key={e.id} className="audit-row">
                    <time className="when num" dateTime={e.created_at}>{fmt.clock(e.created_at)}</time>
                    <div className="grow">
                      <div className="what">{auditSentence(t, e) || <code>{e.action}</code>}</div>
                      {e.meta?.reason && <div className="small reason" dir="auto">{e.meta.reason}</div>}
                      <div className="xs muted ltr code">{e.action}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ));
        }}
      </Load>
    </>
  );
}

export function PlatformSettings() {
  const { t, fmt } = useI18n();
  const q = useApi('/admin/settings');
  return (
    <>
      <PageHeader title={t('nav.platformSettings')} sub={t('admin.settingsSub')} />
      <Load q={q}>
        {({ settings: s }) => (
          <div className="stack-l">
            <div className="panel">
              <dl className="kv">
                <dt>{t('admin.set.demo')}</dt><dd>{s.demo_mode ? t('common.yes') : t('common.no')}</dd>
                <dt>{t('admin.set.secure')}</dt><dd>{s.secure_cookies ? t('common.yes') : t('common.no')}</dd>
                <dt>{t('admin.set.session')}</dt><dd>{t('admin.set.days', { n: fmt.num(s.session_days) })}</dd>
                <dt>{t('admin.set.maxHours')}</dt><dd>{t('common.hours', { n: fmt.num(s.max_activity_hours) })}</dd>
                <dt>{t('admin.set.ages')}</dt><dd>{fmt.num(s.student_age_range[0])}–{fmt.num(s.student_age_range[1])}</dd>
                <dt>{t('admin.set.guardians')}</dt><dd>{fmt.num(s.max_guardians_per_student)}</dd>
                <dt>{t('admin.set.rate')}</dt><dd>{fmt.num(s.auth_rate_limit_per_minute)}</dd>
              </dl>
            </div>
            <Section title={t('admin.set.rules')}>
              <div className="row-wrap">{s.safeguarding_rules.map((r) => <span key={r} className="badge bad plain">{t('safe.' + r)}</span>)}</div>
            </Section>
            <Section title={t('admin.set.categories')}>
              <div className="row-wrap">{s.categories.map((c) => <span key={c} className="badge teal plain">{t('cat.' + c)}</span>)}</div>
            </Section>
            <p className="note small">{t('admin.set.note')}</p>
          </div>
        )}
      </Load>
    </>
  );
}
