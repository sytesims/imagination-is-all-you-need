# Direct a Shot

**Stage the scene and camera in simple 3D, record a free mockup, then render it as real video.** It lives in the 3D tab (`/3d?workflow=plan-a-shot`; the id is unchanged).

1. **Stage** (free): pick a preset, set the camera move, speed, length and frame, and scrub through it. Everything is drawn in your browser; nothing goes to a provider.
2. **Mockup** (free, takes seconds): **Record mockup** draws every frame and saves an MP4 in your feed.
3. **Render** (free, on your computer): **Render real video** runs LTX-2.5 22B with Lightricks' Layout to Render IC-LoRA, which turns the mockup clip into real-looking footage, keeping the camera path and where things are. See [Render](#render) below.

**The page** (2026-10-26): the 3D view fills the window and the bar at the bottom shows only the step you are on. The steps sit on top of the view (click one to go there; the page remembers it).

| Where | What |
|---|---|
| Top left of the view | The scene (click to change it), **Add props** while staging |
| Top right of the view | Fly full screen (F), and **⋯**: preview style, shape, length, frame rate, what to record (the preview style or Clay + Depth), the layout number |
| Bar, Stage | Describe your shot, **Camera** (move and speed), the subject **colour** (new shots start orange), **Fly it** (F), **Play the actor** (V), **Next: Mockup** |
| Bar, Mockup | Your takes as small pictures (the preset move first; a performance before its angles), **New** (fly, act, full screen), play and scrub, **Edit take**, **Record mockup** |
| Edit take | Steady-cam, smoothing, trim, speed, Fit to shot; a performance's beats with their "how?" notes and the Render prompt; **Shoot this performance** (P), **Compare** angles, **Delete**. On the preset move: the move and its speed |
| Bar, Render | The newest mockup, the model (change it in the Render sheet), the price and time, **Render video** |

Each result is a **Take**: a **Mockup** and the **Render** made from it, compared side by side as **Mockup vs Render**. In the 3D feed, the filter reads All / Mockups / Renders / 3D.

The scene is rough on purpose. Video models follow camera motion, timing and where things are very closely, and they fill in the realism better from simple shapes than from fake detail.

## Presets

Each preset is a small parametric scene made of simple shapes plus a few CC0 kit pieces (shop fronts, furniture, a holiday village, the bottle). You can change the subject colour, the camera move (dolly, orbit, push in, crane), the speed, the length (3–10 s), the frame (16:9, 9:16, 1:1), the frame rate (24 or 30 fps) and a seed for the small random details.

| Preset | What it is | Default move | Inspired by |
|---|---|---|---|
| Walk-by | A mannequin walks along a pavement of shop fronts at golden hour while the camera follows | Dolly | Community examples (a rough 3D plan of a character beat, repainted by a video model with the motion kept; asking the model to fix stiff poses instead of copying them) |
| Product hero | A bottle with a blank label turns on a plinth in a warm grey studio sweep | Push in | Our own |
| Home walkthrough | An eye-level glide through a furnished hall, living room and kitchen built from a small floor plan | Dolly (a forward glide) | Our own |
| Diorama world | A snowy holiday village on a round base; a toy train runs one loop on a raised track | Orbit | Community examples (diorama worlds with a set of cameras as video guides) |
| Establishing shot | Hills, a hilltop town and a tower under a wide sky | Crane | Community examples (a floating-castle scene whose prompt structure shaped this preset) |
| Open city | A big seaside city (about 800 m) to walk, drive by and fly over: downtown towers, a palm avenue, shops, a park with a plaza, suburbs, a beach with a pier, wooded hills | Crane | Our own |
| Open city · golden hour | The same map at sunset, framed on the pier | Orbit | Our own |
| Open city · night | The same map after dark: lit windows, street lights, head and tail lights | Push in | Our own |

All preset text, scenes and prompts are our own words and code. The presets live in [`server/src/shared/previzTemplates.ts`](../server/src/shared/previzTemplates.ts) (one shared file the page, the server and the tests read), and the scenes in [`web/src/shared/previz/engine.ts`](../web/src/shared/previz/engine.ts).

Each preset also carries two **restyle prompts** for step 2 (a long one for reference-video models, a short one for layout-to-render models). The short one describes only the finished look; it never says "clay", "3D" or "blockout", which pushes models to copy the rough shapes.

### Open city

The open city is not made of primitives: a seeded generator ([`server/src/shared/world/cityGen.ts`](../server/src/shared/world/cityGen.ts)) writes a **world spec** (a placement JSON: kit piece, position, quarter turn, scale; plus districts, spawn points, landmarks, raised surfaces and traffic loops; [`worldSpec.ts`](../server/src/shared/world/worldSpec.ts)) and the engine assembles it from CC0 kit pieces ([`web/src/shared/previz/world/assemble.ts`](../web/src/shared/previz/world/assemble.ts)). `validateWorld()` checks a spec (unknown pieces, tiles off the 10 m grid or stacked, overlapping footprints) and says what is wrong in plain words, so a later text brief ("rainy neon downtown") can produce a spec and retry.

- **Playing in it:** the person can't walk through buildings, props, trees or parked cars (box colliders from the placement), follows the ground over the hills and up the pier, and stays out of the pond and the sea; the camera never ends up inside a building and the follow camera comes in front of a wall. Pure maths in [`openCity.ts`](../server/src/shared/world/openCity.ts), shared by the page and the tests.
- **The minimap** (bottom left) shows the districts, streets, the sea and where you are; its buttons teleport you to each district. **High / Fast** switches shadows and view distance.
- **Speed:** the kit is one 1.2 MB file (`web/public/models/open-city`, made by `scripts/assets/build-open-city.mjs`). Streets and buildings are merged per 100 m cell, trees and parked cars are instanced, far cells, details and trees are hidden by distance, and the sun's shadow box follows the camera. Traffic is posed from t alone, so recordings stay deterministic.

### The look

Every scene uses one brand theme ([`web/src/shared/previz/theme.ts`](../web/src/shared/previz/theme.ts)): an orange subject (the mannequin, with deeper-orange joints, the bottle, the train, the sofa) on warm neutral and charcoal sets, a warm key light with a cool fill, a soft gradient sky and haze. The kits' own bright colours are pulled into that palette in the shader, and the subject colour control recolours kit pieces too (orange is every preset's default). Clay and Depth stay plain guides.

### Add props

**Add props** (top left of the view, in the Stage step) opens a drawer of kit pieces by tab: Home, Kitchen, Street, Nature, Holiday and Product. Click one to drop it where the view looks, drag it in the view to move it, turn it with the slider or Q / E, size it, or remove it (Delete). Props are part of the shot (`props`, up to 40), so they are saved, recorded and sent with the Render. In the diorama they start at miniature size. The pieces ship in `web/public/models/kits` (made by `scripts/assets/build-scene-kits.mjs`; the street, city trees and cars come from the open city's kit).

### Your 3D models

The drawer's first tab, **Your 3D models**, lists your finished Image to 3D results, GLBs you uploaded (**Upload GLB**: binary glTF 2.0 with at least one mesh, up to 40 MB) and the Mossbun example. On a 3D result, **Use in Direct a Shot** (the card's action, or **Direct** in the 3D viewer) opens the stage with that model placed. A model drops on the ground where the view looks, clear of other props, facing the camera, at a real-world size (a character about 1.2 m; the diorama scales it down). Size it in metres, turn it, fix its **Front** in quarter turns if the file faces another way, or drag it in the view. Its own lights and cameras are dropped; its textures stay. A shot keeps up to four (`models`: the file, its name, the words for the Render, position, turn, height, front and footprint). Your models come along when you switch preset. Maths: `server/src/shared/previzModels.ts`; loading: `web/src/shared/previz/userModels.ts`.

**Make it the actor** swaps the mannequin for the model: it follows the performance you played (or the Walk-by walk, or stands where you put it) with a **Hop**, **Waddle** or **Glide**, a pure function of the pose: a bob, a lean into turns and a squash and stretch on each landing. A GLB with its own animation plays it on the shot's clock (`mixer.setTime(t)`). Shot Recipes frame the whole model (the sizes are measured on its bounds, so a medium shot shows all of it), and recipe takes bake again when it moves or changes size. **In the Render, it is** holds the words the Render prompt uses for it (the example's, else the prompt of the picture it was made from, else its name): they replace the preset's person ("Mossbun, a small round forest creature… walks down a sunny city street"), and the acting line says how it moves ("Mossbun: 0–7 s hops").

**Rig as a character (2026-10-27, Phase A).** A model with no skeleton can get one: **Rig** in the 3D viewer, or **Rig as a character** on a model in Your 3D models. In the browser and free: Mesh2Motion's human skeleton (CC0) is fitted to the mesh (`web/src/shared/rig/humanRig.ts`: the template scaled to the model, then the spine, legs and arms moved onto its cross-sections), you check and nudge the joints, Mesh2Motion's weight passes (MIT, vendored in `web/src/shared/rig/m2m`) paint the skin in a worker, and the moves you pick (idle, walk, jog, run, jump, dance, sit; `web/public/models/rig/human.glb`) are baked into a new GLB kept as a 3D result (`POST /api/3d/rig`). As the actor with **Its moves**, the clips blend by speed like the mannequin's (`server/src/shared/previzRig.ts` `rigMixAt`, every weight and time from the pose, no clock). A GLB that already has idle / walk / run clips plays them the same way. Not yet: other body types (four legs, birds, snakes), parkour on rigged characters, a licence check before saving.

## Preview style

| Preview style | In code | What it shows |
|---|---|---|
| Simple | `beauty` | Flat colours with soft light, soft shadows and a little haze |
| Clay | `clay` | Every surface one neutral grey: shapes and motion only |
| Depth | `depth` | White is near, black is far (three.js `MeshDepthMaterial`, made linear between a near and far that stay fixed for the whole shot (`depthRangeFor`), so the guide never gets brighter or darker as the camera moves) |

**Record** can save the view you see (one video) or **Clay + Depth** together (two videos from the same frames, ready for the Render step).

## How recording works

- Every frame is drawn on purpose: for frame *i* the scene is posed at `t = i / fps` (`seek(t)`), copied onto a fixed-size canvas (1280×720, 720×1280 or 960×960, letterboxed, never stretched) and encoded as a JPEG.
- A view's JPEGs go to the server back to back as one motion-JPEG stream. ffmpeg (already used by the server) turns it into an H.264 MP4 with exactly `seconds × fps` frames at exactly `fps`.
- A slow computer takes longer, but the clip's timing never changes. Real-time recording (MediaRecorder) would drop frames and change the motion; WebCodecs' H.264 encoder isn't in every Chromium build and would need an MP4 muxer dependency.
- The result is a normal, free video job (tool `plan-a-shot`): it shows in the 3D feed and in Assets. The job keeps the shot (`input.previz.shot`) and the preset's restyle prompts for the Render step.

Everything moves as a function of `t` only: the camera rig (`cameraAt`) and the subject's path (`subjectAt`) are pure functions in the shared file, small random details come from a seeded generator (mulberry32), and nothing runs on a timer. The same shot and the same `t` always give the same picture. `server/test/previz.test.ts` checks the camera for every preset and move.

## The shot object

One serialisable object describes a shot, so a helper agent can later set it up from a description:

```json
{ "template": "walk-by", "colour": "orange", "move": "dolly", "speed": "normal", "seconds": 6, "aspect": "16:9", "fps": 24, "seed": 7, "note": "" }
```

`normalizePlanShot()` turns any input into a valid shot (unknown values fall back to the preset's defaults). `note` is the "Describe your shot" text: it is kept with the shot and the video, not used by the scene, and added to the Render prompt.

Two optional fields hold what you do by hand (both absent on a fresh shot):

- `cameraPath`: your flown takes and which one drives the camera (`chosen`; `null` = the preset move). Each take is `{ id, name, keys: [{ t, pos: [x, y, z], yaw, pitch, fov }], smooth, trimStart, trimEnd, speed }`.
- `place`: where you dragged things on the map, `{ cam: [x, z], aim: [x, z] }` in metres (moves the preset move's camera, and the subject or what the camera aims at).
- `props`: the kit pieces you added, `[{ k, x, z, r, s }]` (piece id, position on the ground in metres, turn in radians, size; `normalizeProps()` keeps known pieces only).

## Fly the camera

### Add a generated 3D model as a prop

In **Stage → Add props → Assets · 3D models**, choose a finished Image to 3D GLB. One click adds it as a prop facing the camera; it does not replace the actor or scene. **Refresh Assets** reloads the list after another model finishes. **Upload GLB** adds a local file instead (up to 40 MB; self-contained binary glTF with embedded textures/buffers only). A failed list/load shows a reason and keeps already placed models intact. GLTF/OBJ and external URLs are not supported here.

Select the placed model to edit **Position X/Z**, height in metres, turn and front, or remove it. Dragging in the view also moves it. **Make it the actor** is a separate optional action. The model browser scrolls independently beside the preview on desktop; on a narrow screen close the drawer to inspect the full view. In Product Hero, a prop over the existing circular stand rests on its 0.60 m top rather than inside the drum; elsewhere it rests on the scene floor. This is not a general surface-snapping or physics feature.

Placed models and their source job IDs are part of the saved scene and the recorded mockup snapshot. Missing/failed props must be removed or replaced before recording, rather than silently disappearing from the export. Imported HTML scenes own their content and do not support adding these props; use a built-in scene for this workflow.

The scene picker, Add props, steps and More menu sit **outside the export frame**. Portrait stays 9:16; changing a preview's available space does not change the exported shape. The dock wraps controls instead of hiding them behind the primary action. Finish/leave live actor or camera controls before moving to Mockup. Live controls and capture progress use the full editing frame so they remain readable around a portrait preview.

After changing props, lens, framing, trim, speed or shot length, record a new mockup before Render. The Render step only automatically matches the saved scene snapshot; **Use your last mockup** is an explicit way to use older work. A newly imported HTML file also needs a new mockup rather than silently borrowing one from a different file. **Render video** opens model, connection, length and cost choices; it is not itself a generation submission. Local/free and cloud/paid costs remain in the Render sheet, beside the real selected model.

**Fly the camera** (**Fly it** in the Stage bar, or **New** in the Mockup bar) lets you move the camera yourself, like a video game, and record the move:

| Key | Does |
|---|---|
| W A S D (or the arrows) | Move. W goes forward along the ground, so your height stays put |
| Q / E | Down / up |
| Drag on the picture | Look around |
| Shift (hold) | Slow and precise |
| Scroll | Flying speed |
| Z / X | Zoom in / out |
| R | Record a take / stop |
| Esc | Stop a take, or leave flying |

**Record a take**: after 3, 2, 1 the scene plays from the start in real time while you fly. Stop whenever you like: a take can be shorter than the shot (the camera then holds its last pose) or longer (up to 30 s; only the part you keep is used). You can keep up to 12 takes, pick one in the Mockup bar, or delete one in Edit take (the camera goes back to the preset move).

**Clean up** the chosen take (in **Edit take**): *Smoothing* (0 keeps exactly what you flew, handheld shake and all; the default smooths it gently), *Trim* (cut the start and the end) and *Speed* (with *Fit to shot*, which makes the trimmed take last exactly the shot).

The Mockup bar names the active camera and the **source take range actually included**. A 14.6 s performance in an 8 s shot does not export all 14.6 s: at 1× with no trim it exports take seconds 0–8. Trim or use **Fit to shot** in **Edit take**; change the shot length (3–10 s) in the player's **⋯ → Length** control. A shorter take holds its final pose for the rest of the shot. These edits do not delete the original recorded keys.

For an actor or car performance, **Record performance** keeps movement and its follow camera, not a video. Select it in Mockup and choose **Shoot this performance** to replay the movement while flying a new camera angle; **Recipes & lens** also makes camera takes. Select the angle you want, check the Mockup summary, then **Record mockup**. This draws every frame in the browser and saves an MP4 on this computer, without a provider. Only the following **Render video** step opens model, length and cost choices; recording a mockup never starts a paid render.

If the completed mockup cannot be uploaded/saved, the error keeps the completed frames in this open page and offers **Retry save · free**. This only retries saving the original captured mockup, not a provider job or edits made since the capture. Leaving the page or starting another recording releases those frames; your editable takes remain in this browser. A server-side conversion failure is separate and appears on its job in the feed. A **read-only design preview** deliberately cannot save: use the normal app rather than disabling its write guard.

**Drag on the map**: the white circle moves the subject (the walking person stays on the pavement, the bottle in the studio) or what the camera aims at; the orange dot moves the preset move's camera. *Reset* puts them back.

How it works ([`previzTemplates.ts`](../server/src/shared/previzTemplates.ts), pure and tested):

- A take is stored as keyframes at 30 per second (`resampleKeys`). Between keys the position follows a smooth curve (Catmull-Rom), so a short list of keys an agent writes also plays smoothly.
- Smoothing is a Gaussian average over time at fixed sample points (`takePoseAt`), so the same take and settings always give the same camera at every moment. The live player, the recorded video and any future helper all read the same `cameraAt(shot, t)`.
- The camera never goes below the ground or floor (`clampCamera`; indoors it stays under the ceiling), never rolls, and never tips past about 77° up or down.
- Limits: 12 takes (a performance and its angles count as takes), 30 s a take, 901 keys a take; anything bigger or broken is trimmed or dropped by `normalizePlanShot()`. A recorded video keeps only the chosen take with the shot.
- Switching preset asks first, because a take belongs to the set it was flown in; switching clears the takes and map drags.

## Game mode and Play the actor

- **Full screen (F):** the player fills the screen and locks the mouse, like a game. A small HUD shows the speed, REC and the timer, the map, and key hints that fade once you move. **R** records and stops without leaving; each take shows "Take N saved" and you keep going. **Esc** frees the mouse first, then leaves full screen.
- **Game controllers** (browser Gamepad API, standard mapping): left stick moves, right stick looks, triggers go down / up (camera) or nearer / further (actor), bumpers change the flying speed, **A** records, **B** leaves, **View** switches Camera ↔ Actor. The player says when a controller connects.
- **Play the actor (V, or "Play the actor"):** in Walk-by, Home walkthrough and Product hero you walk the person yourself, third-person: W A S D move relative to the camera, Shift runs, the mouse orbits the camera behind them. Action keys **1–6**: wave, run (toggle), dance, sit, jump, point. The take keeps the person's path and the beats with their times (`cameraPath.takes[].actor`: keys at 30 Hz with position, heading, speed and distance walked; beats `walk / run / stand / wave / dance / sit / jump / point` with an optional note). Maths: `server/src/shared/previzActor.ts`.
- **Steady-cam** (on by default) smooths a take; turn it off for a handheld feel. The map draws the person's path; the timeline marks the beats; trim and speed work as for any take.
- **Beats → Render prompt:** add a note to any beat ("nervously", "laughs"). The Render sheet's starting prompt ends with a line such as "The person: 0–2 s walks nervously, 3 s waves and laughs." (in shot seconds, after trim and speed), which you can edit before Render.
- The person is Quaternius' [Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html) mannequin (CC0), trimmed to ten clips and compressed to about 0.2 MB (`web/public/models/mannequin`, made with `scripts/assets/optimize-mannequin.mjs`). Wave and point are posed by hand. If the file can't load, the old capsule figure stays.

## Import your own scene

A coding agent (Claude Code, Codex, …) can write a richer scene. **Copy build prompt** (on the player, or in the preset menu) copies a prompt for the current preset that includes the contract below. Then use **Import a scene (.html)** in the preset menu, or drop the file on the bar.

The page runs in a sandboxed frame (`sandbox="allow-scripts"`, no same-origin): it can't read the app, its storage or its cookies. A small bridge script is added at the top of the page to report errors and to ask for frames.

### The contract

```js
window.previz = {
  duration: 6,                          // seconds; 3–10 are recorded (rounded)
  passes: ['beauty', 'clay', 'depth'],  // optional: the views you support
  seek(t) { /* pose everything for time t and draw that frame before returning (or return a promise) */ },
  setPass(name) { /* 'beauty' | 'clay' | 'depth' (white = near) */ },
};
```

- One self-contained HTML file, no build step. If it uses three.js, load exactly `three@0.183.2` from cdn.jsdelivr.net through an import map. No other libraries, models, textures, fonts or sounds.
- Everything is a function of `t`: no timers driving the motion, no `Date.now()` or `performance.now()` in the pose, no `Math.random()` (use a seeded generator).
- One canvas that fills the window, with its drawing buffer kept (`new THREE.WebGLRenderer({ preserveDrawingBuffer: true })`). Resize with the window and keep the camera's aspect in step; the recorder resizes the frame to the recording size.
- Draw only the scene: no buttons, labels, captions, logos or text in the picture.
- Call `seek(0)` once when the page loads.

If the page throws, never sets `window.previz`, or is missing `seek` / `setPass` / a valid `duration`, the player shows what's wrong in plain words with **Choose another file** and **Copy build prompt**.

Examples in this repo: [`plan-a-shot/sample-scene.html`](plan-a-shot/sample-scene.html) (plain Canvas 2D, follows the contract) and [`plan-a-shot/broken-scene.html`](plan-a-shot/broken-scene.html) (shows the error state).

## Render

**Render real video** sits on every mockup: the sparkle on its feed card, the button in the player's bar (it uses your newest mockup; the line under it reads "LTX-2.5 turns your mockup into real footage · free on your Mac · about N min") and the button in the result viewer. It opens a small sheet; nothing runs until you press **Render real video** there.

| In the sheet | What it does |
|---|---|
| Prompt | Starts as the preset's short restyle prompt plus your "Describe your shot" note. Keep it to one or two sentences about the finished look. Words like "clay", "3D" or "Unreal" make the model copy the rough shapes (Lightricks' guidance), so the sheet warns about them and they are left out when it runs |
| First frame | Required by the recipe: the mockup's first frame repainted into the finished look. **Paint it on my Mac** does that for free with FLUX.2 [klein] 4B (Create Image's local edit route) and shows you the picture first; or use your own picture. Never the grey frame itself (that gives a grey result) |
| Draft | Length on the 8k + 1 frame grid at 24 fps (1.7, 2.7, 4 or 5 s, never longer than the recording) and size: **Draft** 768×448 (the default) or **Sharper** 1024×576 (9:16 and 1:1 have their own shapes). Lightricks' known-good 1920×1088 is too heavy for a Mac's memory |
| Files | The six model files and whether each is ready, still downloading (a file smaller than its full size is never treated as ready) or missing. Render real video unlocks when all are complete |
| Free · runs on your Mac · about N min | A first estimate, calibrated on our own run on an M1 Max (a 5 s Draft at 768×448 took about 19 min; 2.7 s reads about 10 min; the first run also loads about 44 GB of files). After a run the app uses your computer's own times |

How it runs (tool `make-it-real`, provider `comfy-ltx25-layout`, graph [`workflows/ltx25-layout-to-render-api.json`](../workflows/ltx25-layout-to-render-api.json)):

- The server conforms the mockup with ffmpeg: 24 fps, cover-scaled and centre-cropped to the draft size (sides divisible by 64), exactly the chosen 8k + 1 frames. The first frame is fitted to the same size.
- Two-stage distilled sampling, as on the LoRA card: stage 1 at half size (8 steps), the latent upscaled ×2, stage 2 at full size (3 steps, entering at sigma 0.909); CFG 1, euler_ancestral, seed 42. The layout clip is the IC-LoRA guide on both stages; the first frame is a guide just before the clip (temporal position −1) on both stages.
- Model files (Mac-safe, no fp8 / int8 / nvfp4): `ltx-2.5-22b-distilled-Q4_K_M.gguf` (13.6 GB, Unsloth), `gemma4-12b-with-proj-ltx-2.5-bf16.safetensors` (26.3 GB), `ltx-2.5-video-vae-conv-bf16.safetensors` (1.5 GB), `ltx-2.5-audio-vae-bf16.safetensors` (0.4 GB), `ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors` (1.0 GB), `ltx-2.5-22b-ic-lora-layout-to-render-1.0.safetensors` (1.3 GB, gated: accept on Hugging Face). Needs the ComfyUI-GGUF custom nodes. On Apple Silicon start ComfyUI with `--use-split-cross-attention` (LTX-2.5 gives black frames otherwise).
- LTX-2.5 makes sound with the picture; the render keeps it (the mockup has none).
- The render lands in the 3D feed as a Take linked to its mockup (`input.makeReal.planJobId`, and the mockup job lists its renders as `madeReal`). Its viewer shows **Mockup vs Render** side by side, played in sync, with a "Render only" view.
- With sample results (mock mode) nothing runs: you get a colour-graded copy of the mockup, labelled Sample, so the flow can be tried.

Credits: [LTX-2.5](https://huggingface.co/Lightricks/LTX-2.5) and the [Layout to Render IC-LoRA](https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Layout-To-Render) by Lightricks ([LTX-2.x Community License](https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x)); the GGUF repack by [Unsloth](https://huggingface.co/unsloth/LTX-2.5-GGUF); [ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF) by city96 (Apache-2.0); the graph follows ComfyUI's official LTX-2.5 and LTX-2.3 IC-LoRA templates and Lightricks' [Layout to Render guide](https://docs.ltx.io/open-source-model/vfx-post-production/layout-to-render). Licences: [LICENSES.md](../LICENSES.md).

## Credits and further reading

- The presets above credit the creators whose ideas they build on. Their posts are linked, not copied.
- The person you play: the Universal Animation Library mannequin and clips by [Quaternius](https://quaternius.com) (CC0).
- The open city: [KayKit City Builder Bits](https://kaylousberg.itch.io/city-builder-bits) by Kay Lousberg and Kenney's [City Kit (Commercial)](https://kenney.nl/assets/city-kit-commercial), [City Kit (Suburban)](https://kenney.nl/assets/city-kit-suburban), [Car Kit](https://kenney.nl/assets/car-kit) and [Nature Kit](https://kenney.nl/assets/nature-kit) (all CC0). The layout, terrain, pier and lighting are our own.
- Technique notes that shaped the capture design (deterministic `seek(t)`, eased camera moves with smootherstep, render views for guides): [echris6/motion-video-kit](https://github.com/echris6/motion-video-kit) (MIT) and [CloudAI-X/threejs-skills](https://github.com/CloudAI-X/threejs-skills) (MIT). No code was copied.
- [CozyClay](https://github.com/NomaDamas/CozyClay) (AGPL-3.0) is an open-source previz studio with a similar export idea. Linked for reference only; none of its code is in this repo.
- Step 2 follows the model makers' own guidance: LTX's [Layout to Render](https://docs.ltx.io/open-source-model/vfx-post-production/layout-to-render) recipe (a guide clip plus an art-directed first frame). Seedance's reference-video control is a possible hosted route later.
