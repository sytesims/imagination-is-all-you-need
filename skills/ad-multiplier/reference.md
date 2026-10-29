# Ad multiplier: grids and swap prompts

## Grids that test one thing at a time
| Goal | Grid | Variants |
|---|---|---|
| Which audience | 3 talents × same setting | 3 |
| Where it lands | same talent × 3 settings (home, gym, office) | 3 |
| Full test | 2 talents × 3 settings | 6 |
| New market | original × 3 languages | 3 |
| Product line | original × 3 product colours | 3 |

Change one thing per variant when the user wants to learn what works; combine changes only for fresh creative.

## Swap prompts (object-swap / restyle `prompt`)
- Talent: "Replace the main person with the person in the reference image; keep their motion, timing, framing and expression."
- Outfit: "The same person now wears {outfit}; everything else unchanged."
- Product: "Replace the {product} in their hand with the product in the reference image; same size and grip."
- Setting: "The same scene and action, now in {setting}, matching light direction."

## Model choice
- Local (free): Wan 2.2 Animate 14B, MiniMax H3 Character Swap (people), Wan 2.1 VACE 14B (restyle). Good for drafts and simple swaps.
- Cloud (paid, better faces and hands): Kling 3.0 Omni Edit, Seedance 2.0 / 2.5 Edit. Quote with `compare:true`; prices are per clip and depend on length and resolution.
- Edit models have a max clip length: check `describe` limits and use `trimStart` / `trimEnd` for long ads.

## Variant table to show
| # | Change | Model | Place | Price |
|---|---|---|---|---|
| 1 | Talent B, kitchen | Kling 3.0 Omni Edit | Comfy | $… |
| 2 | Talent B, gym | Wan 2.2 Animate 14B | Local | $0.00 |
| | **Total** | | | **$…** |
