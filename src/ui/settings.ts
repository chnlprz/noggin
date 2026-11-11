// Settings (Bible › Onboarding, Settings, About). ☰ opens it, like Nudge!'s Settings.
import { db, getSettings, updateSettings } from '../db/db';
import { downloadBackup, previewBackup, restoreBackup, RESTORE_REASONS } from '../db/backup';
import type { Category, FontChoice, Mode, Settings, Thought } from '../db/types';
import { applyLook, contrast, customPalette } from '../lib/look';
import { nowISO, uid } from '../lib/util';
import { restore } from '../logic/thoughts';
import { h, ICON, openSheet, toast } from './kit';

export const VERSION = '1.0.0';
const SIZES = [0.9, 1, 1.12, 1.25];

type Nav = { back: () => void; go: (v: 'archives' | 'analytics') => void; wide: boolean; refresh: () => void };

export async function renderSettings(view: HTMLElement, nav: Nav): Promise<void> {
  const s = await getSettings();
  const meta = await db.meta.get('meta');
  const deleted = (await db.thoughts.toArray()).filter((t) => t.deletedAt).length;
  const sw = (key: string, on: boolean, label: string) => `<label class="set-row"><span>${label}</span><input type="checkbox" role="switch" class="sw" data-sw="${key}" ${on ? 'checked' : ''}></label>`;
  const link = (key: string, label: string, right = '') => `<button class="set-row" data-link="${key}"><span>${label}</span><span class="muted small">${right} ${ICON.chev}</span></button>`;
  const seg = (key: string, cur: string, opts: [string, string][]) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button type="button" data-${key}="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
  const pal = s.custom ? customPalette(s.custom.accent, s.custom.paper) : null;
  const warn = s.custom && pal ? [
    contrast(pal['--ink'], s.custom.paper) < 4.5 ? 'text may be hard to read' : '',
    contrast(s.custom.accent, s.custom.paper) < 1.6 ? 'the accent is close to the background' : '',
  ].filter(Boolean) : [];
  const sizeIdx = Math.max(0, SIZES.indexOf(s.textScale)) || (s.textScale ? SIZES.findIndex((x) => x >= s.textScale) : 1);

  view.innerHTML = `
    <div class="sub-top"><button class="back" data-back>${ICON.back}<span>Settings</span></button></div>
    <h1 class="serif an-title">Settings</h1>
    ${nav.wide ? '' : `<div class="set-group">${link('archives', 'Archives')}${link('analytics', 'Analytics')}</div>`}

    <p class="set-h">Profile</p>
    <div class="set-group"><div class="set-row col"><label for="sName">Name</label><input class="field" id="sName" maxlength="32" value="${h(s.name)}" placeholder="Friend" autocomplete="given-name"></div></div>

    <p class="set-h">Look</p>
    <div class="set-group">
      <div class="set-row col"><span>Theme</span>${seg('setmode', s.custom ? '' : s.mode, [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']])}</div>
      ${sw('custom', !!s.custom, 'Custom colours')}
      ${s.custom ? `<div class="set-row"><span>Accent</span><input type="color" data-color="accent" value="${s.custom.accent}"></div>
        <div class="set-row"><span>Background</span><input type="color" data-color="paper" value="${s.custom.paper}"></div>
        <p class="hint set-note">${warn.length ? `Heads up: ${warn.join(', ')}. You can still keep it.` : 'These colours pass the contrast check.'}</p>` : ''}
      <div class="set-row col"><span>Font</span>${seg('setfont', s.font, [['serif', 'Serif'], ['sans', 'Sans'], ['easy', 'Easy read']])}</div>
      <div class="set-row col"><label for="sSize">Text size</label><input type="range" id="sSize" min="0" max="3" step="1" value="${sizeIdx}"><div class="range-l"><span>Small</span><span>Default</span><span>Large</span><span>Larger</span></div></div>
    </div>

    <p class="set-h">Thoughts</p>
    <div class="set-group">${link('cats', 'Categories', String(await db.categories.count()))}${sw('keepAdding', s.keepAdding, 'Keep adding on by default')}</div>

    <p class="set-h">Still curious?</p>
    <div class="set-group">${sw('stillCurious', s.stillCurious, 'Show one old thought a day')}
      <label class="set-row off"><span>Weekly notification <span class="muted small">· needs sign-in, coming soon</span></span><input type="checkbox" role="switch" class="sw" disabled></label></div>

    <p class="set-h">Nudge!</p>
    <div class="set-group">${sw('sendToNudge', s.sendToNudge, 'Send steps to Nudge!')}
      <p class="hint set-note">Signed in, sent steps become Nudge! tasks marked “from Noggin?” and their status comes back. Signed out, they’re copied into Nudge!’s batch add. Arrives in an update soon.</p>
      <a class="set-row" href="https://nudge.innovaspace.app" target="_blank" rel="noopener"><span>Open Nudge!</span><span class="muted small">${ICON.chev}</span></a></div>

    <p class="set-h">Account</p>
    <div class="set-group"><div class="set-row off"><span>Sign in with a passkey</span><span class="muted small">Coming soon</span></div>
      <p class="hint set-note">One passkey for every Innova Space app. Until then, everything stays on this device.</p></div>

    <p class="set-h">Your data</p>
    <div class="set-group">
      <button class="set-row" data-act="backup"><span>Back up now</span><span class="muted small">${meta?.lastBackupAt ? `Last: ${new Date(meta.lastBackupAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Never'}</span></button>
      <button class="set-row" data-act="restore"><span>Restore from a backup</span><span class="muted small">${ICON.chev}</span></button>
      ${link('deleted', 'Recently deleted', deleted ? String(deleted) : '')}
      <input id="sFile" type="file" accept="application/json,.json" hidden>
    </div>

    <p class="set-h">About</p>
    <div class="set-group">
      <div class="set-row"><span>Version</span><span class="muted small">${VERSION}</span></div>
      ${link('news', 'What’s new')}
      <button class="set-row" data-act="feedback"><span>Send feedback</span><span class="muted small">${ICON.chev}</span></button>
    </div>
    <p class="hint" style="text-align:center;margin:18px 0 0">Noggin? · Stay curious. · © 2026 Innova Space</p>`;

  const apply = async (patch: Partial<Settings>) => { applyLook(await updateSettings(patch)); };

  const name = view.querySelector<HTMLInputElement>('#sName')!;
  name.addEventListener('change', async () => { await updateSettings({ name: name.value.trim() }); toast('Name saved'); nav.refresh(); });
  const size = view.querySelector<HTMLInputElement>('#sSize')!;
  size.addEventListener('input', () => void apply({ textScale: SIZES[+size.value] }));
  view.querySelectorAll<HTMLInputElement>('[data-color]').forEach((c) => c.addEventListener('change', async () => {
    const cur = (await getSettings()).custom!;
    await apply({ custom: { ...cur, [c.dataset.color!]: c.value } });
    void renderSettings(view, nav);
  }));
  view.querySelectorAll<HTMLInputElement>('[data-sw]').forEach((c) => c.addEventListener('change', async () => {
    const k = c.dataset.sw!;
    if (k === 'custom') { await apply({ custom: c.checked ? { accent: '#d8b46a', paper: getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#0b0a09' } : undefined }); return void renderSettings(view, nav); }
    await apply({ [k]: c.checked } as Partial<Settings>);
  }));
  const file = view.querySelector<HTMLInputElement>('#sFile')!;
  file.addEventListener('change', async () => { const f = file.files?.[0]; file.value = ''; if (f) await confirmRestore(f, () => { nav.refresh(); }); });

  view.onclick = async (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-back]')) return nav.back();
    const m = t.closest<HTMLElement>('[data-setmode]');
    if (m) { await apply({ mode: m.dataset.setmode as Mode, custom: undefined }); return void renderSettings(view, nav); }
    const f = t.closest<HTMLElement>('[data-setfont]');
    if (f) { await apply({ font: f.dataset.setfont as FontChoice }); return void renderSettings(view, nav); }
    const l = t.closest<HTMLElement>('[data-link]');
    if (l) {
      const k = l.dataset.link!;
      if (k === 'archives' || k === 'analytics') return nav.go(k);
      if (k === 'cats') return openCategories(() => void renderSettings(view, nav));
      if (k === 'deleted') return openDeleted(() => { void renderSettings(view, nav); nav.refresh(); });
      if (k === 'news') return void openSheet(`<div class="sheet-head"><h2 class="serif">What’s new</h2></div>${NEWS}`);
    }
    const a = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (a === 'backup') { await downloadBackup(); toast('Backup saved to your downloads'); return void renderSettings(view, nav); }
    if (a === 'restore') return file.click();
    if (a === 'feedback') return openFeedback();
  };
}

const NEWS = `<div class="news">
  <p><b>1.0 · Nov 2026</b></p>
  <ul><li>Catch a thought: One or Several, Keep adding, paragraphs</li><li>Curiosities and Wonderings, details, steps, search, Archives</li><li>Still curious?: one old thought a day</li><li>Analytics: your thought patterns</li><li>Settings, backups, Recently deleted, Thoughts rising welcome</li><li>Desktop layout</li></ul>
  <p class="hint">Coming next: passkey sign-in and sync with Nudge!, then sending steps to Nudge!.</p></div>`;

async function confirmRestore(f: File, after: () => void): Promise<void> {
  const p = await previewBackup(f);
  if (!p.ok) return toast(RESTORE_REASONS[p.reason], undefined, 6000);
  const sheet = openSheet(`<div class="sheet-head"><h2 class="serif">Restore this backup?</h2></div>
    <p class="muted" style="margin:0 0 6px">${p.curiosities} curiosities, ${p.wonderings} wonderings and ${p.steps} steps, from ${new Date(p.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.</p>
    <p class="hint" style="margin:0 0 16px">It replaces the thoughts on this device. Back up first if you want to keep them.</p>
    <div class="two"><button class="btn-secondary" data-no>Cancel</button><button class="btn" data-yes>Restore</button></div>`);
  sheet.el.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-no]')) return sheet.close();
    if (t.closest('[data-yes]')) { await restoreBackup(p.backup); applyLook(await getSettings()); sheet.close(); toast('Backup restored'); after(); }
  });
}

/** Categories: rename any, add, delete ones you added (their thoughts move to No category, with Undo). */
async function openCategories(after: () => void): Promise<void> {
  const cats = await db.categories.orderBy('order').toArray();
  const sheet = openSheet(`<div class="sheet-head"><h2 class="serif">Categories</h2></div>
    <div class="cat-list">${cats.map((c) => `<div class="cat-row"><input class="field" data-ren="${c.id}" value="${h(c.name)}" maxlength="24" aria-label="Category name">${c.builtIn ? '<span class="muted small" title="Built-in categories can be renamed, not deleted">Built in</span>' : `<button class="icon-btn sm" data-del="${c.id}" aria-label="Delete ${h(c.name)}">${ICON.trash}</button>`}</div>`).join('')}</div>
    <form class="add-step" id="newCat"><input class="field" id="nc" placeholder="New category" maxlength="24" aria-label="New category"><button class="icon-btn" aria-label="Add category">${ICON.plus}</button></form>`, after);
  const el = sheet.el;
  el.querySelectorAll<HTMLInputElement>('[data-ren]').forEach((i) => i.addEventListener('change', async () => {
    const v = i.value.trim();
    if (!v) { i.value = cats.find((c) => c.id === i.dataset.ren)!.name; return; }
    await db.categories.update(i.dataset.ren!, { name: v, updatedAt: nowISO() });
  }));
  el.querySelector('#newCat')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inp = el.querySelector<HTMLInputElement>('#nc')!; const v = inp.value.trim();
    if (!v) return inp.focus();
    if (cats.some((c) => c.name.toLowerCase() === v.toLowerCase())) return toast('That category is already there');
    await db.categories.add({ id: uid(), name: v, order: (cats.at(-1)?.order ?? 0) + 1, builtIn: false, updatedAt: nowISO() });
    sheet.close(); void openCategories(after);
  });
  el.addEventListener('click', async (e) => {
    const d = (e.target as HTMLElement).closest<HTMLElement>('[data-del]');
    if (!d) return;
    const cat = cats.find((c) => c.id === d.dataset.del)! as Category;
    const moved = await db.thoughts.where('categoryId').equals(cat.id).toArray();
    await db.transaction('rw', db.categories, db.thoughts, async () => {
      await db.categories.delete(cat.id);
      for (const t of moved) await db.thoughts.update(t.id, { categoryId: undefined, updatedAt: nowISO() });
    });
    sheet.close(); void openCategories(after);
    toast(`Deleted ${cat.name}${moved.length ? `; ${moved.length} thought${moved.length > 1 ? 's' : ''} now have no category` : ''}`, async () => {
      await db.categories.put(cat);
      for (const t of moved) await db.thoughts.update(t.id, { categoryId: cat.id });
      after();
    });
  });
}

/** Recently deleted: kept 30 days, then gone for good. */
async function openDeleted(after: () => void): Promise<void> {
  const list = (await db.thoughts.toArray()).filter((t) => t.deletedAt).sort((a, b) => b.deletedAt!.localeCompare(a.deletedAt!));
  const left = (t: Thought) => Math.max(0, 30 - Math.floor((Date.now() - Date.parse(t.deletedAt!)) / 864e5));
  const sheet = openSheet(`<div class="sheet-head"><h2 class="serif">Recently deleted</h2></div>
    ${list.length ? `<div class="list">${list.map((t) => `<div class="row"><span class="row-body"><span class="row-text">${h(t.text)}</span><span class="meta">${left(t)} day${left(t) === 1 ? '' : 's'} left</span></span><button class="link" data-res="${t.id}">Restore</button></div>`).join('')}</div>
      <button class="link muted" style="margin-top:14px" data-purge>Delete all now</button>` : '<p class="empty">Nothing here. Deleted thoughts stay 30 days.</p>'}`, after);
  sheet.el.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    const r = t.closest<HTMLElement>('[data-res]');
    if (r) { await restore([r.dataset.res!]); toast('Restored'); sheet.close(); return void openDeleted(after); }
    if (t.closest('[data-purge]')) {
      const p = t.closest<HTMLElement>('[data-purge]')!;
      if (!p.dataset.sure) { p.dataset.sure = '1'; p.textContent = `Delete ${list.length} for good? Tap again`; return; }
      const ids = list.map((x) => x.id);
      await db.transaction('rw', db.thoughts, db.steps, async () => { await db.steps.where('thoughtId').anyOf(ids).delete(); await db.thoughts.bulkDelete(ids); });
      sheet.close(); toast('Deleted for good');
    }
  });
}

function openFeedback(): void {
  const info = `Noggin? ${VERSION} · ${navigator.userAgent}`;
  const sheet = openSheet(`<div class="sheet-head"><h2 class="serif">Send feedback</h2></div>
    <p class="muted" style="margin:0 0 12px">Ideas, bugs, anything. It goes to <b>feedback@innovaspace.app</b>.</p>
    <textarea class="field area" id="fb" rows="4" placeholder="What’s on your noggin?"></textarea>
    <div class="two" style="margin-top:12px"><button class="btn-secondary" data-copy>Copy</button><button class="btn" data-mail>Open email</button></div>`);
  const fb = sheet.el.querySelector<HTMLTextAreaElement>('#fb')!;
  sheet.el.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    const body = `${fb.value}\n\n— ${info}`;
    if (t.closest('[data-mail]')) location.href = `mailto:feedback@innovaspace.app?subject=${encodeURIComponent('Noggin? feedback')}&body=${encodeURIComponent(body)}`;
    if (t.closest('[data-copy]')) { try { await navigator.clipboard.writeText(body); toast('Copied. Paste it in an email to feedback@innovaspace.app'); } catch { toast('Couldn’t copy. Nothing changed.'); } }
  });
  setTimeout(() => fb.focus(), 60);
}
