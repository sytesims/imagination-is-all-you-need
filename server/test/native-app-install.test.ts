// Source contract for the native PowerShell instructions, not a Windows execution test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ps = readFileSync(new URL('../../scripts/install.ps1', import.meta.url), 'utf8');
assert.match(ps, /Need npm\.cmd/, 'require npm command shim instead of relying on npm.ps1 execution policy');
assert.match(ps, /ffprobe/, 'check ffprobe, not just ffmpeg');
assert.match(ps, /npm\.cmd run setup/, 'recommended startup includes API, web and MCP via app setup');
assert.doesNotMatch(ps, /Get-Content \$envFile/, 'do not print a fragile unquoted settings-file parser');
assert.match(ps, /Replace\("'", "''"\)/, 'quote installation paths for the printed PowerShell command');
assert.doesNotMatch(ps, /Set-ExecutionPolicy/, 'do not disable user PowerShell policy');
console.log('ok native app install instructions: app-only setup, Windows npm shim, media prerequisites and quoted paths (source contract only)');
