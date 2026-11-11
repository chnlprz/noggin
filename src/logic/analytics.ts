// Analytics (Bible › Analytics): thought patterns counted on this device. Never a score.
import { db } from '../db/db';
import type { Category, Step, Thought } from '../db/types';

export type Range = 'week' | 'month' | 'all';
const DAY = 864e5;

/** Start of this week (Sunday 00:00 local), this month, or the beginning of time. */
export function rangeStart(r: Range, now = new Date()): number {
  if (r === 'all') return 0;
  const d = new Date(now.getFullYear(), now.getMonth(), r === 'month' ? 1 : now.getDate());
  if (r === 'week') d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

export type Stats = {
  ready: boolean; // false before 3 days of use
  caught: number; caughtAll: number; revisited: number; sent: number; done: number;
  action: { curiosities: number; withSent: number; withDone: number };
  weeks: { label: string; curiosity: number; wondering: number }[]; // last 8 weeks, oldest first
  cats: { name: string; n: number }[];
  grid: number[][]; // [weekday 0..6][slot 0..3] morning, afternoon, evening, night
  holes: { t: Thought; opens: number; steps: number }[];
  waiting: Thought[];
};

const slot = (h: number) => (h >= 5 && h < 12 ? 0 : h >= 12 && h < 18 ? 1 : h >= 18 && h < 23 ? 2 : 3);

export async function stats(r: Range, now = new Date()): Promise<Stats> {
  const [all, steps, cats, meta] = await Promise.all([db.thoughts.toArray(), db.steps.toArray(), db.categories.orderBy('order').toArray(), db.meta.get('meta')]);
  const live = all.filter((t) => !t.deletedAt);
  const from = rangeStart(r, now);
  const inR = (iso?: string) => !!iso && Date.parse(iso) >= from;
  const stepsBy = new Map<string, Step[]>();
  for (const s of steps) stepsBy.set(s.thoughtId, [...(stepsBy.get(s.thoughtId) ?? []), s]);
  const sentStates = new Set(['waiting', 'in-nudge', 'done', 'removed', 'copied']);

  const caughtList = live.filter((t) => inR(t.createdAt));
  const curios = live.filter((t) => t.type === 'curiosity' && inR(t.createdAt));
  const withSent = curios.filter((t) => (stepsBy.get(t.id) ?? []).some((s) => sentStates.has(s.state)));
  const withDone = curios.filter((t) => (stepsBy.get(t.id) ?? []).some((s) => s.state === 'done'));

  // Last 8 weeks, Sunday to Saturday
  const thisWeek = rangeStart('week', now);
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = thisWeek - (7 - i) * 7 * DAY, end = start + 7 * DAY;
    const w = live.filter((t) => { const c = Date.parse(t.createdAt); return c >= start && c < end; });
    const d = new Date(start);
    return { label: `${d.toLocaleDateString('en-US', { month: 'short' })} ${d.getDate()}`, curiosity: w.filter((t) => t.type === 'curiosity').length, wondering: w.filter((t) => t.type === 'wondering').length };
  });

  const catName = new Map(cats.map((c: Category) => [c.id, c.name]));
  const catCount = new Map<string, number>();
  for (const t of caughtList) { const k = (t.categoryId && catName.get(t.categoryId)) || 'No category'; catCount.set(k, (catCount.get(k) ?? 0) + 1); }

  const grid = Array.from({ length: 7 }, () => [0, 0, 0, 0]);
  for (const t of caughtList) { const d = new Date(t.createdAt); grid[d.getDay()][slot(d.getHours())]++; }

  const holes = live.map((t) => ({ t, opens: t.opens, steps: (stepsBy.get(t.id) ?? []).length }))
    .filter((x) => x.opens + x.steps > 0).sort((a, b) => b.opens + 2 * b.steps - (a.opens + 2 * a.steps)).slice(0, 3);
  const waiting = live.filter((t) => t.type === 'curiosity' && !t.archivedAt && !(stepsBy.get(t.id) ?? []).length)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, 3);

  return {
    ready: !!meta && now.getTime() - Date.parse(meta.installedAt) >= 3 * DAY,
    caught: caughtList.length, caughtAll: live.length,
    revisited: live.filter((t) => inR(t.lastOpenedAt)).length,
    sent: steps.filter((s) => sentStates.has(s.state) && inR(s.sentAt)).length,
    done: steps.filter((s) => s.state === 'done' && inR(s.doneAt)).length,
    action: { curiosities: curios.length, withSent: withSent.length, withDone: withDone.length },
    weeks,
    cats: [...catCount].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n),
    grid, holes, waiting,
  };
}
