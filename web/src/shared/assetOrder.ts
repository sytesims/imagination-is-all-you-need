/** C3: the Assets list order (what's on screen, in order) for the result overlay's prev/next, plus the tile that opened it. */
let order: string[] = []; let opener = ''; let source = '';
/** `src` names the list (assets, community…): the overlay only steps through the list it was opened from. */
export const setAssetOrder = (ids: string[], src = 'assets') => { if (ids.join() === order.join() && src === source) return; order = ids; source = src; dispatchEvent(new Event('ohf:asset-order')); };
export const getOrderSource = () => source;
export const getAssetOrder = () => order;
/** The tile that opened the overlay, and which list it belongs to. Taken once (#18: a later deep link must not focus an old tile). */
let openerSrc = '';
export const setOpener = (id: string, src = 'assets') => { opener = id; openerSrc = src; };
export const takeOpener = (): { id: string; src: string } => { const o = { id: opener, src: openerSrc }; opener = ''; openerSrc = ''; return o; };
