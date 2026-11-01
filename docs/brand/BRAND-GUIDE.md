# Imagination Is All You Need brand guide

One page that covers how Imagination Is All You Need looks, moves, sounds and speaks. The rendered version, with live type specimens and the logo animation, is [brand-guide.html](brand-guide.html). All assets are in [`brand/`](../../brand/) (asset index: [`brand/index.html`](../../brand/index.html)).

**In one line:** an open studio for images, video, audio and 3D, built on ComfyUI. *If you can imagine it, you can make it here.*

---

## 1. Logo: Orbit

Three arcs orbit one core. The arcs are the three media (video, image, audio). The core is the engine that runs them all: ComfyUI, locally or in the cloud. The three gaps keep the ring open, so it never reads as a closed box or a media-player button.

### Construction (48-unit grid)

| Part | Value |
|---|---|
| Ring centreline radius | 15.5 |
| Arc stroke | 5.5, round caps |
| Arcs | 3 × 80°, centred at −15°, 105° and 225° (clockwise from 3 o'clock) |
| Gaps | 3 × 40° between arc centrelines (about 4 units of clear space between the round caps) |
| Core | circle, radius 6 (diameter 12 ≈ 2.2 × the stroke) |
| Visible ring | 36.5 units across, centred in the 48 box (5.75 units of built-in padding) |

The **small variant** (`logo-mark-small.svg`, 16-unit grid) uses heavier arcs (2.3), wider gaps (48°) and a slightly larger core (r 2.3), so the three gaps stay open at 16 px. Tested at 16, 24, 48 and 512 px on dark and light.

### Files

| File | Use it for |
|---|---|
| `brand/logo-mark.svg` | The mark on dark backgrounds (orange arcs, near-white core). Default. |
| `brand/logo-mark-light.svg` | The mark on light backgrounds (orange arcs, near-black core). |
| `brand/logo-mark-mono.svg` | One colour, `currentColor`. Embossing, watermarks, single-ink print, inside icon rows. |
| `brand/logo-mark-small.svg` | 24 px and below (tab bars, inline badges, 16 px UI). |
| `brand/wordmark.svg` | The inline lockup (mark + "Imagination" + "is all you need" on one line) on dark. README, slides, wide spaces. |
| `brand/wordmark-light.svg` | The inline lockup on light backgrounds. |
| `brand/wordmark-stacked.svg` | The stacked lockup ("is all you need" under "Imagination"), as in the app header, on dark. |
| `brand/wordmark-stacked-light.svg` | The stacked lockup on light backgrounds. |
| `brand/app-icon.svg`, `app-icon-512.png` | PWA / app icon (rounded tile, gradient #1F2124 → #0F1113). |
| `brand/apple-touch-icon.svg`, `apple-touch-icon.png` | iOS home screen, 180 px, full-bleed square (iOS rounds the corners). |
| `brand/favicon.svg`, `favicon-32.png` | Browser tab. Dark 16-unit tile with the small mark, so it reads on light and dark tab bars. |
| `brand/preview.png` | Overview of the mark and lockup on dark and light. |

### Wordmark

- **"Imagination"** in Space Grotesk Bold (700), near-white `#F7F7F8`, tracking −0.02 em. **"is all you need"** in Inter Medium (500), orange `#FF7A1A`. Two tiers: the colour, weight and size change does the separating.
- **Stacked** (`wordmark-stacked*.svg`, the app header): "is all you need" sits under "Imagination" at 62% of its size, tracking +0.06 em, baseline 0.82 × the top line's size lower.
- **Inline** (`wordmark*.svg`): "is all you need" sits on the same baseline at 76% of the size, tracking +0.02 em, after a gap of 0.35 × the size.
- On light backgrounds: "Imagination" and the core in Ink `#14151A`, "is all you need" in Orange Deep `#E0640A` (better contrast on white).
- Text is converted to paths in every SVG, so it renders the same everywhere without fonts. To redraw it: `scripts/brand/build-name-art.mjs` (see the header of that file).
- **Mark size and gap:** the ring is 1.53 × the "Imagination" size, and the gap to the text is 0.47 × that size (26 px and 8 px at the header's 17 px). The mark is centred on the text block (stacked) or on the cap height (inline).

### Clear space and minimum sizes

- **Clear space:** keep at least one core diameter (1/3 of the visible ring) free on every side of the mark or lockup. Nothing else (text, edges, other logos) enters that zone.
- **Minimum sizes:** mark 16 px (use the small variant at 24 px and below), inline lockup 200 px wide, stacked lockup 28 px tall (so "is all you need" stays at 10 px or more), app icon 29 px.

### Don'ts

- Don't stretch, skew or rotate the mark (its rotation is fixed; the gaps are not decoration you can move).
- Don't recolour it outside the files above: no gradients, no second hue on the arcs, no orange core.
- Don't add effects: shadows, glows, outlines, bevels, 3D.
- Don't place it on busy photos or mid-tone backgrounds. Use a solid surface or a dark scrim under it.
- Don't rebuild the wordmark in a live font or change the weights; use the SVG.
- Don't pair it with Higgsfield's or Comfy's logos as if they were ours. We can name ComfyUI in text ("built on ComfyUI") but never use their marks as part of our logo.

---

## 2. Colour

The app is near-black and neutral; **orange is the only accent**. Effective values (`web/src/styles.css` overrides some `tokens.css` names; this table lists what the app actually renders).

| Name | Hex / value | Token | Use |
|---|---|---|---|
| **Orbit Orange** | `#FF7A1A` | `--accent` | Logo, the Generate button, active states, key badges |
| Orange Hover | `#E66E17` | `--accent-hover` | Hover on orange |
| Orange Lip | `#9E4B10` | `--accent-lip` | The pressed edge of the Generate button |
| Orange Deep *(brand only)* | `#E0640A` | — | "is all you need" in the wordmark on light backgrounds |
| Orange Soft / Faint | `rgba(255,122,26,.2)` / `.1` | `--accent-soft` / `--accent-faint` | Tints behind selected items |
| Ink | `#14151A` | `--accent-ink`, `--price-ink` | Text on orange; the core on light |
| Background | `#0F1113` | `--hf-bg` (`--bg`) | Page |
| Surface 1 | `#131517` | `--surface-1` | Panels |
| Surface 2 | `#1C1E20` | `--surface-2` | Cards, inputs |
| Surface 3 | `#27292C` | `--surface-3` | Raised controls |
| Fill / Hover | `rgba(255,255,255,.05)` / `.1` | `--fill` / `--surface-hover` | Resting and hover fills |
| Popover | `rgba(35,36,39,.95)` | `--popover-bg` | Menus |
| Text 1 | `#F7F7F8` | `--text-1` | Primary text, the mark's core on dark |
| Text 2 | `#898A8B` | `--text-2` | Secondary text |
| Text 3 | `rgba(255,255,255,.5)` | `--text-3` | Labels, captions |
| Disabled text | `rgba(255,255,255,.3)` | `--text-disabled` | |
| Border / Strong | `rgba(255,255,255,.05)` / `.1` | `--border` / `--border-strong` | Hairlines |
| Success | `#3DDC97` | `--success` | Done, ready |
| Free badge | `#2FBF8F` | `--badge-free` | "Free" |
| Warning | `#E8B44A` | `--warning` | Needs a key, limits |
| Error | `#F06464` | `--error` | Failed, blocked |

**How much orange:** about 5% of any screen or graphic. One orange action per view (Generate), plus the logo and small active markers. Never orange body text, never orange backgrounds behind long text, never orange for errors or warnings. On marketing graphics, orange is the logo, one highlight (a hashtag or a button) and a faint glow at most.

---

## 3. Typography

Fonts the app loads today (`web/index.html`): **Inter** (UI and body), **Space Grotesk** (display headings and the wordmark), **Manrope** (loaded, legacy fallback in `tokens.css`). `--font-mono` names **JetBrains Mono**, but it is not loaded, so numbers fall back to the system monospace. All are SIL OFL.

| Role | Font | Size / line height | Weight | Notes |
|---|---|---|---|---|
| Display | Space Grotesk | 44–56 / 1.02–1.15 | 700 | Uppercase in the app hero, tracking −0.03 em |
| H1 | Space Grotesk | 40 / 44–48 | 700 | Page heads, uppercase, −0.02 em |
| H2 | Space Grotesk | 22–24 / 28–32 | 600–700 | Band and section heads, uppercase |
| H3 | Inter | 16 / 24 | 600 | Card titles |
| Body | Inter | 14 / 24 (`--fs-14`) | 400–500 | UI default weight 500 |
| Small | Inter | 12 / 18 | 500 | Helpers, meta |
| Label | Inter | 10–11 / 14 | 700 | Uppercase, +0.12 em |
| Mono | JetBrains Mono → `ui-monospace` | 12 / 18 | 500 | Prices, sizes, ids, durations; tabular numbers |

### Display font proposal (only a proposal; nothing is added to `web/`)

All SIL Open Font License 1.1, all free to embed and self-host. Shown side by side in [brand-guide.html](brand-guide.html#display-fonts).

| Font | Character | Licence and source |
|---|---|---|
| **Space Grotesk** *(recommended)* | Geometric grotesk with quirky details (the open "g", flat "y"). Technical but warm. | OFL 1.1 · https://github.com/floriankarsten/space-grotesk · https://fonts.google.com/specimen/Space+Grotesk |
| Sora | Wide, soft geometric. Friendly, very "app". | OFL 1.1 · https://github.com/sora-xor/sora-font · https://fonts.google.com/specimen/Sora |
| Unbounded | Wide, rounded display. Loud and playful; best for posters, too much for UI heads. | OFL 1.1 · https://github.com/googlefonts/unbounded · https://fonts.google.com/specimen/Unbounded |
| Archivo | Grotesk with width axis; Archivo Expanded gives a cinematic, poster feel. | OFL 1.1 · https://github.com/Omnibus-Type/Archivo · https://fonts.google.com/specimen/Archivo |

**Recommendation: keep Space Grotesk.** The wordmark is built from it, the app already loads it, and its slightly odd letterforms give the name character without shouting. Sora is the runner-up if we ever want a softer look. Either way, Inter stays for everything below H2.

---

## 4. Layout

From `web/src/styles.css`, `tokens.css` and `ui-states.css`.

- **Spacing scale:** 2 · 4 · 6 · 8 · 12 · 16 · 20 · 24 · 32 · 48 px (`--space-0-5` … `--space-8`). Media grids use a 6 px gutter.
- **Radii:** 4 (xs) · 6 (sm) · 8 (md) · 12 (lg, Generate button) · 16 (xl, panels) · 20 (2xl) · pill 9999.
- **Borders:** 1 px hairlines in white at 5% (`--border`) and 10% (`--border-strong`); interactive states 8% resting, 16% hover, 32% selected (`--state-border*`).
- **Shadows:** `--shadow-1` (subtle lift plus inner highlight), `--shadow-2` (cards: `0 6px 4px` + `0 32px 24px`), `--shadow-popover` (`0 4px 20px rgba(0,0,0,.2)`), `--shadow-generate` (stacked drop plus an orange lip). Depth comes from surface steps first, shadows second.
- **States:** fills 5% / 9% / 12% white (rest / hover / pressed), press scale 0.98, focus ring 2 px white at 90% with a 2 px offset, disabled `#2A2B2E` with 55% ink.
- **Hit targets:** 32 px desktop, 44 px phone.
- **Frame:** top nav 56 px, sidebar 232 px, settings panel 380 px, phone tab bar 52 px.

---

## 5. Icons

Match `web/src/ui/Icons.tsx`:

- 24 × 24 viewBox, drawn on the pixel grid.
- 1.5 px stroke, `stroke-linecap="round"`, `stroke-linejoin="round"`, `fill="none"`, `stroke="currentColor"`.
- Default render size 18 px; 2 px corner radius on small rectangles; simple, literal metaphors.
- Original drawings. A few universal glyphs (search, trash, download, upload, heart, more) follow common conventions as in Lucide (MIT), credited in `ASSETS-CREDITS.md`.
- The logo is not an icon: never put the Orbit mark in an icon row at 1.5 px stroke. Use `logo-mark-mono.svg` if it must sit next to icons.

---

## 6. Motion

Tokens: **150 ms** (fast, hover and press; `--dur-fast`, `--t-state`), **200 ms** (medium, menus and toasts; `--dur-med`), **300 ms** (slow, panels; `--dur-slow`). Easing `cubic-bezier(.4,0,.2,1)` (`--ease`), `cubic-bezier(0,0,.2,1)` for things entering (`--ease-out`), plain `ease` for state changes. Respect `prefers-reduced-motion`: fade only, no movement.

**Logo animation (demo intro, about 1.4 s):**
1. 0–600 ms: the three arcs draw in along the ring from their leading cap, each starting 90 ms after the last (video, image, audio), while rotating 40° into place. Easing `--ease-out`.
2. 450–800 ms: the core scales from 0 to 1 with a small overshoot and fades from orange to near-white: the engine "lighting up".
3. 800–1100 ms: the wordmark fades in and slides 8 px from the left.
4. Hold. For the end card, play the arcs once more as a slow 360° drift (8 s per turn) behind the URL, not the full intro.

A live SVG/CSS version is in [brand-guide.html](brand-guide.html#motion).

---

## 7. Sonic branding (described only; to be made with our own audio tools)

- **Logo sting (2–3 s):** three short tones, one per arc, entering 90 ms apart (a soft mallet, a glassy pluck and a low warm pulse), resolving on a single bright, open chord when the core lights up, then a short airy tail. Key around D major / Bmin-add9, no melody to remember, no drums. Peak −1 dBTP, about −14 LUFS for social.
- **Demo-video music:** 100–110 BPM, minimal modern electronic with an organic layer (felt piano or plucks, soft sub, light percussion). No vocals. Sparse under the voice-over and ducked 8–10 dB under speech, one lift at the "every tool is a workflow" moment, and it ends on the sting.
- **How:** generate with our own tools (ACE-Step for the music bed, Stable Audio for the sting) in the app, keep the prompt and seed in the repo next to the video, and check the model's licence for the output before publishing (it varies by model and by our use).

---

## 8. Voice and tone

**Plain, honest, short.** We say what something does, where it runs and what it costs. We only claim what is true and measured. We never attack anyone, including the product that inspired us.

| Do (from our app) | Don't |
|---|---|
| "Free · Local" | "Unlimited free generations!" |
| "Sample output, nothing billed." | "Demo mode active (mock backend, no API key detected)" |
| "Estimate, billed to your fal account." | "Credits deducted." |
| "MiniMax H3 needs Comfy Cloud or a fal key. Add one in Connections, or run it locally." | "Error: no_provider" / "Oops! Something went wrong 😢" |
| "Picks the best place you've set up. Never charges more than the price shown." | "Cheaper than other studios" (unmeasured, and an attack) |
| "Tried fal (failed, not charged), then ran on Comfy Cloud." | "Your credits have been refunded" (we hold no money) |

Rules: sentence case for UI copy (uppercase only for display heads and labels); numbers as numerals; one idea per sentence; say who bills; prefer "Local" to jargon; "AI-generated" labels on demo outputs.

---

## 9. Words we use (glossary)

Keep model identity, run location and billing account distinct throughout the interface.

| Term | Meaning |
|---|---|
| **Tool** | One thing you can do (Object Swap, Camera Moves, Upscale…). Every open tool is a ComfyUI workflow. |
| **App** | A one-click preset built on a tool (Product Shot, Transitions…). |
| **Model** | What you get. Listed once per tool with a clean name ("MiniMax H3"). Never includes a route, an account or "API". |
| **Run on** | Where it runs and who bills it: Auto, Local, Comfy Cloud or a direct provider. |
| **Auto** | We pick where it runs from what you've set up, shown as "Auto · Comfy Cloud". Never charges more than the price shown. |
| **Local** | Your own graphics card through ComfyUI. Free. Replaces "Local", "Local ComfyUI", "Local GPU" and "This computer". |
| **Comfy Cloud** | Comfy's servers, one Comfy key; billed to your Comfy account. Always one choice, whether it runs our open workflow or a partner node. |
| **Direct providers** | fal, Replicate, Black Forest Labs, MiniMax, Alibaba Cloud, Luma. Optional keys; each bills you directly. |
| **Connections** | The accounts and GPU you've set up (Settings → Connections). |
| **✦ (price)** | Estimated cost, 1 ✦ = $0.01, shown before every run. "Free" locally. |
| **Estimate / Actual** | What we expected a run to cost / what the provider reported, where its API tells us. |
| **Spend** | The log of runs with where they ran, who billed them, estimate, actual and the failure rule. Not a balance. |
| **Estimate** | "About $X (estimate)": the price shown before Generate when a model has no published price; the real cost is recorded after the run. |
| **Sample** | Placeholder output when no key is set. Labelled "Sample output, nothing billed." Never passed off as a real render. |
| **Open** (badge) | The model's weights are open. A model fact, shown only in the model menu, never on a Run-on row. |
| **Generate** | The one orange button. It always shows the price. |
| **Assets** | Everything you've made: results, uploads, history. |
| **Projects** | Folders that group assets. |
| **Elements** | Saved references (a character, product or place) you can reuse across tools and prompts. |
| **Recreate** | Open a result's exact prompt, references, model and Run on, ready to run again or tweak. |
| **Send to** | Pass a result to another tool as its input (or as a reference). |
| **Workflow** | The ComfyUI graph behind a tool, in `workflows/`. "Get workflow" / "Open in ComfyUI". |

Avoid: "Partner API", "Local ComfyUI" in UI copy, "credits" without saying whose, "refund", "balance", "unlimited", "plans".

---

## 10. Imagery direction (example outputs and demo gallery)

The gallery is the first thing judges see, so it should look curated, not random.

- **Light:** cinematic and motivated: golden hour, soft window light, neon at night, overcast product light. Avoid flat midday light and over-saturated "AI sheen".
- **Palette:** natural colour with a warm bias that sits well next to our orange; avoid outputs dominated by lime green or purple gradients.
- **Subjects, varied on purpose:** products (sneaker, perfume, headphones, ceramic mug), places (coastal road, rainy alley, desert, forest), food, animals, abstract motion and textures, invented characters and creatures. Mix wide, medium and close-up shots; mix 16:9, 9:16 and 1:1.
- **Show the tools, not just pretty frames:** before/after pairs (Object Swap, Restyle, Upscale), the same subject across camera moves, one character kept consistent across clips.
- **Rules (challenge and our own):** SFW only; no real people's likenesses (no celebrities, no public figures, no identifiable private people without a release; faces must be invented or ours with consent); no unlicensed IP (no brands, logos, film or game characters, artists' named styles); label as AI-generated; keep the prompt, seed, model and Run on for every gallery item so anyone can Recreate it.
- **Graphics on top:** use the lower-third template; keep logos off the image itself.

---

## 11. Ready-made assets

| Asset | Files |
|---|---|
| GitHub social preview (1280 × 640) | `brand/social/github-social-preview.png`, and the site's link preview `site/public/brand/social-preview.jpg` (1200 × 630). Both are rendered from `scripts/brand/social-preview.html` with `scripts/brand/render-social-preview.mjs`. |
| README hero (1600 × 500) | `brand/social/readme-hero.svg` / `.png` |
| Demo title and end cards (1920 × 1080) | `brand/video/title-card.svg` / `.png`, `brand/video/end-card.svg` / `.png` |
| Lower third (1920 × 1080, transparent) | `brand/video/lower-third.svg` / `.png` |
| Social post artwork | `brand/social/post-square-1080.svg`, `brand/social/post-vertical-1080x1920.svg` (+ PNG previews) |

All text in these SVGs is converted to paths (Space Grotesk, Inter, JetBrains Mono, all OFL), so they render identically without fonts. To change the words, edit the source and re-export, or overlay live text in your editor.
