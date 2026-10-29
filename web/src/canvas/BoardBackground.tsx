/**
 * The board's background (tldraw's Background slot, behind every shape), in the look picked in the board menu (boardLook.ts):
 *  - space: three star and dust layers that drift at different speeds as you pan (parallax), so the board feels endless and deep, with
 *    a soft orange glow at the edges;
 *  - haze: slow colour clouds over a faint dot grid;
 *  - night: a calm dot grid and a gentle vignette.
 * Cheap on purpose: each layer is one tiled image moved with a GPU transform (no repaint while panning; a zoom only rescales the tile),
 * styles are set straight on the elements from a tldraw reactor (no React render per camera move), and the drifting glows are CSS
 * animations that stop under reduced motion.
 */
import { useRef } from 'react';
import { useEditor, useQuickReactor, useValue } from 'tldraw';
import { boardLookAtom, type BoardLook } from './boardLook';

/** A seeded tile of stars (or dust) as a data URL, made once per layer. */
const tiles = new Map<string, string>();
function starTile(key: string, size: number, n: number, o: { minR: number; maxR: number; minA: number; maxA: number; warm?: number; soft?: boolean }) {
  const hit = tiles.get(key); if (hit) return hit;
  if (typeof document === 'undefined') return '';
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); if (!g) return '';
  let s = [...key].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) || 1;
  const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = 0; i < n; i++) {
    const x = rnd() * size, y = rnd() * size, r = o.minR + rnd() * (o.maxR - o.minR), a = o.minA + rnd() * (o.maxA - o.minA);
    const warm = rnd() < (o.warm ?? 0); const col = warm ? `255,${150 + Math.round(rnd() * 40)},${70 + Math.round(rnd() * 40)}` : rnd() < 0.15 ? '190,205,255' : '255,255,255';
    if (o.soft) { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    else { g.fillStyle = `rgba(${col},${a})`; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); if (r > 1.1) { g.fillStyle = `rgba(${col},${a * 0.18})`; g.beginPath(); g.arc(x, y, r * 3, 0, Math.PI * 2); g.fill(); } }
  }
  const url = c.toDataURL('image/png'); tiles.set(key, url); return url;
}

/** One layer: `f` is how fast it follows the camera (1 = with the board), `zf` how much a zoom rescales it. */
type Layer = { key: string; tile: number; f: number; zf: number; img: () => string };
const SPACE: Layer[] = [
  { key: 'dust', tile: 900, f: 0.08, zf: 0.15, img: () => starTile('dust', 900, 26, { minR: 40, maxR: 140, minA: 0.025, maxA: 0.06, warm: 0.5, soft: true }) },
  { key: 'far', tile: 520, f: 0.22, zf: 0.3, img: () => starTile('far', 520, 150, { minR: 0.35, maxR: 0.9, minA: 0.18, maxA: 0.55, warm: 0.06 }) },
  { key: 'near', tile: 760, f: 0.5, zf: 0.6, img: () => starTile('near', 760, 46, { minR: 0.7, maxR: 1.6, minA: 0.45, maxA: 0.9, warm: 0.18 }) },
];
const mod = (a: number, n: number) => ((a % n) + n) % n;

export function BoardBackground() {
  const editor = useEditor(); const look = useValue('board look', () => boardLookAtom.get(), []);
  const root = useRef<HTMLDivElement>(null);
  useQuickReactor('board background', () => {
    const el = root.current; if (!el) return; const c = editor.getCamera(); const z = c.z;
    for (const node of el.querySelectorAll<HTMLElement>('[data-f]')) {
      const f = Number(node.dataset.f), zf = Number(node.dataset.zf), base = Number(node.dataset.tile);
      /* the dot grid: one dot every 24 page px (96 when far out, so it never turns to noise) */
      const size = node.dataset.grid ? 24 * (z < 0.4 ? 4 : z < 0.8 ? 2 : 1) * z : base * Math.pow(z, zf);
      node.style.backgroundSize = `${size}px ${size}px`; node.style.inset = `${-size}px`;
      node.style.transform = `translate3d(${mod(c.x * z * f, size)}px,${mod(c.y * z * f, size)}px,0)`;
    }
  }, [editor, look]);
  return <div ref={root} className={`cv-bg look-${look}`} data-look={look} data-testid="cv-bg" aria-hidden>
    {look === 'space' && <><i className="cv-bg-glow" />{SPACE.map((l) => <i key={l.key} className={`cv-bg-layer cv-bg-${l.key}`} data-f={l.f} data-zf={l.zf} data-tile={l.tile} style={{ backgroundImage: `url(${l.img()})` }} />)}
      <i className="cv-bg-layer cv-bg-grid faint" data-grid="1" data-f={1} data-zf={1} data-tile={24} /></>}
    {look === 'haze' && <><i className="cv-bg-blob b1" /><i className="cv-bg-blob b2" /><i className="cv-bg-blob b3" /><i className="cv-bg-layer cv-bg-grid" data-grid="1" data-f={1} data-zf={1} data-tile={24} /></>}
    {look === 'night' && <><i className="cv-bg-layer cv-bg-grid" data-grid="1" data-f={1} data-zf={1} data-tile={24} /><i className="cv-bg-vignette" /></>}
  </div>;
}
export type { BoardLook };
