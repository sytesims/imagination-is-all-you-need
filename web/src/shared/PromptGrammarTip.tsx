import { promptTipOf } from '../../../server/src/shared/promptTips';
import './promptGrammarTip.css';
/**
 * "How it reads your prompt" (prompt grammar step 2, 2026-10-26): ONE block for every model card (the model menu's preview card and the Models
 * page card): how the model reads attached inputs (what @image1 becomes), its length limit, avoid-words and trigger words. Data:
 * server/src/shared/promptTips.ts (from shared/promptGrammar.ts, the same rules the server applies before sending). Nothing renders for
 * a model with no prompt or an unknown key.
 */
const TOKEN = /(<<<[a-z]+_\d+>>>|<[A-Za-z_]+ ?\d*>|@[A-Za-z]+\d*|\b(?:Image|Video|Audio|Picture) \d+\b|"[^"]+")/g;
/** Tokens in mono so <<<image_1>>> reads as something you can type. */
const withCode = (s: string) => s.split(TOKEN).map((x, i) => (i % 2 ? <code key={i}>{x}</code> : x));
export function PromptGrammarTip({ modelKey, place, compact }: { modelKey: string | null | undefined; place?: string; /** the menu's preview card: refs, limit and triggers only */ compact?: boolean }) {
  const t = promptTipOf(modelKey, place); if (!t || t.noPrompt) return null;
  const rows = [t.refs, t.triggers, [t.limit, compact ? null : t.negative].filter(Boolean).join(' · ') || null, ...(compact ? [] : t.extras.slice(0, 1))].filter(Boolean) as string[];
  return <div className="pgt" data-testid="prompt-grammar-tip" data-model-key={t.key}>
    <span className="orb-lbl">How it reads your prompt</span>
    <ul>{rows.map((r) => <li key={r}>{withCode(r)}</li>)}</ul>
  </div>;
}
