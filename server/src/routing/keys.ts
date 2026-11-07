/** Key status only: never returns key values. The key functions live in kernel/keys.ts (ctx.keys); they are re-exported here for code
 *  that has no ctx yet (full access, as before). */
import { config } from '../config.js';
import { env } from '../env.js';
import { getPrefs } from './prefs.js';
export { keyConfigured, keyValue } from '../kernel/keys.js';
/** Tests/demos only, MOCK backend only: OPENHIGGSFIELD_MOCK_KEYS=1 (or PUT /api/me/routing {global:{mockKeys:true}}) treats the NATIVE hosted keys
 * (Comfy API, direct vendor APIs) as configured, i.e. the pre-routing behaviour where hosted runs were mocked. fal/Replicate still need real keys. */
export const mockKeys = () => config.backend === 'mock' && (/^(1|true|on|yes)$/i.test(env('MOCK_KEYS') ?? '') || getPrefs().global.mockKeys === true);
export const NOT_MOCKED: ReadonlySet<string> = new Set(['OPENHIGGSFIELD_FAL_KEY', 'OPENHIGGSFIELD_REPLICATE_API_TOKEN', 'OPENHIGGSFIELD_SUNRA_KEY', 'OPENHIGGSFIELD_KIE_KEY', 'OPENHIGGSFIELD_RUNPOD_API_KEY', 'OPENHIGGSFIELD_HF_TOKEN' /* a download token, never a sample */]);
/** Hosted requests are real: any backend but mock, or mock with OPENHIGGSFIELD_ROUTING_LIVE=1 (tests that stub the provider). */
export const liveBackend = () => config.backend !== 'mock' || /^(1|true)$/i.test(env('ROUTING_LIVE') ?? '');
