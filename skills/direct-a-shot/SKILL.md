---
name: direct-a-shot
description: Direct a specific shot (subject, camera move, framing, length) and render it with LTX-2.5 22B locally for free in Imagination Is All You Need, via Stage, Mockup and Render. Use when the user describes a scene shot by shot, wants exact camera control, previs, or a "make it real" render.
---

# Direct a Shot (Stage → Mockup → Render)

Uses the `imagination` MCP server (`mcp__imagination__<tool>` in Claude Code; `direct_a_shot_prep` is in the `library` toolset).

The three steps:
- **Stage** (in the app): pick a 3D scene preset, a camera move and a length on the 3D page, Direct a Shot (`describe {id:"plan-a-shot"}` gives the page link). The browser draws the shot.
- **Mockup** (in the app): record it. The recording becomes a free `plan-a-shot` job (an MP4 of the blocking).
- **Render** (here): LTX-2.5 22B repaints that motion into a real-looking clip on this computer, free.

How to drive it:
1. Turn the user's description into a shot card: subject, action, camera move (dolly in, orbit, crane…), framing, length (2–5 s), look. Show it.
2. Ask the user to stage and record it on the Direct a Shot page (give the link from `describe`). Agents can't draw the 3D mockup themselves.
3. Find the recording: `history {tool_id:"plan-a-shot", limit:3}`.
4. Check it can render: `direct_a_shot_prep {plan_job}` → allowed lengths (frames) and sizes, a starting prompt, whether the model files are here, whether this computer can run it and the ETA. If files are missing, tell the user the size; never start a download.
5. `quote {tool_id:"make-it-real", fields:{planJob, prompt, frames, size}}`: it should be free (local). Write the prompt from the shot card (subject, materials, light, mood; the motion comes from the preview).
6. `run {tool_id:"make-it-real", fields:{planJob, prompt, frames, size:"quick"}, max_usd: 0, wait_sec: 0}`, then `status {id, wait_sec: 120}` with progress. A Mac takes minutes: say so up front.
7. Deliver `get_outputs` links. Offer next steps: a sharper size, a Loop (`describe h3-video`, LTX-2.5 22B with `loop:1`), or music (`music-video` skill).

No staging possible? Fall back to Generate Video on LTX-2.5 22B locally (`h3-video`, `model` from `describe`, `run_on:"local"`) with the camera move written into the prompt or a `videoPreset` from `list_workflows {area:"video"}`.
