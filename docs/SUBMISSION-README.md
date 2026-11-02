# Imagination Is All You Need

**Imagination is all you need.** One app for images, video, audio and 3D. Run it on your computer or in the cloud. Open source (AGPL-3.0-or-later), built on ComfyUI workflows, Comfy Cloud and Comfy Router. Made for Comfy's **#OpenSourceHiggsfield** challenge.

<!-- Demo video: replace DEMO_VIDEO_URL on the next line with the link to the demo. -->
**Watch the demo (under 2 minutes):** DEMO_VIDEO_URL

Contains AI-generated content. This page is the short version for judges; the main [README](../README.md) has everything else.

<p align="center"><img src="screenshots/explore.webp" alt="The Explore page: a short film, runs from your computer and the cloud, each with its model and price" width="900"></p>

## Why it's new
- **You pick where each run happens, and see the real price before you press Generate.** One **Run on** control on every run: your computer (free, on your own ComfyUI), Comfy Cloud (the same open workflow on Comfy's GPUs) or Comfy Router (partner models such as Kling, Veo and MiniMax H3). The button shows the price for that place before anything starts.
- **A Canvas where Claude drafts with whole ComfyUI workflows.** Every card is a complete workflow. Claude, over MCP, lays out the board and prices each card, and nothing runs until you press **Go**. A finished card opens the exact graph it ran in ComfyUI.
- **Block a shot in 3D, and LTX films it.** In **Direct a Shot** you place actors and a camera move in simple 3D in your browser and record a free grey mockup. LTX-2.5 22B with Lightricks' Layout to Render IC-LoRA turns it into a real shot with sound, keeping your framing and camera path. Free on your computer, or on Comfy Cloud.

## Try it in 5 minutes, no GPU
Install with one line ([macOS, Linux, Windows](../README.md#install-in-one-line)). No GPU, key or account is needed for this tour, and nothing is charged.

1. **Open the Examples project.** Real results made in the app, each with its model, where it ran and its price.
2. **Press View workflow** on a result to see the ComfyUI graph behind it.
3. **Press Open in ComfyUI.** The same graph opens in your own ComfyUI, ready to run or change.
4. **Open the Canvas and pick a starter** in the AI panel, such as **Product ad**. The board builds itself and stops at a priced proposal. Nothing runs until you press Go.

## What's inside
- **Direct a Shot (LTX-2.5 at the core):** stage a scene and a camera move in 3D, record a free mockup, and LTX-2.5 22B with the Layout to Render IC-LoRA films it with sound.
- **A full studio:** 69 ready-made workflows (19 image, 38 video, 8 audio and 4 3D, the 24 one-click apps among them) and 8 step-by-step chains, plus 82 camera presets. Every result keeps its model, where it ran and its price.
- **Footage Effects (LTX VFX):** Lightricks' Clean Plate, Day to Night and Water Simulation IC-LoRAs on your own clip, on your computer or on Comfy Cloud; Alpha Gen on your computer. The Explore page shows Layout to Render: a grey 3D blockout filmed as a real shot.
- **Canvas:** each card is a whole workflow; connect cards and results flow on. Claude drafts and prices the board, nothing runs until you press Go, and View workflow shows the exact ComfyUI graph behind a finished card (runs on your computer or Comfy Cloud).
- **Agents:** 70 MCP tools in all; 15 in the default stdio core toolset (11 catalogue/control tools plus four read-only searches); default HTTP also enables 25 Canvas tools. Quotes, permissions and budgets govern direct runs; Canvas proposals wait for Go. See [MCP.md](MCP.md) and the 17 included [skills](MCP-SKILLS.md).

## How it's built
- **Your computer:** your own ComfyUI over its HTTP and WebSocket API.
- **Comfy Cloud API v2 workflow jobs:** our own graphs from [`workflows/cloud/`](../workflows/cloud/README.md), with one Comfy key.
- **Comfy Router** for partner models: a price estimate first, then the cost Comfy reports is recorded.
- **Every graph is in the repo:** the ComfyUI API graphs the app runs are in [`workflows/`](../workflows), with sources and licences in [workflows/README.md](../workflows/README.md).
- **Official templates first:** 30 official Comfy templates bundled in [`workflows/templates/`](../workflows/templates), over 120 credited with source and licence. Community workflows come next, then our own.
- **Partner nodes** inside Cloud jobs (LTX-2.5 Pro / Fast, Tripo 3.1, Topaz).
- **Deployments:** connect your own Comfy deployment from Settings.

## Run it
Use Node.js 22, 24 or 26 (24 recommended), npm, and ffmpeg/ffprobe for media:

```bash
npm run setup      # installs app dependencies, checks setup, starts web/API/MCP
```

With no GPU or key you can browse the bundled Examples project and the Canvas starters. Generate needs a connection (your ComfyUI or a Comfy key). Setup and real-run requirements: [Install in one line](../README.md#install-in-one-line) and [INSTALL.md](INSTALL.md).

## Partner models
- **LTX:** LTX-2.5 22B is the core video model for Direct a Shot, Footage Effects, Generate Video, Transitions, Loop, Extend and talking photos.
- **MiniMax:** MiniMax H3 (Generate Video, Extend, Character Swap, CrossView on your deployment) and MiniMax Music 3.
- **Black Forest Labs:** FLUX 3 Image Klein on your computer (NVIDIA GPU), plus FLUX 3 Image and Video through Comfy.

## Licences
- **App code:** AGPL-3.0-or-later ([LICENSE](../LICENSE)), with an extra permission for tldraw ([NOTICE](../NOTICE)). Open source and share-alike, also when you host a changed copy for others. Models keep their own licences.
- **Models, nodes and dependencies** keep their own licences: [LICENSES.md](../LICENSES.md), [workflows/LICENSES.md](../workflows/LICENSES.md), [ATTRIBUTION.md](ATTRIBUTION.md), [USAGE-NOTES.md](USAGE-NOTES.md), and the in-app **Models & licences** page.
- **Credit lines** shown in the app: "Powered by MiniMax H3", "Powered by Stability AI" (Stable Audio Open) and "Built with Fish Audio" (Fish Audio Drama 3).
- **Demo video voiceover:** Kokoro-82M (Apache-2.0), voice `af_heart`.

## AI-generated content
Everything the tools make is AI-generated. Media we show from the tools carries an **AI-generated** label; please label your results too when you share them. The built-in sample clips are Blender Foundation open movies (CC BY 3.0), not generations.

## Not affiliated with Higgsfield
Imagination Is All You Need is an independent open-source project, not affiliated with, endorsed by or sponsored by Higgsfield. Third-party workflows, models and assets retain their own credits and notices; see the licence links above.
