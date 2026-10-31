// scripts/install.sh hardware reading (2026-10-31, hardware plan B9): `--detect` with fake uname / nvidia-smi / sysctl on PATH and a fake
// /proc/meminfo (OPENHIGGSFIELD_MEMINFO). Nothing is installed or downloaded: --detect exits right after the reading.
// Covers: an NVIDIA PC (cu128, VRAM from nvidia-smi), a DGX Spark (nvidia-smi says [N/A] or "Not Supported": no crash under set -euo pipefail,
// unified memory from MemTotal, cu130 wheels on aarch64), a Mac (memory never called VRAM, about 75% usable), and no GPU (CPU wheels).
// Run: npx tsx test/install-detect.test.ts
import './fixtures/tmp-cleanup.mjs';
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawnSync } from 'node:child_process';
const REPO = path.resolve(import.meta.dirname, '../..'); const T = fs.mkdtempSync(path.join(os.tmpdir(), 'instdet-'));
const ok = (m: string) => console.log('ok ' + m);
/** A folder of fake commands: uname (-s/-m), and nvidia-smi / sysctl when given. */
function machine(name: string, o: { os: string; arch: string; smiMem?: string; memsize?: number; meminfoKB?: number }) {
  const bin = path.join(T, name); fs.mkdirSync(bin, { recursive: true });
  const w = (f: string, body: string) => { fs.writeFileSync(path.join(bin, f), `#!/bin/sh\n${body}\n`); fs.chmodSync(path.join(bin, f), 0o755); };
  w('uname', `case "$1" in -s) echo ${o.os};; -m) echo ${o.arch};; *) echo ${o.os};; esac`);
  if (o.smiMem != null) w('nvidia-smi', `case "$*" in *-L*) echo "GPU 0: NVIDIA (fake)";; *memory.total*) echo "${o.smiMem}";; esac`);
  else w('nvidia-smi', 'exit 9'); // "not installed": -L fails
  if (o.memsize) w('sysctl', `echo ${o.memsize}`);
  const meminfo = path.join(bin, 'meminfo'); fs.writeFileSync(meminfo, `MemTotal:       ${o.meminfoKB ?? 0} kB\nMemAvailable:   1000 kB\n`);
  const r = spawnSync('bash', ['scripts/install.sh', '--detect'], { cwd: REPO, encoding: 'utf8', timeout: 30000, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, OPENHIGGSFIELD_MEMINFO: meminfo } });
  assert.equal(r.status, 0, `${name}: exit ${r.status}\n${r.stderr}${r.stdout}`);
  const line = r.stdout.split('\n').find((l) => l.startsWith('OS=')) ?? ''; return { line, out: r.stdout, kv: Object.fromEntries(line.split(' ').map((x) => x.split('='))) };
}
try {
  const pc = machine('pc', { os: 'Linux', arch: 'x86_64', smiMem: '24564', meminfoKB: 64 * 1048576 });
  assert.deepEqual([pc.kv.GPU, pc.kv.UNIFIED, pc.kv.VRAM_GB, pc.kv.TORCH_INDEX], ['cuda', '0', '23', 'cu128']); assert.match(pc.out, /NVIDIA CUDA \(23 GB VRAM\)/);
  ok('NVIDIA PC: VRAM from nvidia-smi, cu128 wheels');
  for (const na of ['[N/A]', 'Not Supported', '[Not Supported]']) {
    const sp = machine(`spark-${na.replace(/\W/g, '')}`, { os: 'Linux', arch: 'aarch64', smiMem: na, meminfoKB: 128 * 1048576 });
    assert.deepEqual([sp.kv.GPU, sp.kv.UNIFIED, sp.kv.VRAM_GB, sp.kv.TORCH_INDEX], ['cuda', '1', '128', 'cu130'], `Spark with "${na}"`); assert.match(sp.out, /unified memory \(128 GB shared/); }
  ok('DGX Spark: nvidia-smi "[N/A]" / "Not Supported" no longer aborts; unified memory from MemTotal; cu130 wheels on aarch64');
  const noMeminfo = machine('spark-nomem', { os: 'Linux', arch: 'aarch64', smiMem: '[N/A]' }); assert.equal(noMeminfo.kv.GPU, 'cuda');
  ok('Spark with an unreadable MemTotal: still detects (0 GB), no crash');
  const mac = machine('mac', { os: 'Darwin', arch: 'arm64', memsize: 64 * 2 ** 30 });
  assert.deepEqual([mac.kv.GPU, mac.kv.RAM_GB, mac.kv.VRAM_GB, mac.kv.TORCH_INDEX], ['mps', '64', '48', 'default']); assert.match(mac.out, /64 GB unified memory, about 48 GB usable for models/); assert.doesNotMatch(mac.out.split("\n")[0], /VRAM/, "the System line never says VRAM on a Mac");
  ok('Mac: 64 GB unified, about 48 GB usable, never called VRAM; default PyTorch wheels');
  const cpu = machine('cpu', { os: 'Linux', arch: 'x86_64' }); assert.deepEqual([cpu.kv.GPU, cpu.kv.TORCH_INDEX], ['cpu', 'cpu']);
  ok('no GPU: CPU wheels');
  const HW = await import('../src/hardware.ts');
  assert.equal(HW.parseMemAvailable('MemTotal:       131072000 kB\nMemFree:         2000000 kB\nMemAvailable:   80000000 kB\n'), 80000000 * 1024, 'Spark live memory: MemAvailable, not MemFree');
  assert.equal(HW.parseMemAvailable('MemTotal: 1 kB'), null);
  ok('Spark memory read: MemAvailable from /proc/meminfo (what free -h shows), never the GPU reading');
  const sh = fs.readFileSync(path.join(REPO, 'scripts/install.sh'), 'utf8'); assert.match(sh, /pip install -q onnxruntime/, 'ARM64 Linux installs the CPU onnxruntime');
  const packs = JSON.parse(fs.readFileSync(path.join(REPO, 'readiness/manifest/custom-nodes.json'), 'utf8')).packs as Record<string, any>;
  for (const [k, p] of Object.entries(packs)) if (p.dir && !p.optional) assert.ok(typeof p.aarch64 === 'string' && p.aarch64.length > 10, `${k} has an aarch64 note`);
  assert.match(packs.comfyui_controlnet_aux.aarch64, /onnxruntime/);
  ok('every installed custom-node pack has an aarch64 note (DWPose: CPU onnxruntime)');
} finally { fs.rmSync(T, { recursive: true, force: true }); }
