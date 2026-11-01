/**
 * Face Swap and Person Swap on Qwen Image 2.1 (local): the community BFS swap LoRAs by Alissonerdx
 * (https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap), wired as the creator's Qwen Image 2.1 guides say:
 * image 1 / <image1> = the target photo, image 2 / <image2> = the head / person to put in; LoRA strength 1.0; the guide's prompt
 * verbatim (the user's touch-ups follow it); Person Swap scales the scene to ~2 MP and the reference to ~0.59 MP (encoder resolution 0).
 * Graphs: workflows/create-image-qwen21-{faceswap,personswap}-api.json (scripts/build-qwen21-bfs-swap.py). Plain Edit Image on
 * Qwen 2.1 keeps the official edit template without any LoRA.
 */
export interface BfsSwap { toolId: string; provider: string; /** node-map name (workflows/node-maps/<graph>.json) */ graph: string; workflowFile: string; lora: string; strength: number; prompt: string }
export const BFS_SOURCE = 'https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap';
/** The head-swap guide's prompt (docs/qwen-image-2.1.md), verbatim. */
export const BFS_HEAD_PROMPT = 'head_swap: start with <image1> as the base image, keeping its lighting, environment, and background. remove the head from <image1> completely and replace it with the head from <image2>, strictly preserving the hair, eye color, nose structure from <image2>. copy the direction of the eye, head rotation, micro expressions from <image1>, high quality, sharp details, 4k';
/** The body-swap guide's prompt (docs/qwen-image-2.1-body.md), verbatim. */
export const BFS_BODY_PROMPT = 'body_swap: start with <image1> as the base image, keeping its lighting, environment, and background. replace the body from <image1> with the body from <image2>, strictly preserving the clothing, body shape and proportions from <image2>. copy the pose, direction of the eye, head rotation, micro expressions from <image1>';
export const BFS_SWAPS: BfsSwap[] = [
  { toolId: 'app-face-swap', provider: 'comfy-qwen21', graph: 'create-image-qwen21-faceswap', workflowFile: 'create-image-qwen21-faceswap-api.json', lora: 'bfs_head_v1.1_qwen_2.1.safetensors', strength: 1, prompt: BFS_HEAD_PROMPT },
  { toolId: 'app-person-swap', provider: 'comfy-qwen21', graph: 'create-image-qwen21-personswap', workflowFile: 'create-image-qwen21-personswap-api.json', lora: 'bfs_body_swap_v1.0_qwen_2.1.safetensors', strength: 1, prompt: BFS_BODY_PROMPT },
];
/** The BFS graph a job runs. Person Swap's "Keep the photo's outfit" (2026-11-01) runs the head-swap graph: the body-swap LoRA was trained to take
 *  the clothing from <image2>, while the head swap keeps the target's body and clothes and brings the head and hair from <image2>. `input` = the job's
 *  input (outfit is stored on it and in appFields); without one (model cards, downloads) the tool's own graph. */
export const bfsSwapFor = (toolId: string, provider: string, input?: { outfit?: unknown; appFields?: { outfit?: unknown } } | null): BfsSwap | null => {
  if (toolId === 'app-person-swap' && (input?.outfit ?? input?.appFields?.outfit) === 'keep') return bfsSwapFor('app-face-swap', provider);
  return BFS_SWAPS.find((s) => s.toolId === toolId && s.provider === provider) ?? null;
};
/** The guide's prompt, then the user's touch-ups ("image 2" → <image2>, the encoder's tags). */
export const bfsSwapPrompt = (s: BfsSwap, touchUps?: string | null) => {
  const t = String(touchUps ?? '').trim().replace(/(?<![<\w])\bimage\s*([1-9])\b(?!>)/gi, '<image$1>'); // a tag the shared rewrite already wrote stays one tag
  return t ? `${s.prompt}. ${t}` : s.prompt;
};
/** The BFS graphs a model card lists (its weight files). Person Swap also lists the head swap that "Keep the photo's outfit" runs (the same Face
 *  Swap file, never a second copy), as an optional extra: readiness and the card's download follow a job's own graph (hardware/requirements.ts
 *  jobWorkflows → bfsSwapFor), the body swap by default, so the card is Ready with the body-swap LoRA alone; a keep-outfit run without the head-swap
 *  LoRA gets the usual "download first" gate with Face Swap's download. null = not a BFS route. */
export const bfsCardWorkflowsFor = (toolId: string, provider: string): string[] | null => {
  const own = bfsSwapFor(toolId, provider); if (!own) return null;
  const head = toolId === 'app-person-swap' ? bfsSwapFor('app-face-swap', provider) : null;
  return head ? [own.workflowFile, head.workflowFile] : [own.workflowFile];
};
