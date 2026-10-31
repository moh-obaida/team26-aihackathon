// Device-level display preferences. Applied before React renders so there is no flash.
const KEY = 'jeran.appearance';
export const DEFAULT_APPEARANCE = { theme: 'system', text: 'default', motion: 'system', underline: false };

export function readAppearance() {
  try { return { ...DEFAULT_APPEARANCE, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULT_APPEARANCE }; }
}

export function applyAppearance(a) {
  const root = document.documentElement;
  const dark = a.theme === 'dark' || (a.theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.text = a.text;
  root.dataset.motion = a.motion === 'reduce' ? 'reduce' : 'system';
  root.dataset.underline = a.underline ? 'on' : 'off';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0d1f24' : '#ffffff');
}

export function saveAppearance(a) {
  try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* storage unavailable: applies for this visit only */ }
  applyAppearance(a);
}

export function watchSystemTheme() {
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  mq?.addEventListener?.('change', () => applyAppearance(readAppearance()));
}
