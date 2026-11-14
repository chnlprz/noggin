// Catch a thought (Bible › Capture): single, Keep adding, batch (one per line), paste split, draft kept.
// Say it (Labs beta): a mic in the box; the words become cards you check before anything is saved.
import { track } from '../lib/usage';
import { db, getSettings, updateSettings } from '../db/db';
import type { Category, SayItem, ThoughtType } from '../db/types';
import { addStep, addThoughts, categories, suggestCategory } from '../logic/thoughts';
import { MAX_SECS, sayError, sayOn, startRecording, toThoughts, transcribe, type Recorder } from '../lib/say';
import { autogrow, h, ICON, openSheet, toast } from './kit';

const MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const STOP = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>';
const label = (t: ThoughtType) => (t === 'curiosity' ? 'Curiosities' : 'Wonderings');
const placeholder = (t: ThoughtType, batch: boolean) =>
  batch ? 'One thought per line…' : t === 'curiosity' ? 'An idea, a spark, a maybe…' : 'A question you keep coming back to…';

export async function openCapture(start: ThoughtType, onSaved: (type: ThoughtType) => void): Promise<void> {
  const [cats, s, meta, say] = await Promise.all([categories(), getSettings(), db.meta.get('meta'), sayOn()]);
  let type = start, batch = false, keep = s.keepAdding;
  let catId: string | undefined; let manual = false; let suggested = false;
  // Say it state: what's being recorded or read, the cards to check, and the lines already read
  type Phase = { step: 'rec'; secs: number; quietSince: number } | { step: 'write' | 'thoughts'; secs: number; heard?: string; lines?: boolean };
  let phase: Phase | null = null, rec: Recorder | null = null, tick = 0, items: SayItem[] | null = null, closed = false;
  let checked = new Set<string>(), tipsSeen = !!s.sayTipsSeen, showTips = false;
  let draftOffer = meta?.sayDraft && Date.now() - meta.sayDraft.at < 864e5 ? meta.sayDraft : undefined;
  if (meta?.sayDraft && !draftOffer) void db.meta.update('meta', { sayDraft: undefined });

  const sheet = openSheet(`
    <div class="sheet-head"><h2 class="serif" id="capT">Catch a thought</h2><button class="icon-btn" data-x aria-label="Close">${ICON.x}</button></div>
    <div class="tabs" role="tablist" aria-label="Type">
      <button role="tab" data-type="curiosity">Curiosity</button><button role="tab" data-type="wondering">Wondering</button>
    </div>
    ${say ? '<p class="vc-hint" id="capSayHint">Type it, or tap the mic and say it <span class="vc-beta">Beta</span></p>' : ''}
    <div id="capDraft"></div><div id="capPhase"></div>
    <div class="vc-area" id="capArea"><textarea class="field area" id="capText" rows="3" aria-labelledby="capT"></textarea>${say ? `<button type="button" class="vc-mic" data-mic aria-label="Say it (beta)">${MIC}</button>` : ''}</div>
    <p class="hint" id="capSplit" hidden></p>
    <div id="capReview"></div>
    <div id="capCatWrap"><div class="label" style="margin:14px 0 8px" id="capCatL">Category <span class="opt">optional</span></div>
    <div class="chips" id="capCats" role="group" aria-labelledby="capCatL"></div>
    <p class="hint" id="capHint"></p></div>
    <div class="cap-row"><label class="switch-row"><span>Keep adding</span><input type="checkbox" role="switch" id="capKeep"></label><div class="seg mini" role="group" aria-label="How many"><button type="button" data-capmode="one">One</button><button type="button" data-capmode="many">Several</button></div></div>
    <button class="btn" type="button" id="capSave"></button>
    <button class="link vc-plain" type="button" id="capPlain" hidden>Save as typed</button>`, () => { closed = true; stopRec(); void saveDraft(); });
  const el = sheet.el;
  const ta = el.querySelector<HTMLTextAreaElement>('#capText')!;
  ta.value = meta?.captureDraft ?? '';

  const lines = () => ta.value.split('\n').map((l) => l.trim()).filter(Boolean);
  const draw = () => {
    el.querySelectorAll<HTMLButtonElement>('[data-type]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.type === type)));
    el.querySelector('#capT')!.textContent = batch ? 'Catch thoughts' : 'Catch a thought';
    ta.placeholder = placeholder(type, batch);
    el.querySelector('#capCatL')!.innerHTML = `${batch ? 'Category for all' : 'Category'} <span class="opt">optional</span>`;
    el.querySelector('#capCats')!.innerHTML = cats.map((c: Category) => `<button type="button" class="chip" data-cat="${c.id}" aria-pressed="${c.id === catId}">${h(c.name)}</button>`).join('');
    el.querySelector('#capHint')!.textContent = suggested && !manual && catId ? 'Suggested from your words.' : '';
    el.querySelector<HTMLInputElement>('#capKeep')!.checked = keep;
    el.querySelectorAll<HTMLElement>('[data-capmode]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.capmode === 'many') === batch)));
    const split = el.querySelector<HTMLElement>('#capSplit')!;
    if (batch) { split.hidden = false; split.textContent = 'Each line becomes its own thought.'; }
    else if (!split.querySelector('[data-split]')) split.hidden = true;
    const n = lines().length;
    const saveBtn = el.querySelector<HTMLButtonElement>('#capSave')!, plain = el.querySelector<HTMLElement>('#capPlain')!;
    const pend = pending().length;
    saveBtn.textContent = items ? (pend ? `Check ${pend} new` : `Save ${items.length} thought${items.length === 1 ? '' : 's'}`)
      : say && batch && n ? `Check ${n} thought${n === 1 ? '' : 's'}`
      : batch ? `Save ${n || ''} thought${n === 1 ? '' : 's'}`.replace('  ', ' ') : `Save to ${label(type)}`;
    saveBtn.disabled = !!phase || (!!items && !items.length && !pend);
    plain.hidden = !(say && batch && n && !items && !phase);
    // Say it: the recorder or progress replaces the box; checked cards replace the category chips
    el.querySelector<HTMLElement>('#capArea')!.hidden = !!phase || !!draftOffer;
    el.querySelector<HTMLElement>('#capCatWrap')!.hidden = !!items || !!draftOffer || !!phase;
    if (items || phase) el.querySelector<HTMLElement>('#capSplit')!.hidden = true;
    el.querySelector<HTMLElement>('#capPhase')!.innerHTML = phaseHTML();
    el.querySelector<HTMLElement>('#capReview')!.innerHTML = items ? reviewHTML() : '';
    el.querySelector<HTMLElement>('#capDraft')!.innerHTML = draftOffer ? draftHTML() : '';
    el.querySelector<HTMLElement>('#capSayHint')?.toggleAttribute('hidden', !!phase || !!items || !!draftOffer);
    autogrow(ta);
  };

  // ── Say it (Labs beta) ──
  const mmss = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
  const TIPS = '<div class="vc-tips"><b>Say as much as you like:</b><ul><li>a few thoughts, one after another</li><li>questions become Wonderings <i>(bakit…, how do…)</i></li><li>a category, if you have one <i>(for work, sa bahay)</i></li><li>steps <i>(una…, pangalawa…)</i></li></ul></div>';
  const catName = (id: string | null) => (id ? cats.find((c) => c.id === id)?.name : undefined);
  function phaseHTML(): string {
    if (!phase) return '';
    if (phase.step === 'rec') return `<div class="vc-gap"><div class="vc-rec" role="status" aria-live="polite"><div class="vc-row"><span class="vc-dot" aria-hidden="true"></span><span class="vc-time" id="vcTime">${mmss(phase.secs)} <small>/ ${mmss(MAX_SECS)}</small></span><span class="vc-meter" id="vcMeter" aria-hidden="true">${'<i></i>'.repeat(12)}</span><button type="button" class="vc-stop" data-stop aria-label="Stop and check">${STOP}</button></div>
      <div class="vc-heard" id="vcHeard">Listening…</div><button type="button" class="link vc-cancel" data-cancelrec>Cancel</button></div>
      ${!tipsSeen || showTips ? TIPS : '<button type="button" class="link vc-cancel" data-tips>What can I say?</button>'}</div>`;
    const p = phase;
    return `<div class="vc-gap"><div class="vc-proc" role="status" aria-live="polite">
      ${p.lines ? '' : `<div class="vc-st"><span class="vc-ok">✓</span>Recorded · ${mmss(p.secs)}</div><div class="vc-st">${p.step === 'write' ? '<span class="vc-spin"></span><b>Writing it down…</b>' : '<span class="vc-ok">✓</span>Written down'}</div>`}
      ${p.heard ? `<div class="vc-quote">“${h(p.heard.length > 240 ? `${p.heard.slice(0, 240)}…` : p.heard)}”</div>` : ''}
      ${p.step === 'thoughts' ? `<div class="vc-st"><span class="vc-spin"></span><b>${p.lines ? 'Reading your lines…' : 'Getting your thoughts…'}</b></div>` : ''}</div>
      <p class="vc-hint">Usually a few seconds. You can close this; your words are kept.</p></div>`;
  }
  function reviewHTML(): string {
    const pend = pending().length;
    return `<div class="vc-gap" style="margin-top:12px"><div class="vc-review">${items!.map((t, i) => `<div class="vc-card"><div class="t">${h(t.text)}<div class="vc-tags">
      <button type="button" class="vc-tag" data-rvt="${i}" aria-label="Type: ${t.type === 'curiosity' ? 'Curiosity' : 'Wondering'}. Tap to change">${t.type === 'curiosity' ? 'Curiosity' : 'Wondering'}</button>
      <button type="button" class="vc-tag${t.categoryId ? '' : ' none'}" data-rvc="${i}" aria-label="Category: ${h(catName(t.categoryId) ?? 'none')}. Tap to change">${h(catName(t.categoryId) ?? 'No category')}</button>
      ${t.steps.length ? `<span class="vc-tag static">${t.steps.length} step${t.steps.length === 1 ? '' : 's'}</span>` : ''}</div></div>
      <button type="button" class="vc-x" data-rvx="${i}" aria-label="Leave out ${h(t.text)}">✕</button></div>`).join('') || '<p class="vc-hint" style="padding:12px">No thoughts left to save.</p>'}</div>
      <p class="vc-hint">${pend ? `${pend} new line${pend === 1 ? '' : 's'} not checked yet. Tap Check to add ${pend === 1 ? 'it' : 'them'} here.` : 'Tap a tag to change it. ✕ leaves a thought out.'}</p>
      <div class="vc-redo"><button type="button" class="vc-sbtn" data-allnone>Leave all uncategorized</button><button type="button" class="vc-sbtn" data-over>Start over</button></div></div>`;
  }
  function draftHTML(): string {
    const d = draftOffer!, mins = Math.max(1, Math.round((Date.now() - d.at) / 6e4));
    const what = d.text.trim() || d.items.map((x) => x.text).join(' · ');
    return `<div class="vc-draft"><div><b>You didn’t add this yet</b> · ${mins < 60 ? `${mins} min` : `${Math.round(mins / 60)} h`} ago</div><div class="vc-quote">“${h(what.length > 120 ? `${what.slice(0, 120)}…` : what)}”</div><div class="vc-draft-row"><button type="button" class="btn" data-draftgo>Continue</button><button type="button" class="vc-sbtn" data-draftno>Start over</button></div></div>`;
  }
  /** Lines typed after the last check, read on Check N new. */
  const pending = () => (items ? lines().filter((l) => !checked.has(l)) : []);
  const markChecked = () => { checked = new Set(lines()); };
  const keepSay = () => db.meta.update('meta', { sayDraft: items || phase ? { at: Date.now(), text: ta.value, items: items ?? [], checked: [...checked] } : undefined });
  function stopRec() { clearInterval(tick); if (rec) { rec.cancel(); rec = null; } if (phase?.step === 'rec') phase = null; }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  async function micTap() {
    if (phase?.step === 'rec') return finishRec();
    if (phase) return;
    try {
      rec = await startRecording(MAX_SECS * 1000, () => void finishRec());
    } catch { return toast('Noggin? needs the microphone for this. Allow it in your browser settings, or use your keyboard’s mic.'); }
    batch = true; phase = { step: 'rec', secs: 0, quietSince: Date.now() };
    draw();
    const t0 = Date.now();
    tick = window.setInterval(() => {
      if (phase?.step !== 'rec' || !rec) return;
      phase.secs = (Date.now() - t0) / 1000;
      const lv = rec.level();
      if (lv > 0.06) phase.quietSince = Date.now();
      const quiet = (Date.now() - phase.quietSince) / 1000;
      const tm = el.querySelector('#vcTime'), hd = el.querySelector<HTMLElement>('#vcHeard'), mt = el.querySelector<HTMLElement>('#vcMeter');
      if (tm) tm.innerHTML = `${mmss(phase.secs)} <small>/ ${mmss(MAX_SECS)}</small>`;
      if (hd) { const ok = quiet < 4; hd.textContent = phase.secs < 1 ? 'Listening…' : ok ? 'Hearing you' : 'Can’t hear you. Come a little closer.'; hd.classList.toggle('bad', !ok); }
      if (mt && !reduce) mt.querySelectorAll<HTMLElement>('i').forEach((b, i) => { b.style.height = `${4 + Math.round(lv * 20 * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.7 + phase!.secs * 6))))}px`; });
    }, 120);
  }
  async function finishRec() {
    if (phase?.step !== 'rec' || !rec) return;
    clearInterval(tick);
    const secs = phase.secs, r = rec; rec = null;
    if (!tipsSeen) { tipsSeen = true; void updateSettings({ sayTipsSeen: true }); }
    phase = { step: 'write', secs }; draw();
    track('say'); track('say.secs', Math.round(secs));
    try {
      const blob = await r.stop();
      const heard = (await transcribe(blob, secs)).trim();
      if (!heard) { phase = null; draw(); return toast('Didn’t catch any words. Nothing was saved; try again a little closer.'); }
      phase = { step: 'thoughts', secs, heard }; draw();
      ta.value = [ta.value.trim(), heard].filter(Boolean).join('\n');
      const got = await toThoughts(heard, 'speech', type);
      items = [...(items ?? []), ...got]; markChecked(); phase = null;
      if (closed) return void keepSay();
      draw(); void keepSay();
    } catch (e) {
      phase = null; if (closed) return void keepSay();
      draw(); toast(sayError(e));
    }
  }
  /** Typed lines (Several) or new lines after a check: read only what's new. */
  async function checkLines(only: string[]) {
    if (!items) track('add.checked');
    phase = { step: 'thoughts', secs: 0, lines: true }; draw();
    try {
      const got = await toThoughts(only.join('\n'), 'lines', type);
      items = [...(items ?? []), ...got]; markChecked(); phase = null;
      if (closed) return void keepSay();
      draw(); void keepSay();
    } catch (e) { phase = null; if (closed) return; draw(); toast(sayError(e)); }
  }
  async function saveItems() {
    if (!items?.length) return;
    let firstType: ThoughtType | undefined;
    for (const it of items) {
      const [t] = await addThoughts([it.text], it.type, it.categoryId ?? undefined);
      if (!t) continue;
      firstType ??= it.type;
      for (const st of it.type === 'curiosity' ? it.steps : []) await addStep(t.id, st);
    }
    const n = items.length;
    items = null; checked.clear(); ta.value = '';
    await db.meta.update('meta', { captureDraft: undefined, sayDraft: undefined });
    toast(n > 1 ? `Saved ${n} thoughts` : `Saved to ${label(firstType ?? type)}`);
    onSaved(firstType ?? type);
    if (keep) { draw(); ta.focus(); } else sheet.close();
  }
  const suggest = () => {
    if (manual) return;
    if (batch) { catId = undefined; suggested = false; return; } // a batch mixes topics: no guess
    const c = suggestCategory(ta.value, cats);
    catId = c?.id; suggested = !!c;
  };
  async function saveDraft() {
    if (items || phase) return void keepSay();
    await db.meta.update('meta', { captureDraft: ta.value.trim() ? ta.value : undefined });
  }

  el.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-x]')) return sheet.close();
    const tb = t.closest<HTMLButtonElement>('[data-type]');
    if (tb) { type = tb.dataset.type as ThoughtType; draw(); return ta.focus(); }
    const cb = t.closest<HTMLButtonElement>('[data-cat]');
    if (cb) { manual = true; catId = catId === cb.dataset.cat ? undefined : cb.dataset.cat; draw(); return; }
    const cm = t.closest<HTMLElement>('[data-capmode]');
    if (cm) { batch = cm.dataset.capmode === 'many'; suggest(); draw(); return ta.focus(); }
    if (t.closest('[data-split]')) {
      const yes = (t.closest('[data-split]') as HTMLElement).dataset.split === 'yes';
      if (yes) { batch = true; suggest(); } else ta.value = ta.value.replace(/\s*\n\s*/g, ' ');
      el.querySelector<HTMLElement>('#capSplit')!.hidden = true; draw(); return;
    }
    // Say it
    if (t.closest('[data-mic]')) return void micTap();
    if (t.closest('[data-stop]')) return void finishRec();
    if (t.closest('[data-cancelrec]')) { stopRec(); return draw(); }
    if (t.closest('[data-tips]')) { showTips = true; return draw(); }
    const rvt = t.closest<HTMLElement>('[data-rvt]');
    if (rvt && items) { const it = items[+rvt.dataset.rvt!]; it.type = it.type === 'curiosity' ? 'wondering' : 'curiosity'; draw(); return void keepSay(); }
    const rvc = t.closest<HTMLElement>('[data-rvc]');
    if (rvc && items) { const it = items[+rvc.dataset.rvc!]; const ids = [null, ...cats.map((c) => c.id)]; it.categoryId = ids[(ids.indexOf(it.categoryId) + 1) % ids.length]; draw(); return void keepSay(); }
    const rvx = t.closest<HTMLElement>('[data-rvx]');
    if (rvx && items) { items.splice(+rvx.dataset.rvx!, 1); draw(); return void keepSay(); }
    if (t.closest('[data-allnone]') && items) { items.forEach((x) => { x.categoryId = null; }); draw(); return void keepSay(); }
    if (t.closest('[data-over]')) { items = null; checked.clear(); ta.value = ''; await db.meta.update('meta', { sayDraft: undefined, captureDraft: undefined }); draw(); return ta.focus(); }
    if (t.closest('[data-draftgo]') && draftOffer) { track('say.draft'); ta.value = draftOffer.text; items = draftOffer.items.length ? draftOffer.items : null; checked = new Set(draftOffer.checked); batch = true; draftOffer = undefined; draw(); return; }
    if (t.closest('[data-draftno]')) { draftOffer = undefined; await db.meta.update('meta', { sayDraft: undefined }); draw(); return ta.focus(); }
    if (t.closest('#capPlain')) return void save(true);
    if (t.closest('#capSave')) await save();
  });
  el.querySelector('#capKeep')!.addEventListener('change', async (e) => {
    keep = (e.target as HTMLInputElement).checked; await updateSettings({ keepAdding: keep });
  });
  ta.addEventListener('input', () => { suggest(); if (items) { draw(); void keepSay(); } else draw(); });
  ta.addEventListener('paste', () => setTimeout(() => {
    if (batch) return;
    const l = lines();
    const n = l.length;
    if (n < 3 || l.some((x) => x.length > 80)) return; // paragraphs stay one thought; only list-like pastes ask
    const p = el.querySelector<HTMLElement>('#capSplit')!;
    p.hidden = false;
    p.innerHTML = `Save as ${n} thoughts? <button class="link" type="button" data-split="yes">Split</button> · <button class="link" type="button" data-split="no">Keep as one</button>`;
  }));
  // Enter is always a new line (a thought can have paragraphs). Cmd/Ctrl + Enter saves.
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); }
  });

  async function save(plain = false) {
    if (phase) return;
    if (items) { const pend = pending(); return pend.length ? checkLines(pend) : saveItems(); }
    if (say && batch && !plain && lines().length) return checkLines(lines());
    const texts = batch ? lines() : [ta.value.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()].filter(Boolean);
    if (!texts.length) return ta.focus();
    await addThoughts(texts, type, catId); track(batch ? 'add.several' : 'add.one');
    ta.value = ''; await db.meta.update('meta', { captureDraft: undefined });
    toast(texts.length > 1 ? `Saved ${texts.length} thoughts to ${label(type)}` : `Saved to ${label(type)}`);
    onSaved(type);
    // Keep adding: same type; a category you picked stays, a suggested one is worked out again.
    if (keep) { if (!manual) { catId = undefined; suggested = false; } draw(); ta.focus(); }
    else sheet.close();
  }

  draw();
  setTimeout(() => ta.focus(), 60);
}
