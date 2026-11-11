import './styles/tokens.css';
import './styles/base.css';
import './lib/sw';
import { ensureSeeded, getSettings, purgeDeleted } from './db/db';
import { applyLook, onSystemModeChange } from './lib/look';
import { isInstalled, requestPersistence } from './lib/storage';
import { renderWelcome } from './ui/foundation';

// No pinch zoom (text size lives in Settings).
for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });

const app = document.getElementById('app')!;

(async () => {
  await ensureSeeded();
  await purgeDeleted();
  if (isInstalled()) void requestPersistence();
  applyLook(await getSettings());
  onSystemModeChange(async () => applyLook(await getSettings()));
  renderWelcome(app);
})();
