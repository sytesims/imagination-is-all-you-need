/** One price slot for every Generate button: ONE short token that never truncates; the full words are in its tooltip and in the
 *  CostNote under the button. Token scheme (UI quality standard, 2026-10-21):
 *    demo            → 'Sample'                 (free sample output, nothing billed)
 *    local           → 'Free · this computer' (team mode: 'Free')
 *    Comfy / fal / … → '≈ $0.42'               (dollars only, an estimate; the place's units are in the tooltip)
 *    team mode       → '$0.64' (× N calls)
 *  Nothing known yet → an empty slot (no '·', no layout jump). Never a made-up number. The token is solid ink on the accent: no opacity and
 *  no fade-in (Safari composited the old translucent, animated price into a muddy orange). data-est / data-billed say what it is. */
import { demoRealCredits, demoPriceTitle } from './DemoPrice';
import { useBilling, modeOf, priceToken, costTitle, costShort, demoRealText, fmtUsd, ledgerUsd, type Cost } from './billing';

/** The tooltip for a price: what it is, where it's billed, that it's an estimate, the failure rule. Shared with the Generate button's title. */
export function priceTitle(q: any, b: ReturnType<typeof useBilling>, o: { demo?: boolean; free?: boolean; credits?: number | null; calls?: number } = {}): string | undefined {
  const own = modeOf(b, q) === 'own-accounts'; const cost: Cost | null = q?.cost && typeof q.cost === 'object' ? q.cost : null; const calls = o.calls ?? 1;
  if (o.demo) { const n = demoRealCredits(q); if (!own) return demoPriceTitle(n); const real = demoRealText(cost, b?.comfyCreditsPerUsd) ?? (n != null ? `≈ ${fmtUsd(n / 100)}` : null);
    return `Sample output, nothing billed.${real ? ` A real run costs ${real}${cost ? ` on your ${cost.billedToName} account` : ''} once a key is added; an estimate.` : ''}`; }
  if (own && cost) return `${costShort(cost, calls)}. ${costTitle(cost)}`;
  if (o.free) return own ? 'Runs locally: nothing is billed.' : 'Free: nothing is charged.';
  if (o.credits != null) return own ? `About ${fmtUsd((o.credits * calls) / 100)}, an estimate.` : `${ledgerUsd(o.credits * calls)} from the team balance${calls > 1 ? ` (${calls} calls)` : ''}.`;
  return undefined;
}

export function GenPrice({ q, demo, free, credits, calls = 1, text, muted, compact, testId, title }: { q?: any; demo?: boolean; free?: boolean; credits?: number | null; calls?: number; /** a word instead of a price ('Needs a key', 'Price unavailable') */ text?: string | null; muted?: boolean; /** kept for callers; every button now shows the short token */ compact?: boolean; testId?: string; title?: string }) {
  const b = useBilling(); const own = modeOf(b, q) === 'own-accounts'; const cost: Cost | null = q?.cost && typeof q.cost === 'object' ? q.cost : null;
  let tip = title ?? priceTitle(q, b, { demo, free, credits, calls }); const attrs: Record<string, string> = {};
  let body: React.ReactNode = null;
  if (text) body = text;
  else if (demo) body = <span className="demo-price" data-testid="demo-price">Sample</span>; /* Model vs Run-on copy: one word for a free sample run (the server's demoTag stays in the tooltip) */
  else if (own && cost && cost.billedTo === 'local') body = priceToken({ q, own, credits });
  else if (own && cost && credits != null) { body = priceToken({ q, own, credits, calls });
    attrs['data-billed'] = cost.billedTo; attrs['data-est'] = costShort(cost, calls).replace(/^≈ /, ''); attrs['data-est-usd'] = String(cost.estUsd * calls); attrs['data-provider'] = cost.billedToName;
  }
  else if (free) body = priceToken({ own, free });
  else if (credits != null) body = own ? priceToken({ own, credits, calls }) : <><i className="gp-g" aria-hidden>✦</i>{' '}{credits.toLocaleString()}{calls > 1 ? <small>{' '}×{calls}</small> : null}</>;
  /* compact (the 120px dock buttons): 'Free · this computer' keeps the same text, but the part after the first ' · ' sits in .gp-sub so the
   * dock CSS can drop it to a smaller second line instead of cramming one line edge to edge */
  if (compact && typeof body === 'string' && body.includes(' · ')) { const i = body.indexOf(' · '); body = <>{body.slice(0, i)}<span className="gp-sub"><span className="gp-dot"> · </span>{body.slice(i + 3)}</span></>; }
  /* 2026-10-28: the server ran the job adjusted instead of refusing it (a length rounded, a size moved up, speech trimmed, a long prompt cut): say so
   * up front, next to the price, with the server's own sentences in the tooltip (the same notes come back on the job after Generate). */
  /* D1 (2026-10-28): a model with no published price runs on an estimate: the same small tag says so up front ("≈ $1.78 · estimate"),
   * the tooltip (costTitle) says "About $X (estimate)…"; an adjusted run says "adjusted" (one tag, adjusted first). */
  const adj: string[] = !text && body != null && Array.isArray(q?.adjustNotes) ? q.adjustNotes.filter((x: unknown) => typeof x === 'string' && x) : [];
  if (!adj.length && !text && body != null && !demo && cost?.unconfirmed) { attrs['data-estimate'] = '1';
    body = <>{body}<span className="gp-sub gp-adjust" data-testid="gen-estimate"><span className="gp-dot"> · </span>estimate</span></>; }
  if (adj.length) { tip = [tip, ...adj].filter(Boolean).join('\n'); attrs['data-adjusted'] = adj.join(' ');
    body = <>{body}<span className="gp-sub gp-adjust" data-testid="gen-adjusted"><span className="gp-dot"> · </span>adjusted</span></>; }
  return <span className={`gen-price${muted ? ' gp-muted' : ''}${body == null ? ' gp-empty' : ''}${own ? ' gp-own' : ''}`} data-testid={testId} title={tip} {...attrs}>{body}</span>;
}
