/**
 * DESIGN-NOTES 17–19 data APIs: media type + Image/Video/Audio routes, badges, posters, /api/pricing, global search,
 * community feed, full-length GIF export. All derived from the live registry / jobs (no new UI here).
 */
import { reseedIfDue } from './communitySeed.js';
import { appFileName } from './shared/fileNames.js';
import type { FastifyInstance } from 'fastify';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { ToolDef } from './tools/types.js';
import { listTools, getTool } from './tools/registry.js';
import { jobs } from './jobs.js';
import { countsAsRun } from './owner.js';
import { history } from './queue.js';
import * as lib from './library.js';
import { EXAMPLES } from './examples.js';
import { OPTION_MEDIA, optionMedia } from './interimTiles.js';
import { APP_GALLERY } from './tools/apps.js';
import { sampleFor } from './sampleMedia.js';
import { SAMPLE_TOOL_ID } from './communitySeed.js';
import { modelsFor } from './models.js';
import { priceOf, PROVIDER_FACTORS, DRAFT_FACTOR, MIN_PRICE, HOSTED_PRICES, PRICING_TABLE_EXTRA, USD_PER_CREDIT, COMFY_CREDITS_PER_USD } from './shared/pricing.js';
import { lifecycleFields } from './shared/lifecycle.js';
import { unitInfo, unitQty } from './shared/hostedPrices.js';
import { FREE_GENS_MAX_RES, freeGensLeft, FREE_GENS_START, TOPUP_PACKS } from './ledger.js';
import { toolProviders, getProvider, allowed, openWeightsOnly } from './providers.js';
import { runFfmpeg, posterFrame, ffmpegDrawsText } from './ffmpeg.js';
import { DATA_DIR, SAMPLES_DIR, config } from './config.js';
import { examplesFileOf } from './interimTiles.js';
import { POSTER_STAND_IN } from './tools/shots.js';
import { MENU_FEATURES, featureOfJob } from './shared/imageFeatures.js';

export type Media = 'image' | 'video' | 'audio' | '3d';
export const MEDIA: Media[] = ['image', 'video', 'audio'];
/** Output media of a tool: explicit `media`, else app kind (image/audio/soundtrack), else category, else video. */
export function mediaOf(t: ToolDef): Media {
  const m = (t as any).media as Media | undefined; if (m && (MEDIA.includes(m) || m === '3d')) return m; // 3D (2026-10-23): its own header tab, not a /browse section
  const k = (t.app as any)?.kind as string | undefined;
  if (k === 'image') return 'image';
  if (k === 'audio' || k === 'soundtrack') return 'audio';
  const c = (t.category || '').toLowerCase();
  return c === 'image' ? 'image' : c === 'audio' ? 'audio' : 'video';
}
/**
 * Navigation badges: roughly three tools at once; one badge per tool, precedence TOP > NEW > FREE:
 *  - TOP: the single tool with the most jobs; Object Swap when there are no jobs yet.
 *  - NEW: `addedAt` within the last NEW_DAYS (expires on its own). Model-card "new" tags do NOT bubble up.
 *  - FREE: a provider with priceFactor 0 only (free-gen coverage is the separate `freeGensCovered` boolean).
 *  Explicit `badge` on a tool def wins.
 */
export const NEW_DAYS = 7;
/** When each tool shipped (ISO date). A tool def may set `addedAt` itself; Object Swap (ex-"Video Swap") is the flagship. */
const ADDED_AT: Record<string, string> = { 'create-image': '2026-10-15', audio: '2026-10-01', 'h3-video': '2026-10-01', cinema: '2026-10-16', voice: '2026-10-16', 'object-swap': '2026-10-14' };
export const addedAtOf = (t: ToolDef): string | null => (t as any).addedAt ?? ADDED_AT[t.id] ?? null;
const isNew = (t: ToolDef, now = Date.now()) => { const a = addedAtOf(t); return !!a && now - Date.parse(a) < NEW_DAYS * 86400_000; };
export function topToolId(): string {
  const n = new Map<string, number>(); for (const j of jobs.values()) if (countsAsRun(j)) n.set(j.toolId, (n.get(j.toolId) ?? 0) + 1);
  let best = 'object-swap', max = 0; for (const [id, c] of n) if (c > max && getTool(id)) { best = id; max = c; }
  return best;
}
export type Badge = 'new' | 'free' | 'top' | null;
export function badgeOf(t: ToolDef, top = topToolId()): Badge {
  const b = (t as any).badge as Badge | undefined; if (b !== undefined) return b;
  if (t.id === top) return 'top';
  if (isNew(t)) return 'new';
  const zero = toolProviders(t).some((p) => (t.pricing?.providerFactors?.[p.id] ?? PROVIDER_FACTORS[p.id] ?? 1) === 0);
  if (zero) return 'free';
  return null;
}
/** Poster still per tool (first good frame of its sample result), cached as a JPEG under DATA_DIR/posters. */
/** DP #23: title cards whose art has the tool name baked in are not served as the panel poster (posterUrl null; /api/posters says why). */
const TEXT_BAKED = new Set(['app-anime-restyle']);
const textBaked = (t: ToolDef) => TEXT_BAKED.has(t.id) && !(t as any).posterUrl && posterSourceOf(t).kind === 'card';
/** Phase 1 quick-win apps (2026-10-21): until their own art is dropped at web/public/examples/tools/<id>.jpg, no poster URL (the title card needs ffmpeg
 *  drawtext, missing on some installs → 404); the web draws its branded stand-in (StandInArt) instead, as Photo FX does for its new effects.
 *  The same for every tool that would get a title card when this computer's ffmpeg can't draw text (2026-10-31: ~16 poster 404s on /video). */
const STAND_IN = POSTER_STAND_IN;
export const posterStandIn = (t: ToolDef) => (STAND_IN.has(t.id) || !ffmpegDrawsText()) && !(t as any).posterUrl && posterSourceOf(t).kind === 'card';
export const posterUrlOf = (t: ToolDef): string | null => (t as any).posterUrl ?? (textBaked(t) || posterStandIn(t) ? null : `/api/posters/${t.id}.jpg`);
export const toolExtras = (t: ToolDef, top = topToolId()) => ({ media: mediaOf(t), badge: badgeOf(t, top), addedAt: addedAtOf(t), freeGensCovered: !!t.freeGens, posterUrl: posterUrlOf(t), ...(posterStandIn(t) ? { posterStandIn: true } : {}) });

/** BH10 P1-5: discover covers are static art, never a mock output (no colour bars, noise or gradient test media).
 *  Order: interim AI still web/public/examples/tools/<id>.jpg → the tool's first preset poster (designed art in samples/presets)
 *  → on a real backend only, the latest real (non-demo, non-seed) result → a plain title card with the tool name. */
const POSTERS = path.join(DATA_DIR, 'posters', 'v3'); // v3: static art only (v2 frames came from mock results)
const fileOfUrl = (u?: string | null): string | null => {
  if (!u) return null; const rel = u.split('?')[0];
  if (rel.startsWith('/samples/presets/')) { const f = path.join(SAMPLES_DIR, rel.slice('/samples/'.length)); return existsSync(f) ? f : null; }
  if (rel.startsWith('/examples/')) return examplesFileOf(rel.slice('/examples/'.length));
  return null;
};
const outputFile = (u?: string | null): string | null => {
  if (!u || !u.startsWith('/files/')) return null; const f = path.join(DATA_DIR, decodeURIComponent(u.slice(7).split('?')[0]));
  return f.startsWith(DATA_DIR + path.sep) && existsSync(f) ? f : null;
};
export type PosterKind = 'interim' | 'preset' | 'result' | 'card';
export function posterSourceOf(t: ToolDef): { kind: PosterKind; file: string | null; key: string } {
  const interim = examplesFileOf(`tools/${t.id}.jpg`); if (interim) return { kind: 'interim', file: interim, key: 'interim' };
  // BUG-HUNT-10 PB re-check 2: only a preset poster made for THIS tool (file named <toolId>-…). Apps whose presets point at another tool's art
  // (Character Sheet / Product Shot / Inpaint / Relight → create-image-generate.jpg, the Create Image cover) never borrow it: one still on five tiles.
  for (const p of t.presets ?? []) { const f = fileOfUrl((p as any).posterUrl); if (f && /\.(jpe?g|png|webp)$/i.test(f) && ownPoster(t.id, f)) return { kind: 'preset', file: f, key: `preset-${path.basename(f)}` }; }
  if (config.backend !== 'mock') {
    const real = [...jobs.values()].filter((j) => j.toolId === t.id && j.status === 'done' && !(j as any).seed && !j.routing?.demo && outputFile(j.resultUrl))
      .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))[0];
    if (real) return { kind: 'result', file: outputFile(real.resultUrl), key: `result-${real.id}` };
  }
  return { kind: 'card', file: null, key: 'card-v2' }; // v2: name sized to fit (no clipped text)
}
const ownPoster = (toolId: string, file: string) => path.basename(file).startsWith(`${toolId}-`);
/** Tiles that still show the per-tool title card (no interim still, no own preset art, no real result): they need a real poster file at
 *  web/public/examples/tools/<id>.jpg (DP / Blender Studio). GET /api/posters lists every tool's poster source. */
export const posterInfo = (t: ToolDef) => { const s = posterSourceOf(t); return { toolId: t.id, name: t.name, media: mediaOf(t), kind: s.kind, file: s.file ? path.basename(s.file) : null, posterUrl: posterUrlOf(t), needsRealPoster: s.kind === 'card', ...(posterStandIn(t) ? { reason: 'stand-in art until a poster is dropped', standIn: true } : {}), ...(textBaked(t) ? { reason: 'text baked in' } : {}), dropAt: `web/public/examples/tools/${t.id}.jpg` }; };
export const posterStatus = () => listTools().map(posterInfo);
/** DP #21: per-option tiles (Orbit Shot orbit, Transitions transition, UGC Ad presenter, Relight direction): file to drop, live URLs, needsRealPoster. */
export const optionPosterStatus = () => APP_GALLERY.flatMap((a) => { const field = OPTION_MEDIA[a.id]; const f = field ? a.fields?.find((x) => x.name === field) : null;
  return (f?.options ?? []).map((o) => ({ toolId: `app-${a.id}`, field: field!, value: o.value, label: o.label, ...optionMedia(a.id, field!, o.value) })); });
/** DP #22: other art slots still showing placeholder or nothing, listed so Blender Studio / DP know what to drop (nothing is generated here):
 *  Object Swap preset cards (each preset's still; the current /samples/presets file is a placeholder until a real one is dropped),
 *  the H3 page's camera card hero, UGC Ad presenter stills (also in options[] as app-ugc-ad:presenter:*), and (DP #23) Product Shot scenes,
 *  an Image Upscale before/after pair and Motion Transfer result thumbnails; and the 23 Restyle style posters + hover loops (synthetic stand-ins today). */
export const artSlotStatus = () => {
  const slot = (toolId: string, slotId: string, label: string, rel: string, placeholderUrl: string | null) => { const real = examplesFileOf(rel);
    return { toolId, slot: slotId, label, posterUrl: real ? `/examples/${rel}` : placeholderUrl, placeholder: !real && !!placeholderUrl, needsRealPoster: !real, dropAt: `web/public/examples/${rel}` }; };
  const os = getTool('object-swap'); const ugc = APP_GALLERY.find((a) => a.id === 'ugc-ad'); const pres = ugc?.fields?.find((f) => f.name === 'presenter');
  return [
    ...(os?.presets ?? []).map((p: any) => slot('object-swap', `preset:${p.id}`, `Object Swap · ${p.label ?? p.id}`, `presets/object-swap-${p.id}.jpg`, p.posterUrl ?? null)),
    slot('h3-video', 'card:camera-hero', 'MiniMax H3 · camera card hero', 'cards/h3-camera-hero.jpg', null),
    ...(pres?.options ?? []).map((o) => slot('app-ugc-ad', `presenter:${o.value}`, `UGC Ad presenter · ${o.label}`, `options/ugc-ad/presenter-${o.value}.jpg`, null)),
    // DP #23 (Creative Studio): Product Shot scene tiles, an Image Upscale before/after pair, Motion Transfer result thumbnails (one per preset)
    ...(APP_GALLERY.find((a) => a.id === 'product-shot')?.fields?.find((f) => f.name === 'scene')?.options ?? []).map((o) => slot('app-product-shot', `scene:${o.value}`, `Product Shot scene · ${o.label}`, `options/product-shot/scene-${o.value}.jpg`, null)),
    slot('image-upscale', 'compare:before', 'Upscale (image) · before (low-res source)', 'upscale/image-upscale-before.jpg', null),
    slot('image-upscale', 'compare:after', 'Upscale (image) · after (same frame, upscaled)', 'upscale/image-upscale-after.jpg', null),
    ...(getTool('motion-transfer')?.presets ?? []).map((p: any) => slot('motion-transfer', `result:${p.id}`, `Motion Transfer result · ${p.label ?? p.id}`, `results/motion-transfer-${p.id}.jpg`, null)),
    // Photo FX effects without a still yet (added 2026-10-21): the web shows the branded stand-in tile until a still is dropped here
    ...(getTool('photo-fx')?.presets ?? []).filter((p: any) => p.standIn).map((p: any) => ({ ...slot('photo-fx', `preset:${p.id}`, `Photo FX · ${p.label ?? p.id}`, `presets/photo-fx-${p.id}.jpg`, null), standIn: true })),
    // Restyle style tiles (23): today's poster and hover loop are synthetic stand-ins (procedural /samples/presets art, or an interim AI still), so every style
    // needs a real still (presets/restyle-<id>.jpg) and a real loop (presets/restyle-<id>.mp4) of that style. needsRealPoster covers both.
    // Restyle styles: loopUrl / standIn / needsRealLoop live on the preset objects (interimTiles.wireRestyleStyleMedia); posters slots read them.
    ...(getTool('restyle')?.presets ?? []).map((p: any) => { const base = slot('restyle', `style:${p.id}`, `Restyle style · ${p.label ?? p.id}`, `presets/restyle-${p.id}.jpg`, p.posterUrl ?? null);
      return { ...base, standIn: p.standIn, loopUrl: p.loopUrl, loopPlaceholder: p.loopPlaceholder, needsRealLoop: p.needsRealLoop, loopDropAt: `web/public/examples/presets/restyle-${p.id}.mp4`, needsRealPoster: !!p.standIn }; }),
  ];
};
const FONT = ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf'].find((f) => existsSync(f));
async function poster(toolId: string) {
  const t = getTool(toolId); if (!t) return null;
  mkdirSync(POSTERS, { recursive: true });
  const src = posterSourceOf(t); const out = path.join(POSTERS, `${toolId}--${src.key.replace(/[^\w.-]/g, '_')}.jpg`);
  if (existsSync(out)) return out;
  let code: number;
  if (src.file) code = /\.(mp4|webm|mov)$/i.test(src.file) ? await posterFrame(src.file, out) : await runFfmpeg(['-y', '-v', 'error', '-i', src.file, '-vf', 'scale=640:-2', '-frames:v', '1', out]);
  else { // plain title card: flat dark background + the tool name (static art, no pattern)
    const name = t.name.replace(/[\\':%]/g, ' '); const size = Math.max(20, Math.min(40, Math.floor(560 / (0.62 * Math.max(1, name.length))))); // fits 640 px with margins
    code = await runFfmpeg(['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x15161a:s=640x360', '-vf',
      `drawtext=${FONT ? `fontfile=${FONT}:` : ''}text='${name}':fontcolor=0xe8e8ea:fontsize=${size}:x=(w-text_w)/2:y=(h-text_h)/2`, '-frames:v', '1', out]);
  }
  return code === 0 ? out : null;
}

const priceRes10s = (t: ToolDef, res: string, provider?: string, durationSec = 10) => priceOf({ toolId: t.id, rates: t.gpuSecPerSec, quality: res, durationSec, provider,
  providerFactor: provider ? t.pricing?.providerFactors?.[provider] : undefined, optionFactors: t.pricing?.optionFactors });
const priceFor10s = (t: ToolDef, res: string, provider?: string) => priceRes10s(t, res, provider).credits;
/** dp30 (c): a priced example, or null when the provider has no verified price (basis unavailable). */
const exampleOf = (t: ToolDef, res: string, provider: string, durationSec: number) => { const p = priceRes10s(t, res, provider, durationSec); return p.basis === 'hosted' ? p.credits : null; }; // no hosted row or no verified price → null

/** PRICING OVERRIDE (2026-10-16): hosted price table + rate + explanation. */
export const hostedPricing = () => ({
  rate: { usdPerCredit: USD_PER_CREDIT, creditsPerUsd: 1 / USD_PER_CREDIT, markup: 0, comfyCreditsPerUsd: COMFY_CREDITS_PER_USD, comfyRateSource: 'https://support.comfy.org/articles/1982697177-partner-nodes-pricing' },
  openWeights: { credits: 0, note: 'Open models on your computer are always free.' },
  explanation: 'Hosted models are charged exactly what the provider publishes (per second, per minute, per image, per run or per 1K characters), shown in dollars with no markup. Comfy partner-node prices are published in Comfy credits (211 = $1) and converted to dollars; hover a price to see the credits. Rows marked estimated have no exact published figure for how we call them; the note says why. Models without a verified price show no price and can\'t run on that route until one is published. You pay providers directly on your own accounts, under their own terms (some don\'t charge for failed runs); in team mode what a failed run held goes back to the team balance.',
  checkedAt: '2026-10-16',
  hosted: [...HOSTED_PRICES, ...PRICING_TABLE_EXTRA].map((h) => {
    const u = unitInfo(h.unit);
    // exampleLabel = plain quantity for the Pricing table (never the raw unit: "1 megapixel-second", not "1 mp_second")
    const exampleN = h.unit === 'second' ? 5 : 1;
    const credits = h.usd == null ? null : Math.round((h.usd / USD_PER_CREDIT) * 1000) / 1000;
    // dp30 (c): exampleCredits on every row (number | null): the base price, else the cheapest quality price, else null (no verified price)
    const qMin = h.usdByQuality ? Math.min(...Object.values(h.usdByQuality).filter((x): x is number => typeof x === 'number')) : NaN; const exBase = credits ?? (Number.isFinite(qMin) ? Math.round((qMin / USD_PER_CREDIT) * 1000) / 1000 : null);
    return { ...h, unitLabel: u.unitLabel, unitHelp: u.unitHelp, exampleLabel: h.unit === 'second' ? '5 s clip' : unitQty(h.unit, exampleN),
      exampleQuantity: exampleN, exampleCredits: exBase == null ? null : Math.round(exBase * exampleN * 1000) / 1000,
      name: getProvider(h.providerId)?.name ?? h.model.replace(/\s*\((fal|replicate)\)$/i, ''), credits,
      // Provider audit (2026-10-21): the same model with sound on (Veo, Kling) as its own credits, so the table shows both prices; lifecycle = retiring pill
      ...(h.audio ? { audioCredits: Math.round((h.audio.usd / USD_PER_CREDIT) * 1000) / 1000, audioExampleCredits: Math.round((h.audio.usd / USD_PER_CREDIT) * exampleN * 1000) / 1000 } : {}),
      ...lifecycleFields(h.providerId),
      creditsByQuality: h.usdByQuality ? Object.fromEntries(Object.entries(h.usdByQuality).map(([q, u2]) => [q, Math.round((u2 / USD_PER_CREDIT) * 1000) / 1000])) : null, available: h.usd != null };
  }),
});
export function registerDiscover(app: FastifyInstance) {
  /** Image / Video / Audio route data: `/api/browse` = all three groups; `/api/browse/:media` = one. */
  const row = (t: ToolDef) => ({ id: t.id, name: t.name, route: t.route, description: t.description, category: t.category, ...toolExtras(t), previewUrl: t.previewUrl ?? null });
  /** Image: the approved feature list in menu order (plain names; Camera & Lens is Create Image with a rig; Edit Image lives inside Create Image). Others: the registry order. Unlisted tools never show. */
  const group = (m: Media) => m === 'image'
    ? MENU_FEATURES.flatMap((f) => { const t = getTool(f.toolId); return t ? [{ ...row(t), ...(f.toolId !== t.id || f.route !== t.route ? { id: f.id } : {}), featureId: f.id, name: f.name, route: f.route, description: f.description }] : []; })
    : listTools().filter((t) => mediaOf(t) === m && t.listed !== false).map(row);
  app.get('/api/capabilities', async () => { const { capabilitiesPayload } = await import('./capabilities.js'); return capabilitiesPayload(); });
  app.get('/api/browse', async () => Object.fromEntries(MEDIA.map((m) => [m, { route: `/${m}`, tools: group(m) }])));
  app.get<{ Params: { media: string } }>('/api/browse/:media', async (req, reply) => MEDIA.includes(req.params.media as Media) ? { media: req.params.media, route: `/${req.params.media}`, tools: group(req.params.media as Media) } : reply.code(404).send({ error: 'media must be image, video or audio' }));

  app.get('/api/posters', async () => { const items = posterStatus(); const options = optionPosterStatus(); const slots = artSlotStatus();
    return { items, needsRealPoster: items.filter((x) => x.needsRealPoster).map((x) => x.toolId), options, optionsNeedingPoster: options.filter((x) => x.needsRealPoster).map((x) => `${x.toolId}:${x.field}:${x.value}`),
      slots, slotsNeedingPoster: slots.filter((x) => x.needsRealPoster).map((x) => `${x.toolId}:${x.slot}`) }; });
  app.get<{ Params: { file: string } }>('/api/posters/:file', async (req, reply) => {
    const id = req.params.file.replace(/\.jpg$/, ''); if (!getTool(id)) return reply.code(404).send({ error: 'unknown tool' });
    const p = await poster(id); if (!p) return reply.code(404).send({ error: 'no poster' });
    return reply.header('cache-control', 'public, max-age=3600').sendFile(path.relative(DATA_DIR, p));
  });

  /** /pricing page data: unit, topUps (credit packs; plans is deprecated and always []), pricingModel, free runs, per-tool 10 s price per quality and per provider. */
  const PRICING_MODEL = 'Pay per run at provider cost; local and open-weights runs are free; credits never expire.';
  const usd2 = (n: number) => `$${n.toFixed(2)}`; const n0 = (n: number) => n.toLocaleString('en-US');
  const devGrant = () => config.backend === 'mock' || /^(1|true)$/i.test(process.env.OPENHIGGSFIELD_DEV_GRANT ?? '');
  /** dp30 (a): credit top-up packs. No payment integration → priceUsd null, priceLine 'Local demo, no payment'; valueUsd = what the credits buy at 1 credit = $0.01. */
  const topUps = () => TOPUP_PACKS.map((c) => ({ id: `topup-${c}`, credits: c, label: `${n0(c)} credits`, priceUsd: null as number | null, priceLine: 'Local demo, no payment',
    valueUsd: Math.round(c * USD_PER_CREDIT * 100) / 100, valueLine: `${usd2(c * USD_PER_CREDIT)} of runs at 1 credit = $0.01`, available: devGrant(), grant: { method: 'POST', endpoint: '/api/ledger/grant', body: { amount: c, source: 'topup' } } }));
  /** dp30 (b): one row per free-gens tool: what a free run would otherwise cost on the tool's default model (5 s clip at the free-gens resolution). */
  const exSecs = 5;
  /** bh12 (2): the example price IS the quote: GET /api/tools/:id/price?provider=&duration=&resolution= (its credits, or listCredits on a sample run / missing key).
   *  One quote per hosted row, cached until keys or routing settings change (60 s at most). null when the quote has no price (not wired, coming soon). */
  let exCache: { sig: string; at: number; m: Map<string, number | null> } | null = null;
  const exSig = async () => { const S = await import('./routing/settings.js'); const P = await import('./routing/prefs.js');
    return JSON.stringify([S.providerSettings().map((x: any) => [x.id, x.configured, x.keySource ?? null]), P.getPrefs().global, config.backend]); };
  const quotedExamples = async (want: [string, string, number, string][]) => { const sig = await exSig();
    if (!exCache || exCache.sig !== sig || Date.now() - exCache.at > 60_000) exCache = { sig, at: Date.now(), m: new Map() };
    for (const [toolId, pid, secs, res] of want) { const k = `${toolId}|${pid}|${secs}|${res}`; if (exCache.m.has(k)) continue;
      const r = await app.inject({ method: 'GET', url: `/api/tools/${encodeURIComponent(toolId)}/price?provider=${encodeURIComponent(pid)}&duration=${secs}&resolution=${encodeURIComponent(res)}` });
      let c: number | null = null; try { const q = r.json() as any; if (r.statusCode === 200) { const v = q.demo || q.needsKey ? q.listCredits ?? q.credits : q.credits ?? q.listCredits; c = typeof v === 'number' && Number.isFinite(v) ? v : null; } } catch { c = null; }
      exCache.m.set(k, c); }
    return (toolId: string, pid: string, secs: number, res: string) => exCache!.m.get(`${toolId}|${pid}|${secs}|${res}`) ?? null; };
  const resOf = (t: ToolDef, pref = '720p') => (t.gpuSecPerSec[pref] ? pref : Object.keys(t.gpuSecPerSec)[0]);
  const freeGenRows = async () => { const D = await import('./routing/defaults.js'); const ft = listTools().filter((t) => t.freeGens).map((t) => ({ t, pid: D.defaultProviderFor(t) ?? null }));
    const qx = await quotedExamples(ft.filter((x) => x.pid && getProvider(x.pid)?.kind !== 'open-weights').map((x) => [x.t.id, x.pid!, exSecs, resOf(x.t, FREE_GENS_MAX_RES)]));
    return ft.map(({ t, pid }) => { const p = pid ? getProvider(pid) : null; const res = resOf(t, FREE_GENS_MAX_RES);
      const c = p && p.kind !== 'open-weights' ? qx(t.id, pid!, exSecs, res) ?? exampleOf(t, res, pid!, exSecs) : null;
      return { toolId: t.id, toolName: t.name, media: mediaOf(t), maxRes: FREE_GENS_MAX_RES, providerId: pid, providerName: p?.name ?? null, exampleQuantity: exSecs, exampleLabel: `${exSecs} s clip at ${res}`, exampleCredits: c != null && c > 0 ? c : null, freeCredits: 0 }; }); };
  const TOPUPS_NOTE = 'Credits never expire. There is no payment on this local install: a pack is added as a top-up grant (mock/dev servers only).';
  app.get('/api/topups', async () => { const t = topUps(); return { topUps: t, items: t, total: t.length, topUpsNote: TOPUPS_NOTE }; }); // dp30 (i): same array as /api/pricing topUps
  app.get('/api/pricing', async () => { const hostedRows: [string, string, number, string][] = listTools().flatMap((t) => toolProviders(t).filter((p) => p.kind !== 'open-weights').map((p) => [t.id, p.id, 10, resOf(t)] as [string, string, number, string]));
    const qx = await quotedExamples(hostedRows); return {
    ...((h) => openWeightsOnly() ? { ...h, hosted: h.hosted.filter((r: any) => { const p = getProvider(r.providerId); return !!p && allowed(p); }) } : h)(hostedPricing() as any), // Open models only: no closed rows
    unit: 'credit (1 credit = $0.01; open weights 0)', minPrice: MIN_PRICE, draftFactor: DRAFT_FACTOR, providerFactors: PROVIDER_FACTORS,
    freeGens: { start: FREE_GENS_START, left: freeGensLeft(), maxRes: FREE_GENS_MAX_RES, rows: await freeGenRows() },
    topUps: topUps(), topUpsNote: TOPUPS_NOTE,
    /** @deprecated No subscriptions: always []; use topUps. */
    plans: [], plansNote: 'No monthly plans: buy credit top-ups instead (topUps). plans is deprecated and always empty.',
    pricingModel: PRICING_MODEL,
    tools: listTools().map((t) => ({ id: t.id, toolId: t.id, name: t.name, toolName: t.name, media: mediaOf(t), freeGens: !!t.freeGens, rates: t.gpuSecPerSec,
      per10s: Object.fromEntries(Object.keys(t.gpuSecPerSec).map((r) => [r, priceFor10s(t, r)])),
      providers: toolProviders(t).map((p) => { const res = resOf(t); const ow = p.kind === 'open-weights'; const ex = ow ? 0 : qx(t.id, p.id, 10, res) ?? exampleOf(t, res, p.id, 10); // bh12 (2): = the quote
        return { id: p.id, name: p.name, kind: p.kind, per10s720p: ow ? priceFor10s(t, res, p.id) : ex ?? priceFor10s(t, res, p.id), exampleQuantity: 10, exampleLabel: `10 s at ${res}`, exampleCredits: ex }; }) })),
  }; });

  /** Global search: tools, presets, models, examples and your assets (prompt, tool, id). `?q=&types=tool,preset,model,example,asset&limit=` */
  app.get<{ Querystring: { q?: string; types?: string; limit?: string } }>('/api/search', async (req) => {
    const q = (req.query.q || '').trim().toLowerCase(); const lim = Math.min(100, Number(req.query.limit) || 30);
    const want = new Set((req.query.types || 'tool,preset,model,example,asset').split(','));
    if (!q) return { q, results: [] };
    const hit = (...xs: (string | undefined | null)[]) => xs.some((x) => x && x.toLowerCase().includes(q));
    const out: { type: string; id: string; title: string; subtitle: string; route: string; media?: Media; score: number }[] = [];
    const sc = (title: string) => (title.toLowerCase().startsWith(q) ? 3 : title.toLowerCase().includes(q) ? 2 : 1);
    if (want.has('tool')) for (const f of MENU_FEATURES) if (f.route !== getTool(f.toolId)?.route && hit(f.name, f.description)) out.push({ type: 'tool', id: f.id, title: f.name, subtitle: f.description, route: f.route, media: 'image', score: sc(f.name) + 1 }); // Camera & Lens (a page of Create Image)
    for (const t of listTools()) {
      if (t.listed === false) continue;
      if (want.has('tool') && hit(t.name, t.description, t.category, t.id) && !MENU_FEATURES.some((f) => f.toolId === t.id && f.name === t.name && f.route !== t.route) /* the menu entry above already lists it (old page redirects there) */) out.push({ type: 'tool', id: t.id, title: t.name, subtitle: t.description ?? '', route: t.route ?? `/tools/${t.id}`, media: mediaOf(t), score: sc(t.name) + 1 });
      if (want.has('preset')) for (const p of t.presets ?? []) if (hit(p.label, p.prompt, p.group)) out.push({ type: 'preset', id: `${t.id}:${p.id}`, title: p.label, subtitle: t.name, route: `${t.route}?preset=${p.id}`, media: mediaOf(t), score: sc(p.label) });
      if (want.has('model')) for (const m of modelsFor(t)) if (hit(m.name, m.providerName, m.hint)) out.push({ type: 'model', id: `${t.id}:${m.id}`, title: m.name, subtitle: `${t.name} · ${m.license.name}`, route: `${t.route}?model=${m.id}`, media: mediaOf(t), score: sc(m.name) });
    }
    if (want.has('example')) for (const e of EXAMPLES as any[]) { const t = getTool(e.toolId); if (t && hit(e.title, e.prompt, e.description)) out.push({ type: 'example', id: e.id, title: e.title ?? e.id, subtitle: t.name, route: `${t.route}?example=${e.id}`, media: mediaOf(t), score: sc(e.title ?? '') }); }
    if (want.has('asset')) for (const j of history()) { if (lib.metaOf(j.id).deletedAt) continue; const t = getTool(j.toolId); if (hit(j.input.prompt, j.input.preset, j.id, t?.name)) out.push({ type: 'asset', id: j.id, title: (j.input.prompt || t?.name || j.id).slice(0, 80), subtitle: `${t?.name ?? j.toolId} · ${j.status} · ${new Date(j.createdAt).toISOString().slice(0, 10)}`, route: `/jobs/${j.id}`, media: t ? mediaOf(t) : undefined, score: sc(j.input.prompt || '') }); }
    return { q, results: out.sort((a, b) => b.score - a.score).slice(0, lim) };
  });

  /**
   * Community feed (mock, local): our examples + shared results. trending = recreates/likes-ish score with time decay
   * (mock counts are stable per id); new = newest first. `?sort=trending|new&media=&limit=`
   */
  app.get<{ Querystring: { sort?: string; media?: string; limit?: string; source?: string } }>('/api/community', async (req) => {
    reseedIfDue();
    const now = Date.now(); const sort = req.query.sort === 'new' ? 'new' : 'trending';
    const items: any[] = [];
    (EXAMPLES as any[]).forEach((e, i) => { const t = getTool(e.toolId); if (!t) return;
      items.push({ id: `ex:${e.id}`, kind: 'example', toolId: t.id, toolName: t.name, media: mediaOf(t), title: e.title ?? e.id, previewUrl: e.previewUrl ?? null, posterUrl: e.posterUrl ?? posterUrlOf(t), route: `${t.route}?example=${e.id}`,
        aiGenerated: false, sampleCredit: sampleFor(e.previewUrl)?.label ?? sampleFor(e.posterUrl)?.label ?? null, author: 'Imagination Is All You Need', createdAt: now - (i + 1) * 86400_000 * 2, recreates: 0, likes: 0 }); }); // round 1: no made-up counts
    for (const j of jobs.values()) { const m = lib.metaOf(j.id); if (!(m.shareToken || m.published) || m.deletedAt || j.status !== 'done') continue; if (req.query.source === 'published' && !m.published) continue; const t = getTool(j.toolId); const isSample = j.toolId === SAMPLE_TOOL_ID; const smp = isSample ? sampleFor(j.resultUrl) : null; if (!t && !isSample) continue; const img = isSample && !/\.(mp4|webm|mov)$/i.test(String(j.resultUrl));
      items.push({ id: `job:${j.id}`, kind: isSample ? 'sample' : 'shared', toolId: isSample ? null : t!.id, toolName: isSample ? null : featureOfJob(j as any)?.label ?? t!.name /* images: 'Relight · Nano Banana 2' */, media: isSample ? (img ? 'image' : 'video') : mediaOf(t!), title: (m.title || (m.published && !m.published.showPrompt ? t!.name : (j.input.prompt || t!.name))).slice(0, 80), previewUrl: j.resultUrl, posterUrl: isSample ? (img ? j.resultUrl : String(j.resultUrl).replace(/\.mp4$/, '.jpg')) : posterUrlOf(t!), route: m.shareToken ? `/s/${m.shareToken}` : `/jobs/${j.id}`, /* DP: the job page (there is no /community/:id page) */ published: !!m.published,
        aiGenerated: m.aiGenerated ?? true, sampleCredit: m.sampleCredit ?? smp?.label ?? null, author: m.author || 'you', createdAt: j.createdAt, recreates: 0, likes: lib.likesOf(j.id) }); }
    const score = (x: any) => (1 + x.recreates + 2 * x.likes) / Math.pow((now - x.createdAt) / 3600_000 + 2, 0.8);
    const media = req.query.media; const f0 = req.query.source === 'published' ? items.filter((x) => x.published) : items; const f = media ? f0.filter((x) => x.media === media) : f0;
    f.sort((a, b) => (sort === 'new' ? b.createdAt - a.createdAt : score(b) - score(a)));
    return { sort, items: f.slice(0, Number(req.query.limit) || 40).map((x) => ({ ...x, score: Math.round(score(x) * 100) / 100 })) };
  });

  /** Server-side GIF (palettegen/paletteuse). `?w=480&fps=12&i=<output index>&full=1` (default first 6 s; full=1 = whole clip, capped 30 s). */
  app.get<{ Params: { id: string }; Querystring: { w?: string; fps?: string; i?: string; full?: string } }>('/api/jobs/:id/output.gif', async (req, reply) => {
    const j = jobs.get(req.params.id); if (!j) return reply.code(404).send({ error: 'not found' });
    const o = j.outputs[Number(req.query.i) || 0]; if (!o || !/\.(mp4|webm|mov)$/i.test(o.url)) return reply.code(409).send({ error: 'No video output to convert.', errorType: 'validation' });
    const w = Math.min(1280, Math.max(120, Number(req.query.w) || 480)); const fps = Math.min(30, Math.max(4, Number(req.query.fps) || 12)); const full = /^(1|true)$/i.test(req.query.full || '');
    const src = path.join(DATA_DIR, o.url.replace(/^\/files\//, '')); const name = `${j.id}-${Number(req.query.i) || 0}-${w}-${fps}${full ? '-full' : ''}.gif`; const out = path.join(DATA_DIR, name);
    if (!existsSync(out)) {
      const code = await runFfmpeg(['-y', ...(full ? ['-t', '30'] : ['-t', '6']), '-i', src, '-filter_complex', `fps=${fps},scale=${w}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a`, '-loop', '0', out]);
      if (code !== 0) return reply.code(500).send({ error: 'GIF export failed.', errorType: 'temporary' });
    }
    return reply.header('content-disposition', `attachment; filename="${appFileName(j.id, 'gif')}"`).type('image/gif').sendFile(name);
  });
}
