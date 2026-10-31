import { useState } from 'react';
import { post } from '../api.js';
import { useI18n } from '../i18n.js';
import { Icon } from '../icons.jsx';
import { Link } from '../router.jsx';
import {
  Button, ConfirmDialog, ConsentCard, EmptyState, FormField, Load, PageHeader, ReasonDialog, Section, StatusBadge,
  useAction, useApi, useAuth, Meta,
} from '../ui.jsx';

function LinkStudentForm({ onLinked }) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const act = useAction();
  return (
    <form className="panel stack" onSubmit={async (e) => {
      e.preventDefault();
      if (await act.run(() => post('/guardian/link', { code: code.trim().toUpperCase() }), { success: t('guardian.linked.ok') })) { setCode(''); onLinked(); }
    }}>
      <h2 style={{ fontSize: 'var(--fs-m)' }}>{t('guardian.linkTitle')}</h2>
      <FormField label={t('guardian.linkCode')} hint={t('guardian.noStudentsBody')} error={act.fields.code}>
        {(p) => <input className="input ltr" {...p} value={code} onChange={(e) => setCode(e.target.value)} maxLength={8} autoCapitalize="characters" autoComplete="off" spellCheck={false} style={{ letterSpacing: '0.15em', fontWeight: 600 }} />}
      </FormField>
      {act.error && <p className="form-error" role="alert">{act.error}</p>}
      <Button type="submit" busy={act.busy} disabled={code.trim().length !== 8}><Icon name="link" size={18} />{t('guardian.linkCta')}</Button>
    </form>
  );
}

function StudentRow({ s }) {
  const { t, fmt } = useI18n();
  return (
    <li className="list-row person-row">
      <span className="initial" aria-hidden="true">{[...s.display_name][0]}</span>
      <div className="grow">
        <span className="title"><bdi>{s.display_name}</bdi></span>
        <Meta parts={[t('guardian.studentAge', { n: fmt.num(s.age) }), t('guardian.activeActivities', { n: fmt.num(s.active_activities) })]} />
      </div>
      <span className="badge ok plain">{t('guardian.studentHours', { n: fmt.num(s.verified_hours) })}</span>
    </li>
  );
}

function useConsentActions(reload) {
  const { t } = useI18n();
  const act = useAction();
  const [dlg, setDlg] = useState(null);
  const decide = async (c, decision, reason) => {
    const ok = await act.run(() => post(`/consents/${c.id}/decide`, { decision, reason }), { success: t(decision === 'approved' ? 'guardian.approved' : 'guardian.rejected') });
    if (ok) { setDlg(null); reload(); }
  };
  const withdraw = async (c, reason) => {
    if (await act.run(() => post(`/consents/${c.id}/withdraw`, { reason }), { success: t('guardian.withdrawn') })) { setDlg(null); reload(); }
  };
  const dialogs = (
    <>
      <ConfirmDialog open={dlg?.type === 'approve'} onClose={() => setDlg(null)} title={t('guardian.approveTitle', { student: dlg?.c?.student.display_name || '' })}
        body={t('guardian.consentLegal')} confirmLabel={t('guardian.approve')} busy={act.busy} onConfirm={() => decide(dlg.c, 'approved')} />
      <ReasonDialog open={dlg?.type === 'decline'} onClose={() => setDlg(null)} required={false} title={t('guardian.declineTitle')} body={t('guardian.declineBody')}
        confirmLabel={t('guardian.decline')} busy={act.busy} onConfirm={(r) => decide(dlg.c, 'rejected', r)} />
      <ReasonDialog open={dlg?.type === 'withdraw'} onClose={() => setDlg(null)} required={false} title={t('guardian.withdrawTitle')} body={t('guardian.withdrawBody')}
        confirmLabel={t('guardian.withdraw')} busy={act.busy} onConfirm={(r) => withdraw(dlg.c, r)} />
    </>
  );
  return { setDlg, dialogs, act };
}

function ConsentActions({ c, setDlg }) {
  const { t } = useI18n();
  if (c.status === 'pending') {
    return (
      <div className="actions">
        <Button variant="secondary" onClick={() => setDlg({ type: 'decline', c })}>{t('guardian.decline')}</Button>
        <Button onClick={() => setDlg({ type: 'approve', c })}><Icon name="check" size={18} />{t('guardian.approve')}</Button>
      </div>
    );
  }
  if (c.status === 'approved' && ['under_review', 'accepted'].includes(c.application_status)) {
    return <Button variant="danger" onClick={() => setDlg({ type: 'withdraw', c })}>{t('guardian.withdraw')}</Button>;
  }
  return null;
}

export function Home() {
  const { t, fmt } = useI18n();
  const { user } = useAuth();
  const q = useApi('/guardian/dashboard');
  const ca = useConsentActions(q.reload);
  return (
    <>
      <PageHeader title={t('home.hello', { name: user.display_name })} />
      <Load q={q} rows={3}>
        {(d) => (
          <>
            {d.students.length === 0 ? (
              <div className="stack">
                <EmptyState icon="users" title={t('guardian.noStudents')} body={t('guardian.noStudentsBody')} />
                <LinkStudentForm onLinked={q.reload} />
              </div>
            ) : (
              <Section title={t('guardian.pending')} action={<Link to="/guardian/consents" className="small">{t('common.viewAll')}</Link>}>
                {d.pending.length === 0
                  ? <p className="muted small">{t('guardian.noPendingBody')}</p>
                  : <div className="cards">{d.pending.map((c) => <ConsentCard key={c.id} c={c}><ConsentActions c={c} setDlg={ca.setDlg} /></ConsentCard>)}</div>}
              </Section>
            )}
            {d.students.length > 0 && (
              <Section title={t('guardian.linked')} action={<Link to="/guardian/students" className="small">{t('guardian.manage')}</Link>}>
                <div className="panel-flush"><ul className="list">{d.students.map((s) => <StudentRow key={s.id} s={s} />)}</ul></div>
              </Section>
            )}
            {d.history.length > 0 && (
              <Section title={t('guardian.history')}>
                <p className="small muted">{t('guardian.historyCount', { n: fmt.num(d.history.length) })} <Link to="/guardian/consents?tab=history">{t('common.viewAll')}</Link></p>
              </Section>
            )}
            {ca.dialogs}
          </>
        )}
      </Load>
    </>
  );
}

export function Students() {
  const { t } = useI18n();
  const q = useApi('/guardian/dashboard');
  return (
    <>
      <PageHeader title={t('guardian.linked')} sub={t('guardian.studentsSub')} />
      <Load q={q}>
        {(d) => (
          <div className="stack-l">
            {d.students.length === 0
              ? <EmptyState icon="users" title={t('guardian.noStudents')} body={t('guardian.noStudentsBody')} />
              : <div className="panel-flush"><ul className="list">{d.students.map((s) => <StudentRow key={s.id} s={s} />)}</ul></div>}
            <LinkStudentForm onLinked={q.reload} />
          </div>
        )}
      </Load>
    </>
  );
}

export function Consents() {
  const { t, fmt } = useI18n();
  const initial = new URLSearchParams(window.location.search).get('tab') === 'history' ? 'history' : 'pending';
  const [tab, setTab] = useState(initial);
  const q = useApi('/guardian/dashboard');
  const ca = useConsentActions(q.reload);
  return (
    <>
      <PageHeader title={t('guardian.home')} />
      <Load q={q}>
        {(d) => (
          <>
            <div className="tabs" role="tablist" aria-label={t('guardian.home')}>
              <button role="tab" aria-selected={tab === 'pending'} onClick={() => setTab('pending')}>{t('guardian.pending')}{d.pending.length > 0 && <span className="count">{d.pending.length}</span>}</button>
              <button role="tab" aria-selected={tab === 'history'} onClick={() => setTab('history')}>{t('guardian.history')}</button>
            </div>
            {tab === 'pending' && (d.pending.length === 0
              ? <EmptyState icon="shieldCheck" title={t('guardian.noPending')} body={t('guardian.noPendingBody')} />
              : <div className="cards" role="tabpanel">{d.pending.map((c) => <ConsentCard key={c.id} c={c}><ConsentActions c={c} setDlg={ca.setDlg} /></ConsentCard>)}</div>)}
            {tab === 'history' && (d.history.length === 0
              ? <EmptyState icon="history" title={t('guardian.noHistory')} />
              : (
                <div className="panel-flush" role="tabpanel"><ul className="list">
                  {d.history.map((c) => (
                    <li key={c.id}>
                      <Link to={`/guardian/consents/${c.id}`} className="list-row">
                        <div className="grow">
                          <div className="title">{c.opportunity.title}</div>
                          <Meta parts={[c.student.display_name, fmt.date(c.opportunity.date)]} />
                        </div>
                        <StatusBadge kind="consent" status={c.status} />
                        <Icon name="chev" size={18} className="chev" />
                      </Link>
                    </li>
                  ))}
                </ul></div>
              ))}
            {ca.dialogs}
          </>
        )}
      </Load>
    </>
  );
}

export function ConsentDetail({ params }) {
  const { t, fmt } = useI18n();
  const q = useApi('/guardian/dashboard');
  const ca = useConsentActions(q.reload);
  return (
    <>
      <Load q={q}>
        {(d) => {
          const c = [...d.pending, ...d.history].find((x) => x.id === params.id);
          if (!c) return <EmptyState icon="search" title={t('detail.notFound')} body={t('guardian.notFoundBody')} action={<Link className="btn btn-primary" to="/guardian/consents">{t('guardian.home')}</Link>} />;
          return (
            <>
              <PageHeader backTo="/guardian/consents" title={t('guardian.decisionTitle')} />
              <ConsentCard c={c}>
                {c.decided_at && <p className="xs muted">{t('guardian.decidedOn', { date: fmt.dateTime(c.decided_at) })}</p>}
                {c.reason && <p className="small" dir="auto">{t('verification.reason', { reason: c.reason })}</p>}
                <ConsentActions c={c} setDlg={ca.setDlg} />
              </ConsentCard>
              {ca.dialogs}
            </>
          );
        }}
      </Load>
    </>
  );
}
