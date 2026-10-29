/** One option's price slot in a bar popup (2026-10-25, shared by every bar; the figures come from shared/optionPrice.ts): the token
 *  (short, full words in the tooltip), a quiet placeholder while it loads (no layout jump), nothing when the option isn't priced. */
import { shortToken } from './optionPrice';
import './optionPrice.css';

export function OptPrice({ text, testId, full }: { text: string | null | undefined; testId?: string; full?: boolean }) {
  if (text === null) return null;
  if (text === undefined) return <span className="opt-price opt-loading" data-testid={testId} data-state="loading" aria-label="Loading price" />;
  return <span className="opt-price" data-testid={testId} title={text}>{full ? text : shortToken(text)}</span>;
}
