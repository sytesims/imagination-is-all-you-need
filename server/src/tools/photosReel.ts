import type { ToolDef } from './types.js';
import { cameraApp } from './apps.js';
import { parseReelOptions } from '../shared/photosToReel.js';
/** Composite base; its app uses the normal submit endpoint, whose orchestrator submits each existing tool. */
export const photosReelTool: ToolDef = {
  id: 'photos-reel', name: 'Photos → Reel', category: 'Video', route: '/video?workflow=photos-to-reel', listed: false, ui: 'app',
  description: 'Turn 8–15 photos into a short vertical reel.',
  providers: cameraApp.providers.filter(p => p !== 'comfy-h3-camera'), workflows: cameraApp.workflows, gpuSecPerSec: {}, stages: [],
  inputs: [{ name: 'photos', kind: 'files', accept: 'image/png,image/jpeg,image/webp', max: 15, required: true, label: 'Photos' },
    { name: 'aspect', kind: 'select', options: ['9:16'], default: '9:16' }, { name: 'resolution', kind: 'select', options: ['720p'], default: '720p' },
    { name: 'title', kind: 'text', required: true }, { name: 'endLine', kind: 'text' },
    { name: 'kind', kind: 'select', options: ['listing','event','hotel','trip','product'], default: 'listing' },
    { name: 'seconds', kind: 'select', options: ['15','30'], default: '30' },
    { name: 'motion', kind: 'select', options: ['heroes','all'], default: 'heroes' },
    { name: 'music', kind: 'select', options: ['on','off'], default: 'on' }],
  app: { input: 'image', output: 'video', durations: [15,30], defaultDuration: 30, promptOptional: true },
  parseInput: async (fields, files) => { const o = parseReelOptions(fields, files.photos?.length ?? 0); return 'error' in o ? o : { ...o, photos: files.photos }; },
  run: async (job) => { job.status = 'failed'; job.error = 'Submit Photos → Reel through its workflow endpoint.'; },
};
