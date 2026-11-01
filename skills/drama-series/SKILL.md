---
name: drama-series
description: Make an episodic vertical micro-drama in Imagination Is All You Need - a series bible with a locked fictional cast, character sheets, a beat sheet, then a voiced 60-90 second episode ending on a cliffhanger, free on local LTX-2.5 first - and keep a series file so the next episode reuses the same cast. Use when the user wants a micro-drama, a short drama series, talking-fruit or talking-object episodes, a soap-opera style series, episode 2 of an earlier series, or recurring characters across videos.
---

# Drama series

Uses the `imagination` MCP server (`mcp__imagination__<tool>` in Claude Code). `stitch_video` is in the `library` toolset: if it isn't listed, ask the user to start the MCP server with `OPENHIGGSFIELD_MCP_TOOLSETS=core,library`. Bible template, beat sheet and shot prompts: [reference.md](reference.md).

## Ask for
Logline · 2–4 characters (fictional only) · look (glossy 3D cartoon, live action, anime…) · episode length (60–90 s) · local only or mixed · **new series or the next episode** (then ask for the series file).

## Flow
1. **Series memory**: the app has no series store yet, so keep `series.json` in the user's working folder (layout in reference.md): bible, each character's name, look line, sheet URL and still URL, episodes done. Next episode: read it and reuse every URL; never redesign a character.
2. **Bible** (new series): cast, look, setting, tone, the recurring hook. Show it; save it to `series.json`.
3. **Cast** (new series, free): per character `run {tool_id:"create-image", fields:{types:["generate"], prompt:"<look line>, front view, plain background", aspect:"9:16"}, model:"z-image-turbo", run_on:"local", max_usd:0}` → `run {tool_id:"app-character-sheet", from_job:<that>, fields:{layout:"turnaround"}, model:"qwen-image-2.1", run_on:"local", max_usd:0}`. Save both URLs. `search_capabilities {query:"consistent character"}` and `describe {id:"app-character-sheet"}` show the live layouts and models.
4. **Beat sheet**: 12–18 shots of 5 s (LTX max) for 60–90 s. One action, one camera, at most one quoted line each; last shot = cliffhanger. Show it.
5. **Price**: `quote {tool_id:"h3-video", fields:{types:["i2v"], duration:"5", aspect:"9:16", audio:"1"}, model:"ltx-2.5-22b", run_on:"local"}` ($0) and, for hard two-character shots, `quote {…, types:["r2v"], image:[<sheet A>, <sheet B>], compare:true}` (Kling 3.0 Omni about $0.56 a shot). `budget {action:"plan", steps:[…]}` → table and total → OK. Set a budget if mixed.
6. **Shots** (free): `run {tool_id:"h3-video", model:"ltx-2.5-22b", run_on:"local", max_usd:0, fields:{types:["i2v"], image:<character still>, prompt:"<shot>, <name> says \"<line>\"", duration:"5", aspect:"9:16", audio:"1", resolution:"448p"}, client_request_id:"ep<N>-s<k>", wait_sec:0}`. Paid shots: `quote` the exact row → `run {…, quote_id, budget_id}`.
7. **Review**: `status {id, wait_sec:60}` each, then look at them. Redo only the bad shots (new seed, `client_request_id:"ep<N>-s<k>-b"`); keep the good ones.
8. **Score** (free): `run {tool_id:"audio", fields:{types:["music"], prompt:"<tone> drama underscore, tense strings, no vocals", duration:"60"}, model:"ace-step-1.5", run_on:"local", max_usd:0}`.
9. **Assemble**: `stitch_video {clips:[shots in order], keep_clip_audio:true, music:<score>, music_volume:0.25, title:"<Series> · Ep <N>"}` keeps the dialogue and lays the score under it.
10. **Deliver**: episode link, the bible and beat sheet, updated `series.json` (episode N, job ids), `budget {action:"receipt", budget_id}`, `recipe {action:"export", id:<a key shot>}`. Label it AI-made.

## Money and retries
- Free: `run_on:"local"`, `max_usd:0`. Paid: `quote` → price → OK → `run` with `quote_id` (one run per quote, 15 min, same request). `refused`: don't resend.
- Every `client_request_id` names one job: add a short tag for this session (e.g. `ugc-1026a-line-1`) so an old id never returns an old job.
- Never call `run` to check a job. `sample: true` = mock placeholder: say so.
