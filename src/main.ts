import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import './lib/sw';
import { ensureSeeded, getSettings, purgeDeleted } from './db/db';
import { applyLook, onSystemModeChange } from './lib/look';
import { isInstalled, requestPersistence } from './lib/storage';
import { renderWelcome } from './ui/onboarding';
import { render, startShell } from './ui/shell';
import { startAutoSync } from './lib/cloud';

// No pinch zoom (text size lives in Settings).
for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });

const app = document.getElementById('app')!;

(async () => {
  await ensureSeeded();
  await purgeDeleted();
  if (isInstalled()) void requestPersistence();
  const s = await getSettings();
  applyLook(s);
  onSystemModeChange(async () => applyLook(await getSettings()));
  // Signed in: keep devices in step. Rows from another device redraw the screen, unless you're typing or a sheet is open.
  const redraw = () => {
    const busy = document.querySelector('.sheet-back') || /INPUT|TEXTAREA/.test(document.activeElement?.tagName ?? '');
    if (busy) { const again = () => { document.removeEventListener('focusout', again); setTimeout(redraw, 300); }; document.addEventListener('focusout', again); return; }
    if (document.querySelector('.shell')) { void getSettings().then(applyLook); void render(); }
  };
  startAutoSync(redraw);
  if (s.onboarded) startShell(app);
  else renderWelcome(app, () => startShell(app));
})();
