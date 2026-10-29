// Copy wave 1 (2026-10-27): the app always says "your computer", never a brand of computer or chip. This fails when a user-facing string in
// web/src, server/src/shared or server/src/tools says "Mac", "M1"–"M4", "Apple Silicon" or "MPS". It reads string literals, template text and
// JSX text with the TypeScript parser, so comments and code names (runOn 'local', `mseries`, `localApple`) never count.
// The allowlist names each file or string that may keep the word, and why. Run: npx tsx test/no-mac-copy.test.ts
import assert from 'node:assert/strict';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const ok = (m: string) => console.log('ok ' + m);

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROOTS = ['web/src', 'server/src/shared', 'server/src/tools'];
const WORD = /\bMac(?:s|OS)?\b|\bM[1-4](?: (?:Max|Pro|Ultra))?\b(?![.\d])|Apple[ -]?[Ss]ilicon|\bMPS\b/;
/** SVG path data ("M4 7h16…") is drawing, not words. */
const PATH_DATA = /^[MLHVCSQTAZmlhvcsqtaz\d.,\s-]+$/;

/** Files that may say it, with the reason. Keep this short. */
const FILE_ALLOW: Record<string, string> = {
};
/** Exact strings that may say it, wherever they are, with the reason. */
const STRING_ALLOW: [RegExp, string][] = [
  [/^(mps|MPS)$/, 'a device id the server reports (compared, never shown)'],
  [/^darwin$/, 'process.platform value'],
];
const FILE_RE = /\.(ts|tsx)$/;
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => { const p = path.join(d, e.name);
  return e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(p)) : FILE_RE.test(e.name) && !/\.d\.ts$/.test(e.name) ? [p] : []; });

const hits: string[] = [];
let files = 0, strings = 0;
for (const root of ROOTS) for (const abs of walk(path.join(REPO, root))) {
  const rel = path.relative(REPO, abs).split(path.sep).join('/'); if (FILE_ALLOW[rel]) continue; files++;
  const src = fs.readFileSync(abs, 'utf8'); if (!WORD.test(src)) continue;
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const check = (text: string, node: ts.Node) => { strings++; if (!WORD.test(text) || PATH_DATA.test(text.trim()) || /<(path|rect|circle|svg)\b/.test(text) || STRING_ALLOW.some(([re]) => re.test(text))) return;
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf)); hits.push(`${rel}:${line + 1}: ${JSON.stringify(text.slice(0, 120))}`); };
  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) check(n.text, n);
    else if (ts.isTemplateExpression(n)) { check(n.head.text, n); for (const s of n.templateSpans) check(s.literal.text, s); }
    else if (ts.isJsxText(n)) { const t = n.getText(sf).trim(); if (t) check(t, n); }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
assert.ok(files > 300, `scanned ${files} files`);
assert.deepEqual(hits, [], `User-facing copy names a brand of computer. Say "your computer" (or "Needs an NVIDIA graphics card"):\n${hits.join('\n')}`);
ok(`no "Mac" / "M1" / "Apple Silicon" / "MPS" in ${strings} strings across ${files} files (${Object.keys(FILE_ALLOW).length} files allowlisted)`);
