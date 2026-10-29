# Contributor guide: e-commerce book illustrations

This optional contributor guide describes illustration slots for `/learn/ai-ecommerce` ("AI for e-commerce: from one product photo to a full launch"). Unfilled slots intentionally show a hatched stand-in and caption; they are not evidence of a generated result. Check `web/src/learn/ecomArt.ts` for the current slot assignments.

## How to drop a picture in

1. If you choose to contribute an illustration, use or adapt the suggested prompt below. Check the selected model's actual requirements and quote first; do not start paid generation or downloads without the account owner's approval.
2. Save it as `web/public/learn/ecom/<slot>.webp`, long side 1200 px or less. It must be same-origin, because the book draws it onto its pages.
3. In `web/src/learn/ecomArt.ts`, set the slot to `'/learn/ecom/<slot>.webp'`. That one data file maps every slot to its image URL.
4. Run `cd server && npx tsx test/learn-ecom-book.test.ts`. It checks that every filled slot points at a file that exists.

Where each picture appears:

- **On the left page:** the first slot of each chapter is shown as a taped photo next to the title, cropped square.
- **In the pop-ups:** these slots are also shown on 3D cards.
  - `ch1-reference`: chapters 1, 2 and 4
  - `ch4-*`: the three frames in chapter 4
  - `ch5-poster`: the easel in chapter 5, a 3:4 crop
  - `ch7-cover`: the phone screen in chapter 7
  - `ch8-a` and `ch8-b`: the A/B cards and the phone in chapter 8

## The list

The table is a historical authoring suggestion, with cloud estimates recorded on 2026-10-24—not a current price or hardware-support guarantee. Recheck the live quote and model requirements. Local ComfyUI generation has no provider fee but requires separately installed compatible software/models/hardware.

| Slot | Chapter | What it's for | Prompt (our own words) | Model | Runs on | Size / aspect | Est. cost |
|---|---|---|---|---|---|---|---|
| `ch1-reference` | 1 · One good product photo | The clean reference photo every later chapter starts from | Studio product photo of a frosted glass serum bottle with a matte black dropper cap, centred on seamless white paper, soft light from the left, gentle shadow, sharp label, 50 mm lens | Z-Image-Turbo | Local | 1:1, 1K | $0 |
| `ch2-plinth` | 2 · Studio shots | Hero shot on a stand | The same serum bottle standing on a round white plinth, soft peach backdrop, single soft key light, subtle floor reflection, minimal premium look | Z-Image-Turbo | Local | 1:1, 1K | $0 |
| `ch2-white` | 2 · Studio shots | Marketplace listing on white | Serum bottle on pure white, soft contact shadow under the base, bright even light, e-commerce listing photo, square | Z-Image-Turbo | Local | 1:1, 1K | $0 |
| `ch3-kitchen` | 3 · Lifestyle scenes | The same bottle placed in a real scene. A precise edit that keeps the label | Edit Image with `ch1-reference` as the photo: Put this bottle on a pale oak kitchen counter next to a small potted herb and a linen towel, morning window light from the left, shallow depth of field | Nano Banana 2.1 (try FLUX.2 [klein] 4B locally first; use Nano Banana only if the label breaks) | Comfy (cloud) | 1:1, 1K | $0.075 |
| `ch4-slab` | 4 · Same look every time | Brand set, 1 of 3 (same seed for all three, e.g. 424242) | Serum bottle on a sage green stone slab — brand style: soft morning light, muted sage and cream palette, 85 mm lens, calm and clean | Qwen Image 2.1 Turbo | Local | 1:1, 1K | $0 |
| `ch4-towel` | 4 · Same look every time | Brand set, 2 of 3 (same seed) | Serum bottle beside a folded cream towel — brand style: soft morning light, muted sage and cream palette, 85 mm lens, calm and clean | Qwen Image 2.1 Turbo | Local | 1:1, 1K | $0 |
| `ch4-palm` | 4 · Same look every time | Brand set, 3 of 3 (same seed) | Serum bottle held in an open palm — brand style: soft morning light, muted sage and cream palette, 85 mm lens, calm and clean | Qwen Image 2.1 Turbo | Local | 1:1, 1K | $0 |
| `ch5-poster` | 5 · Ad poster with text | Poster with exact headline text | Vertical ad poster: serum bottle on the right on a peach backdrop, big bold headline "GLOW, BOTTLED" in the top left, small text "20% off this week" on an orange sticker bottom left, clean modern layout | GPT Image 2.5 Flare, medium quality (or Qwen Image 2.1 locally for free; keep the better one) | Comfy (cloud) | 2:3 portrait, 1K | $0.03 |
| `ch6-still` | 6 · Short product video | First frame for the video chapter | Serum bottle on a round cream plinth on a slowly turning turntable, soft studio light, warm grey backdrop, calm premium mood, wide shot with room around the product | Z-Image-Turbo | Local | 16:9, 1K | $0 |
| `ch7-cover` | 7 · Sound and music bed | Cover art for the music bed (shown on the phone) | Minimal square cover art for a calm skincare playlist: a frosted serum bottle silhouette, soft peach and cream shapes, gentle grain, no text | Z-Image-Turbo | Local | 1:1, 1K | $0 |
| `ch8-a` | 8 · Launch kit, A/B tests and cost | A/B test, version A (same seed as B) | Version A: serum bottle on a soft peach backdrop with a round plinth, headline space top left, premium skincare ad, square | Z-Image-Turbo | Local | 1:1, 1K | $0 |
| `ch8-b` | 8 · Launch kit, A/B tests and cost | A/B test, version B (same seed as A) | Version B: serum bottle on a soft sage backdrop with a round plinth, headline space top left, premium skincare ad, square | Z-Image-Turbo | Local | 1:1, 1K | $0 |

**Total, paid:** about **$0.105** (Nano Banana 2.1 at $0.075 plus GPT Image 2.5 Flare at about $0.03). With one retry each it is about $0.21, well under the $2 cap. **Total, local:** 10 pictures, $0.

The local Z-Image-Turbo row is quoted at $0.005 on the cloud if the Mac is busy, which would add about $0.05 for all ten. The book doesn't need any video or audio file. A YuE2 music bed (chapter 7's first prompt, local, $0) would be a nice extra for the demo, but nothing in the book uses it yet.

## Credits

- three.js (MIT) draws the 3D book. Every model, prop, texture and shader is our own code in `web/src/learn/`; nothing is downloaded.
- The book loads Source Serif 4 and Caveat from Google Fonts, both under the SIL Open Font License 1.1. It loads them only while it is open. Inter is the app's UI font.
- The Explore card poster (`web/public/learn/ecom-book-poster.svg`) is our own drawing.
