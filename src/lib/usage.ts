// Usage counts for the beta (Bible › Beta › Usage report): which features get used and how often.
// Counts only: never thought text. Kept on this device (60 days). With Share on and signed in, recent days go up now and then.
import { today } from './util';
import type { Days } from './usageReport';
export { buildReport, reportText, FEATURES } from './usageReport';
const KEY = 'noggin-usage', KEEP = 60;
const read = (): Days => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') as Days; } catch { return {}; } };
const write = (d: Days) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* full or blocked: skip */ } };
const lastSeen = new Map<string, number>();

/** One use of a feature (an action). `by` adds more than one (e.g. seconds of speech). */
export function track(key: string, by = 1): void {
  const d = read(), day = today();
  (d[day] ??= {})[key] = (d[day][key] ?? 0) + by;
  const days = Object.keys(d).sort(); while (days.length > KEEP) delete d[days.shift()!];
  write(d);
}

/** A visit to a screen: counted at most once every 10 minutes, so re-renders don't inflate it. */
export function seen(key: string): void {
  const now = Date.now(); if (now - (lastSeen.get(key) ?? 0) < 10 * 60_000) return;
  lastSeen.set(key, now); track(key);
}

export function usageDays(): Days { return read(); }

/** What's switched on right now (for the report): no thought data. */
export async function usageState(): Promise<Record<string, string | boolean>> {
  const { getSettings } = await import('../db/db');
  const s = await getSettings();
  return { labsSay: !!s.labsSay, aiSteps: !!s.aiSteps, aiAnswers: !!s.aiAnswers, sendToNudge: !!s.sendToNudge, stillCurious: !!s.stillCurious, mode: s.mode, font: s.font };
}

/** With Share on and signed in: send the last 14 days, at most every 6 hours. */
export async function sendUsage(force = false): Promise<void> {
  try {
    const { cloud, call } = await import('./cloud'); const { getSettings } = await import('../db/db'); const { VERSION } = await import('../ui/settings');
    if (!cloud.get().signedIn || !(await getSettings()).shareUsage || !navigator.onLine) return;
    const last = Number(localStorage.getItem('noggin-usage-sent') || 0); if (!force && Date.now() - last < 6 * 3600e3) return;
    const all = read(), days: Days = {}; Object.keys(all).sort().slice(-14).forEach((d) => { days[d] = all[d]; });
    await call('/usage', { days, state: await usageState(), version: VERSION });
    localStorage.setItem('noggin-usage-sent', String(Date.now()));
  } catch { /* try again next time */ }
}
