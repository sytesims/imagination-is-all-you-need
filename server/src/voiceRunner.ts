/**
 * Server-side voice runner (server/py/voice_runner.py, CPU): faster-whisper (MIT) transcription and NLLB-200 distilled 600M
 * (CC BY-NC 4.0, https://huggingface.co/facebook/nllb-200-distilled-600M) translation via CTranslate2. No external server.
 * Python: OPENHIGGSFIELD_PY (default server/py/.venv/bin/python); setup: `python server/py/voice_runner.py setup`.
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';
const PY_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'py');
const python = () => env('PY') || path.join(PY_DIR, '.venv', 'bin', 'python');
export const runnerScript = () => env('VOICE_RUNNER') || path.join(PY_DIR, 'voice_runner.py');
function run(args: string[], stdin = '', timeoutMs = 20 * 60_000): Promise<any> {
  return new Promise((res, rej) => {
    const p = spawn(python(), [runnerScript(), ...args], { stdio: ['pipe', 'pipe', 'pipe'] }); let out = '', err = '';
    const t = setTimeout(() => { p.kill('SIGKILL'); rej(new Error('voice runner timed out')); }, timeoutMs);
    p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => { clearTimeout(t); rej(new Error(`voice runner not installed (${python()}): ${e.message}`)); });
    p.on('close', (code, signal) => { clearTimeout(t); if (code !== 0) return rej(new Error(`voice runner failed: ${err.trim().split('\n').pop() || (signal ? `stopped (${signal})` : `exit ${code}`)}`)); try { res(JSON.parse(out)); } catch { rej(new Error('voice runner returned no JSON')); } });
    // a runner that exits before reading its input (crash, wrong python) makes the write fail with EPIPE: without a listener that error is thrown
    // on the stream and takes the whole API down. The 'close' above already fails the job with the runner's own words.
    p.stdin.on('error', () => {});
    p.stdin.end(stdin);
  });
}
export const transcribe = (file: string): Promise<{ text: string; language: string }> => run(['transcribe', file]);
export type Segment = { start: number; end: number; text: string };
/** Captions (captions.ts): the same transcription with Whisper's timed segments (seconds). `language` forces it (e.g. a Translate Video result). */
export async function transcribeSegments(file: string, language?: string | null): Promise<{ text: string; language: string; segments: Segment[] }> {
  const r = await run(['transcribe', file, '--segments', ...(language ? ['--language', language] : [])]);
  const segments: Segment[] = (Array.isArray(r?.segments) ? r.segments : []).map((s: any) => ({ start: Number(s.start) || 0, end: Number(s.end) || 0, text: String(s.text ?? '').trim() })).filter((s: Segment) => s.text && s.end > s.start);
  return { text: String(r?.text ?? ''), language: String(r?.language ?? ''), segments };
}
/** Is the voice runner set up here (the venv's python and faster-whisper)? Never installs or downloads anything. */
export function voiceRunnerReady(): { ready: boolean; python: string } { return { ready: existsSync(python()), python: python() }; }
export const translateLocal = async (text: string, src: string, tgt: string): Promise<string> => (await run(['translate', '--src', src, '--tgt', tgt], text)).text;
