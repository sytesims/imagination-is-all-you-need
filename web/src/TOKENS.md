# Imagination Is All You Need design tokens (HF match, Oct 19 2026)

Use the project's shared tokens and orange brand accent (`#FF7A1A`). Use original project artwork and icons; do not include third-party product logos or marks as app branding.

Where the tokens live: the `:root` block at the top of `web/src/styles.css` ("HF tokens"). `tokens.css` still loads first. The new block wins and aliases the old names (see the end of this file).

Source key:
- **M (measured):** computed-style values measured from the reference layout (local dumps, not shipped). n = how often the value appears across all dumps.
- **S (sampled):** pixel colour read from a PNG with PIL. ImageMagick isn't installed on the box.
- **I (inferred):** derived from the measured values, or our own choice where HF gives nothing.

## Surfaces
| Token | Value | Src | HF original / note |
|---|---|---|---|
| --hf-bg | #0F1113 | M (body bg, n=18) + S (17-composer-crop @5,5) | page background |
| --surface-1 | #131517 | M (n=68, `bg-page-primary` panels, camera-computed) | side panels |
| --surface-2 | #1C1E20 | M (n=93) + MEASURE-SPEC composer outer rgb(28,30,33) | cards, composer shell |
| --surface-3 | #27292C | M (MEASURE-SPEC composer inner) + S | composer inner, raised |
| --fill | rgba(255,255,255,.05) | M (n=84 + oklab .05 n=49) | chip / tile rest fill |
| --surface-hover | rgba(255,255,255,.1) | M (value n=19); I (its use as the hover state) | hover over fill |
| --popover-bg | rgba(33,37,40,.95) | M (MEASURE-SPEC picker) | menus (+ blur 32px in HF) |
| --scrim | rgba(0,0,0,.6) | M (oklab 0 0 0/.6, n=24) | modal scrim |

## Borders
| --border | rgba(255,255,255,.05) | M (n≈38) | hairline |
| --border-strong | rgba(255,255,255,.1) | M (n=35) | inputs, outlined buttons |
| --border-popover | rgba(217,217,217,.04) | M (n=35, MEASURE-SPEC picker) | popover edge |

## Radii
| --radius-xs | 4px | M (n=55) | badges (HF 16h badge r4) |
| --radius-sm | 6px | M (n=129) | small buttons, thumbs |
| --radius-md | 8px | M (n=507) | chips, inputs, logo tiles |
| --radius-lg | 12px | M (n=180) | Generate, menu rows, cards |
| --radius-xl | 16px | M (n=42) | popovers, composer inner |
| --radius-2xl | 20px | M (n=26) | composer outer, side panels |
| --radius-pill | 9999px | M (3.35e7px n=95 = Tailwind full) | pills |

## Text
| --text-1 | #F7F7F8 | M (n=949) | body text |
| --text-2 | #898A8B | M (n=358) | descriptions, section headers |
| --text-3 | rgba(255,255,255,.5) | M (n=33, picker placeholder) | placeholders, tertiary |
| --text-disabled | rgba(255,255,255,.3) | M (n=374) | disabled, inactive |

## Accent (lime → orange)
| --accent | #FF7A1A | ours | HF #D1FE17 (M n=40 bg, n=123 text) |
| --accent-hover | #E66E17 | I (HF hover = `filter:brightness(.9)`, M) | HF lime ×0.9 |
| --accent-lip | #9E4B10 | I (same ratio as HF's lip) | HF rgb(130,155,25), the 3D bottom inset on Generate (M) |
| --on-accent | #14151A | M (text on lime, rgb(20,21,26), n=14) | the ONE ink for text and icons on any solid orange fill (6.99:1); --accent-ink and --price-ink are aliases. --on-accent-2 = quieter line on orange (4.9:1). Never white on orange (2.4:1) |
| --accent-soft | rgba(255,122,26,.2) | M (alpha) | HF rgba(209,254,23,.2), n=41 (badge fills) |
| --accent-faint | rgba(255,122,26,.1) | M (alpha) | HF rgba(209,254,23,.1), n=5 |
| --focus-ring | 0 0 0 2px rgba(255,122,26,.48) | M (ring colour) + I (2px width) | HF ring colour rgba(209,254,23,.48), n=17 |

## Shadows
| --shadow-1 | 0 2px 2px rgba(0,0,0,.12), inset 0 2px 3px rgba(255,255,255,.05) | M (n=8) | tiles, chips |
| --shadow-2 | 0 6px 4px rgba(0,0,0,.25), 0 32px 24px rgba(0,0,0,.15) | M (n=5, composer) | floating bars |
| --shadow-popover | 0 4px 20px rgba(0,0,0,.2) | M (n=2) | menus (HF's model picker itself has none) |
| --shadow-tile-inset | inset 0 1.5px 3px rgba(255,255,255,.05) | M (n=20) | logo tiles |
| --shadow-generate | MEASURE-SPEC layered stack + inset lip var(--accent-lip) | M | Generate button |
| --card-shade | rgba(0,0,0,.7), black 70% | S | HF card fade: the bottom gradient stop on media and preset cards (`linear-gradient(180deg,transparent,var(--card-shade))`) |

## Spacing
--space-0-5 2 · --space-1 4 · --space-1-5 6 · --space-2 8 · --space-3 12 · --space-4 16 · --space-5 20 · --space-6 24 · --space-7 32 · --space-8 48. Measured gaps: 4px n=445, 8 n=144, 6 n=113, 12 n=56, 2 n=38, 16 n=12. The steps from 20px up are I (from the paddings and section gaps seen).

## Type
- --font-sans: Inter, ui-sans-serif, system-ui, sans-serif. M: n≈2250, every UI text. Inter is now loaded in `web/index.html`.
- --font-display: 'Space Grotesk'. M: n≈100, always weight 700, used for headings and the GENERATE-style caps.
- Sizes and line heights, all M: 10/14 (n=169), 12/18 (n=370), 14/20 (n=818), 16/24 (n=1265, body), 20/28 (n=39), 24/32, 28/36, 36/36, 40/48, 48/56, 56/64. Tokens: `--fs-10…--fs-56` with matching `--lh-*`.
- Weights, all M: --fw-regular 400 (n=1317), --fw-medium 500 (n=974), --fw-semibold 600 (n=241), --fw-bold 700 (n=182).

## Motion and layers
| --ease | cubic-bezier(.4,0,.2,1) | M (n≈50) |
| --ease-out | cubic-bezier(0,0,.2,1) | M (opacity fades) |
| --dur-fast | 150ms | M |
| --dur-med | 200ms | M (the HF default) |
| --dur-slow | 300ms | M (height/width ease-in-out) |
| --z-popover | 95 | I (ours) |

## Aliases (old name → new token)
--bg→--hf-bg, --surface→--surface-1, --hairline→--border, --hairline-strong→--border-strong, --text→--text-1, --accent-ink/--price-ink→--on-accent, --badge/--accent-gradient→--accent, --focus/--glow→--focus-ring, --font-ui→--font-sans, --fs-xs→--fs-12, --fs-base→--fs-14, --fs-display→--fs-40, --fw-ui→--fw-medium, --fw-strong→--fw-semibold, --r-xs/sm/md/lg/pill→--radius-*, --r-panel→--radius-xl, --fast/--base/--slow→--dur-fast/med/slow.

Seven names are the same in the old and new sets, so they now carry HF values: --surface-2, --surface-3, --text-2, --text-3, --border, --border-strong, --surface-hover. --surface-hover has no var() users yet.

Kept off-scale for now, because HF has no such size and changing them would make text jump: --fs-2xs 11, --fs-sm 13, --fs-lg 17, --fs-xl 22, --fs-hero 44. Move these to the nearest --fs-* in the sweep.

## For Page Polisher
- Scoped page CSS (`.pp-<page> …`, e.g. `ui/pages/presets.css`) should use only these vars: no hex, rgb() or px radii literals. Use `var(--fill)` for chips, `var(--surface-2)` for cards, `var(--radius-md)` for chips and inputs, `var(--radius-lg)` for cards, `var(--text-2)` for secondary copy, `var(--accent)` / `var(--on-accent)` for the one primary action, `var(--accent-soft)` for badge fills, and `var(--ease)` with `var(--dur-med)` for transitions.
- Hover: chips go from `--fill` to `--surface-hover`. A filled accent button gets `filter:brightness(.9)` (HF behaviour) or `--accent-hover`.
- Focus: `box-shadow: var(--focus-ring)` on `:focus-visible`.
- Menus and popovers: use the shared `Popover` (`web/src/shared/Popover.tsx`, classes `.apop*`). Don't build page-local popovers. Note the `.apop` prefix, so it never collides with your `.pp-*` page scope.

## Notes for the token sweep
- `.main` padding: HF uses 16px page padding; ours is 20–24px (shared `.main` rules). Left alone on purpose in R1 because it moves every page. Change it once, in the sweep.
- Unused `.pre-*` rules (old presets page, now `.pp-presets-*` in ui/pages/presets.css) were removed from styles.css in R1. `.presets-page`, `.pre-h`, `.pre-head` and `.pre-more` are kept because CommunityPage.tsx still uses them.
