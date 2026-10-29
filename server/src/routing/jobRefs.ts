/**
 * The job's input as one model reads it (2026-10-26, prompt grammar step 2): which model a route serves, which place it runs on, and the input
 * copy with every prompt field rewritten by shared/promptRefs.ts. Used by every runner right before it builds a body (Router, direct labs, fal /
 * Replicate, local graphs) and by the prompt peek, so what you see is what is sent. The stored job keeps the words you typed.
 */
import { routeModelKey, modelKeyOf } from './modelRegistry.js';
import { withRefGrammar } from '../shared/promptRefs.js';
import { setPlanModelKey } from '../comfy/plans.js';

export type RefPlace = 'local' | 'router' | 'fal' | 'replicate' | 'direct';
/** Route kind → grammar place (shared/promptGrammar.ts `places`): Comfy Cloud workflows and deployments run the same graphs as local. */
export const placeOfKind = (kind: string | null | undefined): RefPlace => (kind === 'comfy-router' ? 'router' : kind === 'fal' ? 'fal' : kind === 'replicate' ? 'replicate' : kind === 'direct' ? 'direct' : 'local');
/** The model key a job runs on a route (or on its engine when no route is known). */
export const jobModelKey = (j: { toolId: string; provider: string; input?: Record<string, any> | null }, routeId?: string | null): string =>
  routeId ? routeModelKey(j.toolId, j.provider, routeId, j.input) : modelKeyOf(j.toolId, j.provider, j.input);
/** The job's input with its prompt fields in the model's own reference syntax. */
export const refInputFor = <T extends Record<string, any>>(j: { toolId: string; provider: string; input: T }, r?: { routeId: string; kind: string } | null): T =>
  withRefGrammar(j.input, jobModelKey(j, r?.routeId), placeOfKind(r?.kind ?? 'local'));

/** Local graphs (comfy/plans.ts buildPlan, and Comfy Cloud through it) rewrite with this same key. */
setPlanModelKey((j) => jobModelKey(j));
