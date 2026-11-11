import { registerSW } from 'virtual:pwa-register';

// Service worker. The "A new Noggin? is ready" notice shows while a new version waits.
sessionStorage.removeItem('noggin-update-ready');
export const updateSW = registerSW({
  onNeedRefresh() {
    sessionStorage.setItem('noggin-update-ready', '1');
    window.dispatchEvent(new Event('noggin:update-ready'));
  },
});

export function applyUpdate(): void {
  sessionStorage.removeItem('noggin-update-ready');
  void updateSW(true);
  setTimeout(() => location.reload(), 1500);
}
