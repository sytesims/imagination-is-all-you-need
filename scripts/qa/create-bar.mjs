// Create bar height + scroll check (design audit 2026-10-23), run inside the app page in a real browser (the dev pane), not headless:
// layout needs a visible page (a hidden pane reports stale ResizeObserver sizes).
// Usage, on http://localhost:<web>/tools/create-image with a few results in the feed, at each width you want (1440, 1024, 375…):
//   const m = await import('/@fs/<repo>/scripts/qa/create-bar.mjs'); await m.run()
// It switches modes the way the app does (in-page navigation, the workflow chip's ✕), waits for the bar to settle, and reports:
//   heights: the bar (frame) height per mode, with and without a preset; equal = every mode the same height
//   scroll:  at the bottom of the feed, Relight → Create keeps the scroll position (no feed drop);
//            a 14-line prompt grows the bar upward by six lines (2 → 8, then it scrolls), and clearing it brings the bar back
//   toolbar: the feed toolbar above the results is one calm row (layout A, 2026-10-27): Project · Filter · pills · count on the left, queue ·
//            spend · Compare · Select on the right; no chip row, no Featured button; the Filter menu has Type (fd-type-*), From and Show
// Returns { ok, width, heights, equal, scroll, toolbar, problems }. Changes nothing on the server (no Generate).

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dock = () => document.querySelector('[data-testid=ic-dock]');
const frame = () => dock()?.querySelector('.ic-frame') ?? dock();
/** On phones the frame is display:contents: the dock is the box. */
const barH = () => { const f = frame(); const r = (f && f.getClientRects().length ? f : dock()).getBoundingClientRect(); return Math.round(r.height); };
const se = () => document.scrollingElement ?? document.documentElement;
const toBottom = () => se().scrollHeight - (se().scrollTop + se().clientHeight);
async function settle(test = () => true) {
  let last = -1, same = 0;
  for (let i = 0; i < 80 && same < 6; i++) { await sleep(60); const v = barH(); same = v === last && test() ? same + 1 : 0; last = v; }
  return last;
}
function go(search) { history.pushState(history.state, '', '/tools/create-image' + search); dispatchEvent(new PopStateEvent('popstate')); }
function setPrompt(text) {
  const ta = document.querySelector('#app-prompt'); if (!ta || ta.offsetParent === null) return false;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, text); ta.dispatchEvent(new Event('input', { bubbles: true })); return true;
}
/* the inputs at the start of the prompt line (2026-10-23 clean-up: the context row is gone) */
const mode = () => dock()?.querySelector('[data-testid=ic-lead]')?.getAttribute('data-mode');
const wfOn = () => dock()?.querySelector('[data-testid=wf-strip], [data-testid=wf-controls]')?.getAttribute('data-workflow') ?? '';
const presetOn = () => dock()?.querySelector('[data-testid=ic-preset-chip]')?.getAttribute('data-preset') ?? '';

const CASES = [
  ['Create', '?workflow=', () => mode() === 'create' && !presetOn()],
  ['Relight', '?workflow=relight', () => wfOn() === 'relight' && !presetOn()],
  ['Face Swap', '?workflow=face-swap', () => wfOn() === 'face-swap' && !presetOn()],
  ['Brush Edit', '?workflow=brush-edit', () => wfOn() === 'brush-edit' && !presetOn()],
  ['Upscale', '?workflow=upscale', () => wfOn() === 'upscale'],
  ['Camera & Lens', '?workflow=camera-lens', () => mode() === 'rig'],
  ['Create + preset', '?preset=rainy-neon-street', () => presetOn() === 'rainy-neon-street'],
  ['Relight + preset', '?workflow=relight&preset=painters-side-light', () => presetOn() === 'painters-side-light'],
  ['Face Swap + preset', '?workflow=face-swap&preset=film-match-swap', () => presetOn() === 'film-match-swap'],
  ['Brush Edit + preset', '?workflow=brush-edit&preset=sky-swap', () => presetOn() === 'sky-swap'],
  ['Product Shot + preset', '?workflow=product-shot&preset=cafe-counter', () => presetOn() === 'cafe-counter'],
];

export async function run() {
  const problems = []; const heights = {};
  if (!dock()) return { ok: false, problems: ['no Create bar on this page'] };
  /* a hidden pane paints no frames: no animation frame, no ResizeObserver, no prompt re-fit, so every size would be stale */
  const painting = await Promise.race([new Promise((r) => requestAnimationFrame(() => r(true))), sleep(500).then(() => false)]);
  if (document.visibilityState !== 'visible' || !painting) return { ok: false, width: innerWidth, problems: ['the page is not painting (hidden pane or tab): show it and run again'] };
  /* measure end states: the prompt's height transition would otherwise be caught half-way in a throttled pane */
  const calm = document.createElement('style'); calm.textContent = '.ic-dock *{transition:none!important}'; document.head.append(calm);
  try { const r = await measure(problems, heights); r.toolbar = await feedToolbar(problems); r.ok = problems.length === 0; return r; } finally { calm.remove(); }
}
/** The feed toolbar (ui/next/feed/FeedToolbar): one row on desktop; the old chip row and Featured button are gone; Filter › Type lists the tab's groups. */
export async function feedToolbar(problems = []) {
  const bar = document.querySelector('[data-testid=feed-toolbar]'); if (!bar) { problems.push('no feed toolbar'); return null; }
  const h = Math.round(bar.getBoundingClientRect().height);
  const out = { height: h, pills: document.querySelectorAll('[data-testid^=fd-pill-]:not([data-testid$=-x])').length, chipRow: !!document.querySelector('.vf-groups, [data-testid$=-groups]'), featuredButton: !!document.querySelector('[data-testid=fd-featured]'), types: [] };
  if (innerWidth > 700 && h > 34) problems.push(`feed toolbar is ${h}px tall: more than one row`);
  if (out.chipRow) problems.push('the old chip row is back'); if (out.featuredButton) problems.push('the old Featured button is back');
  const btn = document.querySelector('[data-testid=fd-filter]'); btn?.click(); await sleep(250);
  out.types = [...document.querySelectorAll('[data-testid^=fd-type-]')].map((b) => b.getAttribute('data-testid').slice(8));
  for (const id of ['fd-source-mine', 'fd-source-uploads', 'fd-source-featured', 'fd-show-all', 'fd-show-liked', 'fd-show-failed']) if (!document.querySelector(`[data-testid=${id}]`)) problems.push(`Filter menu: ${id} missing`);
  if (!out.types.includes('all')) problems.push('Filter menu: Type has no All');
  btn?.click(); await sleep(150);
  return out;
}
async function measure(problems, heights) {
  /* start from an empty Create prompt, so only the mode changes the bar */
  go('?workflow='); await settle(); dock().querySelector('[data-testid=ic-preset-clear]')?.click(); await settle(CASES[0][2]); setPrompt('');
  for (const [name, search, ready] of CASES) {
    go(search); await settle(ready); if (!ready()) problems.push(`${name}: did not open`);
    /* a workflow keeps its own draft prompt: empty it (a preset's template stays: it shows as the one-line subject row) */
    if (!presetOn() && setPrompt('')) await settle();
    heights[name] = barH();
  }
  const vals = Object.values(heights); const equal = vals.every((v) => v === vals[0]);
  if (!equal) problems.push(`bar heights differ: ${JSON.stringify(heights)}`);

  /* scroll at the bottom holds: Relight → Create (the workflow chip's ✕), and a tall prompt cleared */
  const scroll = {};
  go('?workflow=relight'); await settle(CASES[1][2]);
  se().scrollTop = se().scrollHeight; await sleep(300); const y0 = se().scrollTop;
  const x = dock().querySelector('.wf-chip-x'); if (x) x.click(); else go('?workflow=');
  await settle(() => mode() === 'create'); await sleep(700);
  scroll.relightToCreate = { before: y0, after: se().scrollTop, toBottom: toBottom() };
  if (Math.abs(se().scrollTop - y0) > 1) problems.push(`Relight → Create moved the feed by ${se().scrollTop - y0}px`);
  setPrompt(Array.from({ length: 14 }, (_, i) => `line ${i + 1} of a long prompt`).join('\n')); const tall = await settle();
  se().scrollTop = se().scrollHeight; await sleep(300); const y1 = se().scrollTop;
  setPrompt(''); const short = await settle(); await sleep(700);
  scroll.longPromptCleared = { tall, short, before: y1, after: se().scrollTop };
  /* the prompt grows with its text, 2 → 8 lines (shared/usePromptGrow): the bar grows upward by up to six 20px lines, and comes back
   * when the prompt is cleared; at the feed's end the page's scroll clamp keeps the last row just above the shorter bar */
  scroll.promptGrow = { tallBar: tall, shortBar: short, toBottom: toBottom() };
  if (innerWidth > 700 && tall - short !== 120) problems.push(`a 14-line prompt should grow the bar by six lines (120px), got ${tall - short}px`);
  if (toBottom() > 2) problems.push(`clearing a long prompt at the feed's end left ${toBottom()}px below`);
  return { ok: problems.length === 0, width: innerWidth, heights, equal, scroll, problems };
}
