/** Community samples (CC-BY clips from the Blender Foundation films) are not generations: they have no tool, prompt or prefill.
 *  Server shape: kind 'sample', sampleCredit string, toolId/toolName/prompt null (a job may carry toolId 'sample'). */
export const isSample = (x: any): boolean => !!x && (x.kind === 'sample' || (typeof x.sampleCredit === 'string' && !!x.sampleCredit.trim()) || x.toolId === 'sample');
export const sampleLabel = (x: any): string => (typeof x?.sampleCredit === 'string' && x.sampleCredit.trim()) || (typeof x?.sample?.label === 'string' && x.sample.label) || 'Sample · CC-BY Blender Foundation';
/** Server community routes are /community/<jobId>; the result overlay lives at /jobs/<jobId>. */
export const communityHref = (route: string | null | undefined, id?: string): string => {
  const m = /^\/community\/([^/?#]+)$/.exec(route ?? ''); if (m) return `/jobs/${m[1]}`;
  return route || (id ? `/jobs/${String(id).replace(/^job:/, '')}` : '/community');
};
