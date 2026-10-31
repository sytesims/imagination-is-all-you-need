// Actions that take you somewhere (2026-10-27 bug: Assets → viewer → Recreate stayed on Assets). Every result action from every surface goes
// through web/src/shared/goToWorkflow.ts (leave the viewer, push the job's workflow tab with ?recreate= / ?fromJob=, Back returns) and its links
// come from web/src/shared/workflowLinks.ts recreateHref / jobWorkflowHref (Image / Video / Audio / 3D tab + workflow).
// Root cause: the /jobs/:id viewer's close is history.back(), which is asynchronous; the viewer closed first and then pushed the tool page, and the
// late Back popped it again. This test runs the real navigate() against a fake browser history whose back() is asynchronous like a browser's.
// Run: npx tsx test/nav-actions.test.ts   (pure, no server)
import assert from 'node:assert/strict';
const ok = (m: string) => console.log('ok ' + m);

// ---------------- a fake browser: location, history (async back), popstate ----------------
const ORIGIN = 'http://app.test';
type Entry = { url: string; state: any };
const B = { entries: [{ url: '/', state: null }] as Entry[], ix: 0, pops: 0 };
const loc = { origin: ORIGIN, href: ORIGIN + '/', pathname: '/', search: '', hash: '' };
const setLoc = (url: string) => { const u = new URL(url, ORIGIN); Object.assign(loc, { href: u.href, pathname: u.pathname, search: u.search, hash: u.hash }); };
const listeners = new Set<(e: Event) => void>();
const fire = () => { B.pops++; for (const f of [...listeners]) f(new Event('popstate')); };
const hist = {
  get state() { return B.entries[B.ix].state; }, get length() { return B.entries.length; },
  pushState(state: any, _: string, url: string) { B.entries = B.entries.slice(0, B.ix + 1); B.entries.push({ url, state }); B.ix++; setLoc(url); },
  replaceState(state: any, _: string, url: string) { B.entries[B.ix] = { url, state }; setLoc(url); },
  /* like a browser: the traversal happens later, then popstate */
  back() { setTimeout(() => { if (B.ix > 0) { B.ix--; setLoc(B.entries[B.ix].url); fire(); } }, 0); },
};
Object.assign(globalThis as any, { location: loc, history: hist, addEventListener: (t: string, f: any) => t === 'popstate' && listeners.add(f), removeEventListener: (t: string, f: any) => listeners.delete(f),
  dispatchEvent: (e: Event) => { if (e.type === 'popstate') fire(); return true; }, PopStateEvent: class extends Event {} });
const reset = (urls: string[]) => { B.entries = urls.map((url, i) => ({ url, state: i ? { inApp: true } : null })); B.ix = urls.length - 1; setLoc(urls[B.ix]); };
const settle = () => new Promise(r => setTimeout(r, 20));
const here = () => loc.pathname + loc.search;

const { goToWorkflow, goClick, viewerInUrl } = await import('../../web/src/shared/goToWorkflow.ts');
const { recreateHref, jobWorkflowHref, workflowOpenOf, frameHandoffHref, lipSyncHandoffHref } = await import('../../web/src/shared/workflowLinks.ts');
const { sendTo3dHref } = await import('../src/shared/threeD.ts');

/** JobPage's close (platform/JobPage.tsx): Back when the viewer was opened in-app. */
const jobPageClose = () => { if ((history.state as any)?.inApp) history.back(); };
const TOOLS = [{ id: 'create-image', route: '/tools/create-image' }, { id: 'h3-video', route: '/video' }, { id: 'audio', route: '/tools/audio' }, { id: 'voice', route: '/tools/voice' },
  { id: 'three-d', route: '/tools/3d' }, { id: 'soundtrack', route: '/tools/soundtrack' }, { id: 'h3-extend', route: '/tools/h3-extend' }, { id: 'app-relight', route: '/tools/app-relight' }];
const params = (u: string) => Object.fromEntries(new URL(u, ORIGIN).searchParams);

// ---------------- 1. the links: every kind of job goes to its tab + workflow ----------------
const JOBS: [string, { id: string; toolId: string; input?: any }, string][] = [
  ['image (Create Image)', { id: 'i1', toolId: 'create-image', input: {} }, '/tools/create-image?recreate=i1'],
  ['image workflow (Relight)', { id: 'i2', toolId: 'app-relight' }, '/tools/create-image?workflow=relight&recreate=i2'],
  ['image Camera & Lens', { id: 'i3', toolId: 'create-image', input: { camera: { body: 'x' } } }, '/tools/create-image?workflow=camera-lens&recreate=i3'],
  ['video (Create Video)', { id: 'v1', toolId: 'h3-video', input: {} }, '/video?recreate=v1'],
  ['video workflow (Extend)', { id: 'v2', toolId: 'h3-extend' }, '/video?workflow=extend&recreate=v2'],
  ['video Lip Sync (voice:lipsync)', { id: 'v3', toolId: 'voice', input: { types: ['lipsync'] } }, '/video?workflow=lip-sync&mode=lipsync&recreate=v3'],
  ['audio Music', { id: 'a1', toolId: 'audio', input: { types: ['music'] } }, '/tools/audio?workflow=music&recreate=a1'],
  ['audio Sound effects (was: Music)', { id: 'a2', toolId: 'audio', input: { types: '["sfx"]' } }, '/tools/audio?workflow=sfx&recreate=a2'],
  ['audio Change voice (was: Voiceover)', { id: 'a3', toolId: 'voice', input: { types: ['change-voice'] } }, '/tools/audio?workflow=change-voice&recreate=a3'],
  ['audio Translate', { id: 'a4', toolId: 'voice', input: { mode: 'translate' } }, '/tools/audio?workflow=translate&recreate=a4'],
  ['audio Sound for a video (was: Music for a video)', { id: 'a5', toolId: 'soundtrack', input: { types: ['v2s'] } }, '/tools/audio?workflow=soundtrack-sound&recreate=a5'],
  ['audio, no mode', { id: 'a6', toolId: 'audio', input: {} }, '/tools/audio?workflow=music&recreate=a6'],
  ['3D Image to 3D (had no Recreate)', { id: 'd1', toolId: 'three-d', input: { imageUrl: '/files/x.png' } }, '/tools/3d?workflow=image-to-3d&recreate=d1'],
  ['3D turntable', { id: 'd2', toolId: 'three-d-turntable' }, '/tools/3d?workflow=turntable&recreate=d2'],
  ['3D mockup', { id: 'd3', toolId: 'plan-a-shot' }, '/tools/3d?workflow=plan-a-shot&recreate=d3'],
  ['other tool, from the tool list', { id: 'o1', toolId: 'reframe' }, '/video?workflow=reframe&recreate=o1'],
];
for (const [what, job, want] of JOBS) assert.equal(recreateHref(job, TOOLS), want, what);
assert.equal(recreateHref({ id: '', toolId: 'audio' }), null, 'no id, no Recreate');
assert.equal(recreateHref({ id: 'x1', toolId: 'unknown-tool' }), '/tools/unknown-tool?recreate=x1', 'an unknown tool keeps its own page');
ok(`${JOBS.length} kinds of job: Recreate opens its tab and workflow`);
// Canvas "Open in tool" with no finished job: the same tabs
assert.equal(workflowOpenOf({ toolId: 'voice', input: { types: ['lipsync'] } }), '/video?workflow=lip-sync&mode=lipsync', 'Canvas Lip Sync → Video (was: Audio Voiceover)');
assert.equal(workflowOpenOf({ toolId: 'audio', input: { types: ['sfx'] } }), '/tools/audio?workflow=sfx');
assert.equal(workflowOpenOf({ toolId: 'three-d' }), '/tools/3d?workflow=image-to-3d');
assert.equal(workflowOpenOf({ toolId: 'h3-video' }), '/video');
assert.equal(jobWorkflowHref({ toolId: 'create-image', input: {} }), null);
ok('Canvas Open in tool: the same workflow tabs');

// ---------------- 2. the navigation, from a surface outside the target tab ----------------
/** A click on a viewer action: the viewer's go() (shared/ResultView.tsx) is goClick(href, onClose) → goToWorkflow(href, onClose). */
async function fromUrlViewer(open: string[], href: string, label: string) {
  reset(open); const viewer = here(); let closed = 0; const close = () => { closed++; jobPageClose(); };
  assert.ok(viewerInUrl(), `${label}: the viewer is in the URL`);
  goToWorkflow(href, close); await settle();
  assert.equal(here(), href.replace(/#.*$/, ''), `${label}: lands on the workflow (not back on ${open[0]})`);
  assert.equal(closed, 0, `${label}: the URL viewer is left by the push, never closed by history.back()`);
  // Back: to the viewer over the page it came from, then the page
  history.back(); await settle(); assert.equal(here(), viewer, `${label}: Back reopens the viewer`);
  jobPageClose(); await settle(); assert.equal(here(), open[open.length - 2], `${label}: closing it returns to ${open[open.length - 2]}`);
}
const A = (id: string) => ['/', '/assets', `/jobs/${id}`];
await fromUrlViewer(A('v2'), recreateHref({ id: 'v2', toolId: 'h3-extend' }, TOOLS)!, 'Assets → Video Recreate');
await fromUrlViewer(['/', '/profile', '/jobs/i1'], recreateHref({ id: 'i1', toolId: 'create-image', input: {} }, TOOLS)!, 'Profile → Image Recreate');
await fromUrlViewer(A('a2'), recreateHref({ id: 'a2', toolId: 'audio', input: { types: ['sfx'] } }, TOOLS)!, 'Assets → Audio (Sound effects) Recreate');
await fromUrlViewer(A('d1'), recreateHref({ id: 'd1', toolId: 'three-d' }, TOOLS)!, 'Assets → 3D Recreate');
await fromUrlViewer(A('v1'), frameHandoffHref('v1', 0, 'last'), 'Assets → Continue (last frame)');
await fromUrlViewer(A('v1'), frameHandoffHref('v1', 0, 2.5, true), 'Assets → Use frame');
await fromUrlViewer(A('a1'), lipSyncHandoffHref('a1', 0), 'Assets → Make it talk');
await fromUrlViewer(A('i1'), sendTo3dHref('i1', 0), 'Assets → Send to 3D');
await fromUrlViewer(A('i1'), '/tools/create-image?fromJob=i1&out=0&as=ref', 'Assets → Reference');
await fromUrlViewer(['/', '/spend', '/jobs/v1'], '/video?workflow=extend&fromJob=v1&out=0', 'Spend → Extend');
await fromUrlViewer(['/', '/assets', '/jobs/f1'], '/video?recreate=f1', 'Assets → failed run → Change settings');
ok('URL viewer (Assets, Profile, Spend → /jobs/:id): every action lands on its workflow; Back reopens the viewer, then the page');

// Feed viewers use ?view and their own ohfView history entry, rather than /jobs/:id.
// Exercise the real click handler used by both the Turn-to-video link and the Extend menu buttons.
for (const n of [5, 10]) {
  reset(['/', '/video', '/video?view=v1']);
  B.entries[B.ix].state = { inApp: true, ohfView: true };
  const viewerUrl = here(); let closed = 0; let prevented = false;
  const closeFeed = () => { closed++; history.back(); };
  goClick(`/tools/h3-extend?fromJob=v1&out=0&ext=${n}`, closeFeed)({ button: 0, preventDefault() { prevented = true; } } as any);
  await settle();
  assert.equal(prevented, true);
  assert.equal(closed, 0, `Extend +${n}: a URL feed viewer is left by navigation, not history.back`);
  assert.equal(here(), `/video?workflow=extend&fromJob=v1&out=0&ext=${n}`, `Extend +${n}: retains workflow, source and length after async history settles`);
  history.back(); await settle();
  assert.equal(here(), viewerUrl, `Extend +${n}: Back restores the source viewer`);
  closeFeed(); await settle();
  assert.equal(here(), '/video', `Extend +${n}: Close then returns to the source feed`);
}
{
  reset(['/', '/tools/create-image?model=flux-3-image', '/tools/create-image?model=flux-3-image&view=i1']);
  B.entries[B.ix].state = { inApp: true, ohfView: true };
  const source = here(); let closed = 0;
  goClick('/video?fromJob=i1&as=image&out=0', () => { closed++; history.back(); })({button: 0, preventDefault() {}} as any);
  await settle(); assert.equal(here(), '/video?fromJob=i1&as=image&out=0'); assert.equal(closed, 0);
  history.back(); await settle(); assert.equal(here(), source, 'Turn to video: Back restores the Image viewer including its model');
}
ok('feed URL viewer click actions: Extend +5/+10 and Turn to video preserve handoff inputs and Back history');


// A viewer held in page state (the Image / Video feed's): closed first, then the push; on its own tab too (same path → popstate re-reads the query)
{ reset(['/', '/tools/create-image']); let open = true; let pops = 0; const f = () => { pops++; }; addEventListener('popstate', f);
  goToWorkflow('/tools/create-image?workflow=relight&recreate=i2', () => { open = false; }); await settle(); removeEventListener('popstate', f);
  assert.equal(open, false, 'the feed viewer closes'); assert.equal(here(), '/tools/create-image?workflow=relight&recreate=i2'); assert.equal(pops, 1, 'one popstate: the open page re-reads the query once');
  history.back(); await settle(); assert.equal(here(), '/tools/create-image', 'Back returns to the feed'); }
{ reset(['/', '/video']); let open = true; goToWorkflow(recreateHref({ id: 'a3', toolId: 'voice', input: { types: ['change-voice'] } }, TOOLS)!, () => { open = false; }); await settle();
  assert.equal(open, false); assert.equal(here(), '/tools/audio?workflow=change-voice&recreate=a3', 'Video feed → Audio Recreate'); }
ok('state viewer (feeds): closes, then goes; same-tab targets fire one popstate');

// Explore / Canvas (no viewer): a plain push; old tool paths are rewritten to their tab before the push (the page listening sees the final URL)
{ reset(['/']); goToWorkflow('/tools/voice?mode=translate&recreate=a4'); await settle(); assert.equal(here(), '/tools/audio?workflow=translate&recreate=a4', 'an old Audio path lands on its workflow');
  reset(['/', '/canvas']); goToWorkflow(withSearch(workflowOpenOf({ toolId: 'three-d' }), 'recreate=d1')); await settle(); assert.equal(here(), '/tools/3d?workflow=image-to-3d&recreate=d1', 'Canvas → 3D');
  history.back(); await settle(); assert.equal(here(), '/canvas', 'Back returns to Canvas'); }
ok('Explore / Canvas: a push to the tab, Back returns');

// The race itself, for the record: closing a URL viewer first (the old code) lands back on Assets
{ reset(A('v2')); jobPageClose(); (await import('../../web/src/platform/router.tsx')).navigate('/video?workflow=extend&recreate=v2'); await settle();
  assert.notEqual(here(), '/video?workflow=extend&recreate=v2', 'old behaviour: close (history.back) then push loses the push');
  ok(`old behaviour reproduced: ended on ${here()}`); }
assert.deepEqual(params(recreateHref({ id: 'v2', toolId: 'h3-extend' })!), { workflow: 'extend', recreate: 'v2' });
function withSearch(to: string, s: string) { return to.includes('?') ? `${to}&${s}` : `${to}?${s}`; }
console.log('nav-actions: all ok');
