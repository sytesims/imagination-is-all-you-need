/**
 * Layout boxes for FLUX 3 (2026-10-27): "put this thing here". Isomorphic (no server imports), so a box tool on the web can share the rules.
 * A job's `boxes` field: a list of { label, box: [top, left, bottom, right] } on BFL's 0–1000 grid (black-forest-labs/flux-3-image-klein: bbox
 * [ymin, xmin, ymax, xmax], 0–1000), background first, foreground last. An empty list (or none) changes nothing: same prompt, same graph.
 *  - FLUX 3 Klein, local route: the official core nodes CreateBoundingBoxes (bboxes = these boxes as BFL elements, JSON) → Flux3LayoutPrompt, as in
 *    the official image_flux3_klein_distilled_* templates (comfy/flux3Klein.ts). Box N is <obj_N> in the prompt.
 *  - FLUX 3 Image (api-flux3-image, Comfy Router and BFL API): the rows the FLUX 3 Image partner node appends to the prompt
 *    (comfy_api_nodes/nodes_bfl.py _flux3_box_rows: {"id": "box_N", "bbox": [...], "desc": ...}); the prompt cap (15,000) counts them.
 * Docs: https://docs.comfy.org/tutorials/flux/flux-3-klein, https://docs.comfy.org/tutorials/partner-nodes/black-forest-labs/flux-3-image (bounding box edit).
 */
export type Bbox = [number, number, number, number];
export interface LayoutBox { label: string; box: Bbox }
/** Our cap per job (the nodes set none); each box adds a row to the prompt. */
export const LAYOUT_BOXES_MAX = 20;
export const LAYOUT_BOX_LABEL_MAX = 300;
/** Models (create-image provider ids) whose routes take layout boxes, and which of their places do. */
export const LAYOUT_BOX_MODELS: Record<string, { routes: 'local' | 'all'; name: string }> = {
  'comfy-flux3-klein': { routes: 'local', name: 'FLUX 3 Klein' },
  'api-flux3-image': { routes: 'all', name: 'FLUX 3 Image' },
};
/** FLUX 3 Image's prompt cap, box rows included (nodes_bfl.py _FLUX3_IMAGE_MAX_PROMPT_LENGTH). */
export const FLUX3_IMAGE_PROMPT_MAX = 15000;
export const LAYOUT_BOXES_LOCAL_ONLY = 'Layout boxes run on FLUX 3 Klein on your computer (Local)';
type Parsed = { ok: true; boxes: LayoutBox[] } | { ok: false; message: string };
/** The `boxes` field (a JSON string from a form, or an array) → checked boxes. Empty / missing → []. */
export function parseLayoutBoxes(v: unknown): Parsed {
  if (v == null || v === '') return { ok: true, boxes: [] };
  let raw: unknown = v; if (typeof v === 'string') { try { raw = JSON.parse(v); } catch { return { ok: false, message: 'Layout boxes: send a JSON list of {label, box: [top, left, bottom, right]} on 0–1000.' }; } }
  if (!Array.isArray(raw)) return { ok: false, message: 'Layout boxes: send a list of {label, box: [top, left, bottom, right]} on 0–1000.' };
  if (raw.length > LAYOUT_BOXES_MAX) return { ok: false, message: `Layout boxes: up to ${LAYOUT_BOXES_MAX} boxes (you sent ${raw.length}).` };
  const boxes: LayoutBox[] = [];
  for (const [k, b] of raw.entries()) {
    const n = k + 1; const o = b as { label?: unknown; box?: unknown };
    const label = typeof o?.label === 'string' ? o.label.trim().replace(/\s+/g, ' ') : '';
    if (!label) return { ok: false, message: `Layout box ${n}: say what goes in it (label).` };
    if (label.length > LAYOUT_BOX_LABEL_MAX) return { ok: false, message: `Layout box ${n}: the label is up to ${LAYOUT_BOX_LABEL_MAX} characters.` };
    const box = o?.box; if (!Array.isArray(box) || box.length !== 4 || !box.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1000))
      return { ok: false, message: `Layout box ${n}: box is [top, left, bottom, right], each 0–1000.` };
    const [t, l, bt, r] = box.map((x: number) => Math.round(x)) as Bbox;
    if (bt <= t || r <= l) return { ok: false, message: `Layout box ${n}: bottom must be below top and right past left.` };
    boxes.push({ label, box: [t, l, bt, r] });
  }
  return { ok: true, boxes };
}
/** CreateBoundingBoxes `bboxes` input: BFL prompt elements, as JSON text (the node reads a JSON string of elements). */
export const flux3LayoutElementsJson = (boxes: LayoutBox[]) => JSON.stringify(boxes.map((b) => ({ type: 'obj', bbox: b.box, desc: b.label })));
/** FLUX 3 Image: the prompt plus the partner node's box rows. No boxes → the prompt unchanged. */
export const withFlux3BoxRows = (prompt: string, boxes: LayoutBox[] | null | undefined): string =>
  boxes?.length ? `${prompt.trimEnd()} ${JSON.stringify(boxes.map((b, k) => ({ id: `box_${k + 1}`, bbox: b.box, desc: b.label })))}` : prompt;
