import Dexie, { type Table } from 'dexie';
import type { Category, Meta, Settings, Step, Thought } from './types';
import { defaultCategories, defaultSettings, newMeta } from './defaults';
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
}

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('settings')) ?? defaultSettings();
}

export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch, updatedAt: nowISO() };
  await db.settings.put(next);
  return next;
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
