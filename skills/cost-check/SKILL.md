---
name: cost-check
description: Estimate what a creative request will cost in Imagination Is All You Need before anything runs. Use when the user asks "how much would it cost to…", wants a price before spending, compares models or places, or gives a budget. Spends nothing.
---

# Cost check (nothing runs)

Uses the `imagination` MCP server (in Claude Code the tools are named `mcp__imagination__<tool>`). This skill never calls `run`.

1. **Find the tools.** `search_capabilities {query}` with the user's words ("talking product video", "upscale a clip"). Pick the tool(s) and read their exact options with `describe {id}`.
2. **Price each step.** For one step: `quote {tool_id, fields, model?, run_on?}`. To see every model for the same step: `quote {…, compare: true}` (cheapest first, `free: true` rows run locally at $0).
3. **Price the whole plan.** `budget {action:"plan", steps:[{label, tool_id, params}]}` gives a per-step price and the running total. Stitching clips (`stitch_video`) is local and free, so it needs no step.
4. **Report as a table:** step, tool, real model name, where it runs (`run_on`), price in USD, and whether it is an estimate (`estimated: true`). Then the total, and the cheapest version of the same plan (local models where they are good enough, drafts at about 30% of the price, shorter clips).
5. **Say what is free.** Local runs (`run_on: "local"`) cost $0 but take time on the user's computer: mention the ETA from `describe` / `quote` when it is there.
6. If the user wants to go ahead, hand over to the matching skill (or run step by step): every paid `run` needs the `quote_id` from `quote` for that exact request.

Rules: prices are estimates of what the provider bills the user (1 credit = $0.01). If `search_capabilities` with no query says the backend is `mock`, say that every result would be a sample and nothing would be billed.
