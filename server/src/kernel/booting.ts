/** Set by index.ts before the server boots (no imports): code that wires itself at import for scripts and tests (tools/builtin.ts →
 *  comfyFeatured) leaves that to its plugin when a real boot follows. */
let on = false;
export const markBooting = () => { on = true; };
export const booting = () => on;
