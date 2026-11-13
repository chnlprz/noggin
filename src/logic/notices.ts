// Home notices (Bible › States): one at a time, highest first. 1 new version ready · 2 add to Home Screen.
// The backup reminder joins in Phase 5.
import { db } from '../db/db';
import { isInstalled, isIOS } from '../lib/storage';

export type Notice = { id: 'update' | 'a2hs' | 'backup'; text: string; action?: string };

const DAY = 864e5;
const isPhone = () => /iphone|ipad|ipod|android/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export async function currentNotice(): Promise<Notice | null> {
  if (sessionStorage.getItem('noggin-update-ready')) return { id: 'update', text: 'A new Noggin? is ready.', action: 'Reload' };
  if (isPhone() && !isInstalled()) {
    const meta = await db.meta.get('meta');
    const hidden = meta?.a2hsHiddenAt ? Date.now() - Date.parse(meta.a2hsHiddenAt) : Infinity;
    // From the first Home after onboarding, then again a week after each ×.
    if (hidden >= 7 * DAY) return { id: 'a2hs', text: 'Add Noggin? to your Home Screen for the full app: full screen, faster, and your thoughts stay safe.', action: 'How' };
  }
  // 3 Backup reminder: 10+ thoughts and no backup in 14 days (× hides it for a week).
  const meta = await db.meta.get('meta');
  const count = await db.thoughts.count();
  const lastB = meta?.lastBackupAt ? Date.now() - Date.parse(meta.lastBackupAt) : Infinity;
  const hiddenB = meta?.backupHiddenAt ? Date.now() - Date.parse(meta.backupHiddenAt) : Infinity;
  if (count >= 10 && lastB >= 14 * DAY && hiddenB >= 7 * DAY) return { id: 'backup', text: 'Back up your thoughts? It takes a second.', action: 'Back up' };
  return null;
}

export async function hideNotice(id: Notice['id']): Promise<void> {
  if (id === 'a2hs') await db.meta.update('meta', { a2hsHiddenAt: new Date().toISOString() });
  if (id === 'backup') await db.meta.update('meta', { backupHiddenAt: new Date().toISOString() });
}

export function homeScreenSteps(): string {
  return isIOS()
    ? '<ol class="steps-ol"><li>Tap the Share button at the bottom of Safari.</li><li>Scroll and tap <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b>. Open Noggin? from your Home Screen from now on.</li></ol><p class="hint">In a browser tab, Safari may clear a site’s data if you don’t visit for 7 days. The Home Screen app keeps it.</p>'
    : '<ol class="steps-ol"><li>Tap the ⋮ menu in Chrome.</li><li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li><li>Open Noggin? from your Home Screen from now on.</li></ol>';
}
