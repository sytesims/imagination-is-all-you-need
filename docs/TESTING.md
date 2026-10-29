# Testing

The server has about 210 test files in `server/test/`. Each one is a small script: it runs, prints `ok …` lines, and
exits with an error if something is wrong. There is no test framework to learn.

- `*.test.ts` files check code directly (fast, a second or two).
- `*.e2e.ts` files start their own copy of the server with the **mock** backend, talk to it over HTTP, then stop it.

No test needs a provider key, and none spends money: the runner removes every key from the environment before it starts.

You need `ffmpeg` (and `ffprobe`) on your PATH. On a Mac: `brew install ffmpeg`.

## Run one test

```bash
cd server
npx tsx test/bh10.e2e.ts
```

You see its `ok …` lines and `ALL OK …` at the end. The exit code is 0 when it passed.

## Run the tests your change touches

```bash
npm test -- --changed
```

This looks at what you changed compared with `main` (commits, uncommitted edits and new files) and runs only the
tests that could notice. A test is picked when:

1. the test file itself changed, or
2. a file it imports changed (it follows imports file by file, in `server/`, `web/` and `readiness/`), or
3. it starts the server (it mentions `src/index.ts`) and a file the server uses changed.

Example: a change to `web/src/ui/next/feed/feedMemo.ts` picks 3 tests; a change to a core server file such as
`server/src/stepEta.ts` picks most of them, because every test that starts the server depends on it.

It is a quick guess, not a proof: run the full suite before you merge. Changing `package.json`, `package-lock.json` or
the runner runs everything; changing only docs runs nothing.

Other handy ways to pick tests:

```bash
npm test -- --only queue          # every file whose name contains "queue"
npm test -- --only '/^router-/'   # a regular expression, between slashes
npm test -- --list --changed      # just print which files would run
```

## Run the full suite

```bash
npm test
```

It runs several test files at once (your number of CPU cores minus 2). While it runs you see one live line:

```
[57/212] 1m40s  failed 0  running: dp20.e2e.ts keys-flow.e2e.ts …
```

At the end you get the 10 slowest tests and a summary:

```
212 passed, 0 failed, 0 timed out — 7m17s with 8 at a time
```

Options:

| Option | What it does |
| --- | --- |
| `--jobs 4` | run 4 at a time |
| `--serial` | one at a time (slow, but the simplest to read) |
| `--timeout 300` | stop a test after 300 seconds (default 240) |
| `--shard 2/6` | run the 2nd of 6 equal parts (what CI uses) |
| `--save-times` | remember how long each test took in `scripts/test-times.json` (used to start long tests first and to split shards evenly) |

### Why tests don't get in each other's way

- **Ports.** A test that starts a server asks for its port with `testPort(8957)` (from `server/test/_ports.ts`). Run on
  its own, that is port 8957, as always. Under the runner, each worker adds its own offset (2000, 3000, …), so two tests
  never pick the same port, and none of them ever lands on the app's ports (8787, 8788) or ComfyUI (8188).
  New tests that start a server should do the same: `const PORT = testPort(<a free number in 8700–9699>)`.
- **Files.** Each test gets its own scratch folder: its own data dir, env file, filming state file and `TMPDIR`.
  Nothing is written to your real data or your `.env.local`.
- **Leftovers.** If a test fails or is stopped, the runner stops any server still listening on that worker's ports.

## Before every push

Run the full suite locally (`npm test`) before every push. That is the check we rely on for now.

## What CI does

`.github/workflows/test.yml` runs **only when started by hand** (Actions → tests → Run workflow) until the repo is
public, because Actions minutes on a private repo are limited. At launch we add back the runs on every push and pull
request to `main`. When started:

1. Six Ubuntu machines start at the same time; each takes a sixth of the test files (`--shard 1/6` … `6/6`).
2. Each installs Node 24, the npm packages (cached between runs), and `ffmpeg`, `lsof`, `ss`, and Python 3 with
   Pillow and NumPy (the server's colour match uses them).
3. Each runs `npm test -- --shard i/6 --jobs 2 --timeout 600`. The machines have 2 cores and are several times slower
   than a recent Mac, so it runs 2 at a time with longer limits (a `--timeout` above 240 also scales the per-test limits
   in the runner's `LONG` list by the same factor).
4. If a test fails, the end of its log is printed in the job output (a collapsible group per test), and the whole
   `.test-logs/` folder is attached to the run as a download (`test-logs-shard-N`).

CI has no secrets and no keys, so nothing in it can call a paid API.

### Writing tests that pass on slow machines and on Linux

- **CPU hogs** go in the runner's `SERIAL` list: they run alone after the rest, so they don't starve the tests beside
  them (`model-runon` and `pb-1018b` are there).
- **Waits.** Wait for a condition with a deadline of a minute or two (server up, job finished), never a fixed short
  sleep. Timing windows (stall timeouts and the like) need margins that survive a busy 2-core machine; keep the
  thing that must not stall moving (a heartbeat) instead of hoping a pause stays short.
- **Machine facts.** Don't depend on this computer's free disk, GPU or OS: inject them (`weightsGate(…, hw)`,
  `setHardwareOverride`, `OPENHIGGSFIELD_DISK_FREE_GB` on the mock backend). CI has about 15–20 GB free; some model
  downloads are bigger. To see which tests care, run them on a small disk:
  `TEST_SCRATCH=/Volumes/small/ohft- npm test -- --only <name>` (a short path: socket paths are limited).
- **Mock media.** A test that checks routes and prices, not the media, can start its server with
  `OPENHIGGSFIELD_MOCK_RENDER=copy`: sample videos are copied instead of encoded.

## Reading a failure

The summary names each failed test and its log:

```
1 passed, 1 failed, 0 timed out — 24s with 8 at a time
  FAIL    direct-providers.e2e.ts  →  .test-logs/2026-10-25T11-20-05/direct-providers.e2e.log
```

1. Open the log. The last lines show the error. An `AssertionError` prints what the test **expected** and what it
   **got** (`expected` / `actual`), plus the line in the test file.
2. The `ok …` lines just before it tell you how far the test got.
3. Run that one test on its own (`cd server && npx tsx test/<name>.ts`). If it passes alone but fails in the full run,
   it is probably sharing something with another test (a port, a file): tell us, that is a bug in the test.
4. `TIMEOUT` means the test was still running after 240 s. Often a server did not start: look for an error near the top
   of the log.

In CI: open the failed run on GitHub; the end of each failed log is in the job output under the run step. For the
whole log, scroll to **Artifacts**, download `test-logs-shard-N`, and read it the same way.
Logs from the last 10 local runs stay in `.test-logs/` (ignored by git).
