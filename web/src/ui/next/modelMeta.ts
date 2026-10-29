/** Our own monogram tiles per model family (no real logos). Names/descriptions come from the server. */
/** Family → our own glyph + tint. */
const FAM: [RegExp, string, string][] = [
  [/qwen/i, 'Q', '#7c6cff'], [/flux|bfl/i, 'F', '#e8e8e8'], [/z-image/i, 'Z', '#4fd1c5'], [/gpt|openai/i, '◎', '#d9d9d9'],
  [/nano banana|google/i, 'G', '#ffd54a'], [/seedream|bytedance/i, '≋', '#5aa9ff'], [/ideogram/i, 'I', '#ff8fb1'], [/recraft/i, 'R', '#ff6b4a'],
  [/luma/i, 'L', '#b48cff'], [/kling/i, 'K', '#55e39a'], [/krea/i, 'K', '#f0a6ff'], [/reve/i, 'Rv', '#9ad1ff'], [/runway/i, 'Rw', '#ffffff'],
  [/grok/i, 'X', '#cfcfcf'], [/wan/i, 'W', '#7fd3ff'], [/hunyuan|tencent/i, 'H', '#61b0ff'], [/muse|meta/i, 'M', '#8aa8ff'],
];
export function modelGlyph(name: string): { g: string; c: string } {
  for (const [re, g, c] of FAM) if (re.test(name)) return { g, c };
  return { g: name.replace(/[^A-Za-z]/g, '').slice(0, 1).toUpperCase() || '•', c: '#bbb' };
}
