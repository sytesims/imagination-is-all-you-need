---
name: video-pacing
description: Time and pace a generated video so it feels real, not rushed. How many beats fit a clip of a given length, how long to hold faces and moments, how to write timed prompts, when to split a scene into several clips and join them in Stitch, and how to finish the edit. Use before writing any video prompt or planning a short film, drama scene, ad or music video.
---

# Pacing a video so it feels real

Most AI clips feel fake for one reason: too much happens too fast. A 15 s clip with five beats gives each one three seconds, so nothing lands. Real films breathe: an action, then a hold on a face, then a reaction. Plan the time first, then write the prompt.

Learned on our own runs (2026-10-27): the "Mom packed lunch" draft packed four beats into 15 s. We never saw her get on the bus and never stayed on her face, so it didn't move anyone. The rain scene worked better because its slow motion and close-ups gave each beat room.

## 1. Beats per clip

A **beat** is one thing that changes: an action, a line of dialogue, a reveal or a reaction.

| Clip length | Beats | Rough split |
|---|---|---|
| 5 s | 1 | One action or one held moment. No dialogue, or one short line. |
| 6–8 s | 1–2 | Set-up, then one change. |
| 10 s | 2 | Action, then a held reaction. |
| 15 s | 2–3 | Set-up 4–6 s, turn 4–5 s, held ending 4–5 s. Never 4 or more. |
| 20 s | 3 | Same as 15 s, with longer holds. |
| 30 s or more | Split it | Two or more clips joined in Stitch (section 4). |

If the story needs more beats than the table allows, **make more clips**. Don't squeeze.

## 2. Holds: where emotion happens

- **The emotional moment gets 3–5 s on a face,** with no cut. Tears, a smile breaking, a realisation: it needs time to build.
- **Reactions are worth more than actions.** The second after the envelope lands is the scene, not the slide itself.
- **Give every line of dialogue at least 2 s,** plus slack. Models often start a line 1–1.5 s late.
- **At most 3 short lines per 15 s.** One line per speaker per beat.
- **End on a hold:** a frozen face, a wide shot, a long note. A clip that ends mid-action feels cut off.
- **Slow motion** stretches a beat without adding story: a walk in the rain, a turn, a falling object.

## 3. Writing the timed prompt

- **Time the beats, not the frames:** "0–6s: …", "6–15s: …" with 2–3 blocks for 15 s. Each block is one beat.
- **Say "hold" and "no cuts in this shot"** for the emotional block, and "slow pacing with long holds" in the style line.
- **Describe the camera once per beat:** "slow push-in on her face", "static close-up", "wide shot, the bus pulls away".
- **Tie dialogue to an action,** e.g. "she looks up and says in Korean: '…'", so the right person speaks it.
- **Keep who appears when explicit:** "only the two of them until 8 s" stops a reveal character showing up in shot one.
- **Give sound a role per beat:** ambience, then a swell, then silence before the punchline, then one remembered sound.
- **Follow each model's own format.** MiniMax H3's official format uses three fields (`integrated_multimodal_description`, `overall_soundscape`, `non_diegetic_music`), `[Shot 1]` and then "At 00:06.000, the camera cuts to…", and `<d>[Language] …</d>` lines with `(S1)` speakers. Check the model's guide in the Comfy docs before writing.

## 4. Longer scenes: split, then stitch

1. Write the scene as a beat list first, e.g. "goodbye, boarding, discovery, the wave, the bus leaves".
2. Group the beats into clips of 2–3 beats each, using the table in section 1.
3. Keep the same character description, look line and lighting in every clip's prompt, word for word, so the cast stays the same.
4. Start each clip where the last one ended: same place, the next moment. Use the last frame as the next clip's start frame where the model allows it (Extend, or image to video).
5. Draft each clip cheaply first (480p) and check the pacing. Then run the final quality.
6. Join the clips in **Stitch**:
   - a crossfade (0.4–0.8 s) or a cut on an action between clips
   - a fade to black at the end
   - the music or narration as one track under everything, ducked under dialogue
   - captions, title and end cards if needed

## 5. Finishing: what makes it feel like a film

- **Sound:** keep the clip's own sound low under narration or dialogue, and let the music dip under voices. Aim for about −14 LUFS for the whole film. A quiet voice must sit clearly on top.
- **The ending:** fade the picture to black over 1–1.5 s, and let the sound tail out a beat after the picture.
- **End cards:** one idea per card on black, each held 2.5–3 s, fading in and out. A credit sits under the line it belongs to, never under someone else's.
- **Captions:** one phrase per caption, timed to the voice, at most 2 lines, low in the frame, and not covered by UI.
- **Letterbox** for a widescreen film feel. Keep text inside the picture area.
- **Loops** for a background film on a page: fade out at the end and back in at the start, with the music easing at the seam.

## 6. Directing

The directing lessons (emotion built in steps, talkative scenes, voiceover, speaker IDs, start frames, continuity) live in the **film-making** skill, a running log we add to after every test. Read it with this one.

## 7. Checklist before you spend

1. How many beats per clip? Within the table?
2. Where is the 3–5 s hold on a face?
3. Does each line have at least 2 s, tied to an action?
4. Who is on screen in each beat, and is any reveal kept for later?
5. Is the cast described word for word the same in every clip?
6. Is there a cheap draft first, and a price for the final?
7. Does every emotional beat build in steps (still → eyes fill → tear → break)?
8. Enough talk: 3–4 short lines per 15 s, each speaker with an ID?
9. Does the start frame hold everyone who appears in the clip?
