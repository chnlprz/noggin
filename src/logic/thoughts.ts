// Thoughts and steps (Bible › Thoughts, Capture). Every change stamps updatedAt so sync (Phase 6) can pick it up.
import { db } from '../db/db';
import type { Category, Step, Thought, ThoughtType } from '../db/types';
import { nowISO, uid } from '../lib/util';

export async function addThoughts(texts: string[], type: ThoughtType, categoryId?: string): Promise<Thought[]> {
  const base = Date.now();
  const list: Thought[] = texts.map((t, i) => {
    const at = new Date(base + i).toISOString(); // keeps batch order under Newest
    return { id: uid(), type, text: t.trim(), categoryId, createdAt: at, updatedAt: at, opens: 0 };
  }).filter((t) => t.text);
  await db.thoughts.bulkAdd(list);
  return list;
}

export async function updateThought(id: string, patch: Partial<Omit<Thought, 'id'>>): Promise<void> {
  await db.thoughts.update(id, { ...patch, updatedAt: nowISO() });
}

/** Opening details counts as a revisit; twice within 10 minutes counts once. */
export async function markOpened(id: string): Promise<void> {
  const t = await db.thoughts.get(id);
  if (!t) return;
  const recent = t.lastOpenedAt && Date.now() - Date.parse(t.lastOpenedAt) < 10 * 60e3;
  await db.thoughts.update(id, { opens: recent ? t.opens : t.opens + 1, lastOpenedAt: nowISO() });
}

export const archive = (ids: string[]) => db.thoughts.where('id').anyOf(ids).modify({ archivedAt: nowISO(), updatedAt: nowISO() });
export const unarchive = (ids: string[]) => db.thoughts.where('id').anyOf(ids).modify((t) => { delete t.archivedAt; t.updatedAt = nowISO(); });
export const softDelete = (ids: string[]) => db.thoughts.where('id').anyOf(ids).modify({ deletedAt: nowISO(), updatedAt: nowISO() });
export const restore = (ids: string[]) => db.thoughts.where('id').anyOf(ids).modify((t) => { delete t.deletedAt; t.updatedAt = nowISO(); });

export async function listThoughts(opts: { type?: ThoughtType; archived?: boolean } = {}): Promise<Thought[]> {
  const all = await db.thoughts.toArray();
  return all.filter((t) => !t.deletedAt && (opts.type ? t.type === opts.type : true) && (opts.archived === undefined ? true : !!t.archivedAt === opts.archived));
}

// ── Steps ──
export async function stepsOf(thoughtId: string): Promise<Step[]> {
  return (await db.steps.where('thoughtId').equals(thoughtId).toArray()).sort((a, b) => a.order - b.order);
}

export async function stepCounts(): Promise<Map<string, { total: number; inNudge: number }>> {
  const m = new Map<string, { total: number; inNudge: number }>();
  for (const s of await db.steps.toArray()) {
    const c = m.get(s.thoughtId) ?? { total: 0, inNudge: 0 };
    c.total++;
    if (s.state === 'in-nudge' || s.state === 'waiting' || s.state === 'done') c.inNudge++;
    m.set(s.thoughtId, c);
  }
  return m;
}

export async function addStep(thoughtId: string, text: string): Promise<Step> {
  const last = (await stepsOf(thoughtId)).at(-1);
  const step: Step = { id: uid(), thoughtId, text: text.trim(), order: (last?.order ?? 0) + 1, state: 'draft', updatedAt: nowISO() };
  await db.steps.add(step);
  await updateThought(thoughtId, {});
  return step;
}

export const editStep = (id: string, text: string) => db.steps.update(id, { text, updatedAt: nowISO() });
export const removeStep = (id: string) => db.steps.delete(id);
export const putStep = (s: Step) => db.steps.put(s);

export async function reorderSteps(ids: string[]): Promise<void> {
  const at = nowISO();
  await db.transaction('rw', db.steps, async () => {
    for (let i = 0; i < ids.length; i++) await db.steps.update(ids[i], { order: i + 1, updatedAt: at });
  });
}

// ── Categories and suggestions ──
export async function categories(): Promise<Category[]> {
  return db.categories.orderBy('order').toArray();
}

const KEYWORDS: Record<string, string[]> = {
  Learning: ['learn', 'read', 'book', 'research', 'study', 'why', 'how', 'science', 'history', 'course', 'language', 'understand', 'planet', 'space', 'what is', 'how does', 'why do'],
  Ideas: ['idea', 'app', 'build', 'design', 'make', 'create', 'business', 'startup', 'project', 'redesign', 'product', 'launch', 'maybe i should', 'what if', 'podcast', 'brand'],
  Work: ['work', 'job', 'interview', 'client', 'shift', 'spreadsheet', 'sheet', 'workflow', 'meeting', 'career', 'boss', 'team', 'report', 'deadline'],
  Life: ['home', 'family', 'health', 'gym', 'money', 'sleep', 'cook', 'clean', 'friend', 'sister', 'trip', 'travel', 'piano', 'sing', 'cat', 'declutter'],
};

/** Suggests a category from the words typed: built-in keywords plus the name of any category. */
export function suggestCategory(text: string, cats: Category[]): Category | undefined {
  const t = ` ${text.toLowerCase()} `;
  let best: Category | undefined; let score = 0;
  for (const c of cats) {
    const words = [...(KEYWORDS[c.name] ?? []), c.name.toLowerCase()];
    const s = words.reduce((n, w) => n + (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t) ? 1 : 0), 0); // whole words: "notebook" is not "book"
    if (s > score) { score = s; best = c; }
  }
  return best;
}

export async function search(q: string): Promise<{ curiosity: Thought[]; wondering: Thought[]; archived: Thought[] }> {
  const needle = q.trim().toLowerCase();
  const out = { curiosity: [] as Thought[], wondering: [] as Thought[], archived: [] as Thought[] };
  if (!needle) return out;
  const steps = await db.steps.toArray();
  const stepHit = new Set(steps.filter((s) => s.text.toLowerCase().includes(needle)).map((s) => s.thoughtId));
  for (const t of await listThoughts()) {
    const hit = t.text.toLowerCase().includes(needle) || (t.note ?? '').toLowerCase().includes(needle) || stepHit.has(t.id);
    if (!hit) continue;
    (t.archivedAt ? out.archived : out[t.type]).push(t);
  }
  const newest = (a: Thought, b: Thought) => b.createdAt.localeCompare(a.createdAt);
  out.curiosity.sort(newest); out.wondering.sort(newest); out.archived.sort(newest);
  return out;
}
