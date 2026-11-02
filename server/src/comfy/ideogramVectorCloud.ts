/**
 * Ideogram Vector 1 · Comfy Cloud (2026-11-03, official Comfy template "Ideogram Vector 1: Image to SVG", api_ideogram_vector_1_image_to_svg): the
 * IdeogramVectorImageToSVGApi partner node as an ordinary Comfy Cloud workflow job, the Comfy key once in extra_data, like Topaz Bloom 2 (topazImageCloud.ts).
 *
 * Graph (API format) = the template: LoadImage → IdeogramVectorImageToSVGApi → SaveSVGNode. The node's `model` is a dynamic combo: "ideogram-vector-1"
 * takes the picture as model.image; `mode` "default" keeps finer detail ("simple" = fewer, larger shapes; the template uses default). Pictures over 2048 px
 * on the long side are downscaled by the node before upload. Transparent areas stay transparent. The SVG comes back through SaveSVGNode's ui images.
 * Price: 30.17 Comfy credits per SVG (docs.comfy.org/tutorials/partner-nodes/pricing › Ideogram Vector). Row cloud-ideogram-vector in shared/hostedPrices.ts.
 * Not run against the paid API: the graph follows the template JSON and the node page (the node isn't in our object_info copy yet).
 */
import type { Plan } from './plans.js';
import { VECTOR_IDEOGRAM, VECTOR_NODE, VECTOR_TEMPLATE } from '../shared/imageVector.js';

export const IDEOGRAM_VECTOR_ROUTE = `comfy-cloud:${VECTOR_IDEOGRAM}`;
export const IDEOGRAM_VECTOR_MODE = 'default';
type In = Record<string, any>;
const refuse = (msg: string) => Object.assign(new Error(`${msg} Nothing was sent or charged.`), { reasonCode: 'input_blocked', errorType: 'validation' });

/** The API-format graph. `image` is an upload placeholder ({__file}) or a Cloud asset ref. */
export function ideogramVectorGraph(image: unknown): Record<string, any> {
  return {
    '1': { class_type: 'LoadImage', inputs: { image } },
    '2': { class_type: VECTOR_NODE, inputs: { model: 'ideogram-vector-1', 'model.image': ['1', 0], mode: IDEOGRAM_VECTOR_MODE } },
    '3': { class_type: 'SaveSVGNode', inputs: { svg: ['2', 0], filename_prefix: 'svg/openhiggsfield-ideogram-vector' } },
  };
}
/** The plan (comfy/cloudWorkflows.ts standalone entry): one pass, one SVG. */
export function ideogramVectorCloudPlan(j: { id: string; toolId: string; provider: string; input: In }): Plan {
  const i = j.input; if (!i.imagePath) throw refuse('Ideogram Vector needs a picture.');
  if (/\.svg$/i.test(String(i.imagePath))) throw refuse('That picture is already a vector (SVG).');
  return { tool: j.toolId, outKind: 'image', post: { kind: 'each' }, muxSourceAudio: false, labels: ['Vector (SVG)'],
    notes: [`Ideogram Vector 1 partner node (${VECTOR_NODE}) on Comfy Cloud, mode ${IDEOGRAM_VECTOR_MODE}`],
    passes: [{ label: 'Vector (SVG)', workflow: `template:${VECTOR_TEMPLATE}`, graph: ideogramVectorGraph({ __file: String(i.imagePath) }), output: '3', expect: { model: 'ideogram-vector-1' } }] };
}
