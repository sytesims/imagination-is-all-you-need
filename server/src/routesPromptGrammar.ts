/**
 * Prompt grammar, read-only (step 2, 2026-10-26): how each model expects its prompt and names its inputs (shared/promptGrammar.ts), with the
 * plain-words tip the app shows (shared/promptTips.ts) and the enhancer's guidance. For the MCP describe tool and anyone writing prompts by hand.
 *   GET /api/prompt-grammar                → { models: { <key>: tip } } (every model the app offers, compact)
 *   GET /api/models/:key/prompt-grammar    → the full entry (no internal code references) + tip + enhancerGuide + open mismatches
 */
import type { FastifyInstance } from 'fastify';
import { PROMPT_GRAMMAR, GRAMMAR_MISMATCHES, promptGrammarOf } from './shared/promptGrammar.js';
import { promptTipOf, enhancerGuide } from './shared/promptTips.js';
import { promptCap } from './shared/promptRefs.js';

/** The public view of one entry: facts, sources and the tip; the code references (repo file:line) stay internal. */
export function promptGrammarView(key: string) {
  const e = promptGrammarOf(key); if (!e) return null; const { code: _code, ...facts } = e;
  return { ...facts, maxChars: promptCap(key), tip: promptTipOf(key), enhancerGuide: enhancerGuide(key),
    knownIssues: GRAMMAR_MISMATCHES.filter((m) => m.status === 'open' && m.models.includes(key)).map((m) => ({ id: m.id, problem: m.problem })) };
}
export function registerPromptGrammar(app: FastifyInstance) {
  app.get('/api/prompt-grammar', async () => ({ models: Object.fromEntries(Object.keys(PROMPT_GRAMMAR).map((k) => [k, promptTipOf(k)])),
    note: 'refs = how @image1 / @video1 / @audio1 reach the model; the app rewrites them for you before sending. GET /api/models/{key}/prompt-grammar for sources and details.' }));
  app.get<{ Params: { key: string } }>('/api/models/:key/prompt-grammar', async (req, reply) => {
    const v = promptGrammarView(req.params.key); if (!v) return reply.code(404).send({ error: `Unknown model key "${req.params.key}"` }); return v; });
}
