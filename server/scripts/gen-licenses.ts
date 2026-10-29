/** Writes <repo>/LICENSES.md from the live registry (same data as GET /api/licenses). npm run licenses -w server */
import { writeFileSync, mkdtempSync } from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
process.env.OPENHIGGSFIELD_DATA_DIR ||= mkdtempSync(path.join(os.tmpdir(), 'ohf-lic-'));
const { licensesMarkdown, buildLicenseReport } = await import('../src/licensesReport.js');
await import('../src/tools/registry.js');
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../LICENSES.md');
const r = buildLicenseReport(); writeFileSync(out, licensesMarkdown(r)); console.log(`wrote ${out}: ${r.models.length} models`);
