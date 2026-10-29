/**
 * Brand kits (2026-10-27, shared/brandKit.ts has the model, the prompt phrase and the exports). Stored in the SQLite kv table ('brandKits')
 * inside DATA_DIR, so the library export / import carries them and media hygiene (mediaGc liveRefs reads kv) keeps their logo and example files.
 * The app's own kit (BUILTIN_KIT) is always first and read-only; duplicate it to change it.
 *   GET    /api/brand-kits                      → { items: BrandKit[], activeId, fonts, roles, limits }
 *   GET    /api/brand-kits/:id                  → BrandKit (+ phrases: { image, video, audio })
 *   POST   /api/brand-kits                      {name, colors?, fonts?, mood?, dos?, donts?, examples?, from?: kitId (duplicate)} → 201 BrandKit
 *   PATCH  /api/brand-kits/:id                  any of the same fields → BrandKit
 *   DELETE /api/brand-kits/:id                  → { ok, id, activeId }   (the built-in kit can't be deleted; deleting the active kit makes the built-in one active)
 *   PUT    /api/brand-kits/active               {id} → { activeId }
 *   POST   /api/brand-kits/:id/logo             multipart file (PNG, JPG, WEBP, GIF or SVG, ≤ 20 MB) → BrandKit
 *   POST   /api/brand-kits/:id/examples         multipart file (an image) → BrandKit (up to 3)
 *   GET    /api/brand-kits/:id/tokens.json      the W3C Design Tokens file (download)
 *   GET    /api/brand-kits/:id/export?format=css|tailwind|hex   plain text
 *   GET    /api/brand-kits/:id/prompt?media=image|video|audio&prompt=…   → { phrase, prompt } (what "Brand: <name>" adds; nothing runs)
 *   POST   /api/brand-kits/from-words           {words} → { colors } (a free, rules-based palette; no model)
 * Jobs: a submit (and the prompt peek) with brandKit=<id> gets the kit's phrase added to the typed prompt by applyBrandToFields (one helper for every tool).
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { createWriteStream, existsSync, readFileSync, rmSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { getKv, setKv } from './db.js';
import { DATA_DIR } from './config.js';
import * as BK from './shared/brandKit.js';
import type { BrandKit } from './shared/brandKit.js';

const KEY = 'brandKits'; const ACTIVE = 'brandKitActive';
const LOGO_MAX = 20 * 1024 * 1024;
const own = (): BrandKit[] => getKv<BrandKit[]>(KEY, []);
const save = (xs: BrandKit[]) => setKv(KEY, xs);
/** Every kit, the app's own first. */
export const listBrandKits = (): BrandKit[] => [BK.BUILTIN_KIT, ...own()];
export const getBrandKit = (id: string): BrandKit | undefined => listBrandKits().find((k) => k.id === id);
export const activeBrandKitId = (): string => { const a = getKv<string>(ACTIVE, BK.BUILTIN_KIT_ID); return getBrandKit(a) ? a : BK.BUILTIN_KIT_ID; };
const bad = (reply: FastifyReply, issues: BK.BrandIssue[], status = 400) => reply.code(status).send({ error: issues[0].message, errorType: 'validation', code: issues[0].code, issues });
const notFound = (reply: FastifyReply) => reply.code(404).send({ error: 'Brand kit not found.', errorType: 'not_found', code: 'not_found' });
const readOnly = (reply: FastifyReply) => bad(reply, [{ code: 'read_only', field: 'id', message: 'The Imagination kit is built in. Duplicate it to make your own version.' }]);
const ID_RE = /^[\w-]{1,64}$/;
const withPhrases = (k: BrandKit) => ({ ...k, phrases: { image: BK.brandPhrase(k, 'image'), video: BK.brandPhrase(k, 'video'), audio: BK.brandPhrase(k, 'audio') } });

/** What "Brand: <name>" does to a job form (submit and prompt peek share it). `fields.brandKit` = a kit id. The phrase goes after the typed prompt
 *  only for brand tools (shared/brandKit brandMediaFor) with a typed prompt; the model, route and price never change.
 *  → null (no brand asked), {error} (unknown kit), or the record kept on the job: {id, name, media, phrase} (phrase "" = nothing was added). */
export function applyBrandToFields(toolId: string, fields: Record<string, string>): { error: string; issue: BK.BrandIssue } | { id: string; name: string; media: BK.BrandMediaKind; phrase: string; applied: boolean } | null {
  const id = String(fields.brandKit ?? '').trim(); if (!id) return null;
  const kit = ID_RE.test(id) ? getBrandKit(id) : undefined;
  if (!kit) { const message = 'That brand kit no longer exists. Turn Brand off or pick another kit.'; return { error: message, issue: { code: 'brand_kit_not_found', field: 'brandKit', message } }; }
  let mode: string | null = fields.mode || null; if (!mode && fields.types) { try { const t = JSON.parse(fields.types); mode = Array.isArray(t) ? String(t[0] ?? '') || null : String(t); } catch { mode = String(fields.types); } }
  const media = BK.brandMediaFor(toolId, mode); if (!media) return { id: kit.id, name: kit.name, media: 'image', phrase: '', applied: false };
  const phrase = BK.brandPhrase(kit, media); const typed = String(fields.prompt ?? '').trim();
  if (!phrase || !typed) return { id: kit.id, name: kit.name, media, phrase, applied: false };
  fields.prompt = BK.withBrand(typed, phrase); return { id: kit.id, name: kit.name, media, phrase, applied: true };
}

/** A multipart image → a DATA_DIR file named brand-<kit>-<slot>-<rand>.<ext>. SVGs are kept as uploaded but refused if they carry script. */
async function saveUpload(req: any, reply: FastifyReply, kitId: string, slot: 'logo' | 'ex', allowSvg: boolean): Promise<BK.BrandMedia | null> {
  if (!req.isMultipart()) { bad(reply, [{ code: 'required', field: 'file', message: 'Send the image as multipart form data (field "file").' }]); return null; }
  let out: BK.BrandMedia | null = null;
  for await (const part of req.parts()) {
    if (part.type !== 'file') continue; if (out) { part.file.resume(); continue; }
    const ext = (path.extname(part.filename || '').toLowerCase() || ({ 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg' } as Record<string, string>)[part.mimetype] || '');
    const ok = /^\.(png|jpe?g|webp|gif)$/.test(ext) || (allowSvg && ext === '.svg');
    if (!ok) { part.file.resume(); bad(reply, [{ code: 'invalid_type', field: 'file', message: allowSvg ? 'Logos can be PNG, JPG, WEBP, GIF or SVG.' : 'Examples can be PNG, JPG, WEBP or GIF.' }]); return null; }
    const name = `brand-${kitId}-${slot}-${randomUUID().slice(0, 8)}${ext === '.jpeg' ? '.jpg' : ext}`; const abs = path.join(DATA_DIR, name);
    await pipeline(part.file, createWriteStream(abs));
    const size = (() => { try { return readFileSync(abs).length; } catch { return 0; } })();
    if ((part.file as any).truncated || size > LOGO_MAX) { rmSync(abs, { force: true }); bad(reply, [{ code: 'file_too_large', field: 'file', message: 'That file is over 20 MB.' }]); return null; }
    if (!size) { rmSync(abs, { force: true }); bad(reply, [{ code: 'empty', field: 'file', message: 'That file is empty.' }]); return null; }
    if (ext === '.svg') { const txt = readFileSync(abs, 'utf8'); if (!/<svg[\s>]/i.test(txt) || /<script|\son\w+\s*=|javascript:|<foreignObject/i.test(txt)) { rmSync(abs, { force: true }); bad(reply, [{ code: 'invalid_svg', field: 'file', message: 'That SVG has scripts or isn’t an SVG. Export it as a plain SVG or a PNG.' }]); return null; } }
    out = { url: `/files/${name}`, mime: ext === '.svg' ? 'image/svg+xml' : ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/jpeg' };
  }
  if (!out) bad(reply, [{ code: 'required', field: 'file', message: 'Add an image file.' }]);
  return out;
}
/** Remove a kit's own file once no kit uses it (a duplicate shares its source's logo). Call after saving. */
const dropFile = (url: string | undefined | null) => { if (!url?.startsWith('/files/brand-') || own().some((k) => k.logo?.url === url || k.examples.includes(url))) return; const abs = path.join(DATA_DIR, url.slice('/files/'.length)); if (abs.startsWith(DATA_DIR + path.sep) && existsSync(abs)) rmSync(abs, { force: true }); };

export function registerBrandKits(app: FastifyInstance) {
  app.get('/api/brand-kits', async () => ({ items: listBrandKits(), activeId: activeBrandKitId(), fonts: BK.BRAND_FONTS, roles: BK.BRAND_ROLES, limits: BK.BRAND_LIMITS }));
  app.post<{ Body: { words?: string } }>('/api/brand-kits/from-words', async (req, reply) => {
    const w = String(req.body?.words ?? '').trim(); if (!w) return bad(reply, [{ code: 'required', field: 'words', message: 'Type a few mood words, e.g. “warm, playful, premium”.' }]);
    if (w.length > BK.BRAND_LIMITS.mood) return bad(reply, [{ code: 'too_long', field: 'words', message: `Up to ${BK.BRAND_LIMITS.mood} characters.` }]);
    return { colors: BK.paletteFromWords(w), mood: BK.moodWords(w) };
  });
  app.put<{ Body: { id?: string } }>('/api/brand-kits/active', async (req, reply) => {
    const id = String(req.body?.id ?? ''); if (!getBrandKit(id)) return notFound(reply); setKv(ACTIVE, id); return { activeId: id };
  });
  app.get<{ Params: { id: string } }>('/api/brand-kits/:id', async (req, reply) => { const k = getBrandKit(req.params.id); return k ? withPhrases(k) : notFound(reply); });
  app.post<{ Body: Record<string, unknown> }>('/api/brand-kits', async (req, reply) => {
    const b = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const src = typeof b.from === 'string' ? getBrandKit(b.from) : undefined; if (b.from != null && !src) return notFound(reply);
    const base: Record<string, unknown> = src ? { name: `${src.name} copy`.slice(0, BK.BRAND_LIMITS.name), colors: src.colors, fonts: src.fonts, mood: src.mood, dos: src.dos, donts: src.donts, examples: src.examples } : {};
    const v = BK.validateKitInput({ ...base, ...Object.fromEntries(Object.entries(b).filter(([k]) => k !== 'from')) }, false); if (!v.ok) return bad(reply, v.issues);
    const all = own(); if (all.length >= BK.BRAND_LIMITS.kits) return bad(reply, [{ code: 'too_many', field: 'name', message: `You can keep up to ${BK.BRAND_LIMITS.kits} kits. Delete one first.` }]);
    if (listBrandKits().some((k) => k.name.toLowerCase() === v.value.name!.toLowerCase())) return reply.code(409).send({ error: `You already have a kit called "${v.value.name}".`, errorType: 'conflict', code: 'duplicate', issues: [{ code: 'duplicate', field: 'name', message: `You already have a kit called "${v.value.name}".` }] });
    const now = new Date().toISOString();
    const kit: BrandKit = { id: `bk_${randomUUID().slice(0, 8)}`, name: v.value.name!, colors: v.value.colors ?? [], fonts: v.value.fonts ?? { heading: '', body: '' }, mood: v.value.mood ?? '', dos: v.value.dos ?? [], donts: v.value.donts ?? [],
      logo: src?.logo ?? null, examples: v.value.examples ?? [], createdAt: now, updatedAt: now };
    save([...all, kit]); return reply.code(201).send(withPhrases(kit));
  });
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>('/api/brand-kits/:id', async (req, reply) => {
    if (req.params.id === BK.BUILTIN_KIT_ID) return readOnly(reply);
    const all = own(); const i = all.findIndex((k) => k.id === req.params.id); if (i < 0) return notFound(reply);
    const v = BK.validateKitInput((req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>, true); if (!v.ok) return bad(reply, v.issues);
    if (v.value.name && listBrandKits().some((k) => k.id !== req.params.id && k.name.toLowerCase() === v.value.name!.toLowerCase())) return reply.code(409).send({ error: `You already have a kit called "${v.value.name}".`, errorType: 'conflict', code: 'duplicate', issues: [{ code: 'duplicate', field: 'name', message: `You already have a kit called "${v.value.name}".` }] });
    const prev = all[i]; const kit: BrandKit = { ...prev, ...v.value, updatedAt: new Date().toISOString() }; all[i] = kit; save(all);
    if (v.value.logo === null) dropFile(prev.logo?.url); if (v.value.examples) prev.examples.filter((u) => !v.value.examples!.includes(u)).forEach(dropFile);
    return withPhrases(kit);
  });
  app.delete<{ Params: { id: string } }>('/api/brand-kits/:id', async (req, reply) => {
    if (req.params.id === BK.BUILTIN_KIT_ID) return readOnly(reply);
    const all = own(); const k = all.find((x) => x.id === req.params.id); if (!k) return notFound(reply);
    save(all.filter((x) => x !== k)); dropFile(k.logo?.url); k.examples.forEach(dropFile);
    if (getKv<string>(ACTIVE, '') === k.id) setKv(ACTIVE, BK.BUILTIN_KIT_ID);
    return { ok: true, id: k.id, activeId: activeBrandKitId() };
  });
  const upload = (slot: 'logo' | 'ex') => async (req: any, reply: FastifyReply) => {
    const id = String(req.params.id); if (id === BK.BUILTIN_KIT_ID) return readOnly(reply);
    if (!own().some((k) => k.id === id)) return notFound(reply);
    if (slot === 'ex' && (own().find((k) => k.id === id)!.examples.length >= BK.BRAND_LIMITS.examples)) return bad(reply, [{ code: 'too_many', field: 'examples', message: `Up to ${BK.BRAND_LIMITS.examples} examples. Remove one first.` }]);
    const m = await saveUpload(req, reply, id, slot, slot === 'logo'); if (!m) return reply;
    const all = own(); const i = all.findIndex((k) => k.id === id); if (i < 0) { dropFile(m.url); return notFound(reply); } // deleted while uploading
    const prev = all[i];
    all[i] = { ...prev, ...(slot === 'logo' ? { logo: m } : { examples: [...prev.examples, m.url].slice(0, BK.BRAND_LIMITS.examples) }), updatedAt: new Date().toISOString() }; save(all); if (slot === 'logo') dropFile(prev.logo?.url); return withPhrases(all[i]);
  };
  app.post<{ Params: { id: string } }>('/api/brand-kits/:id/logo', upload('logo'));
  app.post<{ Params: { id: string } }>('/api/brand-kits/:id/examples', upload('ex'));
  app.get<{ Params: { id: string } }>('/api/brand-kits/:id/tokens.json', async (req, reply) => {
    const k = getBrandKit(req.params.id); if (!k) return notFound(reply);
    return reply.header('content-type', 'application/json; charset=utf-8').header('content-disposition', `attachment; filename="${BK.kitSlug(k.name)}.tokens.json"`).send(JSON.stringify(BK.tokensOf(k), null, 2) + '\n');
  });
  app.get<{ Params: { id: string }; Querystring: { format?: string } }>('/api/brand-kits/:id/export', async (req, reply) => {
    const k = getBrandKit(req.params.id); if (!k) return notFound(reply); const f = req.query.format ?? 'css';
    const body = f === 'css' ? BK.cssVarsOf(k) : f === 'tailwind' ? BK.tailwindOf(k) : f === 'hex' ? BK.hexListOf(k) + '\n' : null;
    if (body == null) return bad(reply, [{ code: 'invalid', field: 'format', message: 'format must be css, tailwind or hex.' }]);
    return reply.header('content-type', 'text/plain; charset=utf-8').send(body);
  });
  app.get<{ Params: { id: string }; Querystring: { media?: string; prompt?: string } }>('/api/brand-kits/:id/prompt', async (req, reply) => {
    const k = getBrandKit(req.params.id); if (!k) return notFound(reply); const m = (req.query.media ?? 'image') as BK.BrandMediaKind;
    if (!['image', 'video', 'audio'].includes(m)) return bad(reply, [{ code: 'invalid', field: 'media', message: 'media must be image, video or audio.' }]);
    const phrase = BK.brandPhrase(k, m); return { id: k.id, name: k.name, media: m, phrase, prompt: req.query.prompt != null ? BK.withBrand(String(req.query.prompt), phrase) : null };
  });
}
