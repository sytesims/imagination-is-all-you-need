/**
 * OpenSoul → ComfyUI plan (workflows/soul-*-api.json, built by scripts/build-soul-workflows.py; shared node ids documented there).
 * Pure: graph patching only. Hooked into comfy/plans.ts BUILDERS['soul'].
 */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { WORKFLOWS_DIR } from '../../config.js';
import type { Plan, Pass } from '../../comfy/plans.js';
import { SOUL_LORAS, REALISM, presetById, type SoulBase } from './presets.js';

export type SoulEngine = 'pulid' | 'infiniteyou' | 'aceplus' | 'qwen-edit';
export const SOUL_ENGINES: SoulEngine[] = ['pulid', 'infiniteyou', 'aceplus', 'qwen-edit'];
export const SOUL_ASPECTS: Record<string, [number, number]> = { '1:1': [1024, 1024], '3:4': [896, 1184], '4:3': [1184, 896], '2:3': [832, 1248], '3:2': [1248, 832], '9:16': [768, 1360], '16:9': [1360, 768] };
const ENGINE_WF: Record<SoulEngine, string> = { pulid: 'soul-ref-pulid', infiniteyou: 'soul-ref-infiniteyou', aceplus: 'soul-ref-aceplus', 'qwen-edit': 'soul-ref-qwenedit' };
const BASE_WF: Record<SoulBase, string> = { zit: 'soul-zit', flux1dev: 'soul-flux1dev', qwen: 'soul-qwen' };
const FAMILY: Record<SoulEngine, SoulBase> = { pulid: 'flux1dev', infiniteyou: 'flux1dev', aceplus: 'flux1dev', 'qwen-edit': 'qwen' };

/** "Pick the best per case": several photos → Qwen-Image-Edit-2511 (multi-reference); a product/outfit/subject → ACE++ subject;
 *  one face at maximum likeness → InfiniteYou; one face otherwise → PuLID-FLUX (best identity/editability balance). */
export function pickEngine(o: { refs: number; refKind?: string; likeness?: string; engine?: string }): SoulEngine {
  if (o.engine && o.engine !== 'auto') return o.engine as SoulEngine;
  if (o.refs > 1) return 'qwen-edit';
  if (o.refKind === 'subject') return 'aceplus';
  return o.likeness === 'max' ? 'infiniteyou' : 'pulid';
}
const isLink = (v: any) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string';
/** Remove node `id`, rewiring every consumer of its output 0 to `to`. */
export function bypass(g: Record<string, any>, id: string, to: [string, number]) {
  delete g[id];
  for (const n of Object.values<any>(g)) for (const [k, v] of Object.entries<any>(n.inputs)) if (isLink(v) && v[0] === id) n.inputs[k] = to;
}
const wf = (name: string) => JSON.parse(readFileSync(path.join(WORKFLOWS_DIR, `${name}-api.json`), 'utf8'));
const clampSeed = (s: any) => (Number.isInteger(s) ? s : 0) % 2_147_483_647;

/** Which LoRAs land in the graph, and the trigger words they need. Exported for tests / quote. */
export function loraStack(presetId: string | null, family: SoulBase, engine: SoulEngine | null) {
  const pr = presetId ? presetById(presetId) : null; const r = REALISM[family];
  const style = (pr?.loras ?? []).filter((l) => SOUL_LORAS[l.lora].base === family).slice(0, 2);
  const promptOnly = !!pr && (pr.fallback || style.length < (pr.loras.length));
  const triggers = style.map((l) => SOUL_LORAS[l.lora].trigger).filter(Boolean) as string[];
  return { realism: r, style, triggers, promptOnly, family, engine };
}
export function soulPlan(job: { id: string; toolId: string; provider: string; input: Record<string, any> }): Plan {
  const i = job.input; const refs: string[] = i.refPaths ?? []; const engine: SoulEngine | null = refs.length ? i.engine : null;
  const pr = i.preset ? presetById(i.preset) : null;
  const family: SoulBase = engine ? FAMILY[engine] : pr?.base ?? 'zit';
  const name = engine ? ENGINE_WF[engine] : BASE_WF[family];
  const st = loraStack(i.preset, family, engine);
  const [w, h] = SOUL_ASPECTS[i.aspect] ?? SOUL_ASPECTS['1:1'];
  const prompt = [st.triggers.join(', '), i.finalPrompt ?? i.prompt].filter(Boolean).join(', ');
  const n = Number(i.n) === 4 ? 4 : 1; const passes: Pass[] = [];
  for (let k = 0; k < n; k++) {
    const g = wf(name); const seed = clampSeed((i.seed ?? 0) + k);
    g['20'].inputs[engine === 'qwen-edit' ? 'prompt' : 'text'] = prompt;
    // LoRA chain 10 (realism) → 11/12 (style); unused slots bypassed so no file is needed
    if (st.realism) Object.assign(g['10'].inputs, { lora_name: SOUL_LORAS[st.realism.lora].file, strength_model: st.realism.strength }); else bypass(g, '10', g['10'].inputs.model);
    (['11', '12'] as const).forEach((id, j) => { const l = st.style[j]; if (l) Object.assign(g[id].inputs, { lora_name: SOUL_LORAS[l.lora].file, strength_model: l.strength }); else bypass(g, id, g[id].inputs.model); });
    if (engine === 'aceplus') {
      if (i.refKind === 'subject') g['14'].inputs.lora_name = 'comfyui_subject_lora16.safetensors';
      const hw = Math.round(w * 0.75 / 16) * 16, hh = Math.round(h * 0.75 / 16) * 16; // ACE++ canvas is 2× wide: keep it near 1.5 MP
      Object.assign(g['80'].inputs, { width: hw, height: hh }); Object.assign(g['81'].inputs, { width: hw, height: hh });
      Object.assign(g['83'].inputs, { width: hw * 2, height: hh }); Object.assign(g['84'].inputs, { width: hw, height: hh });
      g['85'].inputs.x = hw; Object.assign(g['88'].inputs, { width: hw, height: hh, x: hw });
    } else Object.assign(g['30'].inputs, { width: w, height: h, batch_size: 1 });
    if (engine === 'infiniteyou') { Object.assign(g['76'].inputs, { width: w, height: h }); if (i.likeness === 'max') { g['74'].inputs.image_proj_model_name = 'sim_stage1/image_proj_model.bin'; g['77'].inputs.controlnet_name = 'sim_stage1/infusenet_sim_fp8e4m3fn.safetensors'; } }
    if (engine === 'pulid' && i.likeness === 'max') g['73'].inputs.weight = 1.0;
    const refNodes = ['60', '61', '62'];
    refNodes.forEach((id, j) => { if (!g[id]) return; if (refs[j]) g[id].inputs.image = { __file: refs[j] }; else { delete g[id]; for (const e of ['20', '21']) if (g[e]) delete g[e].inputs[`image${j + 1}`]; } });
    g['31'].inputs.seed = seed;
    const decoded: [string, number] = g['41'].inputs.image_target;
    if (i.colour) { g['40'].inputs.image = { __file: i.colour.path }; Object.assign(g['41'].inputs, { strength: i.colour.strength, method: i.colour.method }); }
    else { bypass(g, '41', decoded); delete g['40']; }
    if (i.upscale && i.upscale !== 'off') g['50'].inputs.model_name = i.upscale === 'x4' ? 'RealESRGAN_x4plus.pth' : 'RealESRGAN_x2plus.pth';
    else { bypass(g, '51', g['51'].inputs.image); delete g['50']; }
    passes.push({ label: n > 1 ? `${pr?.label ?? 'OpenSoul'} ${k + 1}` : pr?.label ?? 'OpenSoul', workflow: `${name}-api.json`, graph: g, output: '9',
      expect: { width: w, height: h, seed, loras: st.style.map((l) => SOUL_LORAS[l.lora].file), realism: st.realism?.strength ?? null, engine, colour: i.colour?.strength ?? null, upscale: i.upscale ?? 'off' } });
  }
  const notes = [engine ? `character engine: ${engine}` : `base: ${family}`, ...(st.promptOnly ? ['style applied as prompt only (no LoRA for this base)'] : [])];
  return { tool: job.toolId, outKind: 'image', post: { kind: 'each' }, muxSourceAudio: false, notes, passes };
}
