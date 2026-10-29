# Drama series: bible, beats, prompts

## series.json (keep it next to the user's project)
```json
{
  "title": "Bowl Drama",
  "logline": "A lemon finds out the fruit bowl has been planning without her.",
  "look": "glossy 3D cartoon fruit with big expressive eyes, saturated colours, soft studio light",
  "setting": "a sunny kitchen counter",
  "tone": "soap opera, melodramatic, funny",
  "hook": "every episode ends with a shadow falling over the counter",
  "cast": [
    { "name": "Lemona", "look": "a bright yellow lemon with long lashes", "still": "/files/…", "sheet": "/files/…", "stillJob": "…", "sheetJob": "…" }
  ],
  "episodes": [ { "n": 1, "title": "The Bowl Knows", "episodeJob": "…", "shots": ["…"] } ]
}
```

## Beat sheet (75 s = 15 shots × 5 s)
| Act | Shots | Job |
|---|---|---|
| Cold open | 1–2 | a shock line, straight in |
| Set-up | 3–5 | who wants what |
| Turn | 6–9 | a secret, a betrayal, a reveal |
| Clash | 10–13 | the confrontation, the best lines |
| Cliffhanger | 14–15 | a new threat, cut on the reaction |

## Shot prompt shape (LTX-2.5 22B, i2v from the character still)
"{look}. {shot size} of {name} on {setting}, {action}. {name} says \"{line}\". {camera: slow push in / static / quick whip}. Sound: {one cue: violin sting, gasp, silence}."
- One speaker per shot; LTX voices quoted lines in sync and moves the mouth.
- Two characters in one shot: describe both by their look line; for hard shots use r2v with both sheets as `image:[sheet A, sheet B]` on a cloud model (Kling takes up to 7 reference images; quote first).
- Keep the look line word-for-word in every prompt.

## Episode 2+
Read series.json → same stills and sheets → a recap line in shot 1 ("Previously…") → continue the hook.
