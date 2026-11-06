/**
 * The built-in places for code that runs without booting (scripts and tests that import routing modules directly): every place on, with full
 * key access (ANY_KEY), as in the desktop profile. A booted server never uses these: its places come from the profile's plugins (ctx.places).
 * Loaded by routing/run.ts (the code that runs attempts), not by services/places.ts, so reading ctx.places never pulls the runners in early.
 */
import { setBuiltInPlaces } from './places.js';
import { localPlace } from '../plugins-builtin/place-comfy-local.js';
import { cloudPlace } from '../plugins-builtin/place-comfy-cloud.js';
import { routerPlace } from '../plugins-builtin/place-comfy-router.js';
import { falPlace } from '../plugins-builtin/place-fal.js';
import { replicatePlace } from '../plugins-builtin/place-replicate.js';
import { sunraPlace } from '../plugins-builtin/place-sunra.js';
import { directPlace } from '../plugins-builtin/place-direct.js';
import { samplePlace } from '../plugins-builtin/place-sample.js';

setBuiltInPlaces([localPlace, cloudPlace, routerPlace, falPlace, replicatePlace, sunraPlace, directPlace, samplePlace]);
