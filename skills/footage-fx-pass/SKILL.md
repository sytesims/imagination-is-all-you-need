---
name: footage-fx-pass
description: Fix or transform the user's own video clip in Imagination Is All You Need, free on their computer - remove people (vanish), turn day to night, add rain or a flood, pull an alpha matte - then optionally upscale, smooth to 60 fps or convert to HDR, and deliver a side-by-side before/after reel. Use when the user wants to remove people or objects from footage, change the time of day or weather of a clip, make a matte, clean up or enhance a video, or a before/after VFX reel.
---

# Footage FX pass

Uses the `imagination` MCP server (`mcp__imagination__<tool>` in Claude Code). `stitch_video` is in the `library` toolset: if it isn't listed, ask the user to start the MCP server with `OPENHIGGSFIELD_MCP_TOOLSETS=core,library`. Effect notes and prompts: [reference.md](reference.md).

## Ask for
The clip · the effect (vanish, day-to-night, rain, flood, alpha-matte) · one line on what's in the shot · Draft or Sharp · keep the sound (default yes).

## Flow
1. **In**: `upload {file}` the clip. Only the first 5 s are processed: for a longer clip, ask the user which 5 s and to trim it first.
2. **Find + describe**: `search_capabilities {query:"<effect words, e.g. remove people>"}` → the mode (`footage-fx/vanish`…), then `describe {id:"footage-fx/<effect>"}` for lengths, resolutions, the local model and its time estimate. Tell the user the time: LTX-2.5 22B on a Mac takes minutes per second of video.
3. **Price**: `quote {tool_id:"footage-fx", fields:{video, types:["<effect>"], duration:"2", resolution:"448p", keepAudio:"1"}, model:"comfy-ltx25-iclora", run_on:"local"}` → $0, show the time.
4. **Draft first** (free): `run {same request, max_usd:0, client_request_id:"fx-draft", wait_sec:0}` → `status {id, wait_sec:120}` until done. Show it.
5. **Full pass** once the draft looks right: same request with `duration` up to `"5"` and `resolution:"576p"` (Sharper), `client_request_id:"fx-full"`. If the draft looked wrong, change the prompt (say exactly what to remove or change) before going longer.
6. **Finish** (optional, all local and free; `describe` each first): `app-video-upscale {video:<result>}` (`model:"seedvr2"`), `fps-boost {video, targetFps:"60"}` (`model:"rife-4.9"`), `sdr-hdr {video}` (`model:"ffmpeg-hdr10"`). Use `from_job:<previous job>` to chain without re-uploading.
7. **Before/after**: `stitch_video {clips:[<uploaded original>, <result job>], layout:"side-by-side", keep_clip_audio:true, title:"Before / after"}` (free). For a vertical reel add `aspect:"9:16"`; for an A-then-B cut use the default `layout:"sequence"`.
8. **Deliver**: the result, the before/after reel, real model and place ($0, local), the time it took, and `recipe {action:"export", id}`.

## Money and retries
- This whole skill is free and local: `run_on:"local"`, `max_usd:0`. If the user asks for a cloud upscale, `quote` → price → OK → `run` with `quote_id`.
- Every `client_request_id` names one job: add a short tag for this session (e.g. `ugc-1026a-line-1`) so an old id never returns an old job.
- Never call `run` to check a job (long local jobs: keep calling `status`). A failed step: redo only that step (`retry {id}`), keep the draft and earlier results.
- `sample: true` = mock placeholder: say so.
