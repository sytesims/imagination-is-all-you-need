/**
 * The agent you can watch (2026-10-27): the agent's "hand" on the board. Every op the bridge applies (agentBridge.applyOp) goes through
 * here first, so a person sees WHO is working and WHERE:
 *  - a named orange cursor (a tldraw collaborator presence record written locally: no sync server, never saved with the board) that
 *    glides to each spot, with a short label beside it ("Adding Hero close-up");
 *  - its selection outline on what it just touched (tldraw's collaborator indicator) plus a soft orange glow (fx below);
 *  - a laser loop when it points at something;
 *  - handAtom: where it is working, which FollowAgent eases the camera to and the dock's status line reads.
 * fx: one <style> element with short-lived rules keyed by data-shape-id (cards fade and scale in, a shimmer while the agent writes a
 * card, arrows draw themselves, a pulse on cards waiting for your pick). CSS only on the shapes being touched, so a 30-card board pays
 * nothing for it. Reduced motion (or a hidden tab): no glide, typing, shimmer or pulse; things appear in place with a plain outline.
 */
import { atom, Box, InstancePresenceRecordType, type Editor, type TLInstancePresence, type TLShapeId } from 'tldraw';

export const AGENT_COLOR = '#FF7A1A';
const PRESENCE_ID = InstancePresenceRecordType.createId('ohf-agent');
const AGENT_USER = 'user:ohf-agent';

export const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
/** Animate only when someone can see it: not under reduced motion, not in a hidden tab (timers there crawl). */
export const animOK = () => !reducedMotion() && typeof document !== 'undefined' && document.visibilityState !== 'hidden';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Where the agent works now: `area` is the frame or cards it is filling (page px), `at` its cursor. `key` changes on every move. */
export interface HandState { working: boolean; label: string; at: { x: number; y: number } | null; area: { x: number; y: number; w: number; h: number } | null; key: number }
export const handAtom = atom<HandState>('ohf-agent-hand', { working: false, label: '', at: null, area: null, key: 0 });
const setHand = (p: Partial<HandState>) => handAtom.update((h) => ({ ...h, ...p, key: Date.now() }));

// ---------------------------------------------------------------- fx: short CSS rules on the shapes being touched
const rules = new Map<string, string>();
let styleEl: HTMLStyleElement | null = null; let flushQueued = false;
function flush() {
  flushQueued = false; if (typeof document === 'undefined') return;
  if (!styleEl || !styleEl.isConnected) { styleEl = document.createElement('style'); styleEl.id = 'ohf-agent-fx'; document.head.appendChild(styleEl); }
  styleEl.textContent = [...rules.values()].join('\n');
}
function setRule(key: string, css: string | null, ms?: number) {
  if (css == null) rules.delete(key); else rules.set(key, css);
  if (!flushQueued) { flushQueued = true; queueMicrotask(flush); }
  if (css != null && ms) window.setTimeout(() => { if (rules.get(key) === css) setRule(key, null); }, ms);
}
const sel = (id: string) => `.tl-shape[data-shape-id="${id.replace(/"/g, '')}"]`;
export const fx = {
  /** a new shape fades and scales in */
  enter(id: string) { if (!animOK()) return; setRule(`enter:${id}`, `${sel(id)} > *{animation:ohf-enter 560ms cubic-bezier(.2,.9,.25,1.12) both}`, 900); },
  /** a batch arrives as one wave (2026-10-27): each shape fades and scales in a beat after the one before (45 ms), its arrows draw once
   *  their cards are in. Under reduced motion (or a hidden tab) everything is simply there. */
  wave(ids: string[], arrows: string[] = [], stepMs = 45) {
    if (!animOK()) return; const n = ids.length; const end = n * stepMs + 520;
    ids.forEach((id, i) => setRule(`enter:${id}`, `${sel(id)} > *{animation:ohf-enter 520ms cubic-bezier(.2,.9,.25,1.12) ${i * stepMs}ms both}`, end + 400));
    for (const a of arrows) setRule(`hide:${a}`, `${sel(a)}{opacity:0}`, end + 2000);
    window.setTimeout(() => { for (const a of arrows) { setRule(`hide:${a}`, null); fx.drawArrow(a); } }, Math.min(end, 2400));
  },
  /** a soft shimmer sweeps the card while the agent writes it */
  writing(id: string, on: boolean) { if (on && !animOK()) return; setRule(`write:${id}`, on ? `${sel(id)} .nf{--ohf-write:1}${sel(id)} .nf::after{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(105deg,transparent 30%,rgba(255,170,90,.13) 45%,rgba(255,255,255,.10) 50%,rgba(255,170,90,.13) 55%,transparent 70%);background-size:250% 100%;animation:ohf-shimmer 1.1s linear infinite}` : null); },
  /** a gentle orange glow on what the agent just touched (a plain outline under reduced motion) */
  touched(id: string) {
    if (!animOK()) { setRule(`touch:${id}`, `${sel(id)} > *{outline:2px solid rgba(255,122,26,.75);outline-offset:4px;border-radius:18px}`, 1600); return; }
    setRule(`touch:${id}`, `${sel(id)} > *{animation:ohf-touch 1.8s ease-out both;border-radius:18px}`, 1900);
  },
  /** an arrow draws itself from its start to its end */
  drawArrow(id: string) {
    if (!animOK()) return;
    const tryDraw = (n: number) => {
      const paths = [...document.querySelectorAll<SVGPathElement>(`${sel(id)} path`)];
      if (!paths.length) { if (n < 8) requestAnimationFrame(() => tryDraw(n + 1)); return; }
      for (const p of paths) p.setAttribute('pathLength', '1');
      setRule(`arrow:${id}`, `${sel(id)} path{stroke-dasharray:1 1;animation:ohf-draw 700ms cubic-bezier(.4,0,.2,1) both}`, 800);
      window.setTimeout(() => { for (const p of paths) p.removeAttribute('pathLength'); }, 820);
    };
    requestAnimationFrame(() => tryDraw(0));
  },
  /** cards waiting for your pick breathe (a still outline under reduced motion) until the choice is made */
  pick(ids: string[]) {
    setRule('pick', ids.length ? ids.map((id) => reducedMotion() ? `${sel(id)} > *{outline:2px dashed rgba(255,122,26,.8);outline-offset:6px;border-radius:20px}` : `${sel(id)} > *{animation:ohf-pulse 2.2s ease-in-out infinite;border-radius:18px;cursor:pointer}`).join('\n') : null);
  },
  chosen(id: string) { setRule('chosen', `${sel(id)} > *{box-shadow:0 0 0 2px #FF7A1A,0 0 40px rgba(255,122,26,.35);border-radius:18px}`, 2600); },
};

// ---------------------------------------------------------------- the hand (presence cursor)
let agentName = 'Agent';
/** The connected agent's name ("Claude"), or Agent for the built-in one. */
export function setAgentName(n: string | null | undefined) { agentName = (n || 'Agent').slice(0, 24); }

class Hand {
  pos: { x: number; y: number } | null = null; private idle = 0; private gone = 0; private glideId = 0;
  constructor(readonly editor: Editor) {}
  private rec(): TLInstancePresence | undefined { return this.editor.store.get(PRESENCE_ID) as TLInstancePresence | undefined; }
  private put(p: Partial<TLInstancePresence>) {
    const e = this.editor; if (e.isDisposed) return;
    const cur = this.rec();
    const next = InstancePresenceRecordType.create({ ...(cur ?? {}), id: PRESENCE_ID, userId: AGENT_USER as any, userName: agentName, color: AGENT_COLOR, currentPageId: e.getCurrentPageId(), ...p, lastActivityTimestamp: Date.now() } as any);
    e.store.mergeRemoteChanges(() => e.store.put([next]));
  }
  private arm() {
    window.clearTimeout(this.idle); window.clearTimeout(this.gone);
    /* after a few quiet seconds the label and outline fade; after a while the cursor leaves */
    this.idle = window.setTimeout(() => { this.put({ chatMessage: '', selectedShapeIds: [], scribbles: [] }); setHand({ working: false, label: '' }); }, 4200);
    this.gone = window.setTimeout(() => this.leave(), 45_000);
  }
  /** Glide the cursor to a page point (instant when motion is off). */
  async glideTo(to: { x: number; y: number }, label?: string, ms = 520) {
    const id = ++this.glideId; const from = this.pos ?? this.entry(to);
    if (label != null) setHand({ working: true, label }); setHand({ at: to });
    if (!animOK() || Math.hypot(to.x - from.x, to.y - from.y) < 2) { this.pos = to; this.put({ cursor: { x: to.x, y: to.y, type: 'default', rotation: 0 }, ...(label != null ? { chatMessage: label } : {}) }); this.arm(); return; }
    if (label != null) this.put({ chatMessage: label });
    const dist = Math.hypot(to.x - from.x, to.y - from.y); const dur = Math.min(900, Math.max(280, ms * Math.min(1.6, 0.55 + dist / 1400)));
    const t0 = performance.now();
    await new Promise<void>((done0) => {
      /* a backgrounded pane may stop animation frames: never let the agent wait on them (snap to the end after the glide's time) */
      let over = false; const done = () => { if (over) return; over = true; window.clearTimeout(safety); done0(); };
      const safety = window.setTimeout(() => { if (id === this.glideId && !this.editor.isDisposed) { this.pos = to; this.put({ cursor: { x: to.x, y: to.y, type: 'default', rotation: 0 } }); } done(); }, dur + 160);
      const step = (now: number) => {
        if (over) return;
        if (id !== this.glideId || this.editor.isDisposed) return done();
        const t = Math.min(1, (now - t0) / dur); const k = ease(t);
        /* a slight arc, like a hand moving across a table */
        const lift = Math.sin(Math.PI * t) * Math.min(60, dist * 0.08);
        const p = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k - lift };
        this.pos = p; this.put({ cursor: { x: p.x, y: p.y, type: 'default', rotation: 0 } });
        if (t < 1 && document.visibilityState !== 'hidden') requestAnimationFrame(step); else { this.pos = to; this.put({ cursor: { x: to.x, y: to.y, type: 'default', rotation: 0 } }); done(); }
      };
      requestAnimationFrame(step);
    });
    this.arm();
  }
  /** The first appearance: from the board's top-left corner of the view, so the cursor visibly arrives. */
  private entry(to: { x: number; y: number }) { const vb = this.editor.getViewportPageBounds(); return vb.containsPoint(to) ? { x: vb.minX + vb.w * 0.08, y: vb.minY + vb.h * 0.1 } : to; }
  /** A short label beside the cursor. `stay`: keep it (and the cursor) until the next step, e.g. while it waits for your pick. */
  say(label: string, stay = false) { setHand({ working: true, label }); this.put({ chatMessage: label }); if (stay) { window.clearTimeout(this.idle); window.clearTimeout(this.gone); } else this.arm(); }
  touch(ids: string[]) { const live = ids.filter((id) => this.editor.getShape(id as TLShapeId)) as TLShapeId[]; this.put({ selectedShapeIds: live }); for (const id of live) { if (rules.has(`enter:${id}`)) window.setTimeout(() => fx.touched(id), 600); else fx.touched(id); } this.arm(); }
  /** A laser loop around some shapes (or a point). */
  async point(box: Box, label?: string) {
    await this.glideTo({ x: box.maxX - Math.min(40, box.w * 0.15), y: box.minY + Math.min(36, box.h * 0.2) }, label);
    if (!animOK()) return;
    const cx = box.center.x, cy = box.center.y, rx = box.w / 2 + 28, ry = box.h / 2 + 28; const n = 36; const points: { x: number; y: number; z: number }[] = [];
    const sid = `agent-laser-${Date.now()}`;
    for (let i = 0; i <= n + 6; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2; points.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, z: 0.5 });
      this.put({ scribbles: [{ id: sid, points: [...points], size: 6, color: 'laser', opacity: 0.8, state: 'active', delay: 0, shrink: 0, taper: false }] as any });
      await sleep(16);
    }
    await sleep(700); this.put({ scribbles: [] });
  }
  leave() { window.clearTimeout(this.idle); window.clearTimeout(this.gone); this.pos = null; setHand({ working: false, label: '', at: null });
    if (!this.editor.isDisposed && this.rec()) this.editor.store.mergeRemoteChanges(() => this.editor.store.remove([PRESENCE_ID])); }
}

const hands = new WeakMap<Editor, Hand>();
export function handOf(editor: Editor): Hand { let h = hands.get(editor); if (!h) { h = new Hand(editor); hands.set(editor, h); } return h; }
/** Frame the camera on this page area (FollowAgent eases to it). */
export function workArea(b: { x: number; y: number; w: number; h: number } | null) { setHand({ area: b }); }
/** The bounds of some shapes, as a plain box (null when none are on the board). */
export function boundsOf(editor: Editor, ids: string[]): Box | null {
  const bs = ids.map((id) => editor.getShapePageBounds(id as TLShapeId)).filter(Boolean) as Box[]; return bs.length ? Box.Common(bs) : null;
}
