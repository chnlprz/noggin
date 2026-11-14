// App shell (Bible › Screens and navigation): greeting top bar, Curiosities · + · Wonderings, lists, search, archives, menu.
import { seen, sendUsage, track } from '../lib/usage';
import { db, getSettings, updateSettings } from '../db/db';
import type { Category, Mode, Thought, ThoughtType } from '../db/types';
import { applyLook } from '../lib/look';
import { applyUpdate } from '../lib/sw';
import { pickGreeting } from '../lib/util';
import { archive, categories, listThoughts, restore, search, softDelete, stepCounts, unarchive, updateThought } from '../logic/thoughts';
import { openCapture } from './capture';
import { renderAnalytics } from './analytics';
import { renderSettings, setSettingsPage } from './settings';
import { downloadBackup } from '../db/backup';
import { dismissStillCurious, stillCurious } from '../logic/resurface';
import { currentNotice, hideNotice, homeScreenSteps } from '../logic/notices';
import { renderDetail } from './detail';
import { h, hideToast, ICON, openSheet, toast } from './kit';

type View = 'list' | 'detail' | 'search' | 'archives' | 'analytics' | 'settings';
type Sort = 'newest' | 'oldest' | 'category' | 'revisited';

const S = {
  tab: (localStorage.getItem('noggin-tab') === 'wondering' ? 'wondering' : 'curiosity') as ThoughtType, // remembered, so a reload keeps your list
  view: 'list' as View,
  left: 'list' as Exclude<View, 'detail'>, // desktop: what the left column shows
  openedId: '', // counts a revisit once per opening
  id: '',
  sort: 'newest' as Sort,
  cat: '' as string, // filter by category id
  q: '',
  archTab: 'curiosity' as ThoughtType,
  reveal: '', // archives row showing Restore · Delete
  swiped: '', // phone: list row swiped left, showing Archive · Delete
  selecting: false,
  picked: new Set<string>(),
  greet: '', // one greeting per open, same on both lists
};

let app: HTMLElement;
let firstPaint = true; // Home rises in on the first paint after opening the app
const wideMQ = matchMedia('(min-width: 768px)');
const wide = () => wideMQ.matches;
const plural = (t: ThoughtType) => (t === 'curiosity' ? 'Curiosities' : 'Wonderings');

/** Open one thought (from Nudge!'s "Open in Noggin?" link, #t-<id>). */
export function openThought(id: string): void { go('detail', id); }

export function startShell(root: HTMLElement): void {
  app = root;
  app.innerHTML = `<aside class="sidebar" id="side" aria-label="Noggin?"></aside><div class="shell"><div id="view"></div></div><nav class="bottombar" id="bar" aria-label="Lists"></nav>`;
  wideMQ.addEventListener('change', () => { if (wide() && S.view === 'detail') S.view = S.left; void render(); });
  window.addEventListener('popstate', () => {
    const st = history.state as { view?: View; id?: string; sp?: string } | null;
    S.view = st?.view ?? 'list'; S.id = st?.id ?? '';
    if (S.view !== 'detail') S.left = S.view as typeof S.left;
    if (S.view === 'settings') setSettingsPage(st?.sp);
    document.getElementById('view')!.style.transform = '';
    void render();
  });
  window.addEventListener('noggin:update-ready', () => void render());
  document.addEventListener('keydown', (e) => {
    const r = e.target as HTMLElement;
    if ((e.key === 'Enter' || e.key === ' ') && r.getAttribute('role') === 'button' && r.classList.contains('row')) { e.preventDefault(); r.click(); return; }
    const typing = /INPUT|TEXTAREA/.test((e.target as HTMLElement).tagName);
    if (typing || document.querySelector('.sheet-back')) return;
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); plus(); }
    if (e.key === '/') { e.preventDefault(); go('search'); }
  });
  enableSwipeBack();
  // A long-press swallows only the click that comes right after it.
  document.addEventListener('pointerup', () => { if (pressed) setTimeout(() => { pressed = false; }, 60); });
  void render();
}

function go(view: View, id = ''): void {
  if (view !== 'detail' && view !== 'list') hideToast(); // an Undo from the list doesn't follow you into Settings, Search…
  if (view === 'detail' && wide()) { S.id = id; void render(); return; } // desktop: details open in the right pane
  if (view !== 'detail') { S.left = view; if (wide()) S.id = ''; }
  if (view === 'settings') setSettingsPage('main');
  S.view = view; S.id = id || (view === 'detail' ? id : S.id); S.selecting = false; S.picked.clear();
  if (view === 'list') history.replaceState(null, '');
  else history.pushState({ view, id }, '');
  window.scrollTo(0, 0);
  void render();
}
const back = () => (history.state?.view ? history.back() : go('list'));
// From inside a thought: open a Settings page directly (e.g. AI helpers → Sync and sign-in)
document.addEventListener('noggin:settings', (e) => {
  const p = (e as CustomEvent<string>).detail;
  go('settings'); setSettingsPage(p); history.replaceState({ view: 'settings', sp: p }, ''); void render();
});
const plus = () => void openCapture(S.view === 'list' ? S.tab : S.tab, (type) => { S.tab = type; if (S.view === 'list') void render(); });

// Renders run one after another, so a quick second tap never lands on a half-drawn screen.
let queue: Promise<void> = Promise.resolve();
export function render(): Promise<void> {
  queue = queue.then(draw, draw);
  return queue;
}

function setTab(t: ThoughtType): void {
  S.tab = t; S.cat = ''; S.selecting = false; S.picked.clear(); S.swiped = '';
  try { localStorage.setItem('noggin-tab', t); } catch { /* private mode: it just isn't remembered */ }
  window.scrollTo(0, 0); void render();
}

async function draw(): Promise<void> {
  const view = document.getElementById('view')!;
  const bar = document.getElementById('bar')!;
  try { localStorage.setItem('noggin-tab', S.tab); } catch { /* private mode: not remembered */ }
  bar.hidden = S.view !== 'list' || S.selecting;
  bar.innerHTML = `
    <button class="tab-btn" data-tab="curiosity" ${S.tab === 'curiosity' ? 'aria-current="page"' : ''}>Curiosities</button>
    <button class="fab" data-plus aria-label="Catch a thought">${ICON.plus}</button>
    <button class="tab-btn" data-tab="wondering" ${S.tab === 'wondering' ? 'aria-current="page"' : ''}>Wonderings</button>`;
  bar.onclick = (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-plus]')) return plus();
    const tb = t.closest<HTMLElement>('[data-tab]');
    if (tb) return setTab(tb.dataset.tab as ThoughtType);
  };
  if (wide()) return renderWide(view);
  if (S.view === 'detail') return detailInto(view, back);
  if (S.view === 'search') return renderSearch(view);
  if (S.view === 'archives') return renderArchives(view);
  if (S.view === 'analytics') seen('view.analytics');
  if (S.view === 'analytics') return renderAnalytics(view, { back, open: (id) => go('detail', id) });
  if (S.view === 'settings') return renderSettings(view, settingsNav(false));
  return renderList(view);
}

function settingsNav(isWide: boolean) {
  return { back, go: (v: 'archives' | 'analytics') => go(v), wide: isWide, refresh: () => { S.greet = ''; if (isWide) void render(); } };
}

function detailInto(el: HTMLElement, onBack: () => void): Promise<void> {
  const first = S.openedId !== S.id; S.openedId = S.id;
  return renderDetail(el, S.id, { back: onBack, refresh: () => void render() }, first);
}

// ── Desktop (768 px and up): sidebar, list on the left, details on the right ──
async function renderWide(view: HTMLElement): Promise<void> {
  const s = await getSettings();
  const side = document.getElementById('side')!;
  const left = S.view === 'detail' ? S.left : S.view;
  const nav = (key: string, label: string, on: boolean, extra = '') => `<button class="side-item" data-side="${key}" ${on ? 'aria-current="page"' : ''} ${extra}>${label}</button>`;
  side.innerHTML = `
    <div class="wordmark side-mark">Noggin<span class="q">?</span></div>
    <button class="btn side-new" data-plus>Catch a thought <kbd>N</kbd></button>
    ${nav('curiosity', 'Curiosities', left === 'list' && S.tab === 'curiosity')}
    ${nav('wondering', 'Wonderings', left === 'list' && S.tab === 'wondering')}
    <div class="side-gap"></div>
    ${nav('search', 'Search', left === 'search')}
    ${nav('archives', 'Archives', left === 'archives')}
    ${nav('analytics', 'Analytics', left === 'analytics')}
    ${nav('settings', 'Settings', left === 'settings')}
    <div class="side-foot"><div class="seg" role="group" aria-label="Theme">${(['light', 'dark', 'system'] as Mode[]).map((m) => `<button type="button" data-setmode="${m}" aria-pressed="${!s.custom && s.mode === m}">${m === 'system' ? 'Auto' : m[0].toUpperCase() + m.slice(1)}</button>`).join('')}</div></div>`;
  side.onclick = async (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-plus]')) return plus();
    const m = t.closest<HTMLElement>('[data-setmode]');
    if (m) { applyLook(await updateSettings({ mode: m.dataset.setmode as Mode, custom: undefined })); return void render(); }
    const b = t.closest<HTMLElement>('[data-side]');
    if (!b || b.hasAttribute('disabled')) return;
    const k = b.dataset.side!;
    if (k === 'curiosity' || k === 'wondering') { S.tab = k; S.cat = ''; try { localStorage.setItem('noggin-tab', k); } catch { /* not remembered */ } return go('list'); }
    if (k === 'search' || k === 'archives' || k === 'analytics' || k === 'settings') return go(k);
  };
  view.innerHTML = `<div class="split"><div id="main"></div><div id="pane" aria-live="polite"></div></div>`;
  const main = document.getElementById('main')!, pane = document.getElementById('pane')!;
  if (left === 'search') await renderSearch(main);
  else if (left === 'archives') await renderArchives(main);
  else if (left === 'analytics') await renderAnalytics(main, { back, open: (id) => go('detail', id) });
  else if (left === 'settings') await renderSettings(main, settingsNav(true));
  else await renderList(main);
  if (S.id) await detailInto(pane, () => { S.id = ''; void render(); });
  else pane.innerHTML = '<p class="pane-hint">Pick a thought to explore it.</p>';
}

// ── Lists ──
async function renderList(view: HTMLElement): Promise<void> {
  seen(S.tab === 'curiosity' ? 'view.curiosities' : 'view.wonderings');
  const rise = firstPaint; firstPaint = false;
  const s = await getSettings();
  const meta = await db.meta.get('meta');
  if (!S.greet) {
    S.greet = pickGreeting(s.name, meta?.lastGreeting);
    await db.meta.update('meta', { lastGreeting: S.greet });
  }
  const [all, cats, counts] = await Promise.all([listThoughts({ type: S.tab, archived: false }), categories(), stepCounts()]);
  const items = S.cat ? all.filter((t) => t.categoryId === S.cat) : all;
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const sortLabel = { newest: 'Newest', oldest: 'Oldest', category: 'By category', revisited: 'Most revisited' }[S.sort];
  const n = await currentNotice();
  const update = n ? `<div class="notice"><span>${n.text}</span><span class="notice-acts">${n.action ? `<button class="link" data-notice="${n.id}">${n.action}</button>` : ''}${n.id !== 'update' ? `<button class="icon-btn sm" data-hide="${n.id}" aria-label="Hide">${ICON.x}</button>` : ''}</span></div>` : '';
  const sc = S.selecting ? null : await stillCurious();
  const card = sc && sc.type === S.tab ? `<div class="sc-card"><div class="label">Still curious?</div><p class="sc-text">${h(sc.text)}</p><div class="sc-acts"><button class="link" data-sc="open" data-id="${sc.id}">Open</button><button class="link muted" data-sc="later" data-id="${sc.id}">Not now</button><button class="link muted" data-sc="archive" data-id="${sc.id}">Archive</button></div></div>` : '';

  const rowHTML = (t: Thought) => {
    const c = counts.get(t.id);
    const meta = [t.categoryId && catName.get(t.categoryId) ? h(catName.get(t.categoryId)!) : '', c?.total ? `${c.total} step${c.total > 1 ? 's' : ''}` : '', c?.inNudge ? `<span class="g">${c.inNudge} in Nudge</span>` : '', t.note && !c?.total ? 'has a note' : ''].filter(Boolean).join(' · ');
    const picked = S.picked.has(t.id);
    const swiped = S.swiped === t.id && !S.selecting;
    const quick = S.selecting ? '' : swiped ? `<span class="row-swipe"><button class="sw-btn" data-qarch="${t.id}">Archive</button><button class="sw-btn danger" data-qdel="${t.id}">Delete</button></span>` : `<span class="row-quick"><button class="icon-btn sm" data-qarch="${t.id}" aria-label="Archive" title="Archive">${ICON.archive}</button><button class="icon-btn sm" data-qdel="${t.id}" aria-label="Delete" title="Delete">${ICON.trash}</button></span>`;
    return `<div class="row${swiped ? ' swiped' : ''}${S.selecting ? ' selecting' : ''}${wide() && S.id === t.id ? ' on' : ''}" data-open="${t.id}" role="button" tabindex="0" ${S.selecting ? `aria-pressed="${picked}"` : ''}>${S.selecting ? `<span class="check${picked ? ' on' : ''}" aria-hidden="true">${picked ? '✓' : ''}</span>` : ''}<span class="row-body"><span class="row-text">${h(t.text)}</span>${meta ? `<span class="meta">${meta}</span>` : ''}</span>${quick}</div>`;
  };
  let body: string;
  if (!items.length) {
    body = `<p class="empty">${S.cat ? 'Nothing in this category yet.' : S.tab === 'curiosity' ? 'No ideas yet. Tap + when one shows up.' : 'No wonderings yet. Tap + to save a question.'}</p>`;
  } else if (S.sort === 'category') {
    const groups = [...cats.map((c) => [c.name, items.filter((t) => t.categoryId === c.id)] as const), ['No category', items.filter((t) => !t.categoryId || !catName.has(t.categoryId))] as const].filter(([, l]) => l.length);
    body = groups.map(([n, l]) => `<p class="group-h">${h(n)}</p>${[...l].sort(newest).map(rowHTML).join('')}`).join('');
  } else {
    const sorted = [...items].sort(S.sort === 'oldest' ? (a, b) => a.createdAt.localeCompare(b.createdAt) : S.sort === 'revisited' ? (a, b) => b.opens - a.opens || newest(a, b) : newest);
    body = sorted.map(rowHTML).join('');
  }

  view.innerHTML = `
    <header class="topbar"><h1 class="greet serif">${h(S.greet)}</h1>
      <div class="top-icons"><button class="icon-btn" data-search aria-label="Search">${ICON.search}</button><button class="icon-btn" data-menu aria-label="Settings" title="Settings">${ICON.menu}</button></div></header>
    <div class="tabs home-tabs" role="tablist" aria-label="List"><button role="tab" data-tab="curiosity" aria-selected="${S.tab === 'curiosity'}">Curiosities</button><button role="tab" data-tab="wondering" aria-selected="${S.tab === 'wondering'}">Wonderings</button></div>
    ${update}${card}
    <div class="list-tools">${S.sort !== 'newest' ? `<span class="muted small">${sortLabel}</span>` : ''}${S.cat ? `<span class="chip on">${h(catName.get(S.cat) ?? '')}<button class="chip-x" data-clearcat aria-label="Clear category">${ICON.x}</button></span>` : ''}<span class="push"></span>${items.length && !S.selecting ? '<button class="link muted" data-select>Select</button>' : ''}<button class="icon-btn${S.cat || S.sort !== 'newest' ? ' active' : ''}" data-sort aria-label="Sort and filter" title="Sort and filter">${ICON.filter}</button></div>
    <div class="list${rise ? ' rise' : ''}">${body}</div>
    ${S.selecting ? selectBar(S.picked.size, S.picked.size === items.length, [['selarchive', 'archive', 'Archive'], ['seldel', 'trash', 'Delete']]) : ''}`;
  if (!S.selecting) {
    longPress(view, (id) => thoughtMenu(id, view.querySelector<HTMLElement>(`[data-open="${id}"]`)));
    view.oncontextmenu = (e) => { const row = (e.target as HTMLElement).closest<HTMLElement>('[data-open]'); if (!row) return; e.preventDefault(); thoughtMenu(row.dataset.open!, row); };
  } else view.oncontextmenu = null;
  if (!wide() && !S.selecting) swipeRows(view);

  view.onclick = async (e) => {
    const t = e.target as HTMLElement;
    if (pressed) { pressed = false; return; } // the click right after a long-press
    if (swipedNow) { swipedNow = false; return; }
    if (S.swiped && !t.closest('[data-qarch],[data-qdel]')) { S.swiped = ''; return void render(); } // a tap closes an open swipe
    const qa = t.closest<HTMLElement>('[data-qarch]');
    if (qa) { const id = qa.dataset.qarch!; S.swiped = ''; await archive([id]); if (S.id === id) S.id = ''; void render(); return toast('Archived', async () => { await unarchive([id]); void render(); }); }
    const qd = t.closest<HTMLElement>('[data-qdel]');
    if (qd) { const id = qd.dataset.qdel!; S.swiped = ''; await softDelete([id]); if (S.id === id) S.id = ''; void render(); return toast('Thought deleted', async () => { await restore([id]); void render(); }); }
    if (t.closest('[data-select]')) { S.selecting = true; S.picked.clear(); return void render(); }
    if (t.closest('[data-seldel]')) {
      const ids = [...S.picked]; await softDelete(ids); if (ids.includes(S.id)) S.id = ''; S.selecting = false; S.picked.clear(); void render();
      return toast(`Deleted ${ids.length} thought${ids.length > 1 ? 's' : ''}`, async () => { await restore(ids); void render(); });
    }
    const row = t.closest<HTMLElement>('[data-open]');
    if (row) {
      if (S.selecting) { const id = row.dataset.open!; S.picked.has(id) ? S.picked.delete(id) : S.picked.add(id); return void render(); }
      return go('detail', row.dataset.open);
    }
    const ht = t.closest<HTMLElement>('[data-tab]');
    if (ht) return setTab(ht.dataset.tab as ThoughtType);
    if (t.closest('[data-search]')) return go('search');
    if (t.closest('[data-menu]')) return go('settings');
    if (t.closest('[data-sort]')) return openSort(cats);
    if (t.closest('[data-clearcat]')) { S.cat = ''; return renderList(view); }
    const nb = t.closest<HTMLElement>('[data-notice]');
    if (nb?.dataset.notice === 'update') return applyUpdate();
    if (nb?.dataset.notice === 'usage') { await updateSettings({ usageAsked: true, shareUsage: true }); void sendUsage(true); toast('Thank you. Turn it off any time in Settings › Sync and sign-in.'); return void render(); }
    if (nb?.dataset.notice === 'backup') { await downloadBackup(); toast('Backup saved to your downloads'); return void render(); }
    if (nb?.dataset.notice === 'a2hs') return void openSheet(`<div class="sheet-head"><h2 class="serif">Add to Home Screen</h2></div>${homeScreenSteps()}`);
    const hb = t.closest<HTMLElement>('[data-hide]');
    if (hb) { await hideNotice(hb.dataset.hide as 'usage' | 'a2hs' | 'backup'); return void render(); }
    const scb = t.closest<HTMLElement>('[data-sc]');
    if (scb) {
      const id = scb.dataset.id!, act = scb.dataset.sc;
      if (act === 'open') { track('still.open'); await dismissStillCurious(); return go('detail', id); }
      if (act === 'later') { await dismissStillCurious(14, id); return void render(); }
      await dismissStillCurious(); await archive([id]); void render();
      return toast('Archived', async () => { await unarchive([id]); void render(); });
    }
    if (t.closest('[data-selcancel]')) { S.selecting = false; S.picked.clear(); return void render(); }
    if (t.closest('[data-selall]')) { if (S.picked.size === items.length) S.picked.clear(); else items.forEach((i) => S.picked.add(i.id)); return void render(); }
    if (t.closest('[data-selarchive]')) {
      const ids = [...S.picked]; await archive(ids); if (ids.includes(S.id)) S.id = ''; S.selecting = false; S.picked.clear(); void render();
      return toast(`Archived ${ids.length} thought${ids.length > 1 ? 's' : ''}`, async () => { await unarchive(ids); void render(); });
    }
  };
}
const newest = (a: Thought, b: Thought) => b.createdAt.localeCompare(a.createdAt);

/** Like Nudge!'s select bar: a dark strip over the bottom bar, the count, then icon-only actions. */
function selectBar(n: number, allPicked: boolean, acts: [string, keyof typeof ICON, string][]): string {
  const b = (data: string, icon: keyof typeof ICON, label: string, off = false) => `<button type="button" data-${data} aria-label="${label}" title="${label}" ${off ? 'disabled' : ''}>${ICON[icon]}</button>`;
  return `<div class="selectbar" role="toolbar" aria-label="Selected thoughts"><div class="in"><span class="n">${n} selected</span>${b('selall', 'all', allPicked ? 'Clear selection' : 'Select all')}${acts.map(([d, i, l]) => b(d, i, l, !n)).join('')}${b('selcancel', 'x', 'Done selecting')}</div></div>`;
}

/** Phone: swipe a row left to show Archive and Delete; swipe right or tap to close. */
let swipedNow = false;
function swipeRows(root: HTMLElement): void {
  let row: HTMLElement | null = null, body: HTMLElement | null = null, x0 = 0, y0 = 0, dx = 0, drag = false;
  root.ontouchstart = (e) => {
    row = (e.target as HTMLElement).closest<HTMLElement>('[data-open]');
    if (!row || (e.target as HTMLElement).closest('button')) { row = null; return; }
    body = row.querySelector<HTMLElement>('.row-body'); x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; drag = false;
  };
  root.ontouchmove = (e) => {
    if (!row || !body) return;
    dx = e.touches[0].clientX - x0; const dy = e.touches[0].clientY - y0;
    if (!drag) { if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { row = null; return; } if (Math.abs(dx) > 10) drag = true; }
    if (drag) body.style.transform = `translateX(${Math.max(-150, Math.min(0, dx))}px)`;
  };
  root.ontouchend = () => {
    if (!row || !body) return;
    const id = row.dataset.open!;
    if (drag) {
      swipedNow = true; setTimeout(() => { swipedNow = false; }, 350);
      body.style.transition = 'transform .18s ease'; body.style.transform = '';
      if (dx < -60) S.swiped = id; else if (dx > 40 && S.swiped === id) S.swiped = '';
      void render();
    }
    row = null;
  };
}

/** Long-press (or right-click) a thought: move it to the other list, select, archive or delete. */
function thoughtMenu(id: string, row?: HTMLElement | null): void {
  track('hold');
  S.swiped = '';
  row?.classList.add('held');
  const text = row?.querySelector('.row-text')?.textContent?.trim() ?? '';
  const other = S.tab === 'curiosity' ? 'wondering' : 'curiosity';
  const otherName = other === 'curiosity' ? 'Curiosities' : 'Wonderings';
  const sheet = openSheet(`
    ${text ? `<div class="menu-for">${h(text)}</div>` : ''}
    <div class="menu">
      <button class="menu-item" data-act="move">Move to ${otherName}</button>
      <button class="menu-item" data-act="select">Select</button>
      <button class="menu-item" data-act="archive">Archive</button>
      <button class="menu-item danger" data-act="delete">Delete</button>
    </div>`, () => row?.classList.remove('held'));
  sheet.el.addEventListener('click', async (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (!act) return;
    sheet.close();
    if (act === 'move') {
      track('move');
      await updateThought(id, { type: other });
      if (S.id === id) S.id = '';
      void render();
      return toast(`Moved to ${otherName}`, async () => { await updateThought(id, { type: S.tab }); void render(); });
    }
    if (act === 'select') { track('select'); S.selecting = true; S.picked = new Set([id]); return void render(); }
    if (act === 'archive') { track('archive'); await archive([id]); if (S.id === id) S.id = ''; void render(); return toast('Archived', async () => { await unarchive([id]); void render(); }); }
    await softDelete([id]); if (S.id === id) S.id = ''; void render();
    toast('Thought deleted', async () => { await restore([id]); void render(); });
  });
}

/** Hold a row for half a second to open its menu. The click right after is swallowed. */
let pressed = false;
function longPress(root: HTMLElement, fire: (id: string) => void): void {
  let timer = 0, x = 0, y = 0;
  root.onpointerdown = (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-open]');
    if (!row || (e.target as HTMLElement).closest('button')) return;
    x = e.clientX; y = e.clientY;
    timer = window.setTimeout(() => { pressed = true; navigator.vibrate?.(10); fire(row.dataset.open!); }, 500);
  };
  root.onpointermove = (e) => { if (timer && Math.hypot(e.clientX - x, e.clientY - y) > 8) { clearTimeout(timer); timer = 0; } };
  root.onpointerup = root.onpointercancel = () => { clearTimeout(timer); timer = 0; };
}

function openSort(cats: Category[]): void {
  const opt = (v: Sort, l: string) => `<button class="menu-item" data-v="${v}" aria-pressed="${S.sort === v}">${l}${S.sort === v ? '<span class="g">✓</span>' : ''}</button>`;
  const sheet = openSheet(`
    <div class="sheet-head"><h2 class="serif">Sort and filter</h2></div>
    <div class="menu">${opt('newest', 'Newest')}${opt('oldest', 'Oldest')}${opt('category', 'By category')}${opt('revisited', 'Most revisited')}</div>
    <div class="label" style="margin:16px 0 8px">Show only</div>
    <div class="chips">${cats.map((c) => `<button class="chip" data-cat="${c.id}" aria-pressed="${S.cat === c.id}">${h(c.name)}</button>`).join('')}</div>
    `);
  sheet.el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const v = t.closest<HTMLElement>('[data-v]');
    if (v) { S.sort = v.dataset.v as Sort; sheet.close(); return void render(); }
    const c = t.closest<HTMLElement>('[data-cat]');
    if (c) { S.cat = S.cat === c.dataset.cat ? '' : c.dataset.cat!; sheet.close(); return void render(); }
  });
}

// ── Search ──
async function renderSearch(view: HTMLElement): Promise<void> {
  seen('view.search');
  view.innerHTML = `
    <div class="search-top"><span class="muted">${ICON.search}</span><input class="search-in" id="q" placeholder="Search your thoughts" value="${h(S.q)}" aria-label="Search" autocomplete="off" enterkeyhint="search"><button class="link" data-cancel>Cancel</button></div>
    <div id="results"></div>`;
  const q = view.querySelector<HTMLInputElement>('#q')!;
  const draw = async () => {
    S.q = q.value;
    const r = await search(S.q);
    const mark = (s: string) => { const i = s.toLowerCase().indexOf(S.q.trim().toLowerCase()); return i < 0 || !S.q.trim() ? h(s) : `${h(s.slice(0, i))}<mark>${h(s.slice(i, i + S.q.trim().length))}</mark>${h(s.slice(i + S.q.trim().length))}`; };
    const grp = (title: string, l: Thought[]) => l.length ? `<p class="group-h">${title}</p>${l.map((t) => `<button class="row${wide() && S.id === t.id ? ' on' : ''}" data-open="${t.id}"><span class="row-body"><span class="row-text">${mark(t.text)}</span></span></button>`).join('')}` : '';
    const n = r.curiosity.length + r.wondering.length + r.archived.length;
    view.querySelector('#results')!.innerHTML = !S.q.trim() ? '<p class="empty">Search ideas, questions, notes and steps.</p>'
      : n ? grp('Curiosities', r.curiosity) + grp('Wonderings', r.wondering) + grp('Archived', r.archived) : `<p class="empty">Nothing matches “${h(S.q.trim())}”.</p>`;
  };
  q.addEventListener('input', () => void draw());
  view.onclick = (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-cancel]')) { S.q = ''; return back(); }
    const row = t.closest<HTMLElement>('[data-open]');
    if (row) go('detail', row.dataset.open);
  };
  await draw();
  q.focus();
}

// ── Archives ──
async function renderArchives(view: HTMLElement): Promise<void> {
  seen('view.archives');
  const items = (await listThoughts({ type: S.archTab, archived: true })).sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? ''));
  view.innerHTML = `
    <div class="sub-top"><button class="back" data-back>${ICON.back}<span>Archives</span></button></div>
    <div class="tabs" role="tablist" aria-label="Archive type">
      <button role="tab" data-arch="curiosity" aria-selected="${S.archTab === 'curiosity'}">Curiosities</button>
      <button role="tab" data-arch="wondering" aria-selected="${S.archTab === 'wondering'}">Wonderings</button>
    </div>
    <div class="list-tools"><span class="hint" style="margin:0">${items.length && !S.selecting ? 'Tap a thought for Restore or Delete.' : ''}</span>${items.length && !S.selecting ? '<button class="link muted push" data-select>Select</button>' : ''}</div>
    <div class="list">${items.length ? items.map((t) => `<div class="row arch${S.reveal === t.id ? ' revealed' : ''}" data-reveal="${t.id}" role="button" tabindex="0" ${S.selecting ? `aria-pressed="${S.picked.has(t.id)}"` : ''}>${S.selecting ? `<span class="check${S.picked.has(t.id) ? ' on' : ''}" aria-hidden="true">${S.picked.has(t.id) ? '✓' : ''}</span>` : ''}<span class="row-body"><span class="row-text">${h(t.text)}</span></span>${S.reveal === t.id ? `<span class="row-acts"><button class="link" data-restore="${t.id}">Restore</button><button class="link muted" data-del="${t.id}">Delete</button><button class="link muted" data-openarch="${t.id}">Open</button></span>` : ''}</div>`).join('') : '<p class="empty">Nothing archived here.</p>'}</div>
    ${items.length > 1 && !S.selecting ? `<button class="link muted" style="margin-top:20px" data-delall>Delete all archived ${plural(S.archTab).toLowerCase()}</button>` : ''}
    ${S.selecting ? selectBar(S.picked.size, S.picked.size === items.length, [['selrestore', 'restore', 'Restore'], ['seldel', 'trash', 'Delete']]) : ''}`;
  view.onclick = async (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-back]')) return back();
    const at = t.closest<HTMLElement>('[data-arch]');
    if (at) { S.archTab = at.dataset.arch as ThoughtType; S.reveal = ''; return renderArchives(view); }
    const rs = t.closest<HTMLElement>('[data-restore]');
    if (rs) { const id = rs.dataset.restore!; await unarchive([id]); S.reveal = ''; void renderArchives(view); return toast(`Back in ${plural(S.archTab)}`, async () => { await archive([id]); void render(); }); }
    const dl = t.closest<HTMLElement>('[data-del]');
    if (dl) { const id = dl.dataset.del!; await softDelete([id]); S.reveal = ''; void renderArchives(view); return toast('Thought deleted', async () => { await restore([id]); void render(); }); }
    const op = t.closest<HTMLElement>('[data-openarch]');
    if (op) return go('detail', op.dataset.openarch);
    if (t.closest('[data-delall]')) return confirmDeleteAll(items.map((i) => i.id));
    if (t.closest('[data-select]')) { S.selecting = true; S.picked.clear(); S.reveal = ''; return void render(); }
    if (t.closest('[data-selcancel]')) { S.selecting = false; S.picked.clear(); return void render(); }
    if (t.closest('[data-selall]')) { if (S.picked.size === items.length) S.picked.clear(); else items.forEach((i) => S.picked.add(i.id)); return void render(); }
    if (t.closest('[data-selrestore]')) {
      const ids = [...S.picked]; await unarchive(ids); S.selecting = false; S.picked.clear(); void render();
      return toast(`Restored ${ids.length}`, async () => { await archive(ids); void render(); });
    }
    if (t.closest('[data-seldel]')) {
      const ids = [...S.picked]; await softDelete(ids); S.selecting = false; S.picked.clear(); void render();
      return toast(`Deleted ${ids.length}`, async () => { await restore(ids); void render(); });
    }
    const rv = t.closest<HTMLElement>('[data-reveal]');
    if (rv && S.selecting) { const id = rv.dataset.reveal!; S.picked.has(id) ? S.picked.delete(id) : S.picked.add(id); return void render(); }
    if (rv) { S.reveal = S.reveal === rv.dataset.reveal ? '' : rv.dataset.reveal!; return renderArchives(view); }
  };
}

function confirmDeleteAll(ids: string[]): void {
  const sheet = openSheet(`
    <div class="sheet-head"><h2 class="serif">Delete ${ids.length} archived ${plural(S.archTab).toLowerCase()}?</h2></div>
    <p class="muted" style="margin:0 0 18px">They stay in Recently deleted for 30 days.</p>
    <div class="two"><button class="btn-secondary" data-no>Cancel</button><button class="btn danger" data-yes>Delete ${ids.length}</button></div>`);
  sheet.el.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-no]')) return sheet.close();
    if (t.closest('[data-yes]')) {
      await softDelete(ids); sheet.close(); void render();
      toast(`Deleted ${ids.length}`, async () => { await restore(ids); void render(); });
    }
  });
}

/** Swipe right anywhere on a sub-screen to go back; the page follows the finger. */
function enableSwipeBack(): void {
  let x0 = 0, y0 = 0, on = false, drag = false;
  const view = () => document.getElementById('view')!;
  document.addEventListener('touchstart', (e) => {
    if (S.view === 'list' || document.querySelector('.sheet-back') || e.touches.length > 1) return;
    const tt = e.target as HTMLElement;
    if (tt.closest('input,textarea,[data-grip]')) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; on = true; drag = false;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!on) return;
    const dx = e.touches[0].clientX - x0, dy = e.touches[0].clientY - y0;
    if (!drag) { if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { on = false; return; } if (dx > 12 && dx > Math.abs(dy)) drag = true; }
    if (drag) view().style.transform = `translateX(${Math.max(0, dx) * 0.6}px)`;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!on) return;
    on = false;
    const dx = e.changedTouches[0].clientX - x0;
    const v = view();
    v.style.transition = 'transform .2s ease'; v.style.transform = '';
    setTimeout(() => { v.style.transition = ''; }, 220);
    if (drag && dx > 90) back();
  });
}
