// Test helper: every fs.mkdtempSync / fs.mkdtemp / fsPromises.mkdtemp directory a test process creates under the temp folder
// (os.tmpdir(), i.e. $TMPDIR) is removed when that process exits (normal exit, process.exit, SIGINT / SIGTERM / SIGHUP).
// Generic, so existing tests need no edits: preload it with NODE_OPTIONS="--import <repo>/server/test/fixtures/tmp-cleanup.mjs"
// (the full-suite runner does), or import it first in a test. Only directories this process created are removed; nothing outside the temp folder.
// OPENHIGGSFIELD_KEEP_TMP=1 keeps them for debugging.
import fs from 'node:fs'; import fsp from 'node:fs/promises'; import os from 'node:os'; import path from 'node:path'; import { syncBuiltinESMExports } from 'node:module'; import { spawn } from 'node:child_process';
if (!globalThis.__ohfTmpCleanup) {
  globalThis.__ohfTmpCleanup = true;
  const made = new Set(); const root = path.resolve(os.tmpdir()) + path.sep;
  const note = (d) => { try { const r = path.resolve(String(d)); if (r.startsWith(root)) made.add(r); } catch { /* ignore */ } return d; };
  const mkSync = fs.mkdtempSync; fs.mkdtempSync = (...a) => note(mkSync(...a));
  const mkCb = fs.mkdtemp; fs.mkdtemp = (prefix, ...rest) => { const cb = rest.pop(); return mkCb(prefix, ...rest, (e, d) => { if (!e) note(d); cb(e, d); }); };
  const mkP = fsp.mkdtemp; fsp.mkdtemp = async (...a) => note(await mkP(...a)); fs.promises.mkdtemp = fsp.mkdtemp;
  syncBuiltinESMExports();
  // Remove now, then once more 3 s later from a detached shell: servers a test just killed may still write into their data dir while shutting down.
  const clean = () => { if (process.env.OPENHIGGSFIELD_KEEP_TMP === '1' || !made.size) return; const dirs = [...made]; made.clear();
    for (const d of dirs) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 3 }); } catch { /* busy: retried below */ } }
    try { const c = spawn('sh', ['-c', 'sleep 3; rm -rf -- "$@"', 'tmp-cleanup', ...dirs.filter((d) => d.startsWith(root))], { detached: true, stdio: 'ignore' }); c.unref(); } catch { /* best effort */ } };
  process.on('exit', clean);
  // Signals: when the process has its own handler (a server's graceful shutdown), leave it alone; 'exit' cleans afterwards. Otherwise clean and exit.
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { if (process.listenerCount(sig) > 1) return; clean(); process.exit(128 + (sig === 'SIGINT' ? 2 : sig === 'SIGTERM' ? 15 : 1)); });
  globalThis.__ohfTmpDirs = made;
}
