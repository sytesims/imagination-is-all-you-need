/**
 * The model menu's price and reason words (2026-10-26), pure so tests can read them (ModelMenu.tsx imports CSS). Used by the menu rows, the
 * hover card, the phone card and the footer, in every tab (Image, Video, Audio, Voice, 3D, Upscale, Canvas cards).
 *  - Prices in dollars: the row says "$0.88" over the place ("Comfy", "fal"). A place's own unit
 *    ("184 Comfy credits · on your Creator plan · price checked 2026-10-26") is the hover's detail line only (billing.ts priceDetail).
 *  - Why a $ figure and its Comfy credits can differ by a cent: Comfy prices in its own credits (211 = $1). The server keeps the exact
 *    figure for the credits (184 = $0.872) and rounds the dollars UP to the cent ($0.88), so the $ is never below the bill.
 *  - Reasons: a row that can't run as set says why in a few words ("Needs a photo", "Max 10 s", "No 1080p"); the full sentence is the hover.
 */
import { fmtUsd, knownBalanceUsd, comfyPlanNow, type Account } from './billing';
import { RUN_ON_BILLING } from './models';
import { balanceText, balanceDetail } from '../../../server/src/shared/priceText';
import { needOf, type Need } from '../../../server/src/shared/settingsFit';

/** '≈ $0.08' (the Generate button's token) → '$0.08' over the place. (An old token with a ' · 17 Comfy cr' tail loses it.) */
export const COMFY_CR = /\s·\s([\d,]+) Comfy cr$/;
export function splitToken(tok: string, place: string): { usd: string; sub: string } {
  return { usd: tok.replace(COMFY_CR, '').replace(/^≈\s*/, ''), sub: place };
}

/** The live balance at the place that runs the pick (GET /api/accounts), in dollars: "$8.50 left on Comfy". The place's own units and plan
 *  are the hover ("1,793 Comfy credits · on your Creator plan · checked 2 min ago"). A mock-mode sample is marked; null when unknown (no key,
 *  no balance API, Local). */
export function balanceOf(accounts: Account[] | null | undefined, runOn: string | null | undefined, plan?: string | null): { text: string; usd: number; sample: boolean; title: string } | null {
  if (!runOn || runOn === 'local' || !accounts) return null; const a = accounts.find(x => x.provider === (RUN_ON_BILLING[runOn] ?? runOn)); if (!a) return null;
  const usd = knownBalanceUsd(a); const own = a.balance; const ownUnit = String(a.balanceUnit ?? '');
  if (usd != null) {
    const d = balanceDetail({ units: typeof own === 'number' && Number.isFinite(own) ? own : null, unitLabel: ownUnit, plan: plan ?? comfyPlanNow() ?? a.plan ?? null });
    return { text: balanceText(usd, a.name), usd, sample: false, title: [`${a.name} balance: ${fmtUsd(usd)}.`, d].filter(Boolean).join(' ') };
  }
  const mk = a.mock; if (!mk || typeof mk.balanceUsd !== 'number') return null;
  const d = balanceDetail({ units: /usd/i.test(mk.balanceUnit) ? null : mk.balance, unitLabel: mk.balanceUnit, plan: plan ?? comfyPlanNow() });
  return { text: balanceText(mk.balanceUsd, a.name), usd: mk.balanceUsd, sample: true, title: [mk.note, d].filter(Boolean).join(' ') };
}

/** The full sentence of why a quote can't run as set (never a key: that has its own words), without the "Pick another place." tail. */
export function blockFull(rq: any): string | null {
  if (!rq || rq.pending || rq.failed || rq.needsKey === true || rq.demo === true) return null;
  if (!(rq.runnable === false || rq.ok === false || (typeof rq.status === 'number' && rq.status >= 400))) return null;
  const t = String(rq.blockedReason ?? rq.unavailableReason ?? rq.reason ?? rq.error ?? '').replace(/\s*Pick another place\.?\s*$/i, '').trim();
  return t || 'Not for these settings.';
}
const RES = /\b(\d{3,4}p|[248]K)\b/i;
/** A reason sentence in a few words for the row's right column (≤ ~18 chars): "Needs a photo", "Max 10 s", "No 1080p", "Text or photo only". */
export function reasonShort(full: string | null | undefined): string {
  const t = String(full ?? '').trim(); if (!t) return 'Not for these settings';
  const body = t.replace(/^[^.]*can[’']t run this job\.\s*/i, ''); // "Comfy Router can't run this job. <the why>"
  const need = needOf(body); if (need) return need.short; // a job no setting can fix: what it needs (shared/settingsFit.ts)
  const n = (re: RegExp) => { const m = re.exec(body); return m ? m[1] : null; };
  if (/price not measured/i.test(body)) return 'Price not set yet';
  if (/comfyui[^.]*(not reachable|isn[’']t running|is off|offline|not running|down)/i.test(body)) return 'ComfyUI is off';
  if (/(too old|update comfyui|newer comfyui)/i.test(body)) return 'Update ComfyUI';
  if (/(only does|only takes|only runs) text to video or image to video/i.test(body)) return 'Text or photo only';
  if (/(only does|only takes|text only|only runs) text\b/i.test(body)) return 'Text only';
  if (/needs (the |a |an )?(last|end) frame/i.test(body)) return 'Needs an end frame';
  if (/needs (the |a |an )?(first|start) frame|needs (a |an )?(photo|image|picture)\b/i.test(body)) return 'Needs a photo';
  if (/needs (a |an |the )?(video|clip)\b/i.test(body)) return 'Needs a video';
  if (/needs (a |an |the )?(audio|voice|song|track)\b/i.test(body)) return 'Needs audio';
  if (/needs (a |an |the )?(mask)\b/i.test(body)) return 'Needs a mask';
  if (/\bmask\b/i.test(body) && /(no|doesn[’']t|not|without)/i.test(body)) return 'No mask';
  const refs = n(/(?:up to|at most|max(?:imum)?(?: of)?)\s*(\d+)\s*(?:reference|ref|image|photo)/i) ?? n(/(\d+)\s*(?:reference|ref|image|photo)s? (?:max|at most)/i);
  if (refs) return `Max ${refs} ${/image|photo/i.test(body) && !/ref/i.test(body) ? 'images' : 'refs'}`;
  if (/too many (reference|image|photo|ref)/i.test(body)) return 'Too many refs';
  if (/\b(no|doesn[’']t take|takes no|without) (reference|ref)s?\b/i.test(body)) return 'No references';
  const sec = n(/(?:up to|at most|max(?:imum)?|longest|no longer than)\s*(\d+(?:\.\d+)?)\s*(?:s\b|sec|second)/i);
  if (sec) return `Max ${sec} s`;
  const minSec = n(/(?:at least|min(?:imum)?)\s*(\d+(?:\.\d+)?)\s*(?:s\b|sec|second)/i);
  if (minSec) return `Min ${minSec} s`;
  const res = /(?:no|doesn[’']t (?:do|support)|not (?:at|in)|isn[’']t (?:available|supported) (?:at|in))\s+(\d{3,4}p|[248]K)\b/i.exec(body)?.[1] ?? (/(not supported|not available|isn[’']t)/i.test(body) ? RES.exec(body)?.[1] : null);
  if (res) return `No ${res}`;
  if (/aspect|ratio/i.test(body) && /(not|only|doesn)/i.test(body)) return 'Other aspect only';
  if (/too (big|heavy|large)|not enough (vram|memory)|doesn[’']t fit/i.test(body)) return 'Too big for this GPU';
  if (/download/i.test(body)) return 'Needs a download';
  if (/custom node|install/i.test(body)) return 'Needs a custom node';
  return 'Not for these settings';
}
/** The full reason without the "<Place> can't run this job." lead-in (the card already says it can't run): "Price not measured yet: …". */
export const reasonBody = (full: string): string => full.replace(/^[^.]*can[’']t run this job\.\s*/i, '').trim() || full;
/** Both at once: { short, full, need } or null when the quote runs (or only needs a key, or is still loading). need = the server's (batch row) or
 *  read from the reason: what the job needs and the bar's action ("Needs a start image" · Add image). */
export function blockOf(rq: any): { short: string; full: string; need: Need | null } | null {
  const full = blockFull(rq); if (!full) return null; const need: Need | null = rq?.need ?? needOf(full);
  return { short: need?.short ?? reasonShort(full), full: need ? `${need.short}. ${reasonBody(full)}` : full, need };
}
