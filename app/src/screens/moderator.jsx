import { useState } from 'react';
import { post } from '../api.js';
import { useI18n } from '../i18n.js';
import { Icon } from '../icons.jsx';
import { Link, useRouter } from '../router.jsx';
import {
  Button, EmptyState, Fact, FormField, Hero, Load, OpportunityCard, PageHeader, ReasonDialog, ReviewQueueItem, Section,
  StatusBadge, Tabs, useAction, useApi, VerificationTimeline, Meta, useToast,
} from '../ui.jsx';

function ReviewTabs({ current, refresh }) {
  const { t } = useI18n();
  const o = useApi('/mod/overview', [current, refresh]); // refetch counts whenever the queue changes
  const c = o.data?.counts || {};
  return (
    <Tabs tiles label={t('nav.reviews')} current={current} items={[
      { to: '/moderator/memberships', icon: 'users', label: t('mod.memberships'), count: c.memberships },
      { to: '/moderator/opportunities', icon: 'list', label: t('mod.opportunities'), count: c.opportunities },
      { to: '/moderator/hours', icon: 'clock', label: t('mod.hours'), count: c.hours },
    ]} />
  );
}

function History({ items }) {
  const { t, fmt } = useI18n();
  if (!items?.length) return null;
  return (
    <Section title={t('mod.history')}>
      <div className="panel-flush"><ul className="list">
        {items.map((h, i) => (
          <li key={i} className="audit-row">
            <time className="when num" dateTime={h.created_at}>{fmt.date(h.created_at.slice(0, 10), { day: 'numeric', month: 'short' })}</time>
            <div className="grow">
              <div className="what">{t('mod.action.' + h.action)}</div>
              <Meta parts={[t('mod.actor', { name: h.actor }), fmt.clock(h.created_at)]} className="xs muted" />
              {h.reason && <div className="small reason" dir="auto">{h.reason}</div>}
            </div>
          </li>
        ))}
      </ul></div>
    </Section>
  );
}

export function Overview() {
  const { t, lang, fmt } = useI18n();
  const q = useApi('/mod/overview');
  return (
    <>
      <Hero compact title={t('mod.title')} sub={t('mod.overviewSub')} />
      <Load q={q}>
        {(d) => (
          <>
            <div className="stat-grid">
              <Link className="stat" to="/moderator/memberships"><div className="v">{fmt.num(d.counts.memberships)}</div><div className="k">{t('mod.queue.memberships')}</div></Link>
              <Link className="stat" to="/moderator/opportunities"><div className="v">{fmt.num(d.counts.opportunities)}</div><div className="k">{t('mod.queue.opportunities')}</div></Link>
              <Link className="stat" to="/moderator/hours"><div className="v">{fmt.num(d.counts.hours)}</div><div className="k">{t('mod.queue.hours')}</div></Link>
              <Link className="stat" to="/moderator/reports"><div className="v">{fmt.num(d.counts.reports)}</div><div className="k">{t('mod.queue.reports')}</div></Link>
            </div>
            <Section title={t('mod.overview')}>
              {d.communities.length === 0
                ? <EmptyState icon="building" title={t('mod.noCommunities')} body={t('mod.noCommunitiesBody')} />
                : (
                  <div className="panel-flush"><ul className="list">
                    {d.communities.map((c) => (
                      <li key={c.id} className="list-row">
                        <Icon name={c.type === 'gated' ? 'lock' : 'globe'} />
                        <div className="grow">
                          <div className="title">{lang === 'ar' ? c.name_ar : c.name}</div>
                          <div className="sub">{t('mod.communityLine', { m: fmt.num(c.members), o: fmt.num(c.active_opportunities), h: fmt.num(c.verified_hours) })}</div>
                        </div>
                      </li>
                    ))}
                  </ul></div>
                )}
            </Section>
          </>
        )}
      </Load>
    </>
  );
}

export function Memberships() {
  const { t, lang, fmt } = useI18n();
  const q = useApi('/mod/memberships');
  return (
    <>
      <Hero compact title={t('nav.reviews')} sub={t('mod.reviewsSub')} />
      <ReviewTabs current="/moderator/memberships" refresh={q.data} />
      <Load q={q}>
        {(d) => (d.memberships.length === 0
          ? <EmptyState icon="users" title={t('mod.noItems')} body={t('mod.noItemsBody')} />
          : (
            <div className="panel-flush"><ul className="list">
              {d.memberships.map((m) => (
                <ReviewQueueItem key={m.id} to={`/moderator/memberships/${m.id}`} title={m.display_name}
                  sub={<Meta className="" parts={[t('role.' + m.role), lang === 'ar' ? m.community_ar : m.community, fmt.date(m.created_at.slice(0, 10))]} />}
                  badge={<StatusBadge kind="membership" status={m.status} />} />
              ))}
            </ul></div>
          ))}
      </Load>
    </>
  );
}

export function MembershipDetail({ params }) {
  const { t, lang, fmt } = useI18n();
  const { navigate } = useRouter();
  const q = useApi(`/mod/memberships/${params.id}`);
  const act = useAction();
  const [dlg, setDlg] = useState(null);
  const decide = async (decision, reason) => {
    if (await act.run(() => post(`/mod/memberships/${params.id}/decide`, { decision, reason }), { success: t('mod.decided') })) {
      setDlg(null);
      if (decision === 'approved' || decision === 'rejected') navigate('/moderator/memberships');
      else q.reload();
    }
  };
  return (
    <Load q={q}>
      {({ membership: m, history }) => (
        <>
          <PageHeader backTo="/moderator/memberships" title={m.display_name} sub={t('mod.membershipFor', { community: lang === 'ar' ? m.community_ar : m.community })} />
          <div className="panel stack">
            <dl className="kv">
              <dt>{t('mod.kv.role')}</dt><dd>{t('role.' + m.role)}</dd>
              <dt>{t('mod.kv.community')}</dt><dd>{lang === 'ar' ? m.community_ar : m.community} ({t(m.community_type === 'gated' ? 'comm.gated' : 'comm.open')})</dd>
              <dt>{t('mod.kv.requested')}</dt><dd>{fmt.dateTime(m.created_at)}</dd>
              <dt>{t('mod.kv.status')}</dt><dd><StatusBadge kind="membership" status={m.status} /></dd>
              <dt>{t('mod.kv.otherCommunities')}</dt><dd>{fmt.num(m.other_memberships)}</dd>
            </dl>
            <p className="note small">{t('mod.membershipNote')}</p>
            {m.status === 'pending' && (
              <div className="actions">
                <Button variant="danger" onClick={() => setDlg('rejected')}>{t('mod.reject')}</Button>
                <Button busy={act.busy} onClick={() => decide('approved')}><Icon name="check" size={18} />{t('mod.approve')}</Button>
              </div>
            )}
            {m.status === 'approved' && (
              <div className="actions">
                <Button variant="secondary" onClick={() => setDlg('suspended')}>{t('mod.suspend')}</Button>
                <Button variant="danger" onClick={() => setDlg('revoked')}>{t('mod.revoke')}</Button>
              </div>
            )}
            {['suspended', 'revoked'].includes(m.status) && (
              <div className="actions">
                <Button variant="secondary" onClick={() => setDlg('reinstated')}>{t('mod.reinstate')}</Button>
                {m.status === 'suspended' && <Button variant="danger" onClick={() => setDlg('revoked')}>{t('mod.revoke')}</Button>}
              </div>
            )}
          </div>
          <History items={history} />
          <ReasonDialog open={!!dlg} onClose={() => setDlg(null)} title={dlg ? t('mod.confirm.' + dlg) : ''}
            confirmLabel={dlg ? t('mod.btn.' + dlg) : ''} tone={dlg === 'reinstated' ? 'primary' : 'danger'} busy={act.busy} onConfirm={(r) => decide(dlg, r)} />
        </>
      )}
    </Load>
  );
}

export function Opportunities() {
  const { t } = useI18n();
  const [scope, setScope] = useState('pending');
  const q = useApi('/mod/opportunities?scope=' + (scope === 'live' ? 'live' : 'pending'));
  const act = useAction();
  const [dlg, setDlg] = useState(null);
  const decide = async (o, decision, reason) => {
    if (await act.run(() => post(`/mod/opportunities/${o.id}/decide`, { decision, reason }), { success: t('mod.decided') })) { setDlg(null); q.reload(); }
  };
  return (
    <>
      <Hero compact title={t('nav.reviews')} sub={t('mod.reviewsSub')} />
      <ReviewTabs current="/moderator/opportunities" refresh={q.data} />
      <div className="chips" role="group" aria-label={t('mod.opportunities')} style={{ marginBottom: 12 }}>
        <button type="button" className="chip" aria-pressed={scope === 'pending'} onClick={() => setScope('pending')}>{t('mod.pendingListings')}</button>
        <button type="button" className="chip" aria-pressed={scope === 'live'} onClick={() => setScope('live')}>{t('mod.liveListings')}</button>
      </div>
      <Load q={q}>
        {(d) => (d.opportunities.length === 0
          ? <EmptyState icon="list" title={t('mod.noItems')} body={t('mod.noItemsBody')} />
          : (
            <div className="cards">
              {d.opportunities.map((o) => (
                <article key={o.id} className="panel-flush review-item">
                  <OpportunityCard o={o} to={`/opportunities/${o.id}`} showStatus flat />
                  <div className="facts">
                    <Fact icon="shieldCheck" k={t('detail.supervision')} v={o.supervision} ugc />
                    {o.requirements && <Fact icon="doc" k={t('detail.requirements')} v={o.requirements} ugc />}
                  </div>
                  {scope === 'pending' ? (
                    <div className="actions">
                      <Button variant="secondary" onClick={() => setDlg({ type: 'reject', o })}>{t('mod.sendBack')}</Button>
                      <Button busy={act.busy} onClick={() => decide(o, 'approve')}><Icon name="check" size={18} />{t('mod.publish')}</Button>
                    </div>
                  ) : <Button variant="danger" onClick={() => setDlg({ type: 'suspend', o })}>{t('mod.suspendListing')}</Button>}
                </article>
              ))}
            </div>
          ))}
      </Load>
      <ReasonDialog open={!!dlg} onClose={() => setDlg(null)} title={dlg?.type === 'suspend' ? t('mod.suspendListing') : t('mod.sendBack')}
        body={dlg?.type === 'suspend' ? t('mod.suspendBody') : t('mod.sendBackBody')} confirmLabel={dlg?.type === 'suspend' ? t('mod.suspend') : t('mod.sendBack')}
        busy={act.busy} onConfirm={(r) => decide(dlg.o, dlg.type, r)} />
    </>
  );
}

export function Hours() {
  const { t, fmt } = useI18n();
  const q = useApi('/mod/participation');
  return (
    <>
      <Hero compact title={t('nav.reviews')} sub={t('mod.reviewsSub')} />
      <ReviewTabs current="/moderator/hours" refresh={q.data} />
      <Load q={q}>
        {(d) => (d.records.length === 0
          ? <EmptyState icon="clock" title={t('mod.noItems')} body={t('mod.noItemsBody')} />
          : (
            <Section title={`${t('mod.pendingHours')} (${fmt.num(d.records.length)})`}>
              <div className="panel-flush"><ul className="list">
                {d.records.map((r) => (
                  <li key={r.id}>
                    <Link to={`/moderator/hours/${r.id}`} className="list-row person-row">
                      <span className="initial" aria-hidden="true">{[...r.student_name][0]}</span>
                      <div className="grow">
                        <div className="title"><bdi>{r.student_name}</bdi></div>
                        <div className="sub"><bdi>{r.opportunity.title}</bdi></div>
                        <div className="sub">{t('mod.confirmedBy', { host: r.host_name })}</div>
                      </div>
                      <span className="hours-pill num">{t('common.hours', { n: fmt.num(r.confirmed_hours) })}</span>
                      <Icon name="chev" size={18} className="chev" />
                    </Link>
                  </li>
                ))}
              </ul></div>
            </Section>
          ))}
      </Load>
    </>
  );
}

export function HoursDetail({ params }) {
  const { t, fmt } = useI18n();
  const { navigate } = useRouter();
  const q = useApi(`/mod/participation/${params.id}`);
  const act = useAction();
  const [hours, setHours] = useState('');
  const [dlg, setDlg] = useState(null);
  const decide = async (decision, reason) => {
    const body = { decision, reason };
    if (decision === 'approve' && hours) body.hours = Number(hours);
    if (await act.run(() => post(`/mod/participation/${params.id}/decide`, body), { success: t('mod.decided') })) { setDlg(null); navigate('/moderator/hours'); }
  };
  return (
    <Load q={q}>
      {({ record: r, history }) => (
        <>
          <PageHeader backTo="/moderator/hours" title={<bdi>{r.opportunity.title}</bdi>} />
          <div className="wide-2">
            <div className="panel stack">
              <div className="who-row">
                <span className="initial" aria-hidden="true">{[...r.student_name][0]}</span>
                <div className="grow">
                  <p className="who"><bdi>{r.student_name}</bdi></p>
                  <p className="xs muted">{t('mod.confirmedBy', { host: r.host_name })}</p>
                </div>
                <span className="hours-pill big num">{t('common.hours', { n: fmt.num(r.confirmed_hours ?? 0) })}</span>
              </div>
              <VerificationTimeline r={r} />
              <div className="facts">
                <Fact icon="calendar" k={t('mod.scheduled')} v={`${fmt.date(r.scheduled.date)}${fmt.sep}${fmt.time(r.scheduled.start_time)}–${fmt.time(r.scheduled.end_time)} (${t('common.hours', { n: fmt.num(r.opportunity.duration_hours) })})`} />
                <Fact icon="shieldCheck" k={t('detail.supervision')} v={r.scheduled.supervision} ugc />
                {r.note && <Fact icon="doc" k={t('mod.hostNote')} v={r.note} ugc />}
              </div>
            </div>
            <div className="stack">
              <p className="note small">{t('mod.independence')}</p>
              {r.status === 'pending_verification' ? (
                <div className="panel stack">
                  <FormField label={t('mod.verifyHours')} hint={t('mod.verifyHint', { n: fmt.num(r.confirmed_hours) })} error={act.fields.hours}>
                    {(p) => <input className="input" type="number" step="0.25" min="0.25" max={r.confirmed_hours} inputMode="decimal" {...p} value={hours} placeholder={String(r.confirmed_hours)} onChange={(e) => setHours(e.target.value)} />}
                  </FormField>
                  <Button busy={act.busy} onClick={() => decide('approve')}><Icon name="shieldCheck" size={18} />{t('mod.verify')}</Button>
                  <div className="actions">
                    <Button variant="secondary" onClick={() => setDlg('correction')}>{t('mod.requestCorrection')}</Button>
                    <Button variant="danger" onClick={() => setDlg('reject')}>{t('mod.reject')}</Button>
                  </div>
                </div>
              ) : <StatusBadge kind="hours" status={r.status} />}
            </div>
          </div>
          <History items={history} />
          <ReasonDialog open={!!dlg} onClose={() => setDlg(null)} title={dlg === 'correction' ? t('mod.requestCorrection') : t('mod.rejectHours')}
            body={dlg === 'correction' ? t('mod.correctionBody') : t('mod.rejectHoursBody')} confirmLabel={dlg === 'correction' ? t('mod.requestCorrection') : t('mod.reject')}
            tone={dlg === 'correction' ? 'primary' : 'danger'} busy={act.busy} onConfirm={(reason) => decide(dlg, reason)} />
        </>
      )}
    </Load>
  );
}

export function Reports() {
  const { t, fmt } = useI18n();
  const [scope, setScope] = useState('open');
  const q = useApi('/mod/reports?scope=' + scope);
  return (
    <>
      <PageHeader title={t('mod.reports')} sub={t('mod.reportsSub')} />
      <div className="tabs" role="tablist" aria-label={t('mod.reports')}>
        <button role="tab" aria-selected={scope === 'open'} onClick={() => setScope('open')}>{t('mod.reportsOpen')}</button>
        <button role="tab" aria-selected={scope === 'closed'} onClick={() => setScope('closed')}>{t('mod.reportsClosed')}</button>
      </div>
      <Load q={q}>
        {(d) => (d.reports.length === 0
          ? <EmptyState icon="flag" title={t('mod.noReports')} body={t('mod.noItemsBody')} />
          : (
            <div className="panel-flush"><ul className="list">
              {d.reports.map((r) => (
                <ReviewQueueItem key={r.id} to={`/moderator/reports/${r.id}`} title={t('repcat.' + r.category)}
                  sub={<Meta className="" parts={[r.opportunity?.title, fmt.dateTime(r.created_at)]} />}
                  badge={<StatusBadge kind="report" status={r.status} />} />
              ))}
            </ul></div>
          ))}
      </Load>
    </>
  );
}

export function ReportDecision({ r, base, onDone }) {
  const { t } = useI18n();
  const act = useAction();
  const [status, setStatus] = useState('resolved');
  const [resolution, setResolution] = useState('');
  const [suspend, setSuspend] = useState(false);
  const closed = ['resolved', 'dismissed'].includes(r.status);
  if (closed) return r.resolution ? <p className="note small" dir="auto">{r.resolution}</p> : null;
  const submit = async (st) => {
    const body = { status: st, resolution, suspend_opportunity: suspend };
    if (await act.run(() => post(`${base}/${r.id}/update`, body), { success: t('mod.decided') })) onDone();
  };
  return (
    <div className="panel stack">
      {r.status === 'open' && <Button variant="secondary" busy={act.busy} onClick={() => submit('in_review')}>{t('mod.setInReview')}</Button>}
      <fieldset className="stack">
        <legend>{t('mod.outcome')}</legend>
        <div className="chips" role="group">
          <button type="button" className="chip" aria-pressed={status === 'resolved'} onClick={() => setStatus('resolved')}>{t('mod.resolve')}</button>
          <button type="button" className="chip" aria-pressed={status === 'dismissed'} onClick={() => setStatus('dismissed')}>{t('mod.dismiss')}</button>
        </div>
      </fieldset>
      <FormField label={t('mod.resolution')} hint={t('mod.reasonNeeded')} error={act.fields.reason}>
        {(p) => <textarea className="textarea" {...p} value={resolution} onChange={(e) => setResolution(e.target.value)} maxLength={500} dir="auto" />}
      </FormField>
      {r.opportunity && ['published', 'full', 'pending_review'].includes(r.opportunity.status) && (
        <label className="check"><input type="checkbox" checked={suspend} onChange={(e) => setSuspend(e.target.checked)} />{t('mod.suspendListingAndReport')}</label>
      )}
      <Button busy={act.busy} disabled={resolution.trim().length < 5} onClick={() => submit(status)}>{status === 'resolved' ? t('mod.resolve') : t('mod.dismiss')}</Button>
    </div>
  );
}

export function ReportDetail({ params }) {
  const { t, fmt } = useI18n();
  const q = useApi(`/mod/reports/${params.id}`);
  return (
    <Load q={q}>
      {({ report: r }) => (
        <>
          <PageHeader backTo="/moderator/reports" title={t('repcat.' + r.category)} sub={fmt.dateTime(r.created_at)} />
          <div className="wide-2">
            <div className="panel stack">
              <div className="row between"><h2 style={{ fontSize: 'var(--fs-m)' }}>{t('report.details')}</h2><StatusBadge kind="report" status={r.status} /></div>
              <p className="ugc" dir="auto">{r.details}</p>
              {r.opportunity && <Link to={`/opportunities/${r.opportunity.id}`} className="btn btn-secondary btn-sm"><Icon name="eye" size={16} />{r.opportunity.title}</Link>}
              <p className="xs muted">{t('mod.reporterHidden')}</p>
            </div>
            <ReportDecision r={r} base="/mod/reports" onDone={q.reload} />
          </div>
        </>
      )}
    </Load>
  );
}

function Announce({ onSent }) {
  const { t, lang, fmt } = useI18n();
  const ov = useApi('/mod/overview');
  const [cid, setCid] = useState('');
  const [msg, setMsg] = useState('');
  const act = useAction();
  const comms = ov.data?.communities || [];
  return (
    <form className="panel stack" style={{ marginBottom: 16 }} onSubmit={async (e) => {
      e.preventDefault();
      const r = await act.run(() => post('/mod/announcements', { community_id: cid || comms[0]?.id, message: msg }));
      if (r) { setMsg(''); onSent(t('mod.announceSent', { n: fmt.num(r.recipients) })); }
    }}>
      <h2 style={{ fontSize: 'var(--fs-m)' }}>{t('mod.announce')}</h2>
      <p className="small muted">{t('mod.announceHint')}</p>
      {comms.length > 1 && (
        <FormField label={t('mod.kv.community')}>
          {(p) => <select className="select" {...p} value={cid || comms[0]?.id} onChange={(e) => setCid(e.target.value)}>{comms.map((c) => <option key={c.id} value={c.id}>{lang === 'ar' ? c.name_ar : c.name}</option>)}</select>}
        </FormField>
      )}
      <FormField label={t('mod.announceField')} error={act.fields.message}>
        {(p) => <textarea className="textarea" {...p} value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={400} dir="auto" />}
      </FormField>
      <Button type="submit" busy={act.busy} disabled={msg.trim().length < 10 || !comms.length}>{t('mod.announce')}</Button>
    </form>
  );
}

export function Community() {
  const { t, lang, fmt } = useI18n();
  const hist = useApi('/mod/history');
  const members = useApi('/mod/listing-history');
  const [tab, setTab] = useState('members');
  const toast = useToast();
  return (
    <>
      <PageHeader title={t('nav.community')} sub={t('mod.communitySub')} />
      <Announce onSent={(m) => { toast(m); hist.reload(); }} />
      <div className="tabs" role="tablist" aria-label={t('nav.community')}>
        <button role="tab" aria-selected={tab === 'members'} onClick={() => setTab('members')}>{t('mod.restrictions')}</button>
        <button role="tab" aria-selected={tab === 'history'} onClick={() => setTab('history')}>{t('mod.history')}</button>
      </div>
      {tab === 'members' && (
        <Load q={members}>
          {(d) => (d.memberships.length === 0
            ? <EmptyState icon="users" title={t('mod.noMembers')} />
            : (
              <div className="panel-flush" role="tabpanel"><ul className="list">
                {d.memberships.map((m) => (
                  <ReviewQueueItem key={m.id} to={`/moderator/memberships/${m.id}`} title={m.display_name}
                    sub={<Meta className="" parts={[lang === 'ar' ? m.community_ar : m.community, fmt.date(m.updated_at.slice(0, 10))]} />} badge={<StatusBadge kind="membership" status={m.status} />} />
                ))}
              </ul></div>
            ))}
        </Load>
      )}
      {tab === 'history' && (
        <Load q={hist}>
          {(d) => (d.actions.length === 0
            ? <EmptyState icon="history" title={t('mod.noHistory')} />
            : (
              <div className="panel-flush" role="tabpanel"><ul className="list">
                {d.actions.map((a) => (
                  <li key={a.id} className="audit-row">
                    <time className="when num" dateTime={a.created_at}>{fmt.date(a.created_at.slice(0, 10), { day: 'numeric', month: 'short' })}</time>
                    <div className="grow">
                      <div className="what">{t('mod.action.' + a.action)}</div>
                      <Meta parts={[t('mod.actor', { name: a.actor }), fmt.clock(a.created_at)]} className="xs muted" />
                      {a.reason && <div className="small reason" dir="auto">{a.reason}</div>}
                    </div>
                  </li>
                ))}
              </ul></div>
            ))}
        </Load>
      )}
    </>
  );
}
