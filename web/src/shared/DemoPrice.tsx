/** B33 (CA honesty P2): one sample price line for every studio, matching EditVideo's 'Sample · N credits with a key'.
 *  No strike-through: a demo is sample output at ✦0; the real-run price (the quote's listCredits, else its real-run credits) is shown muted.
 *  No real price on the quote → no 'Real run' part. Never a hardcoded number. */
import { demoTagOf } from './quote';
import { useBilling, modeOf, demoRealText, runPrice, placeOfQuote, ledgerUsd } from './billing';

export const demoRealCredits = (q: any): number | null => {
  const v = [q?.listCredits, q?.realCredits, q?.realRun?.credits, q?.demo && typeof q.demo === 'object' ? q.demo.listCredits : null]
    .find(x => typeof x === 'number' && Number.isFinite(x) && x > 0);
  return typeof v === 'number' ? v : null;
};

export const demoPriceTitle = (n: number | null): string =>
  `Sample output, nothing billed.${n != null ? ` A real run costs ${ledgerUsd(n)} with a provider key.` : ''}`;

/** Full line (desktop): 'Sample output, nothing billed' + muted 'Real run: ✦N with a key'. Phones (≤640): 'Sample · ✦N with a key'.
 *  `short` forces the short form everywhere (inside a button). */
export function DemoPrice({ q, n: nIn, short, className }: { q?: any; n?: number | null; short?: boolean; className?: string }) {
  const n = nIn !== undefined ? nIn : demoRealCredits(q);
  const tag = (q && demoTagOf(q)) || 'Sample';
  /* Own-accounts mode (2026-10-21): the real run's estimated cost on the account that bills it, never ✦ credits. */
  const b = useBilling();
  if (modeOf(b, q) === 'own-accounts') { const real = demoRealText(q?.cost, b?.comfyCreditsPerUsd) ?? (n != null ? runPrice({ own: true, credits: n, runOn: placeOfQuote(q) }) : null); const where = q?.cost?.billedToName ? ` on ${q.cost.billedToName}` : '';
    return <span className={`demo-price${short ? ' dp-only-short' : ''}${className ? ' ' + className : ''}`} data-testid="demo-price" title={`Sample output, nothing billed.${real ? ` A real run costs ${real}${where} once a key is added.` : ''}`}>
      {!short && <span className="dp-full"><span className="dp-main">Sample output, nothing billed</span>{real && <span className="dp-real" data-testid="demo-list"> Real run: {real}{where} with a key</span>}</span>}
      <span className="dp-short">{real ? `${tag} · ${real} with a key` : tag}</span></span>; }
  const sh = <span className="dp-short">{n != null ? `${tag} · ${ledgerUsd(n)} with a key` : tag}</span>;
  return <span className={`demo-price${short ? ' dp-only-short' : ''}${className ? ' ' + className : ''}`} data-testid="demo-price" title={demoPriceTitle(n)}>
    {!short && <span className="dp-full"><span className="dp-main">Sample output, nothing billed</span>{n != null && <span className="dp-real" data-testid="demo-list"> Real run: {ledgerUsd(n)} with a key</span>}</span>}
    {sh}
  </span>;
}
