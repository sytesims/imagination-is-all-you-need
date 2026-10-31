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
 *   POST   /api/brand-kits/:id/logo?slot=main|light|dark|icon   multipart file (PNG, JPG, WEBP, GIF or SVG, ≤ 20 MB) → BrandKit (no slot = main)
 *   DELETE /api/brand-kits/:id/logo?slot=…      → BrandKit (that slot is empty again; a missing slot falls back to main where it's used)
 *   POST   /api/brand-kits/:id/font?role=heading|body[&family=…]   multipart file (TTF, OTF, WOFF or WOFF2, ≤ 10 MB, checked by content) → BrandKit
 *   POST   /api/brand-kits/:id/font/google      {family, role} → BrandKit (downloads the font once, brandFonts.fetchGoogleFont; 502 offline)
 *   DELETE /api/brand-kits/:id/font?role=…      → BrandKit (the role's files go and the role falls back to the app font)
 *   POST   /api/brand-kits/:id/examples         multipart file (an image) → BrandKit (up to 3)
 *   GET    /api/brand-kits/:id/tokens.json      the W3C Design Tokens file (download)
 *   GET    /api/brand-kits/:id/export?format=css|tailwind|hex   plain text
 *   GET    /api/brand-kits/:id/prompt?media=image|video|audio&prompt=…   → { phrase, prompt } (what "Brand: <name>" adds; nothing runs)
 *   POST   /api/brand-kits/from-words           {words} → { colors } (a free, rules-based palette; no model)
 * Logos and font files live in DATA_DIR (logos as brand-<kit>-logo…, fonts in brand-fonts/<kit>/) and are named by /files/ URLs in the kit,
 * so library export / import and media hygiene keep them. Kits saved before the logo set had one `logo`: normalizeKit reads it as logos.main.
 * Jobs: a submit (and the prompt peek) with brandKit=<id> gets the kit's phrase added to the typed prompt by applyBrandToFields (one helper for every tool).
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { getKv, setKv } from './db.js';
import { DATA_DIR } from './config.js';
import * as BK from './shared/brandKit.js';
import type { BrandFontFile, BrandKit, FontRole, LogoSlot } from './shared/brandKit.js';
import { FontFetchError, fetchGoogleFont, sfntFamily, sniffFont } from './brandFonts.js';

const KEY = 'brandKits'; const ACTIVE = 'brandKitActive';
const LOGO_MAX = 20 * 1024 * 1024;
const own = (): BrandKit[] => getKv<BrandKit[]>(KEY, []).map(BK.normalizeKit);
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
  const media = BK.brandMediaFor(toolId, mode); if (!media || BK.BRAND_OWN_WORDS.has(toolId)) return { id: kit.id, name: kit.name, media: media ?? 'image', phrase: '', applied: false }; // Ad Pack words the kit itself
  const phrase = BK.brandPhrase(kit, media); const typed = String(fields.prompt ?? '').trim();
  if (!phrase || !typed) return { id: kit.id, name: kit.name, media, phrase, applied: false };
  fields.prompt = BK.withBrand(typed, phrase); return { id: kit.id, name: kit.name, media, phrase, applied: true };
}

/** A multipart image → a DATA_DIR file named brand-<kit>-<slot>-<rand>.<ext>. SVGs are kept as uploaded but refused if they carry script. */
async function saveUpload(req: any, reply: FastifyReply, kitId: string, slot: string, allowSvg: boolean): Promise<BK.BrandMedia | null> {
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
/** Every file a kit owns: its logos, font files and examples. */
const filesOf = (k: BrandKit) => [...BK.LOGO_SLOTS.map((s) => k.logos[s]?.url), ...k.fontFiles.map((f) => f.url), ...k.examples].filter((u): u is string => !!u);
/** Remove a kit's own file once no kit uses it (a duplicate shares its source's logos and fonts). Call after saving. */
const dropFile = (url: string | undefined | null) => { if (!url?.startsWith('/files/brand-') || own().some((k) => filesOf(k).includes(url))) return; const abs = path.join(DATA_DIR, url.slice('/files/'.length)); if (abs.startsWith(DATA_DIR + path.sep) && existsSync(abs)) rmSync(abs, { force: true });
  const m = /^\/files\/brand-fonts\/([\w-]+)\//.exec(url); if (m) tidyFontDir(m[1]); };
const fontDir = (kitId: string) => path.join(DATA_DIR, 'brand-fonts', kitId);
/** The kit's font folder goes once it's empty. */
const tidyFontDir = (kitId: string) => { try { const d = fontDir(kitId); if (existsSync(d) && !readdirSync(d).length) rmdirSync(d); } catch { /* in use */ } };
const ROLE = (v: unknown): FontRole | null => (v === 'heading' || v === 'body' ? v : null);
const SLOT = (v: unknown): LogoSlot | null => (v == null || v === '' ? 'main' : BK.LOGO_SLOTS.includes(v as LogoSlot) ? (v as LogoSlot) : null);
/** Save one kit's change (f gets the kit, returns the new one), drop the files it no longer uses. → the saved kit, or null (not found). */
function update(id: string, f: (k: BrandKit) => BrandKit): BrandKit | null {
  const all = own(); const i = all.findIndex((k) => k.id === id); if (i < 0) return null; const prev = all[i];
  const next = BK.normalizeKit({ ...f(prev), updatedAt: new Date().toISOString() }); next.logo = next.logos.main; all[i] = next; save(all);
  filesOf(prev).filter((u) => !filesOf(next).includes(u)).forEach(dropFile); return next;
}
/** A role's font files go when the role names another family (a font picked from the list, or cleared). */
const keepFontFiles = (k: BrandKit): BrandKit => ({ ...k, fontFiles: k.fontFiles.filter((f) => k.fonts[f.role] === f.family) });

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
      logo: src?.logos.main ?? null, logos: src ? { ...src.logos } : { main: null, light: null, dark: null, icon: null }, fontFiles: src ? keepFontFiles({ ...src, fonts: v.value.fonts ?? src.fonts }).fontFiles : [],
      examples: v.value.examples ?? [], createdAt: now, updatedAt: now };
    save([...all, kit]); return reply.code(201).send(withPhrases(kit));
  });
  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>('/api/brand-kits/:id', async (req, reply) => {
    if (req.params.id === BK.BUILTIN_KIT_ID) return readOnly(reply);
    const all = own(); const i = all.findIndex((k) => k.id === req.params.id); if (i < 0) return notFound(reply);
    const v = BK.validateKitInput((req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>, true); if (!v.ok) return bad(reply, v.issues);
    if (v.value.name && listBrandKits().some((k) => k.id !== req.params.id && k.name.toLowerCase() === v.value.name!.toLowerCase())) return reply.code(409).send({ error: `You already have a kit called "${v.value.name}".`, errorType: 'conflict', code: 'duplicate', issues: [{ code: 'duplicate', field: 'name', message: `You already have a kit called "${v.value.name}".` }] });
    const kit = update(req.params.id, (prev) => keepFontFiles({ ...prev, ...v.value, ...(v.value.logo === null ? { logos: { ...prev.logos, main: null } } : {}) }));
    return kit ? withPhrases(kit) : notFound(reply);
  });
  app.delete<{ Params: { id: string } }>('/api/brand-kits/:id', async (req, reply) => {
    if (req.params.id === BK.BUILTIN_KIT_ID) return readOnly(reply);
    const all = own(); const k = all.find((x) => x.id === req.params.id); if (!k) return notFound(reply);
    save(all.filter((x) => x !== k)); filesOf(k).forEach(dropFile);
    if (getKv<string>(ACTIVE, '') === k.id) setKv(ACTIVE, BK.BUILTIN_KIT_ID);
    return { ok: true, id: k.id, activeId: activeBrandKitId() };
  });
  /** The kit to change, or a reply already sent (the built-in kit, an unknown one). */
  const mine = (req: any, reply: FastifyReply): string | null => { const id = String(req.params.id); if (id === BK.BUILTIN_KIT_ID) { readOnly(reply); return null; } if (!own().some((k) => k.id === id)) { notFound(reply); return null; } return id; };
  const badSlot = (reply: FastifyReply) => bad(reply, [{ code: 'invalid', field: 'slot', message: `slot must be one of ${BK.LOGO_SLOTS.join(', ')}.` }]);
  app.post<{ Params: { id: string }; Querystring: { slot?: string } }>('/api/brand-kits/:id/logo', async (req, reply) => {
    const id = mine(req, reply); if (!id) return reply; const slot = SLOT(req.query.slot); if (!slot) return badSlot(reply);
    const m = await saveUpload(req, reply, id, slot === 'main' ? 'logo' : `logo-${slot}`, true); if (!m) return reply;
    const kit = update(id, (k) => ({ ...k, logos: { ...k.logos, [slot]: m } })); if (!kit) { dropFile(m.url); return notFound(reply); } // deleted while uploading
    return withPhrases(kit);
  });
  app.delete<{ Params: { id: string }; Querystring: { slot?: string } }>('/api/brand-kits/:id/logo', async (req, reply) => {
    const id = mine(req, reply); if (!id) return reply; const slot = SLOT(req.query.slot); if (!slot) return badSlot(reply);
    return withPhrases(update(id, (k) => ({ ...k, logos: { ...k.logos, [slot]: null } }))!);
  });
  app.post<{ Params: { id: string } }>('/api/brand-kits/:id/examples', async (req, reply) => {
    const id = mine(req, reply); if (!id) return reply;
    if (own().find((k) => k.id === id)!.examples.length >= BK.BRAND_LIMITS.examples) return bad(reply, [{ code: 'too_many', field: 'examples', message: `Up to ${BK.BRAND_LIMITS.examples} examples. Remove one first.` }]);
    const m = await saveUpload(req, reply, id, 'ex', false); if (!m) return reply;
    const kit = update(id, (k) => ({ ...k, examples: [...k.examples, m.url].slice(0, BK.BRAND_LIMITS.examples) })); if (!kit) { dropFile(m.url); return notFound(reply); }
    return withPhrases(kit);
  });

  /* fonts: a role's files are replaced as a whole; the role's name becomes the font's family */
  const badRole = (reply: FastifyReply) => bad(reply, [{ code: 'invalid', field: 'role', message: 'role must be heading or body.' }]);
  const FONT_MAX = BK.BRAND_LIMITS.fontMB * 1024 * 1024;
  /** Write font bytes into the kit's folder → the /files/ URL and file name. */
  const writeFont = (kitId: string, family: string, weight: number, ext: string, bytes: Buffer) => {
    const dir = fontDir(kitId); mkdirSync(dir, { recursive: true }); const file = `${BK.kitSlug(family)}-${weight || 'all'}-${randomUUID().slice(0, 6)}${ext}`;
    writeFileSync(path.join(dir, file), bytes); return { url: `/files/brand-fonts/${kitId}/${file}`, file };
  };
  const setRole = (id: string, role: FontRole, family: string, files: BrandFontFile[]) => update(id, (k) => ({ ...k, fonts: { ...k.fonts, [role]: family }, fontFiles: [...k.fontFiles.filter((f) => f.role !== role), ...files] }));
  app.post<{ Params: { id: string }; Querystring: { role?: string; family?: string } }>('/api/brand-kits/:id/font', async (req, reply) => {
    const id = mine(req, reply); if (!id) return reply; const role = ROLE(req.query.role); if (!role) return badRole(reply);
    if (!req.isMultipart()) return bad(reply, [{ code: 'required', field: 'file', message: 'Send the font as multipart form data (field "file").' }]);
    let got: { bytes: Buffer; name: string } | null = null;
    for await (const part of req.parts()) { if (part.type !== 'file') continue; if (got) { part.file.resume(); continue; } got = { bytes: await part.toBuffer(), name: part.filename || '' }; }
    if (!got || !got.bytes.length) return bad(reply, [{ code: 'required', field: 'file', message: 'Add a font file.' }]);
    if (got.bytes.length > FONT_MAX) return bad(reply, [{ code: 'file_too_large', field: 'file', message: `Font files can be up to ${BK.BRAND_LIMITS.fontMB} MB.` }]);
    const ext = path.extname(got.name).toLowerCase(); const format = sniffFont(got.bytes, ext);
    if (!format) return bad(reply, [{ code: 'invalid_font', field: 'file', message: 'That isn’t a font file. Use a TTF, OTF, WOFF or WOFF2 file.' }]);
    const asked = String(req.query.family ?? '').trim(); const inner = format === 'truetype' || format === 'opentype' ? sfntFamily(got.bytes) : '';
    const family = [asked, inner, BK.familyOfFileName(got.name)].find(BK.fontNameOk) || 'My font';
    const w = writeFont(id, family, 0, ext, got.bytes);
    const kit = setRole(id, role, family, [{ family, role, weight: 0, url: w.url, file: got.name.slice(0, 120) || w.file, format, source: 'upload', licence: 'Your own file: check its licence before you share what you make' }]);
    if (!kit) { dropFile(w.url); return notFound(reply); } return withPhrases(kit);
  });
  app.post<{ Params: { id: string }; Body: { family?: string; role?: string } }>('/api/brand-kits/:id/font/google', async (req, reply) => {
    const id = mine(req, reply); if (!id) return reply; const role = ROLE(req.body?.role); if (!role) return badRole(reply);
    const asked = String(req.body?.family ?? '').trim(); if (!BK.fontNameOk(asked)) return bad(reply, [{ code: 'invalid', field: 'family', message: 'Type a font name in plain words, like “Fraunces”.' }]);
    /* already on this computer for the other role: share its files, nothing to download */
    const have = own().find((k) => k.id === id)!.fontFiles.filter((f) => f.source === 'google' && f.family.toLowerCase() === asked.toLowerCase());
    if (have.length) return withPhrases(setRole(id, role, have[0].family, have.map((f) => ({ ...f, role })))!);
    let g: Awaited<ReturnType<typeof fetchGoogleFont>>;
    try { g = await fetchGoogleFont(asked, FONT_MAX); }
    catch (e) { const fe = e instanceof FontFetchError ? e : new FontFetchError('offline', 'Couldn’t download that font.'); return reply.code(fe.code === 'not_found' ? 404 : 502).send({ error: fe.message, errorType: fe.code === 'not_found' ? 'not_found' : 'upstream', code: fe.code }); }
    const files: BrandFontFile[] = g.files.map((f) => { const w = writeFont(id, g.family, f.weight, '.woff2', f.bytes); return { family: g.family, role, weight: f.weight, url: w.url, file: w.file, format: 'woff2', source: 'google', licence: g.licence, sourceUrl: g.sourceUrl }; });
    const kit = setRole(id, role, g.family, files); if (!kit) { files.forEach((f) => dropFile(f.url)); return notFound(reply); } return withPhrases(kit);
  });
  app.delete<{ Params: { id: string }; Querystring: { role?: string } }>('/api/brand-kits/:id/font', async (req, reply) => {
    const id = mine(req, reply); if (!id) return reply; const role = ROLE(req.query.role); if (!role) return badRole(reply);
    return withPhrases(update(id, (k) => ({ ...k, fonts: { ...k.fonts, [role]: '' }, fontFiles: k.fontFiles.filter((f) => f.role !== role) }))!);
  });
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
