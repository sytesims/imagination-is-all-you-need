/**
 * ctx.tools (plan §3.3): the tools of this app. A studio plugin (plugins-builtin/studios.ts) or a workflow folder (plugins-builtin/
 * workflow-folders.ts) registers its tools here with an explicit nav `order`; whatever a plugin registered goes away when it is disposed.
 * The registry itself is tools/registry.ts (one per process, so code without a ctx, the routes and the queue, reads the same one).
 */
import { Service, type Context } from '../kernel/index.js';
import type { ToolDef } from '../tools/types.js';
import { manageTools, registerTool, unregisterTool, getTool, findTool, listTools, setToolHidden, isToolHidden, toolIdTaken } from '../tools/registry.js';

export class ToolsService extends Service {
  constructor(ctx: Context) { super(ctx, 'tools'); manageTools(); }
  /** Add a tool (and its old ids) at nav position `order`; undone when the calling plugin is disposed. Returns the undo. */
  register(tool: ToolDef, o: { order: number; aliases?: string[] }) {
    return this.ctx.effect(() => { registerTool(tool, o); return () => { unregisterTool(tool.id); }; }, `tool ${tool.id}`);
  }
  /** A visible tool by id or alias. */
  get(id: string) { return getTool(id); }
  /** A tool by id or alias, hidden ones included. */
  find(id: string) { return findTool(id); }
  /** The visible tools in nav order. */
  list() { return listTools(); }
  /** Hide or show a tool without taking it out (the Plugins page's on/off). */
  hide(id: string, on = true) { setToolHidden(id, on); }
  hidden(id: string) { return isToolHidden(id); }
  taken(id: string) { return toolIdTaken(id); }
}
