---
name: storyboard-to-video
description: Turn a script or idea into a storyboard of shots, then clips, then one assembled video with Imagination Is All You Need, with a priced plan before any spend. Use when the user gives a script, a story, a scene list or asks for a short film or multi-shot video.
---

# Storyboard → shots → clips → one video

Uses the `imagination` MCP server (`mcp__imagination__<tool>` in Claude Code; `stitch_video` and `next_actions` are in the `library` toolset).

1. **Storyboard.** Split the script into 3–8 shots: one subject action + one camera move each, 3–6 s, with one consistent cast and look. Show it as a numbered list and let the user adjust.
2. **Keyframes (optional, better consistency).** One still per shot with Create Image (`describe {id:"create-image"}`), reusing the same character reference images every time.
3. **Choose the video model** with `quote {tool_id:"h3-video", fields:{types:["i2v"], duration}, compare:true}`: cheapest first, free local rows (LTX-2.5 22B) included. Consider drafts (`draft:true`) for a first pass.
4. **Plan and price**: `budget {action:"plan", steps:[one per keyframe and clip, plus music]}`. Show the table and the total; offer the cheaper mix (local for simple shots, cloud only where needed). If the user gave a budget, `budget {action:"set"}` and pass `budget_id` everywhere.
5. **Run shot by shot**: keyframe → clip with `run {tool_id:"h3-video", from_job:<keyframe job>, fields:{prompt, types:["i2v"], duration}, quote_id?, budget_id, client_request_id:"shot-<n>", wait_sec:0}`. Start several with `wait_sec:0`, then `status {id, wait_sec:60}` each. Show progress. A failed shot: `retry {id, run_on}` from its `tryOn`, or rewrite it; don't loop.
6. **Music** (optional): Audio music (`describe {id:"audio"}`, `types:["music"]`, the film's length).
7. **Assemble**: `stitch_video {clips:[job ids in order], music, title}` (free, local).
8. Deliver the film link, each shot's real model and place, and `budget {action:"receipt"}`.
