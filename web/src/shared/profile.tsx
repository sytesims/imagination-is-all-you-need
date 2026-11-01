/**
 * Your local profile (GET/PUT /api/me/profile, POST/DELETE /api/me/avatar): one cached copy for the header avatar, the account menu, the
 * /profile page, Settings and the share page, so a change shows everywhere at once. The bean mascot is the default picture.
 */
import { useEffect, useId, useState } from 'react';
import { beanSvg, avatarChoiceOf } from '../../../server/src/shared/beanSvg';
import { AVATAR_PX, type ProfileData } from '../../../server/src/shared/avatar';
import './profile.css';
export type { ProfileData };

let cache: ProfileData | null = null; let inflight: Promise<ProfileData | null> | null = null;
const subs = new Set<(p: ProfileData | null) => void>();
const publish = (p: ProfileData | null) => { cache = p; subs.forEach(f => f(p)); };
export function loadProfile(force = false): Promise<ProfileData | null> {
  if (cache && !force) return Promise.resolve(cache);
  return inflight ??= fetch('/api/me/profile').then(r => r.ok ? r.json() : null).catch(() => null).then((p: ProfileData | null) => { inflight = null; if (p) publish(p); return p; });
}
export function useProfile(): ProfileData | null {
  const [p, setP] = useState(cache);
  useEffect(() => { subs.add(setP); void loadProfile(); return () => { subs.delete(setP); }; }, []);
  return p;
}
/** Shown when a save fails without a reason from the server (it's down, or answered with a bare 5xx): plain words, never "HTTP 502". */
const SAVE_FAILED = 'Couldn’t save. Check that the app is still running, then try again.';
const send = async (url: string, init: RequestInit): Promise<ProfileData> => {
  const r = await fetch(url, init).catch(() => null); if (!r) throw new Error(SAVE_FAILED);
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(typeof b.error === 'string' && b.error ? b.error : SAVE_FAILED), { field: b.issues?.[0]?.field, code: b.code ?? b.issues?.[0]?.code });
  publish(b); return b;
};
export const saveProfile = (patch: Partial<ProfileData>) => send('/api/me/profile', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) });
export const uploadAvatar = (png: Blob) => { const fd = new FormData(); fd.append('file', png, 'avatar.png'); return send('/api/me/avatar', { method: 'POST', body: fd }); };
export const removeAvatar = () => send('/api/me/avatar', { method: 'DELETE' });
/** The "Me" photo (Person Swap's Person slot, 2026-11-01): uploaded to the library (POST /api/media, so it is in Uploads too) and the profile
 *  points to it (mePhotoUrl), so Canvas and MCP can use the same photo. */
export const saveMePhoto = async (f: File) => { const fd = new FormData(); fd.append('file', f, f.name);
  const r = await fetch('/api/media', { method: 'POST', body: fd }).catch(() => null); if (!r) throw new Error(SAVE_FAILED); const j = await r.json().catch(() => ({}));
  const url = j.items?.[0]?.url; if (!r.ok || typeof url !== 'string') throw new Error(typeof j.error === 'string' && j.error ? j.error : SAVE_FAILED); return saveProfile({ mePhotoUrl: url }); };

/** The name to show: your display name, else your @name, else the plain local label. */
export const nameOf = (p: ProfileData | null | undefined) => p?.displayName || (p?.handle ? `@${p.handle}` : '') || 'Local account';

/** Picked photos: images the browser can read, up to 20 MB; they are cropped to a centred circle and scaled to 256 px before upload. */
export const PHOTO_MAX_MB = 20;
export class PhotoError extends Error {}
export async function cropToCircle(file: File): Promise<Blob> {
  if (!/^image\//.test(file.type) || /svg|heic|heif/i.test(file.type)) throw new PhotoError('Use a PNG, JPG or WEBP picture.');
  if (file.size > PHOTO_MAX_MB * 1024 * 1024) throw new PhotoError(`That picture is too big (max ${PHOTO_MAX_MB} MB). Try a smaller one.`);
  let bmp: ImageBitmap; try { bmp = await createImageBitmap(file); } catch { throw new PhotoError('Couldn’t read that picture. Try a PNG, JPG or WEBP.'); }
  const c = document.createElement('canvas'); c.width = c.height = AVATAR_PX; const g = c.getContext('2d')!;
  const side = Math.min(bmp.width, bmp.height); const sx = (bmp.width - side) / 2, sy = (bmp.height - side) / 2;
  g.beginPath(); g.arc(AVATAR_PX / 2, AVATAR_PX / 2, AVATAR_PX / 2, 0, Math.PI * 2); g.closePath(); g.clip();
  g.imageSmoothingQuality = 'high'; g.drawImage(bmp, sx, sy, side, side, 0, 0, AVATAR_PX, AVATAR_PX); bmp.close?.();
  const out = await new Promise<Blob | null>(res => c.toBlob(res, 'image/webp', 0.88)) ?? await new Promise<Blob | null>(res => c.toBlob(res, 'image/png'));
  if (!out) throw new PhotoError('Couldn’t prepare that picture.'); return out;
}

/** The bean on its own (picker swatches, the default picture). */
export function Bean({ mood, tint, size, label, className = "" }: { mood?: string; tint?: string; size: number | string; label?: string; className?: string }) {
  const uid = useId(); const a = avatarChoiceOf({ mood: mood as any, tint: tint as any });
  return <span className={`bean-av ${className}`} style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: beanSvg({ ...a, uid, label }) }} />;
}
/** Your picture: the photo when you set one (a broken or missing photo falls back to your bean), else your bean. Decorative unless `label`. */
export function UserAvatar({ profile, size, label, className = "" }: { profile: ProfileData | null | undefined; size: number | string; label?: string; className?: string }) {
  const [broken, setBroken] = useState(''); const url = profile?.avatarUrl ?? '';
  if (url && broken !== url) return <span className={`user-av user-av-photo ${className}`} style={{ width: size, height: size }} data-testid="user-av" data-kind="photo" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    <img src={url} alt="" width={size} height={size} draggable={false} onError={() => setBroken(url)} /></span>;
  const a = avatarChoiceOf(profile?.avatar);
  return <span className={`user-av ${className}`} data-testid="user-av" data-kind="bean" aria-hidden={label ? undefined : true} style={{ width: size, height: size }}><Bean mood={a.mood} tint={a.tint} size={size} label={label} /></span>;
}
