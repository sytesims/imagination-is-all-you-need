---
name: make-ad-variants
description: Turn one product image into several short ad clips (different hooks, camera moves or looks) with Imagination Is All You Need, prices first. Use when the user wants ad variants, product videos, UGC-style ads or A/B creatives from a product photo.
---

# Ad variants from one product image

Uses the `imagination` MCP server (`mcp__imagination__<tool>` in Claude Code).

1. **Get the image in.** A local path or URL works directly as a media field; or `upload {file}` once and reuse its `/files/…` URL.
2. **Budget.** If the user names one ("3 ads under $2"), `budget {action:"set", name:"Claude", budget_usd}` and keep the `budget_id` for every quote and run.
3. **Pick the tools** with `search_capabilities {query:"product video ad"}`: typically Product Shot (`app-product-shot`) for clean stills, UGC Ad (`app-ugc-ad`), Generate Video (`h3-video`, image to video, `types:["i2v"]`) and Camera Moves (`camera`). `describe` each to get exact fields, presets and lengths.
4. **Write the variants**: 3–5 short ideas, each one hook + one camera move or look, 4–6 s. Keep the product identical (same image every time).
5. **Price everything first**: `budget {action:"plan", steps:[…], budget_id}` and `quote {…, compare:true}` for the video step. Show the user a table (variant, model, place, price) and the total. Offer the free local route (LTX-2.5 22B, `run_on:"local"`) and drafts (`draft:true`) when good enough. Wait for the user's OK on any paid total.
6. **Run**: for each paid variant, `quote` the exact request, then `run {…, quote_id, budget_id, client_request_id:"ad-<n>", wait_sec: 0}`; free ones need no quote_id. Then `status {id, wait_sec: 60}` until done. Never call `run` again to check on a job.
7. If a run is refused (`refused: true`), don't retry the same thing: pick a cheaper model / local, or finish with what you have.
8. **Deliver**: `get_outputs` links per variant, with the real model and where it ran; optionally `stitch_video` a reel. End with `budget {action:"receipt", budget_id}` and show its first block.

If a reply says `sample: true`, tell the user it's a placeholder (mock mode or no key), not a real render.
