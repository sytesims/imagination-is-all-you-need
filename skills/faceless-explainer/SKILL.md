---
name: faceless-explainer
description: Turn a topic into a narrated faceless video in Imagination Is All You Need - script and shot list, a voiceover (free local text to speech), one still per sentence in a named look (stickman, editorial motion graphics, claymation, paper cut, 3D cartoon…), gentle motion, a music bed, the stitched video and a captions file - free local models first. Use when the user wants a faceless YouTube/TikTok video, an explainer, a narrated video from a script or topic, an educational short, or a "faceless channel" video.
---

# Faceless explainer

Uses the `imagination` MCP server (`mcp__imagination__<tool>` in Claude Code). `stitch_video` is in the `library` toolset: if it isn't listed, ask the user to start the MCP server with `OPENHIGGSFIELD_MCP_TOOLSETS=core,library`. Looks, voice choice and script frame: [reference.md](reference.md).

## Ask for
Topic (or notes / a link they paste) · length (60–180 s, default 60) · look (one of the looks in reference.md) · voice (warm narrator, crisp, deep calm, energetic host…) · 9:16 or 16:9.

## Flow
1. **Script**: about 150 spoken words per minute. Hook in the first sentence, one idea per sentence, a closing line. Then a shot list: sentence · visual · seconds (≈ words ÷ 2.5). Show both; the user OKs.
2. **Find + describe**: `search_capabilities {query:"text to speech"}` → `describe {id:"voice/voiceover"}` (voices, local models) and `describe {id:"create-image"}`.
3. **Voiceover** (free): `run {tool_id:"voice", fields:{types:["voiceover"], prompt:"<full script>", voice:"narrator-warm"}, model:"chatterbox", run_on:"local", max_usd:0, wait_sec:0}`. A studio voice instead (ElevenLabs, about $0.10): `quote` → price → OK → `run` with `quote_id`. Use the voiceover's real length to set the shot lengths.
4. **Stills** (free): one per shot, the look's style line + the visual, same seed for the whole video: `run {tool_id:"create-image", fields:{types:["generate"], prompt:"<look line>, <visual>", aspect}, model:"z-image-turbo", run_on:"local", max_usd:0, seed, client_request_id:"fx-still-<n>", wait_sec:0}`.
5. **Motion** (free): `run {tool_id:"h3-video", from_job:<still>, fields:{types:["i2v"], prompt:"<slow push in / pan / small motion of the subject>", duration:"<2–5>", aspect, audio:"0"}, model:"ltx-2.5-22b", run_on:"local", max_usd:0}`. For variety, a few shots can use `photo-fx` effects (`describe {id:"photo-fx"}`).
6. **Music bed** (free): `run {tool_id:"audio", fields:{types:["music"], prompt:"<calm instrumental matching the topic>, no vocals", duration:"60"}, model:"ace-step-1.5", run_on:"local", max_usd:0}`.
7. **Wait**: `status {id, wait_sec:60}` for each job; redo only the shots that came out wrong (new seed, new `client_request_id`).
8. **Assemble** (free): `stitch_video {clips:[in order], voice:<voiceover job>, music:<music job>, music_volume:0.2, title:"<topic>"}`.
9. **Captions**: no captions tool yet. Write `captions.srt` yourself from the script and the shot timings, and hand it over for their editor or upload page.
10. **Deliver**: the video, script, `captions.srt`, real models and places, `budget {action:"receipt", budget_id}` if a budget was set, `recipe {action:"export", id:<a still>}`.

## Money and retries
- Free: `run_on:"local"`, `max_usd:0`. Paid: `quote` → price → OK → `run` with `quote_id` (one run per quote, 15 min, same request). `refused`: don't resend.
- Every `client_request_id` names one job: add a short tag for this session (e.g. `ugc-1026a-line-1`) so an old id never returns an old job.
- Never call `run` to check a job. `sample: true` = mock placeholder: say so.
