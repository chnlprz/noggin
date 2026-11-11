import type { Settings } from '../db/types';

const dark = matchMedia('(prefers-color-scheme: dark)');

// ── Colour helpers for Custom colours (contrast-checked, like the demo) ──
const rgb = (h: string) => { const n = parseInt(h.replace('#', '').padEnd(6, '0'), 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const lum = (h: string) => rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
export const contrast = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mix = (a: string, b: string, t: number) => '#' + rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');

/** Custom palette from two picks. Text and muted are nudged until they pass 4.5:1. */
export function customPalette(accent: string, paper: string): Record<string, string> & { isDark: string } {
  const isDark = lum(paper) < 0.2;
  const ink = isDark ? '#f3ece0' : '#14110d';
  let muted = mix(ink, paper, 0.4);
  for (let i = 0; i < 12 && contrast(muted, paper) < 4.5; i++) muted = mix(muted, ink, 0.15);
  let at = accent;
  for (let i = 0; i < 14 && contrast(at, paper) < 4.5; i++) at = mix(at, ink, 0.12);
  const onAccent = contrast(accent, '#ffffff') >= contrast(accent, '#1a140a') ? '#ffffff' : '#1a140a';
  return {
    '--paper': paper, '--card': mix(paper, ink, 0.04), '--soft': mix(paper, ink, 0.08), '--rule': mix(paper, ink, 0.14),
    '--ink': ink, '--muted': muted, '--accent': accent, '--on-accent': onAccent, '--accent-text': at, '--line-art': mix(paper, ink, 0.35),
    isDark: isDark ? '1' : '',
  };
}

const CUSTOM_KEYS = ['--paper', '--card', '--soft', '--rule', '--ink', '--muted', '--accent', '--on-accent', '--accent-text', '--line-art'];

/** Applies theme (light, dark, system or Custom), font, text size and the browser bar colour. */
export function applyLook(s: Settings): void {
  const root = document.documentElement;
  CUSTOM_KEYS.forEach((k) => root.style.removeProperty(k));
  if (s.custom) {
    const p = customPalette(s.custom.accent, s.custom.paper);
    root.dataset.mode = p.isDark ? 'dark' : 'light';
    CUSTOM_KEYS.forEach((k) => root.style.setProperty(k, p[k]));
  } else {
    root.dataset.mode = s.mode === 'system' ? (dark.matches ? 'dark' : 'light') : s.mode;
  }
  root.dataset.font = s.font || 'serif';
  root.style.setProperty('--text-scale', String(s.textScale || 1));
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(root).getPropertyValue('--paper').trim();
}

export function onSystemModeChange(fn: () => void): void {
  dark.addEventListener('change', fn);
}
