// Settings, laid out like Nudge!'s (Bible › Onboarding, Settings, About): a menu of grouped rows, each opening its own page.
import { buildReport, reportText, seen, sendUsage, usageDays, usageState } from '../lib/usage';
import type { Days } from '../lib/usageReport';
import { db, getSettings, updateSettings } from '../db/db';
import { downloadBackup, previewBackup, restoreBackup, RESTORE_REASONS } from '../db/backup';
import type { Category, FontChoice, Mode, Settings, Thought } from '../db/types';
import { applyLook, contrast, customPalette } from '../lib/look';
import { nowISO, today, uid } from '../lib/util';
import { restore } from '../logic/thoughts';
import { call, cloud, createPasskey, friendlyError, passkeysWork, sendFeedback, signInWithPasskey, signOut, syncNow } from '../lib/cloud';
import { h, ICON, openSheet, toast } from './kit';
import { replayIntro } from './onboarding';
import { homeScreenSteps } from '../logic/notices';

export const VERSION = '1.2.1';
const SIZES = [0.9, 1, 1.12, 1.25];
type Page = 'main' | 'you' | 'thoughts' | 'still' | 'nudge' | 'ai' | 'tips' | 'preview' | 'usage' | 'look' | 'sync' | 'data' | 'deleted' | 'about' | 'news';
const TITLES: Record<Page, string> = { main: 'Settings', you: 'You', thoughts: 'Thoughts', still: 'Still curious?', nudge: 'Nudge!', ai: 'AI helpers', tips: 'How Noggin? works', preview: 'Preview tools', usage: 'Usage report', look: 'Theme, font and colours', sync: 'Sync and sign-in', data: 'Back up, import, reset', deleted: 'Recently deleted', about: 'About Noggin?', news: 'What’s new' };
let page: Page = 'main';

type Nav = { back: () => void; go: (v: 'archives' | 'analytics') => void; wide: boolean; refresh: () => void };

// ── Row helpers (Nudge!'s settings rows: title, small subtitle, value on the right, chevron) ──
const row = (go: string, title: string, sub = '', val = '') => `<button class="srow" data-page="${go}"><span class="sbody"><span class="stitle">${title}</span>${sub ? `<span class="ssub">${sub}</span>` : ''}</span>${val ? `<span class="sval">${val}</span>` : ''}<span class="chev">${ICON.chev}</span></button>`;
const act = (key: string, title: string, sub = '', danger = false) => `<button class="srow" data-act="${key}"><span class="sbody"><span class="stitle${danger ? ' danger-t' : ''}">${title}</span>${sub ? `<span class="ssub">${sub}</span>` : ''}</span></button>`;
const tog = (key: string, title: string, on: boolean, sub = '', off = false) => `<label class="srow${off ? ' off' : ''}"><span class="sbody"><span class="stitle">${title}</span>${sub ? `<span class="ssub">${sub}</span>` : ''}</span><input type="checkbox" role="switch" class="sw" data-sw="${key}" ${on ? 'checked' : ''} ${off ? 'disabled' : ''}></label>`;
const grp = (label: string, rows: string[]) => `${label ? `<p class="set-h">${label}</p>` : ''}<div class="set-group">${rows.join('')}</div>`;
const seg = (key: string, cur: string, opts: [string, string][]) => `<div class="seg big" role="group">${opts.map(([v, l]) => `<button type="button" data-${key}="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export async function renderSettings(view: HTMLElement, nav: Nav, to?: Page): Promise<void> {
  if (to) page = to;
  const s = await getSettings();
  const meta = await db.meta.get('meta');
  const c = cloud.get();
  let body = '';
  if (page === 'main') seen('view.settings');
  if (page === 'tips') seen('view.tips');

  if (page === 'main') {
    const fontName = { serif: 'Serif', sans: 'Sans', easy: 'Easy read' }[s.font] ?? 'Serif';
    body = `
      ${grp('', [row('you', 'You', '', h(s.name || 'Friend')), row('thoughts', 'Thoughts', 'Categories, catching'), row('still', 'Still curious?', '', s.stillCurious ? 'On' : 'Off'), row('nudge', 'Nudge!', 'Sending steps', s.sendToNudge ? 'On' : 'Off')])}
      ${grp('', [row('ai', 'AI helpers', 'A first step, a short answer', s.aiSteps || s.aiAnswers ? 'On' : 'Off'), row('tips', 'How Noggin? works', 'Tips for using the app')])}
      ${nav.wide ? '' : grp('Your thoughts', [`<button class="srow" data-goto="archives"><span class="sbody"><span class="stitle">Archives</span></span><span class="chev">${ICON.chev}</span></button>`, `<button class="srow" data-goto="analytics"><span class="sbody"><span class="stitle">Analytics</span><span class="ssub">Your thought patterns</span></span><span class="chev">${ICON.chev}</span></button>`])}
      ${grp('Look and feel', [row('look', 'Theme, font and colours', '', s.custom ? `Custom · ${fontName}` : `Noggin? · ${fontName}`), `<div class="srow col"><span class="stitle">Mode</span>${seg('setmode', s.custom ? '' : s.mode, [['light', 'Light'], ['dark', 'Dark'], ['system', 'Auto']])}</div>`])}
      ${grp('Account', [row('sync', 'Sync and sign-in', 'Use Noggin? on all your devices', c.signedIn ? 'On' : 'Off')])}
      ${grp('Your data', [row('data', 'Back up, import, reset', '', meta?.lastBackupAt ? `Backed up ${day(meta.lastBackupAt)}` : 'Never backed up')])}
      ${grp('About', [row('about', 'About Noggin?', '', VERSION), row('news', 'What’s new', '', VERSION), act('feedback', 'Send feedback')])}
      ${grp('Beta', [row('preview', 'Preview tools', 'Labs, setup and testing', s.labsSay ? 'Labs on' : '')])}
      <div class="brand-foot"><div class="wordmark">Noggin<span class="q">?</span></div><p>Stay curious.</p><p>Version ${VERSION}</p><p>© 2026 Innova Space. All rights reserved.</p></div>`;
  }

  if (page === 'you') body = `${grp('', [`<div class="srow col"><label class="stitle" for="sName">Your name</label><input class="field" id="sName" maxlength="32" value="${h(s.name)}" placeholder="Friend" autocomplete="given-name"></div>`])}<p class="hint">Only used for your greeting. Blank = Friend.</p>`;

  if (page === 'thoughts') {
    const cats = await db.categories.orderBy('order').toArray();
    body = `${grp('Categories', [...cats.map((k) => `<div class="srow cat-row"><input class="field plain" data-ren="${k.id}" value="${h(k.name)}" maxlength="24" aria-label="Category name">${k.builtIn ? '<span class="sval">Built in</span>' : `<button class="icon-btn sm" data-delcat="${k.id}" aria-label="Delete ${h(k.name)}">${ICON.trash}</button>`}</div>`),
      `<form class="srow" id="newCat"><input class="field plain" id="nc" placeholder="New category" maxlength="24" aria-label="New category"><button class="icon-btn sm" aria-label="Add category">${ICON.plus}</button></form>`])}
      <p class="hint">Built-in categories can be renamed, not deleted. Deleting one you added moves its thoughts to No category, with Undo.</p>
      ${grp('Catching', [tog('keepAdding', 'Keep adding', s.keepAdding, 'The sheet stays open after Save')])}`;
  }

  if (page === 'still') body = `${grp('', [tog('stillCurious', 'Show one old thought a day', s.stillCurious, 'A thought 7+ days old you haven’t opened in a week'), tog('weeklyNudge', 'Weekly notification', false, 'Coming soon', true)])}<p class="hint">Not now hides a thought for 14 days. None on a day you’ve already caught 3 or more.</p>`;

  if (page === 'nudge') body = `${grp('', [tog('sendToNudge', 'Send steps to Nudge!', s.sendToNudge, 'Shows the Send button on a thought’s steps')])}
    <p class="hint">Signed in, sent steps become Nudge! tasks marked “from Noggin?”, and their status comes back here. Signed out, they’re copied into Nudge!’s Batch add.</p>
    ${grp('', [`<a class="srow" href="https://nudge.innovaspace.app" target="_blank" rel="noopener"><span class="sbody"><span class="stitle">Open Nudge!</span><span class="ssub">nudge.innovaspace.app</span></span><span class="chev">${ICON.chev}</span></a>`])}`;

  if (page === 'ai') body = `${grp('', [tog('aiSteps', 'Suggest a first step', !!s.aiSteps, 'On Curiosities without steps'), tog('aiAnswers', 'Short answers', !!s.aiAnswers, 'On Wonderings, when you open one')])}
    <p class="hint">Only the thought you’re looking at is sent, with its category (and its steps when you ask for a next one). Never your notes, other thoughts or your name. Nothing is used to train AI.</p>
    <p class="hint">Answers stay with the thought, so each is asked once. Personal questions get things to weigh, never a verdict. A short take can be wrong, so check what matters.</p>
    ${c.signedIn ? '' : `<p class="hint">Needs you signed in. <button class="link" data-page="sync">Sign in</button></p>`}`;

  if (page === 'tips') {
    const tip = (t: string, p: string) => `<div class="srow"><span class="sbody"><span class="stitle">${t}</span><span class="ssub wrap">${p}</span></span></div>`;
    body = `${grp('', [
      `<button class="srow" data-act="a2hs"><span class="sbody"><span class="stitle">Add to Home Screen</span><span class="ssub wrap">Open Noggin? like an app: full screen, faster, and your thoughts stay safe.</span></span><span class="chev">${ICON.chev}</span></button>`,
      tip('Curiosity or Wondering?', 'A Curiosity is something you might do. A Wondering is something you want to find out.'),
      tip('Catch fast', 'Tap +. One is one thought, even with paragraphs. Several is one thought per line.'),
      tip('Hold a thought', 'Move it to the other list, select a few, archive or delete. Right-click on a computer.'),
      tip('Swipe left', 'On a phone, swipe a thought left to archive or delete it.'),
      tip('Steps go to Nudge!', 'Add steps to a Curiosity and send them. You’ll see when each one is done.'),
      tip('Still curious?', 'Now and then an older thought comes back, in case it still matters.'),
      tip('AI helpers', 'Optional. A first step for Curiosities, a short answer for Wonderings.'),
      tip('Back up', 'Settings › Back up, import, reset saves everything to a file. Sign in to sync your devices.'),
    ])}
    <button class="link center-link" data-act="replay">See the welcome again</button>`;
  }

  if (page === 'preview') body = `${grp('Labs', [tog('labsSay', 'Say it <span class="vc-beta">Beta</span>', !!s.labsSay, 'A mic when you catch a thought')])}
    <p class="hint">Up to 2 minutes, any language, even mixed. Noggin? writes it down and sorts each thought; you check them before anything is saved. In Several, typed lines get checked the same way. Needs you signed in.</p>
    ${c.signedIn ? '' : `<p class="hint">You’re signed out. <button class="link" data-page="sync">Sign in</button></p>`}
    ${grp('Setup', [act('replaysetup', 'Replay the welcome and setup', 'Your thoughts and settings stay')])}
    ${grp('Testing', [row('usage', 'Usage report', 'Which features get used · counts only')])}
    <p class="hint">These are here for the beta and go away after it.</p>`;

  if (page === 'usage') {
    let days = usageDays(), who = 'Me', extra = '', testers = '', allMsg = '';
    if (uWho === 'all') {
      try {
        const r = await call<{ owner: boolean; userId?: string; days?: Days; testers?: number; active?: number; states?: Record<string, unknown>[] }>('/usage/all', { span: uSpan });
        if (!r.owner) { allMsg = `<section class="card u-card"><b>Only the owner sees All testers</b><p class="hint" style="margin:0">This account’s ID: <b data-uid>${h(r.userId ?? '')}</b>. Send it to Claude to unlock All testers here.</p><button type="button" class="vc-sbtn" data-act="u:id">Copy the ID</button></section>`; days = {}; }
        else { days = r.days ?? {}; who = `All testers (${r.active ?? 0} active)`; testers = String(r.testers ?? 0); const st = r.states ?? []; const on = (k: string) => st.filter((x) => x[k] === true).length; extra = `Turned on, of ${st.length} sharing: Say it ${on('labsSay')}, AI first step ${on('aiSteps')}, AI short answers ${on('aiAnswers')}, send to Nudge! ${on('sendToNudge')}`; }
      } catch (err) { allMsg = `<p class="hint">${h(friendlyError(err))} Your own report still works.</p>`; days = {}; }
    }
    const r = buildReport(days, uSpan, today());
    const state = uWho === 'me' ? await usageState() : undefined;
    lastReport = reportText(r, who, state) + (extra ? `\n\n${extra}` : '');
    const pct = (a: number, t: number) => (t ? Math.round((a / t) * 100) : 0);
    const split = (rows: [string, number, string][]) => { const t = rows.reduce((n, x) => n + x[1], 0); return `<div class="card u-vs"><div class="u-split">${rows.map(([, v, col]) => `<i style="width:${pct(v, t)}%;background:${col}"></i>`).join('')}</div>${rows.map(([l, v, col]) => `<div class="u-row"><span><span class="dot" style="background:${col}"></span>${l}</span><b>${pct(v, t)}% · ${v}</b></div>`).join('')}${t ? '' : '<p class="hint" style="margin:0">Nothing yet in these days.</p>'}</div>`; };
    const since = Object.keys(usageDays()).sort()[0];
    const grpF = (g: 'essential' | 'sometimes' | 'barely') => r.features.filter((f) => f.group === g).map((f) => g === 'barely'
      ? `<div class="u-r"><span class="sbody"><span class="stitle">${h(f.label)}</span><span class="ssub">${f.last ? `Last used ${day(`${f.last}T12:00:00`)}` : `Not in ${uSpan} days`}</span></span><span class="u-pill">${f.days ? `${f.days} day${f.days === 1 ? '' : 's'}` : '0'}</span></div>`
      : `<div class="u-r"><span class="sbody"><span class="stitle">${h(f.label)}</span><span class="ssub">${f.days} of ${r.activeDays} days · ${f.uses} use${f.uses === 1 ? '' : 's'}</span></span><span class="u-bar"><i style="width:${pct(f.days, Math.max(1, r.activeDays))}%"></i></span><b class="u-n">${f.days}</b></div>`).join('');
    const sect = (t: string, g: 'essential' | 'sometimes' | 'barely') => { const x = grpF(g); return x ? `<p class="set-h">${t}</p><div class="set-group">${x}</div>` : ''; };
    body = `<div class="seg u-seg" role="group" aria-label="Whose usage"><button type="button" data-u="me" aria-pressed="${uWho === 'me'}">Me</button><button type="button" data-u="all" aria-pressed="${uWho === 'all'}">All testers${testers ? ` · ${testers}` : ''}</button></div>
      <div class="seg u-seg" role="group" aria-label="Days">${[7, 14, 30].map((d) => `<button type="button" data-us="${d}" aria-pressed="${uSpan === d}">${d} days</button>`).join('')}</div>
      <p class="hint">Counts only: which features were used and how often. No thought text is kept.${uWho === 'me' && since ? ` Counting on this device since ${day(`${since}T12:00:00`)}.` : ''}</p>
      ${allMsg}
      <p class="set-h">How thoughts get caught</p>${split([['Typed, one', r.add.one, 'var(--accent)'], ['Typed, several', r.add.several, 'var(--accent-text)'], ['Say it', r.add.say, 'var(--ink)'], ['Typed, checked by AI', r.add.checked, 'var(--muted)']])}
      ${r.sayAvgSecs !== null ? `<p class="hint">Say it: about ${r.sayAvgSecs} seconds per recording.</p>` : ''}
      <p class="set-h">What happens next</p><div class="card u-vs"><div class="u-row"><span>Steps added</span><b>${r.next.steps}</b></div><div class="u-row"><span>Steps sent to Nudge!</span><b>${r.next.nudge}</b></div><div class="u-row"><span>What I found, edited</span><b>${r.next.found}</b></div></div>
      ${sect('Essentials · most days', 'essential')}${sect('Sometimes', 'sometimes')}${sect('Barely or never', 'barely')}
      ${extra ? `<p class="hint">${h(extra)}</p>` : ''}
      <button type="button" class="btn" data-act="u:copy" style="margin-top:16px">Copy for Claude</button>
      <button type="button" class="vc-sbtn u-mail" data-act="u:mail">Email to Innova Space</button>
      <p class="hint">All testers also arrives by email every Sunday morning.${s.shareUsage ? '' : ' Your own counts are only shared when Share which features I use is on (Sync and sign-in).'}</p>`;
  }

  if (page === 'look') {
    const pal = s.custom ? customPalette(s.custom.accent, s.custom.paper) : null;
    const warn = s.custom && pal ? [contrast(pal['--ink'], s.custom.paper) < 4.5 ? 'text may be hard to read' : '', contrast(s.custom.accent, s.custom.paper) < 1.6 ? 'the accent is close to the background' : ''].filter(Boolean) : [];
    const sizeIdx = Math.max(0, SIZES.indexOf(s.textScale)) || 1;
    body = `${grp('Colours', [tog('custom', 'Custom colours', !!s.custom, s.custom ? 'Your accent and background' : 'Noggin?: Supernova dark, cream light'),
      ...(s.custom ? [`<div class="srow"><span class="sbody"><span class="stitle">Accent</span></span><input type="color" data-color="accent" value="${s.custom.accent}"></div>`, `<div class="srow"><span class="sbody"><span class="stitle">Background</span></span><input type="color" data-color="paper" value="${s.custom.paper}"></div>`] : [])])}
      ${s.custom ? `<p class="hint">${warn.length ? `Heads up: ${warn.join(', ')}. You can still keep it.` : 'These colours pass the contrast check.'}</p>` : ''}
      ${grp('Font', [`<div class="srow col">${seg('setfont', s.font, [['serif', 'Serif'], ['sans', 'Sans'], ['easy', 'Easy read']])}</div>`])}
      ${grp('Text size', [`<div class="srow col"><input type="range" id="sSize" min="0" max="3" step="1" value="${sizeIdx}" aria-label="Text size"><div class="range-l"><span>Small</span><span>Default</span><span>Large</span><span>Larger</span></div></div>`])}`;
  }

  if (page === 'sync') {
    const last = c.lastSync ? new Date(c.lastSync).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not yet';
    body = c.signedIn
      ? `${grp('', [`<div class="srow"><span class="sbody"><span class="stitle">Signed in</span><span class="ssub">Last synced ${last}</span></span></div>`, act('sync', 'Sync now'), act('pk-add', 'Add a passkey on this device', 'For a phone or laptop outside your iCloud Keychain'), act('out', 'Sign out', 'Your thoughts stay on this device', true)])}
        ${c.error ? `<p class="hint" role="status">${h(c.error)}</p>` : ''}<p class="hint">Changes sync on their own while Noggin? is open, and when you come back to it.</p>
        ${grp('Beta', [tog('shareUsage', 'Share which features I use', !!s.shareUsage, 'Counts only, never your thoughts')])}<p class="hint">Helps decide what stays in the next version. Sent now and then while you’re signed in.</p>`
      : `<section class="card hero"><div class="serif hero-t">Your thoughts on every device</div>
          <p class="hint" style="margin:0">Sign in with a passkey: Face ID, Touch ID or your device’s lock. No password, no email. One passkey for every Innova Space app, Nudge! too.</p>
          ${passkeysWork() ? '<button type="button" class="btn" data-act="pk-new">Create a passkey</button><button type="button" class="btn-secondary" data-act="pk-in">I already have one · Sign in</button>' : '<p class="hint" style="margin:0">This browser can’t use passkeys. Try Safari or Chrome.</p>'}</section>
        <p class="hint">Optional. Noggin? works fully offline without it.</p>${c.error ? `<p class="hint" role="status">${h(c.error)}</p>` : ''}`;
  }

  if (page === 'data') {
    const deleted = (await db.thoughts.toArray()).filter((t) => t.deletedAt).length;
    body = `${grp('', [act('backup', 'Back up now', meta?.lastBackupAt ? `Last backup ${day(meta.lastBackupAt)}` : 'Saves a .json file to your downloads'), act('restore', 'Import a backup', 'Shows what’s inside before anything changes'), row('deleted', 'Recently deleted', 'Kept 30 days', deleted ? String(deleted) : '')])}
      ${grp('', [act('reset', 'Start over', 'Erase every thought on this device', true)])}
      <input id="sFile" type="file" accept="application/json,.json" hidden>`;
  }

  if (page === 'deleted') {
    const list = (await db.thoughts.toArray()).filter((t) => t.deletedAt).sort((a, b) => b.deletedAt!.localeCompare(a.deletedAt!));
    const left = (t: Thought) => Math.max(0, 30 - Math.floor((Date.now() - Date.parse(t.deletedAt!)) / 864e5));
    body = list.length ? `${grp('', list.map((t) => `<div class="srow"><span class="sbody"><span class="stitle clamp">${h(t.text)}</span><span class="ssub">${left(t)} day${left(t) === 1 ? '' : 's'} left</span></span><button class="link" data-res="${t.id}">Restore</button></div>`))}
      ${grp('', [act('purge', 'Delete all now', 'Gone for good', true)])}` : '<p class="empty">Nothing here. Deleted thoughts stay 30 days.</p>';
  }

  if (page === 'about') body = `<div class="brand-foot big"><div class="wordmark">Noggin<span class="q">?</span></div><p>Stay curious.</p></div>
    <p class="hint" style="text-align:center">A place for the thoughts you don’t want to lose: catch them fast, come back to them, and hand the ones that turn into steps to Nudge!.</p>
    ${grp('', [`<div class="srow"><span class="sbody"><span class="stitle">Version</span></span><span class="sval">${VERSION}</span></div>`, `<div class="srow"><span class="sbody"><span class="stitle">Made by</span></span><span class="sval">Innova Space</span></div>`, `<a class="srow" href="https://innovaspace.app" target="_blank" rel="noopener"><span class="sbody"><span class="stitle">innovaspace.app</span></span><span class="chev">${ICON.chev}</span></a>`])}
    <p class="hint" style="text-align:center">© 2026 Innova Space. All rights reserved.</p>`;

  if (page === 'news') body = `<section class="card news"><p class="serif" style="font-size:22px;margin:0 0 6px">1.2 · Nov 2026</p><ul>
    <li>Say it (Labs beta, in Settings › Preview tools): say a few thoughts in any language, even mixed, and check them before they’re saved</li>
    <li>A new welcome card, Just say it, and a small hand that shows where to tap</li><li>A new app icon that stays clear on dark Home Screens</li>
    <li>Swipe down to close any sheet; Noggin? moves to a new version on its own when you tap a tab or come back</li>
    <li>Usage report (beta, opt-in): counts only, never your thoughts</li></ul></section>
    <section class="card news"><p class="serif" style="font-size:22px;margin:0 0 6px">1.1 · Nov 2026</p><ul>
    <li>AI helpers (optional): a first step for a Curiosity, a short answer for a Wondering</li><li>Hold a thought to move it, select, archive or delete</li>
    <li>A short welcome on Curiosities and Wonderings, and How Noggin? works in Settings</li><li>Long steps wrap; categories no longer double up after syncing</li></ul></section>
    <section class="card news"><p class="serif" style="font-size:22px;margin:0 0 6px">1.0 · Nov 2026</p><ul>
    <li>Catch a thought: One or Several, Keep adding, paragraphs</li><li>Curiosities and Wonderings, details, steps, search, Archives</li>
    <li>Still curious?: one old thought a day</li><li>Analytics: your thought patterns</li><li>Settings, backups, Recently deleted, a Thoughts rising welcome</li>
    <li>Sign in with your Innova Space passkey and sync your devices</li><li>Desktop layout</li></ul>
    <p class="hint" style="margin:0">Also new: send a thought’s steps to Nudge!. They arrive marked “? Noggin”, and Done or Removed shows here.</p></section>`;

  view.innerHTML = `
    <header class="set-top">${page === 'main' && nav.wide ? '' : `<button class="icon-btn" data-back aria-label="Back">${ICON.back}</button>`}<h1 class="serif">${TITLES[page]}</h1></header>
    <div class="set-body">${body}</div>`;

  const redo = () => void renderSettings(view, nav);
  const apply = async (patch: Partial<Settings>) => { applyLook(await updateSettings(patch)); };

  const name = view.querySelector<HTMLInputElement>('#sName');
  name?.addEventListener('change', async () => { await updateSettings({ name: name.value.trim() }); toast('Name saved'); nav.refresh(); });
  const size = view.querySelector<HTMLInputElement>('#sSize');
  size?.addEventListener('input', () => void apply({ textScale: SIZES[+size.value] }));
  view.querySelectorAll<HTMLInputElement>('[data-color]').forEach((x) => x.addEventListener('change', async () => { await apply({ custom: { ...(await getSettings()).custom!, [x.dataset.color!]: x.value } }); redo(); }));
  view.querySelectorAll<HTMLInputElement>('[data-sw]').forEach((x) => x.addEventListener('change', async () => {
    const k = x.dataset.sw!;
    if (k === 'shareUsage') { await updateSettings({ shareUsage: x.checked, usageAsked: true }); if (x.checked) void sendUsage(true); return; }
    if (k === 'custom') { await apply({ custom: x.checked ? { accent: '#d8b46a', paper: getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#0b0a09' } : undefined }); return redo(); }
    await apply({ [k]: x.checked } as Partial<Settings>);
  }));
  view.querySelectorAll<HTMLInputElement>('[data-ren]').forEach((x) => x.addEventListener('change', async () => {
    const v = x.value.trim();
    if (!v) return redo();
    await db.categories.update(x.dataset.ren!, { name: v, updatedAt: nowISO() });
  }));
  view.querySelector('#newCat')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inp = view.querySelector<HTMLInputElement>('#nc')!; const v = inp.value.trim();
    if (!v) return inp.focus();
    const cats = await db.categories.orderBy('order').toArray();
    if (cats.some((k) => k.name.toLowerCase() === v.toLowerCase())) return toast('That category is already there');
    await db.categories.add({ id: uid(), name: v, order: (cats.at(-1)?.order ?? 0) + 1, builtIn: false, updatedAt: nowISO() });
    redo(); setTimeout(() => view.querySelector<HTMLInputElement>('#nc')?.focus(), 30);
  });
  const file = view.querySelector<HTMLInputElement>('#sFile');
  file?.addEventListener('change', async () => { const f = file.files?.[0]; file.value = ''; if (f) await confirmRestore(f, () => { nav.refresh(); redo(); }); });

  view.onclick = async (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-back]')) return nav.back();
    const ub = t.closest<HTMLElement>('[data-u], [data-us]');
    if (ub) { if (ub.dataset.u) uWho = ub.dataset.u as 'me' | 'all'; if (ub.dataset.us) uSpan = +ub.dataset.us; return redo(); }
    const pg = t.closest<HTMLElement>('[data-page]');
    if (pg) { page = pg.dataset.page as Page; history.pushState({ view: 'settings', sp: page }, ''); window.scrollTo(0, 0); return redo(); }
    const g = t.closest<HTMLElement>('[data-goto]');
    if (g) return nav.go(g.dataset.goto as 'archives' | 'analytics');
    const m = t.closest<HTMLElement>('[data-setmode]');
    if (m) { await apply({ mode: m.dataset.setmode as Mode, custom: undefined }); return redo(); }
    const f = t.closest<HTMLElement>('[data-setfont]');
    if (f) { await apply({ font: f.dataset.setfont as FontChoice }); return redo(); }
    const dc = t.closest<HTMLElement>('[data-delcat]');
    if (dc) return deleteCategory(dc.dataset.delcat!, redo);
    const rs = t.closest<HTMLElement>('[data-res]');
    if (rs) { await restore([rs.dataset.res!]); toast('Restored'); nav.refresh(); return redo(); }
    const a = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (!a) return;
    if (a === 'feedback') return openFeedback();
    if (a === 'replay') return replayIntro();
    if (a === 'u:copy') { try { await navigator.clipboard.writeText(lastReport); toast('Copied. Paste it to Claude.'); } catch { toast('Couldn’t copy here. Select the text in an email instead.'); } return; }
    if (a === 'u:mail') { try { const r = await call<{ ok: boolean }>('/usage/mail', { text: lastReport, who: uWho === 'all' ? 'all testers' : ((await getSettings()).name || 'one tester') }); toast(r.ok ? 'Sent to Innova Space.' : 'Couldn’t send just now. Copy for Claude still works.'); } catch (err) { toast(`${friendlyError(err)} Nothing was sent.`); } return; }
    if (a === 'u:id') { const id = view.querySelector('[data-uid]')?.textContent ?? ''; try { await navigator.clipboard.writeText(id); toast('ID copied'); } catch { toast(id); } return; }
    if (a === 'replaysetup') { await updateSettings({ onboarded: false }); return location.reload(); }
    if (a === 'a2hs') return void openSheet(`<div class="sheet-head"><h2 class="serif">Add to Home Screen</h2></div>${homeScreenSteps()}`);
    if (a === 'backup') { await downloadBackup(); toast('Backup saved to your downloads'); return redo(); }
    if (a === 'restore') return file?.click();
    if (a === 'reset') return confirmReset(() => { nav.refresh(); redo(); });
    if (a === 'purge') return confirmPurge(() => redo());
    if (['pk-new', 'pk-add', 'pk-in', 'sync', 'out'].includes(a)) {
      const btn = t.closest<HTMLButtonElement>('[data-act]')!; btn.disabled = true;
      try {
        if (a === 'pk-new' || a === 'pk-add') { await createPasskey(s.name); toast(a === 'pk-new' ? 'Signed in. Your thoughts will sync.' : 'Passkey added on this device'); }
        if (a === 'pk-in') { const nm = await signInWithPasskey(); if (nm && !s.name) await updateSettings({ name: nm }); toast('Signed in. Your thoughts will sync.'); }
        if (a === 'out') { await signOut(); toast('Signed out. Everything stays on this device.'); }
        if (a !== 'out') { await syncNow(); if (a === 'sync') toast(cloud.get().error ?? 'Synced'); }
      } catch (err) { toast(friendlyError(err), undefined, 5000); }
      nav.refresh(); return redo();
    }
  };
}

/** Each Settings page is its own history entry, so swipe back and the back button return one page at a time. */
let uWho: 'me' | 'all' = 'me', uSpan = 14, lastReport = '';
export function setSettingsPage(p?: string): void { page = (p as Page) || 'main'; }

async function deleteCategory(id: string, after: () => void): Promise<void> {
  const cat = (await db.categories.get(id)) as Category;
  const moved = await db.thoughts.where('categoryId').equals(id).toArray();
  await db.transaction('rw', db.categories, db.thoughts, async () => {
    await db.categories.delete(id);
    for (const t of moved) await db.thoughts.update(t.id, { categoryId: undefined, updatedAt: nowISO() });
  });
  after();
  toast(`Deleted ${cat.name}${moved.length ? `; ${moved.length} thought${moved.length > 1 ? 's' : ''} now have no category` : ''}`, async () => {
    await db.categories.put(cat);
    for (const t of moved) await db.thoughts.update(t.id, { categoryId: id });
    after();
  });
}

async function confirmRestore(f: File, after: () => void): Promise<void> {
  const p = await previewBackup(f);
  if (!p.ok) return toast(RESTORE_REASONS[p.reason], undefined, 6000);
  const sheet = openSheet(`<div class="grabber"></div><h2 class="serif sheet-title">Import this backup?</h2>
    <p class="muted" style="margin:0 0 6px">${p.curiosities} curiosities, ${p.wonderings} wonderings and ${p.steps} steps, from ${new Date(p.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.</p>
    <p class="hint" style="margin:0 0 16px">It replaces the thoughts on this device. Back up first if you want to keep them.</p>
    <div class="two"><button class="btn-secondary" data-no>Cancel</button><button class="btn" data-yes>Import</button></div>`);
  sheet.el.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-no]')) return sheet.close();
    if (t.closest('[data-yes]')) { await restoreBackup(p.backup); applyLook(await getSettings()); sheet.close(); toast('Backup imported'); after(); }
  });
}

function confirmReset(after: () => void): void {
  const sheet = openSheet(`<div class="grabber"></div><h2 class="serif sheet-title">Start over?</h2>
    <p class="muted" style="margin:0 0 16px">Every thought, step and category you added is erased from this device. Your settings stay. Back up first if you might want them back.</p>
    <div class="two"><button class="btn-secondary" data-no>Cancel</button><button class="btn danger" data-yes>Erase everything</button></div>`);
  sheet.el.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-no]')) return sheet.close();
    if (t.closest('[data-yes]')) {
      await db.transaction('rw', db.thoughts, db.steps, db.categories, async () => { await db.thoughts.clear(); await db.steps.clear(); await db.categories.filter((c) => !c.builtIn).delete(); });
      sheet.close(); toast('Started over. Nothing else changed.'); after();
    }
  });
}

function confirmPurge(after: () => void): void {
  const sheet = openSheet(`<div class="grabber"></div><h2 class="serif sheet-title">Delete them for good?</h2>
    <p class="muted" style="margin:0 0 16px">Recently deleted thoughts can’t be restored after this.</p>
    <div class="two"><button class="btn-secondary" data-no>Cancel</button><button class="btn danger" data-yes>Delete for good</button></div>`);
  sheet.el.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-no]')) return sheet.close();
    if (t.closest('[data-yes]')) {
      const ids = (await db.thoughts.toArray()).filter((x) => x.deletedAt).map((x) => x.id);
      await db.transaction('rw', db.thoughts, db.steps, async () => { await db.steps.where('thoughtId').anyOf(ids).delete(); await db.thoughts.bulkDelete(ids); });
      sheet.close(); toast('Deleted for good'); after();
    }
  });
}

/** Feedback, same sheet as Nudge!'s: saved on the Innova Space server, then emailed. No email app needed. */
function openFeedback(): void {
  let kind = 'Something broke';
  const sheet = openSheet(`<div class="grabber"></div><h2 class="serif sheet-title">Send feedback</h2>
    <p class="set-h" style="margin-top:6px">What is it?</p>
    <div class="chips">${['Something broke', 'An idea', 'Other'].map((k, i) => `<button type="button" class="chip outline" data-kind="${k}" aria-pressed="${i === 0}">${k}</button>`).join('')}</div>
    <label class="set-h" for="fb">Tell us</label><textarea class="field area" id="fb" rows="5"></textarea>
    <label class="set-h" for="fbm">Your email, if you’d like a reply</label><input class="field" id="fbm" type="email" placeholder="Optional" autocomplete="email">
    <label class="srow bare"><span class="sbody"><span class="stitle">Include app info</span><span class="ssub">Version, device, screen size, theme. Never your thoughts.</span></span><input type="checkbox" role="switch" class="sw" id="fbi" checked></label>
    <button class="btn big" type="button" data-send>Send feedback</button>
    <p class="hint" style="text-align:center">Goes straight to Innova Space. No email app needed.</p>`);
  const el = sheet.el;
  el.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    const k = t.closest<HTMLElement>('[data-kind]');
    if (k) { kind = k.dataset.kind!; el.querySelectorAll<HTMLElement>('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', String(b === k))); return; }
    if (!t.closest('[data-send]')) return;
    const msg = el.querySelector<HTMLTextAreaElement>('#fb')!;
    if (!msg.value.trim()) return msg.focus();
    const btn = t.closest<HTMLButtonElement>('[data-send]')!; btn.disabled = true; btn.textContent = 'Sending…';
    const info = el.querySelector<HTMLInputElement>('#fbi')!.checked ? `${navigator.userAgent} · ${innerWidth}×${innerHeight} · ${document.documentElement.dataset.mode} · font ${document.documentElement.dataset.font}` : '';
    try {
      await sendFeedback({ kind, message: msg.value.trim(), replyTo: el.querySelector<HTMLInputElement>('#fbm')!.value.trim(), info, version: VERSION });
      sheet.close(); toast('Thank you. It’s on its way to Innova Space.');
    } catch (err) { btn.disabled = false; btn.textContent = 'Send feedback'; toast(friendlyError(err), undefined, 5000); }
  });
  setTimeout(() => el.querySelector<HTMLTextAreaElement>('#fb')?.focus(), 80);
}
