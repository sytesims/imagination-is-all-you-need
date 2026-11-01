/**
 * Swap Two People · Comfy Cloud (2026-10-27): one clip with two people + one photo per person → the same clip with both people recast, motion,
 * framing and sound kept. Route comfy-cloud:cloud-h3-two-swap (tools/twoPersonSwap.ts), a standalone entry in comfy/cloudWorkflows.ts.
 *
 * Our own recipe: two single-person H3 Character Swap passes chained inside ONE Comfy Cloud job, each pass editing only its own person.
 * Graph: workflows/cloud/h3-two-person-swap-api.json, built from our core-node graph workflows/cloud/h3-charswap-api.json (comfy/h3CharSwapCloud.ts):
 *   shared loaders (ref2va int8 → sigma shift 12/3 → comfy kitchen attention → turbo 8-step → the user's imported Character Swap LoRA; Qwen3-VL
 *   NVFP4; H3 video + audio VAEs; SAM 3.1), the source clip at 24 fps on H3's 17k+5 frame grid.
 *   Person masks (1xx, 2xx): SAM 3.1 finds each person on frame 0 (their click on the first frame, with the other person's click as a negative
 *   point, else "person" kept to their half of the frame). Fix 2026-10-28 (job 84505322: person 1 was never recast): both frame-0 masks now go
 *   into ONE SAM3_VideoTrack as two objects ('170', max_objects 2, no text detection), so the tracks keep apart and can't merge or jump to the
 *   other person; TrackToMask picks object 0 / 1. Each person's area is saved as a small extra output ('172', '272') so a run shows who was found.
 *   Each mask is pooled onto H3's 16 px latent grid. Each pass edits its person's grown mask MINUS the other
 *   person's own (ungrown) mask, so the grow never paints over the other person.
 *   Pass 1 (3xx): photo 1 as <Picture 1>, the source as <Video 1> and as the noise-masked latent → person 1 recast.
 *   Pass 2 (4xx): photo 2 as <Picture 1>, pass 1's frames as <Video 1> and as the noise-masked latent → person 2 recast, person 1 kept.
 *   Both passes take the source sound as reference audio and as the audio guide; the output is pass 2's frames (the source sound is muxed back).
 * Why two passes and not one: the Character Swap LoRA was trained on one person per clip; one pass with two photos lets faces blend. One person
 * per pass keeps every face its own. Unlike the one-person route, a frame where SAM loses someone is left as filmed for that person (no whole-frame
 * fallback), so a person leaving the frame never redraws the other.
 * Cloud check (free, GET only, before any upload): the Character Swap LoRA must be in the account's model library (checkCharswapLora); the
 * optional 768p turbo import is used when found. Every other class and model file is the one-person graph's (object_info 2026-10-26,
 * test/fixtures/object-info-comfy-cloud-2026-10-26.json).
 * Ideas credited: Akatz Labs' H3 Character Swap LoRA v1.5, H3 Character Swap workflow (github.com/akatz-labs/h3-character-swap-tool, MIT) and
 * H3 Relay edit mask; the recipe settings of Comfy's Openjutsu app (github.com/Comfy-Org/comfy-openjutsu, MIT; as in h3CharSwapCloud.ts); the chained
 * one-person-per-pass layout and the mutual mask subtraction are our own.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { WORKFLOWS_DIR } from '../config.js';
import { setIn, pruneUnreachable, type Plan } from './plans.js';
import { h3SwapPrompt } from './objectSwap.js';
import { CHARSWAP_LORA_MISSING, TURBO_SHARED, H3_LATENT_CELL, charswapFrames, charswapGrowCells, charswapLoraName, charswapSampling, charswapSize, checkCharswapLora, checkCharswapTurbo,
  type CharSwapTier } from './h3CharSwapCloud.js';

export const TWO_SWAP_PROVIDER = 'cloud-h3-two-swap';
export const TWO_SWAP_ROUTE = `comfy-cloud:${TWO_SWAP_PROVIDER}`;
export const TWO_SWAP_GRAPH = 'cloud/h3-two-person-swap-api.json';
export const TWO_SWAP_NAME = 'H3 Character Swap';
/** One pass of the Character Swap reference clip: 2–15 s (H3 Ref2V's reference video limit, docs.comfy.org built-in-nodes/MiniMaxH3ReferenceToVideo). */
export const TWO_SWAP_SECONDS = { min: 2, max: 15 } as const;
export const TWO_SWAP_TIERS = ['480p', '768p'] as const satisfies readonly CharSwapTier[];
export const twoSwapTier = (i: { resolution?: string }): CharSwapTier => (i.resolution === '480p' ? '480p' : '768p');
/** Node ids in the graph. */
export const TWO_SWAP_NODES = { video: '10', turbo: '3', shift: '7', attention: '8', unet: '1', lora: '2', seed1: '21', seed2: '421', sampler: '22', scheduler: '23',
  /** first: the MaskToImage that feeds this person's frame-0 mask into the joint track ('170', object index = person index) */
  people: [{ detect: '143', point: '144', half: '145', side: '146', first: '160', pool: '150', grow: '153', area: '172' }, { detect: '243', point: '244', half: '245', side: '246', first: '161', pool: '250', grow: '253', area: '272' }],
  track: '170',
  passes: [{ image: '312', prompt: '313', cond: '320', guide: '319', guider: '324' }, { image: '412', prompt: '413', cond: '420', guide: '419', guider: '424' }], save: '430',
  /** pass 1's own frames (person 1 recast, person 2 as filmed), saved as an extra output so a run shows what pass 1 did (2026-10-31) */ pass1Decode: '326', pass1Save: '332' } as const;

const load = () => JSON.parse(readFileSync(path.join(WORKFLOWS_DIR, TWO_SWAP_GRAPH), 'utf8')) as Record<string, any>;
/** What Comfy Cloud must have: every class in the graph and every model file a loader names (the LoRA is the user's import). */
export const TWO_SWAP_REQUIRES = (() => {
  const g = load(); const nodes = new Set<string>(); const models = new Map<string, { loader: string; field: string; file: string }>();
  for (const n of Object.values<any>(g)) { nodes.add(String(n.class_type));
    for (const [k, v] of Object.entries<any>(n.inputs ?? {})) if (typeof v === 'string' && /\.safetensors$/.test(v)) models.set(`${n.class_type}.${k}=${v}`, { loader: String(n.class_type), field: k, file: v }); }
  return { nodes: [...nodes].sort(), models: [...models.values()] };
})();

export type Side = 'left' | 'right';
/** One person as the job carries it: a click on the first frame (0–1) and/or the user's own words for who they are. */
export type CastPick = { point?: { x: number; y: number } | null; who?: string };
/** Where SAM looks for each person: their click, else their half of the frame (person 1 left and person 2 right; a lone click sets the other's side). */
export function castSides(cast: CastPick[]): [{ point: { x: number; y: number } | null; side: Side }, { point: { x: number; y: number } | null; side: Side }] {
  const p = [0, 1].map((k) => { const q = cast[k]?.point; return q && Number.isFinite(q.x) && Number.isFinite(q.y) ? { x: Math.min(1, Math.max(0, q.x)), y: Math.min(1, Math.max(0, q.y)) } : null; });
  const sideOf = (q: { x: number } | null, dflt: Side): Side => (q ? (q.x < 0.5 ? 'left' : 'right') : dflt);
  const s0: Side = p[0] ? sideOf(p[0], 'left') : p[1] ? (sideOf(p[1], 'right') === 'left' ? 'right' : 'left') : 'left';
  const s1: Side = p[1] ? sideOf(p[1], 'right') : s0 === 'left' ? 'right' : 'left';
  return [{ point: p[0], side: s0 }, { point: p[1], side: s1 }];
}
/** Who each pass replaces, in words: the user's own ("the woman in the red dress"), else by place in the frame. */
export function whoText(c: CastPick | undefined, at: { point: { x: number } | null; side: Side }): string {
  const own = String(c?.who ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (own) return /^(the|a|an|this|that|my|our|her|his|their)\b/i.test(own) ? own : `the ${own}`;
  if (at.point) return at.point.x < 0.4 ? 'the person on the left' : at.point.x > 0.6 ? 'the person on the right' : 'the person in the middle';
  return `the person on the ${at.side}`;
}
/** What this route can't take (null = fine). Same check on the quote, the submit and the plan. */
export function twoSwapIssue(i: Record<string, any>): string | null {
  const s = Number(i.duration);
  if (Number.isFinite(s) && s > TWO_SWAP_SECONDS.max + 0.05) return `Swap Two People takes up to ${TWO_SWAP_SECONDS.max} s; your range is ${Math.round(s * 10) / 10} s. Pick a shorter range`;
  if (Number.isFinite(s) && s > 0 && s < TWO_SWAP_SECONDS.min) return `Swap Two People needs at least ${TWO_SWAP_SECONDS.min} s of video`;
  const c = castSides(i.cast ?? []); const [a, b] = c;
  if (a.point && b.point && Math.hypot(a.point.x - b.point.x, a.point.y - b.point.y) < 0.03) return 'You picked the same spot for both people. Pick each person on the first frame';
  return null;
}
/** Rendered seconds (what is billed): H3's 17k+5 frames at 24 fps. */
export const twoSwapSeconds = (i: Record<string, any>) => Math.round((charswapFrames(Math.min(TWO_SWAP_SECONDS.max, Math.max(TWO_SWAP_SECONDS.min, Number(i.duration) || 5))) / 24) * 100) / 100;

/** Whole bodies (2026-10-28, job fd1a2425: one click made SAM mask only the clicked jacket, so person 1 was never recast).
 *  SAM 3.1 tracks every "person" ('180', up to TWO_SWAP_BODIES); for each clicked person we keep the tracked body that covers their click on
 *  frame 0, on H3's latent grid, with core nodes only: a one-cell click mask, frame-0 overlap pooled to 1×1 and thresholded (0 or 1), scaled back
 *  to the grid and multiplied into that body's mask for the whole clip. The click's own SAM mask is added too, so a missed detection still edits
 *  what was clicked. Node ids: bodies 5j0–5j6, click cells 6k0–6k2, picks 7kj0–7kj8, person sums 8k0…; the result replaces the raw mask '152'/'252'. */
export const TWO_SWAP_BODIES = 4;
const L = (id: string, i = 0) => [id, i];
function wholeBodies(g: Record<string, any>, clicks: ({ x: number; y: number } | null)[], cw: number, ch: number, width: number, height: number) {
  if (!clicks.some(Boolean)) return;
  g['180'] = { class_type: 'SAM3_VideoTrack', inputs: { images: L('11'), model: L('40'), conditioning: L('41'), detection_threshold: 0.5, max_objects: TWO_SWAP_BODIES, detect_interval: 1 }, _meta: { title: 'SAM 3.1: every person, tracked' } };
  for (let j = 0; j < TWO_SWAP_BODIES; j++) {
    const b = `5${j}`;
    g[`${b}0`] = { class_type: 'SAM3_TrackToMask', inputs: { track_data: L('180'), object_indices: String(j) }, _meta: { title: `Body ${j + 1}` } };
    g[`${b}1`] = { class_type: 'MaskToImage', inputs: { mask: L(`${b}0`) } };
    g[`${b}2`] = { class_type: 'ImageScale', inputs: { image: L(`${b}1`), upscale_method: 'area', width: cw, height: ch, crop: 'disabled' }, _meta: { title: `Body ${j + 1} on the latent grid` } };
    g[`${b}3`] = { class_type: 'ImageToMask', inputs: { image: L(`${b}2`), channel: 'red' } };
    g[`${b}4`] = { class_type: 'ThresholdMask', inputs: { mask: L(`${b}3`), value: 0.01 } };
    g[`${b}5`] = { class_type: 'ImageFromBatch', inputs: { image: L(`${b}2`), batch_index: 0, length: 1 }, _meta: { title: `Body ${j + 1} on frame 0` } };
    g[`${b}6`] = { class_type: 'ThresholdMask', inputs: { mask: L(`${b}7`), value: 0.5 } }; // the click cell must be mostly this body, so a body touching it at the edge is not taken
    g[`${b}7`] = { class_type: 'ImageToMask', inputs: { image: L(`${b}5`), channel: 'red' } };
  }
  clicks.forEach((c, k) => {
    if (!c) return;
    const cx = Math.min(cw - 1, Math.max(0, Math.floor(c.x * cw))), cy = Math.min(ch - 1, Math.max(0, Math.floor(c.y * ch))); const q = `6${k}`;
    g[`${q}0`] = { class_type: 'SolidMask', inputs: { value: 0, width: cw, height: ch } };
    g[`${q}1`] = { class_type: 'SolidMask', inputs: { value: 1, width: 1, height: 1 } };
    g[`${q}2`] = { class_type: 'MaskComposite', inputs: { destination: L(`${q}0`), source: L(`${q}1`), x: cx, y: cy, operation: 'add' }, _meta: { title: `Person ${k + 1}: the click cell` } };
    let sum: string = k === 0 ? '152' : '252'; // the click's own (tracked) SAM mask
    for (let j = 0; j < TWO_SWAP_BODIES; j++) {
      const t = `7${k}${j}`; const b = `5${j}`;
      g[`${t}0`] = { class_type: 'MaskComposite', inputs: { destination: L(`${b}6`), source: L(`${q}2`), x: 0, y: 0, operation: 'multiply' }, _meta: { title: `Person ${k + 1}: is the click on body ${j + 1}?` } };
      g[`${t}1`] = { class_type: 'MaskToImage', inputs: { mask: L(`${t}0`) } };
      g[`${t}2`] = { class_type: 'ImageScale', inputs: { image: L(`${t}1`), upscale_method: 'area', width: 1, height: 1, crop: 'disabled' } };
      g[`${t}3`] = { class_type: 'ImageToMask', inputs: { image: L(`${t}2`), channel: 'red' } };
      g[`${t}4`] = { class_type: 'ThresholdMask', inputs: { mask: L(`${t}3`), value: 0.0001 } };
      g[`${t}5`] = { class_type: 'MaskToImage', inputs: { mask: L(`${t}4`) } };
      g[`${t}6`] = { class_type: 'ImageScale', inputs: { image: L(`${t}5`), upscale_method: 'nearest-exact', width: cw, height: ch, crop: 'disabled' } };
      g[`${t}7`] = { class_type: 'ImageToMask', inputs: { image: L(`${t}6`), channel: 'red' } };
      g[`${t}8`] = { class_type: 'MaskComposite', inputs: { destination: L(`${b}4`), source: L(`${t}7`), x: 0, y: 0, operation: 'multiply' }, _meta: { title: `Person ${k + 1}: body ${j + 1} if it holds the click` } };
      const add = `8${k}${j}`; g[add] = { class_type: 'MaskComposite', inputs: { destination: L(sum), source: L(`${t}8`), x: 0, y: 0, operation: 'add' } }; sum = add;
    }
    g[sum]._meta = { title: `Person ${k + 1}: whole body` };
    const raw = k === 0 ? '152' : '252';
    for (const n of Object.values<any>(g)) for (const [f, v] of Object.entries<any>(n.inputs ?? {})) // grow, the mutual subtraction and the adds now read the whole body
      if (Array.isArray(v) && v[0] === raw && v[1] === 0 && n !== g[`7${k}0`] && !(n.class_type === 'MaskComposite' && f === 'destination' && n === g[`8${k}0`])) n.inputs[f] = L(sum);
    // the person's area output shows the whole edited body (ungrown), at full size
    const a = `9${k}`; g[`${a}0`] = { class_type: 'MaskToImage', inputs: { mask: L(sum) } };
    g[`${a}1`] = { class_type: 'ImageScale', inputs: { image: L(`${a}0`), upscale_method: 'nearest-exact', width, height, crop: 'disabled' } };
    g[k === 0 ? '171' : '271'].inputs.images = L(`${a}1`);
  });
}

/** Head room (2026-10-31, job fd1a2425's area outputs: a chest click's mask covered the jacket and arms only, so pass 1 kept the face). Each person's
 *  final mask also grows UP and down by HEAD_ROOM of the frame height, inside the columns that person's mask fills (at least 2 cells of a column), so
 *  the head above a torso-only mask is always edited; the mutual subtraction still keeps the other person out. Core nodes only, per frame, on the
 *  latent grid. Node ids 11k0–11k7; every reader of the person's mask (grow, the other person's subtraction, the adds, the area output) reads 11k7. */
export const HEAD_ROOM = 0.3;
function headRoom(g: Record<string, any>, k: number, cw: number, ch: number) {
  const src = g[k === 0 ? '153' : '253'].inputs.mask as [string, number]; const h = `11${k}`; const cells = Math.max(1, Math.round(ch * HEAD_ROOM));
  g[`${h}0`] = { class_type: 'MaskToImage', inputs: { mask: src } };
  g[`${h}1`] = { class_type: 'ImageScale', inputs: { image: L(`${h}0`), upscale_method: 'area', width: cw, height: 1, crop: 'disabled' }, _meta: { title: `Person ${k + 1}: columns they fill` } };
  g[`${h}2`] = { class_type: 'ImageScale', inputs: { image: L(`${h}1`), upscale_method: 'nearest-exact', width: cw, height: ch, crop: 'disabled' } };
  g[`${h}3`] = { class_type: 'ImageToMask', inputs: { image: L(`${h}2`), channel: 'red' } };
  g[`${h}4`] = { class_type: 'ThresholdMask', inputs: { mask: L(`${h}3`), value: Math.min(0.99, 1.5 / ch) } }; // at least 2 cells of the column
  g[`${h}5`] = { class_type: 'GrowMask', inputs: { mask: src, expand: cells, tapered_corners: false } };
  g[`${h}6`] = { class_type: 'MaskComposite', inputs: { destination: L(`${h}5`), source: L(`${h}4`), x: 0, y: 0, operation: 'multiply' }, _meta: { title: `Person ${k + 1}: up and down in their own columns` } };
  g[`${h}7`] = { class_type: 'MaskComposite', inputs: { destination: src, source: L(`${h}6`), x: 0, y: 0, operation: 'add' }, _meta: { title: `Person ${k + 1}: with head room` } };
  const own = new Set([`${h}0`, `${h}5`, `${h}7`]);
  for (const [id, n] of Object.entries<any>(g)) if (!own.has(id)) for (const [f, v] of Object.entries<any>(n.inputs ?? {})) if (Array.isArray(v) && v[0] === src[0] && v[1] === src[1]) n.inputs[f] = L(`${h}7`);
}

const refuse = (msg: string) => Object.assign(new Error(`${msg}. Nothing was sent or charged`), { reasonCode: 'input_invalid', errorType: 'validation' });

/** The plan: one Comfy Cloud job, two chained passes. input.charswapLora / charswapTurbo = the loader values the free check found. */
export function twoSwapCloudPlan(j: { id: string; toolId: string; provider: string; input: Record<string, any> }): Plan {
  const i = j.input; const photos = [i.personAPath, i.personBPath];
  if (!i.videoPath) throw refuse('Swap Two People needs a clip');
  if (!photos[0] || !photos[1]) throw refuse('Swap Two People needs one photo for each person');
  const bad = twoSwapIssue(i); if (bad) throw refuse(bad);
  const seconds = Math.min(TWO_SWAP_SECONDS.max, Math.max(TWO_SWAP_SECONDS.min, Number(i.duration) || 5));
  const tier = twoSwapTier(i); const { width, height } = charswapSize(Number(i.width), Number(i.height), tier); const length = charswapFrames(seconds);
  const smp = charswapSampling(i); const seed = Math.max(0, Math.floor(Number(i.seed) || 0)) || Math.floor(Math.random() * 2 ** 31);
  const g = load(); const N = TWO_SWAP_NODES; const src24 = `${i.videoPath}.${j.id}-twoswap24.mp4`;
  // models: turbo (the user's 768p build at 768p when the free check found it) or none; the Character Swap LoRA (the user's import)
  const turboFile = tier === '768p' && typeof i.charswapTurbo === 'string' && i.charswapTurbo ? i.charswapTurbo : TURBO_SHARED;
  if (smp.turbo) setIn(g, N.turbo, 'lora_name', turboFile);
  else { delete g[N.turbo]; delete g[N.shift]; g[N.attention].inputs.model = [N.unet, 0]; g[N.lora].inputs.model = [N.attention, 0]; }
  setIn(g, N.lora, 'lora_name', String(i.charswapLora || charswapLoraName())); setIn(g, N.lora, 'strength_model', smp.loraStrength);
  Object.assign(g[N.scheduler].inputs, { steps: smp.steps, scheduler: smp.scheduler }); setIn(g, N.sampler, 'sampler_name', smp.sampler);
  setIn(g, N.video, 'file', { __file: src24 }); setIn(g, N.seed1, 'noise_seed', seed); setIn(g, N.seed2, 'noise_seed', seed + 1);
  // each person: their click on frame 0, else "person" on their half of the frame; pooled to the latent grid and grown
  const at = castSides(i.cast ?? []); const cw = width / H3_LATENT_CELL, ch = height / H3_LATENT_CELL; const grow = charswapGrowCells(height, width, i.maskGrow);
  const notes: string[] = []; const prompts: string[] = [];
  at.forEach((a, k) => {
    const P = N.people[k]; Object.assign(g[P.pool].inputs, { width: cw, height: ch }); setIn(g, P.grow, 'expand', grow);
    if (a.point) {
      const px = { x: Math.min(width - 1, Math.round(a.point.x * width)), y: Math.min(height - 1, Math.round(a.point.y * height)) };
      setIn(g, P.point, 'value', JSON.stringify([px])); delete g[P.detect].inputs.conditioning; g[P.detect].inputs.positive_coords = [P.point, 0];
      /* the other person's click as a negative point: two people in the same dark suits, touching, are one blob to a single click */
      const o = at[1 - k].point; if (o) g[P.detect].inputs.negative_coords = [N.people[1 - k].point, 0];
      delete g[P.half]; delete g[P.side]; g[P.first].inputs.mask = [P.detect, 0]; notes.push(`person ${k + 1}: your click (${px.x}, ${px.y})${o ? ', the other click excluded' : ''}`);
    } else {
      delete g[P.point]; Object.assign(g[P.half].inputs, { width: width / 2, height }); setIn(g, P.side, 'x', a.side === 'left' ? width / 2 : 0); notes.push(`person ${k + 1}: the person on the ${a.side}`);
    }
    const S = N.passes[k]; const prompt = h3SwapPrompt(whoText(i.cast?.[k], a)).slice(0, 4000); prompts.push(prompt);
    setIn(g, S.image, 'image', { __file: photos[k] }); setIn(g, S.prompt, 'value', prompt); Object.assign(g[S.cond].inputs, { width, height, length });
    if (i.hasAudio === false) { delete g[S.cond].inputs['ref_audios.ref_audio_0']; g[S.guider].inputs.conditioning = [S.cond, 0]; delete g[S.guide]; }
  });
  wholeBodies(g, at.map((a) => a.point), cw, ch, width, height);
  headRoom(g, 0, cw, ch); headRoom(g, 1, cw, ch); // after wholeBodies: on each person's final mask (whole body + click, or their half)
  // pass 1's frames as their own output: the next run shows whether pass 1 changed person 1
  g['331'] = { class_type: 'CreateVideo', inputs: { fps: 24, images: L(N.pass1Decode), bit_depth: 8 }, _meta: { title: 'Pass 1 frames' } };
  g[N.pass1Save] = { class_type: 'SaveVideo', inputs: { filename_prefix: 'openhiggsfield/two-person-swap-pass1', format: 'auto', 'format.codec': 'auto', video: L('331') }, _meta: { title: 'Save pass 1 (person 1 only)' } };
  pruneUnreachable(g, [N.save, N.people[0].area, N.people[1].area, N.pass1Save]); // SAM's text prompt is unused when both people are clicked
  const prep: Plan['passes'][number]['prep'] = [{ kind: 'fps', src: i.videoPath, out: src24, fps: 24, width, height, seconds, frames: length, audio: i.hasAudio !== false }];
  return { tool: j.toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: i.keepAudio !== false, labels: ['Both swapped'],
    notes: [`Swap Two People on Comfy Cloud: ${TWO_SWAP_NAME} twice in one job (person 1, then person 2), ${tier}, ${width}×${height}, ${seconds} s (${length} frames), ${smp.turbo ? `turbo ${turboFile === TURBO_SHARED ? '(shared build)' : '768p build'}` : 'no turbo'} ${smp.steps} steps each, ${notes.join('; ')}, masks grown ${grow * H3_LATENT_CELL} px, head room ${Math.round(HEAD_ROOM * 100)}% of the height`],
    passes: [{ label: 'Both swapped', workflow: TWO_SWAP_GRAPH, graph: g, output: N.save, prep,
      extraOutputs: [{ node: N.people[0].area, label: 'Person 1 area' }, { node: N.people[1].area, label: 'Person 2 area' }, { node: N.pass1Save, label: 'Pass 1 (person 1 only)' }],
      expect: { fps: 24, width, height, length, seconds, tier, seed, prompts, lora: g[N.lora].inputs.lora_name, turbo: smp.turbo ? turboFile : null, steps: smp.steps, cast: at } }] };
}

/** Free check (GET only) before anything is uploaded: the Character Swap LoRA import (refused with the import steps when missing), and the
 *  optional 768p turbo import. Same checks as the one-person route. */
export async function twoSwapPreflight(get: (p: string) => Promise<Response>) {
  const c = await checkCharswapLora(get);
  if (c.state === 'missing') throw Object.assign(new Error(CHARSWAP_LORA_MISSING), { reasonCode: 'cloud_import_missing', errorType: 'validation' });
  const t = await checkCharswapTurbo(get);
  return { ...(c.loaderPath ? { charswapLora: c.loaderPath } : {}), ...(t.loaderPath ? { charswapTurbo: t.loaderPath } : {}) };
}
