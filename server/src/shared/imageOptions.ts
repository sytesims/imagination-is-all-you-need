/**
 * Model options (2026-10-24): the extra request fields a hosted image model documents beyond shape / size / quality, as one shared list
 * per model (shared/imageCaps.ts `options`). The bar renders them in its Settings popover (web/src/shared/ModelOptions.tsx), the job
 * endpoint checks them here (tools/media.ts) and the Router body reads the checked values from job.input.options (routing/routerModels.ts).
 * None of these change the price (the docs price these models per image), so the quote stays the shape / size / quality one.
 * Isomorphic, no imports.
 */
export type OptionValue = string | number | boolean | string[];
export interface ModelOption {
  /** Key in job.input.options; the form field is opt_<key> (optField). */ key: string;
  /** choice = one of `choices`; switch = on / off; level = a whole number min…max, or the model's own pick when unset; color = one #RRGGBB;
   *  colors = up to `max` #RRGGBB values (comma separated in the form); text = a short free text (up to `max` characters, default TEXT_OPTION_MAX). */
  kind: 'choice' | 'switch' | 'level' | 'color' | 'colors' | 'text';
  label: string; hint?: string;
  /** Shown (and sent) only while this switch option is on (FIBO's Structured fields). */ when?: string;
  /** text: the grey hint inside the empty field. */ placeholder?: string;
  choices?: { value: string; label: string; hint?: string }[];
  min?: number; max?: number;
  /** The value the model uses when the field is left out (shown as picked; never sent). null = the model decides. */
  default: OptionValue | null;
}
export interface ModelOptions { /** Section title in Settings ("Style"). */ label: string; options: ModelOption[]; /** Docs page(s) the fields follow. */ source: string }

export const optField = (key: string) => `opt_${key}`;
/** Longest text option we send. */
export const TEXT_OPTION_MAX = 300;
export const HEX = /^#[0-9a-f]{6}$/i;
export const hexToRgb = (h: string): [number, number, number] => [0, 2, 4].map((k) => parseInt(h.slice(1 + k, 3 + k), 16)) as [number, number, number];

/** Check the opt_* form fields against the model's list. Empty / missing = left out (the model's default). Unknown opt_* fields are refused,
 *  so a typo never silently does nothing. Returns only the values that were set. */
export function readModelOptions(spec: ModelOptions | null | undefined, fields: Record<string, unknown>):
  { ok: true; values: Record<string, OptionValue> } | { ok: false; field: string; message: string } {
  const values: Record<string, OptionValue> = {};
  const given = Object.keys(fields).filter((k) => k.startsWith('opt_') && String(fields[k] ?? '').trim() !== '');
  for (const k of given) if (!spec?.options.some((o) => optField(o.key) === k)) return { ok: false, field: k, message: `This model has no ${k.slice(4)} option.` };
  for (const o of spec?.options ?? []) {
    const raw = String(fields[optField(o.key)] ?? '').trim(); if (!raw) continue; const f = optField(o.key);
    if (o.kind === 'choice') { if (!o.choices?.some((c) => c.value === raw)) return { ok: false, field: f, message: `${o.label}: pick one of ${o.choices?.map((c) => c.label).join(', ')}.` }; values[o.key] = raw; }
    else if (o.kind === 'switch') { if (!/^(1|0|true|false|on|off|yes|no)$/i.test(raw)) return { ok: false, field: f, message: `${o.label}: use on or off.` }; values[o.key] = /^(1|true|on|yes)$/i.test(raw); }
    else if (o.kind === 'level') { const n = Number(raw); if (!Number.isInteger(n) || n < (o.min ?? 0) || n > (o.max ?? 10)) return { ok: false, field: f, message: `${o.label}: a whole number from ${o.min ?? 0} to ${o.max ?? 10}.` }; values[o.key] = n; }
    else if (o.kind === 'text') { const max = o.max ?? TEXT_OPTION_MAX; if (raw.length > max) return { ok: false, field: f, message: `${o.label}: up to ${max} characters.` }; values[o.key] = raw; }
    else if (o.kind === 'color') { if (!HEX.test(raw)) return { ok: false, field: f, message: `${o.label}: a colour like #FF6A00.` }; values[o.key] = raw.toUpperCase(); }
    else { const xs = raw.split(',').map((s) => s.trim()).filter(Boolean); const max = o.max ?? 3;
      if (xs.length > max || xs.some((x) => !HEX.test(x))) return { ok: false, field: f, message: `${o.label}: up to ${max} colours like #FF6A00, separated by commas.` }; values[o.key] = xs.map((x) => x.toUpperCase()); }
  }
  return { ok: true, values };
}
/** The checked values a job carries (job.input.options), or {} for an old job / another model. */
export const optionsOf = (i: Record<string, any>): Record<string, OptionValue> => (i && typeof i.options === 'object' && i.options && !Array.isArray(i.options) ? i.options : {});

// ---- the per-model lists (cited docs pages are the local docs.comfy.org copy: development/comfy-router/models/...) ----
/** Luma UNI-1 / UNI-1 Max: style "auto" | "manga" (models/luma_2/uni-1 and uni-1-max, Input: style). */
export const LUMA_OPTIONS: ModelOptions = { label: 'Style', source: 'docs.comfy.org/development/comfy-router/models/luma_2/uni-1 (style)', options: [
  { key: 'style', kind: 'choice', label: 'Look', default: 'auto', choices: [
    { value: 'auto', label: 'Auto', hint: 'The model picks the look' }, { value: 'manga', label: 'Manga', hint: 'Japanese comic art' }] }] };
/** Recraft V4 / V4.1 / V4.1 Pro: controls.artistic_level 0–5, controls.no_text, controls.background_color.rgb, controls.colors[].rgb
 *  (models/recraft/recraftv4, recraftv4-1, recraftv4-1-pro: the same schema). `style` (a V3 preset name) and `style_id` (a UUID minted with
 *  POST /proxy/recraft/styles) are left out: the V4 node offers no style presets, and a style id needs a style made first. */
export const RECRAFT_OPTIONS: ModelOptions = { label: 'Style', source: 'docs.comfy.org/development/comfy-router/models/recraft/recraftv4 (controls)', options: [
  { key: 'artisticLevel', kind: 'level', label: 'Artistic level', hint: '0 is calm and clean, 5 is bold and full of movement', min: 0, max: 5, default: null },
  { key: 'noText', kind: 'switch', label: 'No text', hint: 'Keeps words and lettering out of the image', default: false },
  { key: 'background', kind: 'color', label: 'Background colour', default: null },
  { key: 'colors', kind: 'colors', label: 'Colours to use', hint: 'Up to 3 colours the image leans on', max: 3, default: null }] };
/** Bria FIBO 2.0 (Comfy Router bria/image and bria/fibo): FIBO reads a structured JSON caption (Bria's Visual GenAI Language, VGL). Off = the plain prompt is sent
 *  and Bria writes the caption itself. On = we send our own caption (structured_prompt on a new image, structured_instruction on an edit) built from these
 *  fields by fiboStructured; Subject left empty = the prompt. Keys follow the bria-vgl output schemas (github.com/Bria-AI/vgl, dialects/thales/output_schema). */
export const FIBO_OPTIONS: ModelOptions = { label: 'Structured prompt', source: 'docs.comfy.org/development/comfy-router/models/bria/image + bria/fibo (structured_prompt, structured_instruction); github.com/Bria-AI/vgl output_schema', options: [
  { key: 'structured', kind: 'switch', label: 'Structured', hint: 'Send your own subject, camera, light, composition and style fields', default: false },
  { key: 'subject', kind: 'text', label: 'Subject', when: 'structured', placeholder: 'Your prompt', default: null },
  { key: 'camera', kind: 'text', label: 'Camera', when: 'structured', placeholder: 'Low angle, 35 mm', default: null },
  { key: 'lighting', kind: 'text', label: 'Lighting', when: 'structured', placeholder: 'Soft window light from the left', default: null },
  { key: 'composition', kind: 'text', label: 'Composition', when: 'structured', placeholder: 'Centred, lots of space above', default: null },
  { key: 'style', kind: 'text', label: 'Style', when: 'structured', placeholder: 'Film photo, warm colours', default: null }] };
/** The structured caption for a FIBO job (null when Structured is off). Every top-level field of the VGL schema is present; the ones we don't fill stay empty,
 *  like Bria's own empty caption. An edit adds edit_instruction (the prompt). */
export function fiboStructured(prompt: string, o: Record<string, OptionValue>, edit: boolean): string | null {
  if (o.structured !== true) return null; const t = (k: string) => (typeof o[k] === 'string' ? String(o[k]).trim() : '');
  const subject = t('subject') || prompt.trim();
  const vgl: Record<string, unknown> = { short_description: subject, objects: subject ? [{ description: subject }] : [], background_setting: '',
    lighting: { conditions: t('lighting'), direction: '', shadows: '' }, aesthetics: { composition: t('composition'), color_scheme: '', mood_atmosphere: '' },
    photographic_characteristics: { depth_of_field: '', focus: '', camera_angle: t('camera'), lens_focal_length: '' },
    style_medium: t('style'), text_render: [], context: '', artistic_style: t('style') };
  if (edit) vgl.edit_instruction = prompt.trim();
  return JSON.stringify(vgl);
}
