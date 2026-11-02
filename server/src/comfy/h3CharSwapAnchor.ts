/**
 * H3 Character Swap · Comfy Cloud: the first-frame anchor (2026-11-02), as Comfy's Openjutsu app makes it (lib/anchor.ts, app/api/anchor/route.ts,
 * github.com/Comfy-Org/comfy-openjutsu @ 70ec62d, MIT, Copyright (c) 2026 Comfy Org; licenses/comfy-openjutsu-LICENSE-MIT.md).
 * Before the swap is uploaded, the frame at the swap range's start (the job's clip is already cut to the range) and the character image go to
 * GPT Image 2.5 Sunburst on Comfy Router (quality low, size auto, their ANCHOR_PROMPT verbatim plus which person when the user clicked or named one).
 * The result goes into the H3 graph as <Picture 2> and as the frame-0 guide (comfy/h3CharSwapCloud.ts). On by default for Person swap; off with
 * charswapAnchor=off; never for Motion transfer. If the call fails, the swap runs without it and the job says so (their behaviour).
 * Price: one GPT Image 2.5 low edit with two input images, added to the route's quote and charge (routing/routes.ts extraCredits, quote = charge).
 */
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from '../config.js';
import { runFfmpeg } from '../ffmpeg.js';
import { handOff } from '../mediaHandoff.js';
import { ComfyRouter, routerBase } from '../comfyRouter.js';
import { gptImageUsd, promptBytesOf, usdToCredits, HOSTED_BY_ID } from '../shared/hostedPrices.js';

export const ANCHOR_MODEL = 'openai/gpt-image-2.5-sunburst';
export const ANCHOR_PRICE_REF = 'api-gpt-image-25-sunburst';
/** Comfy's Openjutsu ANCHOR_PROMPT, verbatim (image 1 = the frame, image 2 = the character). */
export const ANCHOR_PROMPT =
  "Replace the person in image 1 with the character from image 2, including their face, hair, body and complete outfit exactly as shown in image 2. Do not keep any of the original person's clothing. Keep image 1's pose, framing, background and lighting.";

type In = Record<string, any>;
const motionOf = (i: In) => i.mode === 'motion_transfer';
/** The anchor is made for this job: Person swap on H3 (not Motion transfer) unless turned off. Shared by the price, the prep and the plan. */
export const charswapAnchorOn = (i: In) => !motionOf(i) && i.charswapAnchor !== 'off' && i.charswapAnchor !== false;
/** Which person, in words GPT Image can follow: the name the user gave, and where they clicked (null when neither). */
export function anchorWho(i: In): string | null {
  const who = typeof i.target === 'string' ? i.target.trim().slice(0, 120) : ''; const p = i.point;
  const at = p && Number.isFinite(p.x) && Number.isFinite(p.y)
    ? `${p.x < 0.4 ? 'on the left' : p.x > 0.6 ? 'on the right' : 'in the middle'} of image 1, around ${Math.round(Math.min(1, Math.max(0, p.x)) * 100)}% from the left and ${Math.round(Math.min(1, Math.max(0, p.y)) * 100)}% from the top` : '';
  if (who && at) return `The person to replace in image 1 is ${who}, ${at}.`;
  if (who) return `The person to replace in image 1 is ${who}.`;
  return at ? `The person to replace is the one ${at}.` : null;
}
export const anchorPrompt = (i: In) => [ANCHOR_PROMPT, anchorWho(i)].filter(Boolean).join(' ');
/** Comfy Router body, at Openjutsu's settings. */
export const anchorBody = (i: In, frame: string, character: string) => ({ prompt: anchorPrompt(i), image: [frame, character], quality: 'low', size: 'auto', n: 1, moderation: 'auto' });
/** USD of one anchor: a GPT Image 2.5 low output (size auto → the dearest 1K shape) for this prompt, plus the two input images. */
export function charswapAnchorUsd(i: In = {}) {
  const ref = HOSTED_BY_ID[ANCHOR_PRICE_REF]?.refImages?.usd ?? 0;
  return gptImageUsd('gpt-image-2.5', 'low', '1K', null, promptBytesOf(anchorPrompt(i))) + 2 * ref;
}
/** Credits the anchor adds to this job's quote and charge (0 when it isn't made). */
export const charswapAnchorCredits = (i: In = {}) => (charswapAnchorOn(i) ? usdToCredits(charswapAnchorUsd(i)) : 0);
export const charswapAnchorLine = (i: In = {}) => (charswapAnchorOn(i) ? `First frame: GPT Image 2.5 Sunburst edit, low (Comfy Router, estimated) · $${(charswapAnchorCredits(i) / 100).toFixed(2)}` : null);
export const anchorFailNote = (why: string) => `The first frame couldn't be made (${why.replace(/[.\s]+$/, '')}), so the swap ran without it.`;

/** Prep before any upload (comfy/cloudWorkflows.ts prepare, routing/cloudRun.ts): grabs the range's first frame,
 *  makes the anchor, writes input.charswapAnchorPath; on failure input.charswapAnchorError + a plain warning. Runs once per job (a retry or a
 *  pick-up after a restart never pays again). */
export async function prepareCharswapAnchor(job: { id: string; input: In; warnings?: string[] }, ctx: { key?: string; fetch?: typeof fetch; sleep?: (ms: number) => Promise<void> } = {}) {
  const i = job.input; if (!charswapAnchorOn(i) || i.charswapAnchorPath || i.charswapAnchorError) return;
  const character = i.refPaths?.[0] ?? i.imagePath;
  try {
    if (!ctx.key) throw new Error('no Comfy key for Comfy Router');
    if (!i.videoPath || !character) throw new Error('the clip or the character image is missing');
    const frame = path.join(DATA_DIR, `${job.id}-charswap-frame0.png`);
    if ((await runFfmpeg(['-y', '-v', 'error', '-ss', '0', '-i', String(i.videoPath), '-frames:v', '1', '-update', '1', frame])) !== 0 || !existsSync(frame)) throw new Error('the first frame of your clip could not be read');
    const send = (p: string) => handOff(p, 'image', 'comfy-router', { accepts: ['data-uri'] });
    const c = new ComfyRouter(ctx.key, ctx.fetch, routerBase(), ctx.sleep);
    const r = await c.runQueued(ANCHOR_MODEL, anchorBody(i, await send(frame), await send(String(character))), `${job.id}-charswap-anchor`, { timeoutMs: 5 * 60_000 });
    const d = r.json?.data?.[0]; let bytes: Buffer | null = r.bytes;
    if (!bytes && d?.b64_json) bytes = Buffer.from(String(d.b64_json).replace(/^data:[^,]*,/, ''), 'base64');
    if (!bytes && d?.url) { const res = await (ctx.fetch ?? fetch)(d.url); if (!res.ok) throw new Error(`the first-frame image could not be downloaded (${res.status})`); bytes = Buffer.from(await res.arrayBuffer()); }
    if (!bytes?.length) throw new Error('GPT Image returned no image');
    const out = path.join(DATA_DIR, `${job.id}-charswap-anchor.png`); await writeFile(out, bytes);
    i.charswapAnchorPath = out; i.charswapAnchorCost = r.creditsUsed ?? null; // Comfy credits Router reported for it (null = not reported)
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e); i.charswapAnchorError = why.slice(0, 300);
    const note = anchorFailNote(why); if (!(job.warnings ??= []).includes(note)) job.warnings.push(note);
  }
}
