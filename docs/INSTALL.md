# Install and run

Install the studio on your computer, then choose whether to browse examples, connect a cloud account or connect your own ComfyUI. **Installing the app does not install ComfyUI, custom nodes or model weights.**

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
