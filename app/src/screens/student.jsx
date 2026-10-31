import { useEffect, useMemo, useState } from 'react';
import { post } from '../api.js';
import { useI18n } from '../i18n.js';
import { Icon } from '../icons.jsx';
import { Link, useRouter } from '../router.jsx';
import {
  ApplicationTimeline, Button, ConfirmDialog, EmptyState, Fact, FormField, HoursSummary, Load, NotificationItem,
  OpportunityCard, PageHeader, ParticipationRecord, SearchField, Section, Sheet, StatusBadge, useAction, useApi, useAuth,
  VerificationTimeline, Meta,
} from '../ui.jsx';
import { CategoryChips } from './public.jsx';

const ACTIVE = ['submitted', 'pending_guardian', 'under_review', 'accepted'];

function NextRow({ to, icon, title, sub }) {
  return (
    <li>
      <Link to={to} className="list-row">
        <span aria-hidden="true" style={{ color: 'var(--saffron-ink)' }}><Icon name={icon} /></span>
        <div className="grow"><div className="title">{title}</div><div className="sub">{sub}</div></div>
        <Icon name="chev" size={18} className="chev" />
      </Link>
    </li>
  );
}

export function Home() {
  const { t, fmt } = useI18n();
  const { user } = useAuth();
  const q = useApi('/student/dashboard');
  const notifs = useApi('/notifications');
  return (
    <Load q={q} rows={4}>
      {(d) => {
        const approved = d.memberships.some((m) => m.status === 'approved');
        const needs = [
          ...d.awaiting_guardian.map((a) => ({ to: `/student/applications/${a.id}`, icon: 'shieldCheck', title: a.opportunity.title, sub: t('home.awaitGuardian') })),
          ...d.under_review.map((a) => ({ to: `/student/applications/${a.id}`, icon: 'hourglass', title: a.opportunity.title, sub: t('home.awaitHost') })),
        ];
        return (
          <>
            <PageHeader title={t('home.hello', { name: user.display_name })} />
            <HoursSummary verified={d.verified_hours} pending={d.pending_hours} to="/student/hours" />
            {(!approved || d.guardians === 0) && (
              <div className="stack" style={{ marginTop: 16 }}>
                {!approved && (
                  <Link to="/student/communities" className="next-action">
                    <span className="ic"><Icon name="building" /></span>
                    <span className="grow"><span className="title">{t('home.joinCommunity')}</span><br /><span className="sub">{t('home.joinCommunityBody')}</span></span>
                    <Icon name="chev" className="chev" />
                  </Link>
                )}
                {d.guardians === 0 && (
                  <Link to="/settings/privacy" className="next-action">
                    <span className="ic"><Icon name="link" /></span>
                    <span className="grow"><span className="title">{t('home.linkGuardian')}</span><br /><span className="sub">{t('home.linkGuardianBody')}</span></span>
                    <Icon name="chev" className="chev" />
                  </Link>
                )}
              </div>
            )}
            <Section title={t('home.needsYou')}>
              {needs.length === 0 && d.awaiting_resident === 0
                ? <p className="muted small">{t('home.nothingNeeded')}</p>
                : (
                  <div className="panel-flush"><ul className="list">
                    {needs.map((n) => <NextRow key={n.to} {...n} />)}
                    {d.awaiting_resident > 0 && <NextRow to="/student/hours" icon="clock" title={t('home.awaitHostConfirm')} sub={t('student.recordsCount', { n: fmt.num(d.awaiting_resident) })} />}
                  </ul></div>
                )}
            </Section>
            <Section title={t('home.upcoming')} action={<Link to="/student/activities" className="small">{t('common.viewAll')}</Link>}>
              {d.upcoming.length === 0
                ? <EmptyState icon="calendar" title={t('home.noUpcomingTitle')} body={t('home.noUpcoming')} action={approved ? <Link className="btn btn-primary" to="/student/discover">{t('home.findActivities')}</Link> : null} />
                : <div className="cards">{d.upcoming.map((a) => <OpportunityCard key={a.id} o={a.opportunity} to={`/student/applications/${a.id}`} />)}</div>}
            </Section>
            <Section title={t('home.recent')} action={<Link to="/notifications" className="small">{t('common.viewAll')}</Link>}>
              <Load q={notifs} rows={1}>
                {(n) => n.notifications.length === 0
                  ? <p className="muted small">{t('notif.emptyBody')}</p>
                  : <div className="panel-flush"><ul className="list">{n.notifications.slice(0, 3).map((x) => <li key={x.id}><NotificationItem n={x} /></li>)}</ul></div>}
              </Load>
            </Section>
          </>
        );
      }}
    </Load>
  );
}

export function Discover() {
  const { t, lang } = useI18n();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [f, setF] = useState({ category: '', community_id: '', date: '', location: '', eligible: true, available: false });
  const [draft, setDraft] = useState(f);
  const [open, setOpen] = useState(false);
  useEffect(() => { const h = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(h); }, [q]);
  const params = new URLSearchParams();
  if (debounced) params.set('q', debounced);
  for (const k of ['category', 'community_id', 'date', 'location']) if (f[k]) params.set(k, f[k]);
  if (f.eligible) params.set('eligible', '1');
  if (f.available) params.set('available', '1');
  const data = useApi('/opportunities?' + params.toString());
  const communities = useApi('/communities');
  const mine = useApi('/memberships/mine');
  const myCommunities = useMemo(() => {
    const ids = new Set((mine.data?.memberships || []).filter((m) => m.status === 'approved').map((m) => m.community_id));
    return (communities.data?.communities || []).filter((c) => ids.has(c.id));
  }, [mine.data, communities.data]);
  const activeCount = ['community_id', 'date', 'location'].filter((k) => f[k]).length + (f.available ? 1 : 0) + (f.eligible ? 0 : 1);
  const filtered = debounced || f.category || activeCount > 0;
  const reset = () => { const base = { category: '', community_id: '', date: '', location: '', eligible: true, available: false }; setF(base); setDraft(base); setQ(''); };

  return (
    <>
      <PageHeader title={t('student.discover')} />
      <div className="stack">
        <div className="row">
          <div className="grow"><SearchField value={q} onChange={setQ} placeholder={t('student.searchPlaceholder')} /></div>
          <Button variant="secondary" onClick={() => { setDraft(f); setOpen(true); }} aria-label={t('common.filters')}>
            <Icon name="filter" size={18} />{activeCount > 0 && <span className="count">{activeCount}</span>}
          </Button>
        </div>
        <CategoryChips value={f.category} onChange={(c) => setF({ ...f, category: c })} />
        <Load q={data}>
          {(d) => {
            if (d.member_communities === 0) {
              return <EmptyState icon="building" title={t('student.noMembership')} body={t('student.noMembershipBody')} action={<Link className="btn btn-primary" to="/student/communities">{t('home.joinCta')}</Link>} />;
            }
            if (d.opportunities.length === 0) {
              return filtered
                ? <EmptyState icon="search" title={t('student.noResults')} body={t('student.noResultsBody')} action={<Button variant="secondary" onClick={reset}>{t('common.clear')}</Button>} />
                : <EmptyState icon="calendar" title={t('student.noActivities')} body={t('student.noActivitiesBody')} />;
            }
            return (
              <>
                <p className="small muted" aria-live="polite">{t('student.resultsCount', { n: d.opportunities.length })}</p>
                <div className="cards two">{d.opportunities.map((o) => <OpportunityCard key={o.id} o={o} to={`/opportunities/${o.id}`} />)}</div>
              </>
            );
          }}
        </Load>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('common.filters')}
        footer={<><Button variant="secondary" onClick={() => { reset(); setOpen(false); }}>{t('common.clear')}</Button><Button onClick={() => { setF(draft); setOpen(false); }}>{t('common.applyFilters')}</Button></>}>
        <FormField label={t('student.community')}>
          {(p) => (
            <select className="select" {...p} value={draft.community_id} onChange={(e) => setDraft({ ...draft, community_id: e.target.value })}>
              <option value="">{t('common.all')}</option>
              {myCommunities.map((c) => <option key={c.id} value={c.id}>{lang === 'ar' ? c.name_ar : c.name}</option>)}
            </select>
          )}
        </FormField>
        <FormField label={t('student.date')} optional>
          {(p) => <input className="input" type="date" {...p} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />}
        </FormField>
        <FormField label={t('student.location')} optional>
          {(p) => <input className="input" {...p} value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} dir="auto" />}
        </FormField>
        <label className="check"><input type="checkbox" checked={draft.eligible} onChange={(e) => setDraft({ ...draft, eligible: e.target.checked })} />{t('student.onlyEligible')}</label>
        <label className="check"><input type="checkbox" checked={draft.available} onChange={(e) => setDraft({ ...draft, available: e.target.checked })} />{t('student.onlyAvailable')}</label>
      </Sheet>
    </>
  );
}

export function Applications() {
  const { t, fmt } = useI18n();
  const q = useApi('/applications/mine');
  return (
    <>
      <PageHeader title={t('app.title')} />
      <Load q={q}>
        {(d) => {
          if (d.applications.length === 0) {
            return <EmptyState icon="inbox" title={t('app.empty')} body={t('app.emptyBody')} action={<Link className="btn btn-primary" to="/student/discover">{t('home.findActivities')}</Link>} />;
          }
          const active = d.applications.filter((a) => ACTIVE.includes(a.status));
          const past = d.applications.filter((a) => !ACTIVE.includes(a.status));
          const row = (a) => (
            <li key={a.id}>
              <Link to={`/student/applications/${a.id}`} className="list-row">
                <div className="grow">
                  <div className="title">{a.opportunity.title}</div>
                  <Meta parts={[fmt.date(a.opportunity.date), fmt.time(a.opportunity.start_time)]} />
                </div>
                <StatusBadge kind="app" status={a.status} />
                <Icon name="chev" size={18} className="chev" />
              </Link>
            </li>
          );
          return (
            <>
              {active.length > 0 && <Section title={t('app.active')}><div className="panel-flush"><ul className="list">{active.map(row)}</ul></div></Section>}
              {past.length > 0 && <Section title={t('app.past')}><div className="panel-flush"><ul className="list">{past.map(row)}</ul></div></Section>}
            </>
          );
        }}
      </Load>
    </>
  );
}

export function ApplicationDetail({ params }) {
  const { t, fmt } = useI18n();
  const q = useApi(`/applications/${params.id}`);
  const [open, setOpen] = useState(false);
  const act = useAction();
  return (
    <Load q={q}>
      {({ application: a }) => {
        const o = a.opportunity;
        return (
          <>
            <PageHeader backTo="/student/applications" title={<bdi>{o.title}</bdi>} sub={`${fmt.date(o.date, { weekday: 'long', day: 'numeric', month: 'long' })}${fmt.sep}${fmt.time(o.start_time)}–${fmt.time(o.end_time)}`} />
            <div className="wide-2">
              <div className="stack">
                <div className="panel stack">
                  <div className="row between"><h2 style={{ fontSize: 'var(--fs-m)' }}>{t('app.timeline')}</h2><StatusBadge kind="app" status={a.status} /></div>
                  <ApplicationTimeline app={a} />
                  {a.consent_status === 'rejected' && <p className="note danger small">{t('app.consentRejected')}</p>}
                  {a.status === 'pending_guardian' && <p className="note warn small">{t('app.waitingGuardianHelp')}</p>}
                  {a.status === 'accepted' && <p className="note small">{t('app.acceptedHelp')}</p>}
                </div>
                {a.participation && (
                  <div className="panel stack">
                    <div className="row between"><h2 style={{ fontSize: 'var(--fs-m)' }}>{t('manage.hoursSection')}</h2><StatusBadge kind="hours" status={a.participation.status} /></div>
                    <VerificationTimeline r={a.participation} />
                  </div>
                )}
              </div>
              <div className="stack">
                <div className="panel facts">
                  <Fact icon="pin" k={t('detail.where')} v={<><bdi>{o.general_location}</bdi>{o.exact_address && <div className="small"><strong>{t('detail.exactAddress')}: </strong><bdi>{o.exact_address}</bdi></div>}</>} />
                  <Fact icon="shieldCheck" k={t('detail.supervision')} v={o.supervision} ugc />
                  <Fact icon="user" k={t('detail.host')} v={o.host_name} />
                </div>
                <Link to={`/opportunities/${o.id}`} className="btn btn-secondary">{t('app.viewActivity')}</Link>
                {ACTIVE.includes(a.status) && <Button variant="danger" onClick={() => setOpen(true)}>{t('app.withdraw')}</Button>}
              </div>
            </div>
            <ConfirmDialog open={open} onClose={() => setOpen(false)} title={t('app.withdrawTitle')} body={t('app.withdrawBody')} confirmLabel={t('app.withdraw')} tone="danger" busy={act.busy}
              onConfirm={async () => { if (await act.run(() => post(`/applications/${a.id}/withdraw`), { success: t('app.withdrawn') })) { setOpen(false); q.reload(); } }} />
          </>
        );
      }}
    </Load>
  );
}

export function Activities() {
  const { t } = useI18n();
  const q = useApi('/applications/mine');
  const [tab, setTab] = useState('upcoming');
  return (
    <>
      <PageHeader title={t('nav.activities')} />
      <div className="tabs" role="tablist" aria-label={t('nav.activities')}>
        {['upcoming', 'completed'].map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t('activities.' + k)}</button>
        ))}
      </div>
      <Load q={q}>
        {(d) => {
          const list = d.applications.filter((a) => (tab === 'upcoming' ? a.status === 'accepted' : a.status === 'completed'));
          if (!list.length) {
            return tab === 'upcoming'
              ? <EmptyState icon="calendar" title={t('home.noUpcomingTitle')} body={t('home.noUpcoming')} action={<Link className="btn btn-primary" to="/student/discover">{t('home.findActivities')}</Link>} />
              : <EmptyState icon="clock" title={t('activities.noneCompleted')} body={t('hours.emptyBody')} />;
          }
          return <div className="cards" role="tabpanel">{list.map((a) => <OpportunityCard key={a.id} o={a.opportunity} to={`/student/applications/${a.id}`} />)}</div>;
        }}
      </Load>
    </>
  );
}

export function Hours() {
  const { t } = useI18n();
  const q = useApi('/participation/mine');
  return (
    <>
      <PageHeader title={t('hours.title')} />
      <Load q={q}>
        {(d) => (
          <div className="stack-l">
            <HoursSummary verified={d.totals.verified} pending={d.totals.pending} />
            <p className="xs muted">{t('common.notOfficial')}</p>
            <div className="actions">
              <a className="btn btn-secondary" href="/api/me/participation/export?format=csv" download><Icon name="download" size={18} />{t('hours.exportCsv')}</a>
              <Link className="btn btn-secondary" to="/student/hours/summary"><Icon name="printer" size={18} />{t('hours.exportPrint')}</Link>
            </div>
            <Section title={t('hours.records')}>
              {d.records.length === 0
                ? <EmptyState icon="clock" title={t('hours.empty')} body={t('hours.emptyBody')} />
                : <div className="cards two">{d.records.map((r) => <ParticipationRecord key={r.id} r={r} />)}</div>}
            </Section>
          </div>
        )}
      </Load>
    </>
  );
}

export function HoursSummaryPrint() {
  const { t, fmt } = useI18n();
  const q = useApi('/me/participation/export');
  return (
    <Load q={q}>
      {(d) => {
        const verified = d.rows.filter((r) => r.status === 'verified').reduce((s, r) => s + r.verified_hours, 0);
        return (
          <div className="stack-l">
            <div className="row no-print">
              <Link to="/student/hours" className="btn btn-ghost"><Icon name="back" size={18} />{t('common.back')}</Link>
              <div className="grow" />
              <Button onClick={() => window.print()}><Icon name="printer" size={18} />{t('hours.print')}</Button>
            </div>
            <div>
              <img src="/logo-wordmark.png" alt={t('app.name')} width="120" height="56" style={{ height: 56, width: 'auto', marginBottom: 12 }} />
              <h1>{t('hours.summaryTitle')}</h1>
              <p className="muted">{t('app.team')}</p>
              <p className="small">{t('hours.summaryFor', { name: d.student })}{fmt.sep}{t('hours.generated', { date: fmt.dateTime(d.generated_at) })}</p>
            </div>
            <div className="panel-flush table-scroll" tabIndex={0} role="region" aria-label={t('hours.summaryTitle')}>
              <table className="summary-table">
                <thead><tr>
                  <th scope="col">{t('hours.colActivity')}</th><th scope="col">{t('hours.colDate')}</th><th scope="col">{t('hours.colClaimed')}</th>
                  <th scope="col">{t('hours.colVerified')}</th><th scope="col">{t('hours.colStatus')}</th><th scope="col">{t('hours.colRecord')}</th>
                </tr></thead>
                <tbody>
                  {d.rows.map((r) => (
                    <tr key={r.record_id}>
                      <td dir="auto">{r.activity}</td><td className="num">{fmt.date(r.date, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td className="num">{r.claimed_hours == null ? '—' : fmt.num(r.claimed_hours)}</td>
                      <td className="num">{r.verified_hours == null ? '—' : fmt.num(r.verified_hours)}</td>
                      <td>{t('status.hours.' + r.status)}</td><td className="ltr xs">{r.record_id.slice(0, 8).toUpperCase()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><th scope="row" colSpan={3}>{t('hours.total')}</th><td className="num"><strong>{fmt.num(verified)}</strong></td><td colSpan={2} /></tr></tfoot>
              </table>
            </div>
            <div className="note">
              <strong>{t('hours.legendTitle')}</strong>
              <ul style={{ margin: '4px 0 0', paddingInlineStart: '1.2em' }}>
                <li>{t('hours.legendPending')}</li><li>{t('hours.legendConfirmed')}</li><li>{t('hours.legendVerified')}</li>
              </ul>
            </div>
            <p className="small">{t('common.notOfficial')}</p>
          </div>
        );
      }}
    </Load>
  );
}

export function History() {
  const { t, fmt } = useI18n();
  const apps = useApi('/applications/mine');
  return (
    <>
      <PageHeader title={t('nav.history')} sub={t('history.sub')} />
      <Load q={apps}>
        {(d) => {
          const past = d.applications.filter((a) => !ACTIVE.includes(a.status));
          if (!past.length) return <EmptyState icon="history" title={t('history.empty')} body={t('history.emptyBody')} />;
          return (
            <div className="panel-flush"><ul className="list">
              {past.map((a) => (
                <li key={a.id}>
                  <Link to={`/student/applications/${a.id}`} className="list-row">
                    <div className="grow"><div className="title">{a.opportunity.title}</div><div className="sub">{fmt.date(a.opportunity.date, { day: 'numeric', month: 'short', year: 'numeric' })}</div></div>
                    <StatusBadge kind="app" status={a.status} />
                  </Link>
                </li>
              ))}
            </ul></div>
          );
        }}
      </Load>
    </>
  );
}

