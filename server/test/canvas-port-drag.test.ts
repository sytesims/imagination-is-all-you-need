// Canvas port drags (B3, 2026-10-31): a drag let go over a node's controls (Compare's body, a card's fields) got stuck, because those
// controls stop pointerup from bubbling and the drag listened in the bubble phase. listenPortDrag listens in the capture phase.
// Run: npx tsx test/canvas-port-drag.test.ts   (no server, no network, no browser)
import assert from 'node:assert/strict';
import { listenPortDrag } from '../../web/src/canvas/nodeFrameModel.ts';

/* a window stand-in with a body inside it, so an event can travel capture → target → bubble and a control can stop it */
const win = new EventTarget(); const body = new EventTarget();
const fire = (type: string, extra: Record<string, unknown> = {}, stopAtTarget = false) => {
  const ev = Object.assign(new Event(type, { bubbles: true }), extra); let stopped = false;
  const run = (t: EventTarget, capture: boolean) => { const ls = ((t as any).__ls ?? []).filter((l: any) => l.capture === capture && l.type === type); for (const l of ls) l.f(ev); };
  run(win, true); run(body, false); if (stopAtTarget) stopped = true; if (!stopped) run(win, false);
};
for (const t of [win, body]) { (t as any).__ls = []; t.addEventListener = ((type: string, f: any, capture?: boolean) => (t as any).__ls.push({ type, f, capture: !!capture })) as any;
  t.removeEventListener = ((type: string, f: any, capture?: boolean) => { (t as any).__ls = (t as any).__ls.filter((l: any) => !(l.type === type && l.f === f && l.capture === !!capture)); }) as any; }

const log: string[] = [];
const off = listenPortDrag(win as any, { move: () => log.push('move'), up: (e) => log.push(`up:${e.type}`), cancel: () => log.push('cancel') });
fire('pointermove'); fire('pointerup', {}, true); // a control (Compare's body) stops the pointerup at its target: the drag still ends
assert.deepEqual(log, ['move', 'up:pointerup']);
fire('pointercancel', {}, true); assert.equal(log.at(-1), 'up:pointercancel');
fire('keydown', { key: 'a' }); assert.equal(log.at(-1), 'up:pointercancel'); // other keys do nothing
fire('keydown', { key: 'Escape' }); assert.equal(log.at(-1), 'cancel');
log.length = 0; const blurField = Object.assign(new Event('blur'), {}); Object.defineProperty(blurField, 'target', { value: body });
(win as any).__ls.filter((l: any) => l.type === 'blur').forEach((l: any) => l.f(blurField)); assert.deepEqual(log, []); // a field losing focus: not the window
const blurWin = new Event('blur'); Object.defineProperty(blurWin, 'target', { value: win });
(win as any).__ls.filter((l: any) => l.type === 'blur').forEach((l: any) => l.f(blurWin)); assert.deepEqual(log, ['cancel']); // the window losing focus ends it
off(); assert.equal((win as any).__ls.length, 0, 'cleanup removes every listener');
console.log('ok canvas port drag: drops over node controls end the drag; Esc and window blur cancel it');
process.exit(0); // the canvas modules keep timers alive in node
