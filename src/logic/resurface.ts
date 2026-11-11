// Still curious? (Bible › Still curious? resurfacing): once a day at most, one old thought comes back as a quiet card.
import { db, getSettings } from '../db/db';
import type { Thought } from '../db/types';
import { nowISO, today } from '../lib/util';
import { listThoughts, updateThought } from './thoughts';

const DAY = 864e5;

/** Who qualifies: not archived, 7+ days old, not opened in 7 days, not snoozed. */
function eligible(t: Thought, now: number): boolean {
  if (t.archivedAt || t.deletedAt) return false;
  if (now - Date.parse(t.createdAt) < 7 * DAY) return false;
  if (t.lastOpenedAt && now - Date.parse(t.lastOpenedAt) < 7 * DAY) return false;
  if (t.snoozeUntil && Date.parse(t.snoozeUntil) > now) return false;
  return true;
}

/** Today's card, picked on the first open of the day and kept until acted on or the day ends. */
export async function stillCurious(): Promise<Thought | null> {
  const s = await getSettings();
  if (!s.stillCurious) return null;
  const meta = await db.meta.get('meta');
  const day = today();
  const kept = meta?.stillCurious;
  if (kept?.day === day) {
    if (kept.done || !kept.id) return null;
    const t = await db.thoughts.get(kept.id);
    return t && !t.archivedAt && !t.deletedAt ? t : null;
  }
  // A new day: none if 3 or more thoughts were already caught today.
  const now = Date.now();
  const all = await listThoughts();
  const caughtToday = all.filter((t) => today(new Date(t.createdAt)) === day).length;
  let pick: Thought | null = null;
  if (caughtToday < 3) {
    const pool = all.filter((t) => eligible(t, now));
    if (pool.length) {
      const withSteps = new Set((await db.steps.toArray()).map((x) => x.thoughtId));
      const weights = pool.map((t) => (withSteps.has(t.id) ? 1 : 3)); // weighted toward thoughts with no steps yet
      let r = Math.random() * weights.reduce((a, b) => a + b, 0);
      pick = pool.find((_, i) => (r -= weights[i]) < 0) ?? pool[0];
    }
  }
  await db.meta.update('meta', { stillCurious: { day, id: pick?.id } });
  if (pick) await updateThought(pick.id, { resurfacedAt: nowISO() });
  return pick;
}

export async function dismissStillCurious(snoozeDays = 0, id?: string): Promise<void> {
  const meta = await db.meta.get('meta');
  await db.meta.update('meta', { stillCurious: { day: today(), id: meta?.stillCurious?.id, done: true } });
  if (snoozeDays && id) await updateThought(id, { snoozeUntil: new Date(Date.now() + snoozeDays * DAY).toISOString() });
}
