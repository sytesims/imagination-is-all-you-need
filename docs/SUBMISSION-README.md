# Imagination Is All You Need

**Imagination is all you need.** One app for images, video, audio and 3D. Run it on your computer or in the cloud. Open source (AGPL-3.0-or-later), built on ComfyUI workflows, Comfy Cloud and Comfy Router. Built for ComfyUI's **#OpenSourceHiggsfield** challenge.

<!-- DEMO VIDEO: add the link to the new demo post on X here once it is posted. -->
**Demo:** the new demo video is coming soon. Contains AI-generated content.

The main [README](../README.md) covers what you can make, the Canvas, where runs happen (your computer, Comfy Cloud, Comfy Router), prices, what it runs on, the official Comfy templates, the Claude connector (MCP server and skills) and setup. This page is the short version for judges.

## In one minute
- **Direct a Shot:** stage a scene and a camera move in simple 3D in your browser, record a free mockup, then LTX-2.5 22B with Lightricks' Layout to Render IC-LoRA films it with sound, keeping your framing and camera path. Free on your own computer, or as a Comfy Cloud workflow job.
- **A full studio:** 17 image, 27 video, 8 audio and 5 3D workflows, plus 24 one-click apps and 82 camera presets. Generation uses supported ComfyUI workflows or API adapters; browser editing/media finishing are separate operations. Results retain model/run information. Workflow export distinguishes available submitted, rebuilt, equivalent and partner graphs rather than promising an exact graph for every operation.
- **Footage Effects (LTX VFX):** Lightricks' Clean Plate, Day to Night and Water Simulation IC-LoRAs on your own clip, on your computer or on Comfy Cloud; Alpha Gen on your computer. Example renders are coming soon.
- **Canvas:** each card is a whole workflow; connect cards and results flow on. Claude drafts and prices the board, nothing runs until you press Go, and View workflow shows the exact ComfyUI graph behind a finished card (runs on your computer or Comfy Cloud).
- **Agents:** 70 MCP tools in all; 15 in the default stdio core toolset (11 catalogue/control tools plus four read-only searches); default HTTP also enables 25 Canvas tools. Optional toolsets expose other operations. Quotes, configured permissions and budgets govern direct runs; Canvas proposals separately wait for Go. See [MCP.md](MCP.md) and the 17 included [skills](MCP-SKILLS.md).

## How it uses the Comfy Developer Platform
- **Local ComfyUI** over its HTTP and WebSocket API.
- **Comfy Cloud API v2 workflow jobs:** our own graphs from [`workflows/cloud/`](../workflows/cloud/README.md), one Comfy key.
- **Comfy Router** for hosted models, price estimate first, with the cost Comfy reports recorded.
- **Official templates:** 30 official Comfy templates bundled, over 120 credited with source and licence.
- **Partner nodes** inside Cloud jobs (LTX-2.5 Pro / Fast, Tripo 3.1, Topaz).
- **Deployments:** Comfy deployments are supported: connect your own from Settings.

## Run it
Use Node.js 22, 24 or 26 (24 recommended), npm, and ffmpeg/ffprobe for media operations:

```bash
npm run setup      # installs app dependencies, checks setup, starts web/API/MCP
```

With no GPU or key, users can browse the bundled Examples project. Generate requires a connection; explicit developer mock mode is separate. Setup and real-run requirements: [Install in one line](../README.md#install-in-one-line) and [INSTALL.md](INSTALL.md).

## Partner models
- **LTX:** LTX-2.5 22B is the core video model for Direct a Shot, Footage Effects, Generate Video, Transitions, Loop, Extend and talking photos.
- **MiniMax:** MiniMax H3 (Generate Video, Extend, Character Swap, CrossView on your deployment) and MiniMax Music 3.
- **Black Forest Labs:** FLUX 3 Image Klein locally (NVIDIA GPU), plus FLUX 3 Image and Video through Comfy.

## Licences
- **App code:** AGPL-3.0-or-later ([LICENSE](../LICENSE)), with an extra permission for tldraw ([NOTICE](../NOTICE)). Open source and share-alike, also when you host a changed copy for others. Models keep their own licences.
- **Models, nodes and dependencies** keep their own licences: [LICENSES.md](../LICENSES.md), [workflows/LICENSES.md](../workflows/LICENSES.md), [ATTRIBUTION.md](ATTRIBUTION.md), [USAGE-NOTES.md](USAGE-NOTES.md), and the in-app **Models & licences** page.
- **Credit lines** shown in the app: "Powered by MiniMax H3", "Powered by Stability AI" (Stable Audio Open) and "Built with Fish Audio" (Fish Audio Drama 3).
- **Demo video voiceover:** Kokoro-82M (Apache-2.0), voice `af_heart`.

## AI-generated content
Everything the tools make is AI-generated. Media we show from the tools carries an **AI-generated** label; please label your results too when you share them. The built-in sample clips are Blender Foundation open movies (CC BY 3.0), not generations.

## Not affiliated with Higgsfield
Imagination Is All You Need is an independent open-source project, not affiliated with, endorsed by or sponsored by Higgsfield. Third-party workflows, models and assets retain their own credits and notices; see the licence links above.
