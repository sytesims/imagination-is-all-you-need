# Footage FX pass: effects and prompts

Footage Effects runs Lightricks' IC-LoRA effects on LTX-2.5 22B locally. Sound can be kept (`keepAudio:"1"`). Lengths 2–5 s; Draft 448p, Sharper 576p.

| Effect | Good for | Prompt line (what is in the shot) |
|---|---|---|
| vanish | tourists in a landmark shot, a car in a driveway, a crew member in frame | "Remove the {people / car}; keep the {building, street, trees} exactly as they are." |
| day-to-night | real estate dusk shots, mood change | "{scene} at night, warm windows lit, street lamps on, deep blue sky." |
| rain | moody B-roll, weather continuity | "Steady rain falling, wet reflective ground, droplets on surfaces." |
| flood | disaster or surreal before/after posts | "Calm flood water a metre deep fills the {street / room}, floating debris, reflections." |
| alpha-matte | compositing, cut-outs, motion design | "The {subject} in the foreground." |

## Tips
- Say what must not change: the model keeps more when it's told.
- Static or slow camera clips work best; fast pans smear.
- Always run 2 s Draft first; full length only after the user likes it.
- Before/after reels: side-by-side for a feed post, A-then-B sequence for Reels and TikTok.
