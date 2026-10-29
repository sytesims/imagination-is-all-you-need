/** Public release dates (first public release of the weights / API), each with the source it was read from (2026-10-17).
 *  Only dates we could source; every other model has releasedAt: null. 'new' badge = released within NEW_DAYS. */
export const NEW_DAYS = 30;
export const RELEASES: Record<string, { date: string; source: string }> = {
  'comfy-chatterbox': { date: '2025-05-28', source: 'https://pypi.org/project/chatterbox-tts/ (0.1 uploaded 2025-05-28); Resemble AI announcement 2025-05-28' },
  'comfy-chatterbox-vc': { date: '2025-05-28', source: 'https://pypi.org/project/chatterbox-tts/ (voice conversion shipped in the first release)' },
  'comfy-flux2dev': { date: '2025-11-25', source: 'https://bfl.ai/blog/flux-2 (November 25, 2025)' },
  'api-flux2': { date: '2025-11-25', source: 'https://bfl.ai/blog/flux-2 (FLUX.2 [pro], November 25, 2025)' },
  'direct-flux2-flex': { date: '2025-11-25', source: 'https://bfl.ai/blog/flux-2 (FLUX.2 [flex], November 25, 2025)' },
  'comfy-stable-audio': { date: '2024-06-05', source: 'https://stability.ai/news/introducing-stable-audio-open (June 5, 2024)' },
  'comfy-f5tts': { date: '2024-10-09', source: 'https://arxiv.org/abs/2410.06885 (v1 submitted 2024-10-09)' },
  'comfy-mmaudio': { date: '2024-12-19', source: 'https://arxiv.org/abs/2412.15322 (v1 submitted 2024-12-19)' },
  'comfy-realesrgan': { date: '2021-07-22', source: 'https://arxiv.org/abs/2107.10833 (v1 submitted 2021-07-22)' },
};
export function releaseInfo(providerId: string, now = Date.now()) {
  const r = RELEASES[providerId]; if (!r) return { releasedAt: null as string | null, releaseSource: null as string | null, isNew: false };
  return { releasedAt: r.date, releaseSource: r.source, isNew: now - Date.parse(`${r.date}T00:00:00Z`) <= NEW_DAYS * 86400_000 && Date.parse(r.date) <= now };
}
