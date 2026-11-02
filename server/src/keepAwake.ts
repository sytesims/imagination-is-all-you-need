/**
 * Keep the computer awake while a job runs on the user's own ComfyUI (this computer or their own GPU box): a long run (hours) must not be cut by sleep.
 * One shared hold count: the first running job starts one helper process, the last one to end (done, failed, cancelled) stops it; server exit stops it too.
 * No native code, no admin rights; each helper also ends by itself if the server dies:
 *   macOS:   caffeinate -i -w <server pid>                    (built in; idle sleep blocked, the display may still sleep)
 *   Windows: PowerShell calling SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED), looping while the server lives
 *   Linux:   systemd-inhibit --what=idle:sleep around a shell loop that lives while the server does; missing → skipped quietly
 * Off with OPENHIGGSFIELD_KEEP_AWAKE=0.
 */
import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { env } from './env.js';

type Spawner = (cmd: string, args: string[], opts: SpawnOptions) => ChildProcess;
let spawner: Spawner = nodeSpawn; let platform: NodeJS.Platform = process.platform;
/** Tests: a fake spawner and platform. */
export function setKeepAwakeDeps(o: { spawn?: Spawner; platform?: NodeJS.Platform }) { if (o.spawn) spawner = o.spawn; if (o.platform) platform = o.platform; }

const WHY = 'A generation is running in Imagination Is All You Need';
/** The helper command for this platform, or null where none is supported. */
export function keepAwakeCommand(plat: NodeJS.Platform, pid: number): { cmd: string; args: string[]; group: boolean } | null {
  if (plat === 'darwin') return { cmd: 'caffeinate', args: ['-i', '-w', String(pid)], group: false };
  if (plat === 'win32') return { cmd: 'powershell.exe', group: false, args: ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command',
    `$k=Add-Type -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);' -Name P -Namespace KeepAwake -PassThru; ` +
    `[void]$k::SetThreadExecutionState(0x80000001); while (Get-Process -Id ${pid} -ErrorAction SilentlyContinue) { Start-Sleep -Seconds 30 }`] };
  if (plat === 'linux') return { cmd: 'systemd-inhibit', group: true, args: ['--what=idle:sleep', '--who=Imagination Is All You Need', `--why=${WHY}`, '--mode=block',
    'sh', '-c', `while kill -0 ${pid} 2>/dev/null; do sleep 30; done`] };
  return null;
}

let holds = 0; let child: ChildProcess | null = null; let hooked = false;
const enabled = () => env('KEEP_AWAKE') !== '0';
function start() {
  const c = keepAwakeCommand(platform, process.pid); if (!c) return;
  try {
    const p = spawner(c.cmd, c.args, { stdio: 'ignore', detached: c.group, windowsHide: true }); child = p;
    p.on('error', () => { if (child === p) child = null; }); // not installed (e.g. no systemd-inhibit): skipped quietly
    p.on('exit', () => { if (child === p) child = null; });
    p.unref?.();
  } catch { child = null; }
  if (!hooked) { hooked = true; process.once('exit', stop); }
}
function stop() {
  const p = child; child = null; if (!p) return;
  try { if (p.pid && keepAwakeCommand(platform, 0)?.group) process.kill(-p.pid, 'SIGTERM'); else p.kill(); } catch { try { p.kill(); } catch { /* gone */ } }
}
/** Hold the computer awake until the returned release() is called (safe to call more than once). */
export function holdAwake(): () => void {
  if (!enabled()) return () => {};
  holds++; if (holds === 1) start();
  let released = false;
  return () => { if (released) return; released = true; holds = Math.max(0, holds - 1); if (holds === 0) stop(); };
}
/** Tests / status: how many jobs hold it, and whether a helper runs. */
export const keepAwakeState = () => ({ holds, active: !!child });
