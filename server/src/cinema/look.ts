/** Director "look" panels: Film setup, camera body / lens / aperture, colour palette, lighting. Our own names and wording.
 *  All are prompt modifiers (no price effect). 'auto' / '' = leave it to the model. GET /api/cinema/options lists them. */
type Opt = { id: string; label: string; phrase: string };
const o = (id: string, label: string, phrase: string): Opt => ({ id, label, phrase });
export const LOOK_OPTIONS: Record<string, Opt[]> = {
  genre: [o('drama', 'Drama', 'grounded dramatic film'), o('action', 'Action', 'kinetic action film'), o('thriller', 'Thriller', 'tense thriller'), o('comedy', 'Comedy', 'bright comedy'),
    o('horror', 'Horror', 'unsettling horror film'), o('sci-fi', 'Sci-fi', 'science-fiction film'), o('romance', 'Romance', 'tender romance'), o('documentary', 'Documentary', 'observational documentary')],
  era: [o('1960s', '1960s', '1960s period film'), o('1970s', '1970s', '1970s period film'), o('1980s', '1980s', '1980s period film'), o('1990s', '1990s', '1990s film'), o('2000s', '2000s', '2000s film'), o('2010s', '2010s', '2010s film'), o('2020s', '2020s', 'contemporary film')],
  tempo: [o('single-shot', 'Single shot', 'one continuous take'), o('calm', 'Calm', 'slow, calm pacing'), o('steady', 'Steady', 'steady pacing'), o('fast', 'Fast', 'fast pacing'), o('chaotic', 'Chaotic', 'frantic, chaotic energy')],
  cameraBody: [o('digital-cinema', 'Digital cinema', 'shot on a large-format digital cinema camera'), o('35mm-film', '35 mm film', 'shot on 35 mm film, fine grain'), o('16mm-film', '16 mm film', 'shot on 16 mm film, visible grain'), o('handheld-video', 'Handheld video', 'shot on a handheld camcorder')],
  lens: [o('ultra-wide', 'Ultra-wide 14 mm', '14 mm ultra-wide lens'), o('wide', 'Wide 24 mm', '24 mm wide lens'), o('normal', 'Normal 50 mm', '50 mm lens'), o('portrait', 'Portrait 85 mm', '85 mm portrait lens'), o('tele', 'Telephoto 135 mm', '135 mm telephoto lens, compressed background'), o('anamorphic', 'Anamorphic', 'anamorphic lens, oval bokeh, horizontal flares')],
  aperture: [o('f1.4', 'f/1.4', 'very shallow depth of field'), o('f2.8', 'f/2.8', 'shallow depth of field'), o('f5.6', 'f/5.6', 'moderate depth of field'), o('f11', 'f/11', 'deep focus')],
  palette: [o('teal-orange', 'Teal & orange', 'teal and orange grade'), o('bleach-bypass', 'Bleach bypass', 'desaturated bleach-bypass grade'), o('warm-gold', 'Warm gold', 'warm golden grade'), o('cool-blue', 'Cool blue', 'cool blue grade'),
    o('pastel', 'Pastel', 'soft pastel palette'), o('noir', 'Black & white', 'high-contrast black and white'), o('neon', 'Neon', 'saturated neon magenta and cyan'), o('earth', 'Earth tones', 'muted earth tones'), o('technicolor', 'Vivid classic', 'vivid saturated classic film colour'), o('natural', 'Natural', 'natural, true-to-life colour')],
  lighting: [o('auto', 'Auto', ''), o('soft-key', 'Soft key', 'soft key light, gentle fill'), o('hard-noon', 'Hard sun', 'hard midday sunlight, crisp shadows'), o('golden-hour', 'Golden hour', 'low golden-hour sun'),
    o('low-key', 'Low key', 'low-key lighting, deep shadows'), o('neon-practicals', 'Neon practicals', 'lit by neon practical lights'), o('silhouette', 'Backlit', 'strong backlight, rim light, silhouettes')],
};
export const LOOK_FIELDS = Object.keys(LOOK_OPTIONS);
/** Validate the look fields → { values, phrase } or issues. */
export function parseLook(fields: Record<string, string>) {
  const values: Record<string, string | null> = {}; const issues: { code: string; field: string; message: string }[] = []; const phrases: string[] = [];
  for (const k of LOOK_FIELDS) {
    const v = (fields[k] ?? '').trim(); if (!v || v === 'auto') { values[k] = null; continue; }
    const hit = LOOK_OPTIONS[k].find((x) => x.id === v);
    if (!hit) { issues.push({ code: 'invalid', field: k, message: `${k} must be one of ${LOOK_OPTIONS[k].map((x) => x.id).join(', ')}.` }); continue; }
    values[k] = v; if (hit.phrase) phrases.push(hit.phrase);
  }
  return { values, phrase: phrases.join(', '), issues };
}
