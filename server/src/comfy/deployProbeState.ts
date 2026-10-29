/** H3 runner Step 3: the last free check of the user's Comfy deployment (written by comfy/deploy.ts probeDeploy), in its own module so plan builders
 *  registered in cloudWorkflows.ts can read it without an import cycle (deploy.ts → cloudWorkflows.ts → comfy/crossview.ts). */
export type ProbeRecipe = { id: string; label: string; ready: boolean | null; missingNodes: string[]; missingModels: string[] };
export type ProbeSnapshot = { nodes: { checked: boolean }; recipes: ProbeRecipe[] };
let last: any = null;
export const lastProbeState = <T = ProbeSnapshot>(): T | null => last;
export const setLastProbeState = <T>(p: T): T => (last = p);
