/**
 * LTX-2.5 LoRAs (2026-10-26): GET /api/ltx-loras → every LoRA in shared/ltxLoras.ts with its file state on this computer.
 * Read-only; nothing is downloaded. state: ready | downloading (smaller than its known size) | missing (needs download) | unknown (no models folder set).
 * download: 'app' (the downloader can fetch url) or 'manual' (login wall: the user puts the file in models/loras).
 */
import type { FastifyInstance } from 'fastify';
import { modelsDir, modelFileBytes } from './hardware/requirements.js';
import { LTX_LORAS, ltxLoraState } from './shared/ltxLoras.js';

export function ltxLoraList(dir: string | null = modelsDir()) {
  return Object.values(LTX_LORAS).map((l) => {
    const have = dir ? modelFileBytes(dir, l.folder, l.file) : null; const state = ltxLoraState(l, have, !!dir);
    return { id: l.id, label: l.label, file: l.file, folder: l.folder, bytes: l.bytes, haveBytes: have, state, needsDownload: state === 'missing' || state === 'downloading',
      download: l.url ? 'app' : 'manual', trigger: l.trigger, strengths: l.strengths, sourceUrl: l.sourceUrl, credit: l.credit, licence: l.licence };
  });
}
export function registerLtxLoras(app: FastifyInstance) {
  app.get('/api/ltx-loras', async () => ({ modelsDirSet: !!modelsDir(), loras: ltxLoraList() }));
}
