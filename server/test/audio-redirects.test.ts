// One Audio page (2026-10-23): /tools/voice, /tools/soundtrack, their modes and the old /tools/audio?mode= links open /audio?workflow=<id>;
// voice lip-sync goes to Video's Lip Sync workflow. The rest of the query and the hash are kept, a ?workflow= link never redirects, and the web
// router's order (image / video tables, then videoRedirect, then audioRedirectTarget) lands every old URL on the same place.
// Run: npx tsx test/audio-redirects.test.ts
import assert from 'node:assert/strict';
const { AUDIO_REDIRECTS, AUDIO_PAGE, AUDIO_WORKFLOW_IDS, audioRedirectTarget, audioRoute, audioWorkflowById } = await import('../src/shared/audioWorkflows.ts');
const { VIDEO_REDIRECTS, videoRedirect, videoWorkflowHref } = await import('../src/shared/videoWorkflows.ts');
const { IMAGE_REDIRECTS } = await import('../src/shared/imageFeatures.ts');
const { redirectTarget } = await import('../../web/src/shared/workflowLinks.ts');
const ok = (m: string) => console.log('ok ' + m);

/** The web router's chain (web/src/platform/router.tsx canonTo / canonPath). */
const REDIRECTS = { ...IMAGE_REDIRECTS, ...VIDEO_REDIRECTS };
const route = (p: string, s = '', h = '') => redirectTarget(p, s, h, REDIRECTS) ?? videoRedirect(p, s, h) ?? audioRedirectTarget(p, s, h);

// every target is a real workflow link (or Video's Lip Sync)
for (const [from, to] of Object.entries(AUDIO_REDIRECTS)) {
  if (to.startsWith(AUDIO_PAGE)) { const id = new URL(to, 'http://x').searchParams.get('workflow')!; assert.ok(audioWorkflowById(id), `${from} → ${to}: ${id} is a workflow`); }
  else assert.equal(to, videoWorkflowHref('lip-sync'), `${from} → Video's Lip Sync`);
}
ok(`${Object.keys(AUDIO_REDIRECTS).length} old Audio URLs, each to a workflow`);

// the table the user asked for: old pages and their modes
const CASES: [path: string, search: string, want: string][] = [
  ['/tools/voice', '', audioRoute('voiceover')], ['/tools/voice', '?mode=voiceover', audioRoute('voiceover')], ['/tools/voice', '?mode=change-voice', audioRoute('change-voice')],
  ['/tools/voice', '?mode=translate', audioRoute('translate')], ['/tools/soundtrack', '', audioRoute('soundtrack-music')], ['/tools/soundtrack', '?mode=music', audioRoute('soundtrack-music')],
  ['/tools/soundtrack', '?mode=v2s', audioRoute('soundtrack-sound')], ['/tools/soundtrack', '?mode=sfx', audioRoute('soundtrack-sound')],
  ['/tools/audio', '?mode=music', audioRoute('music')], ['/tools/audio', '?mode=sfx', audioRoute('sfx')], ['/tools/audio', '?mode=voice', audioRoute('voiceover')], ['/tools/audio', '?mode=cover', audioRoute('cover')],
  ['/audio', '?mode=music', audioRoute('music')], ['/audio/', '?mode=cover', audioRoute('cover')],
];
for (const [p, s, want] of CASES) { assert.equal(audioRedirectTarget(p, s), want, `${p}${s}`); assert.equal(route(p, s), want, `${p}${s} through the router chain`); }
ok(`${CASES.length} old links land on their workflow`);

// lip-sync → Video's Lip Sync, the same URL from either table
assert.equal(route('/tools/voice', '?mode=lipsync'), videoWorkflowHref('lip-sync')); assert.equal(audioRedirectTarget('/tools/voice', '?mode=lipsync'), videoWorkflowHref('lip-sync'));
ok(`/tools/voice?mode=lipsync → ${videoWorkflowHref('lip-sync')}`);

// query and hash kept, mode consumed; trailing slash and case tolerated; unknown mode falls back to the page's own workflow
assert.equal(audioRedirectTarget('/tools/voice', '?mode=translate&from=j1', '#top'), `${audioRoute('translate')}&from=j1#top`);
assert.equal(audioRedirectTarget('/tools/soundtrack/', '?fromJob=j2&out=1'), `${audioRoute('soundtrack-music')}&fromJob=j2&out=1`);
assert.equal(audioRedirectTarget('/TOOLS/VOICE', ''), audioRoute('voiceover'));
assert.equal(audioRedirectTarget('/tools/voice', '?mode=nope'), audioRoute('voiceover'));
ok('query + hash kept, mode consumed, case and trailing slash tolerated');

// no loop: the Audio page itself, a ?workflow= link and unrelated pages never redirect
for (const [p, s] of [[AUDIO_PAGE, ''], ['/audio/', ''], [AUDIO_PAGE, '?workflow=translate'], [AUDIO_PAGE, '?model=yue2'], ['/tools/voice', '?workflow=voiceover'], ['/image', ''], ['/video', '?workflow=lip-sync']] as const)
  assert.equal(audioRedirectTarget(p, s), null, `${p}${s} stays`);
for (const id of AUDIO_WORKFLOW_IDS) { const [p, s] = audioRoute(id).split('?'); assert.equal(route(p, `?${s}`), null, `${audioRoute(id)} is final`); }
ok('deep links to each of the 8 workflows are final (no redirect loop)');

// no clash with the image and video tables
for (const k of Object.keys(AUDIO_REDIRECTS).filter((k) => !k.includes('?'))) assert.equal(REDIRECTS[k], undefined, `${k} is only an audio redirect`);
ok('no clash with the image and video redirect tables');
console.log('PASS audio-redirects');
