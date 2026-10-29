---
name: openhiggsfield
description: Generate and edit images, video, audio and 3D, and plan shots with Direct a Shot, with a local Imagination Is All You Need server (ComfyUI open weights plus optional hosted models) through its MCP tools. Use when the user asks to create an image or video, swap a character or object in a clip, transfer motion, restyle footage, add music, sound effects or a voiceover, make a 3D model, stage a shot, or to check what a generation will cost.
---

# Imagination Is All You Need

Imagination Is All You Need is a local creative studio: open-weight models run on the user's own ComfyUI, and hosted models are optional and priced in credits (1 credit = $0.01). You drive it through the `imagination` MCP server (its tools reach images, video, audio, 3D and Direct a Shot).

## Tools
The default (core) tools read the app's own catalogue, so they reach every feature:
- `search_capabilities` finds tools, models (real names, licence, local or not, cheapest price) and workflows; with no query it says whether results are real or samples. `describe {id}` gives the exact fields (JSON Schema), limits and per-model prices.
- `quote` prices the exact request (`compare:true` for every model, cheapest first) and returns a `quote_id`. It spends nothing.
- `run` starts a job on any tool. A paid run needs that `quote_id`; `max_usd` caps it; `budget_id` ties it to a budget; `client_request_id` stops a retried call from starting a second paid job. Long jobs come back with `poll_after_sec`.
- `status {id, wait_sec}` follows a job: real model, where it ran (`place`), **sample** (`sample: true` = a placeholder, nothing generated or billed; say so), estimate vs actual cost, outputs, and on failure `tryOn`. `get_outputs` returns the links. `cancel` stops a job; `upload` adds a file.
- `history` lists past jobs; `recipe` exports, imports and shares recipes; `budget` sets a budget (returns `budget_id`), plans, and prints the receipt and spend.
- Opt-in `library` tools: `retry`, `list_workflows`, `next_actions`, `stitch_video`, and `direct_a_shot_prep` (Direct a Shot: the user stages the shot on the app's 3D page; pass that plan-a-shot job id to check the render, then `run` the `make-it-real` tool, free on this computer). 3D tools run through `run` like any other tool (find them with `search_capabilities`).
- Older per-feature tools (`generate_video`, `quote_cost`, `get_job`…) are in the `legacy` toolset; creative playbooks are separate skills (make-ad-variants, cost-check, free-local-only…).

## How to work
0. **Budget.** When the user names a budget ("under $2"), call `budget {action:"set"}` first (keep the `budget_id`), then `budget {action:"plan"}` with every step, and choose models / `run_on` so the plan fits (`run_on: "local"` is free). If a run is refused (`refused: true`, code `agent_budget`), don't retry it: use a cheaper option or finish with what you have. End with `budget {action:"receipt"}` and show its first block.
1. **Plan in shots.** For video, split the idea into short shots (one subject action plus one camera move each) and write one prompt per shot. Keep characters consistent by reusing the same reference images.
2. **Pick the tool and model.** Call `search_capabilities` and `describe` if unsure. Prefer open-weight models: they run locally at no cost (`local: true`). Mention licence limits from the model card when the user wants commercial use.
3. **Quote first.** Call `quote` before any hosted or long run (a paid `run` needs its `quote_id`), and tell the user the credits and USD. If `estimated` is true, say it's an estimate. Ask before spending more than the user approved.
4. **Draft, then final.** For video, run `draft: true` (480p, about 30% of the price) first. Once the user likes it, re-run at full quality with the same `seed`.
5. **Licences.** There is no rights or Terms check in the app. The user is responsible for each model's licence and the providers' terms (see `/licenses`); mention it when relevant.
6. **Follow up.** Long jobs: `run` with `wait_sec: 0`, then `status {id, wait_sec}` (on a timeout the job keeps running: call `status` later, never run again). If a reply has `notice` or `sample: true`, tell the user the result is a sample, not a real render, and why (`sampleReason`). Report the output URLs from `get_outputs`, the seed, and whether credits were charged or refunded.
7. **Errors.** Errors say whether credits were refunded. Fix the listed issue (each field's problem is listed) and retry once. Don't loop.

## Inputs
Media inputs accept a local file path, an http(s) URL, or a server path such as `/samples/sample-pattern.mp4`. Swap and motion tools take a 4–30 s clip and up to 30 reference images (more than 8 are split into groups).
