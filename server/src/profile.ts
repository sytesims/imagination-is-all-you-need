/**
 * Local profile (one person per install, no accounts): GET/PUT /api/me/profile, POST/DELETE /api/me/avatar (a small circle-cropped picture,
 * stored in the data folder like other uploads), GET /api/me/stats (the /profile creator page's numbers). Registered from routesGaps.ts.
 */
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { getKv, setKv } from './db.js';
import { jobs } from './jobs.js';
import { countsAsRun } from './owner.js';
import * as lib from './library.js';
import { savedAllTime } from './billing.js';
import { engineNameOf } from './engineName.js';
import { AVATAR_MOODS, AVATAR_TINTS, COVER_GRADIENTS, HANDLE_RE, NAME_MAX, AVATAR_MAX_BYTES, type ProfileData, type AvatarChoice, type Cover } from './shared/avatar.js';

const EMPTY: ProfileData = { displayName: null, handle: null, avatarUrl: null, avatar: null, cover: null, createdAt: null };
const bad = (field: string, message: string, code = 'invalid') => ({ error: message, errorType: 'validation', code, issues: [{ code, field, message }] });
/** Older installs stored only { displayName, avatarUrl }: fill the new fields, and stamp createdAt the first time it is read. */
export function readProfile(): ProfileData {
  const p = { ...EMPTY, ...getKv<Partial<ProfileData>>('profile', {}) };
  if (!p.createdAt) { p.createdAt = Math.min(Date.now(), ...[...jobs.values()].filter(countsAsRun).map((j) => j.createdAt)); setKv('profile', p); }
  return p;
}
const ownAvatar = (u: string | null | undefined) => !!u && /^\/files\/avatar-[\w-]+\.(png|jpe?g|webp)$/.test(u);
const dropFile = async (u: string | null | undefined) => { if (ownAvatar(u)) await unlink(path.join(DATA_DIR, path.basename(u!))).catch(() => undefined); };

function avatarOf(v: unknown): AvatarChoice | null | string {
  if (v === null) return null; const a = v as any;
  if (!a || typeof a !== 'object' || !AVATAR_MOODS.includes(a.mood) || !AVATAR_TINTS.includes(a.tint)) return `avatar is { mood: ${AVATAR_MOODS.join('|')}, tint: ${AVATAR_TINTS.join('|')} } or null.`;
  return { mood: a.mood, tint: a.tint };
}
function coverOf(v: unknown): Cover | null | string {
  if (v === null) return null; const c = v as any;
  if (c?.kind === 'gradient' && COVER_GRADIENTS.includes(c.id)) return { kind: 'gradient', id: c.id };
  if (c?.kind === 'image' && typeof c.url === 'string' && (/^\/(files|samples)\/[^?#]+$/.test(c.url) || /^\/api\/media\/poster\?url=%2F(files|samples)%2F[^&#]+$/.test(c.url)) && !c.url.includes('..')) return { kind: 'image', url: c.url }; // a picture, or a clip's poster frame
  return `cover is { kind: 'gradient', id: ${COVER_GRADIENTS.join('|')} }, { kind: 'image', url: '/files/…' | '/api/media/poster?url=…' } or null.`;
}
/** Sniff the picture's real type (the name and the browser's type can lie). */
function imageExt(b: Buffer): string | null {
  if (b.length > 8 && b.readUInt32BE(0) === 0x89504e47) return '.png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return '.jpg';
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  return null;
}

export function registerProfile(app: FastifyInstance) {
  app.get('/api/me/profile', async () => readProfile());
  app.put<{ Body: Partial<Record<keyof ProfileData, unknown>> }>('/api/me/profile', async (req, reply) => {
    const b = req.body ?? {}; const cur = readProfile(); const next: ProfileData = { ...cur };
    if (b.displayName !== undefined) { if (b.displayName !== null && (typeof b.displayName !== 'string' || b.displayName.trim().length > NAME_MAX)) return reply.code(400).send(bad('displayName', `displayName is up to ${NAME_MAX} characters.`));
      next.displayName = (b.displayName as string | null)?.trim() || null; }
    if (b.handle !== undefined) { const h = typeof b.handle === 'string' ? b.handle.trim().replace(/^@/, '') : b.handle;
      if (h !== null && h !== '' && (typeof h !== 'string' || !HANDLE_RE.test(h))) return reply.code(400).send(bad('handle', 'handle is 2–30 letters, digits, dots, dashes or underscores.'));
      next.handle = (h as string | null) ? (h as string).toLowerCase() : null; }
    if (b.avatarUrl !== undefined) { // a photo: an uploaded /files/… path (older installs also saved https URLs; those keep working)
      if (b.avatarUrl !== null && !(typeof b.avatarUrl === 'string' && /^(\/files\/|\/samples\/|https:\/\/)/.test(b.avatarUrl))) return reply.code(400).send(bad('avatarUrl', 'avatarUrl must be an uploaded /files/… path or an https URL.'));
      next.avatarUrl = (b.avatarUrl as string | null) || null; }
    if (b.avatar !== undefined) { const a = avatarOf(b.avatar); if (typeof a === 'string') return reply.code(400).send(bad('avatar', a)); next.avatar = a; }
    if (b.cover !== undefined) { const c = coverOf(b.cover); if (typeof c === 'string') return reply.code(400).send(bad('cover', c)); next.cover = c; }
    if (cur.avatarUrl !== next.avatarUrl) await dropFile(cur.avatarUrl); // a replaced or removed upload is deleted, so old pictures don't pile up
    setKv('profile', next); return next;
  });
  /** Multipart `file`: PNG, JPG or WEBP up to 2 MB (the browser crops it to a 256 px circle first). Replaces the picture; the bean comes back on DELETE. */
  app.post('/api/me/avatar', async (req, reply) => {
    let buf: Buffer;
    try { const part = await req.file({ limits: { fileSize: AVATAR_MAX_BYTES, files: 1 } }); if (!part) return reply.code(400).send(bad('file', 'Attach a picture.', 'missing'));
      buf = await part.toBuffer(); if ((part.file as any).truncated || buf.length >= AVATAR_MAX_BYTES) return reply.code(400).send(bad('file', 'That picture is too big (max 2 MB).', 'file_too_large')); }
    catch (e: any) { if (e?.code === 'FST_REQ_FILE_TOO_LARGE' || e?.statusCode === 413) return reply.code(400).send(bad('file', 'That picture is too big (max 2 MB).', 'file_too_large'));
      if (/multipart/i.test(String(e?.message))) return reply.code(400).send(bad('file', 'Attach a picture.', 'missing')); throw e; }
    const ext = imageExt(buf); if (!ext) return reply.code(400).send(bad('file', 'Use a PNG, JPG or WEBP picture.', 'unsupported'));
    const name = `avatar-${randomUUID().slice(0, 12)}${ext}`; await writeFile(path.join(DATA_DIR, name), buf);
    const cur = readProfile(); await dropFile(cur.avatarUrl); const next = { ...cur, avatarUrl: `/files/${name}` }; setKv('profile', next); return next;
  });
  app.delete('/api/me/avatar', async () => { const cur = readProfile(); await dropFile(cur.avatarUrl); const next = { ...cur, avatarUrl: null }; setKv('profile', next); return next; });
  /** The creator page's numbers. Community sample jobs and trashed jobs are left out, like the Assets list. */
  app.get('/api/me/stats', async () => {
    const mine = [...jobs.values()].filter((j) => countsAsRun(j) && !lib.metaOf(j.id).deletedAt);
    const byModel = new Map<string, number>();
    for (const j of mine) { let n: string | null = j.modelName ?? null; if (!n) { try { n = engineNameOf(j) || null; } catch { n = null; } } if (n) byModel.set(n, (byModel.get(n) ?? 0) + 1); }
    let fav: { name: string; runs: number } | null = null; for (const [name, runs] of byModel) if (!fav || runs > fav.runs) fav = { name, runs };
    const p = readProfile(); const first = mine.reduce((m, j) => Math.min(m, j.createdAt), Infinity);
    return { generations: mine.length, finished: mine.filter((j) => j.status === 'done').length, ...savedAllTime(), favouriteModel: fav,
      memberSince: Math.min(p.createdAt ?? Date.now(), Number.isFinite(first) ? first : Infinity) };
  });
}
