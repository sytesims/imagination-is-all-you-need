import type { FastifyInstance } from 'fastify';
import { createReadStream, existsSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../config.js';
import { runFfmpeg } from '../ffmpeg.js';
import { enhancePrompt, type EnhanceKind } from './enhance.js';
import { parseTimeline, timelinePhrase, CAMERA_MOVES, EMOTIONS, INTENSITIES, emotionPhrase, autoPanels } from './timeline.js';
import { APP_GALLERY, wireVoiceSample } from '../tools/apps.js';
import { voiceSampleUrl } from '../interimTiles.js';
import { STYLE_PRESETS, VOICE_LANGUAGES, VOICE_LIBRARY } from '../tools/mediaPresets.js';
import { getTool } from '../tools/registry.js';
import { seedOf } from '../tools/shared.js';
import { jobs } from '../jobs.js';
import { LOOK_OPTIONS } from './look.js';
import { CINEMA_MAX_REFS, CINEMA_MODES, CINEMA_MODE_PROVIDERS, CINEMA_MAX_COUNT } from './tool.js';
import { CAMERA_LAUNCH } from '../tools/apps.js';
import { NEW_DAYS, posterInfo } from '../routesDiscover.js';

/** Director / prompt-enhance / Apps gallery routes (registered from index.ts). */
export function registerCinema(app: FastifyInstance) {
  app.post<{ Body: { prompt?: string; kind?: EnhanceKind; style?: string; /** model key (prompt grammar): its structure, syntax and cap shape the rewrite */ model?: string } }>('/api/prompt/enhance', async (req, reply) => {
    const prompt = String(req.body?.prompt ?? ''); const kind = (['image', 'video', 'audio'].includes(String(req.body?.kind)) ? req.body!.kind : 'image') as EnhanceKind;
    if (!prompt.trim()) return reply.code(400).send({ error: 'Type a prompt first, then enhance it.', errorType: 'validation', issues: [{ code: 'required', field: 'prompt', message: 'Type a prompt first, then enhance it.' }] });
    if (prompt.length > 10_000) return reply.code(400).send({ error: 'Prompt is too long.' });
    const style = STYLE_PRESETS.find((s) => s.id === req.body?.style)?.prompt;
    return { original: prompt, ...(await enhancePrompt(prompt, kind, style, typeof req.body?.model === 'string' ? req.body.model : null)) };
  });
  app.get('/api/styles', async () => STYLE_PRESETS);
  /** Voice list. previewUrl → a short local mock preview (generated with ffmpeg on first request, cached in DATA_DIR/voice-previews; no provider call).
   * The 'clone' entry has no preview (previewUrl null) until a sample is uploaded. */
  app.get('/api/voices', async () => ({ voices: VOICE_LIBRARY.map((v) => ({ ...v, previewUrl: v.id === 'clone' ? null : `/api/voices/${v.id}/preview`, previewMock: v.id !== 'clone',
    // DP #27: sampleUrl non-null stand-in (same clip as Change Voice builtin) so the play button has a URL on every voice DP lists
    sampleUrl: v.id === 'clone' ? null : (voiceSampleUrl('builtin') ?? '/examples/voice/builtin.mp3'), needsSample: v.id === 'clone', sampleKind: v.id === 'clone' ? null : 'standin', sampleIsStandIn: v.id !== 'clone' })), languages: VOICE_LANGUAGES }));
  app.get<{ Params: { id: string } }>('/api/voices/:id/preview', async (req, reply) => {
    const k = VOICE_LIBRARY.findIndex((v) => v.id === req.params.id);
    if (k < 0 || req.params.id === 'clone') return reply.code(404).send({ error: 'No preview for this voice.', errorType: 'validation' });
    const dir = path.join(DATA_DIR, 'voice-previews'); mkdirSync(dir, { recursive: true }); const file = path.join(dir, `${req.params.id}.wav`);
    if (!existsSync(file)) { // mock: a 2 s voice-like tone, pitch per voice (deep → low, bright → high)
      const f0 = ({ 'deep-calm': 110, 'narrator-warm': 140, 'narrator-crisp': 170, 'energetic-host': 200, 'young-bright': 240, 'whisper-soft': 190 } as Record<string, number>)[req.params.id] ?? 150 + k * 15;
      const tmp = `${file}.${process.pid}.tmp.wav`;
      const code = await runFfmpeg(['-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=f=${f0}:d=2:sample_rate=24000`, '-af', `tremolo=f=4:d=0.8,volume=${req.params.id === 'whisper-soft' ? 0.25 : 0.6},afade=t=in:d=0.1,afade=t=out:st=1.8:d=0.2`, '-ac', '1', tmp]);
      if (code !== 0) return reply.code(500).send({ error: 'Could not make the preview.', errorType: 'server' });
      renameSync(tmp, file);
    }
    return reply.header('cache-control', 'max-age=86400').type('audio/wav').send(createReadStream(file));
  });
  /** Camera Moves 'New' / 'Trending'. Trending = real camera-job counts per move over the last `days` (default 7), top `limit`;
   * New = presets that shipped after the tool launch, within NEW_DAYS of their addedAt. No usage → empty Trending (never invented). */
  app.get<{ Querystring: { days?: string; limit?: string } }>('/api/camera/categories', async (req) => {
    const t = getTool('camera'); const presets = t?.presets ?? []; const days = Math.min(90, Math.max(1, Number(req.query.days) || 7)); const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 8));
    const since = Date.now() - days * 86400_000; const counts = new Map<string, number>();
    for (const j of jobs.values()) {
      if ((j as any).seed || j.toolId !== 'camera' || (j.createdAt ?? 0) < since || ['failed', 'canceled', 'blocked'].includes(j.status)) continue;
      for (const id of new Set<string>(Array.isArray(j.input?.types) ? j.input.types : [])) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const trending = [...counts.entries()].filter(([id]) => presets.some((p) => p.id === id)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([id, count]) => { const p: any = presets.find((x) => x.id === id)!; return { id, count, kind: 'camera-preset', toolId: 'camera', presetId: id, label: p.label, category: p.category ?? p.group, description: p.description ?? null, providers: p.providers ?? null, aspects: p.aspects ?? null, posterUrl: p.posterUrl ?? null, previewUrl: p.previewUrl ?? null }; }); // a camera preset (types=[id]), never a videoPreset
    const now = Date.now(); const launch = Date.parse(CAMERA_LAUNCH);
    const fresh = presets.filter((p) => p.addedAt && Date.parse(p.addedAt) > launch && now - Date.parse(p.addedAt) < NEW_DAYS * 86400_000).map((p) => ({ id: p.id, addedAt: p.addedAt! }));
    return { groups: [{ id: 'new', label: 'New', items: fresh.map((x) => x.id) }, { id: 'trending', label: 'Trending', items: trending.map((x) => x.id) }], new: fresh, trending, windowDays: days, newDays: NEW_DAYS, basis: { trending: 'count of done/running camera jobs using each move', new: `addedAt after ${CAMERA_LAUNCH}, within ${NEW_DAYS} days` } };
  });
  app.get('/api/cinema/options', async () => ({ look: Object.fromEntries(Object.entries(LOOK_OPTIONS).map(([k, v]) => [k, v.map(({ id, label }) => ({ id, label }))])), modes: CINEMA_MODES, modeProviders: CINEMA_MODE_PROVIDERS, maxRefsByProvider: CINEMA_MAX_REFS, priceEffect: 'none (prompt modifiers)',
    // GAP-MATRIX 14: every option the cinema job endpoint accepts, generated from the same server definitions (look.ts, timeline.ts, tool.ts inputs).
    cameras: LOOK_OPTIONS.cameraBody.map(({ id, label }) => ({ id, label })), lenses: LOOK_OPTIONS.lens.map(({ id, label }) => ({ id, label })), apertures: LOOK_OPTIONS.aperture.map(({ id, label }) => ({ id, label })),
    movements: CAMERA_MOVES.map(({ id, label }) => ({ id, label, tag: `#${id}` })), emotions: EMOTIONS, intensities: INTENSITIES,
    ...(() => { const t: any = getTool('cinema'); const sel = Object.fromEntries((t?.inputs ?? []).filter((i: any) => i.kind === 'select').map((i: any) => [i.name, { options: i.options, default: i.default ?? null }]));
      const caps = t?.app?.capabilities ?? {}; return { fields: sel, durations: (sel.duration?.options ?? []).map(Number), resolutions: sel.resolution?.options ?? [], defaultResolution: sel.resolution?.default ?? null, aspects: sel.aspect?.options ?? [], aspectsByProvider: caps.aspectsByProvider ?? {}, audioByProvider: caps.audioByProvider ?? {}, maxCount: CINEMA_MAX_COUNT }; })() }));
  app.get('/api/cinema/moves', async () => ({ moves: CAMERA_MOVES, emotions: EMOTIONS, intensities: INTENSITIES }));
  /** Live preview for the prompt bar: parsed timeline + Auto panels without submitting. */
  app.post<{ Body: { prompt?: string; duration?: number; emotion?: string; intensity?: string; auto?: boolean; seed?: number } }>('/api/cinema/plan', async (req) => {
    const b = req.body ?? {}; const duration = Number(b.duration) || 5; const tl = parseTimeline(String(b.prompt ?? ''), duration);
    const seed = seedOf(b.seed != null ? String(b.seed) : undefined);
    return { ...tl, phrase: timelinePhrase(tl.segments), emotionPhrase: emotionPhrase(EMOTIONS.includes(b.emotion as any) ? b.emotion! : 'neutral', b.intensity ?? 'clear'), seed, panels: b.auto ? autoPanels(seed, duration, tl.segments) : [] };
  });
  /** Oct 18 #1: each app's cover = its tool's /api/posters entry (same per-tool order: interim still → own preset art → real result → title card). */
  const appPoster = (a: { id: string; poster: string | null }) => { const t = getTool(`app-${a.id}`); const pi = t ? posterInfo(t) : null;
    return { poster: a.poster ?? pi?.posterUrl ?? null, posterUrl: a.poster ?? pi?.posterUrl ?? null, posterKind: a.poster ? 'designed' : pi?.kind ?? null, needsRealPoster: a.poster ? false : !!pi?.needsRealPoster }; };
  /** DP #27: Change Voice (and any app with a builtin voice choice) carries sampleUrl on /api/apps the same as /api/tools. */
  const withVoiceSamples = <T extends { inputOptions?: Record<string, { value: string; label: string; runsAs?: string }[]> }>(a: T): T => {
    const io = a.inputOptions; if (!io?.voice) return a;
    return { ...a, inputOptions: { ...io, voice: io.voice.map((x) => (x.value === 'builtin' ? wireVoiceSample({ ...x }) : { ...x })) } };
  };
  app.get<{ Querystring: { q?: string; category?: string } }>('/api/apps', async (req) => {
    const q = (req.query.q ?? '').toLowerCase(); const cat = req.query.category;
    const items = APP_GALLERY.filter((a) => (!cat || a.category === cat) && (!q || `${a.name} ${a.description} ${a.category}`.toLowerCase().includes(q)))
      .map((a) => ({ ...withVoiceSamples(a), ...appPoster(a), toolId: `app-${a.id}`, route: `/tools/app-${a.id}`, runnable: !!getTool(`app-${a.id}`), baseName: getTool(a.base)?.name ?? a.base }));
    return { categories: [...new Set(APP_GALLERY.map((a) => a.category))], items };
  });
  app.get<{ Params: { id: string } }>('/api/apps/:id', async (req, reply) => {
    const a = APP_GALLERY.find((x) => x.id === req.params.id || `app-${x.id}` === req.params.id);
    return a ? { ...withVoiceSamples(a), ...appPoster(a), toolId: `app-${a.id}`, route: `/tools/app-${a.id}`, inputs: getTool(`app-${a.id}`)?.inputs ?? [] } : reply.code(404).send({ error: 'No such app.' });
  });
}
