// GENERATED from handler.ts by scripts/build-plugins.mjs. Edit handler.ts.
const handler = {
  async parseInput(_fields, _files, ctx) {
    const input = await ctx.base();
    if ("error" in input) return input;
    if (input.fields?.detail === "fine" && input.resolution === "1080p") input.warnings = [...input.warnings ?? [], "Fine edges at 1080p are slow: try Balanced first."];
    return input;
  },
  run(job, ctx) {
    const bg = ctx.manifest.presets.find((p) => p.id === job.input.types?.[0])?.label ?? "Cutout";
    return ctx.mockRun(job, [`Cutout \xB7 ${bg}`, "Alpha matte"]);
  }
};
var handler_default = handler;
export {
  handler_default as default
};
