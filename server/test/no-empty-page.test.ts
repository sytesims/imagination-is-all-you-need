// No separate empty page (user, 2026-10-27): Image, Video and Audio always render the normal feed. A fresh install's examples are ordinary
// results in the Examples project (2026-10-29); a filter that matches nothing gets one quiet line, never a page.
// Run: npx tsx test/no-empty-page.test.ts   (no server, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
import { feedView, FILTER_DEFAULT, isDefaultQuery, emptyTextFor, videoScope } from '../../web/src/ui/next/feed/feedFilter.ts';
const ok = (m: string) => console.log('ok ' + m);
const WEB = path.resolve(import.meta.dirname, '../../web/src'); const src = (f: string) => fs.readFileSync(path.join(WEB, f), 'utf8');

// ---- the one rule (feedFilter feedView) ----
assert.equal(feedView({ count: 1, loading: false }), 'cards', 'results: cards');
assert.equal(feedView({ count: 0, loading: true }), 'loading');
assert.equal(feedView({ count: 0, loading: false }), 'hint', 'nothing to show: one quiet line (a fresh install has its Examples project, so no starter view)');
assert.ok(!isDefaultQuery({ ...FILTER_DEFAULT, show: 'liked' }, null)); assert.match(emptyTextFor({ ...FILTER_DEFAULT, show: 'liked' }, null, videoScope('all')), /No liked/);
ok('feedView: cards, else one quiet line');

// ---- the shared frame renders it; no page renders a separate empty screen ----
const rf = src('ui/next/feed/ResultFeed.tsx');
assert.match(rf, /feedView\(/, 'FeedGallery decides with feedView'); assert.doesNotMatch(rf, /FeaturedCard|useStarterPack|fd-starter/, 'no starter cards: examples are ordinary results (the Examples project)');
assert.match(rf, /export function FeedHint/, 'one shared one-line hint'); assert.doesNotMatch(rf, /\bempty\?: ReactNode/, 'no page-supplied empty screen');
for (const p of ['ui/next/ImageCanvas.tsx', 'ui/video/VideoFeed.tsx', 'ui/video/VideoStudio.tsx', 'ui/video/VideoWorkflowBar.tsx', 'ui/video/VideoPage.tsx', 'ui/audio/AudioPage.tsx', 'ui/audio/AudioFeed.tsx']) {
  const s = src(p);
  assert.doesNotMatch(s, /EmptyState|show up here|ic-hero|vs-empty|ap-empty|showWork/, `${p}: no separate empty page`);
}
assert.match(src('ui/audio/AudioFeed.tsx'), /<FeedGallery\b/, 'Audio uses the same feed frame (its one-line hint inside the feed)');
assert.ok(!fs.existsSync(path.join(WEB, 'shared/EmptyState.tsx')) && !fs.existsSync(path.join(WEB, 'shared/emptyState.css')), 'EmptyState removed');
ok('Image, Video and Audio always render the normal feed; EmptyState and the Image hero are gone');
