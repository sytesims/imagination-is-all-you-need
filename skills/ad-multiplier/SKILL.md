---
name: ad-multiplier
description: Turn one ad that already works into N variants in Imagination Is All You Need - swap the talent, outfit, setting, product or language while the cut, timing and original audio stay - with a priced variant table before anything runs and a receipt after. Use when the user wants ad variants of an existing video, A/B test creatives, "the same ad with a different person/product/location", recasting, or localised versions of an ad.
---

# Ad multiplier

Uses the `imagination` MCP server (`mcp__imagination__<tool>` in Claude Code). `stitch_video` is in the `library` toolset: if it isn't listed, ask the user to start the MCP server with `OPENHIGGSFIELD_MCP_TOOLSETS=core,library`. Variant grids and swap prompts: [reference.md](reference.md).

## Ask for
The ad clip · what may change (talent, outfit, setting, product, language) · how many variants (3–6) · budget · the new product photo / talent image if they have one. New talent must be fictional or someone who agreed.

## Flow
1. **In**: `upload {file}` the ad (and any replacement images). `budget {action:"set", name:"Claude", budget_usd}` → `budget_id`.
2. **Find + describe**: `search_capabilities {query:"video swap"}` → `describe {id:"video/object-swap"}` (presets `main-person`, `outfit`, `product`, `location`…, `keepAudio`, models and their length limits) and `describe {id:"video/restyle"}` for a new look or setting.
3. **Variant grid**: agree a table, e.g. 3 settings × 2 talents. One row = one tool call:
   - Talent: `object-swap {video, preset:"main-person", swapType:"person", refs:[<talent image>], prompt, keepAudio:"1"}`
   - Outfit: `object-swap {…, preset:"outfit", prompt:"the same person wearing <outfit>"}`
   - Product: `object-swap {…, preset:"product", swapType:"object", refs:[<product photo>]}`
   - Setting / look: `restyle {video, preset:"live-action", prompt:"<new setting>", keepAudio:"1"}`
   - Language: `app-translate-video {video, language:"es", voice:"original"}` (local, free; `voice:"clone"` also needs a 5–15 s `voiceAudio` sample)
   No talent image: make one first with `create-image` (`model:"z-image-turbo"`, `run_on:"local"`, `max_usd:0`).
4. **Price every row**: `quote {row, compare:true}` once per kind of row → pick per row: local (`wan-2.2-animate-14b`, `minimax-h3-character-swap`, `wan-2.1-vace-14b`: $0, lower fidelity) or cloud edit models (Kling 3.0 Omni Edit, Seedance: about $1–2 per clip). Then `budget {action:"plan", steps:[…], budget_id}`. Show variant · change · model · place · price and the total. Wait for the user's OK.
5. **Run** each row: paid → `quote` that exact row → `run {…, quote_id, budget_id, client_request_id:"var-<n>", wait_sec:0}`; free → `run {…, run_on:"local", max_usd:0, client_request_id:"var-<n>", wait_sec:0}`. Then `status {id, wait_sec:60}`.
6. **Audio**: `keepAudio:"1"` keeps the original sound. If a variant comes back silent or wrong, `stitch_video {clips:[<variant>], music:<the uploaded ad>, music_volume:1, title}` puts the original audio back (free).
7. **Failures**: redo only the failed row (`retry {id}` or a new quote + run with a new `client_request_id`). Never re-run the whole grid.
8. **Deliver**: the variant table with links (`get_outputs`), real model and place per row, `budget {action:"receipt", budget_id}` (estimate vs actual), and `recipe {action:"export", id}` for the winner.

## Money and retries
- Free: `run_on:"local"`, `max_usd:0`. Paid: `quote` → price → OK → `run` with `quote_id` (15 min, same request). `refused` (budget, price changed): don't resend; quote again or drop the row.
- Every `client_request_id` names one job: add a short tag for this session (e.g. `ugc-1026a-line-1`) so an old id never returns an old job.
- Never call `run` to check on a job. `sample: true` = mock placeholder: say so.
