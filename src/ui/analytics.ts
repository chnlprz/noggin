// Analytics screen (Bible › Analytics): shows patterns, never scores you.
import { stats, type Range } from '../logic/analytics';
import { h, ICON } from './kit';

let range: Range = 'week';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SLOTS = ['Morning', 'Afternoon', 'Evening', 'Night'];

export async function renderAnalytics(view: HTMLElement, nav: { back: () => void; open: (id: string) => void }): Promise<void> {
  const s = await stats(range);
  const head = `<div class="sub-top"><button class="back" data-back>${ICON.back}<span>Analytics</span></button></div><h1 class="serif an-title">Analytics</h1>`;
  if (!s.ready) {
    view.innerHTML = `${head}<p class="empty">Come back in a few days to see your patterns.</p>`;
    view.onclick = (e) => { if ((e.target as HTMLElement).closest('[data-back]')) nav.back(); };
    return;
  }
  const pct = s.action.curiosities ? Math.round((s.action.withSent / s.action.curiosities) * 100) : 0;
  const wMax = Math.max(1, ...s.weeks.map((w) => Math.max(w.curiosity, w.wondering)));
  const cMax = Math.max(1, ...s.cats.map((c) => c.n));
  const gMax = Math.max(1, ...s.grid.flat());
  const scope = { week: 'this week', month: 'this month', all: 'all time' }[range];

  view.innerHTML = `${head}
    <div class="seg an-range" role="group" aria-label="Range">${(['week', 'month', 'all'] as Range[]).map((r) => `<button type="button" data-range="${r}" aria-pressed="${range === r}">${{ week: 'This week', month: 'Month', all: 'All time' }[r]}</button>`).join('')}</div>

    <div class="an-stats">
      <div class="an-stat"><b>${s.caught}</b><span>Thoughts caught</span>${range !== 'all' ? `<i>${s.caughtAll} all time</i>` : ''}</div>
      <div class="an-stat"><b>${s.revisited}</b><span>Revisited</span></div>
      <div class="an-stat"><b>${s.sent}</b><span>Steps sent</span></div>
      <div class="an-stat"><b>${s.done}</b><span>Done in Nudge!</span></div>
    </div>

    <section class="an-card"><div class="an-h"><span>Idea to action</span><span class="muted small">${s.action.withSent} of ${s.action.curiosities} curiosities</span></div>
      <div class="meter"><i style="width:${pct}%"></i></div>
      <p class="hint">${s.action.curiosities ? `${pct}% have a step in Nudge!${s.action.withDone ? `, ${s.action.withDone} with a step done` : ''}.` : `No curiosities ${scope} yet.`}</p></section>

    <section class="an-card"><div class="an-h"><span>Curious vs wondering</span><span class="legend"><i class="k-c"></i>Curiosities <i class="k-w"></i>Wonderings</span></div>
      <div class="weeks">${s.weeks.map((w) => `<div class="wk" title="${w.label}: ${w.curiosity} curiosities, ${w.wondering} wonderings"><div class="wk-bars"><i class="k-c" style="height:${(w.curiosity / wMax) * 100}%"></i><i class="k-w" style="height:${(w.wondering / wMax) * 100}%"></i></div><span>${w.label.split(' ')[1]}</span></div>`).join('')}</div>
      <p class="hint">Weeks start Sunday · last 8 weeks</p></section>

    <section class="an-card"><div class="an-h"><span>Where your mind goes</span></div>
      ${s.cats.length ? s.cats.map((c) => `<div class="brow"><span>${h(c.name)}</span><div class="meter"><i style="width:${(c.n / cMax) * 100}%"></i></div><b>${c.n}</b></div>`).join('') : `<p class="hint">No thoughts ${scope} yet.</p>`}</section>

    <section class="an-card"><div class="an-h"><span>When you think</span></div>
      <div class="hm"><span></span>${DAYS.map((d) => `<span class="hm-d">${d[0]}</span>`).join('')}
      ${SLOTS.map((sl, i) => `<span class="hm-s">${sl}</span>${DAYS.map((d, j) => { const n = s.grid[j][i]; return `<i title="${d} ${sl.toLowerCase()}: ${n}" style="opacity:${n ? 0.25 + (n / gMax) * 0.75 : 0.08}"></i>`; }).join('')}`).join('')}</div>
      <p class="hint">Darker means more thoughts caught then.</p></section>

    <section class="an-card"><div class="an-h"><span>Deepest rabbit holes</span></div>
      ${s.holes.length ? s.holes.map((x) => `<button class="an-row" data-open="${x.t.id}"><span>${h(x.t.text)}</span><span class="muted small">${x.opens} visit${x.opens === 1 ? '' : 's'} · ${x.steps} step${x.steps === 1 ? '' : 's'}</span></button>`).join('') : '<p class="hint">Revisit a thought to start one.</p>'}</section>

    <section class="an-card"><div class="an-h"><span>Waiting longest</span></div>
      ${s.waiting.length ? s.waiting.map((t) => `<button class="an-row" data-open="${t.id}"><span>${h(t.text)}</span><span class="muted small">${Math.max(1, Math.round((Date.now() - Date.parse(t.createdAt)) / 864e5))} days, no steps</span></button>`).join('') : '<p class="hint">Every curiosity has a step. Nice and tidy.</p>'}</section>
    <p class="hint" style="text-align:center;margin:18px 0 0">Counted on this device only.</p>`;

  view.onclick = (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-back]')) return nav.back();
    const r = t.closest<HTMLElement>('[data-range]');
    if (r) { range = r.dataset.range as Range; return void renderAnalytics(view, nav); }
    const o = t.closest<HTMLElement>('[data-open]');
    if (o) nav.open(o.dataset.open!);
  };
}
