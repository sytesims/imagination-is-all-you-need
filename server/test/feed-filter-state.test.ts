// Result feed filter, client rules (2026-10-25): which of the page's live jobs join the server list (never a trashed one, never an old failed one,
// in either order: the "deleted clips come back with Oldest" bug), the count they add, the chip's count and screen-reader words, the filter
// saved per tab, and the failed card's money sentence for policy refusals (Seedance: Comfy doesn't bill them).
// Run: npx tsx test/feed-filter-state.test.ts   (no server, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
import { liveExtras, activeCount, activePills, filterSummary, parseSavedFilter, migrateSavedFilter, savedFilterText, groupOfWorkflow, serverParams, matches, emptyTextFor, isDefaultQuery, staleView, videoScope, imageScope, FILTER_DEFAULT, FEED_STATUS, type FeedFilter, type ExtrasCtx } from '../../web/src/ui/next/feed/feedFilter.ts';
import { failView } from '../../web/src/shared/failureReasons.ts';
import { policyRefusalCharge } from '../src/shared/policyBilling.ts';
const ok = (m: string) => console.log('ok ' + m);
const V = { toolId: 'h3-video', media: 'video' as const };
const AT = 1_000_000; const SINCE = 900_000;
const job = (id: string, status: string, createdAt: number, extra: Record<string, unknown> = {}) => ({ id, status, toolId: 'h3-video', createdAt, updatedAt: createdAt + 1000, input: { prompt: id }, ...extra }) as any;
const ctx = (f: Partial<FeedFilter> = {}, c: Partial<ExtrasCtx> = {}): ExtrasCtx => ({ seen: new Set(['s1', 's2']), at: AT, hasMore: false, since: SINCE, gone: new Set(), f: { ...FILTER_DEFAULT, ...f }, project: null, scope: V, patch: {}, ...c });
const ids = (r: { jobs: any[] }) => r.jobs.map((j) => j.id || '(placeholder)');

// ---- the bug: Oldest, last page in, the page still holds trashed and old failed clips ----
const live = [job('s1', 'done', 10), job('s2', 'done', 20), job('trashed', 'done', 30, { deletedAt: 999 }), job('oldfail', 'failed', 40), job('oldblock', 'blocked', 50), job('gone', 'done', 60), job('cancel', 'canceled', 70)];
for (const sort of ['old', 'new'] as const) for (const hasMore of [false, true]) {
  const r = liveExtras(live, ctx({ sort }, { hasMore, gone: new Set(['gone']) })); assert.deepEqual(ids(r), [], `${sort} hasMore=${hasMore}: nothing the server left out comes back`); assert.equal(r.counted, 0); }
ok('Newest and Oldest: a trashed clip (deletedAt or deleted here), an old failed / blocked run and an old canceled run never join the list');

// ---- what does join ----
const fresh = [job('running', 'running', 50), { id: '', status: 'queued', clientKey: 'ph' } as any, job('newdone', 'done', AT + 10), job('justfailed', 'failed', 500, { updatedAt: SINCE + 5 }), job('newtrashed', 'done', AT + 20, { deletedAt: AT + 30 })];
assert.deepEqual(ids(liveExtras(fresh, ctx({ sort: 'new' }))), ['running', '(placeholder)', 'newdone', 'justfailed']);
assert.deepEqual(ids(liveExtras(fresh, ctx({ sort: 'old' }, { hasMore: false }))), ['running', '(placeholder)', 'newdone', 'justfailed'], 'Oldest, last page in: the new result goes at the end');
assert.deepEqual(ids(liveExtras(fresh, ctx({ sort: 'old' }, { hasMore: true }))), ['running', '(placeholder)', 'justfailed'], 'Oldest with more pages: a new result waits for its page');
assert.equal(liveExtras(fresh, ctx({ sort: 'new' })).counted, 3, 'counted: placeholder + new result + this visit\'s failure (the running run was in the server total)');
ok('joins: runs going, a placeholder, a result made after the list loaded, a run that failed during this visit; never a trashed one');

// ---- filters still apply to live jobs ----
assert.deepEqual(ids(liveExtras(fresh, ctx({ show: 'liked' }))), ['(placeholder)'], 'Liked: no unliked live job');
assert.deepEqual(ids(liveExtras([...fresh, job('likednew', 'done', AT + 40, { favourite: true })], ctx({ show: 'liked' }))), ['(placeholder)', 'likednew']);
assert.deepEqual(ids(liveExtras(fresh, ctx({ show: 'failed' }))), ['(placeholder)'], 'Failed: a failure from before the list loaded is already in the server list (or left out on purpose)');
assert.deepEqual(ids(liveExtras([job('failedafter', 'failed', 500, { updatedAt: AT + 50 })], ctx({ show: 'failed' }))), ['failedafter'], 'Failed: a run that failed after the list loaded joins');
assert.deepEqual(ids(liveExtras(fresh, ctx({ q: 'newdone' }))), ['(placeholder)', 'newdone'], 'search');
assert.deepEqual(ids(liveExtras([job('other', 'running', 50, { toolId: 'create-image' })], ctx())), [], 'another tool\'s run stays out of a one-tool feed');
assert.deepEqual(ids(liveExtras([job('inP', 'done', AT + 10, { projectId: 'p1' }), job('noP', 'done', AT + 10)], ctx({}, { project: 'p1' }))), ['inP'], 'project');
ok('Liked, Failed, search, tool and project apply to live jobs too');

// ---- the main feed's server status: finished + running, never failed (they sit under Show: Failed) ----
assert.equal(FEED_STATUS, 'done,queued,running,needs_decision');
const uf = fs.readFileSync(path.resolve(import.meta.dirname, '../../web/src/ui/next/feed/useFeed.ts'), 'utf8');
assert.match(uf, /liveExtras\(/, 'useFeed uses liveExtras'); assert.doesNotMatch(uf, /!st\.next && f\.sort === 'old'/, 'the old "every live job once the last page is in" rule is gone');
assert.match(fs.readFileSync(path.resolve(import.meta.dirname, '../../web/src/shared/useJobs.ts'), 'utf8'), /deletedAt/, 'useJobs drops jobs the poll says are trashed');
ok('main feed asks for finished and running runs; the page drops trashed jobs from its poll');

// ---- one model (2026-10-27, layout A): Type × From × Show; Type and Show only apply to your own results ----
const VA = videoScope('all'); const IA = imageScope('all'); const F = (o: Partial<FeedFilter>): FeedFilter => ({ ...FILTER_DEFAULT, ...o });
assert.deepEqual(FILTER_DEFAULT, { group: 'all', source: 'mine', show: 'all', q: '', sort: 'new', size: 'medium' }); assert.ok(!('kind' in FILTER_DEFAULT), 'kind is gone');
assert.deepEqual(serverParams(F({ group: 'group:motion', show: 'liked' }), 'p1', VA), { videoFeed: 'group:motion', liked: '1', order: 'desc', project: 'p1' }, 'Type narrows the tab feed; Liked; project');
assert.deepEqual(serverParams(F({ group: 'group:edit', show: 'failed', sort: 'old' }), null, IA), { imageFeed: 'group:edit', status: 'failed,blocked', order: 'asc' });
assert.deepEqual(serverParams(F({ source: 'featured', group: 'group:motion', show: 'liked', q: 'fox' }), 'p1', VA), { featured: '1', media: 'video', status: 'done', q: 'fox', order: 'desc' }, 'Featured ignores Type, Show and project');
assert.equal(serverParams(F({ source: 'uploads', group: 'group:edit' }), null, IA).imageFeed, 'group:uploads', 'Uploads: no jobs (the page reads the media library)');
assert.deepEqual(serverParams(F({ group: 'group:motion' }), null, videoScope('group:camera')), { videoFeed: 'group:motion', order: 'desc' }, 'Type wins over a fixed scope');
assert.equal(serverParams(F({ group: 'group:motion' }), null, { toolId: 'h3-video', media: 'video' }).toolId, 'h3-video', 'a one-tool scope keeps its tool');
const mt = job('mt', 'done', 5, { toolId: 'motion-transfer', outputs: [{ url: '/files/m.mp4' }] }); const h3 = job('h3', 'done', 6, { outputs: [{ url: '/files/h.mp4' }], favourite: true });
assert.equal(matches(mt, F({ group: 'group:motion' }), null, VA), true); assert.equal(matches(h3, F({ group: 'group:motion' }), null, VA), false);
assert.equal(matches(h3, F({ group: 'group:create', show: 'liked' }), null, VA), true); assert.equal(matches(mt, F({ show: 'liked' }), null, VA), false);
assert.equal(matches({ ...h3, featured: true }, F({ source: 'featured', group: 'group:motion' }), null, VA), true, 'Featured: Type is greyed out, not applied');
assert.equal(matches(h3, F({ source: 'uploads' }), null, VA), false, 'Uploads hold no jobs');
assert.deepEqual(staleView([mt, h3], F({ group: 'group:motion' }), null, VA).map((j) => j.id), ['mt'], 'stale view narrows by Type');
assert.equal(emptyTextFor(F({ group: 'group:motion', show: 'liked' }), null, VA), 'No favourite motion videos yet. Tap the heart on any result to keep it here.');
assert.equal(emptyTextFor(F({ group: 'group:upscale' }), 'p', IA), 'No upscaled images in this project yet.'); assert.equal(emptyTextFor(F({ q: 'fox', group: 'group:motion' }), null, VA), 'Nothing matches “fox” in Motion.');
assert.match(emptyTextFor(F({ source: 'featured', group: 'group:motion' }), null, VA), /^Nothing featured yet/); assert.equal(emptyTextFor(F({ show: 'failed' }), null, VA), 'No failed runs.');
assert.equal(isDefaultQuery(FILTER_DEFAULT, null), true); assert.equal(isDefaultQuery(F({ group: 'group:edit' }), null), false); assert.equal(isDefaultQuery(F({ source: 'uploads' }), null), false);
ok('Type × From × Show: server params, live matches, stale view and empty words; Featured / Uploads leave Type and Show out');

// ---- pills and the Filter count (Grid size is a view choice, not a filter) ----
assert.equal(activeCount(FILTER_DEFAULT), 0); assert.equal(activeCount(F({ size: 'large' })), 0, 'grid size is not a filter'); assert.equal(activeCount(F({ q: '  ' })), 0, 'blank search');
assert.deepEqual(activePills(F({ group: 'group:motion', show: 'liked' })).map((p) => [p.key, p.label]), [['type', 'Motion'], ['show', 'Favourites']]);
assert.deepEqual(activePills(F({ group: 'group:motion', show: 'liked', source: 'featured', q: 'fox', sort: 'old' })).map((p) => p.label), ['Featured', '“fox”', 'Oldest first'], 'under Featured the greyed Type / Show make no pills');
assert.deepEqual(activePills(F({ group: 'group:product' })).find((p) => p.key === 'type')!.clear, { group: 'all' }, '× clears only its own filter');
assert.equal(filterSummary(FILTER_DEFAULT), 'Filter'); assert.equal(filterSummary(F({ show: 'failed', q: 'fox', sort: 'old' })), 'Filter, 3 on: Failed, search “fox”, Oldest first');
const tb = fs.readFileSync(path.resolve(import.meta.dirname, '../../web/src/ui/next/feed/FeedToolbar.tsx'), 'utf8');
assert.match(tb, /<span className="fd-filter-l">Filter<\/span>/, 'the button label never changes'); assert.match(tb, /data-testid="fd-failed"/, '"N failed" link');
assert.match(tb, /data-testid=\{`fd-pill-\$\{p\.key\}`\}/, 'pills'); assert.match(tb, /data-testid=\{`fd-type-\$\{keyOf\(g\.id\)\}`\}/, 'Type chips in the menu');
assert.match(tb, /testPre="source"/); assert.match(tb, /testPre="show"[^>]*off=\{off\}/, 'Show greys out under Uploads / Featured');
assert.doesNotMatch(tb, /FeaturedChip|Generations|scopeChip|countLabel|oneTool|WORKFLOW_KINDS/, 'no Featured button, no "Generations ·" label, one component for both tabs');
const css = fs.readFileSync(path.resolve(import.meta.dirname, '../../web/src/ui/next/feed/feed.css'), 'utf8');
assert.match(css, /\.fd-search input:focus-visible\{[^}]*box-shadow:none/, 'no second focus ring inside the search box'); assert.match(css, /\.fd-search:focus-within\{/);
assert.match(css, /\.fd-pill\{/); assert.match(css, /\.fd-pills\{order:9;flex:1 0 100%;overflow-x:auto/, 'phones: pills scroll sideways in one line'); assert.doesNotMatch(css, /\.vf-group/, 'the chip row is gone');
ok('pills only for filters that are on (each × clears its own), "Filter" + count, screen-reader summary, one toolbar for both tabs');

// ---- saved per tab: version 2, the v1 migration table, and only Sort + Grid come back on reload ----
assert.deepEqual(parseSavedFilter(null), FILTER_DEFAULT); assert.deepEqual(parseSavedFilter('{bad json'), FILTER_DEFAULT);
assert.deepEqual(parseSavedFilter(null, 'large'), F({ size: 'large' }), 'the old size-only key still counts');
const full = F({ group: 'group:motion', source: 'featured', show: 'liked', q: 'fox', sort: 'old', size: 'small' }); const saved = savedFilterText(full);
assert.doesNotMatch(saved, /fox/, 'the search is not saved'); assert.equal(JSON.parse(saved).v, 2);
assert.deepEqual(migrateSavedFilter(saved), { ...full, q: '' }, 'version 2 round-trips (minus the search)');
assert.deepEqual(parseSavedFilter(saved, 'large'), F({ sort: 'old', size: 'small' }), 'on reload only Sort and Grid come back: one feed always lands on everything');
const MIG: [string, Partial<FeedFilter>][] = [
  ['all', {}], ['liked', { show: 'liked' }], ['failed', { show: 'failed' }], ['featured', { source: 'featured' }],
  ['created', { group: 'group:create' }], ['edits', { group: 'group:edit' }],
  ['wf:relight', { group: 'group:edit' }], ['wf:character-sheet', { group: 'group:people' }], ['wf:upscale', { group: 'group:upscale' }], ['wf:nope', {}], ['sideways', {}]];
for (const [kind, want] of MIG) assert.deepEqual(migrateSavedFilter(JSON.stringify({ kind, sort: 'old', size: 'large' })), F({ sort: 'old', size: 'large', ...want }), `v1 kind "${kind}"`);
assert.equal(groupOfWorkflow('upscale'), 'group:upscale', 'the most specific Type (Upscale, not Edit)'); assert.equal(groupOfWorkflow('motion-control'), 'group:motion', 'a Video workflow'); assert.equal(groupOfWorkflow('nope'), 'all');
assert.deepEqual(migrateSavedFilter(JSON.stringify({ v: 2, group: 'group:nope', source: 'x', show: 'y', sort: 'sideways', size: 'xl' })), FILTER_DEFAULT, 'bad v2 values fall back');
ok('saved v2 (Type, From, Show, Sort, Grid; never the search); v1 kinds migrate (liked/failed → Show, featured → From, created/edits/wf:<id> → Type); reload restores Sort and Grid only');

// ---- failed card money sentence: a Seedance policy refusal isn't billed by Comfy ----
assert.equal(policyRefusalCharge({ provider: 'router-seedance' }), 'no'); assert.equal(policyRefusalCharge({ route: 'router:router-seedance-25' }), 'no');
assert.equal(policyRefusalCharge({ route: 'direct:byteplus/seedance-2.0' }), 'unknown', 'BytePlus direct: not the Router catalog'); assert.equal(policyRefusalCharge({ provider: 'router-kling' }), 'unknown');
const comfy = { ownAccounts: true, providerRule: 'may-charge' as const, providerName: 'Comfy' };
const refused = { id: 'x', status: 'failed', provider: 'router-seedance', runOn: 'comfy-cloud', reasonCode: 'content_blocked', errorType: 'nsfw', error: 'Comfy Router failed: the provider refused this prompt or image (content policy).' };
assert.equal(failView(refused as any, comfy).title, 'Comfy Cloud turned this down'); assert.equal(failView(refused as any, comfy).charge, 'Nothing was charged.');
assert.equal(failView({ ...refused, provider: 'router-kling' } as any, comfy).charge, 'Comfy may still bill your account.', 'other Router models: still maybe');
const restart = { ...refused, reasonCode: null, errorType: 'temporary', error: 'The server restarted while this was in progress; try again.', requeuedAt: 1 };
assert.equal(failView(restart as any, comfy).charge, 'Comfy may still bill your account.', 'a run cut off after it reached Comfy may still be billed');
ok('a Seedance policy refusal says "Nothing was charged."; other refusals and restarts keep "Comfy may still bill your account."');
console.log('ALL OK feed-filter-state');
