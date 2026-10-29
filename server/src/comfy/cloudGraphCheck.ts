/**
 * Offline check of an API-format graph against a ComfyUI / Comfy Cloud object_info (2026-10-26, the Topaz rejection). It runs the checks Cloud's
 * submit validation runs, so a graph that fails here would be refused at POST /api/v2/jobs (and a graph that passes is shaped right):
 *  - every class exists; every required input is present (also the inputs a picked COMFY_DYNAMICCOMBO_V3 option adds, named "<parent>.<child>",
 *    as comfy_api/latest/_io.py finalize_prefix joins them);
 *  - links point at an existing node, an output index it has and a matching type;
 *  - COMBO / dynamic-combo values are in the list, numbers in range, booleans and strings of the right type;
 *  - an uploaded file reference ({"__type":"core/ASSET"} or our {__file} placeholder) sits only on a loader widget that takes uploads.
 * Unknown inputs are warnings (ComfyUI ignores them). No network: object_info comes from the caller (a saved copy in the tests).
 */
export interface GraphCheck { errors: string[]; warnings: string[] }
type Spec = [any, Record<string, any>?];

const isLink = (v: unknown): v is [string, number] => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && Number.isInteger(v[1]);
const isAssetRef = (v: any) => !!v && typeof v === 'object' && !Array.isArray(v) && (v.__type === 'core/ASSET' ? typeof v.info?.id === 'string' && !!v.info.id : typeof v.__file === 'string');
/** Choices of a COMBO spec, either shape: [[...options], meta] or ['COMBO', {options}]. null = not a combo. */
const comboOptions = (s: Spec): any[] | null => (Array.isArray(s[0]) ? s[0] : s[0] === 'COMBO' ? (s[1]?.options ?? []) : null);
const takesUpload = (s: Spec) => !!(s[1]?.video_upload || s[1]?.image_upload || s[1]?.audio_upload || s[1]?.upload);

export function checkCloudGraph(graph: Record<string, any>, objectInfo: Record<string, any>): GraphCheck {
  const errors: string[] = []; const warnings: string[] = [];
  for (const [id, node] of Object.entries<any>(graph)) {
    const where = `node ${id} (${node?.class_type})`; const def = objectInfo[node?.class_type];
    if (!def) { errors.push(`${where}: class not on this server`); continue; }
    const inputs: Record<string, any> = node.inputs ?? {}; const used = new Set<string>();
    const visit = (specs: Record<string, Spec>, required: boolean, prefix: string) => {
      for (const [name, spec] of Object.entries(specs ?? {})) {
        const key = prefix ? `${prefix}.${name}` : name; const has = Object.prototype.hasOwnProperty.call(inputs, key); const v = inputs[key];
        if (spec[0] === 'COMFY_AUTOGROW_V3' && !has) { used.add(key); /* falls through to the autogrow branch below */ }
        else if (!has) { if (required) errors.push(`${where}: required input "${key}" is missing`); continue; }
        used.add(key); const type = spec[0]; const meta = spec[1] ?? {};
        const multi = typeof type === 'string' && type.includes(',') ? type.split(',') : null; // "FLOAT,INT": a link of either type, or a plain value
        if (isLink(v)) { const src = graph[v[0]]; if (!src) { errors.push(`${where}: "${key}" links to missing node ${v[0]}`); continue; }
          const out: string[] = objectInfo[src.class_type]?.output ?? []; if (!objectInfo[src.class_type]) continue; // reported on that node
          if (v[1] >= out.length) { errors.push(`${where}: "${key}" links to output ${v[1]} of node ${v[0]}, which has ${out.length}`); continue; }
          const t = out[v[1]]; const want = Array.isArray(type) || type === 'COMBO' ? (comboOptions(spec) ? 'COMBO' : type) : type;
          const wild = (x: unknown) => x === '*' || x === 'COMFY_MATCHTYPE_V3'; // MatchType = a template: any type, matched at run time
          if (typeof want === 'string' && !wild(want) && !wild(t) && !String(want).split(',').includes(t) && !(want === 'COMBO' && (t === 'COMBO' || t === 'STRING')))
            errors.push(`${where}: "${key}" wants ${want} but node ${v[0]} output ${v[1]} is ${t}`);
          continue; }
        if (isAssetRef(v)) { if (!takesUpload(spec)) errors.push(`${where}: "${key}" holds an uploaded file but is not a loader widget that takes uploads`); continue; }
        if (type === 'COMFY_AUTOGROW_V3') { const t = meta.template ?? {}; const inner: [string, Spec] | undefined = Object.entries<Spec>({ ...t.input?.required, ...t.input?.optional })[0];
          const slots: string[] = Array.isArray(t.names) ? t.names : Array.from({ length: Number(t.max ?? 100) }, (_, n) => `${t.prefix ?? ''}${n}`);
          let n = 0; for (const s of slots) { const k = `${key}.${s}`; if (!Object.prototype.hasOwnProperty.call(inputs, k)) continue; n++; if (inner) visit({ [s]: inner[1] }, true, key); }
          if (n < Number(t.min ?? 0)) errors.push(`${where}: "${key}" needs at least ${t.min} entries, has ${n}`); continue; }
        if (type === 'COMFY_DYNAMICCOMBO_V3') { const opt = (meta.options ?? []).find((o: any) => o?.key === v);
          if (!opt) { errors.push(`${where}: "${key}" = ${JSON.stringify(v)} is not one of ${(meta.options ?? []).map((o: any) => o.key).join(' | ')}`); continue; }
          visit(opt.inputs?.required ?? {}, true, key); visit(opt.inputs?.optional ?? {}, false, key); continue; }
        const opts = comboOptions(spec);
        if (opts) { if (takesUpload(spec) && typeof v === 'string') continue; // a file name the plan replaces with an upload
          if (!opts.some((o: any) => (o && typeof o === 'object' ? o.key ?? o.value : o) === v)) errors.push(`${where}: "${key}" = ${JSON.stringify(v)} is not in the list (${opts.length} choices)`); continue; }
        if (multi) { if (!['number', 'boolean', 'string'].includes(typeof v)) errors.push(`${where}: "${key}" wants ${type}, got ${JSON.stringify(v)}`); continue; }
        if (type === 'INT' || type === 'FLOAT') { if (typeof v !== 'number' || (type === 'INT' && !Number.isInteger(v))) { errors.push(`${where}: "${key}" should be ${type}, got ${JSON.stringify(v)}`); continue; }
          if ((meta.min != null && v < meta.min) || (meta.max != null && v > meta.max)) errors.push(`${where}: "${key}" = ${v} is outside ${meta.min ?? '-∞'}…${meta.max ?? '∞'}`); continue; }
        if (type === 'BOOLEAN' && typeof v !== 'boolean') errors.push(`${where}: "${key}" should be BOOLEAN, got ${JSON.stringify(v)}`);
        else if (type === 'STRING' && typeof v !== 'string') errors.push(`${where}: "${key}" should be STRING, got ${JSON.stringify(v)}`);
        else if (!['BOOLEAN', 'STRING', 'INT', 'FLOAT', '*', 'COMFY_MATCHTYPE_V3'].includes(type) && typeof type === 'string') errors.push(`${where}: "${key}" wants a ${type} link, got a value`);
      }
    };
    visit(def.input?.required ?? {}, true, ''); visit(def.input?.optional ?? {}, false, '');
    for (const k of Object.keys(inputs)) if (!used.has(k)) (isAssetRef(inputs[k]) ? errors : warnings).push(`${where}: input "${k}" is not declared${isAssetRef(inputs[k]) ? ' (an uploaded file would be dropped)' : ' (ignored)'}`);
  }
  return { errors, warnings };
}
/** The node classes a set of graphs uses (to cut a small object_info fixture). */
export const graphClasses = (...graphs: Record<string, any>[]) => [...new Set(graphs.flatMap((g) => Object.values<any>(g).map((n) => n?.class_type).filter(Boolean)))].sort();
