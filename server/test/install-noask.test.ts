// dp30 (j4) + bh12 (1): scripts/install.sh asks ONE confirmation, showing the plan, before the first clone / install / download (default no).
//  - no terminal, no --yes → prints the plan, exits 0, nothing written
//  - a terminal (a pty via `script`), answer "n" or just Enter → plan shown once, "Nothing was cloned, installed or downloaded.", exit 0, no git/pip/npm call
//  - a terminal, answer "y" → exactly one question, then the steps run (git, pip and npm are PATH stubs that only log; python's venv/pip go through a stub)
//  - --yes → no question at all
// Nothing real is cloned, installed or downloaded (--tools none on the yes paths); temp dirs removed; the env file goes to a temp path.
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import { spawnSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const REPO = path.resolve(import.meta.dirname, '../..'); const D = fs.mkdtempSync(path.join(os.tmpdir(), 'inst-')); fs.mkdirSync(path.join(D, 'models'));
// PATH stubs: log every call to $D/calls.log and do nothing else
const BIN = path.join(D, 'bin'); fs.mkdirSync(BIN); const LOG = path.join(D, 'calls.log');
for (const b of ['git', 'npm', 'curl', 'pip', 'pip3']) { fs.writeFileSync(path.join(BIN, b), `#!/usr/bin/env bash\necho "${b} $*" >> "${LOG}"\n${b === 'curl' ? 'exit 7' : 'exit 0'}\n`); fs.chmodSync(path.join(BIN, b), 0o755); }
// python wrapper: "-m venv DIR" makes DIR/bin/python a logging stub (so "-m pip" never runs); everything else is the real python3 (manifest reads)
// install.sh needs Python 3.10+: use the first 3.10+ interpreter found (PATH python3.x / python3, then a uv-managed one), not whatever python3 the login shell has (macOS /usr/bin/python3 is 3.9)
const pyOk = (p: string) => !!p && spawnSync(p, ['-c', 'import sys; sys.exit(0 if sys.version_info>=(3,10) else 1)']).status === 0;
const REALPY = [...['python3.14', 'python3.13', 'python3.12', 'python3.11', 'python3.10', 'python3'].map((n) => spawnSync('bash', ['-lc', `command -v ${n}`], { encoding: 'utf8' }).stdout.trim()), spawnSync('bash', ['-lc', "uv python find '>=3.10' 2>/dev/null"], { encoding: 'utf8' }).stdout.trim()].find(pyOk) ?? '';
assert.ok(REALPY, 'install-noask needs a Python 3.10+ interpreter (python3.1x on PATH or uv-managed) for the manifest reads');
fs.writeFileSync(path.join(BIN, 'pywrap'), `#!/usr/bin/env bash\nif [ "$1" = -m ] && [ "$2" = venv ]; then echo "python -m venv $3" >> "${LOG}"; mkdir -p "$3/bin"; printf '#!/usr/bin/env bash\\necho "venv-python $*" >> "${LOG}"\\n' > "$3/bin/python"; chmod +x "$3/bin/python"; exit 0; fi\nif [ "$1" = -m ] && [ "$2" = pip ]; then echo "python -m pip $*" >> "${LOG}"; exit 0; fi\nexec "${REALPY}" "$@"\n`);
fs.chmodSync(path.join(BIN, 'pywrap'), 0o755);
const ENV = { ...process.env, HF_TOKEN: '', PATH: `${BIN}:${process.env.PATH}`, PYTHON: path.join(BIN, 'pywrap'), OPENHIGGSFIELD_ENV_FILE: path.join(D, 'env.local') };
const sh = (args: string[]) => spawnSync('bash', ['scripts/install.sh', ...args], { cwd: REPO, input: '', encoding: 'utf8', timeout: 60000, env: ENV });
const q = (a: string) => `'${a.replace(/'/g, `'\\''`)}'`;
// a real terminal for install.sh: Python's pty (portable; util-linux `script -c` is Linux-only and BSD `script` needs a tty on stdin). The answer is typed into the pty, output is passed through, exit code kept.
const PTY = `import os, pty, sys
pid, fd = pty.fork()
if pid == 0: os.execvp('bash', ['bash', '-c', sys.argv[1]])
os.write(fd, sys.stdin.read().encode()); out = b''
while True:
    try: d = os.read(fd, 4096)
    except OSError: break
    if not d: break
    out += d
_, st = os.waitpid(pid, 0); sys.stdout.write(out.decode(errors='replace')); sys.exit(os.waitstatus_to_exitcode(st))`;
const tty = (args: string[], answer: string) => spawnSync(REALPY, ['-c', PTY, `bash scripts/install.sh ${args.map(q).join(' ')}`], { cwd: REPO, input: answer, encoding: 'utf8', timeout: 60000, env: ENV });
const calls = () => (fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8') : ''); const reset = () => fs.rmSync(LOG, { force: true });
const files = (d: string) => { const out: string[] = []; const walk = (x: string) => { for (const e of fs.readdirSync(x, { withFileTypes: true })) e.isDirectory() ? walk(path.join(x, e.name)) : out.push(e.name); }; walk(d); return out; };
const count = (s: string, re: RegExp) => (s.match(new RegExp(re, 'g')) ?? []).length;
try {
  // 1. no terminal, no --yes: plan, exit 0, nothing written, no stub called
  { reset(); const r = sh(['--models-only', '--comfy-dir', D, '--tools', 'image-upscale']); const out = r.stdout + r.stderr;
    assert.equal(r.status, 0, out); assert.match(out, /This will:/); assert.match(out, /download model files for: image-upscale \([\d.]+ GB total, [\d.]+ GB already present\)/);
    assert.match(out, /Not installing or downloading anything: no terminal to ask in\. Re-run with --yes/); assert.ok(!/\nget  /.test(out)); assert.deepEqual(files(path.join(D, 'models')), []); assert.equal(calls(), '');
    const c = sh(['--install-comfy', path.join(D, 'cu'), '--tools', 'none']); const co = c.stdout + c.stderr;
    assert.equal(c.status, 0, co); assert.match(co, /clone ComfyUI @ [0-9a-f]{10} from github\.com\/comfyanonymous\/ComfyUI/); assert.match(co, /pip install torch, torchvision and torchaudio/); assert.match(co, /install \d+ pinned custom-node packs/);
    assert.ok(!fs.existsSync(path.join(D, 'cu')), 'no clone'); assert.equal(calls(), '');
    console.log('ok non-TTY without --yes: plan printed, exit 0, nothing cloned / installed / downloaded'); }
  // 2. a terminal, answer no (and just Enter = default no): one question, nothing runs — the BH P2 case (ComfyUI clone + torch + custom nodes)
  for (const ans of ['n\n', '\n']) { reset(); const r = tty(['--install-comfy', path.join(D, 'cu'), '--tools', 'image-upscale'], ans); const out = r.stdout + r.stderr;
    assert.equal(r.status, 0, out); assert.equal(count(out, /Go ahead\? \[y\/N\]/), 1, out); assert.match(out, /This will:[\s\S]*clone ComfyUI[\s\S]*torch[\s\S]*custom-node packs[\s\S]*download model files for: image-upscale/);
    assert.match(out, /Nothing was cloned, installed or downloaded\./); assert.equal(calls(), '', `no git / npm / pip ran: ${calls()}`); assert.ok(!fs.existsSync(path.join(D, 'cu')));
    console.log(`ok TTY answer ${JSON.stringify(ans)}: plan shown, one question, default no, nothing ran`); }
  // 3. a terminal, answer yes: exactly one question, then the steps run (stubs only; --tools none so no model download)
  { reset(); const cu = path.join(D, 'cu'); const r = tty(['--install-comfy', cu, '--tools', 'none'], 'y\n'); const out = r.stdout + r.stderr; const log = calls();
    assert.equal(r.status, 0, out); assert.equal(count(out, /Go ahead\? \[y\/N\]/), 1, out); assert.ok(log.indexOf('npm ci') >= 0 && /git -C .*cu fetch/.test(log) && /python -m venv/.test(log) && /venv-python -m pip install -q torch/.test(log), log);
    assert.match(log, /npm run nodes:install/); console.log('ok TTY answer y: one question, then clone / venv / pip / nodes ran (stubs)'); fs.rmSync(cu, { recursive: true, force: true }); }
  // 4. --yes: no question at all, steps run
  { reset(); const cu = path.join(D, 'cu'); const r = tty(['--yes', '--install-comfy', cu, '--tools', 'none'], ''); const out = r.stdout + r.stderr;
    assert.equal(r.status, 0, out); assert.equal(count(out, /Go ahead\?/), 0, out); assert.ok(!/This will:/.test(out)); assert.match(calls(), /git -C .*cu fetch/); console.log('ok --yes: no question, steps ran (stubs)'); fs.rmSync(cu, { recursive: true, force: true }); }
  const l = sh(['--list-tools']); assert.equal(l.status, 0); assert.match(l.stdout, /image-upscale/);
  const h = sh(['--help']); assert.match(h.stdout, /--yes \| -y/); assert.match(h.stdout, /--dry-run/); assert.match(h.stdout, /--list-tools/);
  assert.ok(!fs.existsSync(path.join(REPO, '.env.local')) || fs.statSync(path.join(REPO, '.env.local')).mtimeMs < Date.now() - 120000, 'the repo .env.local was not written');
  console.log('ok install.sh: one confirmation with the plan (default no), --yes skips it, non-TTY prints the plan; --list-tools, --dry-run, --yes documented');
} finally { fs.rmSync(D, { recursive: true, force: true }); }
