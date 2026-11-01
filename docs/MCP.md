# MCP server

`mcp/` is an MCP server built on the official TypeScript SDK. Compatible clients can discover catalogued generation tools, inspect inputs, quote permitted runs, monitor results and reuse media. Optional Canvas tools build and edit draft boards. It wraps the app's HTTP API on :8787, so start the app first; the explicit mock backend is suitable for keyless development tests. Film-editor and project-management operations are not all dedicated MCP tools; consult the REST API rather than assuming complete web/MCP parity.

## Safety and scope

The default tool permission is **allow** unless a permissions file or environment setting overrides it. Quotes and budgets are not themselves human approval. Direct MCP `run` calls follow configured permissions; they are not forced through the Canvas web **Go** button. Review the permission configuration and client behavior before granting an agent access to funded provider accounts. An `ask` policy needs compatible client elicitation; unsupported clients must not be described as having an automatic web approval handoff.

Keep HTTP MCP and the API on loopback. Localhost is a network boundary, not user authentication. Do not expose them to untrusted clients or the internet without a separate authentication/network review. Media passed to an AI client or a cloud model can leave your computer; local file paths refer to the MCP host, not necessarily the browser/client computer.

For a first connection, ask the agent to **discover tools and read a board without running anything**. A reachable MCP endpoint is not proof that a client is connected, listening to your board or permitted to run a particular model.

Generic `from_job` / `fromJob` output handoff currently supports images and videos. Pass audio through the destination tool's explicit audio-file field; GLB reuse needs a supported dedicated 3D workflow. This is separate from Recreate input reuse, which can copy supported stored audio inputs as well as images/clips. A preview thumbnail failure does not establish that the underlying input file is missing.

Two ways to connect:
- **stdio** (Claude Desktop, Claude Code, Cursor): the client starts `node mcp/dist/index.js`. `mcp/dist` is not in git, so rebuild it after every pull (`npm run mcp:build`). The server logs a warning when it is older than `mcp/src`, `npm run test:dist-fresh --prefix mcp` fails, and `./agent-skills/setup-agents.sh claude` rebuilds it before writing the config.
- **Streamable HTTP** on **http://127.0.0.1:8788/mcp** (loopback only by default). `npm run dev` starts it from `mcp/src`, so it is always current.

The server reports the display name **Imagination Is All You Need** (`serverInfo.title`). In client configs it is called `imagination` (the `mcpServers` key, `claude mcp add imagination`). The internal ids stay `openhiggsfield` (`serverInfo.name`, the `openhiggsfield-mcp` package and the folder paths), and a config that still uses the `openhiggsfield` key keeps working: the key is only a label in your client. `openhiggsfield-mcp setup claude` replaces an old `openhiggsfield` entry with `imagination`.

## Tools

**Core: 15 tools, enabled by default for stdio.** Eleven catalogue/control tools are `search_capabilities`, `describe`, `quote`, `run`, `status`, `get_outputs`, `cancel`, `upload`, `history`, `recipe` and `budget`. Four read-only searches are also part of core: `search_workflows`, `get_workflow_recipe`, `search_references` and `get_reference` ([below](#library-recipes-and-your-media)).

**Default HTTP: 40 tools.** It enables core plus the 25 Canvas tools. The defined toolsets total 70 tools when all are enabled; a connected client's actual `tools/list` depends on its transport and configuration. Do not describe all 70 as the default. Film-editor/project operations are not all dedicated MCP tools.

Generation/control tools use the live catalogue. `describe` on a model key also returns its `promptGrammar`: input names, syntax, prompt limits and sources where known. Tool-level fields are not a guarantee that every model/route accepts the same settings. Write `@image1` / `@video1` / `@audio1` in prompts; supported builders rewrite them for the model ([PROMPT-GRAMMAR.md](PROMPT-GRAMMAR.md)). A paid `run` needs a fresh `quote_id`, and a quote starts exactly one run (a second use is refused: get a new quote; the same `client_request_id` again only replays the first job). `retry` and the older `generate_*`, `object_swap`, `motion_transfer` and `restyle` tools are priced the same way: called without `quote_id` they answer the price and a `quote_id` and start nothing. Free runs carry their price (0) too, so a run whose place turned paid between quote and submit is refused; quote/request validation and configured budgets/permissions still apply. A quote is not human approval.

Opt-in toolsets (`OPENHIGGSFIELD_MCP_TOOLSETS`): `library` (`retry`, `list_workflows`, `next_actions`, `stitch_video`, `direct_a_shot_prep`), `admin` (`server_status`, `get_spend`), `canvas` and `legacy` (the older per-feature tools). `all` enables all defined toolsets. Details: [mcp/README.md](../mcp/README.md), [permissions](#permissions-allow--ask--block-per-tool) and [skills](MCP-SKILLS.md).

`create_story` (kept for compatibility: the story board has no page in the app since 2026-10-23; a story opens on its own `/jobs/<id>` page) is a multi-shot story on MiniMax H3: 2–12 shots, each starting from the previous shot's last frame (`continue: false` cuts), the same cast in every shot (`cast` by saved element `@name`, or `cast_images`), sound on, then one stitched film. It quotes first (the total is the sum of the shot quotes × takes); `budget_usd` is enforced by the server on that total before anything runs, and the session's agent budget applies when one is set. If shot k fails, the finished shots are kept: `retry_story` resumes from shot k.

Media arguments accept a local file path, an http(s) URL, or a server path such as `/samples/sample-pattern.mp4`. **Model and Run on.** The generate and restyle tools take `model` (a stable key from `list_models`, such as `minimax-h3`, `ltx-2-19b` or `nano-banana-2`; default = the tool's default) and `run_on` (where it runs and who bills it: `local` to run locally, `comfy-cloud` for Comfy (Comfy Cloud or Comfy Router, one Comfy key), `fal`, `replicate`, `bfl`, `minimax`, `dashscope` or `luma`; aliases `gpu` and `comfy` work). Leave `run_on` out to use the **pre-selected place**, the same one the app shows: your saved choice for that tool and model, else the first place that is ready, in the order Comfy, then another API you have connected, then Local. When no place is ready, nothing is pre-selected: the quote says `runnable: false` with `runOn: null` and lists `setupOptions` (each place in that order with what it takes, such as "Add a Comfy key" or a download size), and a job is refused with nothing charged. The app never downloads model files on its own. The older value `auto` still works and means the same thing. Every quote and job names the place it resolved to (`runOn` and `runOnLabel`). A run never moves to another place on its own: when it fails, `get_job` lists the other ready places under `tryOn` (with their price), and you can re-run there yourself. `provider` is **deprecated**: it still accepts an old engine id (`comfy-h3`, `api-minimax-h3`) so existing agents keep working, but new code should send `model` + `run_on`. `list_models` returns each model with its `run_on` options and their status (ready, sample or needs a key) and price; `quote_cost` accepts `model` and `runOn` in `params`, and `get_job` reports the `model` and `place` that actually ran. Prices are estimates of what the provider bills you; nothing is charged on `quote_cost`.

Generate tools wait for the result by default; pass `wait:false` to get the job id back immediately, then call `wait_for_job` (or `get_job`).

### The job view (`get_job`, `wait_for_job`, generate replies)

Every job comes back in one compact shape, so an agent can tell the user the whole truth:

| Field | Meaning |
|---|---|
| `status`, `stage`, `progress` | Where the job is (`progress` is 0–100 or null). |
| `feature` | The feature and real model, e.g. `"Relight · Nano Banana 2"`. |
| `model` | `{name, id}`: the full model name and its key (`{"name": "Nano Banana 2", "id": "nano-banana-2"}`). |
| `place` | `{runOn, label}`: where it ran, e.g. `{"runOn": "comfy-cloud", "label": "Comfy · Comfy Router"}`. `run_on` repeats `runOn` for older agents. |
| `sample` | `true` when nothing real was generated or billed: a place without its key run as a preview (`run_on: "fal"` with no fal key), or a server in sample mode (mock backend). `sampleReason` says why, in a sentence to pass on. **Tell the user a sample is a placeholder.** |
| `estimate` | `{usd, billedTo, estimated, comfyCredits?}`: the estimate at submit ($0 locally and for samples). |
| `actual` | `{usd, source}` once the provider reports a per-run cost, else `null` (the estimate counts). |
| `outputs`, `result_url` | Output URLs (`result_url` = the first). |
| `error` | `{message, code, type, next}` or `null`; `next` says what to do. |
| `tryOn` | On a failed job: the other places of that model with their price (`[{run_on, label, usd, credits, sample?}]`). Nothing moves on its own; submit again with that `run_on`. |
| `workflow`, `credit` | The ComfyUI workflow it is credited with (`{name, source, author, licence, url}`) and the licence credit line, when there is one. |

When a requested `run_on` can't run for real and the job becomes a sample, the generate reply starts with a `notice` that says so. When `wait_for_job` (or `get_job` with `wait: true`, or a generate call) times out, the job keeps running on the server and the reply carries `next`: call `get_job` with the id later. Don't submit again, that starts a second run. REST: `GET /api/jobs/:id` carries the same facts as `isSample`, `sampleReason`, `place`, `feature`, `tryOn` and `spend {estUsd, estUnits, unitLabel, actualUsd, …}`. Test: `npm run test:job-view --prefix mcp` (own mock APIs on :8838–8840).

## Library: recipes and your media

Four read-only tools in **core** (they spend nothing and never run anything) search the app's two library databases ([LIBRARY.md](LIBRARY.md)):

| Tool | What it returns |
|---|---|
| `search_workflows {query?, media?, kind?, include_ideas?, limit?}` | Ranked recipes: every workflow the app runs, the multi-step chains, the agent skills, the user's saved looks, and researched ideas (`status: "idea"`, not built, never runnable). Each hit has its steps (tool ids in order), the default and other models with where they run and the price, a real example with its prompt, source and licence. |
| `get_workflow_recipe {id}` | One recipe in full, plus `canvas`: a ready `canvas_batch` plan (draft cards wired step to step, framed) to put it on a board. Without `canvas_batch`, call `canvas_add_card` per step with `inputs_from` the previous card. |
| `search_references {query?, kind?, source?, model?, project?, favourite?, tag?, since?, until?, limit?, cursor?, include_image?}` | The user's media: every result, upload and saved element, and the app's shipped examples, searched by title, prompt and tags. `path` is the app URL to pass as a media field in `run` (or `job_id` with `from_job`). `include_image` inlines up to four small images. |
| `get_reference {id, include_image?}` | One media item with its path, size or length, date, prompt, model, workflow, project and tags. |

A typical flow: `search_workflows {query:"talking presenter"}` → `get_workflow_recipe {id:"c-presenter"}` → for each step `describe` → `quote` → `run` (with the user's OK), or drop the plan on the Canvas. Pick inputs with `search_references {query:"koi", kind:"image"}`. Ideas are never run: tell the user and ask whether to build one.

## Drive the canvas

The canvas tools are the `canvas` toolset. The app's own HTTP server (`npm run dev` on :8788, the address the Canvas "Connect your agent" sheet gives) turns it on by default; for the stdio server, start it with `OPENHIGGSFIELD_MCP_TOOLSETS=core,canvas`.

The canvas is the free-form board in the app (`/canvas`). In the **Canvas proposal flow**, the agent adds/edits draft cards and requests a priced proposal; the app shows **Go** and **Cancel**, and those proposals wait for the user's decision. This does not restrict separate direct MCP generation calls: they follow the permission policy described above. Do not confuse a Canvas workflow instruction with a server-wide approval guarantee.

The canvas shows your client as connected as soon as it connects (before any tool call), by its own name (for example "Claude Code"), and stops when it disconnects or its MCP server stops.

1. Open the board in the app (Canvas → the board), or let the agent make one and show it (`canvas_create_board`). Edits and proposals need the page open; `canvas_say` works even when it is closed.
2. Connect the MCP server as usual (see [Connect a client](#connect-a-client)).
3. Ask in plain words, for example: *"Read my canvas board, add a product shot and a 6-second video from it, connect them, and propose the runs. Budget $1."*

| Tool | What it does |
|---|---|
| `canvas_list_boards` | Saved boards: id, name, item count, last saved, and `open` (showing in the app right now). |
| `canvas_create_board` `{name?, open?}` | Makes a new empty board (no name = the next "Untitled board N"; names over 80 characters are cut; a repeated name is allowed and flagged) and, by default, shows it on the open canvas page. |
| `canvas_rename_board` `{board_id, name}` | Renames a board; the app shows the new name at once. |
| `canvas_switch_board` `{board_id}` | Shows that board on the canvas page open in the app (the view follows). |
| `canvas_open_board` / `canvas_read_board` `{board_id}` | The board's cards: id, kind, workflow, model, prompt, status, inputs, result URLs and price. Live when the page is open, else the last saved version. |
| `canvas_list_workflows` | The workflow ids `canvas_add_card` accepts (`create`, `video`, `music`, `relight`…), with what each needs. |
| `canvas_add_card` `{board_id, workflow, prompt?, name?, model?, settings?, inputs_from?, at?}` | Adds a **draft** card and returns its real card id. Never runs. `settings` are the tool's own inputs as strings (Extend: `extendSeconds`, `direction`, `resolution`, and on LTX-2.5 `extendMethod` `continue`/`guide`, `guideFrames`, `crossfade`); the card keeps each one its model takes, and the quote and the run use them. |
| `canvas_add_from_job` `{board_id, job_id, out?, at?}` | Places a finished generation (picture, clip or sound) on the board as a result card, the same card the Assets drawer adds, and returns its node id. Wire it into a new card with `canvas_add_card` `inputs_from` (e.g. `extend` for a clip). `out` picks one output of a multi-output job. Nothing runs. Permission: allowed by default (it edits the board, never spends). |
| `canvas_update_card` `{board_id, card_id, prompt?, workflow?, model?, settings?, inputs_from?, version?}` | Edits a card. `settings` merge into the card's own (a new `workflow` starts from its defaults). `inputs_from` replaces its input arrows. `version` (1-based) picks the active version on the card's version strip: the one that flows to the next card. |
| `canvas_connect` `{board_id, from_id, to_id}` | Draws an input arrow between two nodes. Connections are typed: a picture, a clip, a sound or text only goes into a card that takes it; otherwise the error says what that card takes. |
| `canvas_batch` `{board_id, items[], note?}` | Many items at once (up to 80 add_card / add_note / add_frame / connect / move_into). Items take a temporary `ref` ("k1") that later items use where an id goes. All or nothing: one bad item refuses the batch with the reason. Laid out as one group; one Undo removes it; cards are drafts, priced together with one `canvas_propose_run`. |
| `canvas_wait_for_message` `{board_id, since?, timeout_sec?}` | Listens to the board's dock: waits up to 60 s and returns as soon as the user types (or presses Go / Cancel). Each message is the user's own request, with `selection` (the cards they had selected). Pass `since` = the last `next`. One agent per board: a second one gets a polite "busy" until the first has been quiet for 90 s. |
| `canvas_review` `{board_id, cards[{card_id, reviews[{version, verdict, reason?}], recommend?}], say?}` | Your own look at each version (after `get_asset include_image`): "fits" or "check" with a short reason, and the one you recommend. The board shows a calm badge per version and a dot on your pick; the user still chooses. Free. |
| `canvas_next_steps` `{board_id, card_id}` | The workflows that take what a node makes (the board's "What next?" list). Add one with `canvas_add_card {workflow, inputs_from:[card_id]}`. Spends nothing. |
| `canvas_remove_card` `{board_id, card_id}` | Removes a card (finished results stay in Assets). |
| `canvas_propose_run` `{board_id, card_ids, note?}` | Prices every card and shows **one** proposal in the panel: each price, the total, the agent budget left, Go / Cancel. Returns a proposal id. **Nothing spends.** |
| `canvas_proposal_status` `{proposal_id}` | `pending`, `running`, `approved` (with the submitted job ids), `cancelled` or `failed` (with the reason). |
| `canvas_say` `{board_id, text}` | A message from the agent in the panel. |
| `canvas_inbox` `{board_id, since?}` | The user's typed replies and their Go / Cancel decisions, oldest first. Pass `next` from the last call as `since`. |
| `canvas_add_note` `{board_id, text, at?, color?, frame_id?}` | A sticky note (an idea, a shot, a question). |
| `canvas_add_frame` `{board_id, name, around? \| at?, w?, h?}` | A named frame. `around` fits it around nodes and moves them in. |
| `canvas_move_into` `{board_id, ids, frame_id}` | Moves cards or notes into a frame. |
| `canvas_point_at` `{board_id, ids? \| at?, text?}` | Moves the agent's cursor there and circles it, with an optional label. Changes nothing. |
| `canvas_ask_pick` `{board_id, card_ids, text?}` | "Pick the one you like": the cards pulse until the user clicks one. The choice arrives in `canvas_inbox` (a user message with `meta.pickId`, `meta.cardId`). |

`canvas_propose_run` prepares a proposal; it does not submit paid generation itself. Go submits the approved cards through the web's submission path; Cancel submits nothing. Budget scope depends on transport: stdio has one process per client, whereas HTTP uses per-call handles for tools that expose them. Do not assume a budget created by one HTTP call automatically applies to every later Canvas proposal. Review current budget propagation and pinned-budget configuration before using funded accounts; this documentation does not claim that every agent action has the same budget binding.

Example flow (mock mode):

```text
→ canvas_list_boards()
   [{id:"brd_…", name:"Sneaker launch", items:3}, …]
→ canvas_open_board({"board_id":"brd_…"})
   nodes: [{id:"shape:…", kind:"image", workflow:"create", prompt:"…", status:"draft", price:null}, …]
→ canvas_add_card({"board_id":"brd_…","workflow":"create","prompt":"A white sneaker on a warm grey backdrop"})
   card {id:"shape:…", status:"draft"}                          ← no run
→ canvas_add_card({"board_id":"brd_…","workflow":"video","prompt":"A slow push-in","inputs_from":["shape:…"]})
→ canvas_connect({"board_id":"brd_…","from_id":"shape:…","to_id":"shape:…"})
→ canvas_propose_run({"board_id":"brd_…","card_ids":["shape:…","shape:…"],"note":"Launch set, under $1"})
   proposal prop_… · 2 cards · total ≈ $0.36 · Go / Cancel   ← panel waits for the user
   (the user presses Go)
→ canvas_proposal_status({"proposal_id":"prop_…"})
   approved · jobIds ["…","…"]
→ get_job({"id":"…"})                                          ← progress and result URLs
→ canvas_inbox({"board_id":"brd_…"})
   [{type:"decision", decision:"go", proposalId:"prop_…"}, …]
```

`canvas_say` and `canvas_inbox` are the chat channel: say what you are doing in the panel, then read the user's reply or decision. The panel also lists every card the agent added or connected; clicking an item zooms to that card.

### Your AI as the dock's brain

When your agent listens to a board, what you type in the canvas dock goes to it instead of the built-in demo. The dock shows one of four states (a pill and a short line under "Agent"):

| State | Pill · line | What it means |
|---|---|---|
| Not connected | Not connected · "Built-in demo" | No MCP client is connected. Starters play the built-in demo. |
| Connected | Connected · "Not reading this board yet" ("2 agents · not here yet" with several) | A client is connected, but nothing reads what you type. The dock shows the one thing to type in Claude Code, with a copy button. |
| Working | Working · "Working on this board" | Your agent made a `canvas_*` call on this board in the last ~70 s (building over HTTP with no wait loop open). The dock says "Claude Code is working on this board"; what you type waits until it listens. |
| Listening | Listening · "Reading this board" ("Messages go straight in" for a channel) | Its `canvas_wait_for_message` is open on this board (or returned under ~70 s ago), or a channel session is connected (see below). |

Each message you send shows a small status until the agent answers: "Waiting for Claude Code to read it", then "Read" once `canvas_wait_for_message` or `canvas_inbox` has returned it ("Sent to Claude Code" when a channel pushed it; it turns into "Read" when Claude replies). The first `canvas_wait_for_message` without `since` also returns what you typed in the last half hour before the agent started listening, so an early "hello" isn't lost. When your agent picks up a message, the dock says "Claude is planning…" until it replies. Canvas proposals wait for Go; separate direct-run calls still follow their own permissions.

Paste this into Claude (Claude Code, Claude Desktop or any MCP client) after connecting the MCP server. The dock's **Connect your agent** sheet has it with your board id filled in; the same playbook is the `canvas-agent` skill.

```text
Be my canvas agent for the board <board id> in Imagination Is All You Need (the "imagination" MCP server).
Loop: call canvas_wait_for_message with board_id <board id> (pass since = the last next). When it returns nothing, call it again.
Each message is my request; its selection lists the cards I had selected.
Plan with canvas_list_workflows (and list_workflows for whole pipelines), build drafts with canvas_batch, and price them with canvas_propose_run. Never start a run any other way: I press Go.
When takes finish, look at them (get_asset with include_image) and record what you see with canvas_review. I pick the version.
Reply in a sentence or two with canvas_say, then wait again.
```

### Canvas + Claude Code

**Start listening (no setup).** In Claude Code, type the listen prompt the dock shows, with your board id:

```text
/imagination:listen brd_…
```

Claude Code lists MCP prompts as `/<server>:<prompt>` (also `/mcp__imagination__listen`); `imagination` is the server name from `claude mcp add imagination …`, so use your own name if you picked another. Or just say "listen to my canvas": the server instructions teach that phrase, and Claude finds the open board with `canvas_list_boards`. Claude then loops on `canvas_wait_for_message` and answers with `canvas_say`. When that session ends or stops calling, the dock goes back to "connected, not listening" after about 70 s.

**Live push (optional, Claude Code channels).** With [channels](https://code.claude.com/docs/en/channels) (a Claude Code research preview), what you type is pushed straight into your Claude Code session, so you don't need the listen step. Our MCP server supports it in stdio mode with `--channel` (or `OPENHIGGSFIELD_CANVAS_CHANNEL=1`): it declares the `claude/channel` capability and sends each dock message as a `notifications/claude/channel` event (`<channel source="imagination" board_id="…" board_name="…" seq="…">your words</channel>`). Claude answers with `canvas_say` on that board. One-time setup (the dock's Connect sheet shows these with your paths):

```bash
npm run mcp:install && npm run mcp:build      # once: channel mode runs the built stdio server
claude mcp remove imagination                 # only if you added the HTTP address before
claude mcp add imagination -e OPENHIGGSFIELD_API=http://localhost:8787 -- node "$(pwd)/mcp/dist/index.js" --channel
claude --dangerously-load-development-channels server:imagination   # each time you start Claude Code
```

- Needs Claude Code with channels (the flags work on 2.1.x; they don't appear in `claude --help` during the preview) and a claude.ai login or a Console API key. Team and Enterprise orgs need an admin to turn on `channelsEnabled`.
- Custom channels aren't on Anthropic's channel allowlist during the preview, so they need `--dangerously-load-development-channels` (it asks once to confirm at start). Claude Code ignores that flag with `-p`, so live push works only in interactive sessions.
- Only stdio servers can be channels: over HTTP (`--http`) the flag is ignored. Without the start flag, Claude Code drops the pushes silently; that's why the dock says "Sent", not "Read", until Claude answers, and an unanswered message still reaches a later `canvas_wait_for_message`.
- Routing: a message goes to the session listening on its board; if nobody is, to the newest channel session. A `canvas_wait_for_message` agent on a board keeps that board.
- Only messages sent to the API from this computer are pushed (the dock goes through the local web proxy). The API listens on this computer only by default (`HOST`), but anyone who can open the web app can type in the dock, so with live push on keep the web app private to this computer too. Channel mode never declares permission relay.

Sources: [Channels](https://code.claude.com/docs/en/channels), [Channels reference](https://code.claude.com/docs/en/channels-reference), [MCP prompts as commands](https://code.claude.com/docs/en/mcp#use-mcp-prompts-as-commands).

## Agent budgets

An agent can be given a budget in USD (or in credits in team mode). **The server enforces it**, not the agent: every quote and run the MCP server makes carries the budget's id in an `X-OHF-Agent-Budget` header, and the API (`server/src/agentBudget.ts`) refuses a run that would go over it with `errorType: "limit"`, `code: "agent_budget"`, the amount left and the amount needed, **before the job is created**, so nothing is sent to a provider and nothing is charged. Local / your-GPU runs cost $0 and always fit.

- **What counts:** the same spend log and rule as the Spend page: the provider's actual cost when it reports one, else the estimate; $0 for local runs, sample runs, runs that never started and failed runs on providers that don't charge failures. Runs still being admitted are held, so parallel submits can't both slip under the cap.
- **Sessions:** stdio is one process per client and remembers its budget. HTTP initialization returns a session ID, but budgets are explicit per-call handles (`budget_id`), not a shared mutable budget inherited from another HTTP client. Environment-pinned budgets apply to the whole process and cannot be replaced by a per-call handle. Legacy stateless HTTP requests remain supported.
- **Who sets it:** the agent calls `set_budget` when the user gives a budget in the prompt. To pin a budget the agent can't change, start the MCP server with `OPENHIGGSFIELD_AGENT_BUDGET_USD=2` (or `_CREDITS`) and `OPENHIGGSFIELD_AGENT_NAME=Claude`; `set_budget` is then refused. `OPENHIGGSFIELD_AGENT_BUDGET_ID` reuses an existing budget.
- **Unknown or closed ids fail closed** (400 `agent_budget_unknown`): a typo never means "no limit".
- **Where the user sees it:** Spend → Runs shows "Agent: <name>" on each run, with a **Made by** filter; the final video's Details say "Made by agent Claude · Budget $2.00 · Spent $1.59".
- **REST:** `POST /api/agent/budgets {name, budgetUsd}`, `GET /api/agent/budgets[/:id]`, `GET /api/agent/budgets/:id/receipt`, `POST /api/agent/budgets/:id/close`, `POST /api/compose` (stitch), `GET /api/spend?agent=<id>|any|none`.

| Tool | What it does |
|---|---|
| `set_budget` `{name, budget_usd \| budget_credits}` | Starts this session's budget. |
| `get_budget` | Budget, spent, remaining, runs and refusals. |
| `plan_budget` `{steps: [{label, tool_id, params}]}` | One quote per step (same params as `quote_cost`), running total, and whether the plan fits. Spends nothing. |
| `generate_*` `{…, model, run_on, wait}` | As before; with a budget, a run over it comes back as `{refused: true, code: "agent_budget", neededUsd, remainingUsd, charged: false}`. |
| `get_job` `{id, wait?}` / `wait_for_job` `{id}` | The [job view](#the-job-view-get_job-wait_for_job-generate-replies) now / once finished: model, place, sample or real, estimate vs actual, outputs, `tryOn` on failure. |
| `stitch_video` `{clips, music?, voice?, trims?, transition?, title_card?, end_card?, aspect?, fit?, title?}` | Joins clips (job ids) in order with a music bed and a voice track, using ffmpeg on your computer ($0). Every track is levelled, the music dips under the voice and the film lands on −14 LUFS (`duck`, `normalize`, `music_volume` / `voice_volume` / `clip_volume`). `transition` cut / crossfade / dip with `transition_sec`; `title_card` / `end_card` `{text, style clean / bold / quiet / lower, mode black / over, sec}` (`end_card: {}` = "Imagination is all you need."); `aspect` + `fit` (fit / fill / blur, `crop_x` / `crop_y`) reframes; `trims` keeps a part of each clip (`[{in, out} | null]`, seconds). The result is a job in Assets; the Video page's Stitch workflow does the same by hand. |
| `get_receipt` | Itemised: each run's tool, model, where it ran, estimate vs actual, status and result URLs; refused runs; total vs budget. |

### Make a 20-second ad with a $2 budget

Prompt for the agent (Claude Desktop, Claude Code or Cursor with this MCP server connected):

> Make a 20-second ad for our terracotta coffee mug with Imagination Is All You Need. Budget: $2, hard limit. Make the product shot on my GPU, then three 6-second MiniMax H3 clips from it on Comfy Cloud, a music bed, and stitch them. Show me the receipt at the end.

The tool calls it makes (from `mcp/examples/agent-ad.mjs`, mock mode):

```text
→ set_budget({"name":"Claude","budget_usd":2})                         budget ab_…: $2.00
→ plan_budget({"steps":[product shot flux-3-klein local, 3 × h3-video minimax-h3 comfy-cloud 6 s i2v, audio minimax-music-3]})
      product shot (FLUX 3 Klein, Local)       $0.00  Local
      clip 1 / clip 2 / clip 3                 $0.48 each  Comfy Cloud
      music bed                                $0.15  Comfy Cloud
      total $1.59 of $2.00 left → fits: true
→ generate_image({"prompt":"a matte terracotta coffee mug…","model":"flux-3-klein","run_on":"local"})   done · /files/…png
→ generate_video({"prompt":"slow push-in…","mode":"i2v","image":"/files/…png","duration":6,"model":"minimax-h3","run_on":"comfy-cloud","wait":false})   × 3
→ wait_for_job({"id":"…"})   × 3                                          done · /files/…mp4
→ generate_audio({"prompt":"warm acoustic guitar…","mode":"music","duration":30,"model":"minimax-music-3","run_on":"comfy-cloud"})
→ get_budget({})                                                         spent $1.59 of $2.00, $0.41 left
→ generate_video({… a 4th clip …})   ✗ REFUSED by the server: needs $0.48, only $0.41 left. Nothing was sent or charged.
→ stitch_video({"clips":[3 clip ids],"music":"<music id>","transition":"crossfade","end_card":{},"title":"Terracotta mug, 18 s ad"})   done · 19s 1280x720 with music · $0.00
→ get_receipt({})
```

The receipt (`get_receipt`, first text block):

```text
Receipt: agent "Claude", budget $2.00

 1. Create Image     FLUX 3 Klein         Local          est  $0.00  actual   free  done
 2. Generate Video   MiniMax H3           Comfy Cloud       est  $0.48  actual    n/r  done
 3. Generate Video   MiniMax H3           Comfy Cloud       est  $0.48  actual    n/r  done
 4. Generate Video   MiniMax H3           Comfy Cloud       est  $0.48  actual    n/r  done
 5. Audio            MiniMax Music 3      Comfy Cloud       est  $0.15  actual    n/r  done
 6. Stitch (ffmpeg)  ffmpeg               Local          est  $0.00  actual   free  done
  x  refused h3-video (minimax-h3): needed $0.48, $0.41 left. Nothing sent.

(n/r = the provider does not report a per-run cost, so the estimate counts.)
Spent $1.59 of $2.00 ($0.41 left). Estimated $1.59; actual not reported.
```

Run the same flow yourself, with no keys and no spend:

```bash
npm run mcp:install                      # once
node mcp/examples/agent-ad.mjs           # boots its own mock API (temp data, mock keys = real list prices, nothing sent), then cleans up
OPENHIGGSFIELD_API=http://localhost:8787 node mcp/examples/agent-ad.mjs   # against a running API instead (a real backend spends real money, capped at the budget)
```

Prices are list-price estimates; Comfy Cloud bills in Comfy credits (211 per USD) and doesn't report a per-run cost, so the estimate counts toward the budget.

## With the dev stack (default)

```bash
npm run dev
```

The root `dev` script runs three processes through `concurrently`:

| Name | Command | Port |
|---|---|---|
| `api` | `npm run dev -w server` (tsx watch) | 8787 |
| `web` | `npm run dev -w web` (Vite) | 5174 |
| `mcp` | `npm run mcp:dev` = `npm run dev --prefix mcp -- --http --port 8788` (tsx, runs `mcp/src` without a build) | 8788 |

Needs `mcp/node_modules` (once: `npm run mcp:install`). If something is already listening on 8788, the `mcp` process exits with `EADDRINUSE` while `api` and `web` keep running (concurrently is not started with `--kill-others`).

## On its own

```bash
npm run mcp:install && npm run mcp:build  # once (and after changing mcp/src)
npm run mcp                               # stdio
npm run mcp:http                          # = node mcp/dist/index.js --http   (port 8788; MCP_PORT / MCP_HOST to change)
npm run mcp:dev                           # same HTTP server from mcp/src via tsx (no build)
npm run mcp:test                          # end-to-end client test (stdio + HTTP), needs the API running
# background, survives the terminal:
nohup node mcp/dist/index.js --http --port 8788 > /tmp/mcp-http-8788.log 2>&1 &
```

Env: `OPENHIGGSFIELD_API` (default `http://localhost:8787`), `MCP_PORT`, `MCP_HOST` (default `127.0.0.1`), `OPENHIGGSFIELD_MCP_PERMISSIONS` (see `mcp/permissions.example.json`), `OPENHIGGSFIELD_AGENT_BUDGET_USD` / `_CREDITS` / `_ID` and `OPENHIGGSFIELD_AGENT_NAME` (a budget pinned for the process, see [Agent budgets](#agent-budgets)).

## Check that it answers

```bash
curl -s -X POST http://127.0.0.1:8788/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
# → {"result":{"protocolVersion":"2025-03-26",…,"serverInfo":{"name":"openhiggsfield","title":"Imagination Is All You Need","version":"0.1.0"}},…}

curl -s -X POST http://127.0.0.1:8788/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

`GET /health` is a read-only health check. Other non-MCP paths return 404. Initialization returns `Mcp-Session-Id`; send it on subsequent requests and DELETE `/mcp` to close the session. Legacy requests without a known session still use a fresh server per request. The default loopback bind is not authentication; public access needs a separately authenticated gateway.

## Connect a client

Start the app first. The in-app **MCP** page (`/mcp`) and `GET /api/config` expose connection information; confirm its actual paths, ports, transport and toolsets before copying it. Do not put model-provider keys in a shared client configuration.

### Claude Code or a client with local Streamable HTTP support

`npm run setup` / `npm run dev` starts the HTTP MCP service. For Claude Code:

```text
claude mcp add --transport http imagination http://127.0.0.1:8788/mcp
```

Use the actual MCP port if changed. Other clients have their own HTTP configuration formats and version requirements. Do not assume every Claude Desktop version accepts a local `url` entry; use its supported transport, usually stdio for a local executable.

### Local stdio client, including Claude Desktop

Build the entrypoint after installing app dependencies:

```text
npm run mcp:build
```

Merge an `imagination` entry into the client's `mcpServers` configuration. Replace the example paths below with your actual Node executable and source location. This example opts into Canvas as well as core; remove `canvas` if not needed.

```json
{
  "mcpServers": {
    "imagination": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/imagination-is-all-you-need/mcp/dist/index.js"],
      "env": {
        "OPENHIGGSFIELD_API": "http://127.0.0.1:8787",
        "OPENHIGGSFIELD_PUBLIC_WEB_URL": "http://localhost:5174",
        "OPENHIGGSFIELD_MCP_TOOLSETS": "core,canvas"
      }
    }
  }
}
```

On Windows, JSON paths need escaped backslashes, for example `"C:\\Program Files\\nodejs\\node.exe"` and `"C:\\Projects\\imagination-is-all-you-need\\mcp\\dist\\index.js"`. These are examples, not installation assumptions. Keep each path as one JSON string; do not add shell quotes inside it. `node -p "process.execPath"` reports your current Node executable on either platform.

Restart/reconnect the MCP client after changing its configuration. Verify discovery first, then try reading a board without submitting generation. A green API or MCP health response does not prove the client has loaded the intended tools.

The npm package is not published for installation by name. Do not use `npx -y openhiggsfield-mcp` as a release installation command. Advanced users can build a local tarball with `npm pack` inside `mcp/`; ordinary setup should use the local source entrypoint above.

Agent setup helpers and skills for Claude and ChatGPT: [`agent-skills/`](../agent-skills/README.md).

## Permissions (allow / ask / block per tool)

Spend tier: `OPENHIGGSFIELD_MCP_SPEND=ask` (or `"spend": "ask"` in the file) asks before paid runs only; for `run` the question carries the model, place and price, and free local runs don't ask. Every MCP tool is gated. Read-only tools (`search_capabilities`, `describe`, `quote`, `status`, `get_outputs`, `history`, `list_workflows`, `next_actions`, `direct_a_shot_prep`, `server_status`, `get_spend`, the read-only canvas tools, and the legacy readers such as `get_job` and `quote_cost`; the full list is `READ_ONLY` in `mcp/src/permissions.ts`) default to **allow**; everything else follows `default` (allow unless you change it).

- **Config file:** `OPENHIGGSFIELD_MCP_PERMISSIONS=/path/to/permissions.json`. If that's unset, the server uses `./openhiggsfield-mcp.json` in its working directory, then `mcp/permissions.json`. See `mcp/permissions.example.json`:
  `{ "default": "allow", "spend": "ask", "toolsets": ["core", "library"], "tools": { "run": "ask", "retry": "ask", … } }`
- **Env (overrides the file):** `OPENHIGGSFIELD_MCP_DEFAULT=allow|ask|block`, plus comma lists `OPENHIGGSFIELD_MCP_ALLOW`, `OPENHIGGSFIELD_MCP_ASK`, `OPENHIGGSFIELD_MCP_BLOCK` (`*` = all tools).
- **ask:** the server sends an MCP *elicitation* (an approve yes/no form showing the arguments) when the client supports it. If the client doesn't support elicitation, the call is refused with a message saying how to allow the tool. Declining also refuses, and nothing runs. In stateless HTTP mode some clients can't answer elicitations, so prefer stdio for `ask`.
- **block:** the call is refused with a clear message. The tool stays listed, marked `[permission: block]` in its description.
- Test: `npm run test:permissions --prefix mcp`.
