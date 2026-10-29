# Brand voice: Imagination Is All You Need

Read this before writing any word a user will see: headlines, lines, buttons, chips, tooltips, errors, empty states, emails, README and social posts.

## Who we are

**Brand line:** *Imagination is all you need.*
**Homepage line:** *Your ideas, brought to life.*

We are the friend who makes things with you. We are excited about what you'll make, honest about what it costs, and we never make you feel slow.

## The one rule

**Write like you'd say it to a friend.** If you wouldn't say it out loud, rewrite it.

## Tone by place

The voice stays the same everywhere. The tone changes by place.

| Place | Tone | Example |
|---|---|---|
| Explore, showcase, social | Playful, vivid, a little poetic | "LIGHTS ON." / "Nine words at dusk. Fifteen seconds later the waves hit, the cliff holds, and the lamp wakes up." |
| Tool pages, buttons | Clear, quick, confident | "Generate" · "Make it talk" · "Render video" |
| Errors | Calm, kind, helpful | "That didn't work. Nothing was charged. Try again." |
| Empty states | Warm, inviting | "Your clips will show up here. Make your first one." |
| Settings, pricing | Plain and exact | "Free on your computer. Cloud runs show their price first." |

## Do

- **Concrete over abstract.** Nouns you can picture: "Your cat, as a movie hero", not "stunning visuals".
- **Outcome over feature.** "Your sketch, now moving", not "AI video generation".
- **Talk to "you"** about what *you* will make, not about how the app works.
- **One idea per sentence.** Short. Confident. No hedging.
- **Exact specifics:** "$0.28", "about 2 minutes", "Free". Never "affordable", "fast" or "a few cents".
- **Positive, not hype.** Say what is possible. Never knock other tools.
- **Small delights** in empty states and loading lines ("Mossbun is warming up…").
- **Buttons start with a verb:** Generate, Make, Add, Try again.

## Don't (these make copy sound like AI)

- Buzzwords: seamlessly, effortlessly, unleash, elevate, empower, supercharge, dive into, powerful, robust, stunning, cutting-edge, revolutionary.
- "Not just X, it's Y."
- Reflexive lists of three ("fast, simple, and powerful").
- Chains of colons, semicolons and brackets. Use at most one bracket per sentence.
- Hedging: "may", "can help you", "try to".
- Over-explaining the how ("uses a 22B distilled model with an IC-LoRA to…").
- Dates, internal notes or dev talk in the UI ("2026-10-27", "for now", "per the audit", "the user").
- Raw AI prompts as captions. Prompts go behind "Read the prompt".

## Words we use (one term per idea)

| Idea | Say | Never say in the UI |
|---|---|---|
| Running on the user's own machine | **your computer** ("Free · on your computer") | Mac, M1, Apple Silicon, MPS, local, your machine, your own ComfyUI |
| Comfy-billed runs | **Comfy Cloud** | Comfy (alone), Router, Comfy Router (only in the model info card) |
| Hardware need | **Needs an NVIDIA graphics card** | "doesn't run on a Mac", "too heavy", CUDA |
| Main action | **Generate** (Direct a Shot's last step: **Render**) | Create / Run / Make on buttons |
| Invitations and links | **Make …** ("Make a video") | Create … |
| Saved styles and presets | **Look** / **Looks** | Preset, Style, Saved style |
| A video result | **clip** | take (outside Direct a Shot), video file |
| One of several results | **version** | take, gen |
| A thing you pick to get a job done | **workflow** | tool, app, flow |
| Where it runs (control) | **Run on** | Place, Route, Where |
| Money | **balance**, exact **$** | credits (except Comfy's own unit in tooltips), free gens |
| Where keys live | **Settings → Connections** | "in Settings" or "in Connections" alone |

## Where tech names go

Model names, providers, places and prices live **only** in chips, credits, model menus and "made with" captions. Never in headlines, and never in the first sentence of a line.

✅ Headline "SILVER, MEET STORM." + chip "Seedance 2.0 · Comfy Cloud · $1.09"
❌ "Made with Seedance 2.0 on Comfy Router"

**Exception: credit our platform and partners proudly.** We're built on ComfyUI and entered in Comfy's #OpenSourceHiggsfield challenge with partners Lightricks (LTX), MiniMax (H3), Black Forest Labs (FLUX), NVIDIA and Runpod. Their names may appear in a short credit line under a showcase ("Made with LTX-2.5 on Comfy Cloud"), in section eyebrows and in "Built on ComfyUI" footers. Keep the headline about the result; the credit line names who made it possible. Never use their logos without permission.

## Patterns

- **Headline:** 2–6 big words, uppercase in hero sections. "LIGHTS ON." · "One still. Now it moves." · "Block it in 3D. Film it for real."
- **Line:** one vivid sentence a person would say, then at most one fact. "Stage the scene, move the camera, get a real film back. Free on your computer."
- **Chip:** model · where · price · time. "LTX-2.5 Pro · Comfy Cloud · $1.46 · 6 s"
- **Error:** what happened (not the user's fault) + one next step + "Nothing was charged" when true.
- **Empty state:** what will appear + the action that makes it appear.

## Before and after

| Before (AI-sounding) | After (on brand) |
|---|---|
| "Seamlessly transform your images into stunning videos with cutting-edge AI." | "Your picture, now moving." |
| "A still made free on your Mac." | "One picture first." |
| "LTX-2.5 22B renders real footage that keeps your framing and camera path, with its own sound. Free on your Mac." | "You get a real film back, sound included. Free on your computer." |
| "The provider had a hiccup." | "Comfy Cloud is busy. Try again in a minute. Nothing was charged." |
| "Examples for this app show here once there are some." | "Your results will show up here. Make your first one." |
| "OPEN-SOURCE CREATIVE SUITE ON COMFYUI" | "IMAGINATION IS ALL YOU NEED" |

## Checklist before you ship copy

1. Would I say this out loud to a friend?
2. Is there a buzzword, "not just X", a list of three or a bracket chain? Cut it.
3. Does it say what *you* get, in concrete words?
4. Are tech names only in chips or credits?
5. Is every number exact and true today?
6. Does it say "Mac", "local" or "Comfy" alone? Fix it.
