// One Video feed, no flash on a workflow switch (user, 2026-10-26: "one Video feed always, workflow only changes the bar"). The Video page
// (web ui/video/VideoPage.tsx) renders the feed once; only the bar below it is keyed by the workflow, so switching Create Video → Motion Control
// → Lip Sync → Extend → Create never unmounts the feed, its cards or a playing clip. The shared feed (useFeed) keeps the previous list on a
// scope or chip change until the new page lands (stale-while-revalidate), and the bars' code is preloaded so Suspense never shows on a switch.
// Run: npx tsx test/video-onefeed.test.ts   (no server, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
const WEB = path.resolve(import.meta.dirname, '../../web/src'); const src = (f: string) => fs.readFileSync(path.join(WEB, f), 'utf8');
const ok = (m: string) => console.log('ok ' + m);
const { staleView, videoScope, FILTER_DEFAULT } = await import('../../web/src/ui/next/feed/feedFilter.ts');
(globalThis as any).location ??= { origin: 'http://x' }; /* routeChunks resolves links against the page origin */
const { chunksFor } = await import('../../web/src/platform/routeChunks.ts').catch(() => ({ chunksFor: null as any }));

// ---- one shell, only the bar is keyed ----
const app = src('App.tsx');
assert.match(app, /<VideoPage workflowId=\{vwf\.id\} tools=\{tools\}><VideoWorkflowBar key=\{`vbar-\$\{vwf\.id\}`\}/, 'a workflow: its bar inside the Video page, keyed by the workflow');
assert.match(app, /<VideoPage workflowId="create" tools=\{tools\}><Comp key=\{path\}/, 'Create Video: the same Video page around Create’s bar');
assert.doesNotMatch(app, /<VideoPage key=/, 'the Video page itself has no key: React keeps it (and its feed) across workflows');
const page = src('ui/video/VideoPage.tsx');
assert.equal((page.match(/<VideoFeed\b/g) ?? []).length, 1, 'the page renders the feed once');
assert.ok(page.indexOf('<VideoFeed') < page.indexOf('<Suspense'), 'the feed sits outside the bar’s Suspense: a loading bar never hides it');
assert.match(page, /<Suspense fallback=\{null\}>\{children\}<\/Suspense>/);
assert.match(page, /L\.app\(\)/); assert.match(page, /L\.videoBar\(\)/, 'both bars are preloaded when the page is up');
ok('one Video page: the feed renders once, outside the keyed bar and its Suspense; both bar chunks preload');

// ---- the bars hand their part to the page's feed instead of rendering their own ----
for (const f of ['ui/video/VideoStudio.tsx', 'ui/video/VideoWorkflowBar.tsx']) { const s = src(f);
  assert.match(s, /const hosted = useHostedVideoFeed\(\{ jobs/, `${f}: hands its runs and actions to the page feed`);
  assert.match(s, /\{!hosted && <section className="vs-main"/, `${f}: renders a feed of its own only outside the Video page`); }
const slot = src('ui/video/videoFeedSlot.ts'); assert.match(slot, /useLayoutEffect\(\(\) => \{ set\?\.\(s\); \}\)/, 'handed before paint, so the switch shows the new bar’s actions at once');
assert.match(src('ui/video/videoDock.css'), /\.vs-bar\{display:contents\}/, 'the hosted bar adds no box (same layout as before)');
ok('Create Video and every workflow bar share the page’s one feed');

// ---- route prefetch: the Video page and the bar it needs ----
if (chunksFor) {
  assert.deepEqual(chunksFor('/video'), ['videoPage', 'app']); assert.deepEqual(chunksFor('/video?workflow=motion-control'), ['videoPage', 'videoBar']);
  ok('a Video link prefetches the page shell and its bar');
}

// ---- stale-while-revalidate: the previous list stays until the new page lands ----
let n = 0; const job = (o: any) => ({ id: `j${++n}`, status: 'done', input: {}, outputs: [{ url: `/files/j${n}.mp4` }], resultUrl: `/files/j${n}.mp4`, createdAt: n, ...o }) as any;
const list = [job({ toolId: 'h3-video' }), job({ toolId: 'h3-video' }), job({ toolId: 'motion-transfer' }), job({ toolId: 'upscale' })];
assert.deepEqual(staleView(list, FILTER_DEFAULT, null, videoScope('group:motion')).map((j) => j.toolId), ['motion-transfer'], 'a chip narrows the old list at once');
assert.equal(staleView(list, FILTER_DEFAULT, null, videoScope('all')).length, 4, 'All keeps every card');
assert.equal(staleView(list, FILTER_DEFAULT, null, videoScope('group:camera')).length, 4, 'nothing matches yet: the whole old list stays (dimmed), never an empty Loading…');
assert.deepEqual(staleView([], FILTER_DEFAULT, null, videoScope('all')), [], 'no list before: the first load may say Loading…');
const uf = src('ui/next/feed/useFeed.ts');
assert.doesNotMatch(uf, /items: \[\], next: null, total: 0, failed: null \} : \{\}\) \}\)\);\s*\n?\s*try/, 'a new scope no longer clears the list before the fetch');
assert.match(uf, /if \(!keep\) setSt\(s => \(\{ \.\.\.s, loading: true, error: '' \}\)\)/, 'a new scope keeps the items (and their key) until the answer');
assert.match(uf, /fresh \? st\.items : staleView\(st\.items, f, project, scope\)/); assert.match(uf, /stale: !fresh && st\.items\.length > 0/);
assert.match(src('ui/next/feed/ResultFeed.tsx'), /feed\.stale \? ' is-stale' : ''/, 'the grid dims while stale (Image and Video share it)');
assert.match(src('ui/next/feed/feed.css'), /\.ic-jfeed\.is-stale\{opacity:\.6;transition:opacity \.18s ease \.15s\}/, 'only if the answer takes more than a moment');
/* a bar swap brings the bar's own history: finished jobs the page already lists (or the filter leaves out) are no news, so no refetch */
assert.match(uf, /if \(!matches\(j, f, project, scope\)\) return true;/); assert.match(uf, /seenDone\.current = new Set\(now\)/);
ok('useFeed keeps the previous list on a scope or chip change (narrowed, dimmed after a moment); a bar swap triggers no refetch');
process.exit(0);
