/**
 * hosted-grant: on a hosted demo (OPENHIGGSFIELD_HOSTED=1), a new account gets a one-time signup grant of credits through the ledger
 * (ledger.ts ensureSignupGrant, unchanged: once per account, never again). Elsewhere it does nothing. Leave it out of the profile and no
 * signup credits are given.
 */
import { definePlugin } from '../kernel/index.js';
import { ensureSignupGrant } from '../ledger.js';

export default definePlugin({
  name: 'hosted-grant', inject: ['spend'],
  apply(ctx) { ctx.spend.feature('hosted-grant'); ensureSignupGrant(); },
});
