/**
 * The built-in places for code that runs without booting (scripts and tests that import routing modules directly): every place on, with the
 * core's key access (kernel/coreKeys.ts CORE_KEYS), as in the desktop profile. A booted server never uses these: its places come from the
 * profile's plugins (ctx.places), each with only its own declared keys. The plugins themselves export only their factory (xPlaceOf(keys)),
 * never a runner with every key.
 * Loaded by routing/run.ts (the code that runs attempts), not by services/places.ts, so reading ctx.places never pulls the runners in early.
 */
import { setBuiltInPlaces } from './places.js';
import { CORE_KEYS } from '../kernel/coreKeys.js';
import { localPlaceOf } from '../plugins-builtin/place-comfy-local.js';
import { cloudPlaceOf } from '../plugins-builtin/place-comfy-cloud.js';
import { routerPlaceOf } from '../plugins-builtin/place-comfy-router.js';
import { falPlaceOf } from '../plugins-builtin/place-fal.js';
import { replicatePlaceOf } from '../plugins-builtin/place-replicate.js';
import { sunraPlaceOf } from '../plugins-builtin/place-sunra.js';
import { directPlaceOf } from '../plugins-builtin/place-direct.js';
import { samplePlaceOf } from '../plugins-builtin/place-sample.js';

setBuiltInPlaces([localPlaceOf, cloudPlaceOf, routerPlaceOf, falPlaceOf, replicatePlaceOf, sunraPlaceOf, directPlaceOf, samplePlaceOf].map((of) => of(CORE_KEYS)));
