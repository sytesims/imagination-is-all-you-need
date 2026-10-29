---
name: free-local-only
description: Do a creative request in Imagination Is All You Need using only free models that run on the user's own computer (no cloud spend at all). Use when the user says free, local, offline, no credits, no API, or on my GPU/Mac.
---

# Free and local only

Uses the `imagination` MCP server (`mcp__imagination__<tool>` in Claude Code). Every run here costs $0.

1. **Find local options.** `search_capabilities {query: "<the request> free"}`: the word "free" keeps only tools and models that run locally. `describe {id}` shows, per model, the `run_on` places; use only models with a `local` place whose status is `ready`.
2. **If nothing local fits,** say so plainly and stop: name the closest local option and what it can't do, and the cheapest cloud option with its price (from `quote`), but do not run the cloud one unless the user asks.
3. **Quote anyway.** `quote {tool_id, fields, model, run_on: "local"}` must say `free: true`. Read `blockedReason` if it can't run (often model files not downloaded: tell the user the size; never start a download yourself).
4. **Run** with `run {…, run_on: "local", max_usd: 0}`. `max_usd: 0` makes the server refuse anything that would cost money. Local video is slow (minutes per clip on a Mac): start with the shortest length and the draft size, use `wait_sec: 0`, then `status {id, wait_sec: 60}` and tell the user the progress.
5. **Hand results on locally**: `next_actions {id}` (library toolset) or `run` with `from_job` (no re-upload); `stitch_video` joins clips and music for free.
6. Finish with the output links from `get_outputs {id}`, the real model names, and "cost: $0 (ran on this computer)".

Good free routes today (check `describe`, they change): LTX-2.5 22B for video (Generate Video, Loop, Transitions/Morph, Render in Direct a Shot), local image models in Create Image, local music and voice models in Audio.
