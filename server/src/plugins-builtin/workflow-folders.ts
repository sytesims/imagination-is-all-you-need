/**
 * workflow-folders: the workflow plugins in folders (docs/PLUGINS.md, schema 1: plugin.json + workflow.json + node-map.json, + handler.ts for a
 * shipped folder). It loads plugins/ (shipped, and the hub's hub-<slug> installs) and <data>/plugins (the workflows you added in the app), and
 * mounts ONE fiber per folder: that fiber registers the folder's tool (ctx.tools, after every built-in) and its graph (ctx.workflows), so
 * removing a folder ("Add a workflow" → Remove, a hub uninstall) disposes exactly what it added, with no restart.
 *
 * The reading, checks and handler adapter stay in plugins.ts (validateManifest, the generic app tool, handler.ts hooks), so every schema-1
 * folder loads unchanged. Leave this plugin out of the profile and no folder loads (GET /api/workflow-folders lists none; adding one says it's off).
 */
import path from 'node:path';
import { definePlugin } from '../kernel/index.js';
import { FOLDER_ORDER } from '../tools/registry.js';
import { setFolderHost, loadPlugins, type FolderHost } from '../plugins.js';

/** The fiber of each loaded folder, by tool id (exported for tests: the fiber's state shows it was disposed). */
export const folderFibers = new Map<string, { state: number; dispose(): Promise<void> }>();

export default definePlugin({
  name: 'workflow-folders', inject: ['tools', 'workflows', 'http'],
  async apply(ctx) {
    const host: FolderHost = {
      async mount({ st, tool, spec }) {
        const fiber = (ctx.plugin as (p: unknown) => any)({
          name: `workflow-folder:${path.basename(st.dir)}`, inject: ['tools', 'workflows'],
          apply(c: typeof ctx) { c.tools.register(tool, { order: FOLDER_ORDER }); if (spec) c.workflows.registerGraph(spec); },
        });
        await fiber; folderFibers.set(tool.id, fiber);
      },
      async unmount(id) { const f = folderFibers.get(id); folderFibers.delete(id); await f?.dispose(); },
    };
    setFolderHost(host);
    ctx.effect(() => () => { setFolderHost(null); folderFibers.clear(); }, 'workflow folders host'); // the folder fibers are this plugin's children: disposed with it
    await loadPlugins();
    // GET /api/workflow-folders and the workflow import routes (Add a workflow). They stay on when this plugin is off and answer that folders are off
    // (GET /api/workflow-folders lists none, an import says so: #191); left out of the profile, legacy.ts registers them for the same answers.
    const W = await import('../routesWorkflowImport.js');
    await ctx.http.group((app) => { W.registerWorkflowImport(app); W.registerPluginList(app); }, { keepOn: true });
  },
});
