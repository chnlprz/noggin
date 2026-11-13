// Onboarding (Bible › Onboarding): Welcome → Name → three intro cards (Curiosity vs Wondering, Hold, AI) → Thoughts rising → Home. Restore from a backup on Welcome.
// "I already use an Innova Space app" (passkey sign-in) arrives with Phase 6.
import { db, getSettings, updateSettings } from '../db/db';
import { previewBackup, restoreBackup, RESTORE_REASONS } from '../db/backup';
import { applyLook } from '../lib/look';
import { h, openSheet, toast } from './kit';
import { friendlyError, passkeysWork, signInWithPasskey, syncNow } from '../lib/cloud';

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
        ${passkeysWork() ? '<button class="btn-secondary" id="signin" type="button">I already use an Innova Space app</button>' : ''}
        <button class="link muted" id="restore" type="button">Restore from a backup</button>
        <p class="muted" style="margin:6px 0 0;font-size:12px">No account needed. Everything stays on this device.</p>
        <input id="file" type="file" accept="application/json,.json" hidden>
      </div>
    </main>`;
  app.querySelector('#start')!.addEventListener('click', () => renderName(app, done));
  app.querySelector('#signin')?.addEventListener('click', async (e) => {
    const b = e.currentTarget as HTMLButtonElement; b.disabled = true;
    try {
      const name = await signInWithPasskey();
      if (name) await updateSettings({ name });
      await syncNow(); applyLook(await getSettings());
      // Signed in with a Nudge! account: the name is already known, so straight to Thoughts rising.
      if (name || (await getSettings()).name) renderIntro(app, () => playRising(app, done)); else renderName(app, done);
    } catch (err) { toast(friendlyError(err), undefined, 5000); b.disabled = false; }
  });
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
  const go = async () => { await updateSettings({ name: nm.value.trim() }); renderIntro(app, () => playRising(app, done)); };
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

// ── Intro cards (mockups v2, E1–E3): each plays a short demo once when it shows, then holds still ──
const A = (d: number, cls: string, html: string, st = '') => `<div class="${cls}" style="--d:${d}s;${st}">${html}</div>`;
const NCHIP = '<span class="ix-nchip">Nudge!</span>';
const AIC = (label: string, body: string) => `<section class="card ai-card ix-ai"><div class="label">${label}</div>${body}</section>`;
const CARDS: { body: string; btn: string; sub?: string }[] = [
  { btn: 'Next', body: `<h1 class="serif ix-h">Two kinds of thoughts</h1>
    <div class="ix-stage">
      ${A(.2, 'card ix-kind a', `<div class="ix-kh"><span class="serif">Curiosity</span> <span class="muted">· something to do</span></div>
        ${A(.7, 'ix-bub ty drop', 'Start a balcony garden', '--d2:1.7s')}
        <div class="ix-steps">${A(2.3, 'ix-st a fly', 'Find the sunny corner', '--d2:3.9s')}${A(2.7, 'ix-st a fly', 'Buy three pots', '--d2:4s')}
          ${A(4.6, 'ix-sent a', '2 steps sent to Nudge!')}${A(3.3, 'ix-nz a pulse', NCHIP, '--d2:4.4s')}</div>`)}
      ${A(4.8, 'card ix-kind a', `<div class="ix-kh"><span class="serif">Wondering</span> <span class="muted">· something to find out</span></div>
        ${A(5.3, 'ix-bub ty drop', 'Why do cats purr?', '--d2:6.2s')}
        ${A(6.7, 'label a', 'What I found', 'margin:10px 0 4px')}${A(7, 'ix-found ty', 'Mostly when content, sometimes to calm down.')}`)}
    </div>` },
  { btn: 'Next', body: `<h1 class="serif ix-h">Not sure which?<br>Catch it anyway.</h1><p class="muted ix-p">It lands in the list you’re on. Hold it to move it any time.</p>
    <div class="card ix-stage ix-list">
      <div class="ix-tabs"><span class="t1" style="--d:3.4s">Curiosities</span><span class="t2" style="--d:3.4s">Wonderings</span>${A(3.4, 'uline', '')}</div>
      <div class="l1" style="--d:3.4s"><div class="ix-row hold" style="--d:1s;--d2:2.9s"><p>Learn to make sourdough</p><span>Life</span>${A(.6, 'tap', '')}</div><div class="ix-row"><p>Start a balcony garden</p><span>Life</span></div></div>
      <div class="l2" style="--d:3.6s"><div class="ix-row inl" style="--d:3.8s"><p>Learn to make sourdough</p><span>Life</span></div><div class="ix-row"><p>Why do cats purr?</p><span>Learning</span></div></div>
      <div class="mn" style="--d:1.5s;--d2:2.8s"><div class="ix-mi pick" style="--d:2.3s">Move to Wonderings</div><div class="ix-mi muted">Select · Archive · Delete</div></div>
    </div>` },
  { btn: 'Turn on AI helpers', sub: 'Not now', body: `<h1 class="serif ix-h">A little help,<br>if you want it</h1><p class="muted ix-p">A first step for a Curiosity, a short answer for a Wondering.</p>
    <div class="ix-stage ix-ai-stage">
      <div class="serif ix-t">Start a balcony garden</div>
      ${AIC('A first step', `<div class="ai-dots dotsx" style="--d:1.6s"><i></i><i></i><i></i></div>${A(1.7, 'ai-p a sug', 'Check which corner gets the most sun this weekend.', '--d2:3s')}${A(2, 'ai-links a', '<span class="btn-pill press" style="--d:2.7s">Add to steps</span><span class="link">Another idea</span>')}`)}
      ${A(3.1, 'label a', 'Next steps', 'margin:14px 0 4px')}${A(3.3, 'ix-st a drop', 'Check which corner gets the most sun this weekend.', '--d2:3.3s')}
      <p class="hint" style="margin-top:12px">Only the thought you open is sent. Needs sign-in. You can change this in Settings › AI helpers.</p>
    </div>` },
];

/** The three intro cards. `replay` (from Settings › How Noggin? works) leaves the AI setting alone. */
export function renderIntro(app: HTMLElement, done: () => void, replay = false): void {
  let i = 0;
  const draw = () => {
    const c = CARDS[i];
    const last = i === CARDS.length - 1;
    app.innerHTML = `<main class="screen intro">
      <div class="ix-top">${last ? '' : `<button class="link muted" data-skip>${replay ? 'Close' : 'Skip'}</button>`}</div>
      <div class="ix-body"><div class="ix-anim">${c.body}</div></div>
      <div class="ix-dots" aria-hidden="true">${CARDS.map((_, k) => `<i${k === i ? ' class="on"' : ''}></i>`).join('')}</div>
      <button class="btn" data-next>${replay && last ? 'Done' : c.btn}</button>
      ${c.sub && !replay ? `<button class="link ix-sub" data-not>${c.sub}</button>` : '<div class="ix-sub"></div>'}
    </main>`;
    const anim = app.querySelector<HTMLElement>('.ix-anim')!;
    requestAnimationFrame(() => anim.classList.add('go'));
  };
  const next = async (turnOn?: boolean) => {
    if (i < CARDS.length - 1) { i++; return draw(); }
    if (turnOn !== undefined && !replay) await updateSettings({ aiSteps: turnOn, aiAnswers: turnOn });
    done();
  };
  app.onclick = (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-skip]')) { app.onclick = null; return done(); }
    if (t.closest('[data-next]')) return void next(i === CARDS.length - 1 ? true : undefined);
    if (t.closest('[data-not]')) return void next(false);
  };
  let x0 = 0;
  app.onpointerdown = (e) => { x0 = e.clientX; };
  app.onpointerup = (e) => { const dx = e.clientX - x0; if (dx < -60 && i < CARDS.length - 1) { i++; draw(); } else if (dx > 60 && i > 0) { i--; draw(); } };
  draw();
}

/** Settings › How Noggin? works › See the welcome again: the intro cards over the app, then back. */
export function replayIntro(): void {
  const layer = document.createElement('div');
  layer.className = 'intro-layer';
  document.body.appendChild(layer);
  renderIntro(layer, () => { layer.classList.add('closing'); setTimeout(() => layer.remove(), 200); }, true);
}
