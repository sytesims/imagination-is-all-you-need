// Failure reason map (web/src/shared/failureReasons.ts): every reason code the server can put on a failed job maps to its own friendly entry
// (never the generic "Something went sideways"), every entry has a short title and ONE short line, a known mood, at least one action, and
// the money sentence is always there. Codes are read from the server source, so a new code without copy fails here.
// Run: npx tsx test/failure-reasons.test.ts   (no server, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
import { REASONS, EXTRA, failView, reasonOf, chargeOf } from '../../web/src/shared/failureReasons.ts';
const ok = (m: string) => console.log('ok ' + m); const SRC = path.resolve(import.meta.dirname, '../src');
const union = (file: string, type: string) => { const t = fs.readFileSync(path.join(SRC, file), 'utf8'); const m = new RegExp(`export type ${type} = ([^;]+);`).exec(t); assert.ok(m, `${type} in ${file}`); return [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]); };
const router = union('comfyRouter.ts', 'RouterReason'); const cloud = union('comfy/cloudV2.ts', 'CloudReason');
const limits = ['spend_limit', 'agent_budget', 'agent_budget_unknown'];
assert.ok(router.length >= 10 && cloud.length >= 8, 'read the unions');
const MOODS = new Set(['noCredits', 'timeout', 'badInput', 'offline', 'needsKey', 'needsDownload', 'providerDown', 'cancelled', 'generic']);
const codes = [...new Set([...router, ...cloud, ...limits])];
for (const code of codes) {
  const v = failView({ status: 'failed', reasonCode: code, error: 'Comfy Router failed: something.', route: 'router:x' });
  assert.notEqual(v.key, 'unknown', `${code} has its own entry`); assert.ok(MOODS.has(v.mood), `${code} mood`);
}
ok(`all ${codes.length} server reason codes (RouterReason, CloudReason, spend/agent limits) map to a non-generic entry`);
for (const r of [...Object.values(REASONS), ...Object.values(EXTRA)]) {
  assert.ok(r.title.length <= 34, `title short: ${r.title}`); assert.ok(r.line.length <= 60, `line short: ${r.line}`);
  assert.ok((r.line.match(/[.!?](\s|$)/g) ?? []).length <= 2, `one or two short sentences: ${r.line}`);
  assert.ok(r.actions.length >= 1 && MOODS.has(r.mood), r.key); assert.ok(!/fail(ed)?\b/i.test(r.title), `no cold "Failed" title: ${r.title}`);
}
ok('every entry: a title ≤ 34 chars, a line ≤ 60 chars, a known mood, at least one action, no "Failed" title');
const k = (j: any) => reasonOf(j).key;
assert.equal(k({ status: 'canceled' }), 'canceled');
assert.equal(k({ status: 'blocked', errorType: 'nsfw' }), 'declined'); assert.equal(k({ status: 'blocked', errorType: 'ip' }), 'ip');
assert.equal(k({ status: 'failed', errorType: 'temporary', error: 'The server restarted while this was in progress; try again.', requeuedAt: 1 }), 'restart');
assert.equal(k({ status: 'failed', errorType: 'provider_outage', route: 'local:x', error: 'Local ComfyUI failed: fetch failed (ECONNREFUSED)' }), 'local_offline');
assert.equal(k({ status: 'failed', errorType: 'temporary', route: 'local:x', error: 'Local ComfyUI failed: prompt_outputs_failed_validation value_not_in_list' }), 'model_missing');
assert.equal(k({ status: 'failed', errorType: 'temporary', route: 'local:x', error: 'missing_node_type: custom node may not be installed' }), 'node_missing');
assert.equal(k({ status: 'failed', errorType: 'temporary', error: 'Timed out after 600 s' }), 'timeout');
assert.equal(k({ status: 'failed', errorType: 'validation', input: { imageUrl: '/x.png' }, error: 'Image too small' }), 'bad_photo');
assert.equal(k({ status: 'failed', errorType: 'credits', error: 'Not enough credits' }), 'no_credits');
assert.equal(k({ status: 'failed', errorType: 'limit', error: 'over your spending limit' }), 'spend_limit');
assert.equal(k({ status: 'failed', errorType: 'provider_outage', error: 'fal failed: 503' }), 'provider_down');
assert.equal(k({ status: 'failed', errorType: 'temporary', error: 'Translation backend not configured (OPENHIGGSFIELD_TRANSLATE_URL)' }), 'translate');
assert.equal(k({ status: 'needs_decision' }), 'decision'); assert.equal(k({ status: 'failed', errorType: 'temporary', error: '???' }), 'unknown');
assert.equal(reasonOf({ status: 'failed', reasonCode: 'key_invalid', route: 'fal:fal-ai/x' }).title, 'Needs a fal key');
ok('errorType, message and state reasons: canceled, declined, restart, GPU offline, model / node missing, timeout, bad photo, credits, limits, provider down, translate, decision, unknown');
assert.deepEqual(failView({ status: 'failed', reasonCode: 'cloud_credits', route: 'router:x' }).actions, ['addCredits']);
assert.deepEqual(failView({ status: 'failed', reasonCode: 'cloud_credits', route: 'router:x', tryOn: [{ runOn: 'local' }] }).actions, ['addCredits', 'runLocal']);
ok('Run locally appears only when job.tryOn lists the local place');
const r = REASONS.provider_error;
assert.equal(chargeOf({ creditsBack: { credits: 40 }, route: 'router:x' }, r), '$0.40 went back to your balance.');
assert.equal(chargeOf({ refund: { freeGenReturned: true } }, r), 'Your free gen went back.');
assert.equal(chargeOf({ route: 'local:x' }, r), 'Nothing was charged.');
assert.equal(chargeOf({ route: 'router:x' }, REASONS.cloud_credits, { ownAccounts: true, providerRule: 'may-charge', providerName: 'Comfy' }), 'Nothing was charged.', 'the provider never ran');
assert.equal(chargeOf({ route: 'router:x' }, r, { ownAccounts: true, providerRule: 'may-charge', providerName: 'Comfy' }), 'Comfy may still bill your account.');
assert.equal(chargeOf({ route: 'replicate:x' }, r, { ownAccounts: true, providerRule: 'not-charged', providerName: 'Replicate' }), 'Nothing was charged.');
assert.equal(chargeOf({ route: 'minimax:x' }, r, { ownAccounts: true, providerRule: 'unknown', providerName: 'MiniMax' }), 'Any charge follows MiniMax’s rule.');
ok('money sentence: credits back, free gen back, local free, never-ran reasons, the provider’s stated rule on your own key');
