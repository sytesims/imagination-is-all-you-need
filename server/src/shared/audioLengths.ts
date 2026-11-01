// Audio lengths (2026-10-25): music and local sound effects keep 10 / 30 / 60 s; ElevenLabs SFX v2 takes 0.5–30 s on Comfy Router (docs.comfy.org/development/
// comfy-router/models/elevenlabs/eleven-sfx-v2), so short one-shots are offered there. The Audio tool list is the union (what submit accepts); the per-model
// list (app.durationsByProvider) is what the Audio page offers. Price: per minute of the length sent (shared/hostedPrices.ts), so the quote follows.
export const AUDIO_DURATIONS = [10, 30, 60]; export const ELEVEN_SFX_DURATIONS = [1, 2, 3, 5, 10, 15, 30];
// Each music / sound model's own lengths (2026-10-27, Audio fixes B), inside what the model really takes (docs.comfy.org node pages, checked 2026-10-27):
//  Sonilo Text to Music: duration 1–360 s · ACE-Step 1.5: 10 s to 10 min · YuE2: max_duration (our plan caps it at 360 s; the template uses 120)
//  · MiniMax Music 3: max_duration, the model makes up to ~5 min (local and Comfy Cloud) · Stable Audio Open 1.0: up to 47 s (EmptyLatentAudio 47.6).
// YuE2 and MiniMax Music 3 treat the length as a cap: the song can end sooner (AUDIO_LENGTH_UP_TO, shown as "up to" on the Audio page).
export const AUDIO_LENGTHS: Record<string, number[]> = {
  'api-sonilo-music': [10, 30, 60, 120, 180, 240, 360], 'comfy-acestep': [10, 30, 60, 120, 180, 240, 360, 600],
  'comfy-yue2': [30, 60, 120, 180, 240, 360], 'comfy-minimax-music3': [30, 60, 120, 180, 240, 300], 'cloud-minimax-music': [30, 60, 120, 180, 240, 300],
  'comfy-stable-audio': [5, 10, 20, 30, 47], 'api-eleven-sfx': ELEVEN_SFX_DURATIONS, 'api-seed-audio': [] /* no length field: the model decides, up to 2 min */,
};
export const AUDIO_LENGTH_UP_TO = ['comfy-yue2', 'comfy-minimax-music3', 'cloud-minimax-music'];
/** Song models (the "up to" ones) write whole songs: shorter than their shortest Audio length they get cut mid-phrase (2026-11-02). Music for a clip
 *  asks them for at least that much and trims to the clip (comfy/runNative.ts music bed). 0 = no minimum (ACE-Step, Stable Audio, hosted models). */
export const songMinSeconds = (provider: string | undefined) => (AUDIO_LENGTH_UP_TO.includes(provider ?? '') ? Math.min(...AUDIO_LENGTHS[provider!]) : 0);
/** Seconds a song job asks the model for (max_duration): the clip's length for a video, else the picked length; 60 s when none; at least the model's
 *  minimum; 1–360 s. One rule for the graph (comfy/plans.ts songPlan) and the price (routing/routes.ts priceInput): quote = charge. */
export const songSeconds = (provider: string | undefined, i: Record<string, any>) => Math.min(360, Math.max(1, songMinSeconds(provider), Number(i.outputDuration ?? i.duration) || 60));
/** Music bed finish (2026-11-02): fade-out length for a track of `secs` — 0.5–1 s, at most a quarter of a very short clip. */
export const bedFadeSeconds = (secs: number) => Math.round(Math.min(1, Math.max(0.5, secs * 0.08), secs / 4) * 1000) / 1000;
/** ffmpeg audio chain for a music bed `secs` long: trim to the clip, fade out, then limit peaks under −1 dBTP (BED_LIMITER). */
export const bedFilter = (secs: number) => { const s = Math.max(0.1, secs); const f = bedFadeSeconds(s);
  return `atrim=0:${s},asetpts=PTS-STARTPTS,afade=t=out:st=${Math.max(0, Math.round((s - f) * 1000) / 1000)}:d=${f},${BED_LIMITER}`; };
/** −1.5 dBFS ceiling (0.841), 4× oversampled so inter-sample peaks stay under it too; the headroom keeps the AAC file under −1 dBTP (checked: +2.9 dBTP in → −1.1 out). No auto level. */
export const BED_LIMITER = 'aresample=176400,alimiter=limit=0.841:attack=5:release=50:level=0,aresample=44100';
