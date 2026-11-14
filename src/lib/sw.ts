import { registerSW } from 'virtual:pwa-register';

// Service worker. The "A new Noggin? is ready" notice shows while a new version waits.
// An app left open checks for a new version when it comes back to the screen, on tab taps and every 15 minutes;
// once one is waiting, the next tab tap (no sheet open, not typing) or the next return to the screen moves into it.
// Ported from Nudge! 2.15.
sessionStorage.removeItem('noggin-update-ready');
let reg: ServiceWorkerRegistration | undefined, lastCheck = 0;
const ready = () => !!sessionStorage.getItem('noggin-update-ready');
const busy = () => !!document.querySelector('.sheet, .intro, .intro-layer, [role="dialog"]') || !!document.activeElement?.matches('input, textarea, select');

export const updateSW = registerSW({
  onNeedRefresh() {
    sessionStorage.setItem('noggin-update-ready', '1');
    window.dispatchEvent(new Event('noggin:update-ready'));
  },
  onRegisteredSW(_url, r) { reg = r; },
});

function check(): void {
  if (!reg || !navigator.onLine || Date.now() - lastCheck < 30_000) return;
  lastCheck = Date.now(); void reg.update().catch(() => {});
}

/** Reload into the new version. If nothing is waiting (already updated elsewhere), a plain reload still clears it. */
export function applyUpdate(): void {
  sessionStorage.removeItem('noggin-update-ready');
  sessionStorage.setItem('noggin-updated', '1');
  void updateSW(true);
  setTimeout(() => location.reload(), 1500);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (ready() && !busy()) return applyUpdate();
  check();
});
window.addEventListener('focus', check);
setInterval(check, 15 * 60_000);

// A tab tap (Curiosities, Wonderings): check, or if a new version waits, open that list in the new version.
document.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('.bottombar [data-tab], .home-tabs [data-tab], .sidebar [data-side]');
  if (!b) return;
  if (ready() && !busy()) {
    e.preventDefault(); e.stopImmediatePropagation();
    const tab = b.dataset.tab ?? b.dataset.side;
    if (tab === 'curiosity' || tab === 'wondering') try { localStorage.setItem('noggin-tab', tab); } catch { /* not remembered */ }
    return applyUpdate();
  }
  check();
}, true);

/** True once, right after an update reload. */
export function afterUpdate(): boolean {
  const u = !!sessionStorage.getItem('noggin-updated'); sessionStorage.removeItem('noggin-updated');
  return u;
}
