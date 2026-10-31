// Secondary destinations per role, listed under Settings → More. The tab bar holds only the primary ones.
export const MORE = {
  student: [['/explore', 'globe', 'nav.explore'], ['/student/activities', 'calendar', 'nav.activities'], ['/student/history', 'history', 'nav.history'], ['/student/communities', 'building', 'nav.communities']],
  resident: [['/explore', 'globe', 'nav.explore'], ['/resident/verification', 'shieldCheck', 'nav.verification'], ['/resident/history', 'history', 'nav.history']],
  guardian: [['/explore', 'globe', 'nav.explore']],
  moderator: [['/moderator/opportunities', 'list', 'mod.opportunities'], ['/moderator/hours', 'clock', 'mod.hours']],
  admin: [['/admin/audit', 'history', 'nav.audit'], ['/admin/moderators', 'shield', 'nav.moderators'], ['/admin/verification', 'clock', 'nav.verificationOversight'], ['/admin/settings', 'gear', 'nav.platformSettings']],
};
