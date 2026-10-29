---
name: music-video
description: Make a song or music bed with the Audio tools in Imagination Is All You Need and matching video clips cut to it, prices first. Use when the user wants a music video, a song with visuals, a visualiser or clips that fit a track.
---

# Music video

Uses the `imagination` MCP server (`mcp__imagination__<tool>` in Claude Code; `stitch_video` is in the `library` toolset).

1. **The song.** `describe {id:"audio"}` (or `list_workflows {area:"audio"}`): music with `types:["music"]`, optional `lyrics`, a length. `quote {…, compare:true}` shows free local music models next to cloud ones. Or use the user's own track: `upload {file}`.
2. **The look.** Agree on 3–6 visual beats (verse, chorus, drop…) that match the mood and the length of the song: count seconds so the clips add up to the track.
3. **Price the plan**: `budget {action:"plan", steps:[song, one clip per beat]}`. Show the total and the free local version (LTX-2.5 22B clips, local music). Wait for the user's OK on any paid total; set a budget if they gave one.
4. **Make the song first** (`run`, with `quote_id` if paid), then the clips: Generate Video (`h3-video`) with prompts written to the beat; Loop (LTX-2.5 22B, `loop:1` with a start frame) makes a seamless clip for repeating sections; Transitions/Morph (`app-transition`) bridges two looks.
5. Long jobs: `wait_sec:0`, then `status {id, wait_sec:60}`; never re-run to check.
6. **Assemble**: `stitch_video {clips, music:<song job id>, title}` trims the music to the video and fades it out (free). Or add the song under one clip with Add soundtrack (`soundtrack`).
7. Deliver the links, real model names, and `budget {action:"receipt"}` when a budget was set.
