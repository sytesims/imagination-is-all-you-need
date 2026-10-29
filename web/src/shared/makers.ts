/**
 * Maker tiles (2026-10-22): ONE tile design per model MAKER (the registry's `maker` key, server/src/shared/modelIds.ts MAKERS).
 * A tile shows the maker's official/Simple Icons mark in mono when a clean source exists; our app mark for our own tools; otherwise the
 * maker's initial in the same tile (2026-10-29). The medium glyph is left only for rows with no known maker.
 * Company names and logos are trademarks of their owners, shown to identify the model; see ASSETS-CREDITS.md for sources and terms.
 *
 * MAKER_LOGO is the ONLY place logos are wired: delete a line to fall back to the initial, add a line + an SVG in assets/makers/ to add one
 * Tint colours live in tokens.css (--mk-<key>).
 */
import qwen from '../assets/makers/alibaba-qwen.svg?raw';
import wan from '../assets/makers/alibaba-wan.svg?raw';
import bfl from '../assets/makers/bfl.svg?raw';
import bytedance from '../assets/makers/bytedance.svg?raw';
import elevenlabs from '../assets/makers/elevenlabs.svg?raw';
import fish from '../assets/makers/fish-audio.svg?raw';
import google from '../assets/makers/google.svg?raw';
import kling from '../assets/makers/kling.svg?raw';
import meta from '../assets/makers/meta.svg?raw';
import minimax from '../assets/makers/minimax.svg?raw';
import openai from '../assets/makers/openai.svg?raw';
import hunyuan from '../assets/makers/tencent-hunyuan.svg?raw';
import krea from '../assets/makers/krea.svg?raw';
import luma from '../assets/makers/luma.svg?raw';
import comfy from '../assets/makers/comfy.svg?raw';
import ffmpeg from '../assets/makers/ffmpeg.svg?raw';
import lightricks from '../assets/makers/lightricks.svg?raw';
import ideogram from '../assets/makers/ideogram.svg?raw';
import recraft from '../assets/makers/recraft.svg?raw';
import runway from '../assets/makers/runway.svg?raw';
import clarity from '../assets/makers/clarity.svg?raw';
import fashn from '../assets/makers/fashn.svg?raw';
import fal from '../assets/makers/fal.svg?raw';
import { MAKERS } from '../../../server/src/shared/modelIds';

/** maker key → logo SVG (unmodified file contents). One line per maker. */
export const MAKER_LOGO: Record<string, string> = {
  'alibaba-qwen': qwen,
  'alibaba-wan': wan,
  bfl,
  bytedance,
  elevenlabs,
  'fish-audio': fish,
  google,
  kling,
  meta,
  minimax,
  openai,
  'tencent-hunyuan': hunyuan,
  tongyi: wan, // Tongyi-MAI (Z-Image) is Alibaba's lab: the same Alibaba Cloud mark as Wan
  krea,
  luma,
  comfy,
  ffmpeg,
  lightricks, // the LTX mark (LTX-2.x models are Lightricks')
  ideogram,
  recraft,
  runway,
  clarity,
  fashn,
  fal,
};

/** Our own tools and recipes (Turntable, look recipes) show our Orbit mark. Every other maker with no logo above shows its initial
 *  (first letter of its registry name) in the same tile, so no model shows a generic medium icon (2026-10-29). */
export const MAKER_GLYPH: Record<string, 'app'> = {
  openhiggsfield: 'app',
};
/** Display names: the server's MAKERS is the one source (the registry's makerName wins when present). */
export const MAKER_NAME: Record<string, string> = Object.fromEntries(Object.entries(MAKERS).map(([k, v]) => [k, v.name]));
/** Old or alternate maker keys → the registry key (older servers sent 'tencent' on Hunyuan 3D). */
const ALIAS: Record<string, string> = { tencent: 'tencent-hunyuan', 'tencent-hy': 'tencent-hunyuan' };
/** Makers whose tile stays neutral (no tint): brands that allow black/white marks only. */
const NEUTRAL = new Set(['bfl', 'fish-audio', 'openai', 'elevenlabs', 'meta', 'google', 'runway', 'clarity', 'topaz', 'phhofm', 'krea', 'luma', 'comfy', 'ffmpeg', 'microsoft', 'fal', 'fashn']);

/** Fallback for rows that carry only a family or display name (older servers, engine rows): best-effort maker key. */
const BY_NAME: [RegExp, string][] = [
  // specific names first (Z-Image-Turbo 2K upscaler is Tongyi's; "Real-ESRGAN" must not fall to a broader rule)
  [/real-?esrgan|esrgan/i, 'real-esrgan'], [/ultrasharp/i, 'ultrasharp'], [/nomos|phhofm/i, 'phhofm'], [/ace[-\s]?step/i, 'ace-step'], [/z-image/i, 'tongyi'], [/\byue/i, 'm-a-p'],
  [/pixal3d/i, 'pixal3d'], [/trellis/i, 'microsoft'], [/tripo/i, 'tripo'], [/fashn/i, 'fashn'], [/^fal\b/i, 'fal'], [/turntable/i, 'openhiggsfield'], [/meshy/i, 'meshy'], [/rodin/i, 'rodin'],
  [/qwen/i, 'alibaba-qwen'], [/\bwan\b/i, 'alibaba-wan'], [/flux|bfl|black forest/i, 'bfl'], [/nano banana|veo|google/i, 'google'], [/gpt|openai/i, 'openai'],
  [/seed|bytedance/i, 'bytedance'], [/kling/i, 'kling'], [/minimax|\bh3\b/i, 'minimax'], [/ltx|lightricks/i, 'lightricks'], [/ideogram/i, 'ideogram'], [/recraft/i, 'recraft'], [/luma/i, 'luma'],
  [/krea/i, 'krea'], [/runway/i, 'runway'], [/grok|xai/i, 'xai'], [/hunyuan|tencent|\bhy\b/i, 'tencent-hunyuan'], [/muse|meta\b/i, 'meta'], [/moss/i, 'openmoss'], [/opensoul/i, 'openhiggsfield'],
  [/bria/i, 'bria'], [/rife/i, 'rife'], [/depth/i, 'depth-anything'], [/birefnet/i, 'birefnet'], [/ffmpeg/i, 'ffmpeg'], [/sonilo/i, 'sonilo'],
  [/stable|stability/i, 'stability'], [/mmaudio/i, 'mmaudio'], [/eleven/i, 'elevenlabs'], [/fish/i, 'fish-audio'], [/heygen/i, 'heygen'], [/chatterbox|resemble/i, 'resemble'], [/\bf5\b|f5-tts/i, 'swivid'], [/crystal|clarity/i, 'clarity'], [/topaz/i, 'topaz'],
  [/comfy/i, 'comfy'],
];
export const makerKeyFromName = (s?: string | null): string | null => { if (!s) return null; for (const [re, k] of BY_NAME) if (re.test(s)) return k; return null; };
/** A logo ready to inline many times on one page: no <title> (the tile has its own tooltip) and no id-based clip paths. The BFL mark
 *  clipped itself with url(#clip0_…); every inlined copy repeats that id, so all copies point at the first one on the page, and when that
 *  one is hidden (display:none) or unmounted the browser can draw nothing: an empty FLUX tile. The clip was the whole viewBox, so dropping
 *  it changes nothing else. Also dropped: the root's class (site CSS classes like "logo" that would pick up our styles) and a favicon's
 *  full-viewBox background square (Ideogram, Clarity, FASHN): the tile is the background, so only the mark itself is drawn. */
const CLEAN = new Map<string, string>();
const dropBgSquare = (svg: string): string => {
  const vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/); const r = svg.match(/^(\s*<svg\b[^>]*>\s*)<rect\b([^>]*)\/>/);
  if (!vb || !r) return svg; const at = (n: string) => r[2].match(new RegExp(`\\s${n}="([\\d.]+)"`))?.[1];
  const full = Number(at('width')) === Number(vb[1]) && Number(at('height')) === Number(vb[2]) && !Number(at('x') ?? 0) && !Number(at('y') ?? 0);
  return full ? r[1] + svg.slice(r[0].length) : svg;
};
const cleanLogo = (svg: string): string => { let c = CLEAN.get(svg); if (c == null) { c = dropBgSquare(svg.replace(/<title>[^<]*<\/title>/, '').replace(/\sclip-path="url\(#[^)"]*\)"/g, '').replace(/<defs>\s*(?:<clipPath\b[\s\S]*?<\/clipPath>\s*)+<\/defs>/g, '').replace(/^(\s*<svg\b[^>]*?)\sclass="[^"]*"/, '$1')); CLEAN.set(svg, c); } return c; };
/** How a tile draws: the maker's logo, our app mark, the maker's initial (a known maker with no logo), or the medium glyph (no maker known). */
export type MakerMark = 'logo' | 'app' | 'initial' | 'medium';
const known = (k: string) => !!(MAKER_LOGO[k] || MAKER_GLYPH[k] || MAKER_NAME[k]);
/** Tile data for a maker key (or a fallback name). */
export function makerTile(maker?: string | null, fallbackName?: string | null) {
  const m = maker ? ALIAS[maker] ?? maker : null;
  const key = (m && known(m) ? m : null) ?? makerKeyFromName(fallbackName);
  const logo = key ? MAKER_LOGO[key] : undefined;
  const name = key ? MAKER_NAME[key] : undefined; const initial = name?.match(/[a-z0-9]/i)?.[0].toUpperCase();
  const mark: MakerMark = logo ? 'logo' : key && MAKER_GLYPH[key] ? MAKER_GLYPH[key] : initial ? 'initial' : 'medium';
  return { key, mark, logo: logo ? cleanLogo(logo) : undefined, initial: mark === 'initial' ? initial : undefined, neutral: !key || NEUTRAL.has(key) || mark === 'app', name };
}
