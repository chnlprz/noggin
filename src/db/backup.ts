// Backups (Bible › Settings › Your data): one JSON file; restore shows a preview first and replaces this device's thoughts.
import { db, SCHEMA_VERSION } from './db';
import type { Category, Settings, Step, Thought } from './types';
import { today } from '../lib/util';

export type Backup = { app: 'noggin'; schema: number; at: string; thoughts: Thought[]; steps: Step[]; categories: Category[]; settings?: Settings };

export async function makeBackup(): Promise<Backup> {
  const [thoughts, steps, categories, settings] = await Promise.all([db.thoughts.toArray(), db.steps.toArray(), db.categories.toArray(), db.settings.get('settings')]);
  return { app: 'noggin', schema: SCHEMA_VERSION, at: new Date().toISOString(), thoughts, steps, categories, settings };
}

export async function downloadBackup(): Promise<void> {
  const b = await makeBackup();
  const blob = new Blob([JSON.stringify(b, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `noggin-backup-${today()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  await db.meta.update('meta', { lastBackupAt: b.at });
}

export type Preview = { ok: true; backup: Backup; curiosities: number; wonderings: number; steps: number; at: string } | { ok: false; reason: 'notNoggin' | 'newer' | 'unreadable' };

export async function previewBackup(file: File): Promise<Preview> {
  try {
    const b = JSON.parse(await file.text()) as Backup;
    if (b?.app !== 'noggin' || !Array.isArray(b.thoughts)) return { ok: false, reason: 'notNoggin' };
    if (b.schema > SCHEMA_VERSION) return { ok: false, reason: 'newer' };
    const live = b.thoughts.filter((t) => !t.deletedAt);
    return { ok: true, backup: b, curiosities: live.filter((t) => t.type === 'curiosity').length, wonderings: live.filter((t) => t.type === 'wondering').length, steps: b.steps?.length ?? 0, at: b.at };
  } catch { return { ok: false, reason: 'unreadable' }; }
}

export async function restoreBackup(b: Backup): Promise<void> {
  await db.transaction('rw', db.thoughts, db.steps, db.categories, db.settings, async () => {
    await Promise.all([db.thoughts.clear(), db.steps.clear(), db.categories.clear()]);
    await db.thoughts.bulkPut(b.thoughts);
    await db.steps.bulkPut(b.steps ?? []);
    if (b.categories?.length) await db.categories.bulkPut(b.categories);
    if (b.settings) await db.settings.put({ ...b.settings, onboarded: true });
  });
}

export const RESTORE_REASONS = {
  notNoggin: "This file isn't a Noggin? backup. Choose a file named noggin-backup-….json. Nothing on this device changed.",
  newer: 'This backup is from a newer Noggin?. Update the app, then try again. Nothing on this device changed.',
  unreadable: "This file couldn't be read. Choose another backup. Nothing on this device changed.",
};
