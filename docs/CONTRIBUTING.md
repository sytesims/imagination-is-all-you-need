# Contributing

Thanks for helping.

## Licence

Imagination Is All You Need is licensed under the [GNU Affero General Public License v3.0 or later](../LICENSE) (AGPL-3.0-or-later), with one extra permission for tldraw (see [NOTICE](../NOTICE)).

- By sending a contribution, you agree it is shared under AGPL-3.0-or-later, including that tldraw permission. You keep the copyright in your work.
- Sign off each commit with the [Developer Certificate of Origin](https://developercertificate.org/): `git commit -s` adds a `Signed-off-by: Your Name <you@example.com>` line. It says you wrote the change or have the right to share it under this licence.
- Code you copy in from elsewhere must have a licence that works with AGPL-3.0, and keeps its own notice. Name the source in your pull request.

## Get set up

Follow the developer quick start in [INSTALL.md](INSTALL.md#quick-start-for-developers-mock-mode). Mock mode needs no GPU and no keys. AI coding agents should read [AGENTS.md](../AGENTS.md).

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | API (:8787), web (:5174) and MCP (:8788) with file watching |
| `npm run check` | Checks that the web dev proxy reaches the API and lists the tools |
| `npm run build` | Builds plugins, server and web |
| `npm run workflows:validate` | Checks the ComfyUI graphs against ComfyUI's node definitions |
| `npm run plugins:check` | Dry-runs the plugin workflows and validates them |
| `npm run contracts:test`, `npm run contracts:routing` | Hosted-provider request contracts and routing contracts |
| `npm run mcp:test` | MCP end-to-end test (needs the API running) |
| `npm run openapi` | Regenerates `openapi.json` |
| `npm run docs:api` | Regenerates `docs/API-QUICKSTART.md`, `docs/API-MODELS.md`, `docs/API-ERRORS.md` from the live API |
| `npm run licenses -w server` | Regenerates `LICENSES.md` |

Server tests are standalone scripts in `server/test/`. Each one starts with a `Run:` line; most are run from `server/` with `npx tsx test/<name>.ts`. Many start their own throwaway mock server on another port with a temporary data folder.

## Ground rules

- **Generated files:** don't edit `openapi.json`, `LICENSES.md`, `docs/ATTRIBUTION.md` or the `docs/API-*.md` files by hand; re-run their generator.
- **Never commit secrets:** no `.env.local`, keys or tokens. Only `.env.example` is tracked.
- **Clean room:** no Higgsfield code, workflows, images, logos or brand marks, and no long marketing copy taken from them. Short UI labels may match on purpose.
- **Honest copy:** prices shown before a run are what's charged; you pay providers directly and the app keeps no balance (the optional team mode is the only place credits are charged or refunded). Don't claim a route works for real until it has run with a real key.
- **No licence gating:** the app doesn't block models by licence; document licences instead.
- **New tools:** the easiest way is a plugin, see [PLUGINS.md](PLUGINS.md).

Architecture and public development guidance: [HOW-IT-WORKS.md](HOW-IT-WORKS.md) and [TESTING.md](TESTING.md).
