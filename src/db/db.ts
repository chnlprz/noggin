import Dexie, { type Table } from 'dexie';
import type { Category, Meta, Settings, Step, Thought } from './types';
import { BUILT_IN_CATEGORIES, builtInId, defaultCategories, defaultSettings, newMeta } from './defaults';
import { nowISO } from '../lib/util';

export const SCHEMA_VERSION = 1;
const PURGE_DAYS = 30;

export class NogginDB extends Dexie {
  thoughts!: Table<Thought, string>;
  steps!: Table<Step, string>;
  categories!: Table<Category, string>;
  settings!: Table<Settings, string>;
  meta!: Table<Meta, string>;

  constructor() {
    super('noggin');
    this.version(SCHEMA_VERSION).stores({
      thoughts: 'id, type, categoryId, createdAt, updatedAt, archivedAt, deletedAt, lastOpenedAt',
      steps: 'id, thoughtId, state, handoffId, [thoughtId+order], updatedAt',
      categories: 'id, order',
      settings: 'id',
      meta: 'id',
    });
  }
}

export const db = new NogginDB();

/** First open: settings, the four built-in categories and device meta. Safe to call every launch. */
export async function ensureSeeded(): Promise<void> {
  await db.transaction('rw', db.settings, db.categories, db.meta, async () => {
    if (!(await db.settings.get('settings'))) await db.settings.put(defaultSettings());
    if ((await db.categories.count()) === 0) await db.categories.bulkPut(defaultCategories());
    if (!(await db.meta.get('meta'))) await db.meta.put(newMeta(SCHEMA_VERSION));
  });
  await dedupeCategories();
}

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('settings')) ?? defaultSettings();
}

export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch, updatedAt: nowISO() };
  await db.settings.put(next);
  return next;
}

/**
 * Before 1.0.1 each device made its own four built-in categories, so syncing two devices showed each twice.
 * Keep one per name (the fixed-id one, made if missing), move thoughts onto it, delete the rest. Safe to run often.
 */
export async function dedupeCategories(): Promise<number> {
  let removed = 0;
  await db.transaction('rw', db.categories, db.thoughts, async () => {
    const cats = await db.categories.toArray();
    for (const [order, name] of BUILT_IN_CATEGORIES.entries()) {
      const id = builtInId(name);
      const same = cats.filter((c) => c.builtIn && (c.id === id || c.name.trim().toLowerCase() === name.toLowerCase() || c.id === id));
      const extras = same.filter((c) => c.id !== id);
      if (!extras.length) continue;
      const keep = same.find((c) => c.id === id) ?? { ...extras[0], id, order };
      if (!same.some((c) => c.id === id)) await db.categories.put({ ...keep, updatedAt: nowISO() });
      for (const x of extras) {
        await db.thoughts.where('categoryId').equals(x.id).modify({ categoryId: id, updatedAt: nowISO() });
        await db.categories.delete(x.id);
        removed++;
      }
    }
  });
  return removed;
}

/** Deleted thoughts (and their steps) are kept 30 days, then removed for good. */
export async function purgeDeleted(): Promise<number> {
  const cutoff = new Date(Date.now() - PURGE_DAYS * 864e5).toISOString();
  const old = await db.thoughts.where('deletedAt').below(cutoff).primaryKeys();
  if (!old.length) return 0;
  await db.transaction('rw', db.thoughts, db.steps, async () => {
    await db.steps.where('thoughtId').anyOf(old).delete();
    await db.thoughts.bulkDelete(old);
  });
  return old.length;
}
