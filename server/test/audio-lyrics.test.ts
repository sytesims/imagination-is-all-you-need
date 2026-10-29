// Audio prompt (2026-10-24): the Auto length rule, the lyrics-required preflight, Instrumental caps and the tag chips' insert rule.
// Pure: no server, no network. Run: npx tsx test/audio-lyrics.test.ts
import assert from 'node:assert/strict';
import { lyricsStats, lyricsSeconds, lyricsPlan, autoLength, tooShortFor, lengthText, SECTION_TAG_HL } from '../../web/src/shared/lyricsLength.ts';
import { insertAt } from '../../web/src/shared/useInsertAtCursor.ts';
import { etaOnDevice } from '../../web/src/shared/eta.ts';
import { preflightProblems } from '../src/shared/preflight.ts';
import { audioWorkflowById, LYRICS_MODELS, INSTRUMENTAL_MODELS, LYRICS_REQUIRED_FOR } from '../src/shared/audioWorkflows.ts';
import { LYRICS_REQUIRED } from '../src/tools/media.ts';
const ok = (m: string) => console.log('ok ' + m);
const ALLOWED = [10, 30, 60]; // the audio tool's lengths (tools/media.ts audioTool durations)

// ---- 1. what counts: sung lines and section tags ----
const SONG = '[Verse]\nRain on the platform, the last train is late\nCounting the windows\n\n[Chorus]\nHold the light\nWe will not wait\n';
assert.deepEqual(lyricsStats(SONG), { lines: 4, sections: 2 });
assert.deepEqual(lyricsStats(''), { lines: 0, sections: 0 });
assert.deepEqual(lyricsStats('[Verse]\n[Chorus]'), { lines: 0, sections: 2 }, 'tags alone are not sung lines');
assert.deepEqual(lyricsStats('  [Bridge]  \r\nla la'), { lines: 1, sections: 1 }, 'CRLF and spaces around a tag');
assert.deepEqual(lyricsStats('I said [hey] to you'), { lines: 1, sections: 0 }, 'a bracket inside a line is a sung line');
ok('lyrics stats: sung lines vs section tags');

// ---- 2. the Auto rule: 10 s + 5 s per sung line + 5 s per section, then the shortest allowed length that fits ----
assert.equal(lyricsSeconds({ lines: 4, sections: 2 }), 40);
assert.equal(lyricsSeconds({ lines: 0, sections: 3 }), null, 'nothing to sing: no estimate');
assert.deepEqual(autoLength(SONG, ALLOWED), { seconds: 60, need: 40, lines: 4, cut: false }, '40 s of lyrics → 60 s');
assert.deepEqual(autoLength('[Verse]\nla la la', ALLOWED), { seconds: 30, need: 20, lines: 1, cut: false }, 'one line → 30 s');
assert.equal(autoLength('one', [10, 15, 20]).seconds, 15, 'exactly fits: 15 s');
const long = Array.from({ length: 42 }, (_, i) => `line ${i}`).join('\n');
assert.deepEqual(autoLength(long, ALLOWED), { seconds: 60, need: 220, lines: 42, cut: true }, 'too long for the model: its longest, flagged');
assert.equal(autoLength('', ALLOWED).seconds, 30, 'no lyrics: the allowed length closest to 30 s');
assert.equal(autoLength('', [10, 60]).seconds, 10, 'closest to 30 s among 10/60 (ties keep the shorter)');
assert.equal(autoLength('a', [60, 10, 30, 30]).seconds, 30, 'unsorted, duplicated allowed list');
assert.ok(ALLOWED.includes(autoLength(SONG, ALLOWED).seconds), 'Auto is always a length the model allows (what is quoted is what is sent)');
ok('Auto length: fits the lyrics, clamped to the allowed lengths');

// ---- 3. a fixed length that is clearly too short: a hint (under 3/4 of the estimate) ----
assert.equal(tooShortFor(10, 40), true); assert.equal(tooShortFor(30, 40), false, '30 of 40: close enough'); assert.equal(tooShortFor(10, null), false, 'no lyrics: never');
assert.equal(lengthText(10), '10 s'); assert.equal(lengthText(60), '1:00'); assert.equal(lengthText(70), '1:10'); assert.equal(lengthText(250), '4:10');
ok('too-short hint and the length text');

// ---- 4. section tags are highlighted on their own line only ----
const hl = (t: string) => [...t.matchAll(SECTION_TAG_HL)].map((m) => m[0].trim());
assert.deepEqual(hl(SONG), ['[Verse]', '[Chorus]']); assert.deepEqual(hl('I said [hey] to you'), []);
ok('highlight: whole-line tags');

// ---- 5. the chips insert at the caret ----
assert.deepEqual(insertAt('', 0, 0, '[Verse]', true), { value: '[Verse]\n', caret: 8 }, 'empty: the tag, caret on the next line');
assert.deepEqual(insertAt('la la', 5, 5, '[Chorus]', true), { value: 'la la\n[Chorus]\n', caret: 15 }, 'end of a line: on its own line');
assert.deepEqual(insertAt('a\nb', 2, 2, '[Bridge]', true), { value: 'a\n[Bridge]\nb', caret: 11 }, 'line start: before the next line, caret at its start');
assert.deepEqual(insertAt('ab\ncd', 1, 1, '[Outro]', true), { value: 'a\n[Outro]\nb\ncd', caret: 10 }, 'mid-line: splits the line');
assert.deepEqual(insertAt('indie folk', 10, 10, 'genre: '), { value: 'indie folk, genre: ', caret: 19 }, 'a starter after text: joined with ", "');
assert.deepEqual(insertAt('indie folk, ', 12, 12, 'mood: '), { value: 'indie folk, mood: ', caret: 18 });
assert.deepEqual(insertAt('', 0, 0, 'genre: '), { value: 'genre: ', caret: 7 });
assert.deepEqual(insertAt('xx sel yy', 3, 6, 'voice: '), { value: 'xx voice:  yy', caret: 10 }, 'replaces a selection');
ok('insert at the caret: tags on their own line, starters joined');

// ---- 6. the recipes: who takes lyrics, who needs them, who can do an instrumental ----
const music = audioWorkflowById('music')!, cover = audioWorkflowById('cover')!, sfx = audioWorkflowById('sfx')!, bed = audioWorkflowById('soundtrack-music')!;
assert.deepEqual(LYRICS_REQUIRED_FOR, LYRICS_REQUIRED, 'web and server agree on lyrics-only models');
for (const id of INSTRUMENTAL_MODELS) { assert.ok(LYRICS_MODELS.includes(id), `${id} reads lyrics`); assert.ok(!LYRICS_REQUIRED_FOR.includes(id), `${id} can't be both`); }
assert.ok(!INSTRUMENTAL_MODELS.includes('comfy-yue2'), 'YuE2 sings lyrics only');
assert.ok(!LYRICS_MODELS.includes('api-sonilo-music') && !LYRICS_MODELS.includes('api-seed-audio'), 'Sonilo and Seed Audio take no lyrics field');
assert.deepEqual(music.lyrics.instrumental, INSTRUMENTAL_MODELS); assert.deepEqual(bed.lyrics.instrumental, INSTRUMENTAL_MODELS);
assert.deepEqual(cover.lyrics.instrumental, [], 'Cover always sings'); assert.deepEqual(sfx.lyrics.models, []);
assert.match(music.lyrics.placeholder, /\[Verse\], \[Chorus\] and \[Bridge\]/);
ok('recipes: lyrics models, required, instrumental');

// ---- 7. lyrics required and empty: Generate says "Add lyrics" (the page's missing list, first word on Generate); the server preflight
//         list stays about the quote (no lyrics rule there), so the page's own check is the one that blocks ----
const need = (provider: string, wf = music, text = '', instrumental = false) => { const lp = lyricsPlan(wf.lyrics, provider, text, instrumental); return { missing: lp.missing ? 'Add lyrics' : null, sends: lp.sends, lp }; };
assert.equal(need('comfy-yue2').missing, 'Add lyrics'); assert.equal(need('comfy-yue2', music, '[Verse]').missing, 'Add lyrics', 'a tag alone is not a line to sing');
assert.equal(need('comfy-yue2', music, '[Verse]\nla').missing, null); assert.equal(need('comfy-acestep').missing, null); assert.equal(need('comfy-yue2', cover).missing, 'Add lyrics');
assert.equal(need('comfy-acestep', music, 'la', true).sends, false, 'Instrumental on: lyrics kept but not sent'); assert.equal(need('comfy-yue2', music, 'la', true).sends, true, 'YuE2 has no Instrumental');
assert.equal(need('api-sonilo-music', music, 'la').sends, false, 'a model without a lyrics field is sent none'); assert.equal(need('api-sonilo-music').lp.on, false, 'and gets no Lyrics tab');
assert.equal(need('comfy-acestep').lp.instAvail, true); assert.equal(need('comfy-yue2').lp.instAvail, false); assert.equal(need('comfy-yue2', cover).lp.instAvail, false);
assert.equal(need('comfy-acestep', sfx).lp.on, false, 'Sound effects: no lyrics');
assert.equal(preflightProblems({ quote: { runnable: true }, modelName: 'YuE2' }).length, 0, 'a runnable quote adds no problem of its own');
ok('lyrics required + Instrumental: what blocks and what is sent');

// ---- 7b. a free local model with nowhere to run (YuE2, ComfyUI not reachable) never says "add a key" (2026-10-29) ----
{ const { localOnlyGate, LOCAL_SETUP_TEXT } = await import('../src/shared/preflight.ts');
  const local = { runnable: false, needsKey: true, local: true, noProvider: { providers: [] } }; // routing/select.ts noProvider() for a local-only model
  assert.equal(localOnlyGate(local), true);
  const p = preflightProblems({ quote: local, modelName: 'YuE2' }); assert.equal(p.length, 1); assert.equal(p[0].code, 'needs_setup'); assert.equal(p[0].fix.label, LOCAL_SETUP_TEXT);
  const cloud = { runnable: false, needsKey: true, local: false, keyOwner: 'Comfy', noProvider: { providers: ['comfy'] } };
  assert.equal(localOnlyGate(cloud), false); assert.equal(preflightProblems({ quote: cloud, modelName: 'X' })[0].code, 'needs_key', 'a cloud model still asks for its key');
  assert.equal(localOnlyGate({ ...local, noProvider: { providers: ['fal'] } }), false, 'a key would help: key advice stays');
  ok('local-only model: "Set up ComfyUI to run free", never "Add a key first"'); }

// ---- 8. the local time line ----
assert.equal(etaOnDevice({ source: 'learned', seconds: 360, low: 330, high: 390 }, 'on your Mac'), '≈ 5–7 min on your Mac');
assert.equal(etaOnDevice({ source: 'first_run', seconds: null, low: null, high: null }, 'on your Mac'), 'First run: timing it');
assert.equal(etaOnDevice(null, 'on your Mac'), '');
ok('Generate time: "≈ N min on your Mac" or first run');
