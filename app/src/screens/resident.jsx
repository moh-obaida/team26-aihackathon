import { useState } from 'react';
import { patch, post } from '../api.js';
import { useI18n } from '../i18n.js';
import { Icon } from '../icons.jsx';
import { Link, useRouter } from '../router.jsx';
import {
  Button, ConfirmDialog, EmptyState, FormField, Hero, Load, OpportunityCard, PageHeader, Section, Sheet, StatusBadge,
  CountUp, useAction, useApi, useAuth, useGreeting, VerificationTimeline,
} from '../ui.jsx';

const CATS = ['cleanup', 'gardening', 'seniors', 'reading', 'pets', 'events', 'tutoring', 'other'];
const LIVE = ['pending_review', 'published', 'full', 'closed', 'draft'];

export function Home() {
  const { t, lang, fmt } = useI18n();
  const { user } = useAuth();
  const greeting = useGreeting();
  const q = useApi('/resident/dashboard');
  return (
    <Load q={q} rows={4}>
      {(d) => {
        const pending = d.memberships.find((m) => m.status === 'pending');
        const approved = d.memberships.filter((m) => m.status === 'approved');
        const standing = d.verified
          ? { cls: 'ok', icon: 'shieldCheck', title: t('resident.verifiedTitle'), sub: t('resident.statusVerified', { name: approved.map((m) => (lang === 'ar' ? m.name_ar : m.name)).join(t('common.listSep')) }) }
          : pending
            ? { cls: 'wait', icon: 'hourglass', title: t('resident.pendingVerification'), sub: t('resident.pendingVerificationBody') }
            : { cls: 'todo', icon: 'shield', title: t('resident.notVerified'), sub: t('resident.notVerifiedBody') };
        let next = null;
        if (d.verified && d.active === 0) next = { to: '/resident/opportunities/new', icon: 'plus', title: t('resident.createRequest'), sub: t('resident.noRequestsBody') };
        const tiles = [
          { n: d.active, k: t('resident.active') },
          { n: d.pending_applicants, k: t('resident.pendingApplicants'), hot: true },
          { n: d.awaiting_confirmation, k: t('resident.awaitingConfirm'), hot: true },
        ];
        return (
          <>
            <Hero eyebrow={greeting} title={user.display_name} />
            <Link to="/resident/verification" className={`standing ${standing.cls}`}>
              <span className="standing-ic"><Icon name={standing.icon} size={24} /></span>
              <span className="grow"><span className="standing-title">{standing.title}</span><span className="standing-sub">{standing.sub}</span></span>
              <Icon name="chev" size={18} className="chev" />
            </Link>
            <div className="tile-row">
              {tiles.map((x) => (
                <Link key={x.k} className={`tile ${x.hot && x.n > 0 ? 'hot' : ''}`} to="/resident/opportunities">
                  <span className="v num"><CountUp value={x.n} /></span>
                  <span className="k">{x.k}</span>
                </Link>
              ))}
            </div>
            {next && (
              <Link to={next.to} className="next-action" style={{ marginTop: 16 }}>
                <span className="ic"><Icon name={next.icon} /></span>
                <span className="grow"><span className="title">{next.title}</span><br /><span className="sub">{next.sub}</span></span>
                <Icon name="chev" className="chev" />
              </Link>
            )}
            <Section title={t('resident.upcoming')} action={d.upcoming.length > 0 ? <Link to="/resident/opportunities">{t('common.viewAll')}</Link> : null}>
              {d.upcoming.length === 0
                ? <p className="muted small">{d.verified ? t('resident.noUpcoming') : t('resident.notVerifiedBody')}</p>
                : <div className="cards">{d.upcoming.map((o) => <OpportunityCard key={o.id} o={o} to={`/resident/opportunities/${o.id}/applicants`} showStatus hostView />)}</div>}
            </Section>
          </>
        );
      }}
    </Load>
  );
}

export function Verification() {
  const { t, lang, fmt } = useI18n();
  const q = useApi('/resident/dashboard');
  return (
    <>
      <PageHeader title={t('verification.title')} sub={t('resident.notVerifiedBody')} />
      <Load q={q}>
        {(d) => (
          <div className="stack-l">
            {d.memberships.length === 0
              ? <EmptyState icon="shieldCheck" title={t('resident.notVerified')} body={t('verification.none')} action={<Link className="btn btn-primary" to="/resident/communities">{t('resident.requestMembership')}</Link>} />
              : (
                <div className="panel-flush"><ul className="list">
                  {d.memberships.map((m) => (
                    <li key={m.community_id} className="list-row">
                      <Icon name={m.type === 'gated' ? 'lock' : 'globe'} />
                      <div className="grow">
                        <div className="title">{lang === 'ar' ? m.name_ar : m.name}</div>
                        <div className="sub">{t(m.status === 'approved' ? 'verification.canPost' : m.status === 'pending' ? 'resident.pendingVerificationBody' : 'verification.cannotPost')}</div>
                        {m.decision_reason && <div className="sub" dir="auto">{t('verification.reason', { reason: m.decision_reason })}</div>}
                      </div>
                      <StatusBadge kind="membership" status={m.status} />
                    </li>
                  ))}
                </ul></div>
              )}
            {d.memberships.length > 0 && <Link className="btn btn-secondary" to="/resident/communities">{t('verification.another')}</Link>}
            <div className="note"><strong>{t('verification.whatTitle')}</strong>{t('verification.whatBody', { n: fmt.num(6) })}</div>
          </div>
        )}
      </Load>
    </>
  );
}

export function Opportunities() {
  const { t } = useI18n();
  const q = useApi('/opportunities/mine');
  const [tab, setTab] = useState('live');
  return (
    <>
      <PageHeader title={t('resident.myRequests')} action={<Link to="/resident/opportunities/new" className="btn btn-primary btn-sm"><Icon name="plus" size={16} />{t('resident.newRequest')}</Link>} />
      <div className="tabs" role="tablist" aria-label={t('resident.myRequests')}>
        {['live', 'past'].map((k) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t('requests.' + k)}</button>)}
      </div>
      <Load q={q}>
        {(d) => {
          const list = d.opportunities.filter((o) => (tab === 'live' ? LIVE.includes(o.status) : !LIVE.includes(o.status)));
          if (!list.length) {
            return tab === 'live'
              ? <EmptyState icon="list" title={t('resident.noRequests')} body={t('resident.noRequestsBody')} action={<Link className="btn btn-primary" to="/resident/opportunities/new">{t('resident.createRequest')}</Link>} />
              : <EmptyState icon="history" title={t('requests.noPast')} body={t('requests.noPastBody')} />;
          }
          return (
            <div className="cards" role="tabpanel">
              {list.map((o) => (
                <div key={o.id} className="stack" style={{ gap: 6 }}>
                  <OpportunityCard o={o} to={`/resident/opportunities/${o.id}/applicants`} showStatus hostView />
                  {(o.pending_applications > 0 || o.awaiting_confirmation > 0) && (
                    <div className="row-wrap" style={{ paddingInline: 8 }}>
                      {o.pending_applications > 0 && <Link to={`/resident/opportunities/${o.id}/applicants`} className="badge wait" style={{ textDecoration: 'none' }}>{t('requests.toReview', { n: o.pending_applications })}</Link>}
                      {o.awaiting_confirmation > 0 && <Link to={`/resident/opportunities/${o.id}/participation`} className="badge wait" style={{ textDecoration: 'none' }}>{t('requests.toConfirm', { n: o.awaiting_confirmation })}</Link>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        }}
      </Load>
    </>
  );
}

function OppForm({ initial, communities, onSubmit, busy, fields, error, editing }) {
  const { t, lang, fmt } = useI18n();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
  const [f, setF] = useState(() => ({
    title: '', description: '', category: 'cleanup', community_id: communities[0]?.community_id || '', general_location: '', exact_address: '',
    date: today, start_time: '09:00', end_time: '11:00', capacity: 3, min_age: 13, requirements: '', supervision: '', accessibility: '', deadline: today,
    ...initial,
  }));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const dur = (() => {
    const [a, b] = [f.start_time, f.end_time].map((x) => x.split(':').map(Number));
    return ((b[0] * 60 + b[1]) - (a[0] * 60 + a[1])) / 60;
  })();
  const body = () => ({ ...f, capacity: Number(f.capacity), min_age: Number(f.min_age) });
  const field = (k, label, input, extra = {}) => (
    <FormField label={label} error={fields[k]} {...extra}>{(p) => input(p)}</FormField>
  );
  return (
    <form className="stack-l" onSubmit={(e) => { e.preventDefault(); onSubmit(body(), false); }} noValidate>
      <div className="note warn"><strong>{t('form.safetyTitle')}</strong>{t('form.safetyBody')}</div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {Object.keys(fields).length > 0 && !error && <p className="form-error" role="alert">{t('form.fixErrors')}</p>}
      <div className="stack">
        {field('title', t('form.title'), (p) => <input className="input" {...p} value={f.title} onChange={set('title')} maxLength={100} dir="auto" />)}
        {field('description', t('form.description'), (p) => <textarea className="textarea" {...p} value={f.description} onChange={set('description')} maxLength={1200} dir="auto" />)}
        <div className="grid-2">
          {field('category', t('form.category'), (p) => (
            <select className="select" {...p} value={f.category} onChange={set('category')}>{CATS.map((c) => <option key={c} value={c}>{t('cat.' + c)}</option>)}</select>
          ))}
          {!editing && field('community_id', t('form.community'), (p) => (
            <select className="select" {...p} value={f.community_id} onChange={set('community_id')}>
              {communities.map((m) => <option key={m.community_id} value={m.community_id}>{lang === 'ar' ? m.name_ar : m.name}</option>)}
            </select>
          ))}
        </div>
        {field('general_location', t('form.generalLocation'), (p) => <input className="input" {...p} value={f.general_location} onChange={set('general_location')} maxLength={100} dir="auto" />)}
        {field('exact_address', t('form.exactAddress'), (p) => <input className="input" {...p} value={f.exact_address || ''} onChange={set('exact_address')} maxLength={160} dir="auto" />, { optional: true })}
      </div>
      <fieldset className="stack">
        <legend>{t('detail.when')}</legend>
        {field('date', t('form.date'), (p) => <input className="input" type="date" min={today} {...p} value={f.date} onChange={set('date')} />)}
        <div className="grid-2">
          {field('start_time', t('form.start'), (p) => <input className="input" type="time" {...p} value={f.start_time} onChange={set('start_time')} />)}
          {field('end_time', t('form.end'), (p) => <input className="input" type="time" {...p} value={f.end_time} onChange={set('end_time')} />)}
        </div>
        {dur > 0 && <p className="small muted" aria-live="polite">{t('form.duration', { n: fmt.num(dur) })}</p>}
        {field('deadline', t('form.deadline'), (p) => <input className="input" type="date" min={today} max={f.date} {...p} value={f.deadline} onChange={set('deadline')} />)}
      </fieldset>
      <fieldset className="stack">
        <legend>{t('form.whoTitle')}</legend>
        <div className="grid-2">
          {field('capacity', t('form.capacity'), (p) => <input className="input" type="number" inputMode="numeric" min={1} max={50} {...p} value={f.capacity} onChange={set('capacity')} />)}
          {field('min_age', t('form.minAge'), (p) => <input className="input" type="number" inputMode="numeric" min={10} max={18} {...p} value={f.min_age} onChange={set('min_age')} />)}
        </div>
        {field('supervision', t('form.supervision'), (p) => <textarea className="textarea" style={{ minHeight: 80 }} {...p} value={f.supervision} onChange={set('supervision')} maxLength={400} dir="auto" />)}
        {field('requirements', t('form.requirements'), (p) => <input className="input" {...p} value={f.requirements} onChange={set('requirements')} maxLength={400} dir="auto" />, { optional: true })}
        {field('accessibility', t('form.accessibility'), (p) => <input className="input" {...p} value={f.accessibility} onChange={set('accessibility')} maxLength={300} dir="auto" />, { optional: true })}
      </fieldset>
      {editing && <p className="note warn small">{t('manage.editWarning')}</p>}
      <div className="actions sticky-actions">
        {!editing && <Button variant="secondary" busy={busy} onClick={() => onSubmit(body(), true)}>{t('form.saveDraft')}</Button>}
        <Button type="submit" busy={busy}>{editing ? t('common.save') : t('form.publish')}</Button>
      </div>
    </form>
  );
}

export function CreateOpportunity() {
  const { t } = useI18n();
  const { navigate } = useRouter();
  const q = useApi('/resident/dashboard');
  const act = useAction();
  return (
    <>
      <PageHeader backTo="/resident/opportunities" title={t('resident.newRequest')} />
      <Load q={q}>
        {(d) => {
          const approved = d.memberships.filter((m) => m.status === 'approved');
          if (!approved.length) {
            return <EmptyState icon="lock" title={t('resident.notVerified')} body={t('resident.notVerifiedBody')} action={<Link className="btn btn-primary" to="/resident/verification">{t('resident.requestMembership')}</Link>} />;
          }
          return (
            <OppForm communities={approved} busy={act.busy} fields={act.fields} error={act.error}
              onSubmit={async (body, draft) => {
                const r = await act.run(() => post('/opportunities', { ...body, draft }), { success: draft ? t('form.draftSaved') : t('form.sentForReview') });
                if (r) navigate(`/resident/opportunities/${r.opportunity.id}/applicants`, { replace: true });
              }} />
          );
        }}
      </Load>
    </>
  );
}

export function EditOpportunity({ params }) {
  const { t } = useI18n();
  const { navigate } = useRouter();
  const q = useApi(`/opportunities/${params.id}`);
  const act = useAction();
  return (
    <>
      <PageHeader backTo={`/resident/opportunities/${params.id}/applicants`} title={t('manage.edit')} />
      <Load q={q}>
        {({ opportunity: o }) => (['draft', 'pending_review', 'published', 'full'].includes(o.status)
          ? (
            <OppForm editing initial={o} communities={[]} busy={act.busy} fields={act.fields} error={act.error}
              onSubmit={async (body) => {
                const { community_id, ...rest } = body;
                const r = await act.run(() => patch(`/opportunities/${o.id}`, rest), { success: t('form.saved') });
                if (r) navigate(`/resident/opportunities/${o.id}/applicants`, { replace: true });
              }} />
          )
          : <EmptyState icon="lock" title={t('err.opportunity_not_editable')} />)}
      </Load>
    </>
  );
}

function ManageHeader({ o, current }) {
  const { t, fmt } = useI18n();
  return (
    <>
      <PageHeader backTo="/resident/opportunities" title={<bdi>{o.title}</bdi>} sub={`${fmt.date(o.date, { weekday: 'long', day: 'numeric', month: 'long' })}${fmt.sep}${fmt.time(o.start_time)}–${fmt.time(o.end_time)}`} />
      <div className="row-wrap" style={{ marginBottom: 12 }}>
        <StatusBadge kind="opp" status={o.status} />
        <span className="badge plain">{t('manage.filled', { n: fmt.num(o.accepted_count), cap: fmt.num(o.capacity) })}</span>
      </div>
      <nav className="tabs" aria-label={t('manage.sections')}>
        <Link to={`/resident/opportunities/${o.id}/applicants`} aria-current={current === 'applicants' ? 'page' : undefined}>{t('manage.applicants')}</Link>
        <Link to={`/resident/opportunities/${o.id}/participation`} aria-current={current === 'participation' ? 'page' : undefined}>{t('manage.hoursSection')}</Link>
        <Link to={`/opportunities/${o.id}`}>{t('manage.preview')}</Link>
      </nav>
    </>
  );
}

export function Applicants({ params }) {
  const { t, fmt } = useI18n();
  const { navigate } = useRouter();
  const q = useApi(`/opportunities/${params.id}/applications`);
  const act = useAction();
  const [dialog, setDialog] = useState(null); // {type, app?}
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' });
  const close = () => setDialog(null);
  const doIt = async (fn, success) => { if (await act.run(fn, { success })) { close(); q.reload(); } };
  return (
    <Load q={q}>
      {({ opportunity: o, applications }) => {
        const editable = ['draft', 'pending_review', 'published', 'full'].includes(o.status);
        const canComplete = ['published', 'full', 'closed'].includes(o.status);
        return (
          <>
            <ManageHeader o={o} current="applicants" />
            {o.review_note && <p className="note warn small" dir="auto" style={{ marginBottom: 12 }}>{t('manage.reviewNote', { note: o.review_note })}</p>}
            {o.status === 'pending_review' && <p className="note small" style={{ marginBottom: 12 }}>{t('manage.inReview')}</p>}
            {applications.length === 0
              ? <EmptyState icon="users" title={t('manage.noApplicants')} body={o.status === 'published' ? t('manage.noApplicantsBody') : t('manage.notLiveYet')} />
              : (
                <div className="panel-flush"><ul className="list">
                  {applications.map((a) => (
                    <li key={a.id} className="list-row">
                      <span className="initial" aria-hidden="true">{[...a.student_name][0]}</span>
                      <div className="grow">
                        <span className="title"><bdi>{a.student_name}</bdi></span>
                        <div className="sub">{t('manage.consent')}: {t('status.consent.' + a.consent_status)}</div>
                        {a.message && <div className="small" dir="auto" style={{ marginTop: 4 }}>“{a.message}”</div>}
                      </div>
                      <StatusBadge kind="app" status={a.status} />
                      {a.status === 'under_review' && (
                        <div className="actions" style={{ width: '100%' }}>
                          <Button size="sm" variant="secondary" onClick={() => setDialog({ type: 'reject', app: a })}>{t('manage.reject')}</Button>
                          <Button size="sm" disabled={o.status !== 'published'} onClick={() => doIt(() => post(`/applications/${a.id}/accept`), t('manage.acceptedOk'))} busy={act.busy}>{t('manage.accept')}</Button>
                        </div>
                      )}
                      {a.status === 'pending_guardian' && <p className="xs muted" style={{ width: '100%' }}>{t('manage.waitingGuardian')}</p>}
                    </li>
                  ))}
                </ul></div>
              )}
            <Section title={t('manage.actions')}>
              <div className="actions">
                {o.status === 'draft' && <Button onClick={() => doIt(() => post(`/opportunities/${o.id}/submit`), t('form.sentForReview'))} busy={act.busy}>{t('manage.submitReview')}</Button>}
                {editable && <Button variant="secondary" onClick={() => navigate(`/resident/opportunities/${o.id}/edit`)}><Icon name="pencil" size={16} />{t('manage.edit')}</Button>}
                {canComplete && <Button variant="secondary" disabled={o.date > today} onClick={() => setDialog({ type: 'complete' })}><Icon name="check" size={16} />{t('manage.complete')}</Button>}
                {['published', 'full'].includes(o.status) && <Button variant="secondary" onClick={() => setDialog({ type: 'closeApps' })}>{t('manage.closeApps')}</Button>}
                {!['cancelled', 'completed'].includes(o.status) && <Button variant="danger" onClick={() => setDialog({ type: 'cancel' })}>{t('manage.cancel')}</Button>}
              </div>
              {canComplete && o.date > today && <p className="xs muted" style={{ marginTop: 8 }}>{t('manage.completeNotYet')}</p>}
            </Section>
            <ConfirmDialog open={dialog?.type === 'reject'} onClose={close} title={t('manage.rejectTitle', { name: dialog?.app?.student_name || '' })} body={t('manage.rejectBody')}
              confirmLabel={t('manage.reject')} tone="danger" busy={act.busy} onConfirm={() => doIt(() => post(`/applications/${dialog.app.id}/reject`), t('manage.rejectedOk'))} />
            <ConfirmDialog open={dialog?.type === 'complete'} onClose={close} title={t('manage.completeTitle')} body={t('manage.completeBody')} confirmLabel={t('manage.complete')} busy={act.busy}
              onConfirm={async () => { if (await act.run(() => post(`/opportunities/${o.id}/complete`), { success: t('manage.completedOk') })) { close(); navigate(`/resident/opportunities/${o.id}/participation`); } }} />
            <ConfirmDialog open={dialog?.type === 'closeApps'} onClose={close} title={t('manage.closeTitle')} body={t('manage.closeBody')} confirmLabel={t('manage.closeApps')} busy={act.busy}
              onConfirm={() => doIt(() => post(`/opportunities/${o.id}/close`), t('manage.closedOk'))} />
            <ConfirmDialog open={dialog?.type === 'cancel'} onClose={close} title={t('manage.cancelTitle')} body={t('manage.cancelBody')} confirmLabel={t('manage.cancel')} tone="danger" busy={act.busy}
              onConfirm={() => doIt(() => post(`/opportunities/${o.id}/cancel`), t('manage.cancelledOk'))} />
            {act.error && dialog === null && <p className="form-error" role="alert" style={{ marginTop: 12 }}>{act.error}</p>}
          </>
        );
      }}
    </Load>
  );
}

export function Participation({ params }) {
  const { t, fmt } = useI18n();
  const q = useApi(`/opportunities/${params.id}/applications`);
  const act = useAction();
  const [target, setTarget] = useState(null);
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  return (
    <Load q={q}>
      {({ opportunity: o, applications }) => {
        const recs = applications.filter((a) => a.participation);
        return (
          <>
            <ManageHeader o={o} current="participation" />
            <p className="small muted" style={{ marginBottom: 12 }}>{t('manage.hoursExplainer')}</p>
            {recs.length === 0
              ? <EmptyState icon="clock" title={t('manage.noRecords')} body={o.status === 'completed' ? t('manage.noRecordsCompleted') : t('manage.noRecordsBody')} />
              : (
                <div className="cards">
                  {recs.map((a) => {
                    const p = a.participation;
                    const open = ['awaiting_confirmation', 'correction_requested'].includes(p.status);
                    return (
                      <article key={a.id} className="panel stack">
                        <div className="row between"><h3>{a.student_name}</h3><StatusBadge kind="hours" status={p.status} /></div>
                        <VerificationTimeline r={p} />
                        {p.status === 'correction_requested' && p.note && <p className="note warn small" dir="auto">{t('manage.correctionNeeded', { note: p.note })}</p>}
                        {open && <Button onClick={() => { setTarget(a); setHours(String(o.duration_hours)); setNote(''); }}>{t('manage.confirmHours')}</Button>}
                      </article>
                    );
                  })}
                </div>
              )}
            <Sheet open={!!target} onClose={() => setTarget(null)} title={t('manage.confirmHours')}
              footer={<>
                <Button variant="secondary" onClick={() => setTarget(null)}>{t('common.cancel')}</Button>
                <Button busy={act.busy} onClick={async () => {
                  if (await act.run(() => post(`/participation/${target.participation.id}/confirm`, { hours: Number(hours), note }), { success: t('manage.hoursConfirmed') })) { setTarget(null); q.reload(); }
                }}>{t('manage.confirmHours')}</Button>
              </>}>
              <p>{t('manage.confirmHoursBody', { name: target?.student_name || '', max: fmt.num(o.duration_hours) })}</p>
              <FormField label={t('manage.hoursField')} error={act.fields.hours}>
                {(p) => <input className="input" type="number" inputMode="decimal" step="0.25" min="0.25" max={o.duration_hours} {...p} value={hours} onChange={(e) => setHours(e.target.value)} />}
              </FormField>
              <FormField label={t('manage.noteField')} optional>
                {(p) => <textarea className="textarea" {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} dir="auto" />}
              </FormField>
            </Sheet>
          </>
        );
      }}
    </Load>
  );
}

export function History() {
  const { t } = useI18n();
  const q = useApi('/opportunities/mine');
  return (
    <>
      <PageHeader title={t('nav.history')} sub={t('requests.historySub')} />
      <Load q={q}>
        {(d) => {
          const past = d.opportunities.filter((o) => ['completed', 'cancelled'].includes(o.status));
          return past.length === 0
            ? <EmptyState icon="history" title={t('requests.noPast')} body={t('requests.noPastBody')} />
            : <div className="cards">{past.map((o) => <OpportunityCard key={o.id} o={o} to={`/resident/opportunities/${o.id}/participation`} showStatus />)}</div>;
        }}
      </Load>
    </>
  );
}
