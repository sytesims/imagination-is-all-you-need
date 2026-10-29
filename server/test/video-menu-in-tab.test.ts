// Video menu stays in the Video tab (user, 2026-10-26): "every button I click on this popup goes to a new page… shouldn't the rest also show
// all generations for video like Create Video does?" Every Video workflow and flow shortcut opens the Video page with its bar recipe and the
// shared video feed; only Direct a Shot leaves (to 3D) and says so; old /tools/<id> pages redirect in; the standalone screens are gone; the
// Video page has one feed always (2026-10-26), so a workflow with no videos of its own never shows a blank page.
// Run: npx tsx test/video-menu-in-tab.test.ts   (no server, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const { VIDEO_WORKFLOWS, VIDEO_FLOW_SHORTCUTS, VIDEO_PAGE, VIDEO_REDIRECTS, videoWorkflowHref, isPanelWorkflow } = await import('../src/shared/videoWorkflows.ts');
const { videoBarOf } = await import('../src/shared/videoBar.ts');
const { videoFeedOf } = await import('../src/shared/videoFeed.ts');
const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../web/src');
const ok = (m: string) => console.log('ok ' + m);

// 1. every menu workflow opens the Video page with a bar recipe and a feed of its own
const menu = VIDEO_WORKFLOWS.filter((w) => w.inMenu);
for (const w of menu) {
  const href = videoWorkflowHref(w.id); assert.ok(href.startsWith(VIDEO_PAGE), `${w.id} opens the Video page`);
  if (w.id !== 'create' && !isPanelWorkflow(w)) assert.ok(videoBarOf(w.id), `${w.id} has a bar recipe (renders in the Video bar)`); /* Stitch: its own panel in the same dock */
  assert.ok(videoFeedOf(w.id), `${w.id} has a video feed`);
}
ok(`${menu.length} menu workflows open in the Video tab with their bar and feed`);

// 2. flow shortcuts: all inside the Video tab except Direct a Shot, which says it opens 3D
for (const s of VIDEO_FLOW_SHORTCUTS) {
  if (s.id === 'direct-a-shot') { assert.equal(s.opensIn, '3D'); assert.ok(!s.href.startsWith(VIDEO_PAGE)); continue; }
  assert.ok(!s.opensIn, `${s.id} stays in the Video tab`); assert.ok(s.href.startsWith(VIDEO_PAGE), `${s.id} opens the Video page`);
  const wf = new URL(s.href, 'http://x').searchParams.get('workflow'); if (wf) assert.ok(videoBarOf(wf), `${s.id} → ${wf} has a bar recipe`);
  assert.ok(videoFeedOf(s.id), `${s.id} has a feed`);
}
const shell = fs.readFileSync(path.join(WEB, 'ui/Shell.tsx'), 'utf8');
assert.match(shell, /hm-opens-\$\{r\.key\}/, 'the menu row shows where Direct a Shot opens');
ok('flow shortcuts open in the Video tab; only Direct a Shot leaves, marked “3D”');

// 3. every old standalone page of a video workflow tool redirects into the Video page
for (const w of VIDEO_WORKFLOWS) for (const r of w.oldRoutes) assert.ok(VIDEO_REDIRECTS[r]?.startsWith(VIDEO_PAGE), `${r} redirects in`);
for (const id of ['object-swap', 'motion-transfer', 'restyle', 'reshoot', 'camera', 'photo-fx', 'upscale', 'h3-extend', 'footage-fx', 'reframe', 'remove-bg', 'sdr-hdr', 'fps-boost', 'depth-map', 'cutout', 'app-transition', 'app-ugc-ad', 'app-orbit-shot', 'app-anime-restyle', 'app-video-upscale'])
  assert.ok(VIDEO_REDIRECTS[`/tools/${id}`]?.startsWith(`${VIDEO_PAGE}?workflow=`), `/tools/${id} redirects to its workflow`);
ok('old /tools/<id> video pages redirect to /tools/h3-video?workflow=<id>');

// 4. the standalone screens are gone and nothing registers them
for (const f of ['tools/videoSwap/VideoSwapTool.tsx', 'tools/reshoot/ReshootTool.tsx', 'tools/reshoot/AnglesStart.tsx', 'ui/video/StudioGen.tsx']) assert.ok(!fs.existsSync(path.join(WEB, f)), `${f} removed`);
const idx = fs.readFileSync(path.join(WEB, 'tools/index.ts'), 'utf8'); assert.doesNotMatch(idx, /VideoSwapTool|ReshootTool/);
assert.doesNotMatch(fs.readFileSync(path.join(WEB, 'platform/routeChunks.ts'), 'utf8'), /VideoSwapTool|ReshootTool/);
ok('Object Swap / Motion Control / Restyle / Re-shoot standalone screens removed');

// 5. one Video feed always (user, 2026-10-26): no per-workflow feed, no switch, no empty-workflow fallback
const feed = fs.readFileSync(path.join(WEB, 'ui/video/VideoFeed.tsx'), 'utf8');
assert.doesNotMatch(feed, /fallback|Showing all your videos|ScopeSwitch|setAllWf/, 'no fallback chain and no This workflow / All videos switch');
// 2026-10-26 (b44a76d4 era): the scope became one module-level constant, every video (Filter › Type narrows it), so no workflow can reach it
const scopeAt = feed.search(/const SCOPE: FeedScope = videoScope\(ALL_VIDEO_FEED\);/); assert.ok(scopeAt >= 0, 'the feed scope is every video');
assert.ok(scopeAt < feed.indexOf('export default function VideoFeed'), 'the scope is fixed outside the component: the picked workflow never sets it');
assert.doesNotMatch(feed, /scope:\s*(?!SCOPE\b)[^,}]*workflowId|videoScope\(\s*(workflowId|barWf)/, 'the workflow never becomes the feed scope');
ok('every workflow shows the one Video feed (no empty-workflow fallback needed)');
process.exit(0);
