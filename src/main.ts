import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import './lib/sw';
import { ensureSeeded, getSettings, purgeDeleted } from './db/db';
import { applyLook, onSystemModeChange } from './lib/look';
import { isInstalled, requestPersistence } from './lib/storage';
import { renderWelcome } from './ui/foundation';
import { startShell } from './ui/shell';

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
  // Phase 5 adds the name step and the Thoughts rising animation between Welcome and Home.
  if (s.onboarded) startShell(app);
  else renderWelcome(app, () => startShell(app));
})();
