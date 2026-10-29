// J2: the H3 Character Swap LoRA credits Akatz Labs and carries its upstream NOTICE verbatim, in licenses.ts and the generated docs. Run: npx tsx test/akatz-notice.test.ts
import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
const { LICENSES } = await import('../src/licenses.ts'); const REPO = path.resolve(import.meta.dirname, '../..');
const l: any = LICENSES['minimax-community-akatz-charswap']; assert.equal(l.credit.by, 'Akatz Labs'); assert.match(l.credit.noticeUrl, /akatz-ai\/MiniMax-H3-Character-Swap-LoRA\/raw\/main\/NOTICE$/);
assert.ok(l.noticeFile.includes('Modified by Akatz Labs: character-swap LoRA fine-tuning, 1,000 updates, September 2026. This repository contains adapter weights, not base-model weights.'));
assert.ok(l.noticeFile.includes('base-model and training-assistant weights are not included.'));
for (const f of ['LICENSES.md', 'docs/ATTRIBUTION.md']) { const t = fs.readFileSync(path.join(REPO, f), 'utf8'); assert.match(t, /H3 Character Swap LoRA by Akatz Labs/, f); assert.match(t, /> Modified by Akatz Labs: character-swap LoRA fine-tuning, 1,000 updates/, f); }
console.log('ok Akatz Labs credit + verbatim NOTICE in licenses.ts, LICENSES.md, docs/ATTRIBUTION.md'); console.log('ALL OK akatz-notice');
