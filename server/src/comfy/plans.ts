/**
 * Per-tool ComfyUI run plans for the native client (comfy/native.ts). A plan = ordered passes; each pass is a patched
 * API graph with local files as { __file } placeholders (the runner uploads them), plus the output node to read.
 * Post steps (concat, crossfade, splice, audio mux) run in comfy/runNative.ts. Node ids come from workflows/node-maps/.
 * Pure + testable: readiness/graph asserts every captured graph against the job input.
 */
import { imageUpscaleWorkflowOrDefault, zimageWorkingMegapixels, UPSCALE_LOCAL } from '../shared/imageUpscale.js';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { WORKFLOWS_DIR, PLUGINS_DIR, DATA_DIR } from '../config.js';
import { pickVariant, planObjectSwap, patchGraph, MAX_SWAP_REFS, LENGTH_VARIANTS } from './objectSwap.js';
import { planChunks, patchRestyle, restylePrompt, swatchPath, VACE_FPS } from './restyle.js';
import { fillPattern, captionSubject } from '../shared/promptPatterns.js';
import { angleParams, ltxFrames, patchReshootLtx, reshootEngine } from './reshoot.js';
import { UPSCALE_WORKFLOWS, patchUpscale60, vupGraph, vupShortSide } from './upscale.js';
import { VUP_MODELS, VUP_LOCAL } from '../shared/videoUpscale.js';
import { mixPlan, cameraPreset, LTX_CAMERA_PRESETS } from './cameraPresets.js';
import { soulPlan } from '../tools/soul/plan.js';
import { h3Owns, h3BuildPlan } from '../tools/h3/plan.js';
import { WAN22_5B, WAN22_5B_WORKFLOW, patchWan22 } from './wan22.js';
import { LTX25_VIDEO, ltx25WorkflowFor, patchLtx25Video, isLtx25Loop } from './ltx25Video.js';
import { LTX25_DFR_WORKFLOW, ltxDfrPlan } from './ltx25Dfr.js';
import { ltxDfrRuns } from '../shared/ltxDfr.js';
import { patchMakeReal } from './makeItReal.js';
import { ltxLorasForJob } from '../shared/ltxLoras.js';
import { LTX25_LIPSYNC, LTX25_A2V_WORKFLOW, patchLtx25Lipsync } from './ltx25Lipsync.js';
import { MAKE_REAL_PROVIDER, MAKE_REAL_WORKFLOW } from '../shared/makeItReal.js';
import { patchLtx25IcLora } from './ltx25IcLora.js';
import { LTX25_EXTEND, LTX25_EXTEND_WORKFLOW, patchLtx25Extend, type ExtendPlan } from './ltx25Extend.js';
import { FOOTAGE_FX_PROVIDER, FOOTAGE_FX_WORKFLOW } from '../shared/footageFx.js';
import { withRefGrammar } from '../shared/promptRefs.js';
import { engineModelKey } from '../shared/modelIds.js';
import { mmaudioParts, MMAUDIO_CHUNK_SEC, MMAUDIO_FPS } from '../shared/mmaudioParts.js';
import { QWEN3_TTS, QWEN3_TTS_WORKFLOW, patchQwen3Tts } from '../tools/voice/qwen3tts.js';
import { resolutionSelectorAspect } from './resolutionSelector.js';
import { SEPARATION_WORKFLOW, SEP_NODES, NO_SEPARATION_NOTE, separationStatus } from './separation.js';

export type FileRef = { __file: string };
export const F = (p: string): FileRef => ({ __file: p });
/** Pre-step the runner performs before a pass (ffmpeg on the box); the pass graph references `out`. */
export type Prep =
  | { kind: 'fps'; src: string; out: string; fps: number; width: number; height: number; start?: number; seconds?: number; /** keep the sound (AAC) instead of dropping it (H3 Ref2VA takes the clip's audio) */ audio?: boolean; /** exactly this many frames: the clip, then its last frame held (H3's 17k+5 grid; the sound is not padded) */ frames?: number }
  | { kind: 'frame'; src: string; out: string; at: number | 'last'; width?: number; height?: number }
  | { kind: 'frameFromPass'; pass: number; out: string }
  /** text output of an earlier pass → graph input, optionally machine-translated by the server (translate.ts) */
  | { kind: 'textFromPass'; pass: number; node: string; field: string; translateTo?: string }
  /** server-side: transcribe `src` (faster-whisper), translate (NLLB-200 / LibreTranslate), write into graph[node].inputs[field] */
  | { kind: 'speech'; src: string; node: string; field: string; translateTo: string; /** transcribe this earlier pass output instead of src (the separated voice) */ srcPass?: PassFile }
  /** an earlier pass's output file → graph input (the separated voice as the clone reference) */
  | { kind: 'fileFromPass'; from: PassFile; node: string; field: string };
/** One output file of an earlier pass: outs[pass][index] (index follows output, then extraOutputs). */
export type PassFile = { pass: number; index: number };
/** A sound under the new voice (comfy/dubMix.ts): the source clip's own audio, or an earlier pass's output (the separated background), at this volume. */
export type MixBed = { from: 'source' | PassFile; volume: number };
export interface Pass { label: string; workflow: string; graph: Record<string, any>; output: string; extraOutputs?: { node: string; label: string }[]; prep?: Prep[];
  /** Auxiliary run evidence, never a generated result or input to postprocessing. */
  diagnostics?: { node: string; label: string; stage: string; note: string }[];
  /** What the UI asked for, for graph assertions (readiness/graph). */ expect: Record<string, any> }
export type Post =
  | { kind: 'each'; /** only these passes become outputs (e.g. skip a transcript pass) */ only?: number[] }
  | { kind: 'concat'; /** (O) keep the passes' audio (all passes are LTX-2 audio+video) */ audio?: boolean }
  /** audio passes joined back to back into one track (MMAudio parts), then muxOnto as usual */
  | { kind: 'audioConcat' }
  | { kind: 'concatGroups'; groups: { label: string; passes: number[] }[]; audio: boolean }
  | { kind: 'xfade'; chunks: { start: number; length: number }[]; fps: number }
  /** Talking Video (comfy/infiniteTalkCloud.ts): the parts crossfaded at each next part's start, over one audio file (the full speech) */
  | { kind: 'talkJoin'; parts: { start: number; end: number }[]; fade: number; fps: number; audio: string; seconds: number }
  /** LTX-2.5 Extend: join the pass output onto the conformed source (comfy/ltx25Extend.ts joinExtension) */
  | { kind: 'extend'; plan: ExtendPlan; label: string; /** the clip to join onto (default input.videoPath; H3 Extend · Comfy Cloud: its conformed copy) */ source?: string; /** keep at most this many frames of the render (H3's grid rounds up) */ maxGenFrames?: number }
  /** Voice tools (comfy/dubMix.ts): the voice pass's output mixed over beds (separated background, or the ducked original) into one track. */
  | { kind: 'voiceMix'; pass: number; beds: MixBed[] }
  | { kind: 'splice'; ranges: { start: number; end: number }[]; extraEach: number; fps: number; width: number; height: number };
export interface Plan { tool: string; passes: Pass[]; post: Post; outKind: 'video' | 'image' | 'audio'; muxSourceAudio: boolean; labels?: string[]; notes: string[]; /** final ffmpeg fps resample */ postFps?: number; /** audio outputs muxed onto this video (replace or duck the original) */ muxOnto?: { video: string; mix: 'replace' | 'blend' };
  /** Voice tools: the plan splits voice from background first (comfy/separation.ts); kept on the job so a rebuild (Get workflow) matches the run. */ separation?: boolean }

const wf = (f: string) => JSON.parse(readFileSync(path.isAbsolute(f) ? f : path.join(WORKFLOWS_DIR, f), 'utf8'));
const nm = (name: string) => JSON.parse(readFileSync(path.join(WORKFLOWS_DIR, 'node-maps', `${name}.json`), 'utf8'));
const isLink = (v: any) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string';
/** Set node.field; follows a link into a Primitive* node; supports dotted dynamic-combo keys. Throws on a missing node. */
export function setIn(g: Record<string, any>, node: string, field: string, val: unknown) {
  const n = g[node]; if (!n) throw new Error(`graph has no node ${node} (for ${field})`);
  const cur = n.inputs[field];
  if (isLink(cur) && g[cur[0]] && /^Primitive/.test(g[cur[0]].class_type)) { g[cur[0]].inputs.value = val; return; }
  n.inputs[field] = val;
}
/** Remove a node and every dynamic (autogrow "a.b") input that links to it; a fixed input linking to it is an error. */
/** Remove optional inputs (matching `keys`) that link to node `id`, so dropNode can delete it (Qwen edit's image2 / image3). */
export function unlinkOptional(g: Record<string, any>, id: string, keys: RegExp) {
  for (const n of Object.values<any>(g)) for (const [k, v] of Object.entries<any>(n.inputs ?? {})) if (keys.test(k) && isLink(v) && v[0] === id) delete n.inputs[k];
}
export function dropNode(g: Record<string, any>, id: string) {
  delete g[id];
  for (const [nid, n] of Object.entries<any>(g)) for (const [k, v] of Object.entries<any>(n.inputs)) if (isLink(v) && v[0] === id) {
    if (k.includes('.')) delete n.inputs[k]; else throw new Error(`cannot drop ${id}: ${nid}.${k} needs it`);
  }
}
/** Keep only nodes an output node depends on (ComfyUI only validates/executes these). */
export function pruneUnreachable(g: Record<string, any>, outputs: string[]) {
  const keep = new Set<string>(); const st = [...outputs];
  while (st.length) { const id = st.pop()!; if (keep.has(id) || !g[id]) continue; keep.add(id); for (const v of Object.values<any>(g[id].inputs)) if (isLink(v)) st.push(v[0]); }
  for (const id of Object.keys(g)) if (!keep.has(id)) delete g[id];
}
const seedTo = (g: any, s: { node?: string; nodes?: string[]; field: string } | undefined, seed: number) => { if (!s) return; for (const n of s.nodes ?? [s.node!]) if (g[n]) setIn(g, n, s.field, seed); };
const byClass = (g: any, re: RegExp) => Object.entries<any>(g).filter(([, n]) => re.test(n.class_type));
/** Set every frame-rate input in the graph to one value (CreateVideo fps, LTXV conditioning/audio-latent frame_rate). */
export function setFps(g: any, fps: number) {
  for (const [, n] of byClass(g, /^(CreateVideo|LTXVConditioning|LTXVEmptyLatentAudio)$/)) for (const k of ['fps', 'frame_rate']) if (k in n.inputs && !isLink(n.inputs[k])) n.inputs[k] = fps;
}
const r = (n: number, m: number) => Math.max(m, Math.round(n / m) * m);
/** Long side per quality class, short side by aspect, both multiples of `mult` (16 Wan, 32 LTX). */
export function sizeFor(res: string, w = 16, h = 9, mult = 16) {
  const long = res === '480p' ? 832 : res === '1080p' ? 1920 : 1280; const land = w >= h;
  const a = land ? h / w : w / h; const L = r(long, mult), S = r(long * a, mult);
  return land ? { width: L, height: S } : { width: S, height: L };
}
const wan4n1 = (frames: number) => Math.max(5, Math.round((frames - 1) / 4) * 4 + 1);
const clampSeed = (s: any) => Math.max(0, Math.floor(Number(s) || 0));

// ---------------- video-swap family ----------------
/** Wan 2.2 Animate reads a caption of the result, not an instruction (shared/promptPatterns.ts video-swap); a user prompt wins; "Who to replace" becomes the caption's subject. */
function swapPrompt(i: Record<string, any>): string { // same wording as comfyClient.buildPrompt
  if (i.comfyPrompt?.trim()) return i.comfyPrompt; if (i.prompt?.trim()) return i.prompt.trim();
  return fillPattern('video-swap', 'wan-2.2-animate-14b', { subject: captionSubject(i.target) });
}
function objectSwap(job: Job): Plan {
  const i = job.input; const sp = swapPrompt(i); const prep = planObjectSwap(i as any); const out16 = `${i.videoPath}.${job.id}-16fps.mp4`;
  const mask16 = prep.mask ? `${i.maskPath}.${job.id}-16fps.mp4` : null; // optional matte upload → mask-ext-N, converted like the source
  const graph = patchGraph(wf(prep.file), prep, { image: F(i.imagePath ?? i.refPaths?.[0]), video: F(out16), prompt: sp, seed: clampSeed(i.seed), extraRefs: (i.refPaths ?? []).slice(1, MAX_SWAP_REFS).map(F), ...(mask16 ? { mask: F(mask16) } : {}) });
  return { tool: job.toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: i.keepAudio !== false, notes: [],
    passes: [{ label: 'Result', workflow: path.relative(WORKFLOWS_DIR, prep.file), graph, output: '277', prep: [{ kind: 'fps', src: i.videoPath, out: out16, fps: 16, width: prep.width, height: prep.height, seconds: prep.seconds }, ...(mask16 ? [{ kind: 'fps' as const, src: i.maskPath, out: mask16, fps: 16, width: prep.width, height: prep.height, seconds: prep.seconds }] : [])],
      expect: { fps: 16, width: prep.width, height: prep.height, mult: 16, seed: clampSeed(i.seed), prompt: sp, refs: Math.min(MAX_SWAP_REFS, (i.refPaths ?? []).length), point: prep.point, ext: prep.ext, seconds: prep.seconds } }] };
}
function motionTransfer(job: Job): Plan {
  const i = job.input; const v = pickVariant(i.duration); const file = path.join(WORKFLOWS_DIR, 'motion-transfer', `ext-${v.ext}.json`);
  const size = planObjectSwap(i as any); const out16 = `${i.videoPath}.${job.id}-16fps.mp4`; const g = wf(file); const seed = clampSeed(i.seed);
  const prompt = i.prompt?.trim() || fillPattern('motion-transfer', 'wan-2.2-animate-14b');
  setIn(g, '10', 'image', F(i.refPaths?.[0] ?? i.imagePath)); setIn(g, '145', 'file', F(out16)); setIn(g, '21', 'text', prompt);
  setIn(g, '159', 'value', size.width); setIn(g, '160', 'value', size.height);
  if (g['232:63']) g['232:63'].inputs.seed = seed; for (const k of Object.keys(g)) if (/^ext\d+:91$/.test(k)) g[k].inputs.seed = seed + Number(k.slice(3, k.indexOf(':')));
  return { tool: job.toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: i.keepAudio !== false, notes: [],
    passes: [{ label: 'Result', workflow: path.relative(WORKFLOWS_DIR, file), graph: g, output: '277', prep: [{ kind: 'fps', src: i.videoPath, out: out16, fps: 16, width: size.width, height: size.height, seconds: v.seconds }],
      expect: { fps: 16, width: size.width, height: size.height, mult: 16, seed, prompt, ext: v.ext, seconds: v.seconds } }] };
}
function restyle(job: Job): Plan {
  const i = job.input; const size = sizeFor(i.resolution === '480p' || i.draft ? '480p' : '720p', i.width, i.height, 16); // Wan2.1 VACE 14B: 480P + 720P
  const frames = Math.round(Math.min(i.duration, 30) * VACE_FPS); const chunks = planChunks(frames);
  const { prompt, negative } = restylePrompt(i.preset ?? '', i.prompt ?? ''); const style = i.customStyle && i.refPaths?.[0] ? i.refPaths[0] : swatchPath(i.preset ?? '');
  const src16 = `${i.videoPath}.${job.id}-16fps.mp4`;
  const passes = chunks.map((c, k) => {
    const cut = `${i.videoPath}.${job.id}-c${k}.mp4`;
    const g = patchRestyle(wf('restyle-api.json'), { video: F(cut), style: style ? F(style) : null, prompt, negative, seed: clampSeed(i.seed) + k, width: size.width, height: size.height, length: c.length });
    return { label: `Pass ${k + 1}`, workflow: 'restyle-api.json', graph: g, output: '114', prep: [...(k === 0 ? [{ kind: 'fps' as const, src: i.videoPath, out: src16, fps: VACE_FPS, width: size.width, height: size.height }] : []), { kind: 'fps' as const, src: src16, out: cut, fps: VACE_FPS, width: size.width, height: size.height, start: c.start / VACE_FPS, seconds: c.length / VACE_FPS }],
      expect: { fps: VACE_FPS, width: size.width, height: size.height, mult: 16, frames: c.length, rule: '4n+1', seed: clampSeed(i.seed) + k, prompt, style: !!style, chunk: c } };
  });
  return { tool: job.toolId, outKind: 'video', post: { kind: 'xfade', chunks, fps: VACE_FPS }, muxSourceAudio: i.keepAudio !== false, passes, labels: ['Result'], notes: chunks.length > 1 ? [`${chunks.length} overlapping passes (81 frames, 16 overlap), crossfaded`] : [] };
}
// ---------------- re-shoot ----------------
function reshoot(job: Job): Plan {
  const i = job.input; const engine = reshootEngine(job.provider); const seed = clampSeed(i.seed);
  const ranges = (i.angles ?? []) as { start: number; end: number; angle: string; preset?: string | null }[];
  const full = i.fullClip ? ranges.map((a) => ({ ...a, start: 0, end: i.duration })) : [];
  const passes: Pass[] = [...ranges, ...full].map((a, k) => {
    const secs = Math.max(0.5, a.end - a.start); const seg = `${i.videoPath}.${job.id}-r${k}.mp4`; const first = `${i.videoPath}.${job.id}-r${k}.png`;
    if (engine === 'ltx') {
      const size = sizeFor(i.resolution === '1080p' ? '720p' : i.resolution, i.width, i.height, 32); // LTX-2: /32; 1080p via the x2 latent upscaler in-graph
      const g = patchReshootLtx(wf('reshoot-api.json'), { video: F(seg), startImage: F(first), prompt: i.prompt ?? '', angle: a.angle, preset: a.preset, seconds: secs, seed: seed + k });
      setIn(g, '166', 'value', size.width); setIn(g, '167', 'value', size.height); setIn(g, '143:145', 'value', 24); setIn(g, '143:148', 'value', 24);
      return { label: a.angle, workflow: 'reshoot-api.json', graph: g, output: '175', prep: [{ kind: 'fps', src: i.videoPath, out: seg, fps: 24, width: size.width, height: size.height, start: a.start, seconds: secs }, { kind: 'frame', src: seg, out: first, at: 0 }],
        expect: { fps: 24, width: size.width, height: size.height, mult: 32, frames: ltxFrames(secs), rule: '8n+1', seed: seed + k, lora: angleParams(a.angle, a.preset).ltx, loraStrength: 1 } };
    }
    const size = sizeFor(funRes(i), i.width, i.height, 16); const g = wf('reshoot-funcamera-api.json'); const len = wan4n1(secs * 16);
    setIn(g, '97', 'image', F(first)); setIn(g, '107', 'text', `${i.prompt ? i.prompt + '. ' : ''}${angleParams(a.angle, a.preset).hint}`);
    Object.assign(g['108'].inputs, { camera_pose: angleParams(a.angle, a.preset).fun, width: size.width, height: size.height, length: len }); g['102'].inputs.noise_seed = seed + k; setFps(g, 16);
    return { label: a.angle, workflow: 'reshoot-funcamera-api.json', graph: g, output: '106', prep: [{ kind: 'frame', src: i.imageSourcePath || i.videoPath, out: first, at: i.imageSourcePath ? 0 : a.start, width: size.width, height: size.height }], // still source: the image is the first frame
      expect: { fps: 16, width: size.width, height: size.height, mult: 16, frames: len, rule: '4n+1', seed: seed + k } };
  });
  const sz = sizeFor(i.resolution, i.width, i.height, engine === 'ltx' ? 32 : 16);
  if (i.sourceKind === 'image') return { tool: job.toolId, outKind: 'video', passes, muxSourceAudio: false, labels: ['Multi-angle cut'], notes: [`engine ${engine}`, 'still source: angle clips joined in order'], post: { kind: 'concat', audio: false } }; // no source clip to splice into
  return { tool: job.toolId, outKind: 'video', passes, muxSourceAudio: !i.audioReplaced, labels: ['Multi-angle cut', ...full.map((a) => a.angle)], notes: [`engine ${engine}`],
    post: { kind: 'splice', ranges, extraEach: full.length, fps: engine === 'ltx' ? 24 : 16, width: engine === 'ltx' ? sz.width : sizeFor(funRes(i), i.width, i.height).width, height: engine === 'ltx' ? sz.height : sizeFor(funRes(i), i.width, i.height).height } };
}
// ---------------- apps ----------------
/** Wan 2.2 Fun Camera 14B: 480p or 720p (1080p is capped to 720p). */
const funRes = (i: Record<string, any>) => (i.resolution === '480p' || i.draft ? '480p' : '720p');
/** Director (cinema) + Orbit Shot: one shot (or 4 Auto panels), each a chain of camera-timeline segments, concatenated per shot with audio. */
function cinema(job: Job): Plan {
  const i = job.input; const seed = clampSeed(i.seed); const ref: string | undefined = i.refPaths?.[0] ?? i.imagePath;
  const fun = job.provider === 'comfy-funcamera' && !!ref; const dur = Number(i.duration) || 5;
  const shots: { label: string; prompt: string; segments: any[]; seedOffset?: number }[] = i.auto && i.panels?.length
    ? i.panels.map((p: any) => ({ label: p.label, prompt: p.finalPrompt, segments: p.segments ?? [] }))
    : Array.from({ length: Math.min(4, Math.max(1, Number(i.count) || 1)) }, (_, t, n = Math.min(4, Math.max(1, Number(i.count) || 1))) => ({ label: n > 1 ? `Take ${t + 1}` : 'Shot', prompt: i.finalPrompt ?? i.prompt ?? '', segments: i.timeline ?? [], seedOffset: t * 1000 }));
  const [aw, ah] = String(i.aspect || '16:9').split(':').map(Number).map((x) => (x > 0 ? x : 1)); // Director aspect → width/height
  const wantAudio = !fun && i.audio !== false; // LTX-2 makes joint audio; Fun Camera is video only
  const passes: Pass[] = []; const groups: { label: string; passes: number[] }[] = [];
  for (const shot of shots) {
    const segs = shot.segments.length ? shot.segments : [{ start: 0, end: dur, phrase: 'locked-off static camera', ltx: 'ltx-static', funCamera: 'Static', move: 'static' }];
    const idx: number[] = [];
    segs.forEach((sg: any, n: number) => {
      const k = passes.length; const sd = seed + (shot.seedOffset ?? 0) + k; const secs = Math.max(0.5, sg.end - sg.start); const prev = idx[idx.length - 1];
      const img = n === 0 ? ref : `${DATA_TMP(job)}-c${k - 1}-last.png`; const prep: Prep[] = n === 0 ? [] : [{ kind: 'frameFromPass', pass: prev, out: img! }];
      const text = `${shot.prompt}. ${sg.phrase}`;
      if (fun) {
        const size = sizeFor(funRes(i), aw, ah, 16); const g = wf('camera-moves-api.json'); const len = wan4n1(secs * 16);
        setIn(g, '97', 'image', F(img!)); setIn(g, '107', 'text', text); Object.assign(g['108'].inputs, { camera_pose: sg.funCamera ?? 'Static', speed: 1, width: size.width, height: size.height, length: len }); g['102'].inputs.noise_seed = sd; setFps(g, 16);
        passes.push({ label: sg.move, workflow: 'camera-moves-api.json', graph: g, output: '106', prep, expect: { fps: 16, width: size.width, height: size.height, mult: 16, frames: len, rule: '4n+1', seed: sd, prompt: text, aspect: `${aw}:${ah}`, audio: false } });
      } else {
        const size = sizeFor(i.resolution === '480p' || i.draft ? '480p' : '720p', aw, ah, 32); const g = wf('camera-ltx-api.json'); const frames = Math.max(9, Math.round((secs * 24) / 8) * 8 + 1);
        const lp = sg.ltx ? LTX_CAMERA_PRESETS[sg.ltx] : undefined; // no LoRA for this move → static LoRA at strength 0, move carried by the prompt phrase
        g['300'].inputs.lora_name = (lp ?? LTX_CAMERA_PRESETS['ltx-static']).lora; g['300'].inputs.strength_model = lp ? lp.strength : 0;
        setIn(g, '92:3', 'text', text); setIn(g, '92:62', 'value', frames); g['102'].inputs['resize_type.width'] = size.width; g['102'].inputs['resize_type.height'] = size.height;
        for (const nn of ['92:11', '92:67']) g[nn].inputs.noise_seed = sd; setFps(g, 24);
        if (!wantAudio) { delete g['92:97'].inputs.audio; delete g['92:96']; } // audio off: no audio track decoded/muxed
        if (img) setIn(g, '98', 'image', F(img));
        else { // text-to-video: blank guide image, image conditioning bypassed
          g['398'] = { class_type: 'EmptyImage', inputs: { width: size.width, height: size.height, batch_size: 1, color: 0 } }; g['102'].inputs.input = ['398', 0]; delete g['98'];
          g['92:107'].inputs.bypass = true; g['92:108'].inputs.bypass = true;
        }
        passes.push({ label: sg.move, workflow: 'camera-ltx-api.json', graph: g, output: '75', prep, expect: { fps: 24, width: size.width, height: size.height, mult: 32, frames, rule: '8n+1', seed: sd, prompt: text, aspect: `${aw}:${ah}`, audio: wantAudio, lora: g['300'].inputs.lora_name, loraStrength: g['300'].inputs.strength_model, t2v: !img } });
      }
      idx.push(k);
    });
    groups.push({ label: shot.label, passes: idx });
  }
  return { tool: job.toolId, outKind: 'video', passes, post: { kind: 'concatGroups', groups, audio: wantAudio }, muxSourceAudio: false, labels: groups.map((g) => g.label), notes: [`engine ${fun ? 'funcamera' : 'ltx'}${!ref ? ' (text-to-video)' : ''}`] };
}
const DATA_TMP = (job: Job) => path.join(DATA_DIR, job.id);
function camera(job: Job): Plan {
  const i = job.input; const seed = clampSeed(i.seed); const ids: string[] = i.types ?? []; const plan = mixPlan(ids, i.duration || 5);
  const passes: Pass[] = []; const prompt = i.finalPrompt ?? i.prompt ?? '';
  const base = i.imagePath ?? DATA_TMP(job); // text-to-video (no start image): chained frames live next to the job's own files
  for (const p of plan) {
    if (p.engine === 'funcamera') for (const s of p.segments) {
      const k = passes.length; const size = sizeFor(i.resolution === '480p' || i.draft ? '480p' : '720p', 16, 9, 16); const g = wf('camera-moves-api.json'); const img = k === 0 ? i.imagePath : `${base}.${job.id}-last${k - 1}.png`;
      if (!img) throw new Error('Wan 2.2 Fun Camera needs a start image (image-to-video only).');
      setIn(g, '97', 'image', F(img)); setIn(g, '107', 'text', `${prompt}. ${p.sentence}`); Object.assign(g['108'].inputs, { camera_pose: s.pose, speed: s.speed, width: size.width, height: size.height, length: s.length }); g['102'].inputs.noise_seed = seed + k; setFps(g, 16);
      passes.push({ label: s.pose, workflow: 'camera-moves-api.json', graph: g, output: '106', prep: k ? [{ kind: 'frameFromPass', pass: k - 1, out: img }] : [], expect: { fps: 16, width: size.width, height: size.height, mult: 16, frames: s.length, rule: '4n+1', seed: seed + k } });
    } else {
      // (O) end frame: the LAST move uses camera-ltx-flf-api.json (LTXVAddGuide at frame -1) when endImagePath is set
      const flf = !!i.endImagePath && p === plan[plan.length - 1]; const file = flf ? 'camera-ltx-flf-api.json' : 'camera-ltx-api.json';
      const k = passes.length; const size = sizeFor(i.resolution === '480p' ? '480p' : '720p', 16, 9, 32); const g = wf(file); const img: string | undefined = k === 0 ? i.imagePath : `${base}.${job.id}-last${k - 1}.png`;
      if (flf) { setIn(g, '200', 'image', F(i.endImagePath)); g['201'].inputs['resize_type.width'] = size.width; g['201'].inputs['resize_type.height'] = size.height; }
      if (i.generateAudio === false) delete g['92:97'].inputs.audio; // (O) generateAudio:false → silent clip (LTX-2 still renders audio jointly; it is just not written)
      const lp = p as any;
      if (img) setIn(g, '98', 'image', F(img));
      else { // text-to-video: blank guide image, image conditioning bypassed (same as the Director's LTX text path)
        g['398'] = { class_type: 'EmptyImage', inputs: { width: size.width, height: size.height, batch_size: 1, color: 0 } }; g['102'].inputs.input = ['398', 0]; delete g['98'];
        g['92:107'].inputs.bypass = true; g['92:108'].inputs.bypass = true; }
      setIn(g, '92:3', 'text', `${prompt}. ${lp.sentence}`); g['300'].inputs.lora_name = lp.lora; g['300'].inputs.strength_model = lp.strength;
      setIn(g, '92:62', 'value', lp.frames); g['102'].inputs['resize_type.width'] = size.width; g['102'].inputs['resize_type.height'] = size.height; for (const n of ['92:11', '92:67']) g[n].inputs.noise_seed = seed + k; setFps(g, 24);
      passes.push({ label: lp.hint, workflow: file, graph: g, output: '75', prep: k ? [{ kind: 'frameFromPass', pass: k - 1, out: img! }] : [], expect: { fps: 24, width: size.width, height: size.height, mult: 32, frames: lp.frames, rule: '8n+1', seed: seed + k, lora: lp.lora, loraStrength: lp.strength, ...(flf ? { endFrame: true } : {}), audio: i.generateAudio !== false, t2v: !img } });
    }
  }
  const allLtx = plan.length > 0 && plan.every((p) => p.engine === 'ltx'); // (O) LTX-2 clips carry generated audio: keep it unless generateAudio is false
  return { tool: job.toolId, outKind: 'video', passes, post: { kind: 'concat', audio: allLtx && i.generateAudio !== false }, muxSourceAudio: false, labels: [ids.map((x) => cameraPreset(x) ? x : x).join(' + ') || 'Result'], notes: i.imagePath ? [] : ['text-to-video (no start image)'] };
}
function photoFx(job: Job): Plan {
  const i = job.input; const [aw, ah] = !i.aspect || i.aspect === 'auto' ? [16, 9] : String(i.aspect).split(':').map(Number); // DP #21: Photo FX aspect (auto = 16:9 as before)
  const size = sizeFor(i.resolution === '480p' || i.draft ? '480p' : '720p', aw || 16, ah || 9, 16); const g = wf('photo-fx-api.json'); const seed = clampSeed(i.seed);
  setIn(g, '97', 'image', F(i.imagePath)); setIn(g, '129:93', 'text', i.finalPrompt ?? i.prompt ?? ''); setIn(g, '129:98', 'width', size.width); setIn(g, '129:98', 'height', size.height);
  setIn(g, '129:161', 'value', i.duration || 5); setIn(g, '129:162', 'value', 16); g['129:86'].inputs.noise_seed = seed;
  return { tool: job.toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: false, notes: [], passes: [{ label: 'Result', workflow: 'photo-fx-api.json', graph: g, output: '108', expect: { fps: 16, width: size.width, height: size.height, mult: 16, seconds: i.duration || 5, seed } }] };
}
function upscale(job: Job, srcFps = 30): Plan {
  const i = job.input;
  if (VUP_LOCAL.includes(job.provider)) { // shared/videoUpscale.ts: Real-ESRGAN x2 / 4x-UltraSharp (any machine), SeedVR2 3B native (CUDA)
    const m = VUP_MODELS[job.provider]; const file = m.workflow!; const short = vupShortSide(i); const seed = clampSeed(i.seed);
    const g = vupGraph(job.provider, wf(file), { file: F(i.videoPath), short, seed });
    return { tool: job.toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: i.keepAudio !== false, notes: [`${m.name}${m.file ? ` (${m.file})` : ''} → short side ${short} px`],
      passes: [{ label: 'Result', workflow: file, graph: g, output: '17', expect: { shortSide: short, model: m.name, ...(m.file ? { modelFile: m.file } : { seed }) } }] };
  } const mode = (i.types?.[0] as string) ?? 'precise'; const file = UPSCALE_WORKFLOWS[mode] ?? UPSCALE_WORKFLOWS.precise; let g = wf(file);
  setIn(g, '18', 'file', F(i.videoPath)); g['15:4'].inputs.resolution = i.outputSize ? Math.min(i.outputSize.width, i.outputSize.height) : 1080; g['15:4'].inputs.max_resolution = i.outputSize ? Math.max(i.outputSize.width, i.outputSize.height) : 0; g['15:4'].inputs.seed = clampSeed(i.seed);
  if (mode === 'smooth60') g = patchUpscale60(g, srcFps);
  const s60 = mode === 'smooth60';
  return { tool: job.toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: i.keepAudio !== false, notes: s60 ? [`RIFE ×${g['400'].inputs.multiplier} → ${g['16'].inputs.fps} fps, ffmpeg fps=60`] : [], ...(s60 ? { postFps: 60 } : {}),
    passes: [{ label: 'Result', workflow: file, graph: g, output: '17', expect: { shortSide: g['15:4'].inputs.resolution, seed: clampSeed(i.seed), batch: g['15:4'].inputs.batch_size, rule: '4n+1', ...(s60 ? { fps: g['16'].inputs.fps, rifeAtLeast60: g['16'].inputs.fps >= 60, finalFps: 60 } : {}) } }] };
}
/** FPS Boost (local RIFE 4.9, workflows/fps-boost-rife-api.json; ComfyUI-Frame-Interpolation's 'RIFE VFI' + rife49.pth). multiplier = ceil(target / source fps),
 *  CreateVideo at source × multiplier, then ffmpeg fps=<target> (postFps) for the exact rate. Target = types[0] / targetFps (48 | 60). */
export function fpsBoostGraph(graph: Record<string, any>, srcFps: number, target: number) {
  const g = structuredClone(graph); const src = srcFps > 0 ? srcFps : 30; const mult = Math.max(2, Math.ceil(target / src - 1e-6));
  g['3'].inputs.multiplier = mult; g['4'].inputs.fps = Math.min(240, src * mult); return { g, mult };
}
function fpsBoost(job: Job, srcFps = 30): Plan {
  const i = job.input; const target = Number(i.types?.[0] ?? i.fields?.targetFps) === 48 ? 48 : 60;
  const { g, mult } = fpsBoostGraph(wf('fps-boost-rife-api.json'), srcFps, target); setIn(g, '1', 'file', F(i.videoPath));
  return { tool: job.toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: i.keepAudio !== false, postFps: target, notes: [`RIFE ×${mult} → ${g['4'].inputs.fps} fps, ffmpeg fps=${target}`],
    passes: [{ label: `${target} fps`, workflow: 'fps-boost-rife-api.json', graph: g, output: '5', expect: { fps: g['4'].inputs.fps, multiplier: mult, finalFps: target } }] };
}
/** Edit jobs whose output takes the app's aspect instead of the input photo's shape (where the graph allows it): Character Sheet. */
const CHARACTER_SHEET_TOOLS = new Set(['app-character-sheet', 'app-ad-pack']); // Ad Pack (2026-10-31): the platform's shape, not the product photo's
const IMAGE_WF: Record<string, Record<string, string>> = {
  'comfy-qwen21': { generate: 'create-image-qwen21-t2i', edit: 'create-image-qwen21-edit', multiref: 'create-image-qwen21-edit' /* 2 images: the template's two inputs */ },
  'comfy-qwen21-turbo': { generate: 'create-image-qwen21-turbo-t2i', edit: 'create-image-qwen21-turbo-edit' /* official Turbo templates: 8 steps, edit takes ONE image (no multiref) */ },
  'comfy-qwen-image': { generate: 'create-image-qwen-t2i', edit: 'create-image-qwen-edit2509', inpaint: 'create-image-qwen-edit2509', multiref: 'create-image-qwen-edit2509-multiref' /* 2–3 images (Face Swap) */ },
  'comfy-qwen-angles': { edit: 'shots-qwen-edit2509-angles' }, // Shots: + multiple-angles LoRA (Apache-2.0)
  'comfy-zimage-turbo': { generate: 'create-image-zimage-turbo' }, 'comfy-zimage': { generate: 'create-image-zimage' },
  'comfy-moss-image': { generate: 'create-image-moss-image' }, 'comfy-moss-image-base': { generate: 'create-image-moss-image-base' },
  'comfy-flux3-klein': { generate: 'create-image-flux3klein-t2i', edit: 'create-image-flux3klein-edit', inpaint: 'create-image-flux3klein-inpaint', multiref: 'create-image-flux3klein-multiref' },
  'comfy-klein4b': { generate: 'create-image-klein4b-t2i', edit: 'create-image-klein4b-edit' }, 'comfy-flux2dev': { generate: 'create-image-flux2dev', edit: 'create-image-flux2dev' },
};
import { imageSize, RES_PX, type ImageRes } from '../shared/imageCaps.js';
import { bfsSwapFor, bfsSwapPrompt } from './bfsSwap.js';
import { FLUX3_KLEIN_PROVIDER, applyKleinUpsampler, applyKleinBoxes } from './flux3Klein.js';
/** Qwen Image 2.1 tags each input image as <image1>, <image2> in its text encoder (comfy/text_encoders/qwen_image21.py), and the official
 *  prompt enhancer writes multi-image instructions with those tags. Our two-image prompts say "image 1" / "image 2": point them at the tags. */
export const qwen21ImageTags = (p: string) => p.replace(/(?<![<\w])@?\bimage\s*([1-9])\b(?!>)/gi, '<image$1>'); // "@image2" (the composer's mention) and "image 2" → <image2>; a tag the shared rewrite already wrote stays one tag
/** Edit Image size on the local edit graphs (Create Image with a photo; imageCaps `edit` says what each model honours):
 *  Qwen Image 2.1 / Turbo: the encoder's `resolution` (1K = 1024, 2K = 2048) sizes the photo and its own latent output, so Auto follows the
 *  photo's shape; a picked aspect switches the latent to the template's EmptyLatentImage at that shape (multiples of 32).
 *  FLUX 3 Klein (ReferenceMultiLatent) and FLUX.2 klein 4B / dev (ImageScaleToTotalPixels → latent from the scaled photo): 1 / 4 / 16 MP, the photo's shape. */
export function editSize(g: Record<string, any>, i: { imageResolution?: string; aspect?: string; aspectAuto?: boolean; n?: number }) {
  const res = (i.imageResolution ?? '1K') as ImageRes; const L = RES_PX[res] ?? 1024; const mp = (L / 1024) ** 2; const out: Record<string, unknown> = { imageResolution: res };
  for (const [id, n] of byClass(g, /^TextEncodeQwenImage21$/)) {
    n.inputs.resolution = L; out.encoderResolution = L;
    const sw = Object.values<any>(g).find((x) => x.class_type === 'ComfySwitchNode' && isLink(x.inputs.on_false) && x.inputs.on_false[0] === id && x.inputs.on_false[1] === 2);
    const empty = sw && isLink(sw.inputs.on_true) ? g[sw.inputs.on_true[0]] : null;
    if (i.aspectAuto === false && i.aspect && sw && empty?.class_type === 'EmptyLatentImage') {
      const s = imageSize(i.aspect, res); const r32 = (v: number) => Math.max(256, Math.round(v / 32) * 32);
      sw.inputs.switch = true; Object.assign(empty.inputs, { width: r32(s.width), height: r32(s.height) }); out.width = empty.inputs.width; out.height = empty.inputs.height;
    } else out.followsPhoto = true;
  }
  for (const [, n] of byClass(g, /^ReferenceMultiLatent$/)) if (n.inputs.resolution === 'resize') { n.inputs['resolution.megapixels'] = mp; out.megapixels = mp; out.followsPhoto = true; }
  for (const [, n] of byClass(g, /^ImageScaleToTotalPixels$/)) { n.inputs.megapixels = mp; out.megapixels = mp; out.followsPhoto = true; }
  return out;
}
function image(job: Job): Plan {
  const i = job.input; const mode = i.mode === 'inpaint' ? 'inpaint' : i.imagePath ? 'edit' : 'generate';
  const multi = mode === 'edit' && (i.refPaths?.length ?? 0) > 1 && !!IMAGE_WF[job.provider]?.multiref; // FLUX 3 Klein: 2–10 references; Qwen 2.1 / Qwen-Edit-2509: 2 / 2–3
  const bfs = multi ? bfsSwapFor(job.toolId, job.provider) : null; // Face Swap / Person Swap on Qwen 2.1: the BFS LoRA graph (comfy/bfsSwap.ts)
  const name = bfs ? bfs.graph : multi ? IMAGE_WF[job.provider].multiref : IMAGE_WF[job.provider]?.[mode] ?? IMAGE_WF[job.provider]?.generate; if (!name) throw new Error(`no local workflow for ${job.provider} (${mode})`);
  const m = nm(name); let file = m.workflowFile as string; if (mode === 'inpaint' && job.provider === 'comfy-qwen-image') file = 'create-image-qwen-edit2509-inpaint-api.json';
  const g = wf(file); const seed = clampSeed(i.seed); const prompt0 = i.enhancedPrompt ?? i.finalPrompt ?? i.prompt ?? '';
  // BFS: the creator's trigger prompt replaces our generic swap wording; the user's touch-ups (appPrompt) follow it
  const prompt = bfs ? bfsSwapPrompt(bfs, i.appPrompt) : (multi && job.provider === 'comfy-qwen21') || (mode === 'edit' && /^comfy-qwen21(-turbo)?$/.test(job.provider) && /@?\bimage\s*[1-9]\b/i.test(prompt0)) ? qwen21ImageTags(prompt0) : prompt0;
  if (m.inputs.prompt) setIn(g, m.inputs.prompt.node, m.inputs.prompt.field, prompt);
  // FLUX 3 Klein: the prompt upsampler runs unless the job turned it off (promptRewrite false); off cuts its branch (comfy/flux3Klein.ts)
  const upsampler = job.provider === FLUX3_KLEIN_PROVIDER ? applyKleinUpsampler(g, m.inputs, i) : null;
  const layoutBoxes = job.provider === FLUX3_KLEIN_PROVIDER ? applyKleinBoxes(g, m.boxes, i.layoutBoxes) : 0; // layout boxes (shared/layoutBoxes.ts); none = the box nodes are bypassed and pruned
  // Qwen Image 2.1: the encoder's prompt comes from an "enhance" switch whose off branch is empty in the template, so the
  // user prompt never arrived. Off: prompt literal on the encoder. On: prompt → TextGenerate (LLM rewrite) and switch on.
  for (const [id, n] of byClass(g, /^TextEncodeQwenImage21$/)) {
    const sw = isLink(n.inputs.prompt) ? g[g[n.inputs.prompt[0]]?.inputs?.source?.[0]] : null; const gen = sw?.inputs?.on_true ? g[sw.inputs.on_true[0]] : null;
    if (i.enhance && sw && gen?.class_type === 'TextGenerate') { sw.inputs.switch = true; gen.inputs.prompt = prompt; } else n.inputs.prompt = prompt;
    void id;
  }
  if (m.inputs.image && i.imagePath) setIn(g, m.inputs.image.node, m.inputs.image.field, F(i.imagePath));
  if (mode === 'inpaint' && g['900'] && i.maskPath) setIn(g, '900', 'image', F(i.maskPath));
  const refNodes = new Set<string>();
  if (multi) (m.refs as { node: string; field: string }[]).forEach((r, k) => { if (i.refPaths[k]) { setIn(g, r.node, r.field, F(i.refPaths[k])); refNodes.add(r.node); } else { unlinkOptional(g, r.node, /^image[23]$/); dropNode(g, r.node); } }); // Qwen edit: image2 / image3 are optional encoder inputs
  seedTo(g, m.seed, seed);
  // Unused template reference images (e.g. Qwen 2.1 edit's 2nd ref) would ship the template's sample file name → drop them.
  for (const [id, n] of byClass(g, /^LoadImage$/)) if (typeof n.inputs.image === 'string' && id !== m.inputs.image?.node && id !== '900' && !refNodes.has(id)) { try { dropNode(g, id); } catch { /* fixed input: handled below */ } }
  if (job.provider === 'comfy-flux2dev' && !i.imagePath) { // FLUX.2 dev template is reference-edit; text-to-image = same graph without the ReferenceLatent branch
    const sz = sizeFor(i.resolution && /p$/.test(i.resolution) ? i.resolution : '720p', 16, 9, 16);
    g['68:22'].inputs.conditioning = ['68:26', 0]; Object.assign(g['68:47'].inputs, { width: sz.width, height: sz.height }); Object.assign(g['68:48'].inputs, { width: sz.width, height: sz.height });
    for (const id of ['68:43', '68:44', '68:72', '45', '46']) delete g[id];
  }
  // Character Sheet with a photo (Oct 22): the sheet is landscape (app aspect 4:3), not the photo's shape. The Qwen Image 2.1 edit templates
  // offer this themselves: a switch picks the sampler latent from the encoder (image 1's size, default) or from an EmptyLatentImage.
  // We flip it and size that latent to the app's aspect at about the template's 1 MP budget (× 4 for 2K).
  let sheetSize: { width: number; height: number } | null = null;
  if (mode === 'edit' && CHARACTER_SHEET_TOOLS.has(job.toolId)) for (const [, ks] of byClass(g, /^KSampler$/)) {
    const sw = isLink(ks.inputs.latent_image) ? g[ks.inputs.latent_image[0]] : null; const empty = sw?.class_type === 'ComfySwitchNode' && isLink(sw.inputs.on_true) ? g[sw.inputs.on_true[0]] : null;
    if (!empty || !/^Empty.*LatentImage$/.test(empty.class_type)) continue;
    const [a, b] = String(i.aspect ?? '4:3').split(':').map(Number); const area = (i.imageResolution === '2K' ? 2048 : 1024) ** 2; const r = a > 0 && b > 0 ? a / b : 4 / 3;
    sheetSize = { width: Math.round(Math.sqrt(area * r) / 16) * 16, height: Math.round(Math.sqrt(area / r) / 16) * 16 };
    sw.inputs.switch = true; Object.assign(empty.inputs, sheetSize);
  }
  const edSize = mode === 'edit' && !bfs && job.toolId === 'create-image' && i.imageResolution ? editSize(g, i) : null; // Edit Image: 1K / 2K and Auto (= the photo's shape) or a picked aspect
  pruneUnreachable(g, [m.output.node]);
  const size = i.imageResolution ? imageSize(i.aspect ?? '1:1', i.imageResolution) /* per-model caps: aspect × 1K/2K */ : i.resolution && /p$/.test(i.resolution) ? sizeFor(i.resolution, 16, 9, 16) : null; const touched: string[] = [];
  if (size && mode === 'generate') for (const [id, n] of byClass(g, /^Empty.*LatentImage$/)) { for (const k of ['width', 'height'] as const) if (k in n.inputs) { setIn(g, id, k, size[k]); touched.push(id); } if ('batch_size' in n.inputs && Number(i.n) > 1) setIn(g, id, 'batch_size', Math.min(4, Number(i.n))); }
  const expect = { seed, prompt, ...(upsampler != null ? { upsampler } : {}), ...(layoutBoxes ? { layoutBoxes } : {}), ...(edSize ? { editSize: edSize } : {}), ...(bfs ? { lora: bfs.lora, loraStrength: bfs.strength } : {}), ...(size && touched.length ? { width: size.width, height: size.height, mult: 16 } : sheetSize ? { ...sheetSize, mult: 16 } : {}), image: !!m.inputs.image && !!i.imagePath, ...(multi ? { refs: refNodes.size } : {}) };
  // Shots (app-shots): one pass per picked angle on the same graph, each with its own camera prompt and seed + k (one output each, labelled)
  if (Array.isArray(i.shots) && i.shots.length && m.inputs.prompt) return { tool: job.toolId, outKind: 'image', post: { kind: 'each' }, muxSourceAudio: false, notes: [`${i.shots.length} angles, one pass each`],
    passes: i.shots.map((sh: { id: string; label: string; prompt: string }, k: number) => { const gk = structuredClone(g); setIn(gk, m.inputs.prompt.node, m.inputs.prompt.field, sh.prompt); seedTo(gk, m.seed, clampSeed(seed + k));
      return { label: sh.label, workflow: file, graph: gk, output: m.output.node, expect: { ...expect, seed: clampSeed(seed + k), prompt: sh.prompt, shot: sh.id } }; }) };
  return { tool: job.toolId, outKind: 'image', post: { kind: 'each' }, muxSourceAudio: false, notes: [], passes: [{ label: String(i.outputLabel ?? 'Result'), workflow: file, graph: g, output: m.output.node, expect }] };
}
function h3(job: Job): Plan {
  const i = job.input; const mode = i.mode === 'i2v' || i.mode === 'r2v' ? i.mode : 't2v'; const m0 = nm(`h3-${mode}`);
  // BH9 (f): the Comfy Cloud workflow route runs the cloud twin (workflows/cloud/h3-*-api.json: same node ids, fp16 video VAE)
  const m = job.provider === 'cloud-h3-wf' && mode !== 'r2v' ? { ...m0, workflowFile: `cloud/${m0.workflowFile}` } : m0; const g = wf(m.workflowFile); const seed = clampSeed(i.seed);
  const prompt = i.enhancedPrompt ?? i.finalPrompt ?? i.prompt ?? '';
  const [vid] = byClass(g, /^MiniMaxH3(ImageToVideo|ReferenceToVideo)$/); setIn(g, vid[0], 'prompt', prompt);
  const lenLink = vid[1].inputs.length; const math = g[lenLink[0]]; const secNode = math.inputs['values.a'][0]; g[secNode].inputs.value = i.duration || 6;
  const [rs] = byClass(g, /^ResolutionSelector$/); rs[1].inputs.aspect_ratio = resolutionSelectorAspect(['16:9', '9:16', '1:1'].includes(i.aspect) ? i.aspect : '16:9'); // same labels local and Comfy Cloud
  rs[1].inputs.megapixels = i.resolution === '480p' || i.draft ? 0.4 : 1.0; // 768p class ≈ 1.0 MP (1360×768); template default 0.4 MP ≈ 480p
  seedTo(g, m.seed, seed); setFps(g, 24);
  const refs: string[] = i.refPaths ?? (i.imagePath ? [i.imagePath] : []);
  if (mode === 'i2v') setIn(g, '114', 'image', F(refs[0]));
  if (mode === 'r2v') { const loads = Object.entries<any>(vid[1].inputs).filter(([k]) => k.startsWith('ref_images.')).map(([, v]) => v[0]); loads.forEach((id, k) => { if (refs[k]) setIn(g, id, 'image', F(refs[k])); else dropNode(g, id); }); }
  pruneUnreachable(g, [m.output.node]);
  return { tool: job.toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: false, notes: [], passes: [{ label: 'Result', workflow: m.workflowFile, graph: g, output: m.output.node, expect: { seed, prompt, seconds: i.duration || 6, fps: 24, megapixels: rs[1].inputs.megapixels } }] };
}
/** Generate Video on Wan 2.2 TI2V 5B (local, silent): one pass of workflows/wan22-ti2v-5b-api.json (comfy/wan22.ts). */
function wan22(job: Job): Plan {
  const g = wf(WAN22_5B_WORKFLOW); const { graph, expect } = patchWan22(g, job.input, clampSeed(job.input.seed)); pruneUnreachable(graph, ['58']);
  return { tool: job.toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: false, notes: [], passes: [{ label: 'Result', workflow: WAN22_5B_WORKFLOW, graph, output: '58', expect }] };
}
/** Generate Video on LTX-2.5 22B (local, with LTX's own sound): one pass of workflows/ltx25-ti2v-api.json or ltx25-flf-api.json (comfy/ltx25Video.ts).
 *  Also Loop (a start frame at both ends) and Transitions' Morph (app-transition: first + last frame), both on the FLF graph.
 *  muxSourceAudio false = no source clip to mux; the sound is in the graph's own output (never set keepAudio:false: runNative would strip it). */
function ltx25Video(job: Job): Plan {
  if (job.toolId === 'h3-video' && ltxDfrRuns(job.input)) return ltxDfrPlan(job.toolId, LTX25_DFR_WORKFLOW, wf(LTX25_DFR_WORKFLOW), job.input, clampSeed(job.input.seed)); // DFR quality (comfy/ltx25Dfr.ts): the official DFR template, local files
  const wfName = ltx25WorkflowFor(job.input.mode, isLtx25Loop(job.input)); const { graph, output, expect } = patchLtx25Video(wf(wfName), job.input, clampSeed(job.input.seed), ltxLorasForJob(job.toolId, job.provider, job.input)); pruneUnreachable(graph, [output]);
  return { tool: job.toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: false, notes: [], passes: [{ label: 'Result', workflow: wfName, graph, output, expect }] };
}
/** Extend on LTX-2.5 (local, free): one pass of the image to video graph with the source's last frames as the guide (comfy/ltx25Extend.ts), then
 *  the join (post extend): guide copies dropped, crossfade over the overlap, the source's sound then the new sound. */
function ltx25Extend(job: Job): Plan {
  const i = job.input; const x = i.ltxExtend; const p: ExtendPlan = x.plan;
  const { graph, output, expect } = patchLtx25Extend(wf(LTX25_EXTEND_WORKFLOW), { prompt: String(i.finalPrompt ?? i.prompt ?? ''), seed: clampSeed(i.seed), plan: p, guide: F(x.guidePath) }); pruneUnreachable(graph, [output]);
  const label = `+${p.seconds} s (${p.out.seconds.toFixed(1)} s total)`;
  return { tool: job.toolId, outKind: 'video', post: { kind: 'extend', plan: p, label }, muxSourceAudio: false, notes: [`${p.guideFrames} guide frame(s), ${p.crossfade}-frame crossfade`], passes: [{ label, workflow: LTX25_EXTEND_WORKFLOW, graph, output, expect }] };
}
/** Voice → Talking photo on LTX-2.5 (local, free): one pass of workflows/ltx25-a2v-api.json (comfy/ltx25Lipsync.ts). The speech files were made in
 *  parseInput (audio/lipDriver.ts); the graph muxes the clean speech itself, so muxSourceAudio stays false. */
function ltx25Lipsync(job: Job): Plan {
  const { graph, output, expect } = patchLtx25Lipsync(wf(LTX25_A2V_WORKFLOW), job.input, clampSeed(job.input.seed)); pruneUnreachable(graph, [output]);
  return { tool: job.toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: false, notes: [], passes: [{ label: 'Talking photo', workflow: LTX25_A2V_WORKFLOW, graph, output, expect }] };
}
/** Render (Direct a Shot step 3): one pass of workflows/ltx25-layout-to-render-api.json; the layout clip and first frame were conformed in parseInput. */
function makeReal(job: Job): Plan {
  const i = job.input; const m = i.makeReal ?? {};
  const { graph, expect } = patchMakeReal(wf(MAKE_REAL_WORKFLOW), { plan: m.plan, prompt: String(i.finalPrompt ?? i.prompt ?? ''), seed: i.seed, layout: F(i.layoutPath), firstFrame: F(i.firstFramePath) });
  pruneUnreachable(graph, ['63']);
  return { tool: job.toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: false, notes: [], passes: [{ label: 'Real', workflow: MAKE_REAL_WORKFLOW, graph, output: '63', expect }] };
}
/** Footage Effects: one pass of the shared IC-LoRA video-to-video base (workflows/ltx25-iclora-v2v-api.json, comfy/ltx25IcLora.ts variant `effect`);
 *  the clip was conformed in parseInput. The clip's own sound is muxed back (muxSourceAudio); Sound off → keepAudio false strips it. */
function footageFx(job: Job): Plan {
  const i = job.input; const f = i.footageFx ?? {};
  const { graph, output, expect } = patchLtx25IcLora(wf(FOOTAGE_FX_WORKFLOW), { variant: 'effect', plan: f.plan, prompt: String(i.finalPrompt ?? ''), negative: String(i.negative ?? ''), seed: i.seed,
    lora: { file: f.lora?.file, strength: Number(f.lora?.strength) }, source: F(i.videoPath) });
  pruneUnreachable(graph, [output]);
  return { tool: job.toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: i.keepAudio !== false, notes: [], passes: [{ label: String(f.label ?? 'Effect'), workflow: FOOTAGE_FX_WORKFLOW, graph, output, expect: { ...expect, effect: f.effect } }] };
}
function audio(job: Job, withVideo: boolean): Plan {
  const i = job.input;
  if (!withVideo && i.audioKind === 'voice' && job.provider === 'comfy-drama3') { // prompt-only Drama 3 line (inline [tags] supported by the model)
    const g = wf('voice-drama3-tts-api.json'); const seed = clampSeed(i.seed) % 4294967295; const text = (i.prompt ?? '').trim(); Object.assign(g['6'].inputs, { text, seed });
    const out = Object.entries<any>(g).find(([, n]) => /^SaveAudio/.test(n.class_type))![0];
    return { tool: job.toolId, outKind: 'audio', post: { kind: 'each' }, muxSourceAudio: false, notes: [], passes: [{ label: 'Voice', workflow: 'voice-drama3-tts-api.json', graph: g, output: out, expect: { prompt: text, seed } }] };
  }
  if (!withVideo && i.audioKind === 'voice' && job.provider === QWEN3_TTS) { // prompt-only Qwen3 TTS line: preset voice, spoken language, style (voiceControls native: speaker / language / instruct)
    const seed = clampSeed(i.seed) % 4294967295; const text = (i.prompt ?? '').trim(); const vn = i.voiceNative ?? {};
    const { graph, output, expect } = patchQwen3Tts(wf(QWEN3_TTS_WORKFLOW), { text, seed, speaker: vn.speaker, language: vn.language, instruct: vn.instruct });
    return { tool: job.toolId, outKind: 'audio', post: { kind: 'each' }, muxSourceAudio: false, notes: [], passes: [{ label: 'Voice', workflow: QWEN3_TTS_WORKFLOW, graph, output, expect }] };
  }
  if (!withVideo && i.audioKind === 'voice' && job.provider === 'comfy-chatterbox') { // prompt-only voice line, Chatterbox built-in voice
    const g = wf('voice-chatterbox-tts-api.json'); const seed = clampSeed(i.seed) % 4294967295; const text = (i.prompt ?? '').trim(); Object.assign(g['2'].inputs, { text, seed, ...(i.voiceNative?.exaggeration != null ? { exaggeration: i.voiceNative.exaggeration } : {}) }); delete g['2'].inputs.audio_prompt; delete g['1'];
    return { tool: job.toolId, outKind: 'audio', post: { kind: 'each' }, muxSourceAudio: false, notes: [], passes: [{ label: 'Voice', workflow: 'voice-chatterbox-tts-api.json', graph: g, output: '3', expect: { prompt: text, seed } }] };
  } if (SONG_MODELS.includes(job.provider)) return songPlan(job, withVideo);
  const kind = i.audioKind === 'sfx' || job.provider === 'comfy-stable-audio' ? 'sfx' : 'music';
  if (!['comfy-acestep', 'comfy-stable-audio'].includes(job.provider)) throw new Error(`no local workflow for ${job.provider}`);
  const name = `${withVideo ? 'soundtrack' : 'audio'}-${kind}`; const m = nm(name); const g = wf(m.workflowFile); const seed = clampSeed(i.seed);
  const secs = Number(withVideo ? i.outputDuration ?? i.duration : i.duration) || 10; const prompt = i.enhancedPrompt ?? i.finalPrompt ?? i.prompt ?? '';
  setIn(g, m.inputs.prompt.node, m.inputs.prompt.field, prompt); if (m.inputs.lyrics) setIn(g, m.inputs.lyrics.node, m.inputs.lyrics.field, i.lyrics ?? '[Instrumental]');
  for (const d of m.duration) setIn(g, d.node, d.field, secs); seedTo(g, m.seed, seed);
  if (withVideo) setIn(g, m.inputs.video.node, m.inputs.video.field, F(i.videoPath));
  return { tool: job.toolId, outKind: withVideo ? 'video' : 'audio', post: { kind: 'each' }, muxSourceAudio: false, notes: [], passes: [{ label: 'Result', workflow: m.workflowFile, graph: g, output: m.output.node, expect: { seed, prompt, seconds: secs } }] };
}
// ---- Local songs (2026-10-23): YuE2 (song from lyrics + style; Cover a song) and MiniMax Music 3 open weights. Graphs from the official Comfy templates
// audio_yue2_text2music / audio_yue2_music_cover / audio_minimax_music_3 (workflows/audio-yue2-*-api.json, audio-minimax-music3-local-api.json).
// Patched fields only: style / caption (prompt), lyrics, seed, the length cap (max_duration; not on Cover, which follows the song), the song file (Cover).
export const SONG_MODELS = ['comfy-yue2', 'comfy-minimax-music3'];
/** The graph (node map name) for a song job: Cover → YuE2 cover graph; else the model's song graph. */
export const songGraphOf = (provider: string, mode: string | undefined) => (mode === 'cover' ? 'audio-yue2-cover' : provider === 'comfy-yue2' ? 'audio-yue2-song' : 'audio-minimax-music3-local');
type Spot = { node: string; field: string };
function songPlan(job: Job, withVideo: boolean): Plan {
  const i = job.input; const cover = i.mode === 'cover';
  if (cover && job.provider !== 'comfy-yue2') throw new Error(`Cover a song runs on YuE2, not ${job.provider}`);
  if (cover && !i.sourceAudioPath) throw new Error('Cover a song needs the song to cover');
  const m = nm(songGraphOf(job.provider, i.mode)); const g = wf(m.workflowFile); const seed = clampSeed(i.seed);
  const prompt = i.enhancedPrompt ?? i.finalPrompt ?? i.prompt ?? ''; const lyrics = String(i.lyrics ?? '').trim() || '[Instrumental]';
  for (const s of m.inputs.prompt as Spot[]) setIn(g, s.node, s.field, prompt);
  for (const s of m.inputs.lyrics as Spot[]) setIn(g, s.node, s.field, lyrics);
  setIn(g, m.seed.node, m.seed.field, seed);
  const secs = Math.min(360, Math.max(1, Number(withVideo ? i.outputDuration ?? i.duration : i.duration) || 60));
  if (cover) for (const s of m.inputs.audio as Spot[]) setIn(g, s.node, s.field, F(i.sourceAudioPath)); else for (const d of m.duration as Spot[]) setIn(g, d.node, d.field, secs);
  const expect = { seed, prompt, lyrics, ...(cover ? { cover: true } : { seconds: secs }) };
  return { tool: job.toolId, outKind: withVideo ? 'video' : 'audio', post: { kind: 'each' }, muxSourceAudio: false, notes: [],
    ...(withVideo ? { muxOnto: { video: i.videoPath, mix: i.mix === 'blend' && i.hasAudio !== false ? 'blend' : 'replace' } } : {}),
    passes: [{ label: cover ? 'Cover' : 'Result', workflow: m.workflowFile, graph: g, output: m.output.node, expect }] };
}
// ---- Voice Studio + MMAudio (workflows from scripts/build-voice-workflows.py) ----
/** Library voices = Chatterbox's built-in voice with different delivery (no bundled voice samples); "clone" uses the uploaded sample. */
const VOICE_DELIVERY: Record<string, { exaggeration: number; cfg_weight: number; temperature: number }> = {
  'narrator-warm': { exaggeration: 0.45, cfg_weight: 0.4, temperature: 0.7 }, 'narrator-crisp': { exaggeration: 0.35, cfg_weight: 0.6, temperature: 0.6 },
  'young-bright': { exaggeration: 0.7, cfg_weight: 0.5, temperature: 0.85 }, 'deep-calm': { exaggeration: 0.3, cfg_weight: 0.3, temperature: 0.6 },
  'energetic-host': { exaggeration: 0.9, cfg_weight: 0.4, temperature: 0.9 }, 'whisper-soft': { exaggeration: 0.25, cfg_weight: 0.3, temperature: 0.5 }, clone: { exaggeration: 0.5, cfg_weight: 0.5, temperature: 0.8 },
};
const CB_LANG: Record<string, string> = { ar: 'Arabic (ar)', da: 'Danish (da)', de: 'German (de)', el: 'Greek (el)', en: 'English (en)', es: 'Spanish (es)', fi: 'Finnish (fi)', fr: 'French (fr)', he: 'Hebrew (he)', hi: 'Hindi (hi)', it: 'Italian (it)', ja: 'Japanese (ja)', ko: 'Korean (ko)', ms: 'Malay (ms)', nl: 'Dutch (nl)', no: 'Norwegian (no)', pl: 'Polish (pl)', pt: 'Portuguese (pt)', ru: 'Russian (ru)', sv: 'Swedish (sv)', sw: 'Swahili (sw)', tr: 'Turkish (tr)', zh: 'Chinese (zh)' };
const F5_LANG: Record<string, string> = { en: 'F5v1', zh: 'F5v1', de: 'F5-DE', es: 'F5-ES', fr: 'F5-FR', hi: 'F5-HI', it: 'F5-IT', ja: 'F5-JP' };
const LANG_NAME: Record<string, string> = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', ar: 'Arabic', hi: 'Hindi', zh: 'Chinese', ja: 'Japanese', ko: 'Korean', ru: 'Russian', tr: 'Turkish', nl: 'Dutch', pl: 'Polish', id: 'Indonesian' };
/** Target languages each translate route can voice (Translate Video languagesByProvider; the plan refuses the rest). */
export const TRANSLATE_LANGS: Record<string, string[]> = { 'local-whisper-nllb-chatterbox': Object.keys(CB_LANG), 'local-whisper-nllb-f5': Object.keys(F5_LANG) };
export const VOICE_PLAN_PROVIDERS: Record<string, string[]> = { voiceover: ['comfy-chatterbox', 'comfy-f5tts', 'comfy-drama3', QWEN3_TTS], 'change-voice': ['comfy-chatterbox-vc'], translate: ['local-whisper-nllb-chatterbox', 'local-whisper-nllb-f5'] };
function voice(job: Job, o: { separation?: boolean } = {}): Plan {
  const i = job.input; const mode = (i.mode ?? i.types?.[0]) as string; const seed = clampSeed(i.seed) % 4294967295; const d = VOICE_DELIVERY[i.voice] ?? VOICE_DELIVERY['narrator-warm'];
  const sample: string | undefined = i.voiceSamplePath; const src = (i.videoPath || (i.audioInput ? i.sourceAudioPath : '')) as string; const passes: Pass[] = [];
  if (!src && mode !== 'voiceover') throw new Error('Voice Studio needs a video'); // a voiceover runs without one (the Audio page's Voiceover with no clip): audio comes back
  /** Keep the background (comfy/separation.ts): Change Voice and Translate split the voice from the music first when this computer has the separation
   *  pack + model. o.separation (tests) or the run's own choice (input.separation, a rebuild) win over reading this computer now. */
  const canSep = (mode === 'change-voice' || mode === 'translate') && !!src;
  const sep = canSep && (typeof o.separation === 'boolean' ? o.separation : typeof i.separation === 'boolean' ? i.separation : separationStatus().ready);
  const f5 = (text: string | null, model: string, ref: string) => { const g = wf('voice-f5tts-api.json'); setIn(g, '1', 'audio', F(ref)); Object.assign(g['2'].inputs, { speech: text ?? '', seed, model, model_type: model === 'F5v1' ? 'F5TTS_v1_Base' : 'F5TTS_Base', ...(i.voiceNative?.speed != null ? { speed: i.voiceNative.speed } : {}) }); return g; };
  if (mode === 'voiceover') {
    const text = (i.prompt ?? '').trim(); if (!text) throw new Error('Voiceover needs a script');
    if (job.provider === QWEN3_TTS) { const vn = i.voiceNative ?? {}; const q = patchQwen3Tts(wf(QWEN3_TTS_WORKFLOW), { text, seed, speaker: vn.speaker, language: vn.language, instruct: vn.instruct });
      passes.push({ label: 'Voiceover', workflow: QWEN3_TTS_WORKFLOW, graph: q.graph, output: q.output, expect: q.expect }); }
    else if (job.provider === 'comfy-drama3') { const file = sample ? 'voice-drama3-clone-api.json' : 'voice-drama3-tts-api.json'; const g = wf(file); Object.assign(g['6'].inputs, { text, seed }); if (sample) setIn(g, '4', 'audio', F(sample));
      passes.push({ label: 'Voiceover', workflow: file, graph: g, output: '8', expect: { prompt: text, seed, clone: !!sample } }); }
    else if (job.provider === 'comfy-f5tts' && !(sample ?? src)) throw new Error('F5-TTS copies a voice: add a voice sample or a clip with speech, or pick another model');
    else if (job.provider === 'comfy-f5tts') passes.push({ label: 'Voiceover', workflow: 'voice-f5tts-api.json', graph: f5(text, 'F5v1', sample ?? src), output: '3', expect: { prompt: text, seed, voiceRef: sample ? 'clone' : 'source speech' } });
    else { const g = wf('voice-chatterbox-tts-api.json'); Object.assign(g['2'].inputs, { text, seed, ...d, ...(i.voiceNative?.exaggeration != null ? { exaggeration: i.voiceNative.exaggeration } : {}) }); if (sample) setIn(g, '1', 'audio', F(sample)); else { delete g['2'].inputs.audio_prompt; delete g['1']; }
      passes.push({ label: 'Voiceover', workflow: 'voice-chatterbox-tts-api.json', graph: g, output: '3', expect: { prompt: text, seed, clone: !!sample } }); }
  } else if (mode === 'change-voice') {
    const g = wf('voice-chatterbox-vc-api.json'); setIn(g, '1', 'audio', F(src)); // library voices → the pack's built-in voice (no bundled samples); clone → uploaded sample
    if (sample) setIn(g, '2', 'audio', F(sample)); else { delete g['3'].inputs.target_voice_audio; delete g['2']; }
    if (sep) passes.push(sepPass(src)); // the converter hears the voice only; the music goes back under it after (post voiceMix)
    passes.push({ label: 'Changed voice', workflow: 'voice-chatterbox-vc-api.json', graph: g, output: '5', ...(sep ? { prep: [{ kind: 'fileFromPass' as const, from: VOCALS, node: '1', field: 'audio' }] } : {}), expect: { clone: !!sample, separation: sep } });
  } else if (mode === 'translate') {
    const lang = i.language ?? 'en'; // transcript (faster-whisper) + translation (NLLB-200 or LibreTranslate) run server-side as a prep step
    if (sep) passes.push(sepPass(src)); // pass 0: voice + background; the voice is transcribed and cloned, the background stays under the new voice
    const speech = (node: string, field: string) => ({ kind: 'speech' as const, src, node, field, translateTo: lang, ...(sep ? { srcPass: VOCALS } : {}) });
    const ref = (node: string) => (sep && !sample ? [{ kind: 'fileFromPass' as const, from: VOCALS, node, field: 'audio' }] : []); // clone from the voice stem, never from the music
    if (job.provider === 'local-whisper-nllb-f5') {
      const model = F5_LANG[lang]; if (!model) throw new Error(`F5-TTS has no ${LANG_NAME[lang] ?? lang} model; pick Chatterbox for this language`);
      passes.push({ label: `${LANG_NAME[lang] ?? lang}`, workflow: 'voice-f5tts-api.json', graph: f5(null, model, sample ?? src), output: '3', prep: [...ref('1'), speech('2', 'speech')], expect: { seed, language: lang, separation: sep } });
    } else {
      const cl = CB_LANG[lang] ? lang : undefined; if (!cl) throw new Error(`Chatterbox multilingual has no ${LANG_NAME[lang] ?? lang} voice; pick F5-TTS or a hosted voice for this language`);
      const g = wf('voice-chatterbox-ml-api.json'); setIn(g, '1', 'audio', F(sample ?? src)); Object.assign(g['2'].inputs, { language: cl, seed, exaggeration: i.voiceNative?.exaggeration ?? d.exaggeration, cfg_weight: d.cfg_weight, temperature: d.temperature });
      passes.push({ label: `${LANG_NAME[lang] ?? lang}`, workflow: 'voice-chatterbox-ml-api.json', graph: g, output: '3', prep: [...ref('1'), speech('2', 'text')], expect: { seed, language: cl, separation: sep } });
    }
  } else throw new Error(`unknown voice mode ${mode}`);
  const last = passes.length - 1; const blend = i.mix === 'blend' && i.hasAudio !== false;
  const notes = canSep && !sep ? [NO_SEPARATION_NOTE] : [];
  // With separation: the new voice over the background stem (blend: the original voice ducked under it too), mixed into one track that replaces the clip's sound.
  const post: Post = sep ? { kind: 'voiceMix', pass: last, beds: [{ from: BACKGROUND, volume: 1 }, ...(blend ? [{ from: VOCALS, volume: 0.25 }] : [])] } : { kind: 'each', only: [last] };
  const base = { tool: job.toolId, post, muxSourceAudio: false, notes, passes, labels: passes.map((p) => p.label), ...(canSep ? { separation: sep } : {}) };
  if (i.audioInput || !src) return { ...base, outKind: 'audio' }; // DP #22: audio in → the changed voice as audio, nothing to mux onto
  return { ...base, outKind: 'video', muxOnto: { video: src, mix: sep ? 'replace' : blend ? 'blend' : 'replace' } };
}
/** Pass 0 of a separated voice job: the official MelBand RoFormer template (comfy/separation.ts) on the source sound → vocals (index 0) + background (index 1). */
const VOCALS: PassFile = { pass: 0, index: 0 }; const BACKGROUND: PassFile = { pass: 0, index: 1 };
function sepPass(src: string): Pass {
  const g = wf(SEPARATION_WORKFLOW); setIn(g, SEP_NODES.input, 'audio', F(src));
  return { label: 'Voice and background', workflow: SEPARATION_WORKFLOW, graph: g, output: SEP_NODES.vocals, extraOutputs: [{ node: SEP_NODES.background, label: 'Background' }], expect: { separation: true } };
}
function mmaudio(job: Job): Plan {
  const i = job.input; const seed = clampSeed(i.seed); const secs = Number(i.outputDuration ?? i.duration) || 8; const prompt = i.enhancedPrompt ?? i.prompt ?? '';
  const parts = mmaudioParts(secs); const muxOnto = { video: i.videoPath, mix: (i.mix === 'blend' && i.hasAudio !== false ? 'blend' : 'replace') as 'blend' | 'replace' };
  const graphFor = (file: string, seconds: number) => { const g = wf('soundtrack-mmaudio-api.json'); setIn(g, '1', 'file', F(file)); Object.assign(g['5'].inputs, { duration: seconds, seed, prompt }); return g; };
  /* every pass gets the clip re-timed to 25 fps first: ComfyUI-MMAudio's sampler takes the frames as they come and reads them as 25 fps for sync
     (a 24 fps clip would drift and lose its tail), so the sound lands on the action. Small frames are enough (384 px CLIP / 224 px sync), even sizes. */
  const w0 = Number(i.width) || 1280, h0 = Number(i.height) || 720; const k0 = 384 / Math.min(w0, h0); const even = (x: number) => Math.max(2, Math.round(x / 2) * 2);
  const width = k0 < 1 ? even(w0 * k0) : even(w0), height = k0 < 1 ? even(h0 * k0) : even(h0);
  const passes: Pass[] = parts.map((pt, k) => { const out = `${i.videoPath}.${job.id}-${parts.length > 1 ? `part${k + 1}` : 'mm25'}.mp4`;
    return { label: parts.length > 1 ? `Part ${k + 1}` : 'Result', workflow: 'soundtrack-mmaudio-api.json', graph: graphFor(out, pt.seconds), output: '6', prep: [{ kind: 'fps', src: i.videoPath, out, fps: MMAUDIO_FPS, width, height, start: pt.start, seconds: pt.seconds }], expect: { seed, prompt, seconds: pt.seconds, start: pt.start } }; });
  if (parts.length === 1) return { tool: job.toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: false, muxOnto, notes: [], passes };
  return { tool: job.toolId, outKind: 'video', post: { kind: 'audioConcat' }, muxSourceAudio: false, muxOnto, labels: ['Result'], passes,
    notes: [`Scored in ${parts.length} parts of about ${parts[0].seconds} s (MMAudio works best on clips up to ${MMAUDIO_CHUNK_SEC} s), joined back to back.`] };
}
function imageUpscale(job: Job): Plan {
  const i = job.input; const file = imageUpscaleWorkflowOrDefault(job.provider, Number(i.scale)); // shared/imageUpscale.ts: the same file the page and the quote name
  const g = wf(file); setIn(g, '1', 'image', F(i.imagePath)); const k = Number(i.scale) || 2; const expect: Record<string, any> = { scale: i.scale };
  if (g['11']?.class_type === 'ResizeImageMaskNode') { setIn(g, '11', 'resize_type.multiplier', k); setIn(g, '17', 'seed', clampSeed(i.seed)); expect.multiplier = k; } // SeedVR2 3B: lanczos ×k, then one SeedVR2 step restores detail
  if (g['20']?.class_type === 'ImageScaleToTotalPixels') { // Z-Image-Turbo 2K: working MP = source MP × k² / 4 (the graph makes 4× that), so the result is ×k
    const s = i.sourceSize as { width: number; height: number } | null; const mp = s?.width ? zimageWorkingMegapixels(s, k) : 1; setIn(g, '20', 'megapixels', mp); setIn(g, '31', 'seed', clampSeed(i.seed)); expect.megapixels = mp; }
  return { tool: job.toolId, outKind: 'image', post: { kind: 'each' }, muxSourceAudio: false, notes: [], passes: [{ label: 'Result', workflow: file, graph: g, output: '8', expect }] };
}
function plugin(job: Job, id: string): Plan {
  const dir = path.join(PLUGINS_DIR, id); const m = JSON.parse(readFileSync(path.join(dir, 'node-map.json'), 'utf8')); const g = wf(path.join(dir, 'workflow.json')); const i = job.input;
  setIn(g, m.inputs.video.node, m.inputs.video.field, F(i.videoPath));
  for (const [k, spec] of Object.entries<any>(m.fields ?? {})) { const v = i.fields?.[k]; if (v == null) continue; for (const s of [spec].flat()) setIn(g, s.node, s.field, s.map ? s.map[v] : Number(v)); }
  for (const s of m.presets?.[i.types?.[0]] ?? []) setIn(g, s.node, s.field, s.value);
  return { tool: job.toolId, outKind: 'video', post: { kind: 'each' }, muxSourceAudio: i.keepAudio !== false, notes: [], passes: [{ label: 'Result', workflow: `plugins/${id}/workflow.json`, graph: g, output: m.output.node, extraOutputs: m.extraOutputs, expect: { fields: i.fields ?? {}, preset: i.types?.[0] } }] };
}

interface Job { id: string; toolId: string; provider: string; input: Record<string, any> }
/** Tools the native runner can drive, keyed by tool id (apps map to their base tool). */
const BUILDERS: Record<string, (j: Job, o: { srcFps?: number; separation?: boolean }) => Plan> = {
  'object-swap': objectSwap, 'motion-transfer': motionTransfer, restyle, 'app-anime-restyle': restyle, reshoot, camera, 'photo-fx': (j) => (j.provider === LTX25_VIDEO ? ltx25Video({ ...j, input: { ...j.input, mode: 'i2v', loop: false } }) : photoFx(j)) /* LTX-2.5: start frame + effect (+ its LoRA) */,
  upscale: (j, o) => upscale(j, o.srcFps), 'app-video-upscale': (j, o) => upscale(j, o.srcFps), 'create-image': image, 'h3-video': (j) => (j.provider === WAN22_5B ? wan22(j) : j.provider === LTX25_VIDEO ? ltx25Video(j) : h3(j)), audio: (j) => audio(j, false),
  soundtrack: (j) => (j.provider === 'comfy-mmaudio' ? mmaudio(j) : audio(j, true)), 'app-music-bed': (j) => (j.provider === 'comfy-mmaudio' ? mmaudio(j) : audio(j, true)), voice: (j, o) => (j.provider === LTX25_LIPSYNC ? ltx25Lipsync(j) : voice(j, o)), 'image-upscale': imageUpscale, cinema, 'app-orbit-shot': cinema, cutout: (j) => plugin(j, 'cutout'),
  soul: (j) => soulPlan(j), 'fps-boost': (j, o) => fpsBoost(j, o.srcFps), 'make-it-real': makeReal, 'footage-fx': footageFx, 'h3-extend': ltx25Extend /* only reached for comfy-ltx25-extend: h3Owns takes comfy-h3-extend first */,
};
const baseOf = (j: Job) => (BUILDERS[j.toolId] ? j.toolId : j.input.baseTool && BUILDERS[j.input.baseTool] ? j.input.baseTool : /^app-(transition|ugc-ad)$/.test(j.toolId) ? 'h3-video' : null);
/** null = this tool/provider has no local workflow (stays on mock or its hosted provider). */
export function hasPlan(j: Job) {
  if (h3Owns(j)) return true; // H3 additions (tools/h3/plan.ts)
  const b = baseOf(j); if (!b) return false;
  if (b === 'create-image') return !!IMAGE_WF[j.provider];
  if (b === 'voice' && j.provider === LTX25_LIPSYNC) return (j.input.mode ?? j.input.types?.[0]) === 'lipsync' && !!j.input.lipDriverPath; // Talking photo on LTX-2.5
  if (b === 'voice') return (VOICE_PLAN_PROVIDERS[j.input.mode ?? j.input.types?.[0]] ?? []).includes(j.provider);
  if ((b === 'soundtrack' || b === 'app-music-bed') && j.provider === 'comfy-mmaudio') return true;
  if (b === 'audio' && j.input.audioKind === 'voice') return j.provider === 'comfy-chatterbox' || j.provider === 'comfy-drama3' || j.provider === QWEN3_TTS; // F5-TTS needs a reference voice sample (Audio has no sample input) → stays mock
  if (b === 'audio' || b === 'soundtrack' || b === 'app-music-bed') return ['comfy-acestep', 'comfy-stable-audio', ...SONG_MODELS].includes(j.provider) && (b !== 'audio' || j.input.audioKind !== 'voice') && (j.input.mode !== 'cover' || j.provider === 'comfy-yue2');
  if (b === 'h3-video') return j.provider === 'comfy-h3' || ((j.provider === WAN22_5B || j.provider === LTX25_VIDEO) && j.toolId === 'h3-video') || (j.provider === LTX25_VIDEO && j.toolId === 'app-transition' && j.input.mode === 'flf'); // Transitions: LTX-2.5 morph (first + last frame)
  if (b === 'image-upscale') return UPSCALE_LOCAL.includes(j.provider); // every local upscale graph (shared/imageUpscale.ts)
  if (b === 'reshoot' || b === 'cinema' || b === 'app-orbit-shot') return ['comfy-open', 'comfy-funcamera'].includes(j.provider);
  if (b === 'soul') return j.provider === 'comfy-soul';
  if (b === 'make-it-real') return j.provider === MAKE_REAL_PROVIDER && !!j.input?.layoutPath && !!j.input?.firstFramePath && !!j.input?.makeReal?.plan;
  if (b === 'footage-fx') return j.provider === FOOTAGE_FX_PROVIDER && !!j.input?.videoPath && !!j.input?.footageFx?.plan && !!j.input?.footageFx?.lora?.file; // Footage Effects (2026-10-26)
  if (b === 'photo-fx' && j.provider === LTX25_VIDEO) return true; // Photo FX on local LTX-2.5 22B (Exploded view's XPLDV LoRA), 2026-10-26
  if (b === 'h3-extend') return j.provider === LTX25_EXTEND && !!j.input?.ltxExtend?.plan && !!j.input?.ltxExtend?.guidePath; // Extend on local LTX-2.5 (2026-10-26)
  if (b === 'upscale' || b === 'app-video-upscale') return VUP_LOCAL.includes(j.provider) || j.provider === 'comfy-open'; // shared/videoUpscale.ts local engines (+ old comfy-open jobs)
  if (b === 'fps-boost') return j.provider === 'comfy-rife'; // was missing: on OPENHIGGSFIELD_BACKEND=comfy the local RIFE route fell back to a mock render
  if (b === 'cutout') return existsSync(path.join(PLUGINS_DIR, 'cutout', 'node-map.json'));
  return j.provider === 'comfy-open';
}
/** Prompt grammar (2026-10-26): local and Comfy Cloud graphs read the job with every prompt field in the model's own syntax (<Picture 1> on H3,
 *  <ref_image_0> on FLUX 3 Klein, Picture 1 on Qwen-Edit-2509, plain words for models that take no references). The job keeps what was typed. */
/** The model a local graph serves, for the reference rewrite. routing/jobRefs.ts sets the runners' own key (modelKeyOf: every tool's models, footage-fx LTX-2.5
 *  IC-LoRA included) when it loads; a static import here would close an import cycle (plans → routing → tools → plans). Until then: the engine map. */
let planModelKey = (j: { toolId: string; provider: string; input?: Record<string, any> | null }): string | null => engineModelKey(j.toolId, j.provider, j.input?.baseTool);
export const setPlanModelKey = (f: typeof planModelKey) => { planModelKey = f; };
export const planModelKeyOf = (j: Parameters<typeof planModelKey>[0]) => planModelKey(j);
export function buildPlan(j0: Job, o: { srcFps?: number; separation?: boolean } = {}): Plan { const j = { ...j0, input: withRefGrammar(j0.input, planModelKey(j0), 'local') } as Job; /* prompt grammar: the model key the runners use (routing/jobRefs.ts) */ if (h3Owns(j)) return h3BuildPlan(j); const b = baseOf(j); if (!b) throw new Error(`no ComfyUI plan for ${j.toolId}`); return BUILDERS[b](j, o); }
export { LENGTH_VARIANTS };
