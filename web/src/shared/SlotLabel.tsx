/**
 * A slot's label (2026-10-31): never broken inside a word. Each word is its own unbreakable piece, so two words wrap at the space
 * ("Motion / clip"), and one long word ("Character", "Background") is set a touch smaller and, if it still doesn't fit, ends in "…".
 * Used by every upload slot's label (Image, Video and Audio bars, 3D); the look is in slotLabel.css.
 */
import './slotLabel.css';

/** a word of 8+ letters is set a touch smaller, 10+ smaller still (measured at 9 px: "Products" 39 px, "Character" 43, "Background" 52,
 *  in the dock's 38 px label); anything longer still ends in "…" */
const fitOf = (n: number) => n > 9 ? 'tighter' : n > 7 ? 'tight' : undefined;

export function SlotLabel({ text, className = '' }: { text: string; className?: string }) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return <b className={`slot-lbl ${className}`.trim()} data-fit={fitOf(Math.max(0, ...words.map(w => w.length)))}>
    {words.map((w, i) => <span key={i}>{i > 0 && ' '}<span className="slot-w">{w}</span></span>)}
  </b>;
}
