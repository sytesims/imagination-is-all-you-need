// A very small Chrome DevTools Protocol driver (no dependencies): launches the Chromium headless shell Playwright caches
// (~/Library/Caches/ms-playwright/chromium_headless_shell-*, or MODEL_HEALTH_CHROMIUM), opens one page, and offers the few calls the UI health check needs.
// Never Google Chrome or Safari. Returns null when no headless shell is installed (the caller skips).
import { spawn, type ChildProcess } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

export function findChromium(): string | null {
  if (process.env.MODEL_HEALTH_CHROMIUM && fs.existsSync(process.env.MODEL_HEALTH_CHROMIUM)) return process.env.MODEL_HEALTH_CHROMIUM;
  const roots = [path.join(os.homedir(), 'Library/Caches/ms-playwright'), path.join(os.homedir(), '.cache/ms-playwright')];
  for (const r of roots) { if (!fs.existsSync(r)) continue;
    for (const d of fs.readdirSync(r).filter((x) => /^chromium_headless_shell-\d+$/.test(x)).sort().reverse()) for (const sub of fs.readdirSync(path.join(r, d))) {
      const f = path.join(r, d, sub, 'chrome-headless-shell'); if (fs.existsSync(f)) return f; } }
  return null;
}

export class Page {
  private id = 0; private pending = new Map<number, { ok: (v: any) => void; no: (e: Error) => void }>(); private listeners: ((m: any) => void)[] = [];
  constructor(private ws: WebSocket, private proc: ChildProcess, private dir: string) {
    ws.addEventListener('message', (e: any) => { const m = JSON.parse(String(e.data)); if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id)!; this.pending.delete(m.id); m.error ? p.no(new Error(m.error.message)) : p.ok(m.result); } else for (const l of this.listeners) l(m); });
  }
  send(method: string, params: Record<string, unknown> = {}): Promise<any> { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((ok, no) => { this.pending.set(id, { ok, no }); setTimeout(() => { if (this.pending.delete(id)) no(new Error(`${method} timed out`)); }, 30000); }); }
  on(fn: (m: any) => void) { this.listeners.push(fn); }
  async eval<T = any>(expr: string): Promise<T> { const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result?.value as T; }
  async goto(url: string) { try { await this.eval('window.__mhOld = 1'); } catch { /* */ } await this.send('Page.navigate', { url }); await this.waitFor('!window.__mhOld && document.readyState === "complete"', 20000); }
  async waitFor(expr: string, ms = 10000): Promise<boolean> { const end = Date.now() + ms; while (Date.now() < end) { try { if (await this.eval<boolean>(`!!(${expr})`)) return true; } catch { /* page busy */ } await new Promise((r) => setTimeout(r, 120)); } return false; }
  /** Click the first element matching a CSS selector (scrolled into view, a real mouse click at its centre). */
  async click(sel: string): Promise<boolean> {
    const box = await this.eval<{ x: number; y: number } | null>(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center', inline: 'center' }); const r = e.getBoundingClientRect(); return r.width && r.height ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);
    if (!box) { const ok = await this.eval<boolean>(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`); return ok; }
    for (const type of ['mousePressed', 'mouseReleased']) await this.send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 }); return true;
  }
  /** Put files on a file input (hidden ones too), like a user picking them. */
  async setFiles(sel: string, files: string[]): Promise<boolean> {
    const { root } = await this.send('DOM.getDocument', { depth: 0 }); const { nodeId } = await this.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel }); if (!nodeId) return false;
    await this.send('DOM.setFileInputFiles', { nodeId, files }); return true;
  }
  async type(sel: string, text: string) { await this.click(sel); await this.send('Input.insertText', { text }); }
  async screenshot(file: string) { const r = await this.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(r.data, 'base64')); }
  async close() { try { this.ws.close(); } catch { /* */ } try { this.proc.kill('SIGKILL'); } catch { /* */ } fs.rmSync(this.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
}

export async function openPage(width = 1440, height = 900): Promise<Page | null> {
  const bin = findChromium(); if (!bin) return null; const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-chromium-'));
  const proc = spawn(bin, ['--remote-debugging-port=0', `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--mute-audio', `--window-size=${width},${height}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl: string = await new Promise((ok, no) => { let buf = ''; const t = setTimeout(() => no(new Error('chromium did not start')), 20000);
    proc.stderr!.on('data', (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(t); ok(m[1]); } }); proc.on('exit', () => no(new Error('chromium exited'))); });
  const port = new URL(wsUrl).port; let target: any = null;
  for (let i = 0; i < 50 && !target; i++) { try { target = ((await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as any[]).find((t) => t.type === 'page'); } catch { /* */ } if (!target) await new Promise((r) => setTimeout(r, 100)); }
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((ok, no) => { ws.addEventListener('open', ok); ws.addEventListener('error', no); });
  const page = new Page(ws, proc, dir); page.on((m) => { if (m.method === 'Page.javascriptDialogOpening') void page.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => undefined); }); // "Leave site?" on navigation: leave
  await page.send('Page.enable'); await page.send('Runtime.enable'); await page.send('Network.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); return page;
}
