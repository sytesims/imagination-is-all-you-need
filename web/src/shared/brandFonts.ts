/**
 * Brand fonts in the browser (2026-10-31): every brand's font files (uploaded, or downloaded once from Google Fonts; served from
 * /files/brand-fonts/…) are added to the page with FontFace, app-wide, so the Brands page specimens, the Ad card, the logo stamp and the
 * brand sheet all draw with the real face. An uploaded file covers every weight (no fake bold); Google files are their own weight.
 */
import type { BrandKit } from '../../../server/src/shared/brandKit';

const added = new Map<string, Promise<void>>();
/** Add one kit's font files (once per file). Resolves when they're loaded; a broken file is skipped. */
export function ensureKitFonts(kit: Pick<BrandKit, 'fontFiles'> | null | undefined): Promise<void> {
  if (typeof FontFace === 'undefined' || !document.fonts) return Promise.resolve();
  return Promise.all((kit?.fontFiles ?? []).map((f) => {
    const key = `${f.family}|${f.url}`; let p = added.get(key);
    if (!p) { p = new FontFace(f.family, `url("${f.url}")`, { weight: f.weight ? String(f.weight) : '1 1000', display: 'swap' }).load().then((ff) => { document.fonts.add(ff); }, () => { added.delete(key); }); added.set(key, p); }
    return p;
  })).then(() => undefined);
}
/** Every kit's fonts (the store calls this after each load and save). */
export const registerBrandFonts = (kits: BrandKit[]) => { for (const k of kits) void ensureKitFonts(k); };
/** A CSS font-family list for a brand font name ('' = the app font). */
export const cssFamily = (name: string, fallback = 'var(--font-ui)') => (name ? `"${name.replace(/"/g, '')}", ${fallback}` : fallback);
