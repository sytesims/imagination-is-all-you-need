import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
/** Which checkout an app runs from, as a short hash of its folder (never the path itself): /api/health.checkout. npm run setup and the doctor
 *  compare it with their own (scripts/app-env.mjs checkoutIdOf is the same formula) so a second copy already on the port isn't reported as this one. */
export const checkoutIdOf = (root: string): string => { let r = root; try { r = realpathSync(root); } catch { /* the path as given */ } return createHash('sha256').update(r).digest('hex').slice(0, 16); };
