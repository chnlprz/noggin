// Onboarding (Bible › Onboarding): Welcome → Name → Ready (Thoughts rising) → Home. Restore from a backup on Welcome.
// "I already use an Innova Space app" (passkey sign-in) arrives with Phase 6.
import { db, getSettings, updateSettings } from '../db/db';
import { previewBackup, restoreBackup, RESTORE_REASONS } from '../db/backup';
import { applyLook } from '../lib/look';
import { h, openSheet, toast } from './kit';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function renderWelcome(app: HTMLElement, done: () => void): void {
  app.innerHTML = `
    <main class="screen welcome" style="justify-content:space-between;text-align:center">
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px">
        <h1 class="wordmark wm-in" style="margin:0;font-size:58px">Noggin<span class="q wiggle">?</span></h1>
        <p class="muted tag-in" style="margin:0;font-size:calc(16px * var(--text-scale))">Stay curious.</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <button class="btn" id="start" type="button">Get started</button>
        <button class="btn-secondary" id="restore" type="button">Restore from a backup</button>
        <p class="muted" style="margin:6px 0 0;font-size:12px">No account needed. Everything stays on this device.</p>
        <input id="file" type="file" accept="application/json,.json" hidden>
      </div>
    </main>`;
  app.querySelector('#start')!.addEventListener('click', () => renderName(app, done));
  const file = app.querySelector<HTMLInputElement>('#file')!;
  app.querySelector('#restore')!.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files?.[0]; file.value = '';
    if (!f) return;
    const p = await previewBackup(f);
    if (!p.ok) return toast(RESTORE_REASONS[p.reason], undefined, 6000);
    const sheet = openSheet(`<div class="sheet-head"><h2 class="serif">Restore this backup?</h2></div>
      <p class="muted" style="margin:0 0 16px">${p.curiosities} curiosities, ${p.wonderings} wonderings and ${p.steps} steps, from ${new Date(p.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.</p>
      <div class="two"><button class="btn-secondary" data-no>Cancel</button><button class="btn" data-yes>Restore</button></div>`);
    sheet.el.addEventListener('click', async (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-no]')) return sheet.close();
      if (t.closest('[data-yes]')) {
        await restoreBackup(p.backup); await db.meta.update('meta', { welcomed: true });
        sheet.close(); applyLook(await getSettings()); done(); toast('Backup restored');
      }
    });
  });
}

function renderName(app: HTMLElement, done: () => void): void {
  const preview = (n: string) => `What’s on your noggin, ${h(n.trim() || 'Friend')}?`;
  app.innerHTML = `
    <main class="screen" style="justify-content:space-between">
      <div style="padding-top:48px">
        <h1 class="serif" style="font-size:calc(30px * var(--text-scale));line-height:1.15;margin:0 0 20px">What should Noggin<span class="q-brand">?</span> call you?</h1>
        <label class="label" for="nm" style="display:block;margin-bottom:6px">Your name</label>
        <input class="field" id="nm" maxlength="32" autocomplete="given-name" placeholder="Friend" enterkeyhint="done">
        <div class="card" style="margin-top:12px;font-size:13px;color:var(--muted)">Your greeting will look like<div class="serif" id="pv" style="color:var(--ink);font-size:20px;margin-top:4px">${preview('')}</div></div>
        <p class="hint">Leave it blank to use “Friend.” You can change it later in Settings.</p>
      </div>
      <button class="btn" id="go" type="button">Continue</button>
    </main>`;
  const nm = app.querySelector<HTMLInputElement>('#nm')!;
  nm.addEventListener('input', () => { app.querySelector('#pv')!.innerHTML = preview(nm.value); });
  const go = async () => { await updateSettings({ name: nm.value.trim() }); playRising(app, done); };
  app.querySelector('#go')!.addEventListener('click', () => void go());
  nm.addEventListener('keydown', (e) => { if (e.key === 'Enter') void go(); });
  setTimeout(() => nm.focus(), 50);
}

// ── Thoughts rising (chosen Nov 11, 2026): thin-line clouds, ?, dots and a bulb float up, then drift away into Home ──
const CLOUD = '<svg viewBox="0 0 100 58" style="overflow:visible"><path fill="none" stroke="var(--line-art)" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke" d="M18 52 Q4 52 6 40 Q8 30 20 31 Q21 16 38 17 Q46 4 62 12 Q78 9 81 25 Q96 26 95 40 Q94 52 80 52 Z"/></svg>';
const QM = (c: string, w: number) => `<svg viewBox="0 0 256 256" style="width:${w}px;height:${w}px;overflow:visible"><path d="M91 95 C94 47 162 48 164 94 C166 119 128 122 128 153" fill="none" stroke="${c}" stroke-width="13" stroke-linecap="round"/><circle cx="128" cy="198" r="13" fill="${c}"/></svg>`;
const BULB = '<svg viewBox="0 0 40 56" style="width:30px;height:42px;overflow:visible"><path d="M20 4 C11 4 6 10 6 18 C6 24 10 28 13 33 L27 33 C30 28 34 24 34 18 C34 10 29 4 20 4 Z" fill="none" stroke="#efb94f" stroke-width="1.6"/><path class="fil" d="M16 33 L16 24 Q20 19 24 24 L24 33" fill="none" stroke="#efb94f" stroke-width="1.3" stroke-linecap="round"/><path d="M14 38 H26 M16 43 H24" stroke="#efb94f" stroke-width="1.6" stroke-linecap="round"/></svg>';
// [kind, x%, y%, width px, delay s, tilt deg]
const FTL: [string, number, number, number, number, number][] = [
  ['c', -5, 13, 112, 0, -4], ['c', 52, 6, 54, 0.14, 6], ['c', 68, 20, 92, 0.3, -3], ['c', 25, 31, 42, 0.22, 8], ['c', 1, 42, 70, 0.4, -6], ['c', 59, 44, 118, 0.34, 3],
  ['q', 41, 10, 40, 0.5, -12], ['q', 16, 24, 20, 0.62, 16], ['q', 82, 33, 30, 0.7, 9], ['q', 43, 49, 15, 0.58, -22], ['b', 38, 24, 30, 0.8, -6],
  ['d', 34, 4, 4, 0.15, 0], ['d', 85, 15, 9, 0.5, 0], ['d', 10, 29, 6, 0.4, 0], ['d', 55, 38, 3, 0.66, 0], ['d', 90, 42, 5, 0.24, 0], ['d', 24, 50, 8, 0.72, 0], ['d', 64, 14, 3, 0.36, 0],
];

function playRising(app: HTMLElement, done: () => void): void {
  const finish = async () => { await updateSettings({ onboarded: true }); await db.meta.update('meta', { welcomed: true }); done(); };
  if (reduced()) { app.innerHTML = '<main class="screen rising"><div class="wel"><h1 class="serif">Welcome.</h1><p class="muted">Your curiosity starts here.</p></div></main>'; setTimeout(() => void finish(), 1200); return; }
  const items = FTL.map(([k, x, y, w, d, r], i) => {
    const inner = k === 'c' ? CLOUD : k === 'q' ? QM(i === 6 ? '#efb94f' : 'var(--line-art)', w) : k === 'b' ? BULB : '';
    const size = k === 'c' ? `width:${w}px` : k === 'd' ? `width:${w}px;height:${w}px` : '';
    return `<i class="ft${k === 'd' ? ' fdot' : ''}" style="left:${x}%;top:${y}%;${size};--fx:calc(50vw - ${x}vw);--fy:${85 - y}vh;--d:${d}s">${r ? `<span style="display:block;transform:rotate(${r}deg)">${inner}</span>` : inner}</i>`;
  }).join('');
  app.innerHTML = `<main class="rising" aria-live="polite"><div class="sky">${items}</div><div class="wel"><h1 class="serif">Welcome.</h1><p class="muted">Your curiosity starts here.</p></div></main>`;
  const main = app.querySelector<HTMLElement>('.rising')!;
  let left = false;
  const go = () => { if (left) return; left = true; main.classList.add('leaving'); setTimeout(() => void finish(), 650); };
  main.addEventListener('pointerdown', go); // a tap skips to Home
  setTimeout(go, 2600);
}
