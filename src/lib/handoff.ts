// Handoff to Nudge! (Bible › Handoff to Nudge!, Phase 7).
// Signed in: steps go to the server's handoff queue; Nudge! makes tasks marked "? Noggin" and reports back.
// Signed out: steps are copied into Nudge!'s Batch add (#add=…), with no tracking.
import { db } from '../db/db';
import type { Step, StepState, Thought } from '../db/types';
import { nowISO, uid } from './util';
import { cloud } from './cloud';

const NUDGE = 'https://nudge.innovaspace.app';

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`/api${path}`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw Object.assign(new Error(String(r.status)), { code: r.status });
  return r.json() as Promise<T>;
}

/** Mark steps as sent; they go up now, or on the next sync when offline. */
export async function sendSteps(_t: Thought, steps: Step[]): Promise<'sent' | 'queued'> {
  const at = nowISO();
  for (const s of steps) await db.steps.update(s.id, { state: 'waiting', handoffId: uid(), sentAt: at, queued: true, updatedAt: at });
  const ok = await flushQueued();
  return ok ? 'sent' : 'queued';
}

/** Signed out: open Nudge!'s Batch add with these steps filled in. */
export async function copySteps(steps: Step[]): Promise<void> {
  const lines = steps.map((s) => s.text.trim()).filter(Boolean).join('\n');
  window.open(`${NUDGE}/#add=${encodeURIComponent(lines)}`, '_blank', 'noopener');
  const at = nowISO();
  for (const s of steps) await db.steps.update(s.id, { state: 'copied', sentAt: at, updatedAt: at });
}

/** Before Nudge! picks it up, a waiting step can be taken back. */
export async function cancelStep(s: Step): Promise<boolean> {
  if (s.queued || !s.handoffId) { await db.steps.update(s.id, { state: 'draft', handoffId: undefined, queued: undefined, sentAt: undefined, updatedAt: nowISO() }); return true; }
  try {
    const r = await post<{ ok: boolean }>('/handoff/cancel', { id: s.handoffId });
    if (r.ok) await db.steps.update(s.id, { state: 'draft', handoffId: undefined, sentAt: undefined, updatedAt: nowISO() });
    return r.ok;
  } catch { return false; }
}

/** Send any steps marked while offline. Returns false if they're still waiting to go up. */
export async function flushQueued(): Promise<boolean> {
  if (!cloud.get().signedIn || !navigator.onLine) return false;
  const pending = await db.steps.filter((s) => !!s.queued && s.state === 'waiting').toArray();
  if (!pending.length) return true;
  const thoughts = new Map((await db.thoughts.bulkGet([...new Set(pending.map((s) => s.thoughtId))])).filter(Boolean).map((t) => [t!.id, t!]));
  const cats = new Map((await db.categories.toArray()).map((c) => [c.id, c.name]));
  try {
    await post('/handoff/send', { items: pending.map((s) => { const t = thoughts.get(s.thoughtId); return { id: s.handoffId, thoughtId: s.thoughtId, stepId: s.id, text: s.text, thoughtText: t?.text.slice(0, 600), categoryName: t?.categoryId ? cats.get(t.categoryId) : undefined }; }) });
    for (const s of pending) await db.steps.update(s.id, { queued: undefined });
    return true;
  } catch { return false; }
}

const MAP: Record<string, StepState> = { queued: 'waiting', 'in-nudge': 'in-nudge', done: 'done', removed: 'removed' };

/** Read what Nudge! did with each sent step and update the steps here. Returns how many changed. */
export async function refreshStatuses(): Promise<number> {
  if (!cloud.get().signedIn || !navigator.onLine) return 0;
  try {
    const { items } = await post<{ items: { id: string; state: string; taskId?: string; at: number }[] }>('/handoff/list', {});
    const byId = new Map(items.map((i) => [i.id, i]));
    let n = 0;
    for (const s of await db.steps.filter((x) => !!x.handoffId && !x.queued).toArray()) {
      const h = byId.get(s.handoffId!);
      if (!h || h.state === 'cancelled') continue;
      const next = MAP[h.state];
      if (next && next !== s.state) {
        await db.steps.update(s.id, { state: next, nudgeTaskId: h.taskId ?? s.nudgeTaskId, doneAt: next === 'done' ? new Date(h.at).toISOString() : undefined, updatedAt: nowISO() });
        n++;
      }
    }
    return n;
  } catch { return 0; }
}

/** After each sync: send queued steps, then pull their status. */
export async function syncHandoffs(): Promise<number> {
  await flushQueued();
  return refreshStatuses();
}
