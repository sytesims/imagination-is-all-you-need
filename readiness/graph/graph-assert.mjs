// Graph assertions over every patched graph the API sent to the stub (captured/ by run-e2e.mjs).
// Checks the UI's inputs landed (uploads, prompt reaches an encoder, seed), resolution multiples, fps, frame-count rules,
// chunk/overlap maths, LoRA strengths and sampler/steps/cfg against sourced recommended values. Writes report.json + report.md.
import fs from 'node:fs'; import path from 'node:path';
const HERE = path.dirname(new URL(import.meta.url).pathname); const CAP = path.join(HERE, 'captured'); const WF = path.resolve(HERE, '../../workflows');
const isLink = (v) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string';
const val = (g, v) => (isLink(v) && /^Primitive/.test(g[v[0]]?.class_type) ? g[v[0]].inputs.value : v);
/** Recommended sampler settings. src = where the number comes from; 'template' = the official Comfy-Org template value (no model-card number found). */
const CARDS = [
  { wf: /^(object-swap|motion-transfer)/, cls: 'KSampler', steps: 6, cfg: 1, sampler: 'euler', src: 'Comfy-Org template video_wan2_2_14B_animate (lightx2v distill LoRA → cfg 1)', sourced: 'template' },
  { wf: /^restyle/, cls: 'KSampler', steps: 4, cfg: 1, sampler: 'lcm', src: 'lightx2v 4-step LoRA (wan2.1_t2v_14b_lora_rank64_lightx2v_4step) as wired in Comfy-Org Wan VACE template', sourced: 'template' },
  { wf: /^(camera-moves|reshoot-funcamera)/, cls: 'KSamplerAdvanced', steps: 20, cfg: 3.5, sampler: 'euler', src: 'Comfy-Org template video_wan2_2_14B_fun_camera', sourced: 'template' },
  { wf: /^create-image-qwen21/, cls: 'KSampler', steps: 25, cfg: 1, sampler: 'euler', src: 'Comfy-Org template image_qwen_image_2_1_t2i (MODELS-ADDITIONS: Turbo LoRA = 8 steps cfg 1)', sourced: 'template+card' },
  { wf: /^create-image-flux3klein/, cls: 'KSampler', steps: 16, cfg: 1, sampler: 'euler', src: 'black-forest-labs/flux-3-image-klein-comfy card: distilled = 16 steps, no guidance, euler / simple', sourced: 'card' },
  { wf: /^create-image-zimage-turbo/, cls: 'KSampler', steps: 8, cfg: 1, sampler: 'res_multistep', src: 'Comfy-Org template image_z_image_turbo (Z-Image-Turbo card: 8 NFE, guidance off)', sourced: 'card' },
  { wf: /^create-image-zimage-api/, cls: 'KSampler', steps: 25, cfg: 4, sampler: 'res_multistep', src: 'Comfy-Org template image_z_image', sourced: 'template' },
  { wf: /^audio-music|^soundtrack-music/, cls: 'KSampler', steps: 8, cfg: 1, sampler: 'euler', src: 'Comfy-Org template audio_ace_step_1_5 (turbo)', sourced: 'template' },
  { wf: /^audio-sfx|^soundtrack-sfx/, cls: 'KSampler', steps: 50, cfg: 4.98, sampler: 'dpmpp_3m_sde_gpu', src: 'Comfy-Org template audio_stable_audio_example', sourced: 'template' },
];
const files = fs.readdirSync(CAP).filter((f) => f.endsWith('.json')).sort(); const rows = []; const byJob = {};
for (const f of files) {
  const c = JSON.parse(fs.readFileSync(path.join(CAP, f), 'utf8')); const g = c.graph; const e = c.expect ?? {}; const res = []; const ok = (name, cond, info = '') => res.push({ name, ok: !!cond, info });
  (byJob[c.jobId.replace(/-g\d+$/, '')] ??= []).push(c);
  const template = fs.existsSync(path.join(WF, c.workflow)) ? JSON.parse(fs.readFileSync(path.join(WF, c.workflow), 'utf8')) : null;
  // 1) uploads: no template sample media left on Load* nodes
  const loads = Object.entries(g).filter(([, n]) => /^Load(Image|Video)$/.test(n.class_type));
  ok('every Load node gets an uploaded file (no template sample)', loads.every(([, n]) => /^oh_/.test(String(n.inputs.image ?? n.inputs.file))), loads.map(([id, n]) => `${id}=${n.inputs.image ?? n.inputs.file}`).join(' '));
  // 2) prompt reaches a text encoder (not a system prompt / not dropped)
  if (e.prompt) {
    const hits = Object.entries(g).filter(([, n]) => Object.values(n.inputs).some((v) => v === e.prompt || (typeof v === 'string' && v.includes(e.prompt))));
    const reach = hits.some(([id, n]) => /TextEncode|CLIPTextEncode|MiniMaxH3|TextEncodeAceStep|MMAudioSampler|FL_Chatterbox|Chatterbox(TTS|MTLTTS)|F5TTS|Drama3Generate/.test(n.class_type) || (/^Primitive/.test(n.class_type) && Object.values(g).some((m) => Object.entries(m.inputs).some(([k, v]) => isLink(v) && v[0] === id && k !== 'system_prompt'))));
    ok('prompt reaches a text encoder', reach, hits.map(([id, n]) => `${id}:${n.class_type}`).join(' ') || 'prompt not found');
  }
  // 3) seed plumbing
  if (e.seed != null) { const seeds = Object.values(g).flatMap((n) => ['seed', 'noise_seed'].filter((k) => k in n.inputs && !isLink(n.inputs[k])).map((k) => n.inputs[k]));
    ok('seed from the UI is used', seeds.includes(e.seed), `ui ${e.seed}, graph ${[...new Set(seeds)].join(',')}`); }
  // 4) resolution + multiples
  if (e.width) { const pairs = Object.entries(g).map(([, n]) => [val(g, n.inputs.width ?? n.inputs['resize_type.width']), val(g, n.inputs.height ?? n.inputs['resize_type.height'])]).filter(([w, h]) => typeof w === 'number' && typeof h === 'number');
    const prim = [val(g, g['159']?.inputs?.value), val(g, g['160']?.inputs?.value)]; const prim2 = [g['166']?.inputs?.value, g['167']?.inputs?.value];
    const all = [...pairs, prim, prim2]; ok(`resolution ${e.width}×${e.height} in graph`, all.some(([w, h]) => w === e.width && h === e.height), JSON.stringify(all.slice(0, 4)));
    ok(`resolution multiple of ${e.mult}`, e.width % e.mult === 0 && e.height % e.mult === 0, `${e.width}×${e.height}`); }
  if (e.finalFps) ok('RIFE output ≥ 60 fps before ffmpeg fps=60', e.rifeAtLeast60 === true, String(e.fps));
  // 5) fps consistency
  if (e.fps) { const fps = Object.values(g).flatMap((n) => ['fps', 'frame_rate'].filter((k) => k in n.inputs && !isLink(n.inputs[k])).map((k) => Number(n.inputs[k])));
    ok(`all frame rates = ${e.fps}`, fps.length === 0 || fps.every((x) => x === e.fps), `graph ${[...new Set(fps)].join(',')}`); }
  // 6) frame-count rule
  if (e.frames) { const n = e.frames; ok(`frames ${n} follow ${e.rule}`, e.rule === '8n+1' ? n % 8 === 1 : n % 4 === 1);
    const present = Object.values(g).some((m) => ['length', 'value'].some((k) => m.inputs[k] === n)); ok('frame count present in graph', present); }
  if (e.batch) ok(`SeedVR2 batch ${e.batch} is 4n+1`, e.batch % 4 === 1);
  if (e.megapixels) ok('H3 resolution class matches UI (768p ≈ 1.0 MP, MODELS-ADDITIONS)', (c.input.resolution === '480p' || c.input.draft) ? e.megapixels <= 0.45 : e.megapixels >= 0.95, `${e.megapixels} MP for ${c.input.resolution}`);
  // 7) LoRA
  if (e.lora) { const l = Object.values(g).find((n) => n.inputs.lora_name === e.lora); ok(`LoRA ${e.lora} @ ${e.loraStrength}`, l && l.inputs.strength_model === e.loraStrength, l ? `strength ${l.inputs.strength_model}` : 'missing'); }
  const loras = Object.values(g).filter((n) => /Lora/.test(n.class_type)); ok('LoRA strengths within 0..2', loras.every((n) => n.inputs.strength_model == null || (n.inputs.strength_model >= 0 && n.inputs.strength_model <= 2)), loras.map((n) => `${n.inputs.lora_name}:${n.inputs.strength_model}`).join(' '));
  // 8) sampler / steps / cfg vs recommended
  const card = CARDS.find((k) => k.wf.test(path.basename(c.workflow)));
  if (card) { const s = Object.values(g).filter((n) => n.class_type === card.cls); ok(`${card.cls} steps/cfg/sampler = ${card.steps}/${card.cfg}/${card.sampler} (${card.sourced})`, s.length && s.every((n) => val(g, n.inputs.steps) === card.steps && val(g, n.inputs.cfg) === card.cfg && n.inputs.sampler_name === card.sampler), s.map((n) => `${val(g, n.inputs.steps)}/${val(g, n.inputs.cfg)}/${n.inputs.sampler_name}`).join(' ')); }
  // 9) untouched model settings vs template (we must not drift sampler settings while patching)
  if (template) { const drift = Object.entries(template).filter(([id, n]) => g[id] && ['steps', 'cfg', 'sampler_name', 'scheduler', 'shift', 'denoise'].some((k) => k in n.inputs && !isLink(n.inputs[k]) && JSON.stringify(n.inputs[k]) !== JSON.stringify(g[id].inputs[k])));
    ok('sampler settings unchanged from the official template', !drift.length, drift.map(([id]) => id).join(' ')); }
  rows.push({ file: f, tool: c.toolId, provider: c.provider, workflow: c.workflow, label: c.label, checks: res, ok: res.every((r) => r.ok), card: card ? card.src : 'no recommended values sourced for this workflow' });
}
// 10) chunk / overlap maths across a job's passes (restyle)
for (const [job, ps] of Object.entries(byJob)) { const ch = ps.map((p) => p.expect?.chunk).filter(Boolean); if (ch.length < 2) continue;
  const total = Math.round(Math.min(ps[0].input.duration, 30) * 16); const okCover = ch[0].start === 0 && ch.at(-1).start + ch.at(-1).length >= total - 4 && ch.every((c, i) => i === 0 || (ch[i - 1].start + ch[i - 1].length - c.start) >= 16) && ch.every((c) => c.length <= 81 && c.length % 4 === 1);
  rows.push({ file: `${job} (chunks)`, tool: ps[0].toolId, provider: ps[0].provider, workflow: ps[0].workflow, checks: [{ name: `chunks cover ${total} frames, ≤81 each (4n+1), overlap ≥16`, ok: okCover, info: JSON.stringify(ch) }], ok: okCover }); }
fs.writeFileSync(path.join(HERE, 'report.json'), JSON.stringify(rows, null, 1));
const md = ['# Graph assertions', '', `${rows.filter((r) => r.ok).length}/${rows.length} graphs pass. Generated by graph-assert.mjs from readiness/graph/captured (stub e2e run).`, '', '| graph | tool · provider | workflow | result | failed checks |', '|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.file} | ${r.tool} · ${r.provider} | ${r.workflow} | ${r.ok ? 'pass' : '**FAIL**'} | ${r.checks.filter((c) => !c.ok).map((c) => `${c.name} (${c.info})`).join('; ')} |`), '',
  '## Recommended values: sources', '', ...CARDS.map((k) => `- ${k.wf.source}: ${k.cls} ${k.steps} steps, cfg ${k.cfg}, ${k.sampler}. Source: ${k.src}. (${k.sourced})`),
  '- Not sourced (left at the official template value, no card number found): LTX-2 (camera-ltx, reshoot) CFGGuider/LTXVScheduler, MiniMax H3 BasicScheduler steps, FLUX.2 klein/dev Flux2Scheduler, Qwen-Image / Qwen-Image-Edit-2509 Lightning steps, SeedVR2, RIFE, BiRefNet.'];
fs.writeFileSync(path.join(HERE, 'report.md'), md.join('\n'));
const bad = rows.filter((r) => !r.ok); for (const r of bad) console.log('FAIL', r.file, r.tool, r.provider, r.workflow, r.checks.filter((c) => !c.ok).map((c) => `${c.name} [${c.info}]`).join(' | '));
console.log(`${rows.length - bad.length}/${rows.length} pass`); process.exit(bad.length ? 1 : 0);
