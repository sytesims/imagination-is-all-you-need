/**
 * Interim AI tiles (openhiggsfield-tools-out/interim-tiles-manifest.md): AI-generated stills DP drops at web/public/examples/<page>/<id>.jpg
 * (served at /examples/<page>/<id>.jpg) replace procedural placeholder art until the Oct 26–29 real run. A still is used only once its file
 * exists (checked lazily, 30 s cache), so nothing points at a missing file; until then the old art stays.
 * OPENHIGGSFIELD_EXAMPLES_DIR overrides the folder that is checked first (tests); web/public/examples is always the fallback.
 * OPENHIGGSFIELD_INTERIM_TILES=0 turns the stills off (old art everywhere).
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const WEB_EXAMPLES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/public/examples');
const roots = () => [process.env.OPENHIGGSFIELD_EXAMPLES_DIR?.trim(), WEB_EXAMPLES].filter(Boolean).map((r) => path.resolve(r!));
/** Local file for an /examples/… URL (override folder first, then web/public/examples), or null. */
export function examplesFileOf(rel: string): string | null {
  if (rel.includes('..')) return null;
  for (const r of roots()) { const f = path.join(r, rel); if (existsSync(f)) return f; }
  return null;
}
const cache = new Map<string, { at: number; url: string | null }>(); const TTL = 30_000;
/** `/examples/<page>/<id>.jpg` when that interim still exists, else null. Pages: object-swap, motion-transfer, restyle, community, assets. */
export function interimStill(page: string, id: string, now = Date.now()): string | null {
  if (process.env.OPENHIGGSFIELD_INTERIM_TILES === '0') return null; // off: always the old art (legacy tests)
  const k = `${page}/${id}`; const c = cache.get(k); if (c && now - c.at < TTL) return c.url;
  const url = examplesFileOf(`${k}.jpg`) ? `/examples/${k}.jpg` : null; cache.set(k, { at: now, url }); return url;
}
export const clearInterimCache = () => cache.clear();

export const PRESET_AI_CREDIT = 'AI-generated preview';
/**
 * Preset tiles (Object Swap, Motion Transfer, Restyle): posterUrl / previewWebm / aiGenerated / credit become live (enumerable getters, so they
 * show up in JSON and object spreads): the interim still when it exists (hover clip off: previewWebm null), else the old placeholder art.
 * An explicit assignment (p.posterUrl = …) still wins.
 */
export function wireInterimPreset(page: string, p: Record<string, any>, oldPoster: string, oldWebm: string | null) {
  const own: Record<string, any> = {};
  const still = () => interimStill(page, p.id);
  const prop = (name: string, get: () => unknown) => Object.defineProperty(p, name, { enumerable: true, configurable: true,
    get: () => (name in own ? own[name] : get()), set: (v) => { own[name] = v; } });
  prop('posterUrl', () => still() ?? oldPoster);
  prop('previewWebm', () => (still() ? null : oldWebm));
  prop('aiGenerated', () => !!still());
  prop('credit', () => (still() ? PRESET_AI_CREDIT : null));
}

// ---- Assets (demo-reset / filming seed jobs demo01–demo09) ----
export const ASSET_JOB_IDS = ['demo01', 'demo02', 'demo03', 'demo04', 'demo05', 'demo06', 'demo07', 'demo08', 'demo09'];
export const ASSET_CAPTION = 'AI-generated preview still · the clip is sample media';
/** Assets tile poster + caption for a job: the interim still for the seeded demo jobs once it exists, else nulls (Assets keeps its own thumb). */
export function jobPoster(id: string): { posterUrl: string | null; caption: string | null } {
  const u = ASSET_JOB_IDS.includes(id) ? interimStill('assets', id) : null;
  return { posterUrl: u, caption: u ? ASSET_CAPTION : null };
}

// ---- DP #21: per-option media (Orbit Shot orbit types, Transitions, UGC Ad presenters, Relight directions) ----
/** App id → the option field whose tiles get a poster and a loop. */
export const OPTION_MEDIA: Record<string, string> = { 'orbit-shot': 'orbit', transition: 'transition', 'ugc-ad': 'presenter', relight: 'direction' };
const mediaCache = new Map<string, { at: number; url: string | null }>();
const firstExisting = (stem: string, exts: string[], now = Date.now()): string | null => {
  const c = mediaCache.get(stem + exts.join()); if (c && now - c.at < TTL) return c.url;
  const ext = exts.find((e) => examplesFileOf(`${stem}${e}`)); const url = ext ? `/examples/${stem}${ext}` : null;
  mediaCache.set(stem + exts.join(), { at: now, url }); return url;
};
/** Where the files go: web/public/examples/options/<appId>/<field>-<value>.jpg (poster; .png/.webp too) and .mp4 (loop; .webm too). */
export const optionStem = (appId: string, field: string, value: string) => `options/${appId}/${field}-${value}`;
export function optionMedia(appId: string, field: string, value: string) {
  const stem = optionStem(appId, field, value); const posterUrl = firstExisting(stem, ['.jpg', '.png', '.webp']); const loopUrl = firstExisting(stem, ['.mp4', '.webm']);
  return { posterUrl, loopUrl, needsRealPoster: !posterUrl, file: `web/public/examples/${stem}.jpg`, loopFile: `web/public/examples/${stem}.mp4` };
}
/** Live getters on one option: posterUrl / loopUrl (null until the file exists), needsRealPoster; poster / preview mirror them (older field names). */
export function wireOptionMedia<T extends Record<string, any>>(appId: string, field: string, o: T): T {
  const m = () => optionMedia(appId, field, String(o.value));
  for (const [k, get] of [['posterUrl', () => m().posterUrl], ['loopUrl', () => m().loopUrl], ['needsRealPoster', () => m().needsRealPoster], ['poster', () => m().posterUrl], ['preview', () => m().loopUrl]] as const)
    Object.defineProperty(o, k, { enumerable: true, configurable: true, get });
  return o;
}
/** DP #21 / DP batch: built-in voice sample at web/public/examples/voice/<value>.mp3 (.wav/.m4a too); null when missing. A clip without examples/voice/<value>.json {"kind":"real"} is a stand-in (sampleKind 'standin'). */
export const voiceSampleUrl = (value: string) => firstExisting(`voice/${value}`, ['.mp3', '.wav', '.m4a']);
/** Is the voice sample a real recording of that built-in voice (Chatterbox's own default voice for 'builtin')? Only when a sidecar
 *  web/public/examples/voice/<value>.json says {"kind":"real"}; any other sample (or none) is a stand-in. Read live, never cached. */
export function voiceSampleKind(value: string): 'real' | 'standin' {
  const side = examplesFileOf(`voice/${value}.json`); if (!side || !['.mp3', '.wav', '.m4a'].some((e) => examplesFileOf(`voice/${value}${e}`))) return 'standin';
  try { return JSON.parse(readFileSync(side, 'utf8'))?.kind === 'real' ? 'real' : 'standin'; } catch { return 'standin'; }
}
export const clearOptionMediaCache = () => mediaCache.clear();

/** Restyle style tiles (23): real still at presets/restyle-<id>.jpg and real loop at .mp4/.webm; until then posterUrl/previewWebm are stand-ins.
 *  Single source of truth for /api/tools presets, /api/presets, /api/posters slots. */
export function restyleStyleMedia(id: string, placeholderLoop: string | null) {
  const posterRel = `presets/restyle-${id}.jpg`; const loopRel = `presets/restyle-${id}.mp4`;
  const realPoster = !!examplesFileOf(posterRel);
  const realLoop = [loopRel, `presets/restyle-${id}.webm`].find((r) => examplesFileOf(r)) ?? null;
  const loopUrl = realLoop ? `/examples/${realLoop}` : placeholderLoop;
  return { loopUrl, loopPlaceholder: !realLoop && !!loopUrl, needsRealLoop: !realLoop, standIn: !realPoster || !realLoop, loopDropAt: `web/public/examples/${loopRel}` };
}
/** Live getters on a Restyle style preset: loopUrl / loopPlaceholder / needsRealLoop / standIn (same fields as /api/posters slots). */
export function wireRestyleStyleMedia<T extends Record<string, any>>(p: T): T {
  const m = () => restyleStyleMedia(String(p.id), (p.previewWebm as string | null | undefined) ?? null);
  for (const k of ['loopUrl', 'loopPlaceholder', 'needsRealLoop', 'standIn'] as const)
    Object.defineProperty(p, k, { enumerable: true, configurable: true, get: () => m()[k] });
  return p;
}

// ---- Photo FX (and other /samples/presets art): poster + hover loop only when the file is there ----
const SAMPLES_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../samples');
const sampleCache = new Map<string, { at: number; ok: boolean }>();
/** Does server/samples/<rel> exist? (30 s cache, like the interim stills.) */
export function sampleExists(rel: string, now = Date.now()): boolean {
  if (rel.includes('..')) return false; const c = sampleCache.get(rel); if (c && now - c.at < TTL) return c.ok;
  const ok = existsSync(path.join(SAMPLES_ROOT, rel)); sampleCache.set(rel, { at: now, ok }); return ok;
}
export const clearSampleCache = () => sampleCache.clear();
/** Live posterUrl / previewWebm / standIn on a preset tile: a dropped still at web/public/examples/<stem>.jpg first (interim / real art, same
 *  drop folder as the other tiles), else the procedural /samples/<stem>.jpg|.webm, else null with standIn true, so a newly added preset never
 *  points at a missing file (the web draws the branded stand-in tile). Explicit assignments still win. */
export function wireSamplePresetMedia(p: Record<string, any>, stem: string) {
  const own: Record<string, any> = {};
  const prop = (name: string, get: () => unknown) => Object.defineProperty(p, name, { enumerable: true, configurable: true, get: () => (name in own ? own[name] : get()), set: (v) => { own[name] = v; } });
  const dropped = () => firstExisting(stem, ['.jpg', '.png', '.webp']);
  prop('posterUrl', () => dropped() ?? (sampleExists(`${stem}.jpg`) ? `/samples/${stem}.jpg` : null));
  prop('previewWebm', () => firstExisting(stem, ['.webm', '.mp4']) ?? (dropped() ? null : sampleExists(`${stem}.webm`) ? `/samples/${stem}.webm` : null));
  prop('standIn', () => !p.posterUrl);
}
