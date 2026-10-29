// Production API/web startup only. Never starts MCP, ComfyUI or a generation.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const HOST = '127.0.0.1';

export function cleanEnvironment(source = process.env) {
  // Whitelist, not a key blacklist: also excludes NODE_OPTIONS, proxies and dotenv.
  const allowed = /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|TMPDIR|HOME|USERPROFILE|LOCALAPPDATA|APPDATA|LANG|LC_ALL)$/i;
  return Object.fromEntries(Object.entries(source).filter(([key]) => allowed.test(key)));
}

export async function reservePort(port = 0) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: HOST, port, exclusive: true }, resolve);
  });
  return { port: server.address().port, release: () => new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve())) };
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  let timer;
  await Promise.race([exited, new Promise(resolve => { timer = setTimeout(resolve, 2000); })]);
  clearTimeout(timer);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL'); // Direct owned child only; Windows maps this to termination.
    await Promise.race([exited, delay(2000, undefined, { ref: false }).then(() => {
      if (child.exitCode === null && child.signalCode === null) throw new Error('Owned child did not stop');
    })]);
  }
}

export async function runSmoke({ commands, checks, env, timeoutMs = 60_000, signal, onSpawn = () => {} }) {
  const children = [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Readiness exceeded 60-second deadline')), timeoutMs);
  const cancel = () => controller.abort(signal.reason ?? new Error('Smoke cancelled'));
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  try {
    controller.signal.throwIfAborted();
    for (const command of commands) {
      controller.signal.throwIfAborted();
      const child = spawn(process.execPath, command.args, { cwd: command.cwd, env, stdio: 'inherit', shell: false });
      children.push(child);
      child.once('error', error => controller.abort(error));
      child.once('exit', (code, sig) => controller.abort(new Error(`${command.name} exited early (${code ?? sig})`)));
      onSpawn(child);
    }
    for (const check of checks) {
      while (true) {
        controller.signal.throwIfAborted();
        try {
          const response = await fetch(check.url, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(1000)]) });
          await check.verify(response);
          console.log(`ok ${check.url}`);
          break;
        } catch {
          controller.signal.throwIfAborted();
          await delay(100, undefined, { signal: controller.signal });
        }
      }
    }
    controller.signal.throwIfAborted();
  } catch (error) {
    throw controller.signal.aborted ? controller.signal.reason : error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    const results = await Promise.allSettled(children.map(stop));
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
  }
}

export async function main() {
  const scratch = await mkdtemp(path.join(tmpdir(), 'openhiggsfield-ci smoke-'));
  const reservations = [];
  const controller = new AbortController();
  const cancel = () => controller.abort(new Error('Smoke interrupted'));
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  try {
    await access(path.join(ROOT, 'server/dist/index.js'));
    await access(path.join(ROOT, 'web/dist/index.html'));
    const api = await reservePort(); reservations.push(api);
    const web = await reservePort(); reservations.push(web);
    const envFile = path.join(scratch, 'empty.env');
    await writeFile(envFile, '');
    await writeFile(path.join(scratch, 'filming.json'), '{"on":false}');
    const env = {
      ...cleanEnvironment(), NODE_ENV: 'production', CI: 'true',
      HOST, WEB_HOST: HOST, PORT: String(api.port), WEB_PORT: String(web.port),
      OPENHIGGSFIELD_API_PROXY: `http://${HOST}:${api.port}`,
      OPENHIGGSFIELD_BACKEND: 'mock', OPENHIGGSFIELD_USE_LOCAL: '0', COMFY_BASE_URL: '',
      OPENHIGGSFIELD_DATA_DIR: path.join(scratch, 'data'),
      OPENHIGGSFIELD_ENV_FILE: envFile, OPENHIGGSFIELD_FILMING_FILE: path.join(scratch, 'filming.json'),
    };
    const require = createRequire(path.join(ROOT, 'web/package.json'));
    const vite = path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js');
    // Release immediately before startup. A competing bind fails (API/Vite strict port), never silently changes port.
    await Promise.all(reservations.splice(0).map(item => item.release()));
    const health = async response => {
      const body = await response.json();
      if (!response.ok || body.ok !== true || body.backend !== 'mock') throw new Error('Expected healthy mock API');
    };
    await runSmoke({ env, signal: controller.signal, commands: [
      { name: 'API', cwd: path.join(ROOT, 'server'), args: ['dist/index.js'] },
      // Scratch root prevents Vite loading developer .env files. Existing preview config supplies the real proxy.
      { name: 'web', cwd: scratch, args: [vite, 'preview', scratch, '--config', path.join(ROOT, 'web/vite.config.ts'), '--outDir', path.join(ROOT, 'web/dist'), '--host', HOST, '--port', String(web.port), '--strictPort'] },
    ], checks: [
      { url: `http://${HOST}:${api.port}/api/health`, verify: health },
      { url: `http://${HOST}:${web.port}/api/health`, verify: health },
      { url: `http://${HOST}:${web.port}/`, verify: async response => {
        const html = await response.text();
        if (!response.ok || !response.headers.get('content-type')?.includes('text/html') || !/<div id="root">/.test(html) || !/\/assets\/[^" ]+\.js/.test(html)) throw new Error('Expected built app HTML');
      } },
    ] });
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
    await Promise.all(reservations.map(item => item.release()));
    await rm(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`CI smoke failed: ${error.message}`); process.exitCode = 1; });
}
