// CPU smoke: tiny real graphs on a separate CPU ComfyUI (port 8191, small open weights only).
import fs from 'node:fs';
const B = process.env.SMOKE_COMFY || 'http://127.0.0.1:8191';
const img = { '1': { class_type: 'LoadImage', inputs: { image: 'a.png' } } };
const graphs = {
  taesd_roundtrip: { ...img,
    '2': { class_type: 'VAELoader', inputs: { vae_name: 'taesd' } },
    '3': { class_type: 'VAEEncode', inputs: { pixels: ['1', 0], vae: ['2', 0] } },
    '4': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['2', 0] } },
    '5': { class_type: 'SaveImage', inputs: { images: ['4', 0], filename_prefix: 'smoke_taesd' } } },
  rife49_x2: { ...img,
    '2': { class_type: 'RepeatImageBatch', inputs: { image: ['1', 0], amount: 2 } },
    '3': { class_type: 'RIFE VFI', inputs: { ckpt_name: 'rife49.pth', frames: ['2', 0], clear_cache_after_n_frames: 10, multiplier: 2, fast_mode: true, ensemble: true, scale_factor: 1.0, dtype: 'float32', torch_compile: false, batch_size: 1 } },
    '4': { class_type: 'SaveImage', inputs: { images: ['3', 0], filename_prefix: 'smoke_rife' } } },
  sam21_tiny_point: { ...img,
    '2': { class_type: 'DownloadAndLoadSAM2Model', inputs: { model: 'sam2.1_hiera_tiny.safetensors', segmentor: 'single_image', device: 'cpu', precision: 'fp32' } },
    '3': { class_type: 'PrimitiveStringMultiline', inputs: { value: '[{"x":128,"y":128}]' } },
    '4': { class_type: 'Sam2Segmentation', inputs: { sam2_model: ['2', 0], image: ['1', 0], keep_model_loaded: false, coordinates_positive: ['3', 0] } },
    '5': { class_type: 'MaskToImage', inputs: { mask: ['4', 0] } },
    '6': { class_type: 'SaveImage', inputs: { images: ['5', 0], filename_prefix: 'smoke_sam2' } } },
};
const WF = (f) => JSON.parse(fs.readFileSync(new URL(`../../workflows/${f}`, import.meta.url)));
// image-upscale: the shipped workflow, real Real-ESRGAN x2plus weights (67 MB)
const up = WF('image-upscale-x2-api.json'); up['1'].inputs.image = 'b.png'; up['3'].inputs.model_name = 'smoke-RealESRGAN_x2plus.pth'; graphs.image_upscale_realesrgan_x2 = up;
// cutout (BiRefNet-general 444 MB): the plugin's model + matting nodes and settings, on one image instead of a clip
const co = JSON.parse(fs.readFileSync(new URL('../../plugins/cutout/workflow.json', import.meta.url)));
graphs.birefnet_cutout = { '1': { class_type: 'LoadImage', inputs: { image: 'b.png' } }, '3': { ...co['3'], inputs: { ...co['3'].inputs, model: 'smoke-BiRefNet-general.safetensors', device: 'CPU', dtype: 'float32' } },
  '4': { ...co['4'], inputs: { ...co['4'].inputs, model: ['3', 0], images: ['1', 0] } }, '5': { class_type: 'SaveImage', inputs: { images: ['4', 0], filename_prefix: 'smoke_cutout' } } };
// translate step 1: the shipped Whisper workflow with the tiny model (75 MB)
const wh = WF('voice-whisper-api.json'); wh['1'].inputs.audio = 'voice.wav'; wh['2'].inputs.model = 'tiny'; graphs.whisper_tiny_transcript = wh;
// voiceover: the shipped F5-TTS workflow (F5v1 base ≈1.35 GB + vocos), reference = a 6 s tone with a given ref text
if (!process.env.SKIP_F5) { const f5 = WF('voice-f5tts-api.json'); f5['1'].inputs.audio = 'voice.wav'; Object.assign(f5['2'].inputs, { sample_text: 'A short test tone.', speech: 'Hello from the smoke test.' }); graphs.f5tts_voiceover = f5; }
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const res = fs.existsSync(new URL('./cpu-results.json', import.meta.url)) ? JSON.parse(fs.readFileSync(new URL('./cpu-results.json', import.meta.url))) : {};
for (const [name, prompt] of Object.entries(graphs)) {
  if (ONLY && !ONLY.has(name)) continue;
  const t0 = Date.now();
  try {
    const r = await (await fetch(B + '/prompt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt }) })).json();
    if (!r.prompt_id) throw new Error(JSON.stringify(r).slice(0, 400));
    let h;
    for (;;) { await new Promise(s => setTimeout(s, 1000)); h = (await (await fetch(B + '/history/' + r.prompt_id)).json())[r.prompt_id]; if (h?.status?.completed || h?.status?.status_str === 'error') break; if (Date.now() - t0 > 1200000) throw new Error('timeout'); }
    const imgs = Object.values(h.outputs || {}).flatMap(o => [...(o.images || []), ...(o.audio || []), ...(o.text || [])]);
    const text = Object.values(h.outputs || {}).flatMap(o => o.text || []).join(' ').slice(0, 120);
    res[name] = { ok: !!h.status.completed && imgs.length > 0, outputs: imgs.length, seconds: (Date.now() - t0) / 1000, ...(text ? { text } : {}), error: h.status.completed ? undefined : JSON.stringify(h.status.messages).slice(-400) };
  } catch (e) { res[name] = { ok: false, error: String(e.message), seconds: (Date.now() - t0) / 1000 }; }
  console.log(name, res[name]);
}
fs.writeFileSync(new URL('./cpu-results.json', import.meta.url), JSON.stringify(res, null, 2));
process.exit(Object.values(res).every(r => r.ok) ? 0 : 1);
