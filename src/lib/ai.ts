// AI helpers (Bible › AI): a first step for a Curiosity, a short answer for a Wondering. Optional, signed in only.
// Only the thought being looked at is sent (text, category; its steps when asking for a next one). The result is kept
// on the thought, so it's asked once; a changed thought text asks again on the next open.
import { db } from '../db/db';
import type { Thought, ThoughtAI } from '../db/types';
import { updateThought } from '../logic/thoughts';
import { nowISO } from './util';
import { cloud } from './cloud';

export type AIState = 'off' | 'signed-out' | 'on';
export function aiState(t: Thought, s: { aiSteps?: boolean; aiAnswers?: boolean }): AIState {
  if (!(t.type === 'curiosity' ? s.aiSteps : s.aiAnswers)) return 'off';
  return cloud.get().signedIn ? 'on' : 'signed-out';
}
export const fresh = (t: Thought) => !!t.ai && t.ai.for === t.text && (t.type === 'curiosity' ? t.ai.kind === 'step' : t.ai.kind !== 'step');

/** Ask and keep the result on the thought. Throws on no network or a busy server; the thought is unchanged then. */
export async function askAI(t: Thought, opts: { steps?: string[]; another?: boolean; more?: string } = {}): Promise<ThoughtAI> {
  const cat = t.categoryId ? (await db.categories.get(t.categoryId))?.name : undefined;
  const tried = opts.another && t.ai?.kind === 'step' ? [...(t.ai.tried ?? []), t.ai.text].slice(-8) : [];
  const res = await fetch('/api/ai', {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: t.type === 'curiosity' ? 'step' : 'answer', text: t.text, category: cat, steps: opts.steps, avoid: tried, more: opts.more }),
  });
  if (res.status === 401) cloud.set({ signedIn: false });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || 'ai-busy');
  const r = (await res.json()) as Pick<ThoughtAI, 'kind' | 'text' | 'points' | 'question'>;
  const ai: ThoughtAI = { ...r, for: t.text, at: nowISO(), ...(t.type === 'curiosity' ? { tried, next: !!opts.steps?.length } : {}) };
  await updateThought(t.id, { ai });
  return ai;
}
