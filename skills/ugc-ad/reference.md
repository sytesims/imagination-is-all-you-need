# UGC ad: hooks and scripts

## Hook patterns (first 3 s; pick 3, fill with the product)
- **Question**: "Why did nobody tell me about {product} sooner?"
- **Bold claim**: "This {product} replaced three things in my {room}."
- **Before / after**: "My {problem} last week… and today."
- **Unboxing**: "OK, it finally came. Let's see if it's worth it."
- **Testimonial**: "I've used {product} every day for a month. Honest review."
- **Mistake**: "Stop doing {common mistake}. Do this instead."
- **POV**: "POV: you finally found a {product} that actually {benefit}."

## 15 s script frame
| Beat | Seconds | What it says |
|---|---|---|
| Hook | 0–3 | one hook line |
| Problem | 3–6 | the pain, in one sentence |
| Demo | 6–11 | 2 benefits while showing the product (B-roll here) |
| Call to action | 11–15 | "Link's below", "Try it for {offer}" |

Keep each spoken line under ~12 words (fits a 4–5 s LTX shot). Use plain words, contractions, one claim per line, and nothing you can't back up.

## Shot prompts (LTX-2.5 22B, i2v from the creator still)
- Talking: "{creator} looks into the phone camera, holds up {product} and says \"{line}\". Natural window light, slight handheld sway, casual {room}."
- Reaction: "{creator} tries {product}, eyebrows rise, smiles and nods. Small room sound."
- Demo B-roll: "Close-up of hands using {product} on a {surface}, slow push in, soft daylight."

## Captions file (captions.srt)
One block per line, times from the stitched shot lengths:
```
1
00:00:00,000 --> 00:00:03,000
Why did nobody tell me about this sooner?
```

## Presenter scenes in app-ugc-ad
`describe {id:"app-ugc-ad"}` lists them live (home sofa, kitchen, mirror, street walk, café…), plus hook styles (question, bold claim, before/after, unboxing, testimonial).
