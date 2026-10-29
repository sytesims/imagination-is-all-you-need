/**
 * Which models can run an image workflow as it is locked (2026-10-23). GET /api/image-workflows lists, per mode, only models whose quote
 * passes; the rest come back as `unavailable` with a reason. The check is the same one GET /api/tools/<runner>/price runs before pricing
 * (imageCapsQuoteError for Create Image and its apps, upscaleBlock for Image Upscale), so an offered model is never refused at quote or submit.
 * Keys and setup are not part of it: "needs a key" is still offered (the setup step runs from Generate).
 */
import { imageCapsQuoteError } from './tools/apps.js';
import { upscaleBlock, upscaleScaleOf } from './shared/imageUpscale.js';
import type { WorkflowModelCheck } from './shared/workflows.js';
import type { ToolDef } from './tools/types.js';

export const workflowModelCheck = (getTool: (id: string) => ToolDef | undefined): WorkflowModelCheck => (toolId, provider, query) => {
  const t = getTool(toolId); if (!t) return { code: 'unknown_tool', message: `${toolId} is not registered` };
  const q = { ...query, provider };
  const ic = imageCapsQuoteError(t, q, provider); if (ic) return { code: ic.code, field: ic.field, message: ic.error };
  if (t.id === 'image-upscale') { const s = upscaleScaleOf(q); if (s != null) { const b = upscaleBlock(provider, s, null); if (b) return { code: b.code, field: 'scale', message: b.message }; } }
  return null;
};
