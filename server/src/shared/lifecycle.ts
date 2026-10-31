/**
 * Model and route lifecycle (provider audit, 2026-10-21). Isomorphic: no imports.
 * One small table keyed by model id (provider id), route id or price ref. A listed entry:
 *  - 'retiring': still listed and selectable (it may keep working), but never a default and never "Featured"; menus and the Pricing table show an amber "Retiring" pill with `note` as the tooltip.
 *  - 'unavailable': listed for reference only (not used yet; a removed model is simply not registered, see RETIRED_MODELS).
 * Flows through /api/tools providers[], /api/routes (model and route level), /api/models and /api/pricing hosted rows as `lifecycle` + `lifecycleNote`.
 */
export type LifecycleStatus = 'retiring' | 'unavailable';
export interface LifecycleInfo { status: LifecycleStatus; note: string; /** first date the provider stops or deprecates it */ from?: string; replacement?: string; sourceUrl: string; checkedAt: string }

const VEO: LifecycleInfo = { status: 'retiring', from: '2026-10-22', replacement: 'Gemini Omni Flash (gemini-omni-1.1-flash)',
  note: 'Google is retiring Veo 3.1 previews (from 2026-10-22). It may stop working.', sourceUrl: 'https://ai.google.dev/gemini-api/docs/deprecations', checkedAt: '2026-10-21' };
export const LIFECYCLE: Record<string, LifecycleInfo> = {
  // Veo 3.1 on the Comfy partner node (model id = price ref; route comfy-router:router-veo)
  'router-veo': VEO, 'comfy-router:router-veo': VEO,
};
/** Route ids no longer served: the hosted model each ran, so old jobs keep a readable engine name (fal retires Ray 2 reframe on 2026-11-05). */
export const RETIRED_ROUTES: Record<string, string> = {
  'fal:fal-ai/luma-dream-machine/ray-2/reframe': 'Luma Ray 2 Reframe', 'fal:fal-ai/luma-dream-machine/ray-2-flash/reframe': 'Luma Ray 2 Flash Reframe',
};
export const lifecycleOf = (id?: string | null): LifecycleInfo | null => (id ? LIFECYCLE[id] ?? null : null);
export const isRetiring = (id?: string | null) => lifecycleOf(id)?.status === 'retiring';
/** The API fields for one id ({} when it has no lifecycle entry, so listings stay unchanged). */
export const lifecycleFields = (id?: string | null) => { const l = lifecycleOf(id); return l ? { lifecycle: l.status, lifecycleNote: l.note, ...(l.replacement ? { lifecycleReplacement: l.replacement } : {}) } : {}; };

/** Models removed from the app. They are no longer registered (no routes, prices or menu rows); the name keeps old jobs readable and the reason explains a saved setting that falls back. */
export const RETIRED_MODELS: Record<string, { name: string; reason: string; removedAt: string; sourceUrl: string }> = {
  'api-reve': { name: 'Reve', reason: "Reve's public API closed (wound down 2026-08-14), so Reve is no longer offered.", removedAt: '2026-10-21', sourceUrl: 'https://docs.comfy.org/tutorials/partner-nodes/pricing' },
  // One Qwen3 TTS card (2026-10-27): the paid Alibaba Model Studio entry (never priced, never run) gave way to the open weights on your own ComfyUI (comfy-qwen3tts).
  'direct-qwen3-tts': { name: 'Qwen3 TTS (Alibaba API)', reason: 'Qwen3 TTS now runs free on your computer (Qwen3 TTS 1.7B), so the paid Alibaba entry is gone.', removedAt: '2026-10-27', sourceUrl: 'https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice' },
};
