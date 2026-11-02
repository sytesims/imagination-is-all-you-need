// Quote = charge for prompt-billed models (2026-11-02): GPT Image bills prompt text, so for every app that composes a recipe around the typed
// words, the quote (tools/apps.ts appQuotePromptBytes, used by GET /price) must count exactly the prompt the submit (parseInput) sends.
// Both go through appFieldVals + composeAppPrompt; this checks every such app with its default inputs, with and without a photo.
// Run: npx tsx test/app-quote-prompt-bytes.test.ts   (in-process, temp data dir, mock backend, no network)
import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import zlib from 'node:zlib';
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'app-qpb-')); process.env.OPENHIGGSFIELD_DATA_DIR = DATA; process.env.OPENHIGGSFIELD_BACKEND = 'mock';
const ok = (m: string) => console.log('ok ' + m);
const A = await import('../src/tools/apps.ts'); const { getTool } = await import('../src/tools/registry.ts');
/* a plain 1024×1024 grey PNG (big enough for every app's size check) */
const crc = (b: Buffer) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const W = 1024; const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(W, 4); ihdr[8] = 8; ihdr[9] = 2;
const raw = Buffer.alloc((W * 3 + 1) * W, 0x80); for (let y = 0; y < W; y++) raw[y * (W * 3 + 1)] = 0;
fs.mkdirSync(path.join(DATA, 'uploads'), { recursive: true });
fs.writeFileSync(path.join(DATA, 'uploads', 'in.png'), Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));

const WORDS = 'a red ceramic mug on a wooden table';
let checked = 0; const skipped: string[] = [];
for (const a of A.APP_GALLERY) {
  if (a.noPrompt || !(a.compose || a.promptTemplate)) continue; const tool = getTool(`app-${a.id}`); if (!tool) continue;
  for (const photo of [false, true]) {
    /* the files the submit gets: the image slots (photo or not), plus whatever a required group still asks for (each an image) */
    const files: Record<string, string[]> = photo ? { image: ['uploads/in.png'] } : {}; const fields: Record<string, string> = { prompt: WORDS };
    let inp: any = null;
    for (let i = 0; i < 4; i++) { inp = await tool.parseInput({ ...fields }, files); const f = inp?.issues?.[0]?.field; if (!inp?.error || !f || files[f] || inp.issues[0].code !== 'required') break; files[f] = ['uploads/in.png']; }
    if (inp?.error) { skipped.push(`${a.id}${photo ? '+photo' : ''}: ${inp.error}`); continue; }
    const q: Record<string, string> = { ...fields, ...Object.fromEntries(Object.keys(files).map((k) => [k, '1'])) };
    const sent = new TextEncoder().encode(String(inp.prompt ?? '')).length;
    assert.equal(A.appQuotePromptBytes(tool, q), sent, `${a.id}${photo ? ' + photo' : ''}: quote counts the prompt the submit sends (${JSON.stringify(String(inp.prompt).slice(0, 120))})`);
    /* the canvas sends only the length of its words: same count */
    assert.equal(A.appQuotePromptBytes(tool, { ...q, prompt: undefined as any, promptBytes: String(new TextEncoder().encode(WORDS).length) }), sent, `${a.id}${photo ? ' + photo' : ''}: promptBytes = the words' length gives the same count`);
    checked++;
  }
}
assert.ok(checked >= 10, `checked ${checked} app/photo pairs (skipped: ${skipped.join(' | ')})`);
ok(`quote prompt bytes = submit prompt bytes for ${checked} app/photo pairs${skipped.length ? ` (not runnable with defaults: ${skipped.length})` : ''}`);
console.log('PASS app-quote-prompt-bytes');
