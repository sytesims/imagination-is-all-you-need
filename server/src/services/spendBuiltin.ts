/**
 * The built-in money checks and quote steps for code that runs without booting (scripts and tests that import the money modules directly):
 * the monthly limit, team mode and agent budgets on, as in the desktop profile. A booted server never uses these: its checks come from the
 * profile's plugins (ctx.spend, ctx.pricing). Loaded by spendGuard.ts, so reading services/spend.ts never pulls the plugins in early.
 */
import { spend } from './spend.js';
import { pricing } from './pricing.js';
import { capCheck, capStep } from '../plugins-builtin/spend-cap.js';
import { balanceCheck } from '../plugins-builtin/billing-team-mode.js';
import { budgetCheck, budgetStep } from '../plugins-builtin/agent-budgets.js';

spend.setBuiltIn([capCheck, balanceCheck, budgetCheck]);
pricing.setBuiltIn([capStep, budgetStep]);
