/**
 * The built-in job listeners for code that runs without booting (scripts and tests that import the queue directly): ETA learning and webhooks
 * on, as in the desktop profile. A booted server never uses these: its listeners come from the profile's plugins (ctx.jobs.on).
 */
import { onJobBuiltIn } from './jobEvents.js';
import { learnOnSettled } from '../plugins-builtin/eta-learning.js';
import { notifyOnSettled } from '../plugins-builtin/webhooks.js';

onJobBuiltIn('job/settled', learnOnSettled);
onJobBuiltIn('job/settled', notifyOnSettled);
