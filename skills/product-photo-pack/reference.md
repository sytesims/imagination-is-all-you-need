# Product photo pack: scenes, aspects, prompts

## Default set (12 images + optional clip)
| # | Name | Tool | Setting | Aspect |
|---|---|---|---|---|
| 1 | packshot-white | app-product-shot | scene studio-white | 1:1 |
| 2–5 | scene-kitchen / marble / outdoor / flat-lay | app-product-shot | scene per name | marketplace aspect |
| 6 | scene-brand | app-product-shot | studio-colour + brand colour | 4:5 |
| 7–9 | angle-3q-left / side / close-up | app-shots | shots list | 1:1 |
| 10 | hero-relit | app-relight | studio-softbox or golden-hour | 1:1 |
| 11–12 | packshot-2x, hero-2x | image-upscale | scale 2 | same |
| clip | orbit | app-orbit-shot | arc-left, 5 s (LTX-2 19B: 5 or 10 s) | 1:1 |

## Aspects by where it's used (check the platform's current rules before uploading)
| Use | Aspect |
|---|---|
| Main marketplace image (white background) | 1:1 |
| Store grid / product page | 1:1 or 4:5 |
| Instagram feed | 4:5 |
| Stories, Reels, TikTok | 9:16 |
| Banner, website hero | 16:9 |
| Pinterest | 2:3 |

## Prompt lines (add to `prompt`)
- Keep it exact: "{product}, same shape, colour and label text as the photo, label sharp".
- Kitchen: "on a light oak counter, morning window light, a few fresh ingredients softly blurred behind".
- Marble: "on white marble, soft top light, gentle reflection, minimal".
- Outdoor: "on a sunlit stone ledge, leafy shadows, warm afternoon".
- Flat-lay: "top-down flat-lay on linen with two or three matching props, even light".
- Brand: "on a seamless {brand colour} backdrop, soft shadow, studio light".

## Cheaper or better
- Everything above runs local at $0 on Qwen Image 2.1 / Qwen Image Edit.
- Label or small text must be perfect → one cloud image on GPT Image 2.5 or Seedream 5.0 Pro (about $0.03 each; quote first).
