/** An upscale factor as shown to people: "2×". Jobs store it as 2, "2", "2x", "x2" or "×2" (examples and old jobs differ), so every
 *  place that shows a scale (Info panel chip, example settings, prompt peek, size line) strips any x/× and adds one ×. Empty → ''. */
export const scaleText = (v: unknown): string => { const s = String(v ?? '').trim().replace(/^[x×]\s*|\s*[x×]$/gi, ''); return s ? `${s}×` : ''; };
