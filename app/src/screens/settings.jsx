import { useEffect, useState } from 'react';
import { api, patch, post } from '../api.js';
import { readAppearance, saveAppearance } from '../appearance.js';
import { useI18n } from '../i18n.js';
import { Icon } from '../icons.jsx';
import { MORE } from '../nav.js';
import { Link, useRouter } from '../router.jsx';
import {
  Button, ConfirmDialog, EmptyState, FormField, Load, Meta, PageHeader, Section, Sheet, StatusBadge,
  useAction, useApi, useAuth, useToast, Avatar, AVATARS,
} from '../ui.jsx';
import { ReportSheet } from './shared.jsx';

const CATS = ['cleanup', 'gardening', 'seniors', 'reading', 'pets', 'events', 'tutoring', 'other'];
const EMIRATES = ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'];
const BACK = '/settings';

/** iOS-style switch: a real button with role="switch", keyboard and screen-reader operable. */
export function Switch({ checked, onChange, label, hint, disabled }) {
  return (
    <div className="setting-row">
      <div className="grow">
        <span className="title">{label}</span>
        {hint && <span className="sub">{hint}</span>}
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" disabled={disabled} onClick={() => onChange(!checked)}>
        <span className="knob" />
      </button>
    </div>
  );
}

function Segmented({ value, options, onChange, label }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}

function Group({ title, children, footer }) {
  return (
    <section className="settings-group">
      {title && <h2 className="group-title">{title}</h2>}
      <div className="group-body">{children}</div>
      {footer && <p className="group-foot">{footer}</p>}
    </section>
  );
}

function NavRow({ to, icon, title, sub, onClick }) {
  const inner = (
    <>
      {icon && <span className="row-icon" aria-hidden="true"><Icon name={icon} size={20} /></span>}
      <span className="grow"><span className="title">{title}</span>{sub && <span className="sub">{sub}</span>}</span>
      <Icon name="chev" size={18} className="chev" />
    </>
  );
  return onClick
    ? <button type="button" className="setting-row nav" onClick={onClick}>{inner}</button>
    : <Link to={to} className="setting-row nav">{inner}</Link>;
}

/** Saves one preference patch to the server and refreshes the signed-in user. */
function usePrefs() {
  const { setUser } = useAuth();
  const { t } = useI18n();
  const act = useAction();
  const save = async (body, msg = t('settings.saved')) => {
    const r = await act.run(() => patch('/me/prefs', body), { success: msg });
    if (r) setUser(r.user);
    return r;
  };
  return { save, act };
}

// ---------------- hub ----------------
export function Hub() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const sections = [
    ['account', 'user', t('settings.account'), t('settings.accountSub')],
    ['appearance', 'eye', t('settings.appearance'), t('settings.appearanceSub', { lang: lang === 'ar' ? 'العربية' : 'English' })],
    ['notifications', 'bell', t('settings.notifications'), t('settings.notificationsSub')],
    ...(['student', 'resident'].includes(user.role) ? [['preferences', 'building', t('settings.preferences'), t('settings.preferencesSub')]] : []),
    ['privacy', 'lock', t('settings.privacy'), t('settings.privacySub')],
    ['help', 'help', t('settings.help'), t('settings.helpSub')],
  ];
  return (
    <>
      <PageHeader title={t('nav.settings')} />
      <Link to="/settings/account" className="profile-card">
        <Avatar user={user} size={56} />
        <span className="grow">
          <span className="name"><bdi>{user.display_name}</bdi></span>
          <span className="sub">{t('role.' + user.role)}</span>
          <span className="sub email">{user.email}</span>
        </span>
        <Icon name="chev" size={18} className="chev" />
      </Link>
      <Group>
        {sections.map(([k, icon, title, sub]) => <NavRow key={k} to={`/settings/${k}`} icon={icon} title={title} sub={sub} />)}
      </Group>
      {(MORE[user.role] || []).length > 0 && (
        <Group title={t('settings.more')}>
          {MORE[user.role].map(([to, icon, label]) => <NavRow key={to} to={to} icon={icon} title={t(label)} />)}
        </Group>
      )}
      <SignOut />
    </>
  );
}

function SignOut() {
  const { t } = useI18n();
  const { setUser } = useAuth();
  const { navigate } = useRouter();
  return (
    <Group>
      <button type="button" className="setting-row nav danger-text" onClick={async () => { await post('/auth/logout').catch(() => {}); setUser(null); navigate('/', { replace: true }); }}>
        <span className="row-icon" aria-hidden="true"><Icon name="logout" size={20} /></span>
        <span className="grow"><span className="title">{t('auth.logout')}</span></span>
      </button>
    </Group>
  );
}

// ---------------- account & profile ----------------
export function Account() {
  const { t, lang } = useI18n();
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user.display_name);
  const nameAct = useAction();
  const { save } = usePrefs();
  const mine = useApi('/memberships/mine');
  const comms = useApi('/communities');
  const [pw, setPw] = useState({ current: '', next: '' });
  const pwAct = useAction();
  const [del, setDel] = useState(false);
  const communityName = (id) => {
    const c = comms.data?.communities.find((x) => x.id === id);
    return c ? (lang === 'ar' ? c.name_ar : c.name) : '';
  };
  const commLink = user.role === 'student' ? '/student/communities' : user.role === 'resident' ? '/resident/communities' : null;
  return (
    <>
      <PageHeader backTo={BACK} title={t('settings.account')} />
      <Group title={t('settings.profilePicture')} footer={t('settings.avatarNote')}>
        <div className="setting-row">
          <Avatar user={user} size={56} />
          <div className="swatches" role="radiogroup" aria-label={t('settings.avatarColour')}>
            {Object.entries(AVATARS).map(([k, c]) => (
              <button key={k} type="button" role="radio" aria-checked={(user.prefs?.avatar || 'deep') === k} aria-label={t('settings.colour.' + k)}
                className="swatch" style={{ background: c }} onClick={() => save({ avatar: k })} />
            ))}
          </div>
        </div>
      </Group>
      <Group title={t('profile.name')}>
        <form className="setting-row form-row" onSubmit={async (e) => {
          e.preventDefault();
          const r = await nameAct.run(() => patch('/me', { display_name: name }), { success: t('profile.saved') });
          if (r) setUser(r.user);
        }}>
          <FormField label={t('profile.name')} hint={t('auth.displayNameHint')} error={nameAct.fields.display_name}>
            {(p) => <input className="input" {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} dir="auto" />}
          </FormField>
          <Button type="submit" variant="secondary" busy={nameAct.busy} disabled={name.trim() === user.display_name}>{t('common.save')}</Button>
        </form>
      </Group>
      <Group title={t('settings.roleTitle')} footer={t('settings.roleNote.' + user.role)}>
        <div className="setting-row"><span className="grow"><span className="title">{t('role.' + user.role)}</span><span className="sub email">{user.email}</span></span></div>
      </Group>
      {commLink && (
        <Group title={t('settings.linkedCommunities')}>
          <Load q={mine} rows={1}>
            {(d) => (d.memberships.length === 0
              ? <NavRow to={commLink} icon="building" title={t('home.joinCta')} />
              : (
                <>
                  {d.memberships.map((m) => (
                    <div key={m.community_id} className="setting-row">
                      <span className="grow"><span className="title">{communityName(m.community_id)}</span></span>
                      <StatusBadge kind="membership" status={m.status} />
                    </div>
                  ))}
                  <NavRow to={commLink} title={t('settings.manageCommunities')} />
                </>
              ))}
          </Load>
        </Group>
      )}
      <Group title={t('settings.password')} footer={t('settings.passwordNote')}>
        <form className="setting-row form-row" method="post" onSubmit={async (e) => {
          e.preventDefault();
          if (await pwAct.run(() => post('/me/password', pw), { success: t('settings.passwordChanged') })) setPw({ current: '', next: '' });
        }}>
          <input type="text" name="username" autoComplete="username" value={user.email} readOnly hidden />
          <FormField label={t('settings.currentPassword')} error={pwAct.fields.current}>
            {(p) => <input className="input" type="password" autoComplete="current-password" dir="ltr" {...p} value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />}
          </FormField>
          <FormField label={t('settings.newPassword')} hint={t('auth.passwordHint')} error={pwAct.fields.next}>
            {(p) => <input className="input" type="password" autoComplete="new-password" dir="ltr" {...p} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />}
          </FormField>
          <Button type="submit" variant="secondary" busy={pwAct.busy} disabled={!pw.current || pw.next.length < 8}>{t('settings.changePassword')}</Button>
        </form>
      </Group>
      {user.role !== 'admin' && (
        <Group title={t('settings.dangerZone')} footer={t('settings.deleteNote')}>
          <button type="button" className="setting-row nav danger-text" onClick={() => setDel(true)}>
            <span className="grow"><span className="title">{t('settings.deleteAccount')}</span></span>
          </button>
        </Group>
      )}
      <DeleteAccount open={del} onClose={() => setDel(false)} />
    </>
  );
}

function DeleteAccount({ open, onClose }) {
  const { t, lang } = useI18n();
  const { setUser } = useAuth();
  const { navigate } = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const act = useAction();
  const word = lang === 'ar' ? 'حذف' : 'DELETE';
  useEffect(() => { if (open) { setPassword(''); setConfirm(''); } }, [open]);
  return (
    <ConfirmDialog open={open} onClose={onClose} title={t('settings.deleteTitle')} body={t('settings.deleteBody')} tone="danger"
      confirmLabel={t('settings.deleteAccount')} busy={act.busy} confirmDisabled={!password || confirm.trim() !== word}
      onConfirm={async () => {
        if (await act.run(() => post('/me/delete', { password, confirm: confirm.trim() }))) { setUser(null); navigate('/', { replace: true }); }
      }}>
      <FormField label={t('auth.password')} error={act.fields.password}>
        {(p) => <input className="input" type="password" autoComplete="current-password" dir="ltr" {...p} value={password} onChange={(e) => setPassword(e.target.value)} />}
      </FormField>
      <FormField label={t('settings.typeToConfirm', { word })} error={act.fields.confirm}>
        {(p) => <input className="input" {...p} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />}
      </FormField>
      {act.error && <p className="form-error" role="alert">{act.error}</p>}
    </ConfirmDialog>
  );
}

// ---------------- appearance & language ----------------
export function Appearance() {
  const { t, lang, setLang } = useI18n();
  const [a, setA] = useState(readAppearance);
  const set = (patchObj) => { const next = { ...a, ...patchObj }; setA(next); saveAppearance(next); };
  return (
    <>
      <PageHeader backTo={BACK} title={t('settings.appearance')} />
      <Group title={t('profile.language')} footer={t('settings.languageNote')}>
        <div className="setting-row">
          <Segmented label={t('profile.language')} value={lang} onChange={setLang} options={[['en', 'English'], ['ar', 'العربية']]} />
        </div>
      </Group>
      <Group title={t('settings.theme')} footer={t('settings.deviceNote')}>
        <div className="setting-row">
          <Segmented label={t('settings.theme')} value={a.theme} onChange={(v) => set({ theme: v })}
            options={[['system', t('settings.theme.system')], ['light', t('settings.theme.light')], ['dark', t('settings.theme.dark')]]} />
        </div>
      </Group>
      <Group title={t('settings.textSize')}>
        <div className="setting-row">
          <Segmented label={t('settings.textSize')} value={a.text} onChange={(v) => set({ text: v })}
            options={[['default', t('settings.text.default')], ['large', t('settings.text.large')], ['larger', t('settings.text.larger')]]} />
        </div>
        <p className="setting-row preview-text">{t('settings.textPreview')}</p>
      </Group>
      <Group title={t('settings.accessibility')}>
        <Switch label={t('settings.reduceMotion')} hint={t('settings.reduceMotionHint')} checked={a.motion === 'reduce'} onChange={(v) => set({ motion: v ? 'reduce' : 'system' })} />
        <Switch label={t('settings.underlineLinks')} hint={t('settings.underlineLinksHint')} checked={a.underline} onChange={(v) => set({ underline: v })} />
      </Group>
    </>
  );
}

// ---------------- notifications ----------------
const NOTIFY_FOR = {
  student: ['applications', 'new_opportunities', 'reminders', 'announcements', 'hours'],
  resident: ['applications', 'announcements', 'hours'],
  guardian: ['applications'],
  moderator: ['hours'],
  admin: [],
};
export function Notifications() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { save, act } = usePrefs();
  const n = user.prefs?.notify || {};
  const keys = NOTIFY_FOR[user.role] || [];
  return (
    <>
      <PageHeader backTo={BACK} title={t('settings.notifications')} />
      {keys.length > 0 && (
        <Group title={t('settings.inApp')} footer={t('settings.notifyNote')}>
          {keys.map((k) => (
            <Switch key={k} label={t('settings.notify.' + k)} hint={t('settings.notify.' + k + 'Hint')} checked={n[k] !== false} disabled={act.busy}
              onChange={(v) => save({ notify: { [k]: v } })} />
          ))}
        </Group>
      )}
      <Group title={t('settings.alwaysOn')} footer={t('settings.alwaysOnNote')}>
        <div className="setting-row"><span className="grow"><span className="title">{t('settings.safetyNotices')}</span><span className="sub">{t('settings.safetyNoticesHint.' + user.role)}</span></span><Icon name="lock" size={18} /></div>
      </Group>
      <Group footer={t('settings.noEmail')}>
        <NavRow to="/notifications" icon="bell" title={t('nav.notifications')} />
      </Group>
    </>
  );
}

// ---------------- community preferences ----------------
export function Preferences() {
  const { t } = useI18n();
  const { user, setUser } = useAuth();
  const { save, act } = usePrefs();
  const p = user.prefs || {};
  const [interests, setInterests] = useState(user.interests || []);
  const intAct = useAction();
  const days = p.availability?.days || [];
  const times = p.availability?.times || [];
  const toggle = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const commLink = user.role === 'student' ? '/student/communities' : '/resident/communities';
  return (
    <>
      <PageHeader backTo={BACK} title={t('settings.preferences')} sub={t('settings.preferencesNote')} />
      <Group title={t('settings.emirate')}>
        <div className="setting-row">
          <select className="select" aria-label={t('settings.emirate')} value={p.emirate || ''} disabled={act.busy} onChange={(e) => save({ emirate: e.target.value || null })}>
            <option value="">{t('settings.anyEmirate')}</option>
            {EMIRATES.map((e) => <option key={e} value={e}>{t('emirate.' + e)}</option>)}
          </select>
        </div>
      </Group>
      <Group title={t('nav.communities')}>
        <NavRow to={commLink} icon="building" title={t('settings.manageCommunities')} />
      </Group>
      {user.role === 'student' && (
        <>
          <Group title={t('profile.interests')} footer={t('profile.interestsHint')}>
            <div className="setting-row">
              <div className="chips wrap" role="group" aria-label={t('profile.interests')}>
                {CATS.map((c) => <button key={c} type="button" className="chip" aria-pressed={interests.includes(c)} onClick={() => setInterests(toggle(interests, c))}>{t('cat.' + c)}</button>)}
              </div>
            </div>
            <div className="setting-row">
              <Button variant="secondary" busy={intAct.busy} disabled={JSON.stringify(interests) === JSON.stringify(user.interests || [])}
                onClick={async () => { const r = await intAct.run(() => patch('/me', { interests }), { success: t('settings.saved') }); if (r) setUser(r.user); }}>{t('common.save')}</Button>
            </div>
          </Group>
          <Group title={t('settings.availability')} footer={t('settings.availabilityNote')}>
            <div className="setting-row">
              <div className="chips wrap" role="group" aria-label={t('settings.availability')}>
                {['weekdays', 'weekends'].map((d) => <button key={d} type="button" className="chip" aria-pressed={days.includes(d)} disabled={act.busy} onClick={() => save({ availability: { days: toggle(days, d), times } })}>{t('settings.day.' + d)}</button>)}
                {['morning', 'afternoon', 'evening'].map((x) => <button key={x} type="button" className="chip" aria-pressed={times.includes(x)} disabled={act.busy} onClick={() => save({ availability: { days, times: toggle(times, x) } })}>{t('settings.time.' + x)}</button>)}
              </div>
            </div>
          </Group>
          <Group title={t('settings.distance')} footer={t('settings.distanceNote')}>
            <div className="setting-row">
              <Segmented label={t('settings.distance')} value={p.distance || 'community'} onChange={(v) => save({ distance: v })}
                options={[['walking', t('settings.distance.walking')], ['community', t('settings.distance.community')], ['emirate', t('settings.distance.emirate')]]} />
            </div>
          </Group>
        </>
      )}
    </>
  );
}

// ---------------- privacy & security ----------------
function deviceName(ua, t) {
  if (!ua) return t('settings.unknownDevice');
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return [br, os].filter(Boolean).join(' · ') || t('settings.unknownDevice');
}

export function Privacy() {
  const { t, fmt } = useI18n();
  const { user } = useAuth();
  const { save } = usePrefs();
  const toast = useToast();
  const sessions = useApi('/me/sessions');
  const connections = useApi(['student', 'guardian'].includes(user.role) ? '/me/connections' : null);
  const reports = useApi('/reports/mine');
  const act = useAction();
  const [removeLink, setRemoveLink] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  return (
    <>
      <PageHeader backTo={BACK} title={t('settings.privacy')} />
      {user.role === 'student' && (
        <Group title={t('settings.visibility')} footer={t('settings.visibilityNote')}>
          <div className="setting-row">
            <Segmented label={t('settings.visibility')} value={user.prefs?.visibility || 'name'} onChange={(v) => save({ visibility: v })}
              options={[['name', t('settings.visibility.name')], ['initials', t('settings.visibility.initials')]]} />
          </div>
        </Group>
      )}
      {['student', 'guardian'].includes(user.role) && (
        <Group title={t('settings.guardianConnections')} footer={user.role === 'student' ? t('profile.linkCodeHint') : t('guardian.noStudentsBody')}>
          {user.role === 'student' && (
            <div className="setting-row"><span className="grow"><span className="title">{t('profile.linkCode')}</span></span><span className="code-inline">{user.link_code}</span></div>
          )}
          <Load q={connections} rows={1}>
            {(d) => (d.connections.length === 0
              ? <div className="setting-row"><span className="sub">{t(user.role === 'student' ? 'settings.noGuardians' : 'guardian.noStudents')}</span></div>
              : d.connections.map((c) => (
                <div key={c.id} className="setting-row">
                  <span className="grow"><span className="title"><bdi>{c.display_name}</bdi></span><span className="sub">{t('settings.linkedSince', { date: fmt.date(c.created_at.slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' }) })}</span></span>
                  <Button size="sm" variant="danger" onClick={() => setRemoveLink(c)}>{t('settings.unlink')}</Button>
                </div>
              )))}
          </Load>
          {user.role === 'guardian' && <NavRow to="/guardian/students" title={t('guardian.linkTitle')} />}
        </Group>
      )}
      <Group title={t('settings.yourData')} footer={t('settings.exportNote')}>
        <a className="setting-row nav" href="/api/me/export" download>
          <span className="row-icon" aria-hidden="true"><Icon name="download" size={20} /></span>
          <span className="grow"><span className="title">{t('settings.exportData')}</span><span className="sub">JSON</span></span>
        </a>
        {user.role === 'student' && <NavRow to="/student/hours" icon="clock" title={t('hours.export')} />}
      </Group>
      <Group title={t('settings.sessions')} footer={t('settings.sessionsNote')}>
        <Load q={sessions} rows={1}>
          {(d) => (
            <>
              {d.sessions.map((s) => (
                <div key={s.id} className="setting-row">
                  <span className="grow">
                    <span className="title">{deviceName(s.device, t)}</span>
                    <Meta parts={[s.current ? t('settings.thisDevice') : null, s.created_at ? t('settings.signedIn', { date: fmt.dateTime(s.created_at) }) : null]} />
                  </span>
                  {!s.current && <Button size="sm" variant="secondary" busy={act.busy} onClick={async () => { if (await act.run(() => post(`/me/sessions/${s.id}/revoke`), { success: t('settings.signedOutDevice') })) sessions.reload(); }}>{t('auth.logout')}</Button>}
                </div>
              ))}
              {d.sessions.length > 1 && (
                <button type="button" className="setting-row nav danger-text" onClick={async () => { if (await act.run(() => post('/me/sessions/revoke-others'), { success: t('settings.signedOutOthers') })) sessions.reload(); }}>
                  <span className="grow"><span className="title">{t('settings.signOutOthers')}</span></span>
                </button>
              )}
            </>
          )}
        </Load>
      </Group>
      <Group title={t('settings.reporting')}>
        <NavRow icon="flag" title={t('settings.reportProblem')} sub={t('settings.reportProblemSub')} onClick={() => setReportOpen(true)} />
        <Load q={reports} rows={1}>
          {(d) => d.reports.map((r) => (
            <div key={r.id} className="setting-row">
              <span className="grow"><span className="title">{t('repcat.' + r.category)}</span><span className="sub">{fmt.dateTime(r.created_at)}</span></span>
              <StatusBadge kind="report" status={r.status} />
            </div>
          ))}
        </Load>
      </Group>
      <Group title={t('settings.accountManagement')}>
        <NavRow to="/settings/account" icon="user" title={t('settings.account')} sub={t('settings.accountManagementSub')} />
      </Group>
      <ConfirmDialog open={!!removeLink} onClose={() => setRemoveLink(null)} tone="danger" title={t('settings.unlinkTitle', { name: removeLink?.display_name || '' })}
        body={t(user.role === 'student' ? 'settings.unlinkBodyStudent' : 'settings.unlinkBodyGuardian')} confirmLabel={t('settings.unlink')} busy={act.busy}
        onConfirm={async () => { if (await act.run(() => post(`/me/connections/${removeLink.id}/remove`), { success: t('settings.unlinked') })) { setRemoveLink(null); connections.reload(); } }} />
      <ReportSheet open={reportOpen} onClose={() => setReportOpen(false)} onSent={() => { toast(t('report.sent')); reports.reload(); }} />
    </>
  );
}

// ---------------- help & about ----------------
export function Help() {
  const { t } = useI18n();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader backTo={BACK} title={t('settings.help')} />
      <Group>
        <NavRow to="/help" icon="help" title={t('settings.faq')} />
        <NavRow icon="inbox" title={t('settings.contactSupport')} sub={t('settings.contactSupportSub')} onClick={() => setOpen(true)} />
        <NavRow icon="flag" title={t('settings.reportProblem')} onClick={() => setOpen(true)} />
      </Group>
      <Group>
        <NavRow to="/safety" icon="shieldCheck" title={t('settings.guidelines')} />
        <NavRow to="/terms" icon="doc" title={t('nav.terms')} />
        <NavRow to="/privacy" icon="lock" title={t('nav.privacy')} />
        <NavRow to="/about" icon="info" title={t('nav.about')} />
      </Group>
      <Group footer={t('common.emergency')}>
        <div className="setting-row">
          <img src="/logo-mark.png" alt="" width="36" height="62" style={{ height: 40, width: 'auto' }} />
          <span className="grow"><span className="title">{t('app.name')}</span><span className="sub">{t('app.tagline')}</span></span>
          <span className="sub ltr">{t('settings.version', { v: __APP_VERSION__ })}</span>
        </div>
      </Group>
      <ReportSheet open={open} onClose={() => setOpen(false)} onSent={() => toast(t('report.sent'))} />
    </>
  );
}
