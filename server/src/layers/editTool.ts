/**
 * Video to layers: "Render" in the layers viewer (tool id layers-edit, hidden from menus). Takes a finished split (split), the changes
 * (edit: edit.ts LayersEditSpec) and one transparent picture per text (texts, drawn by the browser at the split's frame size), and makes a new
 * result on this computer with ffmpeg (editRender.ts): free, no model, nothing sent anywhere. The split it came from stays as it was.
 */
import path from 'node:path';
import type { ToolDef } from '../tools/types.js';
import type { Job } from '../jobs.js';
import { jobs } from '../jobs.js';
import { DATA_DIR } from '../config.js';
import { registerProvider } from '../providers.js';
import { NATIVE_DIRECT } from '../routing/directRoutes.js';
import { readManifest } from './exportZip.js';
import { normEdit, editSummary, MAX_TEXTS } from './edit.js';
import { renderEdit } from './editRender.js';
import { LAYERS_EDIT_TOOL, LAYER_JOB_TOOLS } from './constants.js';

export const LAYERS_EDIT_PROVIDER = 'local-layers-edit';
export { LAYERS_EDIT_TOOL, LAYER_JOB_TOOLS };

registerProvider({ id: LAYERS_EDIT_PROVIDER, name: 'Your changes (ffmpeg on this computer)', kind: 'open-weights', via: 'This computer: our own ffmpeg filtergraphs (no ComfyUI, no provider)', workflows: [],
  license: 'agpl-3.0-or-later', licenseParts: ['agpl-3.0-or-later'] } as any);
NATIVE_DIRECT[LAYERS_EDIT_PROVIDER] = { noComfy: true, label: 'Your computer · free' } as any;

const bad = (field: string, message: string, code = 'invalid') => ({ error: message, code, issues: [{ code, field, message }] }) as any;
const STAGES: [string, string][] = [['layers', 'Applying your changes to each layer'], ['composite', 'Putting it together'], ['saving', 'Saving']];

export const layersEditTool: ToolDef = {
  id: LAYERS_EDIT_TOOL, name: 'Video to layers: your changes', listed: false, category: 'Edit Video', route: '/video?workflow=layers', ui: 'app',
  description: 'Move, scale, hide or recolour the layers of a split, and add text in front or behind them. Made on this computer, free.',
  inputs: [{ name: 'layersJob', kind: 'text', required: true, label: 'The split to change' }, { name: 'edit', kind: 'text', required: true, label: 'The changes (JSON)' },
    { name: 'texts', kind: 'files', accept: 'image/png', label: 'One transparent picture per text' }],
  workflows: [], model: 'ffmpeg on this computer', gpuSecPerSec: { source: 0 }, providers: [LAYERS_EDIT_PROVIDER], stages: STAGES,
  async parseInput(fields, files) {
    const id = String(fields.layersJob ?? '').trim(); const from = jobs.get(id);
    if (!from || !LAYER_JOB_TOOLS.includes(from.toolId) || from.status !== 'done') return bad('layersJob', 'Pick a finished Video to layers result to change.', 'required');
    const m = await readManifest(id); if (!m) return bad('layersJob', 'That split has no layers any more.', 'gone');
    let spec; try { spec = normEdit(fields.edit, m.layers.map((l) => l.id), m); } catch (e) { return bad('edit', e instanceof Error ? e.message : 'The changes could not be read.'); }
    const pngs = (files.texts ?? []).filter((f) => /\.png$/i.test(f)).slice(0, MAX_TEXTS);
    if (pngs.length !== spec.texts.length) return bad('texts', 'Each text needs its picture. Try Render again.', 'texts');
    const names = Object.fromEntries(m.layers.map((l) => [l.id, l.name]));
    return { mode: 'layers-edit', outKind: 'video', layersJob: id, edit: spec, textPaths: pngs.map((f) => path.join(DATA_DIR, f)), textNames: spec.texts.map((t) => `Text “${t.text}”`),
      prompt: editSummary(spec, names), videoUrl: m.sourceUrl, width: m.width, height: m.height, duration: m.seconds, hasAudio: false, outputLabel: 'Your changes', warnings: [] };
  },
  /** Real on every backend: ffmpeg on this computer, no model. */
  async run(job: Job) {
    const i: any = job.input; job.status = 'running' as any; job.stage = 'layers' as any; job.progress = 10;
    try {
      const m = await readManifest(i.layersJob); if (!m) throw new Error('That split has no layers any more.');
      const finals = await renderEdit({ jobId: job.id, from: { id: i.layersJob, m }, spec: i.edit, textPngs: i.textPaths, textNames: i.textNames });
      job.outputs = finals.map((f) => ({ label: f.label, url: `/files/${path.basename(f.file)}`, width: m.width, height: m.height } as any)); job.resultUrl = job.outputs[0].url;
      job.status = 'done'; job.stage = 'done'; job.progress = 100; job.eta = 0;
    } catch (e) {
      job.status = 'failed'; job.errorType = 'temporary'; job.error = `Your changes could not be rendered (${e instanceof Error ? e.message : String(e)}).`;
    }
  },
};
