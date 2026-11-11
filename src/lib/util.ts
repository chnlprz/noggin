export const uid = (): string => crypto.randomUUID();
export const nowISO = (): string => new Date().toISOString();
/** Local calendar day, YYYY-MM-DD (days roll at local midnight). */
export const today = (d = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const escapeHTML = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/**
 * Home greeting pool (Bible › Screens and navigation): any time + the line for this time of day.
 * One per open, the same on both lists, never the same twice in a row.
 */
export function greetingPool(name: string, d = new Date()): string[] {
  const who = name.trim() || 'Friend';
  const h = d.getHours();
  const day = d.toLocaleDateString('en-US', { weekday: 'long' });
  const timeLine =
    h >= 23 || h < 4 ? `Still thinking, ${who}?`
    : h < 12 ? `Morning thoughts, ${who}?`
    : h < 18 ? `Happy ${day}, ${who}.`
    : `Anything from today, ${who}?`;
  return [`What’s on your noggin, ${who}?`, `Any thoughts, ${who}?`, timeLine];
}

export function pickGreeting(name: string, last?: string, d = new Date()): string {
  const pool = greetingPool(name, d).filter((g) => g !== last);
  return pool[Math.floor(Math.random() * pool.length)];
}
