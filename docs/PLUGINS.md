# Plugins

A plugin adds an app from a ComfyUI workflow, without touching the core. Drop a folder into **`plugins/`** at the repo root (override it with `OPENHIGGSFIELD_PLUGINS_DIR`) and restart the app: plugins load once at start, so a new or changed folder shows up after a restart.

## Where a plugin runs

- **On your own ComfyUI: for real.** When the app is connected to your ComfyUI (a local or private address) and the plugin has a node map, a job runs the plugin's workflow there: your file is uploaded, the prompt, seed, resolution, fields and preset are filled in from the node map, and the result comes back like any other app's. Your ComfyUI needs the workflow's custom nodes and models installed first (list them in `components[]` so people know what to install).
- **Everywhere else: a sample.** In mock mode, on Comfy Cloud, or without a node map, the job gives a sample result and saves the workflow a real run would send (`data/<jobId>-graph.json`). The result's workflow export shows it labelled "Sample — nothing ran".
- **Comfy Cloud:** plugins don't run there yet.

Plugins register into the same tool registry as the built-in tools, so a plugin tool automatically appears in:
- the nav, Explore and Assets;
- the media picker (its outputs show under Generations);
- pricing, the model picker (`/api/models`) and `/api/tools`.

The web renders it with the generic `AppTool` screen, driven by the manifest. If a plugin id matches a roadmap ("Soon") entry, the plugin replaces that entry; the example plugin `cutout` does this.

```
plugins/<folder>/
  plugin.json       manifest (required)
  workflow.json     ComfyUI API-format graph (required)
  node-map.json     how form inputs map onto workflow nodes (recommended)
  handler.ts|js     optional server handler, loaded with dynamic import()
  mock-*.mp4        optional mock result clips (mock backend)
```

## Loading and validation

- Plugins load once at server start, in folder-name order. Folders starting with `.` or `_` are ignored.
- Each manifest and its files are validated. A bad plugin is **skipped with clear errors and the server keeps running**.
- `GET /api/plugins` reports every plugin as `{ id, ok, errors[], warnings[], toolId, license, handler, dir }`. The same lines are printed to the server log.
- `npm run plugins:check` validates all manifests, maps each preset onto the workflow, and posts the graphs to the local ComfyUI validator. Nothing is run.

## Manifest (`plugin.json`, schema 1)

| Field | Req. | Notes |
|---|---|---|
| `schema` | ✓ | `1` |
| `id` | ✓ | `^[a-z][a-z0-9-]{1,39}$`, unique across tools. Becomes `/tools/<id>` and `/api/tools/<id>/jobs`. |
| `name`, `category`, `description` | ✓ | Nav label, nav/Explore category, description. |
| `version`, `status`, `previewUrl` | | `status` is a badge such as `new`. |
| `input` | ✓ | `"video"` or `"image"`: the source upload. |
| `output` | | `"image"` or `"video"`: what the plugin makes. Default: read from the node map's output node (`SaveImage` / `PreviewImage` → image, anything else → video). Must agree with that node. |
| `inputs` | | `{ prompt?, mix? (1–4), durations?, enhance?, steps?, resolutions? (subset of 480p/720p/1080p), fields?[] }`. |
| `inputs.fields[]` | | Generic controls: `{ name, label?, kind: select \| text \| number \| boolean, help?, options?[{value,label?}], default?, min?, max?, maxLength?, required? }`. Validated on the server and posted under `name`. Reserved names are rejected. |
| `presets[]` | ✓ | `{ id, label, prompt, group? }`. The type grid; at least one, ids unique. |
| `providers[]` | | Any registered provider ids, open-weights or hosted. Default `["comfy-open"]`. All of them are offered. |
| `license` | ✓ | `{ id }`: SPDX-style id of the plugin as a whole (e.g. `mit`). |
| `components[]` | (warn) | `{ kind: model \| node-pack \| code, name, license, url }`: every model, node pack and dependency. |
| `licenses[]` | | Declares ids not built in: `{ id, name, osi: boolean, url }`. |
| `pricing` | ✓ | `{ gpuSecPerSec: {"480p": n, …}, optionFactors?: {presetId: x}, providerFactors?: {providerId: x} }`. Feeds the shared `priceOf`, so the web price and the server charge always match. |
| `workflow` | ✓ | Relative path to the ComfyUI **API-format** graph. |
| `nodeMap` | (warn) | Relative path to the node map (below). |
| `handler` | | `handler.ts`, `handler.js` or `handler.mjs`. `.ts` needs the tsx runtime (`npm run dev`); ship `.js` for `node dist`. |
| `model`, `modelInfo` | | Model text and model-picker card `{ name, speed: fast \| balanced \| slow, quality: draft \| good \| best, hint, badges? }`. |
| `stages` | | Progress stages `[[key, label], …]`. |
| `mock` | | `{ result? \| results?[], ms? }`: clips for the mock backend; `results[i]` is used for output i. |

### Licences and user control

- **Licence links, not warnings.** The governing licence of a plugin's workflow is the first non-OSI licence among `license` and `components[]`; otherwise it is `license`.
  - It is exposed like any built-in variant: `providers[].license`, `workflowVariants[].license` and `plugin.license`, each `{ id, name, osi, url }`.
  - The UI shows a small **License** link to `url`. It is not a warning or a block.
- **Every provider is offered.** Every provider listed in `providers[]` stays selectable.
- **Open-weights-only is opt-in.** Nothing is hidden by default. Only with `OPENHIGGSFIELD_OPEN_WEIGHTS_ONLY=1` are hosted providers (partner/API nodes, hosted model APIs) dropped, as for the built-in tools; Comfy Cloud open-weight workflows stay. Plugins are never skipped because of their licence.

## Node map (`node-map.json`)

```json
{
  "inputs":  { "video": { "node": "1", "field": "file" }, "prompt": { "node": "5", "field": "text" }, "seed": { "node": "7", "field": "seed" } },
  "fields":  { "detail": [{ "node": "4", "field": "width", "map": { "fast": 768, "fine": 2048 } }], "edgeSoftness": { "node": "4", "field": "blur_size_two" } },
  "presets": { "white": [{ "node": "4", "field": "color", "value": 16777215 }] },
  "output":  { "node": "6" },
  "extraOutputs": [{ "node": "9", "label": "Matte" }]
}
```

- **Mapped inputs:** `inputs` accepts `video`, `image`, `prompt` (the final prompt), `seed` and `resolution`. `fields` maps manifest field names to one or more node inputs, with an optional value `map`. `presets` sets fixed node values for each picked preset.
- **Extra outputs:** `extraOutputs` lists more save nodes from the same run, each with a label; each becomes its own result.
- **Load-time checks:** every node and field must exist in the workflow.
- **Files:** the app fills in the input file itself, and only the job's own upload. A workflow or node map that contains a `"__file"` key is refused at load (it would let a shared plugin upload any file from your computer).
- **Real runs:** on your own ComfyUI the same mapping runs through the app's local runner (`server/src/comfy/plans.ts`), and the submitted graph is kept for the workflow export. A handler's `run` is not called there.
- **Sample runs:** the generic handler applies the map and writes the graph to `data/<jobId>-graph.json`, then runs the generic mock (progress stages plus a sample result).

## Optional handler

```ts
import type { PluginHandler } from '../../server/src/plugins.js';
const handler: PluginHandler = {
  async parseInput(fields, files, ctx) { const input = await ctx.base(); /* generic validation */ return input; },
  run(job, ctx) { return ctx.mockRun(job, ['Output A', 'Output B']); },   // sample runs only; ctx.buildGraph(job.input) → mapped workflow
};
export default handler;
```

- **`ctx` fields:** `manifest`, `dir`, `nodeMap`, `workflowId`, `buildGraph(input)` and `mockRun(job, labels?)`.
- **Errors:** return `{ error }` from `parseInput` to reject a request with a 400 validation error.

## Example: `plugins/cutout` (background removal)

- **Pipeline:** BiRefNet (MIT) through the ComfyUI_BiRefNet_ll node pack (MIT). Video in; the subject comes out on a colour plate (green, blue, white or black presets), plus an alpha-matte video.
- **Fields:** `detail` sets the processing size; `edgeSoftness` (1–30) sets the edge blur.
- **Handler:** adds a speed warning for fine detail at 1080p and labels the two sample outputs (cutout and matte). On your own ComfyUI the run returns both from the node map (`output` + `extraOutputs`).
- **Mock clips:** `mock-cutout.mp4` and `mock-matte.mp4` are procedural (ffmpeg edge detection on our sample clip), not real segmentation.
- **Installing for real use:** clone `lldacing/ComfyUI_BiRefNet_ll` into `ComfyUI/custom_nodes`, `pip install timm`, and put the BiRefNet weights from https://huggingface.co/ZhengPeng7/BiRefNet into `ComfyUI/models/BiRefNet/`.

## Community hub (`/api/hub/*`)

Browse community LoRAs and ComfyUI workflows, curated by business use case, and install them in one click. Code: `server/src/hub/` (catalog + install) and `server/src/routesHub.ts`.

- **Data source.** Mock by default: `server/src/hub/sample.json` holds 30 **sample entries** (invented names, placeholder handles like `sample_creator_01`, plausible stats) shaped like Civitai's public API, each flagged `sample: true`. `OPENHIGGSFIELD_HUB_LIVE=1` queries `https://civitai.com/api/v1/models?types=LORA|Workflows&nsfw=false` (10-minute cache) and falls back to the sample with `liveError` set if Civitai is unreachable.
- **Safety.** `nsfw=false` is always enforced: it is sent to Civitai, any item with `nsfw: true` or `nsfwLevel > 1` is dropped, and `?nsfw=true` returns 400.
- **Licences.** Every item carries Civitai's `license` fields (`allowCommercialUse[]`, `allowNoCredit`, `allowDerivatives`, `allowDifferentLicense`) plus derived `flags` (`commercialUse`, `sellImages`, `sellModel`, `rentModel`, `creditRequired`, `label`). Shown, never blocked.
- **Endpoints.**
  - `GET /api/hub/items?type=lora|workflow&useCase=product-shots|ads|fashion|real-estate|thumbnails&sort=popular|trending|new|rated&q=&limit=&offset=`
  - `GET /api/hub/items/:id` (adds `installAs`)
  - `POST /api/hub/install` `{ id, as? }`: LoRA → `as: "lora"` (recorded as installed under `ComfyUI/models/loras/<file>`, `mock: true`; no download yet). Workflow → `as: "style"` (default; a style preset `{ id, label, prompt }`) or `as: "tool"` (writes `plugins/hub-<slug>/` with plugin.json, the app's own Z-Image Turbo img2img workflow and node-map.json, validated with the plugin schema; it loads on the next server start, `requiresRestart: true`). The tool uses the item's name as its style; it does not download or run the community workflow itself. 409 if already installed.
  - `GET /api/hub/installed`, `DELETE /api/hub/installed/:id` (id is `<itemId>:<as>`; removing a tool deletes its `plugins/hub-*` folder).
- Installs are stored in the `hub_installed` SQLite table.
