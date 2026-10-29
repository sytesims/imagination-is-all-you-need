/** Settings → Preferences → Sharing: the starting value of "Show my prompt" when a result is made public on Community (Share dialog).
 *  Per browser (localStorage); default on, as before. Results stay private until you share one, so there is no "private by default" switch. */
const K = 'ohf:sharePrompt';
export function sharePromptDefault(): boolean { try { return localStorage.getItem(K) !== '0'; } catch { return true; } }
export function setSharePromptDefault(on: boolean) { try { on ? localStorage.removeItem(K) : localStorage.setItem(K, '0'); } catch { /* private mode */ } }
/** Share step 1: downloads get the metadata-free copy (GET /files/<name>?clean=1: no ComfyUI prompt/graph chunks, EXIF or container tags).
 *  In-app viewing keeps the original. */
export { cleanUrl as cleanHref } from '../../../server/src/shared/cleanUrl';
/** Share sheet (step 2): Clean (the first default) or Branded; the last choice is remembered per browser. Settings → Sharing sets it too. */
export type ShareStyle = 'clean' | 'branded';
const KS = 'ohf:shareStyle';
export function shareStyleDefault(): ShareStyle { try { return localStorage.getItem(KS) === 'branded' ? 'branded' : 'clean'; } catch { return 'clean'; } }
export function setShareStyleDefault(s: ShareStyle) { try { localStorage.setItem(KS, s); } catch { /* private mode */ } }
/** The Branded look: style chip and toggles, remembered per browser. */
export type BrandStyle = 'badge' | 'strip' | 'card';
export interface BrandToggles { app: boolean; handle: boolean; workflow: boolean; model: boolean; prompt: boolean; /** Image to layers: "13 layers" on the strip and the framed card */ layers: boolean }
export interface BrandPrefs { style: BrandStyle; toggles: BrandToggles }
const KB = 'ohf:shareBrand';
export const BRAND_DEFAULT: BrandPrefs = { style: 'badge', toggles: { app: true, handle: true, workflow: true, model: true, prompt: false, layers: true } };
export function brandPrefs(): BrandPrefs { try { const v = JSON.parse(localStorage.getItem(KB) || 'null'); if (!v || typeof v !== 'object') return BRAND_DEFAULT;
  const style = (['badge', 'strip', 'card'] as const).includes(v.style) ? v.style : 'badge'; const t = { ...BRAND_DEFAULT.toggles };
  for (const k of Object.keys(t) as (keyof BrandToggles)[]) if (typeof v.toggles?.[k] === 'boolean') t[k] = v.toggles[k]; return { style, toggles: t }; } catch { return BRAND_DEFAULT; } }
/** Share sheet "Where to?": the last destination, remembered per browser (X first). */
const KD = 'ohf:shareDest'; const DESTS = ['x', 'instagram', 'tiktok', 'link', 'download', 'system'] as const;
export function shareDestDefault(): (typeof DESTS)[number] { try { const v = localStorage.getItem(KD) as any; return DESTS.includes(v) ? v : 'x'; } catch { return 'x'; } }
export function setShareDestDefault(d: string) { try { localStorage.setItem(KD, d); } catch { /* private mode */ } }
export function setBrandPrefs(p: BrandPrefs) { try { localStorage.setItem(KB, JSON.stringify(p)); } catch { /* private mode */ } }
/** Share sheet, X caption: "Add #ImaginationIsAllYouNeed" (user decision, 2026-10-25). On by default; the last choice is remembered per browser. */
const KT = 'ohf:shareTag';
export function shareTagDefault(): boolean { try { return localStorage.getItem(KT) !== '0'; } catch { return true; } }
export function setShareTagDefault(on: boolean) { try { on ? localStorage.removeItem(KT) : localStorage.setItem(KT, '0'); } catch { /* private mode */ } }
/** Cost receipt (2026-10-26): "Include cost receipt" in captions, the recipe link and the link card (default on), and the corner tag burned into
 *  the file (default off). Both remembered per browser. */
const KR = 'ohf:share-receipt', KRB = 'ohf:share-receipt-burn';
export function shareReceiptDefault(): boolean { try { return localStorage.getItem(KR) === '1'; } catch { return false; } } // opt-in: a shared result carries no cost line unless the user turns it on
export function setShareReceiptDefault(on: boolean) { try { on ? localStorage.removeItem(KR) : localStorage.setItem(KR, '0'); } catch { /* private mode */ } }
export function shareReceiptBurnDefault(): boolean { try { return localStorage.getItem(KRB) === '1'; } catch { return false; } }
export function setShareReceiptBurnDefault(on: boolean) { try { on ? localStorage.setItem(KRB, '1') : localStorage.removeItem(KRB); } catch { /* private mode */ } }
