// Where it runs and what it costs, in words (2026-10-27): server/src/shared/runLabel.ts, the one helper behind the Workflows cards' line and
// the sheet's places (web/src/shared/RunLine.tsx). One case per route status, the best-place order, the from-price fallback, "can run".
// Run: npx tsx test/run-label.test.ts
import assert from 'node:assert/strict';
const { runPlace, runPlaces, runLabel, canRun, runsNow } = await import('../src/shared/runLabel.ts');
const ok = (m: string) => console.log('ok ' + m);
const at = (id: string, status: string, credits: number | null = null, action: any = null) => ({ id, label: id, status, credits, action });

// each status, in words
const cases: [any, string, string, string][] = [
  [at('local', 'ready', 0), 'free', 'Free · on your computer', 'Free'],
  [at('comfy-cloud', 'ready', 14), 'cloud', 'On Comfy Cloud · from $0.14', 'from $0.14'],
  [at('comfy-cloud', 'ready', 0), 'free', 'Free · on Comfy Cloud', 'Free'],
  [at('fal', 'ready', 30), 'cloud', 'On fal · from $0.30', 'from $0.30'],
  [at('comfy-cloud', 'sample', 64), 'sample', 'Sample · from $0.64', 'Sample · from $0.64'],
  [at('local', 'not-installed', null, { kind: 'download', missingBytes: 20434548015 }), 'download', 'Needs a download · 20.4 GB', 'Download 20.4 GB'],
  [at('local', 'not-installed'), 'setup', 'Needs setting up', 'Set up'],
  [at('fal', 'needs-key', 1), 'key', 'Needs a fal key', 'Add a fal key'],
  [at('comfy-cloud', 'needs-key'), 'key', 'Needs a Comfy Cloud key', 'Add a Comfy Cloud key'],
  [at('openai', 'needs-key'), 'key', 'Needs an OpenAI key', 'Add an OpenAI key'],
  [at('ltx', 'needs-key'), 'key', 'Needs an LTX key', 'Add an LTX key'],
  [at('bfl', 'needs-key'), 'key', 'Needs a Black Forest Labs key', 'Add a Black Forest Labs key'],
  [at('local', 'off'), 'setup', 'Needs setting up', 'Turn on in Settings'],
  [at('local', 'unavailable'), 'none', 'Can’t run on your computer', 'Can’t run here'],
  [at('comfy-cloud', 'unavailable'), 'none', 'Not available here', 'Not available'],
  [at('comfy-cloud', 'coming-soon'), 'none', 'Not ready yet', 'Not ready yet'],
];
for (const [r, kind, text, short] of cases) { const p = runPlace(r); assert.equal(p.kind, kind, `${r.id} ${r.status}: kind`); assert.equal(p.text, text, `${r.id} ${r.status}: text`); assert.equal(p.short, short, `${r.id} ${r.status}: short`); }
assert.equal(runPlace(at('local', 'ready', 0), { device: 'this computer' }).text, 'Free · on this computer', 'the device words are the page’s');
assert.equal(runPlace(at('local', 'ready')).icon, 'local'); assert.equal(runPlace(at('comfy-cloud', 'ready', 5)).icon, 'comfy'); assert.equal(runPlace(at('fal', 'ready', 5)).icon, 'api');
assert.equal(runPlace(at('fal', 'needs-key')).icon, 'key'); assert.equal(runPlace(at('local', 'not-installed', null, { kind: 'download', missingBytes: 1e9 })).icon, 'download');
ok(`${cases.length} route statuses in plain words, with their icons`);

// the best place first: free, then the cheapest cloud, sample, download, key, set up; never-runs last
const flux3 = { key: 'flux-3-klein', fromPrice: null, runsOn: [at('local', 'not-installed', null, { kind: 'download', missingBytes: 20434548015 }), at('fal', 'needs-key', 1), at('bfl', 'needs-key', 1)] };
assert.deepEqual(runPlaces(flux3).map((p) => p.kind), ['download', 'key', 'key']); assert.equal(runLabel(flux3).text, 'Needs a download · 20.4 GB');
const ltx = { fromPrice: 10, runsOn: [at('local', 'unavailable'), at('comfy-cloud', 'ready', 24), at('fal', 'ready', 10)] };
assert.equal(runLabel(ltx).text, 'On fal · from $0.10', 'the cheaper cloud first'); assert.equal(runPlaces(ltx).at(-1)!.kind, 'none');
const both = { fromPrice: 0, runsOn: [at('comfy-cloud', 'ready', 30), at('local', 'ready', 0)] }; assert.equal(runLabel(both).text, 'Free · on your computer', 'free on this computer beats a cloud price');
assert.equal(runLabel({ fromPrice: 195, runsOn: [at('comfy-cloud', 'ready')] }).text, 'On Comfy Cloud · from $1.95', 'a cloud place with no price of its own reads the model’s from-price');
assert.equal(runLabel({}).text, 'Free · on your computer', 'an in-app tool with no places runs here, free');
ok('best place first; from-price fallback; in-app tools');

// can it run (now, or after set-up)?
assert.equal(canRun({ runsOn: [at('local', 'unavailable'), at('comfy-cloud', 'coming-soon')] }), false, 'only "can’t run here" / "not ready yet": no');
assert.equal(canRun(flux3), true, 'a download or a key: yes'); assert.equal(runsNow(flux3), false, '...but not now');
assert.equal(runsNow(ltx), true); assert.equal(runsNow({ runsOn: [at('comfy-cloud', 'sample', 64)] }), true, 'a sample run counts in sample mode');
assert.equal(canRun({ runsOn: [] }), true, 'no places listed: an in-app tool');
ok('canRun / runsNow');

for (const [r] of cases) assert.doesNotMatch(runPlace(r).text + runPlace(r).short, /\bMac\b/, 'never names a brand of computer');
ok('no "Mac" anywhere: plain words for any computer');
