---
name: release-kit
description: Build a musician's release pack in Imagination Is All You Need - the song (theirs, or made with free local music models), cover art, a seamless looping canvas, beat-timed clips, a lip-synced performance shot, the full visualiser video and vertical 9:16 cutdowns - free local models first, priced before any paid step. Use when the user wants a music video, a release or promo kit for a song, a Spotify-style canvas loop, cover art plus visuals, a visualiser, or short vertical clips of a track.
---

# Release kit

Uses the `imagination` MCP server (`mcp__imagination__<tool>` in Claude Code). `stitch_video` is in the `library` toolset: if it isn't listed, ask the user to start the MCP server with `OPENHIGGSFIELD_MCP_TOOLSETS=core,library`. Section timing and visual prompts: [reference.md](reference.md).

## Ask for
Their track (file) **or** genre, mood, lyrics and length · tempo (BPM) if known · artist look (their own photo or a fictional singer) · title text for the cover · which pieces they want (default: all).

## Flow
1. **Song**: `upload {file}` their track, or make one (free): `run {tool_id:"audio", fields:{types:["music"], prompt:"<genre, mood, instruments>", lyrics, duration:"30"}, model:"ace-step-1.5", run_on:"local", max_usd:0, wait_sec:0}` (YuE2 and MiniMax Music 3 open are local too: `quote {…, compare:true}`). Note its length.
2. **Sections**: split the song into 4–6 sections with seconds (bars × 4 × 60 / BPM; reference.md). One clip per section, 4–5 s each, so cuts land on bar lines.
3. **Cover** (free): `run {tool_id:"create-image", fields:{types:["generate"], prompt:"<cover concept>", aspect:"1:1"}, model:"z-image-turbo", run_on:"local", max_usd:0}`. Exact title text on the cover: offer GPT Image 2.5 (about $0.03): `quote` → price → OK → `run` with `quote_id`.
4. **Canvas loop** (free): `search_capabilities {query:"spotify canvas"}` → `describe {id:"video/loop"}`, then `run {tool_id:"h3-video", model:"ltx-2.5-22b", run_on:"local", max_usd:0, from_job:<cover>, fields:{types:["i2v"], loop:1, prompt:"<one gentle motion>", duration:"5", aspect:"9:16", audio:"0"}}`.
5. **Section clips** (free): `h3-video` t2v / i2v per section on `ltx-2.5-22b` local, `audio:"0"`, `client_request_id:"rk-sec-<n>"`. Between two looks: `app-transition {image, lastFrame, transition:"morph"}` on `ltx-2.5-22b`.
6. **Performance** (free): a singer still (`create-image`, or their photo) + `run {tool_id:"voice", fields:{types:["lipsync"], image:<still>, speech:<vocal excerpt>}, model:"minimax-h3-talking-photo", run_on:"local", max_usd:0}`. The speech must be 2–15 s (4.7 s on `ltx-2.5-talking-photo`): there's no audio trim tool yet, so ask the user for a short vocal excerpt file or skip this piece.
7. **Wait**: `status {id, wait_sec:60}`; redo only a clip that came out wrong (new seed, new `client_request_id`).
8. **Full video** (free): `stitch_video {clips:[sections in order, performance where it fits], music:<song>, music_volume:1, title:"<Song> visualiser"}`.
9. **Cutdowns** (free): `stitch_video` again with a 15 s and a 30 s subset of clips, the same `music`, and `aspect:"9:16"` (centre crop of 16:9 clips; make clips 9:16 from the start if the cutdowns matter most).
10. **Deliver**: song, cover, loop, full video, cutdowns, real models and places, `budget {action:"receipt", budget_id}` if a budget was set, `recipe {action:"export", id:<loop or cover>}`.

## Money and retries
- Free: `run_on:"local"`, `max_usd:0`. Paid: `quote` → price → OK → `run` with `quote_id` (15 min, same request). `refused`: don't resend.
- Every `client_request_id` names one job: add a short tag for this session (e.g. `ugc-1026a-line-1`) so an old id never returns an old job.
- Never call `run` to check a job. `sample: true` = mock placeholder: say so.
