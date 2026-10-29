// For QA scripts that hit an already-running dev API (default :8787): routing is cloud-first since 2026-10-17, so tests written for
// local-first + mocked hosted runs switch the dev server's saved routing prefs to {useLocal:true, mockKeys:true} (mockKeys works on the
// mock backend only) and restore the previous prefs when the process exits.
export async function legacyRouting(api = process.env.API || 'http://localhost:8787') {
  // Tests must never write the shared dev API's settings. On :8787 this is a no-op (run against an isolated
  // server via API=http://localhost:<port> to get local-first + mockKeys). QA_ALLOW_SHARED_ROUTING=1 restores the old behaviour.
  if (/:8787\b/.test(api) && process.env.QA_ALLOW_SHARED_ROUTING !== '1') { console.warn(`[legacy-routing] not touching ${api} routing settings (shared dev API); running with its current settings`); return async () => {}; }
  const prev = await (await fetch(`${api}/api/me/routing`)).json();
  const put = (b) => fetch(`${api}/api/me/routing`, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-openhiggsfield-source': `qa-runner/legacy-routing ${process.argv[1]?.split('/').pop() ?? ''}` }, body: JSON.stringify(b) });
  await put({ global: { ...prev.global, useLocal: true, mockKeys: true } });
  let done = false; const restore = async () => { if (done) return; const r = await put({ global: { mode: prev.global.mode ?? 'auto', allowFallback: !!prev.global.allowFallback, useLocal: !!prev.global.useLocal, mockKeys: !!prev.global.mockKeys } }).catch(() => null); if (r?.ok) done = true; };
  process.on('beforeExit', restore); for (const ev of ['uncaughtException', 'unhandledRejection']) process.on(ev, async (e) => { console.error(e); for (let i = 0; i < 10 && !done; i++) { await restore(); if (!done) await new Promise(r => setTimeout(r, 2000)); } process.exit(1); }); process.on('SIGINT', async () => { await restore(); process.exit(130); });
  return restore;
}
