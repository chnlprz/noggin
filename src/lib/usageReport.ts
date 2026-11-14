// Pure report math for usage counts: used by the app (Usage report) and the server (weekly email). No imports.
// Ported from Nudge! 2.16 with Noggin?'s own features.
export type Days = Record<string, Record<string, number>>;
export type Group = 'essential' | 'sometimes' | 'barely';
export const FEATURES: { id: string; label: string; keys: string[] }[] = [
  { id: 'curiosities', label: 'Curiosities list', keys: ['view.curiosities'] },
  { id: 'wonderings', label: 'Wonderings list', keys: ['view.wonderings'] },
  { id: 'one', label: 'Catch one, typed', keys: ['add.one'] },
  { id: 'several', label: 'Catch several, typed', keys: ['add.several'] },
  { id: 'say', label: 'Say it', keys: ['say'] },
  { id: 'checked', label: 'Typed lines checked by AI', keys: ['add.checked'] },
  { id: 'open', label: 'Open a thought', keys: ['view.thought'] },
  { id: 'steps', label: 'Add steps', keys: ['step.add'] },
  { id: 'nudge', label: 'Send steps to Nudge!', keys: ['handoff.send'] },
  { id: 'found', label: 'What I found', keys: ['note.edit'] },
  { id: 'aistep', label: 'AI first step', keys: ['ai.step', 'ai.step.add'] },
  { id: 'aianswer', label: 'AI short answer', keys: ['ai.answer', 'ai.save'] },
  { id: 'hold', label: 'Hold menu', keys: ['hold'] },
  { id: 'move', label: 'Move to the other list', keys: ['move'] },
  { id: 'select', label: 'Select several', keys: ['select'] },
  { id: 'archive', label: 'Archive', keys: ['archive'] },
  { id: 'still', label: 'Still curious?', keys: ['still.open'] },
  { id: 'search', label: 'Search', keys: ['view.search'] },
  { id: 'archives', label: 'Archives', keys: ['view.archives'] },
  { id: 'analytics', label: 'Analytics', keys: ['view.analytics'] },
  { id: 'draft', label: 'Continue a draft', keys: ['say.draft'] },
  { id: 'tips', label: 'How Noggin? works', keys: ['view.tips'] },
  { id: 'settings', label: 'Settings', keys: ['view.settings'] },
];

export interface Report {
  from: string; to: string; span: number; activeDays: number;
  add: { one: number; several: number; say: number; checked: number };
  next: { steps: number; nudge: number; found: number };
  features: { id: string; label: string; days: number; uses: number; last: string | null; group: Group }[];
  sayAvgSecs: number | null;
}

export function buildReport(days: Days, span: number, to: string): Report {
  const end = new Date(`${to}T12:00:00`), list: string[] = [];
  for (let i = span - 1; i >= 0; i--) { const d = new Date(end); d.setDate(d.getDate() - i); list.push(d.toISOString().slice(0, 10)); }
  const sum = (k: string) => list.reduce((n, d) => n + (days[d]?.[k] ?? 0), 0);
  const activeDays = list.filter((d) => days[d] && Object.keys(days[d]).length).length;
  const features = FEATURES.map((f) => {
    const used = list.filter((d) => f.keys.some((k) => days[d]?.[k]));
    const ever = Object.keys(days).sort().filter((d) => f.keys.some((k) => days[d]?.[k]));
    const n = used.length, base = Math.max(1, activeDays);
    const group: Group = n / base >= 0.5 ? 'essential' : n >= 2 || (n >= 1 && span <= 7) ? 'sometimes' : 'barely';
    return { id: f.id, label: f.label, days: n, uses: f.keys.reduce((a, k) => a + sum(k), 0), last: ever.at(-1) ?? null, group };
  }).sort((a, b) => b.days - a.days || b.uses - a.uses);
  const said = sum('say');
  return {
    from: list[0], to, span, activeDays, features,
    add: { one: sum('add.one'), several: sum('add.several'), say: said, checked: sum('add.checked') },
    next: { steps: sum('step.add'), nudge: sum('handoff.send'), found: sum('note.edit') },
    sayAvgSecs: said ? Math.round(sum('say.secs') / said) : null,
  };
}

/** Plain text for pasting into a chat or an email. */
export function reportText(r: Report, who: string, state?: Record<string, unknown>): string {
  const pct = (a: number, t: number) => (t ? Math.round((a / t) * 100) : 0);
  const a = r.add, at = a.one + a.several + a.say + a.checked;
  const g = (x: Group) => r.features.filter((y) => y.group === x).map((y) => `- ${y.label}: ${y.days} of ${r.activeDays} active days, ${y.uses} uses${y.last ? `, last ${y.last}` : ''}`).join('\n') || '- (none)';
  return [
    `Noggin? usage report · ${who} · ${r.from} to ${r.to} (${r.span} days, ${r.activeDays} active)`,
    '', `Catch: typed one ${pct(a.one, at)}% (${a.one}), typed several ${pct(a.several, at)}% (${a.several}), Say it ${pct(a.say, at)}% (${a.say}), typed + AI check ${pct(a.checked, at)}% (${a.checked})`,
    ...(r.sayAvgSecs !== null ? [`Say it: about ${r.sayAvgSecs} s per recording`] : []),
    `Next: steps added ${r.next.steps}, sent to Nudge! ${r.next.nudge}, What I found edits ${r.next.found}`,
    '', 'Essentials (half the active days or more):', g('essential'),
    '', 'Sometimes:', g('sometimes'), '', 'Barely or never:', g('barely'),
    ...(state ? ['', `Settings now: ${Object.entries(state).map(([k, v]) => `${k}=${v}`).join(', ')}`] : []),
  ].join('\n');
}
