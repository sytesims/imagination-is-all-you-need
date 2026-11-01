---
name: product-photo-pack
description: Turn one phone photo of a product into a marketplace-ready image set in Imagination Is All You Need - white packshot, lifestyle scenes, extra angles, a relit hero, upscaled, at each platform's aspect, plus an optional orbit clip - free local models first, priced before any paid edit. Use when the user wants product photos, an Amazon/Etsy/Shopify listing set, e-commerce images, a packshot, lifestyle shots or "make my product photo look professional".
---

# Product photo pack

Uses the `imagination` MCP server (`mcp__imagination__<tool>` in Claude Code). Scene list, marketplace aspects and prompt lines: [reference.md](reference.md).

## Ask for
Product photo · product name (and what must stay exact: label text, colour) · brand colours · target marketplaces (sets the aspects) · budget (optional).

## Flow
1. **In**: `upload {file}` once; reuse its `/files/…` URL everywhere. If a budget is named: `budget {action:"set", name:"Claude", budget_usd}`.
2. **Find + describe**: `search_capabilities {query:"product photo"}`, then `describe {id:"app-product-shot"}`, `describe {id:"app-shots"}`, `describe {id:"app-relight"}`, `describe {id:"image-upscale"}` for the live scenes, angles, looks and local models.
3. **Plan + price**: list the set (name, tool, scene/angle, aspect) and run `budget {action:"plan", steps:[…]}`. All-local is $0; show any paid row with its price. Wait for OK on a paid total.
4. **Packshot** (free): `run {tool_id:"app-product-shot", fields:{image, scene:"studio-white", aspect:"1:1", prompt:"<product name>, label sharp and unchanged"}, model:"qwen-image-2.1", run_on:"local", max_usd:0, client_request_id:"pack-white", wait_sec:0}`. A true transparent cut-out is `app-remove-bg` (cloud, about $0.01–0.02: quote first).
5. **Lifestyle scenes** (free): same tool, one run per scene (`kitchen`, `marble`, `outdoor-sun`, `flat-lay`, `podium`, `studio-colour` with the brand colour in the prompt), at the aspect each marketplace needs (step 8), `client_request_id:"pack-<scene>-<aspect>"`.
6. **Angles** (free): `run {tool_id:"app-shots", fields:{image, shots:["three-quarter-left","side","close-up"]}, model:"qwen-image-edit-2509-angles", run_on:"local", max_usd:0}`.
7. **Relit hero** (free): pick the best scene, `run {tool_id:"app-relight", from_job:<scene job>, fields:{look:"studio-softbox"}, model:"qwen-image-2.1", run_on:"local", max_usd:0}`. Then upscale the hero and the packshot: `run {tool_id:"image-upscale", from_job:<id>, fields:{scale:"2"}, model:"seedvr2-3b-image", run_on:"local", max_usd:0}`.
8. **Aspects**: generate each scene directly at the aspect it needs (`aspect` field, free), using one the model lists in `describe` (Qwen Image 2.1: 1:1, 3:2, 2:3, 16:9, 9:16, 4:3, 3:4, 21:9; no 4:5, so use 3:4 or expand). To extend an existing image to a new aspect instead, `app-expand {image, target:"4:5"}` is cloud (about $0.04): `quote` → price → OK → `run` with `quote_id`.
9. **Label fidelity**: if the local result garbles the label text, offer GPT Image 2.5 or Seedream 5.0 Pro for that one image: `quote {…, compare:true}` → `quote` the row → OK → `run {…, quote_id, budget_id}`.
10. **Orbit clip** (optional, free): `run {tool_id:"app-orbit-shot", fields:{image:<packshot>, orbit:"arc-left", duration:"5", aspect:"1:1"}, model:"ltx-2-19b", run_on:"local", max_usd:0}`.
11. **Wait** with `status {id, wait_sec:60}`; redo only images that came out wrong (new seed and `client_request_id`).
12. **Deliver** a named set as a table (name · aspect · link from `get_outputs`), the real models, `budget {action:"receipt", budget_id}` and `recipe {action:"export", id}` for the hero. No zip or batch export tool yet: list the links.

## Money and retries
- Free: `run_on:"local"`, `max_usd:0`. Paid: `quote` → price → OK → `run` with `quote_id` (one run per quote, 15 min, same request). `refused`: don't resend.
- Every `client_request_id` names one job: add a short tag for this session (e.g. `ugc-1026a-line-1`) so an old id never returns an old job.
- Never call `run` to check a job. `sample: true` = mock placeholder: say so.
