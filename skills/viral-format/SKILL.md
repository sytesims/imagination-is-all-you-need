---
name: viral-format
description: Fill a proven viral video format (glass ASMR, fruit drama, miniature world, CCTV found footage, time freeze, morph, outfit change, infinite zoom, cinemagraph loop, street interview, or a Photo FX effect on a photo) with the user's subject in Imagination Is All You Need, free on their own computer first, price before any paid step. Use when the user wants a trending, viral, meme or "like that viral video" clip, a viral template, or a photo turned into an effect clip.
---

# Viral format

Uses the `imagination` MCP server (`mcp__imagination__<tool>` in Claude Code). `stitch_video` is in the `library` toolset: if it isn't listed, ask the user to start the MCP server with `OPENHIGGSFIELD_MCP_TOOLSETS=core,library`. Prompt skeletons for every format: [reference.md](reference.md).

## Ask for
Format (offer the list below), the slots (subject, setting, hook line), 9:16 or 16:9, an optional photo. Nothing else.

| Format | How it runs (free, local) |
|---|---|
| Glass ASMR, Fruit drama, Miniature world, CCTV found footage | The app's own viral templates: `describe {id:"template/<id>"}` |
| Time freeze, Street interview | `h3-video` t2v / i2v from the reference skeleton |
| Cinemagraph loop | Loop: `describe {id:"video/loop"}` (`loop:1`, start frame) |
| Morph, Outfit change | Morph: `describe {id:"video/morph"}` (`app-transition`, start + end image) |
| Infinite zoom | N stills → `app-transition` `transition:"zoom-through"` per hop → `stitch_video` |
| Photo mode | `photo-fx` with one of its 32 effects (`describe {id:"photo-fx"}`) |

Run `search_capabilities {query:"viral template"}` first: if the app has more templates than this table, offer them too. Never invent one that isn't listed.

## Flow
1. **Find**: `describe` the format's id (table). For a template, take its `run` arguments and swap the slot values in `fields.prompt` for the user's; keep its aspect, length and `audio:"1"`.
2. **Keyframe** (optional; needed for loop, morph, zoom and i2v): `run {tool_id:"create-image", fields:{types:["generate"], prompt, aspect}, model:"z-image-turbo", run_on:"local", max_usd:0, wait_sec:0}`. Morph / outfit change need two stills (same framing, only the change differs).
3. **Clip** on LTX-2.5 22B locally: `run {tool_id:"h3-video", model:"ltx-2.5-22b", run_on:"local", max_usd:0, fields:{types:["t2v"] or ["i2v"], prompt, duration:"2"–"5", resolution:"448p", aspect, audio:"1"}, from_job:<keyframe>?, wait_sec:0}`. Start at Draft (`448p`); offer `576p` (Sharper) once the user likes it.
   - Loop: add `loop:1` with the start frame. Morph: `tool_id:"app-transition", fields:{transition:"morph", image, lastFrame, prompt}`, `model:"ltx-2.5-22b"`. Zoom: one `app-transition` `zoom-through` per pair of stills, then `stitch_video {clips:[…in order]}`.
   - Photo mode: `run {tool_id:"photo-fx", model:"ltx-2.5-22b", run_on:"local", max_usd:0, fields:{types:["<effect>"], image, prompt}}`.
4. **Wait**: `status {id, wait_sec:60}` until done. Local LTX is slow on a Mac (minutes per clip): say so.
5. **Hero version** (optional): `quote {same request, compare:true}` shows cloud rows (Veo 3.1 Fast, Seedance 2.0…). If the user wants one, `quote` that row → tell model, place, price → wait for OK → `run {…, quote_id, client_request_id:"hero-1", wait_sec:0}`.
6. **Deliver**: `get_outputs {id}` per clip, the real model and where it ran, `recipe {action:"export", id}` ("make your own" link), and `budget {action:"receipt", budget_id}` when a budget was set. Label output as AI-made, and keep people in street interviews fictional.

## Money and retries
- Free steps use `run_on:"local"` and `max_usd:0` (no quote_id needed). Every paid step: `quote` → price to the user → OK → `run` with that `quote_id` (one run per quote, 15 min, exact same request). A `refused` reply: don't resend; quote again or go local.
- Every `client_request_id` names one job: add a short tag for this session (e.g. `ugc-1026a-line-1`) so an old id never returns an old job.
- Never call `run` to check on a job. A failed or bad clip: redo only that clip (`retry {id}`, or a new `run` with a new seed and `client_request_id`); keep the rest.
- `sample: true` means mock mode: tell the user it's a placeholder, not a real render.
