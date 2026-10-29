/**
 * Constellations (2026-10-27): below 35% zoom on a board with more than 12 stars, the cards fade out and the board draws as a night sky on
 * the same dot grid. Each frame (or shot) is a small star cluster: tiny dots tinted by media (tokens.css --media-*), hairlines to the
 * cluster centre, the frame name under it; clusters join the idea note with faint dashed lines; the final film is ringed in gold; loose
 * cards are single stars. A click on a cluster glides into that frame at a readable zoom. The grouping is skyMap.ts (tested).
 *
 * Smooth by construction: ONE svg in tldraw's OnTheCanvas layer (already moved and scaled by the camera, so nothing here runs on pan or
 * zoom). It re-renders only when the board's shapes change or the zoom crosses the threshold. Dots are zero-length round lines; stroke widths
 * and labels size with tldraw's --tl-scale (1 / zoom, CSS only), so they stay the same size on screen at any zoom. The cards and the
 * sky cross-fade (200 ms; instant under reduced motion).
 */
import { useEffect, useMemo } from 'react';
import { useEditor, useValue, type Editor, type TLShape, type TLShapeId } from 'tldraw';
import { GEN_TYPE, RESULT_TYPE, UPLOAD_TYPE, PROMPT_TYPE, NOTE_TYPE } from './nodeTypes';
import { outKindOf } from './nodeLogic';
import { starMap, starsOn, zoomTarget, STAR_MIN, type StarFrame, type StarKind, type StarNode, type Star } from './skyMap';
import { reducedMotion } from './agentHand';

const FILM_NAME = /^\s*(the\s+)?(final\s+)?film\b|^\s*your film\b/i;
function kindOf(s: TLShape): StarKind | null {
  const p: any = s.props;
  if (s.type === GEN_TYPE) return outKindOf(s.type, p) ?? (p.medium === '3d' ? '3d' : 'image');
  if (s.type === RESULT_TYPE) return (['image', 'video', 'audio', '3d'].includes(p.kind) ? p.kind : 'image') as StarKind;
  if (s.type === UPLOAD_TYPE) return (['image', 'video', 'audio'].includes(p.mediaKind) ? p.mediaKind : 'image') as StarKind;
  if (s.type === PROMPT_TYPE || s.type === NOTE_TYPE || s.type === 'note' || s.type === 'text') return 'text';
  if (s.type === 'image' || s.type === 'video') return s.type;
  return null;
}
/** The board as stars and frames (page px). A shape belongs to the frame it sits in, else to the smallest frame its centre is inside. */
export function readSky(editor: Editor): { nodes: StarNode[]; frames: StarFrame[] } {
  const shapes = editor.getCurrentPageShapes();
  const frames: StarFrame[] = shapes.filter((s) => s.type === 'frame').map((s) => { const b = editor.getShapePageBounds(s.id)!; return { id: s.id, name: String((s.props as any).name ?? ''), x: b.x, y: b.y, w: b.w, h: b.h, order: s.index }; });
  const inFrame = (x: number, y: number) => frames.filter((f) => x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h).sort((a, b) => a.w * a.h - b.w * b.h)[0]?.id ?? null;
  const nodes: StarNode[] = [];
  for (const s of shapes) {
    if (s.type === 'frame' || s.type === 'arrow' || s.type === 'ohf-group') continue; const k = kindOf(s); if (!k) continue;
    const b = editor.getShapePageBounds(s.id); if (!b) continue; const meta: any = s.meta ?? {}; const name = typeof meta.name === 'string' ? meta.name : (s.props as any).title ?? null;
    const parent = editor.getShape(s.parentId as TLShapeId); const frameId = parent?.type === 'frame' ? parent.id : inFrame(b.midX, b.midY);
    nodes.push({ id: s.id, kind: k, x: b.x, y: b.y, w: b.w, h: b.h, order: `${parent?.type === 'frame' ? parent.index : ''}${s.index}`, frameId, name,
      film: meta.film === true || (FILM_NAME.test(String(name ?? '')) && (k === 'video')), idea: s.type === 'note' && meta.by === 'agent' });
  }
  return { nodes, frames };
}

const dot = (s: Pick<Star, 'x' | 'y'>, cls: string, key?: string) => <line key={key} className={cls} x1={s.x} y1={s.y} x2={s.x} y2={s.y} />;

/** Mounted in tldraw's OnTheCanvas slot (Board.tsx). */
export function Constellation() {
  const editor = useEditor();
  const sky = useValue('star map', () => { const r = readSky(editor); return r.nodes.length > STAR_MIN ? starMap(r.nodes, r.frames) : null; }, [editor]);
  const on = useValue('stars on', () => starsOn(editor.getZoomLevel(), sky?.count ?? 0), [editor, sky?.count]);
  /* the cards fade out while the sky fades in (classes on the board; the transitions live in canvas.css) */
  useEffect(() => { const board = editor.getContainer().closest('.cv-board') ?? editor.getContainer();
    board.classList.toggle('cv-stars-ready', !!sky); board.classList.toggle('cv-stars-on', !!sky && on);
    return () => { board.classList.remove('cv-stars-on'); }; }, [editor, sky, on]);
  useEffect(() => () => { (editor.getContainer().closest('.cv-board') ?? editor.getContainer()).classList.remove('cv-stars-ready'); }, [editor]);
  const glide = (box: { x: number; y: number; w: number; h: number }) => { const vs = editor.getViewportScreenBounds(); const t = zoomTarget(box, vs.w, vs.h);
    editor.setCamera({ x: t.x, y: t.y, z: t.z }, { animation: { duration: reducedMotion() ? 0 : 560 } }); };
  const body = useMemo(() => sky && <>
    {sky.links.map((l) => <line key={`l-${l.from}`} className="sky-link" x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />)}
    {sky.clusters.map((c) => <g key={c.id} className="sky-cl" data-testid="sky-cluster" data-cluster={c.id} role="button" tabIndex={-1} aria-label={`${c.label}: zoom in`}
      onPointerDown={(e) => { e.stopPropagation(); }} onPointerUp={(e) => { e.stopPropagation(); glide(c.box); }} onDoubleClick={(e) => { e.stopPropagation(); glide(c.box); }}>
      <rect className="sky-hit" x={c.box.x} y={c.box.y} width={c.box.w} height={c.box.h} rx={40} />
      {c.stars.map((s) => <line key={`h-${s.id}`} className="sky-hair" x1={c.cx} y1={c.cy} x2={s.x} y2={s.y} />)}
      {dot({ x: c.cx, y: c.cy }, 'sky-core')}
      {c.stars.map((s) => <g key={s.id}>{s.film && dot(s, 'sky-film')}{s.film && dot(s, 'sky-film-in')}{dot(s, `sky-star k-${s.kind}`)}</g>)}
      <text className="sky-label" x={c.cx} y={c.labelY}>{c.label}</text>
    </g>)}
    {sky.singles.map((s) => <g key={s.id} className="sky-single">{s.film && dot(s, 'sky-film')}{s.film && dot(s, 'sky-film-in')}{dot(s, `sky-star k-${s.kind}`)}</g>)}
    {sky.idea && <g className="sky-idea" data-testid="sky-idea">{dot(sky.idea, 'sky-idea-glow')}{dot(sky.idea, 'sky-idea-core')}</g>}
  </>, [sky]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!sky) return null;
  return <svg className={`cv-sky${on ? ' on' : ''}`} data-testid="cv-sky" data-on={on ? '1' : '0'} aria-hidden={!on}>{body}</svg>;
}
