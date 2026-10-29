---
name: film-making
description: Direct AI-generated films like a film director - performance, emotion built in steps, talkative scenes, voiceover, speaker IDs, start frames that hold every character, continuity, prompt grammar per model, drafting cheap and finishing in post. A living log of lessons from real tests in this app, newest first. Use with video-pacing before planning or prompting any short film, drama, ad or music video.
---

# Film making: what we've learned

How to use it: read this and **video-pacing** before writing any video prompt. After every test (a draft that worked, or one that didn't), add a dated entry to the log at the bottom: what we tried, what happened, the rule we take from it. Promote a rule into the sections above once it has held up twice.

## Directing

Direct the performance and the coverage, don't just describe the scene.

- **Build emotion in steps, and say the order.** A face that jumps straight to sobbing reads fake. Write the stages and tie each to the one before: "At first she stays completely still, only her eyes filling. Then a single tear rolls slowly down her cheek while her face is still calm. Only after the tear has fallen does her chin tremble and her face crumple." Give the build 4–6 s.
- **Let people talk.** A silent clip feels empty. Aim for 3–4 short lines per 15 s, each tied to an action ("she pushes it back and says sharply…"). Conflict first (an argument), warmth later: the contrast is the story.
- **Voiceover for written words.** A note, letter or text message is read by its writer's voice off screen while we see the reader's face.
- **Give every voice an ID and a description** on its first line ("the older woman with a warm, slightly hoarse voice (S2)") and reuse the ID in every clip, so the right person speaks. A character with no line gets no ID and stays silent.
- **Pick the start frame for who must appear.** Starting from a close-up of one person makes the model redraw everyone else from text, and their faces drift. Start from a frame that already holds every character in the clip (cutting from a close-up to a two-shot is a normal edit).
- **Name continuity details in every clip:** clothes, props (the pink lunchbox), and set pieces (a green city bus), word for word.
- **Leave holds a little long.** Trim them in the edit, where music and pacing are decided anyway. A hold that's too short can't be fixed.
- **MiniMax H3 grammar:** the image-alignment line first for image to video, `[Shot N]` with one timestamp per cut, dialogue in `<d>[Korean] …</d>`, no ellipses inside `<d>`, and no "no …" lists (H3 has no negative prompt: state what should appear).
- **Draft cheap, then finish:** 15 s at 480p on the open H3 workflow bills about $0.40. Fix the acting at 480p; render 768p only for keepers.

## Prompts the model can actually follow

The user, after LE SEPTIÈME Clip 1: "be careful with our prompts… the models can't get your instructions". Clip 1 asked for about ten things; H3 did the first four.

- **One clip, one camera setup, 2–3 actions.** For example: lift the phone → two short lines → press the button. Anything more becomes the next clip.
- **Only what the camera can see from where it is.** Not "the cage rises" while the camera is outside the gate, and not "landings slide past" unless the camera rides with her.
- **Don't ask for a cut away from a busy start frame.** H3 keeps a strong composition. Need a new angle? Make it its own still and its own clip.
- **Concrete and physical.** Who, where in frame, doing what, at what pace. Not mood words stacked up.
- **Short:** about 80–130 words for the description, plus the soundscape. The alignment line, the cast line and the dialogue tags are the only fixed text.
- **Dialogue tied to a visible action,** at most 2–3 lines per 15 s, each with its speaker ID.
- **Direct every subject in the frame, for the whole clip.** Anyone visible must have something to do, including the people reacting: a figure runs at the gate, so the girl in the foreground hears it, flinches, stumbles back. Otherwise the model freezes them like props (LE SEPTIÈME's lunge: she stood still while it charged).
- **Every recurring being gets a sheet and a fixed look line,** monsters and ghosts included. Without one, each model invents its own (the gaunt woman in our still became an old man in the LTX clip). Build the sheet from the best frame of it, and paste its look line word for word into every prompt.
- **Before running, read the prompt as the camera:** could one camera, without moving through walls, film exactly this in N seconds?

## Generate or do it in post?

Give the video model **simple visual jobs**. Do in post anything that must be **exact**.

| Job | Who does it | Why |
|---|---|---|
| Faces, bodies, light, camera moves | The video model | It's what it's good at |
| A line that must sound **identical** across clips (the twist voice, a narrator, a phone call) | **Post: clone the voice** and add the line | A model invents a slightly different voice each clip |
| Exact timing of a line, a pause, a scare | Post | Models start lines 1–1.5 s late and drift |
| Text on screen (a phone showing "Maman", a sign, a timestamp) | Post (graphics) | Models misspell and blur text |
| Sound design (silence, a ding, sub-bass, ambience) | Post | Precise, free, never jumps between clips |
| A reaction we only need for 2–4 s | Post: a slow push-in on a close still, with breath and grade | Cheaper than a clip, and stillness reads as dread |

**Voice cloning recipe (free, on your computer):**
1. Cut the character's cleanest line from a generated clip (3–6 s, no music; Whisper captions give the timing).
2. Generate the new lines in the app's **Audio → voice** with a model that takes a voice sample. Chatterbox does (it has no language setting, so check the accent on non-English lines). Qwen3 TTS uses its own voices only.
3. Treat each line for where it's heard: a phone voice gets band-limited and thin (`highpass=300,lowpass=3400`), a voice from the dark stays dry and close.
4. Place it on the timeline in post; the lips don't need to match when the speaker is off-screen or on the phone.

LE SEPTIÈME: Maman's twist ("it's Mum, let me in" from the dark, then "I'm at home, who are you with?" on the phone) is cloned from her one phone line in Clip 1, so both are *exactly* the same voice. That is the scare.

## Editing grammar: how professionals join shots

Most professional edits are **plain cuts**, placed well. A transition is chosen for a reason, never for decoration.

| Technique | What it is | Use it for |
|---|---|---|
| **Cut on action** | Cut mid-movement: a hand reaching, a head turning, a door closing | Hides the cut; the eye follows the motion |
| **Cut on a look** | A character looks, then cut to what she sees | The window: she turns → mum waving outside |
| **Cut on a line** | Cut on the end of a line, or on the listener's reaction | Arguments, so the reaction lands |
| **L-cut / J-cut** | Sound runs past the cut (L) or arrives before it (J) | Mum's "Call me when you get there!" carrying over the bus leaving; street sound under the ident |
| **Sound bridge** | One sound runs across a change of place | The bus engine outside becoming the hum inside |
| **Match cut** | Similar shape, motion or sound on both sides | Mum's waving hand → the daughter's palm on the glass |
| **Establishing shot** | A wide that says where we are before a new place | The bus driving off before we're inside it |
| **Insert / cutaway** | A detail or a side view | The note, the money, the bus leaving |
| **Dissolve (crossfade)** | Sparingly: time passing, or a soft emotional link | A gentle bridge between two moments |
| **Fade to / from black** | The start or end of an act or episode | The slow ending |
| **Smash cut / whip pan** | An abrupt cut, or a fast camera swish | Shocks and energy (the thriller), not a gentle drama |
| **Continuous move (a "oner")** | No cut at all: the camera travels | Our AI **bridge**, but only when both frames share the same space |

Rules that keep it professional:
- **Keep screen direction and the 180° line.** If the bus leaves to the right, it keeps going right, and characters keep their sides.
- **Change the shot size or angle at every cut** (wide → medium → close). Two near-identical frames cut together look like a jump cut.
- **Hold reactions longer than actions,** and cut away from the reaction only when it has landed.
- **When in doubt, cut on sound.** A line, a door, an engine. Sound makes a cut feel motivated.
- **Use an AI bridge** only for a camera move inside one space with frames that are close. For a change of place, use a cut with a sound bridge, or an establishing shot.

## Bridges: moving to a new start frame smoothly

When the next clip needs a **new start frame** (a new angle, a new place, or a frame that holds a character the last clip didn't show), a hard cut can jump. Make a short **bridge** instead:

1. Take the **last frame** of clip A (Continue gives the exact frame) and the **start frame** of clip B.
2. Run a **first-and-last-frame** clip between them, 3–5 s. Describe one continuous move that gets from A to B, with no cuts. Example: "Still crying, she hears a tapping and turns to the window; the camera arcs behind her shoulder as she wipes the fog, and her mother appears outside, waving."
3. Edit A → bridge → B with **plain cuts**, no crossfades. The bridge starts on A's exact last frame and ends on B's exact first frame, so both joins are invisible. A crossfade would only blur them.
4. **Judge a bridge by playing it**, not from a contact sheet. A strip of frames can make a smooth pull-back look like a hard cut. The user loved the Clip 1 → 2 pull-back that a strip made look broken.

Which model: LTX-2.5 on Comfy Cloud does first-and-last-frame cheaply (4 s at 720p, $0.12) and held both faces. MiniMax H3 does it only on its hosted route (5 s at 768p, $0.65); our open H3 workflow is text or image to video only. For a 3–5 s camera move, the model switch is hard to notice.

Also use a bridge when:
- **A model won't cut** where you asked. Make the shot it skipped its own start frame, then bridge to it.
- **A scene changes place.** For example, from the stop to inside the bus.

## Getting the shots you planned

- **H3 stays in a strong start frame.** When the image is a busy, finished composition (an over-the-shoulder shot through a window), H3 often holds that one shot for all 15 s and skips the `[Shot 2]` / `[Shot 3]` cuts.
- **Make a still of each key shot.** If a close-up matters (the apology, the tear), give it its own still and clip, then join with a cut or a bridge.
- **Simple frames cut better.** Let the prompt cut only from simple frames: a medium two-shot, or one person.

## Post-production

Think like the editor and the sound designer, not only the director.

- **Sound leads the picture (J-cut).** Start the next scene's ambience under the black or title card 1–2 s before the picture fades in.
- **One continuous bed per location.** Lay a quiet ambience bed (snowy street, bus-engine hum) under every shot in that place, so each clip's own room tone doesn't jump at the cuts. Switch beds when the location changes.
- **Carry sound across a cut.** Cut picture on a line (mum's "Call me when you get there!" into the bus driving off). Let the outgoing line or the engine hum run a beat into the next shot, so the cut feels motivated.
- **Grade per location, then one look on top.** Push exteriors cool and soft (dawn blue) and interiors warmer (the bus lights). Then add the same light grain and vignette everywhere, so clips from different runs and models match.
- **Slow ending.** Slow the last 2–3 s to half speed, fade to black over 3–4 s, and let the sound tail out a beat after the picture. Hold 1 s of silence, then the title.
- **Episode dressing.** A short studio ident with sound leading in, subtitles in white with a soft shadow low in the frame (italics for voiceover), the title card in the original language plus a translation, and end credits that name the real models.
- **Screen direction and geography.** Keep the world consistent: which side of the road the stop is on, which way the bus leaves, and that traffic drives on the right in Korea. Spell it out in the prompt ("the shelter on the right-hand pavement, the bus in the right-hand lane"). Image models default to whatever looks nice, and it reads as wrong instantly.

- Trim long holds, then lay one score under the whole film, ducked under dialogue; crossfade or cut on action between clips; fade to black at the end; mix to about −14 LUFS.
- Captions: one phrase each, timed to the voice, low in frame (see video-pacing section 5).

## Sound recipes (what we actually used, free, with ffmpeg)

Sound is half of why a cut feels smooth. These are the exact moves from Episode 1 of *엄마 · Mum*; a person can copy them.

- **Street ambience bed** (snowy street) under every exterior shot:
  - `anoisesrc=color=brown` → `lowpass=f=700,highpass=f=60` → `volume=-31dB`
  - 1 s fade out where the place changes
- **Bus interior bed** (a low engine hum) under the interior:
  - sine tones at 58, 87 and 116 Hz mixed with brown noise → `lowpass=f=220` → `volume=-30dB`
  - fades in over 0.6–1 s
- **J-cut into the film:** start the street bed under the black ident card, fading in over its last 1.7 s, so we hear the place before we see it.
- **L-cut out of a scene:** cut the picture to the next shot while the last line plays on.
  - Place each clip's sound on the timeline with `adelay` and mix with `amix` (not `concat`), so sound can run past a picture cut.
  - Let the moment land first (hold about 2.5 s into the line), then cut.
- **Sound bridge across a change of place:** the departing bus engine runs about 1 s over the cut to the interior, then the interior bed takes over.
- **Soften every seam:** a 0.3 s fade in and out on each clip's own sound, so room tone and model-made music don't click or jump at the cut.
- **The ending, kept in sync:** play the last clip at full speed, then hold its last frame for about 2 s (`tpad=stop_mode=clone`) while the picture fades to black and the sound tails off. Hold 1 s of silence before the title.
- **Level the whole film last:** `loudnorm=I=-16:TP=-1.5:LRA=11`, so dialogue sits clearly and nothing peaks.

### Two sound lessons

- **Never slow down a shot with speech in it.** Slowed picture with normal-speed audio puts the voice before the lips (the user: "the audio is said before her mouth moves"). Slow only silent shots, or freeze the last frame instead.
- **Turn the model's music off in every clip.** Set `non_diegetic_music: N/A` for H3 and lay **one** score in post. Each clip inventing its own piano makes the music start and stop at every cut, the main reason the cuts felt "not smooth".

## Brand: IIAYN FILMS

Every film opens with the **IIAYN FILMS** ident and ends with credits plus the IIAYN FILMS end mark.
- **Type:** Space Grotesk for titles and labels; Inter for credit values. Black background.
- **Accent:** one thin orange `#FF7A1A` line per card; the ident's line grows from the centre.
- **Cards:** subtle and calm, letter-spaced caps, no logos besides ours.
- **Credits:** name the real models: pictures, video, camera moves, subtitles, and edit and sound.

## Workflow: from idea to finished film

1. **Plan the whole film first.** Write a hook, a logline, and the cast and world lines (pasted word for word into every prompt). Then a beat table: each clip's beats, its lines with translations, its sound and its start frame. Write the cost and a draft-first order.
2. **Cast first, then a master still for each place.** Make a character sheet, then **one master still per location**. Make every other still in that place as an edit of the master, so the gate, the light and the walls match across shots. LE SEPTIÈME: the cage still was the reference for the "7" landing and the fingers on the gate, and the figure still was an edit of the "7" landing.
3. **Prompts: planned ahead, finished after each output.** Each clip's prompt is drafted from the plan, then finished only after watching the previous clip: its real last frame, where people ended up, what the model ignored. Never fire all clips blind.
4. **One clip at a time, shown before the next.** Draft at 480p, check the pacing and acting, retake only what failed.
5. **A rough cut early** (plain joins, clip sound) to find rushed cuts, jumps and missing shots. Then add inserts and bridges, then post.
6. **Archive every film in one self-contained folder** (e.g. `films/IIAYN-FILMS_<title>/`, kept outside the app repo):
   - `shots.json`: every still and clip, in order, with app job id, model, route, settings, full prompt, start frame, billed cost and render time
   - `01-plan/`: every plan and prompt version
   - `02-stills/` and `03-clips/`: the assets used
   - `04-unused-takes/takes.json`: the failures, with their prompts
   - `05-post/`: scripts, fonts, cards, beds and captions
   - `06-final/`: each cut
   - `README.md`: the running order, the cost, how to rebuild
   
   Anyone can then study, remake or extend the film.

## Hooks and settings that travel

- **Open on a one-line fact card** that sets up the fear or the question in two seconds: "Most buildings in Korea have no 4th floor." / "This building has six floors."
- **Lean on a feeling everyone knows:** a parent's love, a voice that copies someone you trust, a floor that shouldn't exist. The twist should fit in one line.
- **The setting changes everything** (the user switched from Korean to European). Rewrite the hook, the props, the language and the world notes for the new place; don't just reskin. A Korean lift became a Paris cage lift with floor numbers painted on the landings.
- **Make films silent-friendly:** subtitles carry the story, and voiceover lines are in italics.

## Problem → fix playbook

For a person (or an agent) driving the app: what went wrong while we made real films, and the steps that fixed it.

| You see | Why it happens | Do this |
|---|---|---|
| **The clip feels empty or fake** | Too little happens, or nobody speaks | Give it 3–4 short lines per 15 s tied to actions, starting with conflict |
| **She cries instantly** | The model jumps to the end state | Write the stages: still → eyes fill → one tear while calm → only then the break |
| **A face changes between clips** | The clip started from a frame without that person | Start from a still that holds everyone in the clip; reuse one still for clips in the same place |
| **The model never cut to the close-up** | A busy, finished start frame | Make the close-up its own still and its own short clip, then join with a cut |
| **The bus or car is on the wrong side or going the wrong way** | Models default to whatever looks nice | Write the geography: country's driving side, which pavement, which lane, which way it leaves. Retake |
| **People stand in odd places** (waving from the back of the bus) | Blocking wasn't stated | Say where each person stands relative to the set ("one step from the bus door, waving up at her window") |
| **A jump between two clips in the same place** | Different framing, no motion between | A **bridge**: first-and-last-frame from A's last frame to B's start still, 4–5 s, joined with plain cuts |
| **A jump between two places** | A bridge can't fly through walls (it morphs or hard-cuts) | A cut with a **sound bridge** (the engine outside → the hum inside), or an establishing shot first |
| **A cut feels rushed** ("34–37 s was a bit quick") | The picture left before the moment landed | Let the reaction finish, cut 1–2 s later; use an L-cut so the line runs on |
| **The cut was too early at the end of a clip** | Trimmed too tight | Extend the trim back; default to no trim and trim by watching |
| **Clips don't match in colour** | Different runs and models | A grade per location (exterior cool, interior warm), then one look (grain, vignette) over everything |
| **Sound jumps at every cut** | Each clip has its own room tone | Lay one ambience bed per location under all its shots |
| **The quote looks too high** | GPU-time billing: the list price is an upper estimate | Check the real cost after the run (the result shows "Cost $x (quoted $y)") and the balance |
| **A cloud route says "Off until we can show you its exact price"** | It was held until measured (removed Oct 27) | It now runs on its estimate; set OPENHIGGSFIELD_ALLOW_UNMEASURED_CLOUD=0 to hold it again |
| **The voice arrives before her mouth moves** | Picture slowed while the audio played at normal speed | Don't slow shots with speech; freeze the last frame and fade instead |
| **Every cut jumps in sound, even when the picture is fine** | Each clip made its own music and room tone | `non_diegetic_music: N/A` in prompts, one score in post, a bed per location, 0.3 s fades on clip sound |
| **The next clip feels like a rewind** | It restarts on the same frame as an earlier clip | Start from the previous clip's last frame (Continue), or a new angle, so time moves forward |
| **Stills of the same place don't match** (a different gate, different light) | Each still was generated fresh | Make one master still per location and edit every other still from it |
| **The model did the first few things and ignored the rest** | Too many actions, cuts and off-camera events in one prompt | One setup, 2–3 visible actions, ~100 words; split the rest into another still + clip |
| **Someone in the frame stands frozen while the action happens** | The prompt directed only the main action | Write what every visible person does, start to end, especially their reaction |
| **A monster or extra changes from shot to shot** | It had no sheet or look line | Make its sheet from its best frame; paste its look line into every prompt |
| **A jump right after a bridge** | The bridge ends on almost the same framing as the next clip's first frame, and a face changes between them | Drop the duplicate set-up: cut from the bridge straight into the new clip, or cut on a movement |
| **One shot looks washed out between its neighbours** | Each run grades differently; lifted, milky blacks stand out most | Measure each cut (average brightness, the darkest 5 %), then grade that shot to match its neighbours |
| **Set details change between shots** (the bus seats outside vs inside) | Each place was generated from a different still | Make the interior from one master still and reuse it. Free patch: a gentle push-in and a softer, darker background. Real fix: a new shot that sets the place up |
| **An AI impact warps** (a figure melts through a gate, a face smears on contact) | Models are weak at contact | Cut on the last clean frame before contact, and sell the hit with sound (a crash on the cut) |
| **A voice from off-screen sounds too close** | It was recorded dry | Lower it, cut highs (low-pass 3–4 kHz) and lows, add a long dark reverb with most of the dry signal removed and a short pre-delay |
| **A character's voice changes between clips** | Speaker labels like "(S1)" only hold inside one run; every clip invents the voice again, even with the same words | Give the model a sample of the voice (reference audio), or make the lines separately with a cloned voice and lay them in |
| **Lost in the order** ("which was the first frame?") | Many takes and stills | Keep a running-order table: clip, start still, length, trim, transition (the Film tab shows this per card) |

## Log (newest first)

### 2026-10-28 · Fixing a finished film, and a horror teaser in 7 rounds
- **Review every cut with numbers, then by eye.** An editor agent made frame strips around each cut and measured brightness, black level and sound level, then ranked the cuts. Its top two matched the two the user had noticed in MUM: a jump right after a bridge, and a washed-out shot. Fixing just those two (dropping 2 s, matching one grade) made the film feel smoother.
- **Continuity you can't fix in post becomes the next scene.** MUM's bus seats differ outside and inside. Instead of fighting it, the user's new middle beat (she sets the lunchbox aside and chats, then opens it) is planned from the interior's own still, so the place is set up properly.
- **LE SEPTIÈME teaser:** what made it work over 7 rounds:
  - start on character (late, on the phone with Mum) before the scare
  - one flicker, then a straight run, instead of a five-flash strobe
  - fewer, quieter hits: a drone and silence carry the dread
  - keep the original warm colour instead of near black-and-white
  - cut away before any AI warp on impact
  - cut inserts that look like stock photos (the phone screen)
- **Rejected takes still have useful sound.** The scream came from a take cut for its picture; its audio fit the final shot.
- **A teaser ends on one branded card** ("TO BE CONTINUED"), not full credits. A showcase clip ends on an invitation to the viewer, not on the studio's label.

### 2026-10-27 · "LE SEPTIÈME" French suspense short (in progress)
- **Moved from a Korean lift ("4층 · FLOOR 4") to a Paris cage lift** at the user's call. The hook, language and world were rewritten, not reskinned.
- **The master-still chain held the look:** Camille's sheet → the cage still → the "7" landing and the gate fingers, both edits of the cage → the figure still, an edit of the "7" landing. Five stills for about $0.25.
- **Clip 1 is planned with a bridge** that drifts from her face to the "7" landing, a move inside one space, so a good use of a bridge.

### 2026-10-27 · "Goodbye" Korean drama (MiniMax H3, open workflow, 480p drafts)
- **v5:** the end was out of sync because the half-speed slow-mo had her whisper play before her lips moved; replaced with full speed plus a 2 s freeze and fade. The cuts felt "not smooth": the main cause was each H3 clip making its own music. Softened every seam with 0.3 s fades; next films turn the model's music off and lay one score. The IIAYN FILMS cards were redone on brand (Space Grotesk, one orange line).
- **The L-cut out of Clip 2 was too quick** (cut 1 s into mum's line, so the wave with her daughter in the window was lost). Held 2.5 s instead. Let the best moment finish before an L-cut.
- **Spelling out the geography fixed Clip 2 in one retake:** "traffic drives on the right; the bus comes along the road in the right-hand lane and stops at the kerb right beside them; she stands one step from the bus door and waves up at the window where her daughter sits". The bus arrived properly and the daughter was visible in the window.
- **Applied the editing grammar:**
  - An **L-cut** out of Clip 2: the picture cuts to the bus driving off mid-way through mum's "Call me when you get there!" while her voice runs on.
  - A **sound bridge** into the bus: the departing engine runs 1 s over the cut to the interior.
  - Both are free and read as professional, so neither seam needed an AI bridge.
- **The LTX fly-through bridge into the bus** passed a second bus by the camera and hard-cut inside. A change of place wants a cut plus a sound bridge, not a bridge clip.
- **The Clip 1 → 2 pull-back bridge** (LTX-2.5 first-and-last-frame, 4 s, $0.12) was "awesome" in playback, though a frame strip made it look like a hard cut. It was joined with plain cuts on the exact frames.
- **The first bus-drives-off still had the bus on the wrong side for Korea.** Remade with "shelter on the right-hand pavement, bus in the right-hand lane".
- **Ended the episode on the breakdown (Clip 3).** The user felt that was the natural end. Dressed as Episode 1: ident, subtitles from the free local Whisper captions, a slowed fade, the title 엄마 · MUM, and credits.
- **The bridge worked.** A 4 s LTX-2.5 first-and-last-frame clip between Clip 3's last frame (her crying close-up) and Clip 4's start frame (over her shoulder, mum through the window) made a smooth turn to the window. It cost $0.12.
- **Clip 4 never cut.** It started from a busy over-the-shoulder frame, and H3 held that shot for all 15 s, so the apology close-up never came. The fix: keep it as the wide shot and make the close-up from its own still.
- **Silent clips felt empty.** The user said it was "so silent". A rewrite with 3–4 lines per clip (an argument first) made it come alive.
- **The crying came too fast.** The daughter went straight to sobbing. A retake that spelled out the order (still, eyes fill, one tear while calm, only then the break) worked: "much better".
- **Faces drifted when continuing from a close-up.** Continuing from the mother's close-up would have made the model redraw the daughter. Starting Clip 2 from the two-shot kept both faces.
- **The bus changed colour between clips** (red and white, then green). Now the set pieces are named in every prompt.
- **Mum reading her note as a voiceover**, while we watch the daughter's face, was the strongest beat.
- **Cost:** 15 s at 480p billed about $0.30–0.55 each.

### 2026-10-27 · "The Timestamp" thriller pilot (LTX-2.5 on Comfy Cloud)
- **GPT Image 2.5 Flare stills beat FLUX 3 Image** for a likeable lead. It was cheaper too: about $0.06 per still, $0.01 for the character sheet.
- **LTX-2.5 5 s clips held the face but felt flat.** The user moved back to H3 15 s clips, which carry 2–3 beats and sound.
- **Making the lead younger and more striking** (a bob with bangs, a cream knit that pops against teal) mattered for a film meant to travel on X.

### 2026-10-27 · "BREACH" whale VFX film (LTX-2.5 22B on Comfy Cloud, VFX on plates)
- **LTX shines when nobody has to act.** Creatures, water and cities held up well: the wave, the breach crash, the underwater shot and the city lighting up were all strong on the first take. Every shot cost about $0.14 for 5 s at 720p. Faces and acting stay on H3.
- **Whale insertion = first and last frame on matched plates.** Make the empty plate first (P2), then edit it into the "after" plate with the creature's sheet as a second reference (P3, "the same shot, framing, towers and storm as the reference photo, but now…"). Same framing in both, so LTX only has to add the creature. This is the before → after for a making-of.
- **The same trick lights a city:** a dark plate edited into a fully lit one, then first and last frame between them.
- **A creature sheet works like a character sheet.** Five views (side, below, front, tail, eye close-up) on a plain backdrop; paste its look line into every prompt and pass the sheet as a reference on every plate it appears in.
- **Extend kept the motion going.** Continuing the breach gave the crash back down; continuing the wave gave "the lens goes under". Extends quoted $0.29 (+5 s at 720p renders the kept context too).
- **Weak:** a small figure doing a small action (the girl finishing her chalk drawing) barely moved. Give LTX big, visible motion, or use the shot as a short establishing beat.
- **Loud, made in post, free:** a pink-noise storm bed, brown-noise thunder, a rising sub rumble, sine booms on each impact, a muffled underwater roar, a synthesised whale call (a gliding sine with vibrato and harmonics in a big echo), and one pad (dark minor through the storm, warm major as the city lights up). Two moves did most of the work: **silence right before the breach**, and **the whale call starting in the black** as a sound bridge into the next scene.
- **Title-card text must fit:** the spaced title font ran off-screen for a long line. Long lines use the plain centred font.
- **Bug to avoid in post:** a still pushed in with zoompan must be fed as a single frame (`-i still.png`), never `-loop 1`. Looped, zoompan makes `d` frames for every input frame, and the file grew to 7.6 GB.

### 2026-10-28 · LE SEPTIÈME: less won
- **The winning cut was the simplest.** Out of 14 recuts (23–54 s), the user picked "one take": 23 s, one fixed angle on the gate, with only the timer light changing. Before it, a 1:55 cut with many shots, inserts and stingers was judged "not good at all".
- **Lesson:** when the takes are uneven, don't cover the story with every shot. Pick the one angle that holds, and let the light and the sound do the scaring. Shorter is safer: every extra AI shot is another chance for a face to drift or a figure to change.
- **How:** give an editor agent every raw take and ask for many cuts with different ideas (one angle, faces only, inserts only, vertical, silent…), then let the human pick. It's free and quick, and it finds the film inside the footage.
