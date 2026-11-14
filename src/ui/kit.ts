// Small UI helpers shared by every screen: escaping, icons, toast with Undo, bottom sheets.
export { escapeHTML as h } from '../lib/util';

const svg = (d: string, extra = '') => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" ${extra}>${d}</svg>`;
export const ICON = {
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'), // same as Nudge!'s Settings icon
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  grip: svg('<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/>', 'style="stroke-width:3"'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'),
  archive: svg('<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/>'),
  filter: svg('<path d="M4 6h16M7 12h10M10 18h4"/>'),
  all: svg('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8.5 12 2.5 2.5 4.5-5"/>'),
  restore: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  chev: svg('<path d="M9 6l6 6-6 6"/>'),
};

let toastTimer = 0;
/** One toast at a time, bottom of the screen. Undo runs the given function once. */
export function toast(msg: string, undo?: () => void | Promise<void>, ms = undo ? 5000 : 2600): void {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.innerHTML = `<span></span>${undo ? '<button type="button">Undo</button>' : ''}`;
  el.querySelector('span')!.textContent = msg;
  const btn = el.querySelector('button');
  if (btn && undo) btn.addEventListener('click', () => { hideToast(); void undo(); }, { once: true });
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(hideToast, ms);
}
export function hideToast(): void { document.getElementById('toast')?.classList.remove('show'); }

/** Bottom sheet (phone) / centred panel. Returns the sheet element; close() removes it. */
export function openSheet(html: string, onClose?: () => void): { el: HTMLElement; close: () => void } {
  const back = document.createElement('div');
  back.className = 'sheet-back';
  back.innerHTML = `<section class="sheet" role="dialog" aria-modal="true">${html}</section>`;
  document.body.appendChild(back);
  const el = back.querySelector<HTMLElement>('.sheet')!;
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    document.removeEventListener('keydown', onKey);
    back.classList.add('closing');
    setTimeout(() => back.remove(), 180);
    onClose?.();
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });
  // Swipe down to close (every sheet): drag the top bar, or anywhere once the sheet is scrolled to the top.
  let y0 = -1, dy = 0, dragging = false;
  el.addEventListener('touchstart', (e) => {
    const t = e.touches[0], top = t.clientY - el.getBoundingClientRect().top;
    if (e.touches.length > 1 || (el.scrollTop > 0 && top > 56)) return;
    if (top > 56 && (e.target as HTMLElement).closest('input, textarea, select, [contenteditable], .seg, .chips, .vc-review')) return;
    y0 = t.clientY; dy = 0; dragging = false;
  }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    if (y0 < 0) return;
    dy = e.touches[0].clientY - y0;
    if (!dragging && dy > 10 && el.scrollTop <= 0) { dragging = true; el.style.transition = 'none'; el.style.animation = 'none'; }
    if (!dragging) return;
    e.preventDefault();
    el.style.transform = `translateY(${Math.max(0, dy)}px)`;
    back.style.background = `rgb(0 0 0 / ${Math.max(0.05, 0.35 * (1 - dy / 400))})`;
  }, { passive: false });
  el.addEventListener('touchend', () => {
    if (y0 < 0) return;
    y0 = -1;
    if (!dragging) return;
    dragging = false;
    if (dy > 110) {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return close();
      el.style.transition = 'transform 180ms ease-in'; el.style.transform = 'translateY(100%)';
      setTimeout(close, 170);
    } else { el.style.transition = 'transform 160ms ease-out'; el.style.transform = ''; back.style.background = ''; }
  });
  return { el, close };
}

/** Grow a textarea to fit its text. */
export function autogrow(t: HTMLTextAreaElement): void {
  t.style.height = 'auto';
  t.style.height = `${t.scrollHeight + 2}px`;
}
