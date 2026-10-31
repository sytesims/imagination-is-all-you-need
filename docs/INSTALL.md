# Install and run

Install the studio on your computer, then choose whether to browse examples, connect a cloud account or connect your own ComfyUI. **Installing the app does not install ComfyUI, custom nodes or model weights.**

## Install in one line

On macOS or Linux, paste this into Terminal:

```sh
curl -fsSL https://iiayn.app/install | bash
```

On Windows, paste this into PowerShell:

```powershell
irm https://iiayn.app/install.ps1 | iex
```

The same scripts are in this repository, so you can read them before running them: [scripts/get.sh](../scripts/get.sh) (macOS and Linux) and [scripts/get.ps1](../scripts/get.ps1) (Windows). Straight from GitHub, the first line is `curl -fsSL https://raw.githubusercontent.com/sytesims/imagination-is-all-you-need/main/scripts/get.sh | bash`.

What they do, in order:

1. Check for git, Node.js 20 or newer (with npm) and ffmpeg. For each missing one, they say what it is and ask before installing it with Homebrew (macOS; they offer Homebrew's official installer if it's missing), apt or dnf (Linux, with `sudo`, which asks for your password) or winget (Windows). Say no and they print the manual steps and stop. ffmpeg is optional: without it the app still opens.
2. Download the app into `~/Imagination` (Windows: `%USERPROFILE%\Imagination`) with `git clone --depth 1`. If the app is already there, they run `npm run update` instead. Your library (`server/data`) and keys (`.env.local`) are never touched.
3. Run `npm run setup -- --no-start`: app dependencies and the read-only check. No ComfyUI, models or keys.
4. Ask whether to add a shortcut (Windows: `Imagination.lnk`; Linux: an `imagination.desktop` app entry). On a Mac the installer adds Imagination to Applications and your Dock: it builds the [Mac app](#mac-app-dock) into `/Applications` (or `~/Applications` when `/Applications` needs an administrator; never with `sudo`), pins it to the Dock unless it's already there, and removes the `Imagination.command` desktop shortcut older installers made.
5. Start the app with `npm run setup` and open it in your browser. Keep the window open; Ctrl+C stops it.

Options (Windows names in brackets):

| Option | What it does |
|---|---|
| `--yes` (`-Yes`) | Answer yes to every question |
| `--dir PATH` (`-Dir`) | Install somewhere else |
| `--branch NAME` (`-Branch`) | Get another branch (for testing) |
| `--no-start` (`-NoStart`) | Install, but don't start the app |
| `--no-shortcut` (`-NoShortcut`) | Don't offer the shortcut (on a Mac: the app in Applications and the Dock) |
| `--dry-run` (`-DryRun`) | Show every step, change nothing |
| `--help` (`-Help`) | Show the options |

Pass options like this: `curl -fsSL https://iiayn.app/install | bash -s -- --dry-run`, or on Windows `& ([scriptblock]::Create((irm https://iiayn.app/install.ps1))) -DryRun`.

To do it all by hand instead, follow the steps below.

## Requirements

- A current Node **20, 22 or 24** release and npm. Node 22 or 24 is recommended; very old Node 20 releases lack flags used by the development server. Some optional provider dependencies require newer Node releases and can warn on Node 20.
- Git to clone the repository, or an extracted release/source archive.
- **ffmpeg and ffprobe** on `PATH` for upload validation, audio/video processing and export. The setup check reports missing tools. Browsing included examples is still possible without local generation prerequisites.
- A browser. Specific browser/OS coverage must be read from actual release test results, not inferred from a successful build.

Python, a local GPU, ComfyUI, Docker and model weights are **not prerequisites for the app-only/cloud path**. Individual optional local tools can have additional requirements.

Install prerequisites yourself using their official instructions or your package manager. The app does not silently install system software or request administrator rights.

### macOS

With Homebrew already installed, an example prerequisite command is:

```sh
brew install node ffmpeg git
```

Check that the installed Node version is supported. A shell that was open before installation may need reopening.

### Windows

Install a supported Node release, Git if cloning, and the FFmpeg tools. For example, in PowerShell with Windows Package Manager available:

```powershell
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Git.Git -e
winget install --id Gyan.FFmpeg -e
```

Confirm the Node version offered by your package manager is supported by the app. Reopen PowerShell after installing, then check:

```powershell
node --version
npm.cmd --version
ffmpeg -version
ffprobe -version
```

**WSL is not required for the app-only path.** Local ComfyUI/model prerequisites are separate. Do not globally disable PowerShell execution policy to work around an `npm.ps1` error; use `npm.cmd` instead.

## Start the app

Clone or extract the source, open a terminal in that folder, and run:

```text
npm run setup
```

On Windows, `npm.cmd run setup` is equivalent and avoids selecting the PowerShell npm shim.

Setup installs missing app dependencies, runs the read-only doctor and starts the API, web app and HTTP MCP server. It prints the setup URL. With default ports:

| Service | Address |
|---|---|
| Web app / wizard | http://localhost:5174/?setup=1 |
| API | http://127.0.0.1:8787/api/health |
| MCP | http://127.0.0.1:8788/mcp |

Open the printed web URL. Keep the terminal open; **Ctrl+C** stops the services. Closing the browser does not stop them. `npm run setup -- --check` checks without installing or starting; `--no-start` permits dependency installation/checks but does not start services.

`npm install` also attempts to install MCP dependencies. If that part fails, fix the reported dependency error and run `npm run mcp:install`; the app being reachable does not prove MCP is running.

### Mac app (Dock)

On macOS you can open the studio like any other app. In the app folder, run once:

```text
npm run mac-app
```

This builds `Imagination.app` in `~/Applications`, the Applications folder in your home folder. Drag it from there to the Dock.

- **Opening it** starts the app in the background when it isn't running (the same `npm run setup`, so a first start also installs what's missing), shows "Starting Imagination…", then opens the studio in your browser. If it's already running (also when you started it in a terminal, or it is restarting after an update), it just opens the browser. Closing the browser doesn't stop it.
- **While the studio runs**, Imagination stays in the Dock with its running dot. Click it to open the studio again. If the studio stops by itself, you get a notification and the app closes.
- **To stop it**, quit Imagination (from its Dock menu, or Cmd-Q) and choose **Stop**; **Keep running** leaves the studio on. Or hold **Option** while you open Imagination and choose **Stop Imagination**. It only stops the copy it started; a copy started in a terminal stops with **Ctrl+C** there.
- **If it can't start**, it shows the last lines of the log. The full log is `~/Library/Logs/Imagination/app.log` (it keeps about the last 1 MB).
- **Ports and settings** work as above: `PORT` and `WEB_PORT` in `.env.local` are used.
- **Moved or renamed the app folder?** Run `npm run mac-app` again from the new place. `npm run mac-app -- --dest DIR` builds it somewhere else. It only replaces its own `Imagination.app`, never another app with that name.
- **To remove it**, drag `Imagination.app` to the Trash (and off the Dock). Optionally also delete `~/Library/Logs/Imagination` and `~/Library/Application Support/Imagination`.

The app is built on your Mac, so macOS opens it without a download warning. The first time it shows a notification, macOS may ask whether Imagination can send notifications.

## Choose how to use it

### Browse the included Examples project

No GPU, ComfyUI or provider key is needed. The bundled examples are existing outputs, with their model/settings information. Browsing or preparing a Recreate request does not submit a generation. With nothing connected, pressing Generate asks you to connect a service.

The Examples project is seeded once. Deleting an example or the project should not restore it at each restart. This is different from the explicit developer mock backend, which simulates jobs.

### Real renders on Comfy Cloud

Use the wizard or **Settings → Connections** to enter your Comfy key yourself. Your provider account needs the relevant access and funds for paid generation. The app shows model/run-location information and a quote before a run; a successful connection alone does not establish that every model is available.

**No local ComfyUI or local model download is required.** Inputs leave your computer for the selected service; partner/API routes can forward them to the model provider. Check the route and provider terms before sending private media.

Other supported direct APIs have their own accounts/keys. No key is bundled with the app. Settings saved through the loopback-only UI take effect without copying keys into a terminal command.

### Real renders on your own ComfyUI

Install and start ComfyUI separately, or use an existing installation. **ComfyUI Desktop is optional.** A compatible manual or portable installation can also supply the API.

Choose **Run models on your computer** in the wizard. It can look for a running ComfyUI or accept its address. Usual addresses include `http://127.0.0.1:8188`; Desktop can use `http://127.0.0.1:8000`. Use the address your installation actually reports.

A reachable API does not mean a model is ready. Each workflow can require particular weights, custom nodes, a ComfyUI version and sufficient memory. Keep Desktop-managed installation paths separate from a manual checkout; do not assume every installation has the same folder layout.

To use the app's optional file/download management, configure the correct ComfyUI models directory. Downloads must be requested explicitly, with size/disk and licence-access requirements shown. The app-only installation does not provision the local stack. See [local models and hardware](LOCAL-MODELS-AND-HARDWARE.md).

### Both local and cloud

You can connect both. Choose the model and its **Run on** location for the workflow you intend. Confirm the price/billing account rather than assuming a local preference applies to every model. Changing a connection should not silently start a job.

## Configuration and ports

The normal backend defaults to `comfy`; with no connection, Generate requires setup. `OPENHIGGSFIELD_BACKEND=mock` is an explicit development/test setting, not the recommended ordinary-user experience.

Keep optional configuration in `.env.local`, not in source control. The safe variable descriptions are in [`.env.example`](../.env.example). Never include your real keys in issues, logs, screenshots or commits. See [Configuration](CONFIGURATION.md) for environment precedence and supported settings.

If ports are occupied, do not kill unrelated applications. Choose free ports and run setup with them. Examples:

```sh
PORT=8790 WEB_PORT=5180 MCP_PORT=8791 npm run setup
```

```powershell
$env:PORT = '8790'
$env:WEB_PORT = '5180'
$env:MCP_PORT = '8791'
npm.cmd run setup
```

These values remain in that terminal session. Setup prints the selected web address. Keep services on loopback for local use; exposing the API/web/MCP proxy is not an authentication mechanism.

## Updating

Your library, boards and settings live in `server/data`, and your keys in `.env.local`. Updating never touches either of them.

### If you installed with git clone

**Coming from version 1.0?** It doesn't have `npm run update` yet. Update once by hand, in the app folder: `git checkout package-lock.json` (npm may have changed it; this puts it back), then `git pull`, then `npm ci`. After that, use `npm run update`.

Stop the app first (**Ctrl+C** in its terminal), then in the app folder run:

```text
npm run update
```

On Windows, `npm.cmd run update` does the same. The update:

1. Checks that you haven't changed any of the app's own files. If you have, it lists them and stops without changing anything. Put them aside with `git stash` (or commit them), then run it again.
2. Checks that you're on `main`. If you're on another branch, it says how to switch back. `npm run update -- --force-branch` updates the branch you're on instead.
3. Gets the new version from GitHub with `git pull --ff-only`. It never merges, resets or deletes anything.
4. Installs new dependencies only when they changed, and rebuilds the MCP server only if you built it before (`npm run mcp:build`).
5. Shows your old and new version and a short list of what's new.

Then start the app again with `npm run setup` (or `npm run dev`).

To see whether an update is ready without changing anything:

```text
npm run update -- --check
```

The full list of changes is in [CHANGELOG.md](../CHANGELOG.md) and on the [Releases page](https://github.com/sytesims/imagination-is-all-you-need/releases). Settings → Profile shows the version you're running.

### If you downloaded a zip

A zip copy can't update itself. To move to a new version:

1. Download the latest release from the [Releases page](https://github.com/sytesims/imagination-is-all-you-need/releases) and unzip it next to your current folder.
2. Copy `server/data` and `.env.local` from the old folder into the new one.
3. In the new folder, run `npm run setup`.

When the new version works, you can delete the old folder. Running `npm run update` in a zip copy prints these same steps.

### Windows notes

- Stop the app before you update. Windows locks files that are in use, so an install step can fail while the app runs. If it does, stop the app and run `npm ci` again.
- Folders with spaces in their names are fine.
- If PowerShell blocks `npm.ps1`, use `npm.cmd run update`.

## Other startup and advanced installation paths

- `npm run dev`: starts API, Vite web and HTTP MCP after dependencies are installed.
- `npm run start:demo`: non-watching API plus built web preview and HTTP MCP. It is not a separate hosted demo service.
- `npm run build`: builds server/web assets. MCP's compiled stdio entrypoint has a separate `npm run mcp:build` step; see [MCP](MCP.md).
- `scripts/install.ps1`: optional native Windows app install/build helper. Its printed start command uses app setup; it does not provision ComfyUI or model weights.
- `scripts/install.sh`: an advanced shell helper with optional local-stack provisioning flags. Those flags can install substantial external software/downloads and are **not** part of the standard app-only setup. Inspect its plan and prerequisites before consenting. Do not point it at an existing ComfyUI installation without understanding potential node/core changes.
- Docker files are included for advanced use. Docker/native startup, exposed ports, data mounts and GPU support are separate configurations. On macOS, do not assume Docker exposes the Apple GPU to ComfyUI. Windows native app use does not require a GPU Docker image or WSL.

The root CI smoke checks build/start the API and web in isolated mock mode on its configured runners. They do not verify these advanced installation paths, browser interactions, MCP execution or real local/cloud generation.

## Troubleshooting

- **Node rejects `--env-file-if-exists`:** update to a current supported Node release, reopen your terminal and check `node --version`.
- **A dependency install fails:** keep the error, OS/architecture and Node version; do not retry by installing packages into a running production checkout.
- **Missing ffmpeg/ffprobe:** install both tools, reopen the terminal and rerun `npm run doctor` before testing uploads/media processing.
- **ComfyUI is not found:** start it separately, verify its reported address, then retry or enter that address in the wizard. Missing model/node/version requirements are distinct from connectivity.
- **Key saving is disabled:** local browser key storage requires the reviewed loopback setup. Do not enable remote access merely to bypass this check.
- **MCP is unavailable:** confirm its dependency install and port, then follow [MCP setup](MCP.md). HTTP endpoint availability and a connected AI client are different states.

More: [Troubleshooting](TROUBLESHOOTING.md), [models/providers](PROVIDERS-AND-MODELS.md) and [API](API.md).
