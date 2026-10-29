import { LOCAL_LABEL, RUN_ON_LABELS } from '../../../server/src/shared/modelIds';
import { policyRefusalCharge } from '../../../server/src/shared/policyBilling';
import { ledgerUsd } from './billing';
/**
 * One reason map for every failed, blocked or canceled run (feed tile, result viewer, job page, tool stages).
 * reasonCode / errorType / message → { mood, title, line, actions }. The title is short and friendly, the line is ONE short sentence that
 * always fits (the server's full message sits behind "Details"), and `charge` always says what happened to the money.
 * Pure: no React, no fetch, so server/test/failure-reasons.test.ts can check it against the server's reason codes.
 */
export type FailMood = 'noCredits' | 'timeout' | 'badInput' | 'offline' | 'needsKey' | 'needsDownload' | 'providerDown' | 'cancelled' | 'generic';
/** Buttons a failure can offer. Each one is wired to an existing action in FailureState.tsx; none adds server behaviour. */
export type FailAction =
  | 'retry'        // POST /api/jobs/:id/retry (same settings)
  | 'recreate'     // open the tool with these settings (?recreate=)
  | 'changePhoto'  // same as recreate, worded for an image input
  | 'otherModel'   // same as recreate, worded for picking another model
  | 'addCredits'   // comfy.org, new tab
  | 'runLocal'     // job.tryOn offer for Local (only when the server lists one)
  | 'addKey'       // Settings → Connections, at the provider's key
  | 'startComfy'   // Self-host → Local setup steps
  | 'turnOnGpu'    // Settings → Connections → Local
  | 'download'     // the tool page, where the setup card offers the download (never automatic)
  | 'spendLimits'  // the Spend page
  | 'setupTranslate'
  | 'setupCloud'   // Settings → Connections → One-time setup (a Comfy Cloud import or your deployment)
  | 'details';     // open the technical details

export interface FailReason { key: string; mood: FailMood; title: string; line: string; actions: FailAction[] }
export interface FailView extends FailReason { charge: string; detail: string }

/** Everything the map reads from a job (all optional: older jobs lack most of it). */
export interface FailJob {
  status?: string; errorType?: string | null; reasonCode?: string | null; error?: string | null; requeuedAt?: number | null;
  route?: string | null; routeAttempts?: { routeId?: string; refunded?: number }[] | null; tryOn?: { runOn?: string }[] | null;
  creditsBack?: { credits?: number } | null; refund?: { amount?: number; freeGenReturned?: boolean } | null; refunded?: number;
  cost?: number | null; free?: boolean; demo?: boolean; simulated?: boolean; /** sample run (mock backend or demo route): nothing billed */ isSample?: boolean; spend?: { simulated?: boolean } | null;
  /** server routerRun.ts: 'not_charged' = Comfy refused it at validation (422, not billed); 'unconfirmed' = rejected after it was sent, billing undocumented */ chargeNote?: 'not_charged' | 'unconfirmed' | null;
  /** where it ran ('local', 'comfy-cloud', 'fal'…): list items carry this but not `route` */ runOn?: string | null; input?: Record<string, any> | null; decision?: { note?: string } | null;
}
export interface FailCtx { /** own-accounts billing (no app balance); null = billing not loaded yet (the charge sentence waits, so it never flips) */ ownAccounts?: boolean | null; /** the billing provider's stated rule for a failed run */ providerRule?: 'not-charged' | 'may-charge' | 'unknown' | null; /** its short name ("Comfy", "fal") */ providerName?: string | null }

/** Server reason codes (comfyRouter.ts RouterReason, comfy/cloudV2.ts CloudReason, spendGuard / agentBudget) → entry. */
export const REASONS: Record<string, FailReason> = {
  // One-time setup (2026-10-27): a run that needs a file imported into your Comfy Cloud library, or your own deployment. The steps are in Details and on the card.
  cloud_import_missing: { key: 'cloud_import_missing', mood: 'needsDownload', title: 'One-time setup in Comfy Cloud', line: 'Add its file to Comfy Cloud once, then try again.', actions: ['setupCloud', 'details'] },
  deploy_missing:    { key: 'deploy_missing', mood: 'needsKey', title: 'Needs your Comfy deployment', line: 'Set it up once in Settings, then try again.', actions: ['setupCloud', 'details'] },
  cloud_credits:     { key: 'cloud_credits', mood: 'noCredits', title: 'Comfy Cloud balance is empty', line: 'Top up on Comfy Cloud, or run it free on your computer.', actions: ['addCredits', 'runLocal'] },
  key_invalid:       { key: 'key_invalid', mood: 'needsKey', title: 'Needs a Comfy Cloud key', line: 'Add a working key in Settings → Connections.', actions: ['addKey'] },
  // 2026-10-27 (job f609cfc5): Comfy Router answered not_enabled for this model. Refused before any run; a retry goes to its Comfy Cloud route
  route_not_enabled: { key: 'route_not_enabled', mood: 'providerDown', title: 'Not on Comfy Router yet', line: 'Try again: it runs on Comfy Cloud instead.', actions: ['retry', 'otherModel'] },
  cloud_plan:        { key: 'cloud_plan', mood: 'needsKey', title: 'Comfy Cloud plan needs an upgrade', line: 'Runs from this app need the Standard plan or higher.', actions: ['addCredits', 'runLocal'] },
  content_blocked:   { key: 'content_blocked', mood: 'badInput', title: '{provider} turned this down', line: 'Try different words or another image.', actions: ['recreate', 'otherModel'] },
  input_invalid:     { key: 'input_invalid', mood: 'badInput', title: 'Those settings didn’t work', line: 'The model didn’t accept this input.', actions: ['recreate'] },
  model_unavailable: { key: 'model_unavailable', mood: 'providerDown', title: 'Not on your account yet', line: 'Comfy Cloud doesn’t offer it to you. Try another model.', actions: ['otherModel', 'runLocal'] },
  queue_full:        { key: 'queue_full', mood: 'providerDown', title: '{provider} is busy', line: 'Try again in a minute, or pick another model.', actions: ['retry', 'otherModel'] },
  provider_error:    { key: 'provider_error', mood: 'providerDown', title: '{provider} had a problem', line: 'Not your fault. Try again or pick another model.', actions: ['retry', 'otherModel'] },
  cloud_timeout:     { key: 'cloud_timeout', mood: 'timeout', title: 'It got stuck', line: 'It waited too long, so we stopped it. Try again.', actions: ['retry'] },
  cloud_unreachable: { key: 'cloud_unreachable', mood: 'providerDown', title: 'Couldn’t reach Comfy Cloud', line: 'Check your connection, then try again.', actions: ['retry'] },
  submit_uncertain:  { key: 'submit_uncertain', mood: 'generic', title: 'Not sure it was sent', line: 'We didn’t send it twice, to be safe.', actions: ['retry'] },
  price_changed:     { key: 'price_changed', mood: 'noCredits', title: 'The price went up', line: 'It now costs more than your quote, so it didn’t start.', actions: ['recreate'] },
  upload_failed:     { key: 'upload_failed', mood: 'providerDown', title: 'Upload didn’t go through', line: 'Your file couldn’t reach Comfy Cloud. Try again.', actions: ['retry'] },
  canceled:          { key: 'canceled', mood: 'cancelled', title: 'Canceled', line: 'You stopped it. No harm done.', actions: ['recreate'] },
  workflow_invalid:  { key: 'workflow_invalid', mood: 'needsDownload', title: 'Comfy Cloud can’t run this yet', line: 'Try another model, or run it on your computer.', actions: ['otherModel', 'runLocal'] },
  cloud_job_failed:  { key: 'cloud_job_failed', mood: 'providerDown', title: '{provider} had a problem', line: 'Not your fault. Try again or pick another model.', actions: ['retry', 'otherModel'] },
  cloud_job_gone:    { key: 'cloud_job_gone', mood: 'generic', title: 'The run went missing', line: 'Comfy Cloud lost track of it, so we stopped it. Try again.', actions: ['retry'] },
  /* an old run stopped by a spending limit (limits were removed 2026-10-28): nothing stops it now */
  spend_limit:       { key: 'spend_limit', mood: 'generic', title: 'Stopped by an old spending limit', line: 'Spending limits are gone now. Try again.', actions: ['retry'] },
  agent_budget:      { key: 'agent_budget', mood: 'noCredits', title: 'Over the agent budget', line: 'Raise the budget, or run it yourself.', actions: ['spendLimits', 'runLocal'] },
  // Official lab APIs (server/src/providers/direct.ts DirectReason): key_invalid, content_blocked, input_invalid, queue_full, provider_error above, plus:
  provider_credits:  { key: 'provider_credits', mood: 'noCredits', title: 'That account is out of funds', line: 'Top up that account, or pick another model.', actions: ['otherModel', 'runLocal'] },
  agent_budget_unknown: { key: 'agent_budget_unknown', mood: 'noCredits', title: 'Agent budget unclear', line: 'The price was unknown, so it didn’t start.', actions: ['spendLimits'] },
  // Local (server/src/comfy/runNative.ts): a local run we gave up on. The line carries the real minutes from the server's message (failView).
  local_stalled:     { key: 'local_stalled', mood: 'timeout', title: 'It got stuck', line: 'Nothing moved for 10 minutes, so we stopped it. Try again.', actions: ['retry'] },
  local_too_long:    { key: 'local_too_long', mood: 'timeout', title: 'It got stuck', line: 'It ran far longer than usual, so we stopped it. Try again.', actions: ['retry'] },
};
/** Reasons read from errorType or the message (no reasonCode on the job). */
export const EXTRA: Record<string, FailReason> = {
  local_offline:  { key: 'local_offline', mood: 'offline', title: 'Your computer isn’t ready', line: 'Start ComfyUI, then try again.', actions: ['startComfy', 'retry'] },
  local_off:      { key: 'local_off', mood: 'offline', title: 'Running on your computer is off', line: 'Turn it on in Settings → Your computer.', actions: ['turnOnGpu'] },
  model_missing:  { key: 'model_missing', mood: 'needsDownload', title: 'This model isn’t downloaded yet', line: 'Download its files first. Nothing downloads on its own.', actions: ['download'] },
  node_missing:   { key: 'node_missing', mood: 'needsDownload', title: 'One add-on is missing', line: 'Install it in Settings → Your computer, then try again.', actions: ['startComfy'] },
  disk_full:      { key: 'disk_full', mood: 'needsDownload', title: 'Not enough disk space', line: 'Free up some space, or run it in the cloud.', actions: ['otherModel'] },
  restart:        { key: 'restart', mood: 'timeout', title: 'Interrupted by a restart', line: 'The app restarted while this was running.', actions: ['retry'] },
  timeout:        { key: 'timeout', mood: 'timeout', title: 'It took too long', line: 'Try a shorter clip or a smaller file.', actions: ['retry'] },
  declined:       { key: 'declined', mood: 'badInput', title: '{provider} turned this down', line: 'Try different words or another image.', actions: ['recreate', 'otherModel'] },
  ip:             { key: 'ip', mood: 'badInput', title: '{provider} turned this down', line: 'Describe it instead of naming brands or characters.', actions: ['recreate', 'otherModel'] },
  bad_photo:      { key: 'bad_photo', mood: 'badInput', title: 'That photo didn’t work', line: 'Try a clearer or bigger photo.', actions: ['changePhoto'] },
  bad_input:      { key: 'bad_input', mood: 'badInput', title: 'Those settings didn’t work', line: 'The model didn’t accept this input.', actions: ['recreate'] },
  no_credits:     { key: 'no_credits', mood: 'noCredits', title: 'Not enough balance', line: 'Top up, or run it free on your computer.', actions: ['addCredits', 'runLocal'] },
  needs_key:      { key: 'needs_key', mood: 'needsKey', title: 'Needs a key', line: 'Add the key in Settings → Connections.', actions: ['addKey'] },
  provider_down:  { key: 'provider_down', mood: 'providerDown', title: '{provider} had a problem', line: 'Not your fault. Try again or pick another model.', actions: ['retry', 'otherModel'] },
  translate:      { key: 'translate', mood: 'needsDownload', title: 'Translation isn’t set up', line: 'Set it up once, then try again.', actions: ['setupTranslate'] },
  decision:       { key: 'decision', mood: 'generic', title: 'Waiting for your choice', line: 'The next option costs more, so it’s your call.', actions: ['recreate'] },
  unknown:        { key: 'unknown', mood: 'generic', title: 'That didn’t work', line: 'Try again. If it keeps happening, open Details.', actions: ['retry', 'details'] },
};

const KEY_OWNER: [RegExp, string, string][] = [[/^fal:/, 'fal', 'direct'], [/^replicate:/, 'Replicate', 'direct'], [/bfl|flux/, 'Black Forest Labs', 'bfl'], [/^direct:.*minimax/, 'MiniMax', 'minimax'], [/^direct:.*ltx/, 'LTX', 'ltx'], [/^direct:(openai\/|direct-openai)/, 'OpenAI', 'openai'], [/^direct:(google\/|direct-gemini)/, 'Google Gemini API', 'google'], [/^direct:(byteplus\/|direct-seed|direct-byteplus)/, 'BytePlus', 'byteplus']];
/** The provider whose key a route uses, and its Settings anchor. */
export const keyOwnerOf = (route: string | null | undefined): { name: string; anchor: string } => {
  const r = String(route ?? ''); const m = KEY_OWNER.find(([re]) => re.test(r)); return m ? { name: m[1], anchor: `conn-${m[2]}` } : { name: 'Comfy Cloud', anchor: 'conn-comfy' };
};
const routeOf = (j: FailJob) => String(j.route ?? (Array.isArray(j.routeAttempts) ? j.routeAttempts.at(-1)?.routeId : '') ?? '');
const hasImage = (j: FailJob) => { const i = j.input ?? {}; return !!(i.imageUrl || i.image || i.imagePath || (Array.isArray(i.refPaths) && i.refPaths.length) || (Array.isArray(i.refs) && i.refs.length)); };

/** Which entry a job gets. Order: explicit state, then the server's reasonCode, then errorType, then the message. */
export function reasonOf(j: FailJob): FailReason {
  const st = String(j.status ?? ''); const et = String(j.errorType ?? ''); const rc = String(j.reasonCode ?? ''); const msg = String(j.error ?? '');
  const local = /^local:/.test(routeOf(j)) || /^(Local ComfyUI|Local|ComfyUI)\b/i.test(msg);
  if (st === 'canceled' || et === 'canceled' || rc === 'canceled') return REASONS.canceled;
  if (st === 'needs_decision') return EXTRA.decision;
  if (/translation backend not configured|OPENHIGGSFIELD_TRANSLATE_URL/i.test(msg)) return EXTRA.translate;
  if (et === 'ip') return EXTRA.ip;
  if (st === 'blocked' || et === 'nsfw' || rc === 'content_blocked' || rc === 'input_blocked') return EXTRA.declined;
  if (rc === 'key_invalid' || rc === 'key_missing') { const o = keyOwnerOf(routeOf(j)); return o.name === 'Comfy Cloud' ? REASONS.key_invalid : { ...REASONS.key_invalid, title: `Needs ${/^(LTX|OpenAI)\b/.test(o.name) ? 'an' : 'a'} ${o.name} key` }; }
  if (rc === 'local_off') return EXTRA.local_off;
  if (rc === 'local_unreachable') return EXTRA.local_offline;
  if (rc === 'weights_missing') return EXTRA.model_missing;
  if (rc === 'not_enough_disk') return EXTRA.disk_full;
  if (rc === 'input_invalid' && hasImage(j)) return EXTRA.bad_photo;
  if (rc === 'provider_credits') { const o = keyOwnerOf(routeOf(j)); return o.name === 'Comfy Cloud' ? REASONS.provider_credits : { ...REASONS.provider_credits, title: `${o.name} balance is empty` }; }
  if (REASONS[rc]) return REASONS[rc];
  if ((j.requeuedAt || /server restarted|interrupted by a restart|was ComfyUI restarted/i.test(msg)) && /restart|interrupt/i.test(msg)) return EXTRA.restart;
  if (et === 'credits' || /out of credits|not enough credits|no active plan/i.test(msg)) return et === 'credits' || /comfy/i.test(msg) ? { ...EXTRA.no_credits, title: /comfy/i.test(msg) ? 'Comfy Cloud balance is empty' : EXTRA.no_credits.title } : EXTRA.no_credits;
  if (et === 'limit') return /agent budget/i.test(msg) ? REASONS.agent_budget : REASONS.spend_limit;
  if (/missing_node_type|custom node may not be installed|nodes_missing/i.test(msg)) return EXTRA.node_missing;
  if (/value_not_in_list|prompt_outputs_failed_validation|files aren.t on this computer|weights? (are )?missing|model file/i.test(msg)) return EXTRA.model_missing;
  if (/not enough (disk|space)|ENOSPC/i.test(msg)) return EXTRA.disk_full;
  if (/use local comfyui is off/i.test(msg)) return EXTRA.local_off;
  if (/ECONNREFUSED|isn.t reachable|not reachable|could not connect|fetch failed|ENOTFOUND/i.test(msg) && (local || /comfyui/i.test(msg))) return EXTRA.local_offline;
  if (/api key|key was not accepted|key is missing|unauthori[sz]ed|\b401\b/i.test(msg)) { const o = keyOwnerOf(routeOf(j)); return { ...EXTRA.needs_key, title: `Needs ${/^(LTX|OpenAI)\b/.test(o.name) ? 'an' : 'a'} ${o.name} key` }; }
  if (et === 'validation' || et === 'invalid_input') return hasImage(j) || /image|photo|face|too small/i.test(msg) ? EXTRA.bad_photo : EXTRA.bad_input;
  if (/timed? ?out|took too long|too long|expired/i.test(msg) || et === 'timeout') return EXTRA.timeout;
  if (et === 'provider_outage') return EXTRA.provider_down;
  return EXTRA.unknown;
}

/** Reasons where the provider was never asked to run anything, so nothing can have been billed. */
const NEVER_RAN = new Set(['upload_failed', 'cloud_credits', 'provider_credits', 'key_invalid', 'cloud_plan', 'route_not_enabled', 'price_changed', 'submit_uncertain', 'spend_limit', 'agent_budget', 'agent_budget_unknown', 'queue_full',
  'local_offline', 'local_off', 'model_missing', 'node_missing', 'disk_full', 'translate', 'needs_key', 'no_credits', 'cloud_import_missing', 'deploy_missing']);
/** Credits that went back to the app balance (same sources as creditsBack.ts heldBack, kept here so this file stays pure). */
export function backOf(j: FailJob): number {
  if (j && 'creditsBack' in j) return j.creditsBack ? Number(j.creditsBack.credits) || 0 : 0;
  const att = Array.isArray(j?.routeAttempts) ? j.routeAttempts.reduce((s, a) => s + (Number(a?.refunded) || 0), 0) : 0;
  return Math.max(Number(j?.refund?.amount) || 0, Number(j?.refunded) || 0, att);
}
/** The one money sentence: never a guess. Empty only while the billing mode is still loading (#11: no flip on first render). */
export function chargeOf(j: FailJob, r: FailReason, ctx: FailCtx = {}): string {
  if (j.refund?.freeGenReturned) return 'Your free gen went back.';
  /* App-balance credits back: team mode only (QA #7: own accounts never shows ✦; there the provider's rule below decides). Mode still
   * loading → say nothing rather than a ✦ sentence that would flip. */
  const back = backOf(j); if (back > 0 && ctx.ownAccounts !== true) { if (ctx.ownAccounts == null && 'ownAccounts' in ctx) return ''; return `${ledgerUsd(back)} went back to your balance.`; }
  if (r.key === 'canceled') return 'Nothing was charged.';
  /* #11: decide "hosted" from the route OR runOn (list items have no route), so a list item and the full job read the same. */
  const route = routeOf(j); const ran = route ? !/^local:/.test(route) : !!j.runOn && j.runOn !== 'local';
  const hosted = ran && !j.demo && !j.simulated && !j.isSample && !j.spend?.simulated;
  if (NEVER_RAN.has(r.key) || !hosted) return 'Nothing was charged.';
  if (j.chargeNote === 'not_charged') return 'Nothing was charged.'; // Router 422: validation before the provider call is not billed
  /* a content-policy refusal on a Router model whose catalog says charges_on_policy_rejection = "no" (Seedance): Comfy doesn't bill it */
  if (r.key === 'declined' && policyRefusalCharge(j as any) === 'no') return 'Nothing was charged.';
  if (ctx.ownAccounts == null && 'ownAccounts' in ctx) return ''; // billing mode not known yet: say nothing rather than guess and flip
  if (ctx.ownAccounts && j.chargeNote === 'unconfirmed') return `${ctx.providerName || 'Your provider'} may still bill your account; the estimate is unconfirmed.`;
  if (ctx.ownAccounts) return ctx.providerRule === 'not-charged' ? 'Nothing was charged.' : ctx.providerRule === 'may-charge' ? `${ctx.providerName || 'Your provider'} may still bill your account.` : `Any charge follows ${ctx.providerName ? `${ctx.providerName}’s` : 'your provider’s'} rule.`;
  return 'Nothing was charged.';
}
/** The server's message without credits sentences or raw JSON, for the Details panel. */
export const detailOf = (j: FailJob) => String(j.error ?? '').replace(/\s*(Nothing was charged|No credits were charged)\.?/gi, '').trim();

/** A title's {provider}: the hosted place that ran it ("fal", "Comfy Cloud"), else "The provider" (copy wave 1, F14). */
const titleFor = (j: FailJob, t: string) => { if (!t.includes('{provider}')) return t; const r = routeOf(j); const ro = String(j.runOn ?? '');
  return t.replace('{provider}', /^local:/.test(r) || ro === 'local' ? LOCAL_LABEL : r ? keyOwnerOf(r).name : (RUN_ON_LABELS as Record<string, string>)[ro] ?? 'The provider'); };
/** The whole view: entry + money sentence + details. `runLocal` is dropped unless the server lists Local as ready (job.tryOn). */
export function failView(j: FailJob, ctx: FailCtx = {}): FailView {
  const r = reasonOf(j); const local = Array.isArray(j.tryOn) && j.tryOn.some(o => o?.runOn === 'local');
  const actions = r.actions.filter(a => a !== 'runLocal' || local);
  const mins = /(\d+) min\b/.exec(String(j.error ?? ''))?.[1];
  const line = r.key === 'cloud_credits' && !local ? 'Top up on comfy.org, then try again.' : r.key === 'no_credits' && !local ? 'Top up your account, then try again.'
    : r.key === 'local_stalled' && mins ? `Nothing moved for ${mins} minute${mins === '1' ? '' : 's'}, so we stopped it. Try again.` : r.key === 'local_too_long' && mins ? `It ran for over ${mins} minute${mins === '1' ? '' : 's'}, so we stopped it. Try again.` : r.line;
  return { ...r, title: titleFor(j, r.title), line, actions: actions.length ? actions : ['retry'], charge: chargeOf(j, r, ctx), detail: detailOf(j) };
}
/** Button words. */
export const ACTION_LABEL: Record<FailAction, string> = {
  retry: 'Try again', recreate: 'Recreate', changePhoto: 'Change photo', otherModel: 'Try another model', addCredits: 'Top up', runLocal: 'Run on your computer',
  addKey: 'Add a key', startComfy: 'How to start ComfyUI', turnOnGpu: 'Turn it on', download: 'Download', spendLimits: 'Open Spend', setupTranslate: 'Set up translation', setupCloud: 'Show the steps', details: 'Details',
};
