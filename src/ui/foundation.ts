// Welcome screen (first open). Phase 5 adds the name step, passkey sign-in, Restore and the Thoughts rising animation.
import { updateSettings } from '../db/db';

export function renderWelcome(app: HTMLElement, done: () => void): void {
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
  app.querySelector('#start')!.addEventListener('click', async () => {
    await updateSettings({ onboarded: true });
    done();
  });
}
