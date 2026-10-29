# Viral format: prompt bank

Our own skeletons, written for LTX-2.5 22B (one flowing paragraph: shot, action, camera, then the sounds; dialogue in quotes is voiced in sync; 2–3 named cuts make a multi-shot clip). `{slots}` are what you ask the user for. Lengths are LTX limits (2–5 s).

## App templates (fill the slots in the `describe` prompt)

| id | Slots | Aspect · length | Tip |
|---|---|---|---|
| `template/glass-asmr` | fruit | 9:16 · 4 s | Static macro camera; describe the crunch and clink sounds |
| `template/fruit-drama` | hero, rival | 9:16 · 5 s | Each line in quotes; 2–3 cuts; end on a sting |
| `template/miniature-world` | object, task | 16:9 · 5 s | Tiny workers, shallow focus, small work sounds |
| `template/cctv-found-footage` | place | 16:9 · 5 s | Fixed high angle, grain, one odd event |

## Time freeze (t2v, 9:16, 5 s)
"A busy {setting} in mid-motion. {subject} stands still in the centre while everyone and everything around freezes in place: a splash of coffee hangs in the air, a pigeon stops mid-flap, confetti hangs still. The camera glides slowly around {subject}, who looks around in wonder. Sound: the city noise cuts to silence with a soft whoosh, a single heartbeat, then a low hum."

## Street interview (t2v, 9:16, 5 s; fictional people only, label as AI)
"Handheld vertical street interview on a sunny {city} pavement. A friendly interviewer holds a small microphone toward a {person}, who laughs and says \"{answer line}\". Cut to a close-up of the {person} raising an eyebrow at the camera. Natural light, passers-by blurred behind. Sound: street ambience, a bus passing, clear voice on the mic."

## Cinemagraph loop (Loop, i2v from a still, 16:9 or 9:16, 4–5 s)
Still prompt: "{scene}, calm, everything sharp, soft light." Video prompt: "Only {one moving element: steam rising / curtains swaying / rain on the window} moves gently; everything else stays perfectly still. Locked-off camera. Sound: {quiet ambience}." Use `loop:1` so the last frame matches the first.

## Morph (app-transition, transition morph, 4–5 s)
Two stills with the same framing: A = "{subject A}, centred, plain {background}", B = "{subject B}, same pose and framing, same background". Prompt: "{subject A} smoothly transforms into {subject B}, shapes flowing and reshaping, the camera holds still."

## Outfit change (the ceiling-fan / spin swap; app-transition morph or spin)
Still A: "full-body photo of {fictional person} in {outfit A}, standing in {room}, phone camera at chest height". Still B: same person, pose and room, "{outfit B}". Prompt: "They spin once and land wearing {outfit B}, fabric swirling during the turn, quick and playful." Chain more stills for more outfits, then `stitch_video`.

## Infinite zoom (N stills + zoom-through per hop)
Write 3–5 nested scenes, each living inside a detail of the last: "{wide scene}" → "{a detail in it, e.g. a window}" → "{the room behind the window}" → "{an object in the room}"… Same style words on every still. One `app-transition` (`transition:"zoom-through"`, `image` = still k, `lastFrame` = still k+1) per hop, 3 s each, then `stitch_video` in order.

## Photo mode (photo-fx effects)
float, shatter, ember, liquid, giant, mini, freeze, clone, levitate-objects, ripple, pixel-break, frost, bloom, smoke, lightning, zoom-space, dollhouse, spin-360, push-portal, paper-fold, slow-fall, backflip, dust-away, flame-aura, ice-statue, fade-out, clone-crowd, scene-hop, eye-dive, coaster-rush, picture-loop, exploded-view. `describe {id:"photo-fx"}` gives the live list; trust it over this one.

## Hooks that work (first 1–2 seconds)
- Start on the strangest frame, not the set-up.
- Sound first: a crunch, a gasp, a sting.
- One line of on-screen text you add later: "wait for it", "POV:", "day 1 of…".
