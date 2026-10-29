/**
 * The board's look, through tldraw's own theme API (TLTheme): near-black canvas (--hf-bg), orange only for the selection,
 * the brush and focus, Inter for the sans font (already loaded by the app). The pen palette leads with our orange.
 * tldraw's licence and watermark are untouched.
 */
import { DEFAULT_THEME, type TLTheme, type TLDefaultColorStyle } from 'tldraw';

const ORANGE = '#FF7A1A';
const dark = DEFAULT_THEME.colors.dark;
export const BRAND_THEME: TLTheme = {
  ...DEFAULT_THEME,
  fonts: { ...DEFAULT_THEME.fonts, sans: { ...DEFAULT_THEME.fonts.sans, fontFamily: "'Inter', system-ui, sans-serif", faces: [] } },
  colors: {
    ...DEFAULT_THEME.colors,
    dark: {
      ...dark,
      background: '#0F1113', negativeSpace: '#0F1113', text: '#F7F7F8', solid: '#0F1113',
      selectionStroke: ORANGE, selectionFill: 'rgba(255,122,26,.10)', selectedContrast: '#14151A',
      brushStroke: 'rgba(255,122,26,.55)', brushFill: 'rgba(255,122,26,.06)',
      snap: 'rgba(247,247,248,.55)', noteBorder: 'rgba(0,0,0,.4)',
      orange: { ...dark.orange, solid: ORANGE, fill: ORANGE, linedFill: '#E66E17', semi: '#3A2618', pattern: '#B85A16', noteFill: '#9E4B10', frameHeadingStroke: '#7A3D10', frameStroke: '#7A3D10' },
    },
  },
};

/** The curated pen palette (tldraw colour names; in dark mode 'black' draws near-white). Orange first. */
export const PEN_COLORS: { id: TLDefaultColorStyle; label: string; swatch: string }[] = [
  { id: 'orange', label: 'Orange', swatch: ORANGE },
  { id: 'black', label: 'White', swatch: '#F2F2F2' },
  { id: 'grey', label: 'Grey', swatch: dark.grey.solid },
  { id: 'yellow', label: 'Yellow', swatch: dark.yellow.solid },
  { id: 'red', label: 'Red', swatch: dark.red.solid },
  { id: 'green', label: 'Green', swatch: dark.green.solid },
  { id: 'blue', label: 'Blue', swatch: dark.blue.solid },
  { id: 'violet', label: 'Violet', swatch: dark.violet.solid },
];
