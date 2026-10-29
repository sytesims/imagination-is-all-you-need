# Brand Kit for Figma

A small Figma plugin that turns a brand kit from Imagination Is All You Need (Assets › Brand › **Design tokens (.json)**) into Figma Variables and styles. Free, runs only inside Figma, no network access. AGPL-3.0-or-later, like the rest of this repo.

What it makes in the open file:

- a Variables collection **"&lt;kit&gt; brand"** with colour variables (`color/primary`, `color/accent`…), number variables (`spacing/md`, `radius/lg`…) and text variables (`font/heading`, `font/body`)
- a **paint style** per colour (`<kit>/primary`…), bound to its colour variable
- **text styles** `<kit>/Heading` (32 px) and `<kit>/Body` (16 px) in the kit's fonts, when those fonts are installed

Run it again with the same file and it updates everything by name; nothing is duplicated.

## Load it in Figma desktop

1. Open the Figma desktop app and a design file.
2. Menu → **Plugins → Development → Import plugin from manifest…**
3. Pick `integrations/figma-brand-kit/manifest.json` from this repo.
4. Run it: **Plugins → Development → Brand Kit (Imagination Is All You Need)**.
5. Choose your `.tokens.json` (or paste it) and press **Import**.

Fonts: Figma can only make a text style in a font that's installed. A missing font is listed in the plugin and skipped; install it (for example from Google Fonts) and run the plugin again.

## The file it reads

The W3C Design Tokens Community Group format: every token has `$value`, groups carry `$type`. It reads `color` (`"#RRGGBB"`, or the newer `{ "colorSpace": "srgb", "components": [r, g, b] }` form), `dimension` and `number` (`"16px"`, `"1rem"` or `{ "value": 16, "unit": "px" }`) and `fontFamily` (a name or a list). Aliases like `"{color.primary}"` are followed. Other token types are listed as skipped. Any tokens file in this format works, not only ours.

## Status

- The token → variable mapping and the update-by-name logic are unit tested with a stand-in for the Figma API (`server/test/figma-brand-kit.test.ts`).
- **Not yet run inside Figma itself.** Written against the public Figma Plugin API (`figma.variables`, paint and text styles); please report anything that breaks.
- Plain JavaScript, no build step. `code.js` is the plugin, `ui.html` its panel.
