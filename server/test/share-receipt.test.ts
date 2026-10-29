// Cost receipt (2026-10-26): server/src/shared/shareReceipt.ts, the caption line (web sharePlatforms.ts captionFor), the recipe's receipt
// (shared/recipe.ts) and the corner tag burned into a video by the share export (shareExport.ts, clean style, 9:16, audio kept).
// Unit only, plus one small ffmpeg run (temp data dir, no server, no keys, no spend). Run: npx tsx test/share-receipt.test.ts
import assert from 'node:assert/strict'; import { execFileSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'share-receipt-')); process.env.OPENHIGGSFIELD_DATA_DIR = D;
const ok = (m: string) => console.log('ok ' + m);
const S = await import('../src/shared/shareReceipt.ts');
const R = await import('../src/shared/recipe.ts');
const P = await import('../../web/src/shared/sharePlatforms.ts');
const T0 = 1_760_000_000_000;

try {
  // ---------------- the line ----------------
  {
    const local = S.shareReceipt({ status: 'done', runOn: 'local', place: { runOn: 'local', label: 'Local' }, cost: 0, machine: 'M3 Max', createdAt: T0, startedAt: T0, renderStartedAt: T0 + 2000, finishedAt: T0 + 2000 + 8 * 60_000 }, { model: 'LTX-2.5 22B' });
    assert.equal(local?.text, 'Made free on my computer · LTX-2.5 22B · 8 min'); assert.equal(local?.kind, 'local'); assert.equal(local?.place, null, 'no place word for local');
    assert.equal(S.machineWords('mps'), 'my computer'); assert.equal(S.machineWords('Apple M2'), 'my computer'); assert.equal(S.machineWords('RTX 4090'), 'my computer'); // copy wave 1: never a brand
    assert.equal(S.machineWords('cuda:0'), 'my computer'); assert.equal(S.machineWords(null), 'my computer'); assert.equal(S.machineWords('x'.repeat(80)), 'my computer');
    const actual = S.shareReceipt({ status: 'done', runOn: 'comfy-cloud', place: { runOn: 'comfy-cloud', label: 'Comfy · Comfy Router' }, cost: 30, actualUsd: 0.32, startedAt: T0, finishedAt: T0 + 41_000 }, { model: 'Kling 3.0' });
    assert.equal(actual?.text, '$0.32 · Kling 3.0 · Comfy Cloud · 41 s', 'a reported cost is shown exact'); assert.equal(actual?.kind, 'actual');
    const est = S.shareReceipt({ status: 'done', runOn: 'comfy-cloud', place: { label: 'Comfy · Comfy Router' }, cost: 32, spend: { billedTo: 'comfy', estUsd: 0.32, actualUsd: null }, startedAt: T0, finishedAt: T0 + 41_000 }, { model: 'Kling 3.0' });
    assert.equal(est?.text, '≈ $0.32 · Kling 3.0 · Comfy Cloud · 41 s', 'an estimate always carries ≈');
    const fromCredits = S.shareReceipt({ status: 'done', runOn: 'fal', place: { label: 'fal' }, cost: 4 }, { model: 'FLUX.2' });
    assert.equal(fromCredits?.text, '≈ $0.04 · FLUX.2 · fal', 'credits (1 = $0.01) without a spend row; no time when unknown');
    const spendActual = S.shareReceipt({ status: 'done', runOn: 'bfl', place: { label: 'Black Forest Labs' }, cost: 5, spend: { estUsd: 0.05, actualUsd: 0.045 } }, { model: 'FLUX.2 [pro]' });
    assert.equal(spendActual?.cost, '$0.045'); assert.equal(spendActual?.kind, 'actual');
    const sample = S.shareReceipt({ status: 'done', runOn: 'comfy-cloud', place: { label: 'Comfy · Comfy Cloud' }, cost: 0, isSample: true, startedAt: T0, finishedAt: T0 + 3000 }, { model: 'LTX-2.5 22B' });
    assert.equal(sample?.text, 'Sample, nothing billed · LTX-2.5 22B', 'a sample never shows a price, place or time'); assert.equal(sample?.kind, 'sample');
    const localSample = S.shareReceipt({ status: 'done', runOn: 'local', isSample: true }, { model: 'X' }); assert.equal(localSample?.kind, 'sample', 'sample wins over local (nothing really ran)');
    const freeHosted = S.shareReceipt({ status: 'done', runOn: 'fal', place: { label: 'fal' }, cost: 0 }, { model: 'Y' }); assert.equal(freeHosted?.text, 'Free · Y · fal');
    const unknown = S.shareReceipt({ status: 'done', runOn: 'fal', place: { label: 'fal' }, cost: null as any }, { model: 'Z' }); assert.equal(unknown?.text, 'Z · fal', 'no figure: no cost part, never a made-up one'); assert.equal(unknown?.cost, null);
    assert.equal(S.shareReceipt({}, {}), null, 'nothing known: no receipt'); assert.equal(S.shareReceipt(null), null);
    const running = S.shareReceipt({ status: 'running', runOn: 'local', startedAt: T0, finishedAt: null }, { model: 'M' }); assert.equal(running?.time, null, 'no time before it ends');
    assert.equal(S.receiptFacts(est), '≈ $0.32 · Comfy Cloud · 41 s'); assert.equal(S.receiptFacts(sample), 'Sample, nothing billed'); assert.equal(S.receiptFacts(null), null);
    for (const r of [local, actual, est, sample, freeHosted]) { const back = S.receiptFromText(r!.text)!; assert.equal(back.kind, r!.kind, r!.text); assert.equal(back.cost, r!.cost); assert.equal(back.time, r!.time); }
    assert.equal(S.receiptFromText(''), null); assert.equal(S.receiptFromText('x'.repeat(500))!.text.length, S.MAX_RECEIPT);
    ok('local / actual / estimate (≈) / credits / sample / free / unknown lines; machine words; facts and the text round trip');
  }
  // ---------------- caption ----------------
  {
    const base = P.captionOf({ featureId: null, model: 'Kling 3.0', kind: 'video' }); const rc = '≈ $0.32 · Kling 3.0 · Comfy Cloud · 41 s';
    const x = P.captionFor('x', { base, repo: 'https://github.com/x/y', tag: true, receipt: rc });
    assert.equal(x, `${base}\n${rc} ${P.APP_HASHTAG}`, 'X: the receipt on its own line, the hashtag kept at the end');
    assert.equal(P.captionFor('x', { base, repo: 'r', tag: true, receipt: null }), `${base} ${P.APP_HASHTAG}`, 'off: the caption is exactly as before');
    const long = P.captionFor('x', { base, repo: 'r', tag: true, receipt: rc, prompt: 'p'.repeat(400) }); assert.ok(P.xLength(long) <= P.PLATFORMS.x.captionMax, 'the prompt gives way, X stays within 280');
    assert.ok(long.includes(rc) && long.endsWith(P.APP_HASHTAG));
    const ig = P.captionFor('instagram', { base, repo: 'https://github.com/x/y', receipt: rc, prompt: 'a cat' }); assert.equal(ig, `${base}\n${rc}\n\n“a cat”\n\ngithub.com/x/y`);
    assert.ok(!P.captionFor('instagram', { base, repo: 'r', receipt: rc }).includes('#'), 'no hashtag on Instagram');
    assert.equal(P.captionFor('system', { base, repo: 'R', receipt: rc, link: 'L' }), `${base} (${rc}) L`);
    ok('caption: own line on X / Instagram / TikTok, hashtag behaviour unchanged, 280 respected, off = unchanged');
  }
  // ---------------- recipe ----------------
  {
    const s = R.sanitizeRecipe({ tool: 'create-video', model: { id: 'kling-3', name: 'Kling 3.0' }, receipt: '≈ $0.32 · Kling 3.0 · Comfy Cloud · 41 s' }); assert.ok(s.ok);
    const back = R.decodeRecipe(R.encodeRecipe(s.recipe)); assert.ok(back.ok); assert.equal(back.recipe.receipt, '≈ $0.32 · Kling 3.0 · Comfy Cloud · 41 s', 'the receipt travels in the link');
    assert.match(R.recipeText(s.recipe, 'L'), /\nReceipt: ≈ \$0\.32 · Kling 3\.0/);
    const bad = R.sanitizeRecipe({ tool: 'create-video', receipt: '<img src=x onerror=alert(1)>' }); assert.ok(bad.ok && !bad.recipe.receipt, 'markup never travels');
    const huge = R.sanitizeRecipe({ tool: 'create-video', receipt: 'y'.repeat(5000) }); assert.ok(huge.ok && huge.recipe.receipt!.length === 140, 'capped');
    const none = R.sanitizeRecipe({ tool: 'create-video', receipt: 42 }); assert.ok(none.ok && !('receipt' in none.recipe));
    ok('recipe: the receipt round-trips, shows in the text copy, markup refused, capped');
  }
  // ---------------- burned-in corner tag (the share export, clean style) ----------------
  {
    const X = await import('../src/shareExport.ts');
    const ff = (...a: string[]) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...a]);
    const src = path.join(D, 'src.mp4'); ff('-f', 'lavfi', '-i', 'testsrc=s=640x360:r=30:d=2', '-f', 'lavfi', '-i', 'sine=d=2', '-c:a', 'aac', '-c:v', 'libx264', '-preset', 'ultrafast', '-shortest', src);
    const ov = path.join(D, 'tag.png'); ff('-f', 'lavfi', '-i', 'color=c=black@0.0:s=1080x1920', '-frames:v', '1', '-vf', 'format=rgba,drawbox=x=43:y=43:w=300:h=44:color=0xFF7A1A@1.0:t=fill', ov);
    const r = await X.brandVideo('jobR', src, { overlay: fs.readFileSync(ov), endCard: null, key: JSON.stringify({ style: 'clean', toggles: {}, wantEnd: false }), frame: X.frameOf('9:16', 'fit') });
    const p = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', r.file]).toString());
    const v = p.streams.find((s: any) => s.codec_type === 'video'); assert.equal(v.width, 1080); assert.equal(v.height, 1920);
    assert.ok(p.streams.some((s: any) => s.codec_type === 'audio' && s.codec_name === 'aac'), 'audio kept');
    const px = [...execFileSync('ffmpeg', ['-v', 'error', '-ss', '1', '-i', r.file, '-frames:v', '1', '-vf', 'crop=2:2:100:60', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])].slice(0, 3);
    assert.ok([0xff, 0x7a, 0x1a].every((c, i) => Math.abs(c - px[i]) < 40), `tag burned in the top-left corner (${px})`);
    ok('the corner tag in a clean 9:16 export is burned in by ffmpeg, audio kept');
  }
} finally { fs.rmSync(D, { recursive: true, force: true }); }
