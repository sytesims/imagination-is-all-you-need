# Layers

**Split any video into separate layers.** Name up to four things in your clip, like *woman*, *steam* or *neon sign*. Each one comes back on its own see-through layer, with a depth pass and a clean background, ready for your editor. It lives on the Video page under Edit (`/video?workflow=layers`).

## How to use it

1. **Add your clip.** Upload one, pick it from your media, or use a result. Up to 15 s; a longer clip opens the trim sheet so you pick the part.
2. **Name what to split out.** Open **Split out** and type a name, then press Enter. Up to four. One or two words work best, and each thing should be visible on the first frame. Everything you don't name stays in the background.
3. **Pick the options** (all on by default, under the sliders button):
   - **Clean edges**: soft hair and fur edges from BiRefNet, kept close to each object.
   - **Depth**: a depth pass from Depth Anything 3. It also puts the layers in order, nearest on top.
   - **Clean background**: the scene with your layers taken out (the first 5 s). On your computer for now: on Comfy Cloud it is coming.
4. **Split into layers.** Free on your computer, or on Comfy Cloud with the price on the button.

## The result

Open the result to see the layer stack:

- **Layers**: every layer over the clean background, playing together. Each row has **show / hide**, **solo** (only this layer), its colour, its name and how near it is. One scrub bar moves all of them.
- **Overview**: your clip with each layer tinted in its colour, so you can check what was found.
- **Depth**: near is white, far is black, stretched with one range for the whole clip.
- **Background**: the clean background on its own.

**Export for editors (.zip)** makes one file with:

| In the ZIP | What it is |
|---|---|
| `layers/01-<name>.mov` … | Each layer as ProRes 4444 with transparency (01 is the bottom layer) |
| `mattes/01-<name>-matte.mp4` … | The same layer as a black-and-white matte |
| `depth/depth_00001.png` … | Depth as 16-bit pictures, near = white |
| `background/clean-background.mov` | The clean background (ProRes 422 HQ) |
| `layers.json` | Names, order, frame size, frame rate, models and licences |

## How it works

| Step | Model | Licence |
|---|---|---|
| Find and track each name | SAM 3.1 (`sam3.1_multiplex_fp16`), in 2-second pieces: each piece finds every name on its first frame, then tracks them together, so names never swap. The pieces overlap by a few frames and are blended there | SAM License (restricted: read it) |
| Soft edges | BiRefNet (`birefnet`), kept only in a thin band around each layer's edge | MIT |
| Depth and order | Depth Anything 3: Small on your computer, Mono-Large on Comfy Cloud | Apache-2.0 |
| Clean background | On your computer, Footage Effects' Vanish (LTX-2.5 + the Clean Plate IC-LoRA), pasted only where your layers were; everywhere else it is your own footage. Not on Comfy Cloud yet | LTX-2.x Community License |

The graph is [`workflows/layers-split-api.json`](../workflows/layers-split-api.json): our own, using only core ComfyUI nodes, built only from chains that already ran: the SAM part of our Swap Two People graph (it ran on Comfy Cloud), and the official Comfy templates for BiRefNet and Depth Anything 3. Joining the edges, measuring depth over the clip, ordering the layers, the clean background paste and the export run on your computer with ffmpeg.

**Downloads for your computer:** 2.3 GB for the split (SAM 3.1 1.75 GB, BiRefNet 0.44 GB, Depth Anything 3 Small 0.14 GB). The clean background also needs Footage Effects' LTX-2.5 files (about 43 GB). The app shows the sizes and asks before it downloads anything.

**Comfy Cloud** bills graphics-card time. The price on the button is an estimate: about 18 GPU-seconds for each 2-second piece (measured with one name), plus a little for edges and depth.

## Good to know

- Layers are made at up to 1024 px on the long side and up to 24 frames per second.
- The clean background covers the first 5 s; after that it holds its last frame.
- Something that isn't in view at the start of a 2-second piece isn't found in that piece; the result says when. Glass, smoke and splashes stay in the background.
- Turn Layers off on the Plugins page and it leaves the Video page; your results stay in your library as plain clips.
