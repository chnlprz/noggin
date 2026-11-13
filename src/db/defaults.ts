import type { Category, Meta, Settings } from './types';
import { nowISO } from '../lib/util';

export const BUILT_IN_CATEGORIES = ['Learning', 'Ideas', 'Work', 'Life'];

export const builtInId = (name: string) => `cat-${name.toLowerCase()}`;

export function defaultCategories(): Category[] {
  const at = nowISO();
  // Fixed ids, so two devices that each started fresh share the same four categories after sync.
  return BUILT_IN_CATEGORIES.map((name, order) => ({ id: builtInId(name), name, order, builtIn: true, updatedAt: at }));
}

export function defaultSettings(): Settings {
  return {
    id: 'settings', name: '', mode: 'system', font: 'serif', textScale: 1,
    keepAdding: false, stillCurious: true, weeklyNudge: false, sendToNudge: true,
    onboarded: false, updatedAt: nowISO(),
  };
}

export function newMeta(schema: number): Meta {
  return { id: 'meta', schema, installedAt: nowISO() };
}
