# Our parkour clips

Hand-keyed moves for the actor's mannequin (Quaternius' Universal Animation Library skeleton, same bone names), shipped as
`web/public/models/mannequin/parkour.glb` (about 0.1 MB) with the list in `web/src/shared/previz/parkourClips.ts`.
Preview them at `/moves.html` (dev server). Our own keyframes, CC0 like the mannequin.

| id | move | key | made for |
|---|---|---|---|
| vault | Speed vault: one hand on the rail, legs swing over to the side | 7 | rail 0.8–1.15 m, 1.6 m ahead |
| kong | Kong vault: dive, both hands, tuck through | 8 | box 0.8–1.2 m, 1.5 m ahead |
| climb | Ledge climb: jump, grab, feet on the wall, pull up, stand | 9 | ledge 1.7–2.2 m, 0.9 m ahead |
| wallrun | Wall run: three steps along a wall on the left, kick off | 0 | wall 0.5–1 m to the left, 4 m long |
| frontflip | Front flip: hurdle, two-foot punch, tuck | T | 3.2 m clear ground |
| sideflip | Side flip: the same takeoff, turning over sideways | Y | 3.2 m clear ground |
| droproll | Drop from a ledge, land, forward roll, run on | G | drop 1.2–3 m |
| catleap | Cat leap to a wall, hang, climb up | C | wall 2–2.5 m, 1.7 m ahead |

Every clip carries root motion on the `root` bone (where the person stands), timing marks (`contacts`) and the obstacle it was keyed
against (`props`). `shared/previz/parkour.ts` loads and plays them (in place or with root motion) and has `pickParkour(kind, height)`.

## Remake
1. `clips.py`: the key poses (person's frame: forward, up, left; joint angles in degrees). `rig.py`: the posing kit (snap a body part to a
   surface, pin a hand or foot with two-bone IK, bake). `stage.py`: preview renders.
2. Blender 4.2+ (tested 5.2):
   `Blender -b --python scripts/assets/parkour/author.py -- --src UAL1_Standard.glb --out parkour-raw.glb --meta meta.json [--preview DIR]`
   (`UAL1_Standard.glb` is in the library's Unreal-Godot folder.)
3. Pack (gltf-transform installed outside the repo, as for optimize-mannequin.mjs):
   `node scripts/assets/parkour/pack.mjs parkour-raw.glb meta.json web/public/models/mannequin/parkour.glb web/src/shared/previz/parkourClips.ts`
4. `npx tsx server/test/parkour-clips.test.ts` checks the file and the list agree.
