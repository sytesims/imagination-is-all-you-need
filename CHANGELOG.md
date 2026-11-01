# What's new

Newest first. To update a git install, run `npm run update` (see [Updating](docs/INSTALL.md#updating)). Every release is also on the [Releases page](https://github.com/sytesims/imagination-is-all-you-need/releases).

## Unreleased

### New
- **Install in one line.** `curl -fsSL https://iiayn.app/install | bash` on macOS and Linux, `irm https://iiayn.app/install.ps1 | iex` on Windows. It checks for git, Node.js and ffmpeg, asks before installing anything, and opens the app in your browser. Running it again updates the app, also an install from 1.0.

### Better
- **A failed install says so.** When the app's parts don't install, setup and the installers stop with the next step and keep npm's output in `setup.log`, instead of carrying on.
- **A busy port is named at once.** If another program uses the app's port, the start stops within seconds and says which program and how to pick another port.
- **Copying `.env.example` changes nothing** until you uncomment a line.

### Fixed
- Keys saved in Settings are loaded again after a restart when `OPENHIGGSFIELD_ENV_FILE` points somewhere else.

## 1.1.0 — 2026-10-30

### New
- **Ad layout card on the Canvas.** Turn a picture into finished ads for Instagram & Facebook, TikTok, X, Pinterest, LinkedIn and YouTube. Your real logo, headline, offer and button go on top, so the words are always spelled right. Drag everything into place in the big editor, see each platform's safe zones, and export every size as PNGs in one zip. It's free: nothing goes to an AI model.
- **A new + menu on the Canvas.** Each Generate tile shows how many workflows it holds. Open one to pick a workflow from that list.
- **Update with one command.** `npm run update` brings a git install up to date and keeps your library and keys. `npm run update -- --check` only tells you if there's something new.
- **Version number in Settings.** Settings → Profile shows the version you're running, with a link to what's new.

### Better
- **Canvas cards look normal at every zoom.** No more night sky or pills when you zoom far out, and links always meet their cards.
- **Smoother Canvas zooming.** Zooming does about half the work it did, so big boards stay smooth.
- **Explore says "Make your own"** on the hero, instead of "Recreate this".
- **SVG and GIF brand logos** upload to Brands, as promised.

### Fixed
- The Canvas agent no longer offers runs your balance can't cover, says why runs failed (for example "out of credits"), and stops instead of moving on after a step fails. It's now called "Built-in agent" and says that Go runs real, billed models.
- Draft cards on the Canvas are no longer see-through.
- Generate Video accepts your reference pictures again.
- A photo the Image bar fits or crops keeps its original.
- Generate Video shows a price even before you pick a mode.
- FLUX 3 Max's 2:1 shape works at quote and at submit.
- LTX-2.5 DFR quality runs instead of being refused.
- MiniMax H3 on Comfy Router sends the 4 s you picked, not 5 s.
- Image "2K" is now 2K: a 4K edit no longer shrinks to 1.5K.
- Nano Banana Pro at 8:1 quotes the price it runs at.
- A clip length that snaps to the nearest one now says so on the job too.
- Newer models (Bernini-R, Gemini Omni 1.1 Flash, Wan Animate 2, Bria Virtual Try-On) show their full details and prompt help.
- Two lines of copy now read the way the rest of the app does.

## 1.0.0 — 2026-10-29

The first public version: Image, Video, Audio and 3D on your own computer or in the cloud, the Canvas, Explore, and the API and MCP server for agents.
