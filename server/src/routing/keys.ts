/** Key status only: never returns key values. */
import type { RouteDef } from './types.js';
import { config } from '../config.js';
import { env } from '../env.js';
import { getPrefs } from './prefs.js';
/** Tests/demos only, MOCK backend only: OPENHIGGSFIELD_MOCK_KEYS=1 (or PUT /api/me/routing {global:{mockKeys:true}}) treats the NATIVE hosted keys
 * (Comfy API, direct vendor APIs) as configured, i.e. the pre-routing behaviour where hosted runs were mocked. fal/Replicate still need real keys. */
export const mockKeys = () => config.backend === 'mock' && (/^(1|true|on|yes)$/i.test(env('MOCK_KEYS') ?? '') || getPrefs().global.mockKeys === true);
const NOT_MOCKED = new Set(['OPENHIGGSFIELD_FAL_KEY', 'OPENHIGGSFIELD_REPLICATE_API_TOKEN', 'OPENHIGGSFIELD_HF_TOKEN' /* a download token, never a sample */]);
export const keyConfigured = (envKey: string | null | undefined, aliases: string[] = []) =>
  !envKey || (mockKeys() && !NOT_MOCKED.has(envKey)) || [envKey, ...aliases].some((k) => !!process.env[k]?.trim());
export const keyValue = (r: Pick<RouteDef, 'envKey' | 'envAliases'>) =>
  r.envKey ? [r.envKey, ...(r.envAliases ?? [])].map((k) => process.env[k]?.trim()).find(Boolean) : undefined;
