// The app's own licence is AGPL-3.0-or-later (relicensed from MIT, 2026-10-27). This checks the root LICENSE is the GNU AGPL v3 text,
// every package.json / manifest says AGPL-3.0-or-later, NOTICE carries the section 7 permission for tldraw, the global footer has a
// Source code link (AGPL section 13), our own tools are credited AGPL, and no user-facing string calls our app MIT. Third-party MIT
// credits (Comfy templates, BiRefNet, Mesh2Motion …) stay MIT and are not touched by these checks.
// Run: npx tsx test/agpl-licence.test.ts
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import ts from 'typescript';
process.env.OPENHIGGSFIELD_DATA_DIR ||= fs.mkdtempSync(path.join(os.tmpdir(), 'agpl-'));
const ok = (m: string) => console.log('ok ' + m);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f: string) => fs.readFileSync(path.join(REPO, f), 'utf8');
const SPDX = 'AGPL-3.0-or-later';

// 1. LICENSE is the GNU AGPL v3 text, unchanged at the top and the end
const lic = read('LICENSE');
assert.match(lic.split('\n')[0], /^\s*GNU AFFERO GENERAL PUBLIC LICENSE\s*$/);
assert.match(lic, /Version 3, 19 November 2007/);
assert.match(lic, /13\. Remote Network Interaction; Use with the GNU General Public License\./);
assert.match(lic, /END OF TERMS AND CONDITIONS/);
assert.doesNotMatch(lic, /MIT License|Permission is hereby granted, free of charge/);
ok('LICENSE is the GNU AGPL v3 text');

// 2. Licence fields
for (const f of ['package.json', 'web/package.json', 'server/package.json', 'mcp/package.json', 'mcp/manifest.json', '.claude-plugin/plugin.json'])
  assert.equal(JSON.parse(read(f)).license, SPDX, f);
assert.equal(JSON.parse(read('package-lock.json')).packages[''].license, SPDX, 'package-lock.json root');
assert.equal(JSON.parse(read('mcp/package-lock.json')).packages[''].license, SPDX, 'mcp/package-lock.json root');
assert.equal(JSON.parse(read('openapi.json')).info.license.identifier, SPDX, 'openapi.json info.license');
ok(`package.json, manifests, lockfile roots and openapi.json say ${SPDX}`);

// 3. NOTICE: copyright, the section 7 permission for tldraw, and tldraw keeps its own licence
const notice = read('NOTICE');
assert.match(notice, /Copyright \(C\) 2026 /);
assert.match(notice, /Additional permission under GNU AGPL version 3 section 7/);
assert.match(notice, /combining\s+it with tldraw[\s\S]*?@tldraw\/\*[\s\S]*?grant you additional permission to convey the resulting work/);
assert.match(notice, /licenses\/tldraw-LICENSE\.md/); assert.ok(fs.existsSync(path.join(REPO, 'licenses/tldraw-LICENSE.md')));
assert.match(read('README.md'), /\[NOTICE\]\(NOTICE\)/);
ok('NOTICE has the copyright line and the tldraw section 7 permission; README links it');

// 4. AGPL section 13: the global footer links to the source (the shared REPO_URL)
const app = read('web/src/App.tsx');
const footer = /<footer className="footer">[\s\S]*?<\/footer>/.exec(app)?.[0] ?? '';
assert.match(footer, /<a [^>]*href=\{REPO_URL\}[^>]*data-testid="footer-source"[^>]*>Source code<\/a>/, 'footer Source code link');
assert.match(app, /import \{ REPO_URL \} from '\.\/shared\/brand'/);
assert.match(footer, /\{FOOT_NAME\}/); const footLinks = read('web/src/shared/footerLinks.ts'); // the line both footers share
assert.match(/FOOT_NAME = '[^']*'/.exec(footLinks)?.[0] ?? '', /AGPL-3\.0/); assert.doesNotMatch(footer + footLinks, /\bMIT\b/);
ok('global footer: AGPL-3.0 and a Source code link to REPO_URL');

// 5. Our own tools and workflows are credited with the AGPL id
await import('../src/tools/registry.js');
const { LICENSES } = await import('../src/licenses.js'); const { getProvider } = await import('../src/providers.js');
assert.equal((LICENSES as any)[SPDX.toLowerCase()]?.name, SPDX);
for (const id of ['local-previz', 'local-turntable', 'local-finish']) { const p: any = getProvider(id); assert.ok(p, id); assert.equal(p.license, SPDX.toLowerCase(), id); assert.deepEqual(p.licenseParts, [SPDX.toLowerCase()], id); }
const sources = read('server/src/shared/workflowSources.ts');
assert.doesNotMatch(sources, /MIT \(this repo\)/); assert.match(sources, /AGPL-3\.0 \(this repo\)/);
ok('Direct a Shot / Turntable / Finish and our workflow credits use AGPL');

// 6. No user-facing string calls our app MIT. Reads string literals, template text and JSX text (TypeScript parser), so third-party
//    credits ("BiRefNet (MIT)", "MIT (Comfy-Org/workflow_templates)") pass; only phrases that describe this app or repo fail.
const OURS_MIT = /MIT License|MIT \(this repo\)|this repo, MIT|open[- ]source \(MIT\)|MIT[- ]licensed|own code is MIT/;
const ROOTS = ['web/src', 'server/src'];
const hits: string[] = [];
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : []);
for (const root of ROOTS) for (const file of walk(path.join(REPO, root))) {
  const src = fs.readFileSync(file, 'utf8'); if (!/MIT/.test(src)) continue;
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (n: ts.Node) => {
    const t = ts.isStringLiteralLike(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n) ? n.text : ts.isJsxText(n) ? n.getText() : null;
    if (t && OURS_MIT.test(t)) hits.push(`${path.relative(REPO, file)}: ${t.slice(0, 80)}`);
    n.forEachChild(visit);
  };
  visit(sf);
  // the "ours" credit helpers: { kind/source: 'ours', …, licence: 'MIT' }
  for (const m of src.matchAll(/(?:kind|source): 'ours'[^}\n]*?licence: '([^']*)'/g)) if (/^MIT/.test(m[1])) hits.push(`${path.relative(REPO, file)}: ours credited ${m[1]}`);
}
assert.deepEqual(hits, [], 'user-facing strings that call this app MIT');
for (const f of ['README.md', 'docs/SUBMISSION-README.md', 'docs/USAGE-NOTES.md', 'docs/PROVIDERS-AND-MODELS.md', 'docs/CONTRIBUTING.md', 'LICENSES.md'])
  assert.doesNotMatch(read(f), /Our code:\*\* MIT|App code:\*\* MIT|open-source \(MIT\)|MIT-licensed|own code is MIT|It's MIT licensed|openhiggsfield \(MIT\)|\| (?:Turntable|Direct a Shot)[^|]*\| [^|]*\| \[MIT\]/, f);
ok('no user-facing string or public doc calls our app MIT');
console.log('ALL OK agpl-licence');
