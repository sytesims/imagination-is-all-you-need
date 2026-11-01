# Claude skills for the studio

The [`skills/`](../skills/) folder is a pack of Claude Code skills on top of the [MCP server](MCP.md). Each skill is a folder with a `SKILL.md` (name, description, step-by-step instructions) that uses the MCP tools. Every skill shows the price before a paid run and prefers free local routes when they are good enough.

| Skill | Use it for |
|---|---|
| `viral-format` | Fill a proven viral format (glass ASMR, fruit drama, miniature world, CCTV, time freeze, morph, outfit change, infinite zoom, cinemagraph loop, street interview) or a Photo FX effect with your subject, free on LTX-2.5 22B |
| `ugc-ad` | Product photo + creator (yours or a fictional one) → hooks, a 15 s script, talking shots, B-roll, 9:16 / square / wide cuts and a captions file |
| `product-photo-pack` | One phone photo → white packshot, lifestyle scenes, angles, a relit hero, upscaled, at each marketplace's aspect, plus an orbit clip |
| `ad-multiplier` | One winning ad → N variants (talent, outfit, setting, product, language) with the cut and audio kept, priced as a table first |
| `footage-fx-pass` | Your own clip → vanish, day to night, rain, flood or an alpha matte, then upscale / 60 fps / HDR and a side-by-side before/after |
| `drama-series` | Logline → series bible, locked fictional cast, a voiced 60–90 s vertical episode, and a `series.json` so episode 2 reuses the cast |
| `release-kit` | Song (yours or made locally) → cover, canvas loop, beat-timed clips, a lip-synced performance, the visualiser and 9:16 cutdowns |
| `faceless-explainer` | Topic → script, free local voiceover, one still per sentence in a named look, motion, music, the stitched video and a captions file |
| `make-ad-variants` | One product image → several short ad clips (different hooks, moves, looks), priced first |
| `direct-a-shot` | Describe a shot → Stage and Preview in the app's 3D page → Render with LTX-2.5 22B locally, free |
| `storyboard-to-video` | Script → shots → clips → one assembled film, with a priced plan |
| `video-pacing` | How many beats fit a clip, where to hold faces, timed prompts, splitting long scenes and finishing the edit |
| `film-making` | Direct like a film director: emotion built in steps, talkative scenes, voiceover, speaker IDs, start frames, continuity; a running log of lessons from real tests |
| `music-video` | A song from Audio plus clips cut to it, stitched under the music |
| `free-local-only` | Do the request with free models on your own computer only (`max_usd: 0`) |
| `cost-check` | Estimate a request before anything runs (nothing is spent) |
| `canvas-agent` | Listen to a canvas board's dock and build what the user types (drafts and quotes; only their Go runs) |

`viral-template` was replaced by `viral-format` (2026-10-26): same idea, with ten formats, the app's own viral templates and a photo mode. If you copied the old folder to `~/.claude/skills/`, delete it and copy `viral-format`.

Every skill follows the same money rules, and the server enforces them: free steps run local with `max_usd: 0`; a paid step needs a `quote` first, the price shown to you, and its `quote_id` on `run` (one quote starts one run; `retry` is priced the same way); a failed step is redone on its own, never the whole flow; and the run ends with a receipt (`budget {action:"receipt"}`) and a recipe link. Long prompt banks live next to each skill in `reference.md`.

## Install in Claude Code

1. Start the app: `npm run dev` (the MCP server runs over HTTP on :8788).
2. Add the MCP server and the skills, either:
   - **Plugin:** `/plugin marketplace add /path/to/openhiggsfield`, then `/plugin install imagination@imagination`. Skills show up as `/imagination:make-ad-variants` and so on.
   - **By hand:** `claude mcp add --transport http imagination http://127.0.0.1:8788/mcp` and `cp -r skills/* ~/.claude/skills/`.
   - **Setup helper:** `node mcp/dist/index.js setup claude` (writes the Claude Desktop and Claude Code configs and copies the skills).
3. **Turn on the `library` toolset** (most skills stitch the final video with `stitch_video`): start the MCP server with `OPENHIGGSFIELD_MCP_TOOLSETS=core,library` (or `"toolsets": ["core", "library"]` in the permissions file).
4. Optional: ask before every paid run: start the MCP server with `OPENHIGGSFIELD_MCP_SPEND=ask` (the question names the model, the place and the price; free local runs don't ask).

The same playbooks are also MCP **prompts** (slash commands in clients that list prompts), read from these files, plus `what-can-you-do`.

## One example per skill

What you say, and the steps the skill takes (all free and local unless it says otherwise; every paid step is quoted first):

- **viral-format**: *"A glass ASMR clip of a pomegranate."* → `describe {id:"template/glass-asmr"}` → swap the fruit in its prompt → `run` on LTX-2.5 22B local at Draft → `status` → offer a Veo / Seedance hero version with `quote {compare:true}`.
- **ugc-ad**: *"A 15 s UGC ad for this mug, make up a creator."* → 3 hooks + script → a fictional creator still → one LTX shot per line with the line in quotes (it speaks it) → product B-roll → `stitch_video {keep_clip_audio:true}` for 9:16 and `aspect:"1:1"` for square → `captions.srt`.
- **product-photo-pack**: *"Amazon and Instagram images from this phone photo."* → `app-product-shot` (studio white 1:1, kitchen, marble, flat-lay) → `app-shots` angles → `app-relight` hero → `image-upscale` → optional `app-orbit-shot`; a label that must be exact gets one quoted cloud image.
- **ad-multiplier**: *"Three versions of this ad with different people, under $5."* → `budget {action:"set"}` → `describe {id:"video/object-swap"}` → `quote {compare:true}` → variant table and total → `run` each with its `quote_id` (`keepAudio:"1"`) → receipt.
- **footage-fx-pass**: *"Remove the tourists from this clip."* → `search_capabilities {query:"remove people"}` → `footage-fx/vanish` 2 s Draft → full 5 s → `stitch_video {layout:"side-by-side"}` before/after.
- **drama-series**: *"Episode 1 of a fruit soap opera."* → bible + `series.json` → a still and a turnaround sheet per character → 12–18 shots with quoted dialogue → redo only bad shots → local score → `stitch_video {keep_clip_audio:true, music}`.
- **release-kit**: *"A release pack for my track."* → `upload` the song → cover → canvas loop (`video/loop`) → section clips timed from the BPM → `voice` lip-sync on a singer still → `stitch_video {music}` → 9:16 cutdowns with `aspect:"9:16"`.
- **faceless-explainer**: *"60 seconds on why octopuses have three hearts, claymation look."* → script + shot list → `voice/voiceover` on local Chatterbox → one still per sentence → short LTX moves → music bed → `stitch_video {voice, music, music_volume:0.2}` → `captions.srt`.

## Test the skills

`npm run test:skills` in `mcp/` follows every skill's steps with an MCP client against a mock app (it boots one, or set `OPENHIGGSFIELD_API` / `OPENHIGGSFIELD_MCP_URL` to a sandbox) and checks each SKILL.md names only real tools, modes and models. It refuses to run on anything but the mock backend, so nothing is ever billed.

## Walkthrough: three ad clips for a mug, under $2

What Claude does with `make-ad-variants` when you say *"Make me three 4-second ads from this mug photo, under $2"*. The replies below are trimmed from a real session against a mock backend (so every result is a sample and nothing is billed; on a real backend the same calls make real clips).

**1. Find the tools.** `search_capabilities {query:"product video"}` returns UGC Ad (`app-ugc-ad`), Generate Video presets such as the "Product shot" style, and the models. `describe {id:"h3-video"}` gives the exact fields (`types` t2v / i2v / flf / r2v, `duration` 2–15, `image`…) and per model its limits (LTX-2.5 22B local: 2–5 s, Draft / Sharper, sound, loop).

**2. Set the budget.**

```text
budget {action:"set", name:"Claude", budget_usd:2}
→ { "budget_id": "ab_dd2329694b92", "budgetUsd": 2, "spentUsd": 0, … "note": "Pass budget_id … to quote and run" }
```

**3. Compare prices for the clip.**

```text
quote {tool_id:"h3-video", fields:{prompt:"slow orbit around the mug, soft studio light", types:["i2v"], duration:"4", image:"/samples/sample-product.png"}, compare:true}
→ wan-2.2-ti2v-5b   Local  $0.00  free
  ltx-2.5-22b       Local  $0.00  free
  …
  seedance-2.0      Comfy  $0.88
```

Claude shows this table and proposes: two clips free on LTX-2.5 22B locally, one hero clip on Seedance 2.0 for $0.88. You say yes.

**4. The paid run needs a quote.** Calling `run` without one is refused by the server, with nothing sent:

```text
run {tool_id:"h3-video", …, model:"seedance-2.0", run_on:"comfy-cloud", budget_id:"ab_dd2329694b92"}
→ { "refused": true, "charged": false, "reason": "This run costs money, so it needs a quote_id: call quote with the same request, tell the user the price, then call run with that quote_id. …", "price": { "usd": 0.88 } }

quote {…same request…}
→ { "credits": 88, "usd": 0.88, "billedTo": "Comfy", "route": "comfy-router:router-seedance", "agentBudget": { "remainingUsd": 2, "thisRunUsd": 0.88, "fits": true }, "quote_id": "q_OseTXCbElz9M", "expiresInSec": 900 }

run {…same request…, quote_id:"q_OseTXCbElz9M", client_request_id:"ad-1", wait_sec:0}
→ { "notice": "… this ran as a sample …", "id": "33cf8324", "status": "queued", "eta": 88, "quote": { "usd": 0.88, … }, "poll_after_sec": 22, "next": "… Do not call run again: that starts (and pays for) a second job." }

status {id:"33cf8324", wait_sec:60}
→ { "status": "done", "model": { "name": "Seedance 2.0", "id": "seedance-2.0" }, "place": { "label": "Comfy · Comfy Router" }, "sample": true, "estimate": { "usd": 0.88 }, "result_url": "http://localhost:5174/files/…" }
```

The app also gets the quoted price with the job: if the price or place had changed since the quote, it would refuse the job (nothing charged) and Claude would quote again.

**5. The free clips.**

```text
run {tool_id:"h3-video", fields:{prompt:"slow push in on the mug", types:["i2v"], duration:"3", image:"/samples/sample-product.png"}, model:"ltx-2.5-22b", run_on:"local", max_usd:0, wait_sec:60}
→ { "status": "done", "model": { "name": "LTX-2.5 22B" }, "place": { "label": "Local" }, "estimate": { "usd": 0, "billedTo": "nobody (Local, free)" }, … }
```

**6. The receipt.**

```text
budget {action:"receipt", budget_id:"ab_dd2329694b92"}
Receipt: agent "Claude", budget $2.00
 1. Generate Video   Seedance 2.0   Comfy   est $0.88  actual n/r  done
 2. Generate Video   LTX-2.5 22B    Local   est $0.00  actual free done
```

Optionally `stitch_video` (library toolset) joins the clips into one reel for free, and `recipe {action:"export"}` gives a link that recreates any clip in someone else's copy of the app.

## Writing your own skill

Copy any folder in `skills/`, change the frontmatter `name` and `description` (the description is what makes Claude pick the skill), and keep the money rules: quote first and show the price, a paid `run` carries the `quote_id`, offer the free local route, never call `run` again to check on a job, and end with `budget {action:"receipt"}` when a budget was set.
