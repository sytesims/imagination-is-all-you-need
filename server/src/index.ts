/** Server entry (npm start / npm run dev / tests): boots the plugin tree from the profile (boot.ts). The server itself runs inside it as the
 *  `legacy` plugin (legacy.ts). OPENHIGGSFIELD_PROFILE picks the profile (default server/profiles/desktop.yml). */
/*  --dump-config (or OPENHIGGSFIELD_DUMP_CONFIG=1): print the resolved profile, settings, plugins and routes (no secrets) and exit (kernel/dump.ts). */
(await import('./kernel/booting.js')).markBooting(); // tools/builtin.ts leaves the Comfy templates' wiring to plugin comfy-featured
if (process.argv.includes('--dump-config') || /^(1|true)$/i.test(process.env.OPENHIGGSFIELD_DUMP_CONFIG ?? '')) {
  const { dumpConfig } = await import('./kernel/dump.js'); const d = await dumpConfig();
  process.stdout.write(JSON.stringify(d, null, 2) + '\n', () => process.exit(0));
} else if (process.env.OPENHIGGSFIELD_DUMP_ROUTES === '1') await (await import('./kernel/dump.js')).dumpRoutesChild();
else await (await import('./boot.js')).boot();
