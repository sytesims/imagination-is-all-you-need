# Plugins

A plugin adds a tool without touching the core. Drop a folder into **`plugins/`** at the repo root (override it with `OPENHIGGSFIELD_PLUGINS_DIR`) and restart the server.

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
  "output":  { "node": "6" }
}
```

- **Mapped inputs:** `inputs` accepts `video`, `image`, `prompt` (the final prompt), `seed` and `resolution`. `fields` maps manifest field names to one or more node inputs, with an optional value `map`. `presets` sets fixed node values for each picked preset.
- **Load-time checks:** every node and field must exist in the workflow.
- **Generic handler:** it applies the map and writes the graph to `data/<jobId>-graph.json`. In mock mode it then runs the generic mock (progress stages plus a mock clip, with the input's audio).

## Optional handler

```ts
import type { PluginHandler } from '../../server/src/plugins.js';
const handler: PluginHandler = {
  async parseInput(fields, files, ctx) { const input = await ctx.base(); /* generic validation */ return input; },
  run(job, ctx) { return ctx.mockRun(job, ['Output A', 'Output B']); },   // ctx.buildGraph(job.input) → mapped workflow
};
export default handler;
```

- **`ctx` fields:** `manifest`, `dir`, `nodeMap`, `workflowId`, `buildGraph(input)` and `mockRun(job, labels?)`.
- **Errors:** return `{ error }` from `parseInput` to reject a request with a 400 validation error.

## Example: `plugins/cutout` (background removal)

- **Pipeline:** BiRefNet (MIT) through the ComfyUI_BiRefNet_ll node pack (MIT). Video in; the subject comes out on a colour plate (green, blue, white or black presets), plus an alpha-matte video.
- **Fields:** `detail` sets the processing size; `edgeSoftness` (1–30) sets the edge blur.
- **Handler:** adds a speed warning for fine detail at 1080p and returns two outputs (cutout and matte).
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
  - `POST /api/hub/install` `{ id, as? }`: LoRA → `as: "lora"` (recorded as installed under `ComfyUI/models/loras/<file>`, `mock: true`; no download yet). Workflow → `as: "style"` (default; a style preset `{ id, label, prompt }`) or `as: "tool"` (writes `plugins/hub-<slug>/` with plugin.json, a Z-Image Turbo img2img workflow and node-map.json, validated with the plugin schema; it loads on the next server start, `requiresRestart: true`). 409 if already installed.
  - `GET /api/hub/installed`, `DELETE /api/hub/installed/:id` (id is `<itemId>:<as>`; removing a tool deletes its `plugins/hub-*` folder).
- Installs are stored in the `hub_installed` SQLite table.
