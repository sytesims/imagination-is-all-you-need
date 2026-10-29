/**
 * Kit pieces for Direct a Shot (2026-10-26): the presets' set dressing and the "Add props" drawer place pieces from three files, loaded once
 * per page on first use and kept:
 *  - city: the open city's kit (web/public/models/open-city, KayKit City Builder Bits + Kenney City / Car / Nature kits; ids kk.* kc.* ks.* kv.* kn.*)
 *  - props: furniture, kitchen, forest and holiday pieces (web/public/models/kits/props.glb; ids fu.* re.* fo.* ho.*)
 *  - bottle: the product bottle with a blank label (web/public/models/kits/bottle.glb; id wb.bottle)
 * Every material is turned into a matte standard material and pulled into the brand palette (theme.ts gradeKit), once per source material,
 * so a piece looks the same in every scene. A piece can carry the subject colour (the sofa, the train, the bottle's band): tintPiece gives it
 * its own materials. Geometry is shared between clones.
 */
import { gradeKit } from './theme';
import { PROP_PIECES } from '../../../../server/src/shared/world/propCatalog';
import { KIT } from '../../../../server/src/shared/world/kitCatalog';

type T3 = typeof import('three');
export type KitFileId = 'city' | 'props' | 'bottle';
const URLS: Record<KitFileId, string> = { city: '/models/open-city/open-city.glb', props: '/models/kits/props.glb', bottle: '/models/kits/bottle.glb' };
/** which file a piece id lives in */
export const fileOf = (id: string): KitFileId | null => id === 'wb.bottle' ? 'bottle' : PROP_PIECES[id] ? 'props' : KIT[id] ? 'city' : null;
/** GLTFLoader cleans node names the way three's PropertyBinding does (no dots, brackets, colons or slashes; spaces → _) */
const nodeName = (id: string) => id.replace(/\s/g, '_').replace(/[[\].:/]/g, '');

const files = new Map<KitFileId, Promise<Map<string, any>>>(); const loaded = new Map<KitFileId, Map<string, any>>();
export function loadKitFile(T: T3, f: KitFileId): Promise<Map<string, any>> {
  let p = files.get(f);
  if (!p) { p = (async () => {
      const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/libs/meshopt_decoder.module.js')]);
      const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder); const g = await loader.loadAsync(URLS[f]); g.scene.updateMatrixWorld(true);
      const conv = new Map<any, any>(); const out = new Map<string, any>();
      const tops = f === 'bottle' ? [g.scene] : [...g.scene.children];
      for (const node of tops) {
        node.traverse((o: any) => { if (!o.isMesh) return; const src = o.material; let m = conv.get(src);
          if (!m) { m = f === 'bottle' ? src : new T.MeshStandardMaterial({ color: src.color?.getHex?.() ?? 0xffffff, map: src.map ?? null, roughness: 0.88, metalness: 0, side: src.side ?? T.FrontSide, transparent: !!src.transparent, alphaTest: src.alphaTest ?? 0 });
            if (m.map) m.map.colorSpace = T.SRGBColorSpace; if (f === 'bottle') { m.roughness = Math.max(0.35, m.roughness ?? 0.5); m.metalness = 0; }
            gradeKit(T, m); m.userData.kitSrc = true; conv.set(src, m); }
          o.material = m; o.castShadow = true; o.receiveShadow = true; });
        /* the node keeps the kit's own scale (kit units → metres); a placement scales the wrapper around it. The bottle file is one piece. */
        node.position.set(0, 0, 0); node.rotation.set(0, 0, 0); const wrap = new T.Group(); wrap.add(node); out.set(f === 'bottle' ? 'wbbottle' : node.name, wrap); }
      loaded.set(f, out); return out; })().catch((e) => { files.delete(f); throw e; });
    files.set(f, p); }
  return p;
}
/** load every file these pieces need */
export const loadPieces = (T: T3, ids: string[]) => Promise.all([...new Set(ids.map(fileOf).filter(Boolean) as KitFileId[])].map((f) => loadKitFile(T, f))).then(() => undefined);
/** a new copy of a piece (shared geometry and materials), or null when its file isn't loaded yet or the id is unknown */
export function piece(id: string): any | null {
  const f = fileOf(id); const src = f ? loaded.get(f)?.get(nodeName(id)) : null; if (!src) return null;
  const c = src.clone(true); c.userData.piece = id; return c;
}
/** place a piece: position, turn about y (radians), uniform or per-axis scale; returns the object (null while not loaded) */
export function placePiece(g: any, id: string, x: number, y: number, z: number, r = 0, s: number | [number, number, number] = 1) {
  const o = piece(id); if (!o) return null; o.position.set(x, y, z); o.rotation.y = r; if (Array.isArray(s)) o.scale.set(...s); else o.scale.setScalar(s); g.add(o); return o;
}
/** give a placed piece its own materials that carry the subject colour: key = the kit colour to replace (sRGB), or every colour (all) */
export function tintPiece(T: T3, o: any, tint: number | string, opt: { key?: number; tol?: number; all?: boolean } = {}) {
  const made = new Map<any, any>(); const setters: { setTint(h: number | string): void }[] = [];
  o.traverse((m: any) => { if (!m.isMesh) return; let n = made.get(m.material);
    if (!n) { const src = m.material; n = src.clone(); n.onBeforeCompile = () => undefined; n.customProgramCacheKey = () => '';
      setters.push(gradeKit(T, n, opt.all ? { all: true, tint } : { key: opt.key, tol: opt.tol, tint })); made.set(src, n); }
    m.material = n; });
  return { setTint: (h: number | string) => setters.forEach((s) => s.setTint(h)), dispose: () => made.forEach((m) => m.dispose()) };
}
