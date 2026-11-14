// Noggin? data model (Bible › Data model). Ids are random UUIDs; times are ISO strings.
export type ID = string;
export type ISOTime = string;

export type ThoughtType = 'curiosity' | 'wondering';

/** Say it (Labs beta): one card to check before it's saved. */
export interface SayItem { text: string; type: ThoughtType; categoryId: string | null; steps: string[] }
export interface SayDraft { at: number; text: string; items: SayItem[]; checked: string[] }

/** AI helpers (Bible › AI): the last answer or suggestion for this thought, kept so it's asked once. */
export interface ThoughtAI {
  kind: 'step' | 'fact' | 'personal' | 'vague';
  text: string; // the step, the short answer, or (vague) the question back
  points?: string[]; // personal: things to weigh
  question?: string; // personal: one question back
  next?: boolean; // step: a next step (the thought already had steps)
  for: string; // the thought text it answered; a different text asks again on the next open
  tried?: string[]; // steps already suggested, so Another idea is new
  saved?: boolean; // saved to What I found
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
  queued?: boolean; // sent while offline: goes up on the next sync
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
  aiSteps?: boolean; // AI helpers: suggest a first step on Curiosities (off until turned on)
  aiAnswers?: boolean; // AI helpers: short answers on Wonderings
  labsSay?: boolean; // Preview tools › Labs › Say it (beta): a mic when you catch a thought
  sayTipsSeen?: boolean;
  shareUsage?: boolean; // Sync › Beta: share which features I use (counts only)
  usageAsked?: boolean; // the one-time Home notice was answered
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
  sayDraft?: SayDraft; // Say it: words and checked cards not saved yet, kept 24 h
  stillCurious?: { day: string; id?: string; done?: boolean }; // today's pick (Bible › Still curious?)
  a2hsHiddenAt?: ISOTime; // Add to Home Screen notice hidden with ×
  lastBackupAt?: ISOTime;
  backupHiddenAt?: ISOTime;
  welcomed?: boolean; // Thoughts rising played once
}
