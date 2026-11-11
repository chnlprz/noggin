// Catch a thought (Bible › Capture): single, Keep adding, batch (one per line), paste split, draft kept.
import { db, getSettings, updateSettings } from '../db/db';
import type { Category, ThoughtType } from '../db/types';
import { addThoughts, categories, suggestCategory } from '../logic/thoughts';
import { autogrow, h, ICON, openSheet, toast } from './kit';

const label = (t: ThoughtType) => (t === 'curiosity' ? 'Curiosities' : 'Wonderings');
const placeholder = (t: ThoughtType, batch: boolean) =>
  batch ? 'One thought per line…' : t === 'curiosity' ? 'An idea, a spark, a maybe…' : 'A question you keep coming back to…';

export async function openCapture(start: ThoughtType, onSaved: (type: ThoughtType) => void): Promise<void> {
  const [cats, s, meta] = await Promise.all([categories(), getSettings(), db.meta.get('meta')]);
  let type = start, batch = false, keep = s.keepAdding;
  let catId: string | undefined; let manual = false; let suggested = false;

  const sheet = openSheet(`
    <div class="sheet-head"><h2 class="serif" id="capT">Catch a thought</h2><button class="icon-btn" data-x aria-label="Close">${ICON.x}</button></div>
    <div class="tabs" role="tablist" aria-label="Type">
      <button role="tab" data-type="curiosity">Curiosity</button><button role="tab" data-type="wondering">Wondering</button>
    </div>
    <textarea class="field area" id="capText" rows="3" aria-labelledby="capT"></textarea>
    <p class="hint" id="capSplit" hidden></p>
    <div class="label" style="margin:14px 0 8px" id="capCatL">Category <span class="opt">optional</span></div>
    <div class="chips" id="capCats" role="group" aria-labelledby="capCatL"></div>
    <p class="hint" id="capHint"></p>
    <div class="cap-row"><label class="switch-row"><span>Keep adding</span><input type="checkbox" role="switch" id="capKeep"></label><div class="seg mini" role="group" aria-label="How many"><button type="button" data-capmode="one">One</button><button type="button" data-capmode="many">Several</button></div></div>
    <button class="btn" type="button" id="capSave"></button>`, () => void saveDraft());
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
    el.querySelector('#capSave')!.textContent = batch ? `Save ${n || ''} thought${n === 1 ? '' : 's'}`.replace('  ', ' ') : `Save to ${label(type)}`;
    autogrow(ta);
  };
  const suggest = () => {
    if (manual) return;
    if (batch) { catId = undefined; suggested = false; return; } // a batch mixes topics: no guess
    const c = suggestCategory(ta.value, cats);
    catId = c?.id; suggested = !!c;
  };
  async function saveDraft() {
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
    if (t.closest('#capSave')) await save();
  });
  el.querySelector('#capKeep')!.addEventListener('change', async (e) => {
    keep = (e.target as HTMLInputElement).checked; await updateSettings({ keepAdding: keep });
  });
  ta.addEventListener('input', () => { suggest(); draw(); });
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

  async function save() {
    const texts = batch ? lines() : [ta.value.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()].filter(Boolean);
    if (!texts.length) return ta.focus();
    await addThoughts(texts, type, catId);
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
