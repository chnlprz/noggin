// Thought details (Bible › Thoughts): type, text, note, category, steps with Nudge! states, Send, Archive, Delete.
import { seen, track } from '../lib/usage';
import { db } from '../db/db';
import type { Step, StepState } from '../db/types';
import { addStep, archive, categories, editStep, markOpened, removeStep, reorderSteps, softDelete, stepsOf, unarchive, restore, updateThought } from '../logic/thoughts';
import { autogrow, h, ICON, toast } from './kit';
import { getSettings } from '../db/db';
import { cloud } from '../lib/cloud';
import { cancelStep, copySteps, sendSteps } from '../lib/handoff';
import { aiState, askAI, fresh } from '../lib/ai';
import type { Thought } from '../db/types';

const STATE: Record<StepState, { text: string; cls: string } | null> = {
  draft: null,
  waiting: { text: 'Waiting', cls: 'st-m' },
  'in-nudge': { text: 'In Nudge', cls: 'st-g' },
  done: { text: 'Done ✓', cls: 'st-g' },
  removed: { text: 'Removed in Nudge', cls: 'st-m' },
  copied: { text: 'Copied', cls: 'st-m' },
};
const editable = (s: Step) => s.state === 'draft' || s.state === 'removed';

export async function renderDetail(view: HTMLElement, id: string, nav: { back: () => void; refresh: () => void }, opened = true): Promise<void> {
  if (opened) { await markOpened(id); track('view.thought'); }
  const t = await db.thoughts.get(id);
  if (!t || t.deletedAt) { nav.back(); return; }
  const [cats, steps] = await Promise.all([categories(), stepsOf(id)]);
  const drafts = steps.filter((s) => s.state === 'draft' && s.text.trim()).length;
  const st = await getSettings();
  const signedIn = cloud.get().signedIn;
  const sendLabel = `${signedIn ? 'Send' : 'Copy'} ${drafts} step${drafts > 1 ? 's' : ''} to Nudge!`;

  view.innerHTML = `
    <div class="sub-top detail-top"><button class="back" data-back>${ICON.back}<span>Back</span></button></div>
    <div class="label type-label">${t.type === 'curiosity' ? 'Curiosity' : 'Wondering'}</div>
    <textarea class="title-edit serif" id="dText" rows="1" aria-label="Thought">${h(t.text)}</textarea>
    ${t.type === 'wondering' ? '<div id="dAI" aria-live="polite"></div>' : ''}
    <label class="label" for="dNote" style="display:block;margin:18px 0 6px">${t.type === 'wondering' ? 'What I found' : 'Note'}</label>
    <textarea class="field area" id="dNote" rows="2" placeholder="${t.type === 'wondering' ? 'What you’ve learned so far…' : 'Add a note'}">${h(t.note ?? '')}</textarea>
    <div class="label" style="margin:18px 0 8px">Category</div>
    <div class="chips">${cats.map((c) => `<button type="button" class="chip" data-cat="${c.id}" aria-pressed="${c.id === t.categoryId}">${h(c.name)}</button>`).join('')}</div>
    <div class="label" style="margin:22px 0 4px">Next steps</div>
    <div class="steps" id="dSteps">${steps.map(stepRow).join('')}</div>
    <form class="add-step" id="dAdd"><input class="field" id="dNew" placeholder="Add a next step" aria-label="Add a next step" autocomplete="off" enterkeyhint="done"><button class="icon-btn" aria-label="Add step">${ICON.plus}</button></form>
    ${t.type === 'curiosity' ? '<div id="dAI" aria-live="polite"></div>' : ''}
    <div class="detail-actions">
      ${drafts && st.sendToNudge ? `<button class="btn" type="button" data-send>${sendLabel}</button>${signedIn ? '' : '<p class="hint" style="text-align:center;margin:-4px 0 0">Opens Nudge!’s Batch add. Sign in to see their status here.</p>'}` : ''}
      <div class="quiet-row"><button class="link muted" type="button" data-archive>${t.archivedAt ? 'Restore from Archives' : 'Archive'}</button><span class="muted">·</span><button class="link muted" type="button" data-delete>Delete</button></div>
    </div>`;

  const text = view.querySelector<HTMLTextAreaElement>('#dText')!;
  const note = view.querySelector<HTMLTextAreaElement>('#dNote')!;
  autogrow(text); autogrow(note);
  // Short thoughts read as a title (serif); long ones or ones with paragraphs switch to easy reading text.
  const fit = () => { text.classList.toggle('long', text.value.length > 80 || text.value.includes('\n')); autogrow(text); };
  fit();
  text.addEventListener('input', () => { fit(); void updateThought(id, { text: text.value }); });
  text.addEventListener('change', async () => { if (!text.value.trim()) { text.value = t.text; await updateThought(id, { text: t.text }); } if (matchMedia('(min-width: 768px)').matches) nav.refresh(); });
  note.addEventListener('input', () => { seen('note.edit'); autogrow(note); void updateThought(id, { note: note.value || undefined }); });

  view.querySelector('#dAdd')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inp = view.querySelector<HTMLInputElement>('#dNew')!;
    if (!inp.value.trim()) return inp.focus();
    await addStep(id, inp.value); track('step.add');
    await renderDetail(view, id, nav, false);
    view.querySelector<HTMLInputElement>('#dNew')?.focus();
  });
  view.querySelectorAll<HTMLTextAreaElement>('[data-step-in]').forEach((inp) => {
    autogrow(inp);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } }); // a step is one line of thought
    inp.addEventListener('input', () => { autogrow(inp); void editStep(inp.dataset.stepIn!, inp.value.replace(/\n/g, ' ')); });
    inp.addEventListener('change', async () => { if (!inp.value.trim()) { await removeStep(inp.dataset.stepIn!); void renderDetail(view, id, nav, false); } });
  });

  // ── AI helpers: asked when the thought opens (Settings › AI helpers) ──
  const box = view.querySelector<HTMLElement>('#dAI')!;
  const mode = aiState(t, st);
  let busy = false;
  const ask = async (opts: Parameters<typeof askAI>[1] = {}) => {
    if (busy) return; busy = true;
    box.innerHTML = aiCard(t.type === 'curiosity' ? (steps.length ? 'A next step' : 'A first step') : 'Short answer', '<div class="ai-dots" aria-label="Thinking"><i></i><i></i><i></i></div>');
    try { t.ai = await askAI(t, opts); track(t.type === 'curiosity' ? 'ai.step' : 'ai.answer'); paint(); }
    catch (err) { box.innerHTML = aiCard('', `<p class="ai-p">${(err as Error).message === 'ai-off' ? 'AI helpers aren’t switched on for Noggin? yet.' : 'Couldn’t reach it just now. Your thought is unchanged.'}</p>`, '<button class="link" data-ai="retry">Try again</button>'); }
    busy = false;
  };
  const paint = () => { box.innerHTML = aiView(t, steps.length > 0, mode); };
  if (mode === 'on' && !fresh(t) && (t.type === 'wondering' || !steps.length)) void ask();
  else paint();

  view.onclick = async (e) => {
    const el = e.target as HTMLElement;
    if (el.closest('[data-back]')) return nav.back();
    const aib = el.closest<HTMLElement>('[data-ai]');
    if (aib) {
      const a = aib.dataset.ai;
      if (a === 'retry' || a === 'again') return ask(t.type === 'curiosity' && steps.length ? { steps: steps.map((x) => x.text) } : {});
      if (a === 'another') return ask({ another: true, steps: steps.map((x) => x.text) });
      if (a === 'next') return ask({ steps: steps.map((x) => x.text) });
      if (a === 'more') { const m = view.querySelector<HTMLInputElement>('#aiMore')!; if (!m.value.trim()) return m.focus(); return ask({ more: m.value.trim() }); }
      if (a === 'add' && t.ai) { track('ai.step.add'); await addStep(id, t.ai.text); await updateThought(id, { ai: { ...t.ai, tried: [...(t.ai.tried ?? []), t.ai.text] , text: '' } }); toast('Added to your steps'); return renderDetail(view, id, nav, false); }
      if (a === 'save' && t.ai) {
        const add = t.ai.kind === 'personal' ? [...(t.ai.points ?? []).map((p) => `• ${p}`), t.ai.question ?? ''].filter(Boolean).join('\n') : t.ai.text;
        const n = [t.note?.trim(), add].filter(Boolean).join('\n\n');
        t.ai = { ...t.ai, saved: true }; t.note = n;
        await updateThought(id, { note: n, ai: t.ai }); note.value = n; autogrow(note); paint();
        track('ai.save'); return toast('Saved to What I found');
      }
      if (a === 'move') { await updateThought(id, { type: 'curiosity', ai: undefined }); toast('Moved to Curiosities'); return renderDetail(view, id, nav, false); }
      if (a === 'signin') { location.hash = ''; return void document.dispatchEvent(new CustomEvent('noggin:settings', { detail: 'sync' })); }
      return;
    }
    const cb = el.closest<HTMLElement>('[data-cat]');
    if (cb) { await updateThought(id, { categoryId: t.categoryId === cb.dataset.cat ? undefined : cb.dataset.cat }); return renderDetail(view, id, nav, false); }
    const rm = el.closest<HTMLElement>('[data-rm]');
    if (rm) {
      const s = steps.find((x) => x.id === rm.dataset.rm)!;
      await removeStep(s.id); await renderDetail(view, id, nav, false);
      return toast('Step removed', async () => { await db.steps.put(s); void renderDetail(view, id, nav, false); });
    }
    if (el.closest('[data-send]')) {
      const ds = (await stepsOf(id)).filter((s) => s.state === 'draft' && s.text.trim());
      if (!ds.length) return;
      if (!cloud.get().signedIn) { await copySteps(ds); toast(`Copied ${ds.length} step${ds.length > 1 ? 's' : ''} into Nudge!’s Batch add`); return renderDetail(view, id, nav, false); }
      const r = await sendSteps(t, ds); track('handoff.send', ds.length);
      toast(r === 'sent' ? `${ds.length} step${ds.length > 1 ? 's' : ''} sent to Nudge!` : 'Saved here. They’ll go to Nudge! when you’re back online.', undefined, 3500);
      return renderDetail(view, id, nav, false);
    }
    const cs = el.closest<HTMLElement>('[data-cancel]');
    if (cs) {
      const s = steps.find((x) => x.id === cs.dataset.cancel)!;
      toast((await cancelStep(s)) ? 'Taken back. Nothing went to Nudge!.' : 'Nudge! already has it. Nothing changed.');
      return renderDetail(view, id, nav, false);
    }
    const sa = el.closest<HTMLElement>('[data-again]');
    if (sa) {
      const s = steps.find((x) => x.id === sa.dataset.again)!;
      await sendSteps(t, [s]); toast('Sent to Nudge! again');
      return renderDetail(view, id, nav, false);
    }
    if (el.closest('[data-archive]')) {
      if (t.archivedAt) { await unarchive([id]); toast(`Back in ${t.type === 'curiosity' ? 'Curiosities' : 'Wonderings'}`); return renderDetail(view, id, nav, false); }
      await archive([id]); nav.back();
      return toast('Archived', async () => { await unarchive([id]); nav.refresh(); });
    }
    if (el.closest('[data-delete]')) {
      await softDelete([id]); nav.back();
      return toast('Thought deleted', async () => { await restore([id]); nav.refresh(); });
    }
  };

  enableDrag(view.querySelector<HTMLElement>('#dSteps')!, async (ids) => { await reorderSteps(ids); });
}

const aiCard = (label: string, body: string, links = '') => `<section class="card ai-card">${label ? `<div class="label">${label}</div>` : ''}${body}${links ? `<div class="ai-links">${links}</div>` : ''}</section>`;

/** The AI card for this thought, from what's kept on it. */
function aiView(t: Thought, hasSteps: boolean, mode: ReturnType<typeof aiState>): string {
  if (mode === 'off') return '';
  if (mode === 'signed-out') return `<p class="hint ai-hint">AI helpers need you signed in. <button class="link" data-ai="signin">Sign in</button></p>`;
  const a = t.ai && t.ai.for === t.text ? t.ai : undefined;
  if (t.type === 'curiosity') {
    if (a?.kind === 'step' && a.text) return aiCard(a.next ? 'A next step' : 'A first step', `<p class="ai-p">${h(a.text)}</p>`, '<button class="btn-pill" data-ai="add">Add to steps</button><button class="link" data-ai="another">Another idea</button>');
    return hasSteps ? '<button class="link ai-next" data-ai="next">Suggest a next step</button>' : '';
  }
  if (!a || a.kind === 'step') return '';
  const save = a.saved ? '<span class="muted small">Saved ✓</span>' : '<button class="btn-pill" data-ai="save">Save to What I found</button>';
  if (a.kind === 'fact') return aiCard('Short answer', `<p class="ai-p">${h(a.text)}</p>`, `${save}<button class="link" data-ai="again">Ask again</button>`) + '<p class="hint ai-hint">A short take. Worth checking if it matters.</p>';
  if (a.kind === 'personal') return aiCard('This one’s yours to answer', `<p class="ai-p">No single right answer here. Things to weigh:</p><ul class="ai-u">${(a.points ?? []).map((p) => `<li>${h(p)}</li>`).join('')}</ul>${a.question ? `<p class="ai-p"><i>${h(a.question)}</i></p>` : ''}`, `${save}<button class="link" data-ai="move">Make it a Curiosity</button>`);
  return aiCard('Tell me a little more', `<p class="ai-p">${h(a.text)}</p><input class="field" id="aiMore" placeholder="A few more words" autocomplete="off" enterkeyhint="go">`, '<button class="btn-pill" data-ai="more">Ask</button>');
}

function stepRow(s: Step): string {
  const st = STATE[s.state];
  const body = editable(s)
    ? `<textarea class="step-in" data-step-in="${s.id}" rows="1" aria-label="Step" enterkeyhint="done">${h(s.text)}</textarea>`
    : `<span class="step-text">${h(s.text)}</span>`;
  const right = s.state === 'waiting'
    ? `<b class="st-m">Waiting · <button class="link" data-cancel="${s.id}">Cancel</button></b>`
    : s.state === 'removed'
    ? `<b class="st-m">Removed in Nudge · <button class="link" data-again="${s.id}">Send again</button></b>`
    : st
    ? `<b class="${st.cls}">${st.text}</b>`
    : `<button class="icon-btn sm" data-rm="${s.id}" aria-label="Remove step">${ICON.x}</button>`;
  return `<div class="step" data-id="${s.id}"><span class="grip" data-grip aria-hidden="true">${ICON.grip}</span>${body}${right}</div>`;
}

/** Drag a step by its handle to reorder. */
function enableDrag(list: HTMLElement, done: (ids: string[]) => void): void {
  let drag: HTMLElement | null = null; let startY = 0;
  list.addEventListener('pointerdown', (e) => {
    const g = (e.target as HTMLElement).closest('[data-grip]');
    if (!g) return;
    drag = g.closest<HTMLElement>('.step'); startY = e.clientY;
    drag!.classList.add('dragging'); g.setPointerCapture(e.pointerId); e.preventDefault();
  });
  list.addEventListener('pointermove', (e) => {
    if (!drag) return;
    drag.style.transform = `translateY(${e.clientY - startY}px)`;
    const rows = [...list.querySelectorAll<HTMLElement>('.step')].filter((r) => r !== drag);
    const after = rows.find((r) => { const b = r.getBoundingClientRect(); return e.clientY < b.top + b.height / 2; });
    const ref = after ?? null;
    if (ref !== drag.nextElementSibling) {
      const before = drag.getBoundingClientRect().top;
      list.insertBefore(drag, ref);
      startY += drag.getBoundingClientRect().top - before;
      drag.style.transform = `translateY(${e.clientY - startY}px)`;
    }
  });
  const end = () => {
    if (!drag) return;
    drag.classList.remove('dragging'); drag.style.transform = ''; drag = null;
    done([...list.querySelectorAll<HTMLElement>('.step')].map((r) => r.dataset.id!));
  };
  list.addEventListener('pointerup', end);
  list.addEventListener('pointercancel', end);
}
