---
name: ugc-ad
description: Make a full UGC-style video ad from a product photo and a creator (the user's photo or a fictional one) in Imagination Is All You Need - hooks, a 15-second script, talking shots, product B-roll, a 9:16 cut plus square and wide cuts, captions file and a cost receipt, free local models first. Use when the user wants a UGC ad, a creator or testimonial ad, a product review video, a TikTok/Reels ad or a talking-head ad for a product.
---

# UGC ad

Uses the `imagination` MCP server (`mcp__imagination__<tool>` in Claude Code). `stitch_video` is in the `library` toolset: if it isn't listed, ask the user to start the MCP server with `OPENHIGGSFIELD_MCP_TOOLSETS=core,library`. Hook and script patterns: [reference.md](reference.md).

## Ask for
Product photo · product name and 3 benefits · creator photo **or** "make one" (fictional only) · tone (honest, hyped, calm, funny) · length (default 15 s) · budget (optional). Never use a real person's face without their OK.

## Flow
1. **Script**: write 3 hooks and one 15 s script (hook 3 s · problem 3 s · demo 5 s · call to action 4 s) in the user's words. The user picks. Each spoken line ≤ 5 s (one shot each).
2. **Budget** (if named): `budget {action:"set", name:"Claude", budget_usd}` → keep `budget_id` for every quote and run.
3. **Inputs in**: `upload {file}` the product (and creator) photo. No creator photo: `run {tool_id:"create-image", fields:{types:["generate"], prompt:"<fictional creator portrait, phone selfie look>", aspect:"9:16"}, model:"z-image-turbo", run_on:"local", max_usd:0}`. Use this same image for every talking shot.
4. **Find + describe**: `search_capabilities {query:"ugc ad"}` → `describe {id:"h3-video"}` and `describe {id:"app-ugc-ad"}` (presenter scenes, hook styles).
5. **Talking shots** (free): per script line `run {tool_id:"h3-video", model:"ltx-2.5-22b", run_on:"local", max_usd:0, fields:{types:["i2v"], image:<creator>, prompt:"<creator> holds <product> and says \"<line>\" to the phone camera, natural light, handheld", duration:"4", aspect:"9:16", audio:"1"}, client_request_id:"ugc-line-<n>", wait_sec:0}`. LTX voices the quoted line in sync.
6. **Product B-roll** (free): `run {tool_id:"app-product-shot", fields:{image:<product>, scene:"kitchen", aspect:"9:16"}, model:"qwen-image-2.1", run_on:"local", max_usd:0}` → `run {tool_id:"h3-video", from_job:<that job>, fields:{types:["i2v"], prompt:"slow orbit around the product", duration:"3", aspect:"9:16", audio:"0"}, model:"ltx-2.5-22b", run_on:"local", max_usd:0}`.
7. **Hero shot** (optional, paid): `quote {the hook shot, compare:true}` → offer one row (e.g. Kling 3.0 Omni or Seedance 2.0) → `quote` it → tell model, place, price → OK → `run {…, quote_id, budget_id, client_request_id:"ugc-hero"}`.
8. **Wait**: `status {id, wait_sec:60}` for each. A bad shot: redo only that shot (new seed, new `client_request_id`).
9. **Cut**: `stitch_video {clips:[in script order], keep_clip_audio:true, music?, title:"<product> UGC 9:16"}`. Square / 4:5: same call with `aspect:"1:1"` or `"4:5"` (free crop). Wide 16:9: re-run the free shots with `aspect:"16:9"` and stitch again, or `reframe` (paid: quote first).
10. **Captions**: no captions tool yet. Write `captions.srt` yourself from the script and the shot lengths, and give it to the user to drop into their editor.
11. **Deliver**: links (9:16, square, wide), script, `captions.srt`, real models and places, `budget {action:"receipt", budget_id}`, `recipe {action:"export", id:<stitched job>}`. Label the ad as AI-generated.

## Money and retries
- Free steps: `run_on:"local"`, `max_usd:0`. Paid steps: `quote` → price → OK → `run` with `quote_id` (15 min, same request). `refused`: don't resend; quote again or go local.
- Every `client_request_id` names one job: add a short tag for this session (e.g. `ugc-1026a-line-1`) so an old id never returns an old job.
- Start with `wait_sec:0`, then `status`. Never call `run` to check on a job. `sample: true` = mock mode placeholder: say so.
