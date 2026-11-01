/**
 * Where a 3D model faces and where the camera starts (2026-11-02), pure, shared by the 3D viewer, the card poster maker and their test.
 * model-viewer's camera: theta 0° looks from +Z, 90° from +X. Scenario's examples (and most GLBs) face +Z (front 0°). Tripo 3.1 faces +X
 * (front 90°): its documented default export axis, checked on jobs 092abb03, 8828109d and 03b260da (single picture and multiview).
 * The start view is 30° off the front (a 3/4 view that still shows the face), slightly above, with a margin so the viewer's tool bar never covers the feet.
 */
const FRONT_BY_PROVIDER: Record<string, number> = { 'cloud-tripo-31': 90 };
/** The camera theta (degrees) of a model's front: its provider's axis, else 0 (+Z). */
export const frontOf = (j: { provider?: string | null } | null | undefined): number => (j?.provider ? FRONT_BY_PROVIDER[j.provider] ?? 0 : 0);
/** model-viewer camera-orbit for a model whose front is at `frontDeg`. */
export const orbitFor = (frontDeg: number, off = -30): string => `${(((frontDeg + off) % 360) + 360) % 360}deg 75deg 120%`;
/** The start view of any model (a job's, an upload, a rig, an example): 30° off the front of a +Z model. */
export const START_ORBIT = orbitFor(0);
/** The start view of a job's model. */
export const startOrbitOf = (j: { provider?: string | null } | null | undefined): string => orbitFor(frontOf(j));

/** The card poster's framing version. Posters saved before it (older start views showed some Tripo models side-on) are made again. */
export const POSTER_V = 2;
/** The card still for a 3D job: the poster the viewer saved (threeD.posterUrl / outputs[0].posterUrl), else null. */
export const posterOf3d = (j: any): string | null => j?.threeD?.posterUrl ?? j?.outputs?.[0]?.posterUrl ?? null;
/** The card still needs (re)making: none yet, or one from before POSTER_V (not a sample's: those ship with the app; not a rig's: its own still). */
export const posterStale = (j: any): boolean => !posterOf3d(j) || (!j?.demo && !j?.input?.rig && j?.threeD?.posterV !== POSTER_V);
