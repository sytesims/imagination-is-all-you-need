/**
 * What a GLB holds, read from its JSON chunk only (no geometry is decoded): triangle and vertex counts, whether it has textures, PBR maps,
 * file size. Used by the 3D feed cards ("12k faces · textured") and GET /api/3d/meta. Cached per file path + mtime.
 */
import { open, stat } from 'node:fs/promises';

export interface GlbInfo { bytes: number; faces: number | null; vertices: number | null; meshes: number; textured: boolean; pbr: boolean; materials: number; images: number; valid: boolean }
const cache = new Map<string, { mtime: number; info: GlbInfo }>();
const MODES_TRI = new Set([4, undefined]); // TRIANGLES (default)

/** Counts from a glTF JSON object (exported for tests). */
export function gltfCounts(g: any, bytes = 0): GlbInfo {
  let faces = 0, vertices = 0, known = true;
  for (const m of g?.meshes ?? []) for (const p of m?.primitives ?? []) {
    const pos = g.accessors?.[p?.attributes?.POSITION]; const idx = p?.indices != null ? g.accessors?.[p.indices] : null;
    if (pos?.count) vertices += pos.count; else known = false;
    if (!MODES_TRI.has(p?.mode)) continue; // points / lines: no faces
    const n = idx?.count ?? pos?.count; if (n) faces += Math.floor(n / 3); else known = false;
    if (p?.extensions?.KHR_draco_mesh_compression && !idx) known = false;
  }
  const mats: any[] = g?.materials ?? [];
  const pbr = mats.some((m) => m?.pbrMetallicRoughness?.metallicRoughnessTexture || m?.normalTexture || m?.occlusionTexture);
  return { bytes, faces: known ? faces : faces || null, vertices: known ? vertices : vertices || null, meshes: (g?.meshes ?? []).length, textured: (g?.textures ?? []).length > 0 || (g?.images ?? []).length > 0, pbr, materials: mats.length, images: (g?.images ?? []).length, valid: true };
}
/** Read a .glb's header and JSON chunk. Invalid files → valid:false (never throws). */
export async function glbInfo(file: string): Promise<GlbInfo> {
  const bad = (bytes = 0): GlbInfo => ({ bytes, faces: null, vertices: null, meshes: 0, textured: false, pbr: false, materials: 0, images: 0, valid: false });
  let st; try { st = await stat(file); } catch { return bad(); }
  const hit = cache.get(file); if (hit && hit.mtime === st.mtimeMs) return hit.info;
  const fh = await open(file, 'r').catch(() => null); if (!fh) return bad(st.size);
  try {
    const head = Buffer.alloc(20); await fh.read(head, 0, 20, 0);
    if (head.readUInt32LE(0) !== 0x46546c67 || head.readUInt32LE(16) !== 0x4e4f534a) return bad(st.size); // 'glTF' magic, first chunk JSON
    const len = head.readUInt32LE(12); if (len <= 0 || len > 64 * 1024 * 1024) return bad(st.size);
    const json = Buffer.alloc(len); await fh.read(json, 0, len, 20);
    const info = gltfCounts(JSON.parse(json.toString('utf8')), st.size); cache.set(file, { mtime: st.mtimeMs, info }); return info;
  } catch { return bad(st.size); } finally { await fh.close(); }
}
