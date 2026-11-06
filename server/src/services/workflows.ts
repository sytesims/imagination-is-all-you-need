/**
 * ctx.workflows (plan §3.3): ComfyUI workflow graphs as a service, one door to what used to be reached module by module.
 *  - registerGraph / graph / graphOf: the store of loaded workflow-folder graphs + node maps (pluginGraph.ts), which comfy/plans.ts runs locally. A folder's graph is
 *    registered by its own fiber (plugins-builtin/workflow-folders.ts) and leaves with it;
 *  - mapGraph / graphPromptOf / outKind / hasFileKey: the one job → graph mapping and its checks (pluginGraph.ts);
 *  - mainModel / neededFiles: model detection in a graph (pluginGraph.ts, workflowModels.ts);
 *  - nodes / missingNodes / loaderOptions / objectInfo: what your ComfyUI has (comfyNodes.ts, GET /object_info);
 *  - modelCheck: can a model run an image workflow as it is locked (workflowCompat.ts).
 * The modules stay the implementation (routes, plans and the queue read them without a ctx); this service is how plugins reach them.
 */
import { Service, type Context } from '../kernel/index.js';
import { registerPluginSpec, removePluginSpec, pluginSpec, pluginGraphOf, mapGraph, graphPromptOf, pluginOutKind, hasFileKey, mainModelOf, modelWords, type PluginSpec } from '../pluginGraph.js';
import { comfyNodes, missingNodes, comfyLoaderOptions, comfyLoaderOptionsNow, localObjectInfo, refreshComfyNodes, workflowNodeClasses } from '../comfyNodes.js';
import { neededFiles } from '../workflowModels.js';
import { workflowModelCheck } from '../workflowCompat.js';

export class WorkflowsService extends Service {
  constructor(ctx: Context) { super(ctx, 'workflows'); }
  /** The graph store: register a folder's graph + node map (undone when the calling plugin is disposed), read one by tool or workflow id. */
  registerGraph(s: PluginSpec) { return this.ctx.effect(() => { registerPluginSpec(s); return () => { if (pluginSpec(s.id) === s) removePluginSpec(s.id); }; }, `graph ${s.id}`); }
  graph(toolId: string) { return pluginSpec(toolId); }
  graphOf(workflowId: string) { return pluginGraphOf(workflowId); }
  mapGraph = mapGraph; graphPromptOf = graphPromptOf; outKind = pluginOutKind; hasFileKey = hasFileKey;
  mainModel = mainModelOf; modelWords = modelWords; neededFiles = neededFiles;
  nodes = comfyNodes; missingNodes = missingNodes; nodeClasses = workflowNodeClasses; refreshNodes = refreshComfyNodes;
  loaderOptions = comfyLoaderOptions; loaderOptionsNow = comfyLoaderOptionsNow; objectInfo = localObjectInfo;
  modelCheck = workflowModelCheck;
}
