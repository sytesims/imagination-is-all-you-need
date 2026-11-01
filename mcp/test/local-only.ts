/** MCP HTTP bridge: Host / Origin check (src/localOnly.ts). No ports. Run: npx tsx test/local-only.ts */
import assert from 'node:assert/strict';
delete process.env.OPENHIGGSFIELD_ALLOWED_HOSTS; delete process.env.OPENHIGGSFIELD_ALLOWED_ORIGINS;
const { refuseReason } = await import('../src/localOnly.js');
const ok = (h: Record<string, string>) => assert.equal(refuseReason(h), null, JSON.stringify(h));
const no = (h: Record<string, string>) => assert.ok(refuseReason(h), JSON.stringify(h));
ok({ host: '127.0.0.1:8788' }); ok({ host: 'localhost:8788' }); ok({ host: '[::1]:8788' }); ok({}); // MCP clients: no Origin
ok({ host: '127.0.0.1:8788', origin: 'http://localhost:5174' }); ok({ host: 'localhost:8788', origin: 'https://claude.localhost' });
no({ host: 'evil.example:8788' }); no({ host: 'localhost.evil.example' }); // DNS rebinding
no({ host: '127.0.0.1:8788', origin: 'https://evil.example' }); no({ host: '127.0.0.1:8788', origin: 'null' });
no({ host: '127.0.0.1:8788', 'sec-fetch-site': 'cross-site' });
process.env.OPENHIGGSFIELD_ALLOWED_HOSTS = 'mcp.example.com'; ok({ host: 'mcp.example.com' }); ok({ host: 'mcp.example.com', origin: 'https://mcp.example.com' }); delete process.env.OPENHIGGSFIELD_ALLOWED_HOSTS;
process.env.OPENHIGGSFIELD_ALLOWED_ORIGINS = 'https://agent.example.com'; ok({ host: '127.0.0.1:8788', origin: 'https://agent.example.com' }); delete process.env.OPENHIGGSFIELD_ALLOWED_ORIGINS;
console.log('ok mcp local-only');
