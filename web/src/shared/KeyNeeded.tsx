import { Link } from '../platform/router';
import { plainCopy } from './plainCopy';
import { cardOfOwner } from '../../../server/src/shared/keyOwners';
import { ledgerUsd } from './billing';
import { modelsOf } from './models';
import { localOnlyGate, LOCAL_SETUP_TEXT } from '../../../server/src/shared/preflight';
export { localOnlyGate };
/** PB c1e28ff: a hosted route without its provider key quotes needsKey:true + runnable:false. `credits` still carries the list price,
 *  so it is never shown as a charge: Generate stays off and the server's priceLine ("Needs a fal key. Price once it's added: …") is shown with a link to add the key. */
export const isKeyGate = (q: any): boolean => !!q && q.needsKey === true && q.runnable === false;
export const keyPriceLine = (q: any): string => {
  const s = plainCopy(String(q?.priceLine ?? '').trim()); if (s) return s;
  const n = typeof q?.listCredits === 'number' && q.listCredits > 0 ? q.listCredits : null;
  return n ? `Needs a provider key. Price once it's added: ≈ ${ledgerUsd(n)}.` : 'Needs a provider key before it can run.';
};
/** B18: name the key owner when the server says it (keyOwner 'fal' → 'Add a fal key'). */
export const addKeyText = (q: any): string => { const o = String(q?.keyOwner ?? q?.noProvider?.keyOwner ?? '').trim(); return o ? `Add ${/^[aeiou]/i.test(o) ? 'an' : 'a'} ${o} key` : 'Add a provider key'; };
/** Cloud first (2026-10-27): the tool has a model that runs free on this computer, so the key line also names that way out. */
export const hasFreeLocal = (toolId?: string | null): boolean => modelsOf(toolId).some(m => m.rowStatus?.kind !== 'coming_soon' && m.runsOn.some(r => r.id === 'local'));
export function KeyNeeded({ q, className = '', toolId }: { q: any; className?: string; /** the page's tool: when it has a free model on your computer, say so */ toolId?: string | null }) {
  /* a model that only runs on this computer: no key can help, so never key advice (shared/preflight localOnlyGate) */
  if (localOnlyGate(q)) return <p className={`helper key-needed ${className}`} role="status" data-testid="key-needed" data-local-only="1"><span data-testid="key-price-line">Runs free on your computer once ComfyUI is set up.</span>{' '}
    <Link to="/settings#conn-local" className="key-needed-link" data-testid="set-up-local">{LOCAL_SETUP_TEXT}</Link></p>;
  return <p className={`helper key-needed ${className}`} role="status" data-testid="key-needed"><span data-testid="key-price-line">{keyPriceLine(q)}</span>{' '}
    <Link to={`/settings#conn-${cardOfOwner(q?.keyOwner ?? q?.noProvider?.keyOwner)}`} className="key-needed-link" data-testid="add-provider-key">{addKeyText(q)}</Link>
    {hasFreeLocal(toolId) ? <span data-testid="key-free-local"> in Settings → Connections, or pick a free model that runs on your computer from the model menu.</span> : null}</p>;
}
