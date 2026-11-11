import type { Settings } from '../db/types';

const dark = matchMedia('(prefers-color-scheme: dark)');

/** Applies theme (light, dark, system), text size and the theme colour of the browser bar. */
export function applyLook(s: Settings): void {
  const root = document.documentElement;
  const mode = s.mode === 'system' ? (dark.matches ? 'dark' : 'light') : s.mode;
  root.dataset.mode = mode;
  root.style.setProperty('--text-scale', String(s.textScale || 1));
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(root).getPropertyValue('--paper').trim() || (mode === 'dark' ? '#0b0a09' : '#f6f1e7');
}

export function onSystemModeChange(fn: () => void): void {
  dark.addEventListener('change', fn);
}
