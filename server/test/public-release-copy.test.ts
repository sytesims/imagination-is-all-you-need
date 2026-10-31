// Release-copy changes must not alter Relight's actual recipes or model settings.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { RELIGHT_LOOKS } from '../src/tools/appRows.js';
import { TOOLSETS, DEFAULT_TOOLSETS, HTTP_DEFAULT_TOOLSETS } from '../../mcp/src/toolsets.js';
import { featuredByKey, featuredRuns, MOSSBUN_SHEET_RUN, MOSSBUN_CITY_RUNS } from '../src/shared/featured.js';

const recipes = JSON.stringify(RELIGHT_LOOKS.map(({ credit, ...recipe }) => recipe));
assert.equal(createHash('sha256').update(recipes).digest('hex'), '44f8b977d21af7e063937caf8f2edac0414fa4534c21a8384acc7484c7278fad', 'recipe IDs, prompts, defaults and swatches pinned (updated for the position-free look wording)');
for (const look of RELIGHT_LOOKS) {
  assert.ok(look.credit.trim());
  assert.doesNotMatch(look.credit, /research|study|preset hunt|idea only/i, 'tooltips explain the lighting, not internal research');
}
assert.deepEqual(DEFAULT_TOOLSETS, ['core']);
assert.deepEqual(HTTP_DEFAULT_TOOLSETS, ['core', 'canvas']);
assert.equal(TOOLSETS.core.length, 15);
assert.equal(TOOLSETS.canvas.length, 25);
assert.equal(Object.values(TOOLSETS).reduce((n, tools) => n + tools.length, 0), 70);
const manifest = JSON.parse(readFileSync(new URL('../../mcp/server.json', import.meta.url), 'utf8'));
assert.equal(manifest.name, 'io.github.sytesims/imagination-is-all-you-need');
const submission = readFileSync(new URL('../../docs/SUBMISSION-README.md', import.meta.url), 'utf8');
assert.doesNotMatch(submission, /\[VIDEO_LINK\]|47 in `GET \/api\/tools`/);
assert.equal(MOSSBUN_SHEET_RUN.place, 'Comfy Router');
assert.equal(MOSSBUN_CITY_RUNS.find(r => r.jobId === 'b688b9c3')?.place, 'Comfy Router');
const mossbun = featuredByKey('mossbun-golden-hour')!;
assert.equal(featuredRuns(mossbun).find(r => r.jobId === mossbun.jobId)?.est, true, 'historical estimate remains labelled through the chain helper');
console.log('ok release copy: unchanged Relight recipes, explicit MCP toolset counts, current registry identity, no submission placeholder');
