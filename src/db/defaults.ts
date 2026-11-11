import type { Category, Meta, Settings } from './types';
import { nowISO, uid } from '../lib/util';

export const BUILT_IN_CATEGORIES = ['Learning', 'Ideas', 'Work', 'Life'];

export function defaultCategories(): Category[] {
  const at = nowISO();
  return BUILT_IN_CATEGORIES.map((name, order) => ({ id: uid(), name, order, builtIn: true, updatedAt: at }));
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
