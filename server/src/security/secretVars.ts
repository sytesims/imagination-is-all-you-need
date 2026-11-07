/** Which environment variables hold (or may hold) a secret: never in the settings snapshot, never printed, never passed to a child process. */
import { PROVIDER_KEY_VARS } from '../shared/providerKeys.js';

export const isSecretVar = (k: string) => PROVIDER_KEY_VARS.includes(k) || /KEY|TOKEN|SECRET|PASSW|CREDENTIAL|AUTH|COOKIE/i.test(k);
