// Noggin? data model (Bible › Data model). Ids are random UUIDs; times are ISO strings.
export type ID = string;
export type ISOTime = string;

export type ThoughtType = 'curiosity' | 'wondering';

/** Reserved for the AI module (later). Nothing writes it in 1.x. */
export interface ThoughtAI {
  answer?: string;
  steps?: string[];
  model: string;
  at: ISOTime;
}

export interface Thought {
  id: ID;
  type: ThoughtType;
  text: string;
  note?: string; // "What I found" on a Wondering
  categoryId?: ID; // undefined = No category
  createdAt: ISOTime;
  updatedAt: ISOTime;
  opens: number;
  lastOpenedAt?: ISOTime;
  archivedAt?: ISOTime;
  deletedAt?: ISOTime; // kept 30 days
  resurfacedAt?: ISOTime; // last shown as Still curious?
  snoozeUntil?: ISOTime; // Not now
  ai?: ThoughtAI;
}

/** draft → waiting → in-nudge → done | removed; copied = sent signed out (no tracking). */
export type StepState = 'draft' | 'waiting' | 'in-nudge' | 'done' | 'removed' | 'copied';

export interface Step {
  id: ID;
  thoughtId: ID;
  text: string;
  order: number;
  state: StepState;
  handoffId?: ID;
  nudgeTaskId?: ID;
  sentAt?: ISOTime;
  doneAt?: ISOTime;
  updatedAt: ISOTime;
}

export interface Category {
  id: ID;
  name: string;
  order: number;
  builtIn: boolean; // Learning, Ideas, Work, Life: renamed, never deleted
  updatedAt: ISOTime;
}

export type Mode = 'light' | 'dark' | 'system';
export type FontChoice = 'serif' | 'sans' | 'easy';

export interface Settings {
  id: 'settings';
  name: string; // blank = Friend
  mode: Mode;
  custom?: { accent: string; paper: string }; // Custom colours; undefined = off
  font: FontChoice;
  textScale: number; // 0.9 to 1.3
  keepAdding: boolean;
  stillCurious: boolean;
  weeklyNudge: boolean;
  sendToNudge: boolean;
  onboarded: boolean;
  updatedAt: ISOTime;
}

/** Device only, never synced. */
export interface Meta {
  id: 'meta';
  schema: number;
  installedAt: ISOTime;
  lastGreeting?: string;
  captureDraft?: string;
  stillCurious?: { day: string; id?: string; done?: boolean }; // today's pick (Bible › Still curious?)
  a2hsHiddenAt?: ISOTime; // Add to Home Screen notice hidden with ×
}
