// Phase 1 preview: the welcome screen and a foundation check. Onboarding, lists and capture arrive in Phases 2 to 5.
import { db, getSettings, updateSettings } from '../db/db';
import type { Mode } from '../db/types';
import { applyLook } from '../lib/look';
import { isInstalled, requestPersistence, storageEstimate } from '../lib/storage';
import { escapeHTML, pickGreeting } from '../lib/util';

const VERSION = '1.0.0 · Phase 1';

export function renderWelcome(app: HTMLElement): void {
  app.innerHTML = `
    <main class="screen" style="justify-content:space-between;text-align:center">
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px">
        <h1 class="wordmark" style="margin:0;font-size:58px">Noggin<span class="q">?</span></h1>
        <p class="muted" style="margin:0;font-size:calc(16px * var(--text-scale))">Stay curious.</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <button class="btn" id="start" type="button">Get started</button>
        <button class="btn-secondary" type="button" disabled style="opacity:.55">I already use an Innova Space app</button>
        <p class="muted" style="margin:6px 0 0;font-size:12px">No account needed. Everything stays on this device.</p>
      </div>
    </main>`;
  app.querySelector('#start')!.addEventListener('click', () => void renderCheck(app));
}

async function renderCheck(app: HTMLElement): Promise<void> {
  const s = await getSettings();
  const [thoughts, cats, est] = await Promise.all([db.thoughts.count(), db.categories.orderBy('order').toArray(), storageEstimate()]);
  const persisted = (await navigator.storage?.persisted?.()) ?? false;
  const row = (k: string, v: string) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--rule)"><span>${k}</span><span class="muted">${v}</span></div>`;
  app.innerHTML = `
    <main class="screen" style="gap:18px">
      <h1 class="serif" style="margin:8px 0 0;font-size:calc(26px * var(--text-scale));line-height:1.2">${escapeHTML(pickGreeting(s.name, 'curiosity'))}</h1>
      <div class="card">
        <div class="label" style="margin-bottom:6px">Phase 1 · Foundation</div>
        ${row('Database', `ready · ${thoughts} thoughts`)}
        ${row('Categories', cats.map((c) => escapeHTML(c.name)).join(', '))}
        ${row('Home Screen app', isInstalled() ? 'yes' : 'not yet')}
        ${row('Storage kept safe', persisted ? 'yes' : isInstalled() ? 'asking…' : 'after you add it to Home Screen')}
        ${row('Space used', est ? `${(est.usage / 1024).toFixed(0)} KB` : '—')}
        ${row('Works offline', 'serviceWorker' in navigator ? 'yes, after first load' : 'no')}
      </div>
      <div class="card">
        <div class="label" style="margin-bottom:10px">Theme</div>
        <div class="seg" role="group" aria-label="Theme">${(['light', 'dark', 'system'] as Mode[]).map((m) => `<button type="button" data-mode="${m}" aria-pressed="${s.mode === m}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}</div>
      </div>
      <p class="muted" style="text-align:center;font-size:12px;margin:auto 0 0">Noggin? ${VERSION} · © 2026 Innova Space</p>
    </main>`;
  app.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => b.addEventListener('click', async () => {
    applyLook(await updateSettings({ mode: b.dataset.mode as Mode }));
    void renderCheck(app);
  }));
  if (isInstalled() && !persisted) void requestPersistence();
}
