/**
 * Black Forest Labs async client, built only from BFL's public docs (read 2026-10-17):
 *   submit  POST https://api.bfl.ai/v1/<endpoint>  header x-key  → { id, polling_url }
 *   poll    GET  polling_url  header x-key  → { status: Pending|Ready|Error|Failed|Request Moderated|Content Moderated|Task not found, result.sample }
 * Since batch 1 of the direct providers (2026-10-23) this is a thin wrapper over the generic runner (providers/direct.ts directRun + the BFL
 * spec in providers/directSpecs.ts): same requests, headers, poll pace (1.5 s), timeout and cost reports as before.
 * The result URL is signed and short-lived: download it right away.
 */
import type { HttpRequest } from '../hostedRequests.js';
import { directRun } from './direct.js';
import { bflSpec } from './directSpecs.js';
type Fetch = typeof fetch;
export interface BflHooks { timeoutMs?: number; pollMs?: number; onSubmit?: (id: string) => void; onStatus?: (status: string) => void; /** BFL's reported cost in credits (submit estimate, then the settled cost on Ready). */ onCost?: (credits: number, settled: boolean) => void; f?: Fetch }
export async function bflRun(req: HttpRequest, key: string, o: BflHooks = {}): Promise<{ id: string; url: string }> {
  const r = await directRun(bflSpec(async () => req), req, key, { timeoutMs: o.timeoutMs, pollMs: o.pollMs, onSubmit: o.onSubmit, onStatus: o.onStatus, f: o.f, onCost: (c) => o.onCost?.(c.units ?? Math.round(c.usd * 100), c.settled) });
  return { id: r.id!, url: r.outputs[0].url! };
}
