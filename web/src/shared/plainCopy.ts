import { LOCAL_LABEL } from '../../../server/src/shared/modelIds';
/** Server messages are written for API callers too ("Send resolution=768p…", route ids). Turn them into plain copy for people. */
const RULES: [RegExp, string | ((...m: string[]) => string)][] = [
  [/^This model has no (\w+) tier: \1 was mapped to (\w+)(?: \(quoted and charged as \2\))?\..*$/s, (_m, a, b) => `This model doesn’t offer ${a}, so it ran at ${b} (and was priced at ${b}).`],
  [/^Resolution must be one of ([\w\s,]+?)\.?$/, (_m, l) => `This model doesn’t offer that quality. Pick ${l.split(/\s*,\s*/).join(' or ')}.`],
  [/^Video and audio references are for Reference to video\.?$/, 'Video and audio references only work in Reference mode: remove the start frame to use them.'],
  [/^The image was ignored: this mode is prompt-only\.?$/, 'Your image wasn’t used: this mode works from the prompt only.'],
];
export function plainCopy(msg: string | null | undefined): string {
  if (!msg) return msg ?? '';
  let s = String(msg).trim();
  for (const [re, to] of RULES) { const m = s.match(re); if (m) return typeof to === 'string' ? to : to(...(m as unknown as string[])); }
  s = s.split(/(?<=\.)\s+/).filter(x => !/\b(send|pass|set)\s+[a-zA-Z]+=\S+/i.test(x) && !/\b[a-zA-Z]+=[\w.-]+\b/.test(x)).join(' ') || s; // drop "Send x=y to …" API hints
  s = s.replace(/\b(?:fal|replicate|comfy-cloud|comfy-router|direct|local|router):[\w./@-]+/g, 'this model');
  /* Model vs Run-on words (spec §2.1; copy wave 1): one name per place. "Comfy Cloud · partner API" and Comfy Router are Comfy Cloud; Local ComfyUI is Your computer. */
  s = s.replace(/Comfy Cloud\s*·\s*partner API/g, 'Comfy Cloud').replace(/\bComfy Router\b/g, 'Comfy Cloud').replace(/\bUse local ComfyUI\b/g, LOCAL_LABEL).replace(/\bLocal ComfyUI\b/g, LOCAL_LABEL).replace(/\bon this server\b/g, 'in this app');
  return s;
}

/** UI-COPY-RULES 1–3: true when a string reads like a developer note (endpoints, env vars, files, key=value, bind addresses).
 *  Show plain copy instead of rendering it. */
export const looksTechnical = (s?: string | null) => !!s && /\/api\/|\.env|\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b|\bHOST\b|\b(POST|GET|PUT|DELETE)\s+\/|127\.0\.0\.1|::1|\b[a-z][a-zA-Z]*=[^\s]+|\b[a-z]+-smi\b|(^|\s)\.?\/?[a-z]+\/[a-z_.\/-]+/.test(s);
