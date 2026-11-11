// Thought details (Bible › Thoughts): type, text, note, category, steps with Nudge! states, Send, Archive, Delete.
import { db } from '../db/db';
import type { Step, StepState, Thought } from '../db/types';
import { addStep, archive, categories, editStep, markOpened, removeStep, reorderSteps, softDelete, stepsOf, unarchive, restore, updateThought } from '../logic/thoughts';
import { autogrow, h, ICON, toast } from './kit';

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
  if (opened) await markOpened(id);
  const t = await db.thoughts.get(id);
  if (!t || t.deletedAt) { nav.back(); return; }
  const [cats, steps] = await Promise.all([categories(), stepsOf(id)]);
  const drafts = steps.filter((s) => s.state === 'draft' && s.text.trim()).length;

  view.innerHTML = `
    <div class="sub-top detail-top"><button class="back" data-back>${ICON.back}<span>Back</span></button></div>
    <div class="tabs" role="tablist" aria-label="Type">
      <button role="tab" data-type="curiosity" aria-selected="${t.type === 'curiosity'}">Curiosity</button>
      <button role="tab" data-type="wondering" aria-selected="${t.type === 'wondering'}">Wondering</button>
    </div>
    <textarea class="title-edit serif" id="dText" rows="1" aria-label="Thought">${h(t.text)}</textarea>
    <label class="label" for="dNote" style="display:block;margin:18px 0 6px">${t.type === 'wondering' ? 'What I found' : 'Note'}</label>
    <textarea class="field area" id="dNote" rows="2" placeholder="${t.type === 'wondering' ? 'What you’ve learned so far…' : 'Add a note'}">${h(t.note ?? '')}</textarea>
    <div class="label" style="margin:18px 0 8px">Category</div>
    <div class="chips">${cats.map((c) => `<button type="button" class="chip" data-cat="${c.id}" aria-pressed="${c.id === t.categoryId}">${h(c.name)}</button>`).join('')}</div>
    <div class="label" style="margin:22px 0 4px">Next steps</div>
    <div class="steps" id="dSteps">${steps.map(stepRow).join('')}</div>
    <form class="add-step" id="dAdd"><input class="field" id="dNew" placeholder="Add a next step" aria-label="Add a next step" autocomplete="off" enterkeyhint="done"><button class="icon-btn" aria-label="Add step">${ICON.plus}</button></form>
    <div class="detail-actions">
      ${drafts ? `<button class="btn" type="button" data-send>Send ${drafts} step${drafts > 1 ? 's' : ''} to Nudge!</button>` : ''}
      <div class="quiet-row"><button class="link muted" type="button" data-archive>${t.archivedAt ? 'Restore from Archives' : 'Archive'}</button><span class="muted">·</span><button class="link muted" type="button" data-delete>Delete</button></div>
    </div>`;

  const text = view.querySelector<HTMLTextAreaElement>('#dText')!;
  const note = view.querySelector<HTMLTextAreaElement>('#dNote')!;
  autogrow(text); autogrow(note);
  text.addEventListener('input', () => { autogrow(text); void updateThought(id, { text: text.value }); });
  text.addEventListener('change', async () => { if (!text.value.trim()) { text.value = t.text; await updateThought(id, { text: t.text }); } if (matchMedia('(min-width: 768px)').matches) nav.refresh(); });
  text.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); text.blur(); } });
  note.addEventListener('input', () => { autogrow(note); void updateThought(id, { note: note.value || undefined }); });

  view.querySelector('#dAdd')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inp = view.querySelector<HTMLInputElement>('#dNew')!;
    if (!inp.value.trim()) return inp.focus();
    await addStep(id, inp.value);
    await renderDetail(view, id, nav, false);
    view.querySelector<HTMLInputElement>('#dNew')?.focus();
  });
  view.querySelectorAll<HTMLInputElement>('[data-step-in]').forEach((inp) => {
    inp.addEventListener('input', () => void editStep(inp.dataset.stepIn!, inp.value));
    inp.addEventListener('change', async () => { if (!inp.value.trim()) { await removeStep(inp.dataset.stepIn!); void renderDetail(view, id, nav, false); } });
  });

  view.onclick = async (e) => {
    const el = e.target as HTMLElement;
    if (el.closest('[data-back]')) return nav.back();
    const tb = el.closest<HTMLElement>('[data-type]');
    if (tb && tb.dataset.type !== t.type) {
      await updateThought(id, { type: tb.dataset.type as Thought['type'] });
      toast(`Moved to ${tb.dataset.type === 'curiosity' ? 'Curiosities' : 'Wonderings'}`);
      return renderDetail(view, id, nav, false);
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
      // Phase 7 builds the real handoff. Until then the steps stay here as drafts.
      return toast('Sending to Nudge! comes in a later update. Your steps are saved here.', undefined, 4000);
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

function stepRow(s: Step): string {
  const st = STATE[s.state];
  const body = editable(s)
    ? `<input class="step-in" data-step-in="${s.id}" value="${h(s.text)}" aria-label="Step">`
    : `<span class="step-text">${h(s.text)}</span>`;
  const right = st
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
