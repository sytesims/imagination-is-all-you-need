/**
 * Undo and redo for the React Flow board (2026-11-06; our own design, written from the idea in the plan, section 5.5). Pure: no React,
 * no store, no library; the store hands every change to `write` and applies what `undo` / `redo` give back.
 *
 * Patch-based, never whole snapshots. Every recorded change keeps, per node or link and per FIELD it touched (x, y, parentId, index,
 * props.<key>, meta.<key>), the value before and after. Undo puts back only those fields, so anything else written to the same node in
 * the meantime stays. That is what keeps a finished job's result safe:
 *  - a job (and anything else written with history 'ignore') is never recorded, so no undo step holds its fields;
 *  - a node whose job fields were written that way (JOB_FIELDS) is "kept": undoing the step that created it leaves it on the board,
 *    so an Undo never takes a result away with the card it landed on.
 * Steps: mark(label) starts one (a drag marks once at its start, so a whole drag is one step; an agent op marks with the op's name).
 * Changes with no mark before them join the step that is open. 100 steps at most; a new recorded change clears redo.
 */

/** One node or link as the store keeps it (plain JSON; props and meta are objects). */
export type Entity = Record<string, any> & { id: string };
/** 'n' a node, 'l' a link */
export type Kind = 'n' | 'l';
/** What to apply: put back a whole entity (or remove it with null), or set some of its fields. */
export type Apply = { kind: Kind; id: string; whole?: Entity | null; fields?: Record<string, unknown> };

/** Fields that only a run writes: an ignored write to any of these makes the node a kept result. */
export const JOB_FIELDS = ['props.takes', 'props.status', 'props.jobId'];
const WHOLE = '*';
const MAX_STEPS = 100;

/** The changed fields between two versions of one entity (top-level keys; props and meta one level deeper). */
export function fieldDiff(a: Entity, b: Entity): Record<string, [unknown, unknown]> {
  const out: Record<string, [unknown, unknown]> = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k === 'id') continue;
    if ((k === 'props' || k === 'meta') && isObj(a[k]) && isObj(b[k])) {
      for (const p of new Set([...Object.keys(a[k]), ...Object.keys(b[k])])) if (!same(a[k][p], b[k][p])) out[`${k}.${p}`] = [a[k][p], b[k][p]];
    } else if (!same(a[k], b[k])) out[k] = [a[k], b[k]];
  }
  return out;
}
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
/** equal by value for plain JSON (props hold arrays and objects) */
const same = (a: unknown, b: unknown): boolean => a === b || (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b));

/** Set some fields on an entity (the inverse of fieldDiff). `undefined` removes a props / meta key. */
export function withFields(e: Entity, fields: Record<string, unknown>): Entity {
  const out: Entity = { ...e }; let props = e.props, meta = e.meta;
  for (const [path, v] of Object.entries(fields)) {
    const dot = path.indexOf('.');
    if (dot < 0) { if (v === undefined) delete out[path]; else out[path] = v; continue; }
    const top = path.slice(0, dot), key = path.slice(dot + 1);
    if (top === 'props') { if (props === e.props) props = { ...(e.props ?? {}) }; if (v === undefined) delete props[key]; else props[key] = v; }
    else if (top === 'meta') { if (meta === e.meta) meta = { ...(e.meta ?? {}) }; if (v === undefined) delete meta[key]; else meta[key] = v; }
  }
  if (props !== e.props) out.props = props; if (meta !== e.meta) out.meta = meta;
  return out;
}

type Change = { before: unknown; after: unknown };
interface Step { id: string; label: string; changes: Map<string, Map<string, Change>> /* `${kind}:${id}` → field → change */ }
const keyOf = (kind: Kind, id: string) => `${kind}:${id}`;
const split = (k: string): [Kind, string] => [k[0] as Kind, k.slice(2)];
let seq = 0;

export class History {
  private done: Step[] = []; private undone: Step[] = []; private open: Step = this.fresh('');
  /** nodes whose job fields were written outside history: undoing their creation leaves them */
  private kept = new Set<string>();
  private fresh(label: string): Step { return { id: `mark:${++seq}`, label, changes: new Map() }; }

  /** Start a new step; returns its mark. */
  mark(label: string): string { if (this.open.changes.size || this.open.label) this.push(this.open); this.open = this.fresh(label); return this.open.id; }

  /** One write to one entity. `record` false: a job / ignored write (only remembered when it touches job fields). */
  write(kind: Kind, before: Entity | null, after: Entity | null, record: boolean) {
    const id = (before ?? after)?.id; if (!id) return;
    if (!record) {
      if (kind === 'n' && after && (!before || JOB_FIELDS.some((f) => { const d = fieldDiff(before, after); return f in d; }))) this.kept.add(id);
      return;
    }
    this.undone = [];
    const k = keyOf(kind, id); let m = this.open.changes.get(k); if (!m) { m = new Map(); this.open.changes.set(k, m); }
    const whole = m.get(WHOLE);
    if (!before || !after) { /* created or removed: the whole entity */
      if (whole) { whole.after = after; if (whole.before === null && after === null) this.open.changes.delete(k); }
      else m.set(WHOLE, { before, after });
      return;
    }
    if (whole && whole.before === null) { whole.after = after; return; } /* made in this step: redo puts back its latest version */
    for (const [f, [b, a]] of Object.entries(fieldDiff(before, after))) { const c = m.get(f); if (c) c.after = a; else m.set(f, { before: b, after: a }); }
  }

  canUndo() { return this.open.changes.size > 0 || this.done.some((s) => s.changes.size > 0); }
  canRedo() { return this.undone.length > 0; }
  /** What to apply to go back one step (null: nothing to undo). */
  undo(): { label: string; apply: Apply[] } | null {
    if (this.open.changes.size) this.push(this.open); this.open = this.fresh('');
    let s = this.done.pop(); while (s && !s.changes.size) s = this.done.pop(); /* marks with nothing in them (a click that didn't drag) */
    if (!s) return null; this.undone.push(s); return { label: s.label, apply: this.reverse(s) };
  }
  /** What to apply to go forward again (null: nothing to redo). */
  redo(): { label: string; apply: Apply[] } | null {
    const s = this.undone.pop(); if (!s) return null; if (this.open.changes.size) this.push(this.open); this.open = this.fresh('');
    this.done.push(s); return { label: s.label, apply: this.forward(s) };
  }
  /** Back to a mark, dropping it and everything after (an all-or-nothing batch that failed). Not redoable. */
  bailTo(mark: string): Apply[] {
    const out: Apply[] = [];
    if (this.open.id === mark) { out.push(...this.reverse(this.open)); this.open = this.fresh(''); return out; }
    const i = this.done.findIndex((s) => s.id === mark); if (i < 0) return out;
    out.push(...this.reverse(this.open)); this.open = this.fresh('');
    for (const s of this.done.splice(i).reverse()) out.push(...this.reverse(s));
    this.undone = []; return out;
  }
  clear() { this.done = []; this.undone = []; this.open = this.fresh(''); this.kept.clear(); }
  /** the open step's label and how many are done (for checks) */
  get depth() { return this.done.length + (this.open.changes.size ? 1 : 0); }

  private push(s: Step) {
    /* empty marks (a click that didn't drag) don't pile up: one empty mark replaces the empty one before it */
    const top = this.done[this.done.length - 1]; if (!s.changes.size && top && !top.changes.size) this.done.pop();
    this.done.push(s); while (this.done.length > MAX_STEPS) this.done.shift();
  }
  /** links first when putting back (their nodes come back before them, see the store), fields after the whole entity */
  private reverse(s: Step): Apply[] {
    const out: Apply[] = [];
    for (const [k, m] of [...s.changes].reverse()) {
      const [kind, id] = split(k); const whole = m.get(WHOLE);
      if (whole) {
        if (whole.before === null && kind === 'n' && this.kept.has(id)) continue; /* a result landed on it since: it stays */
        out.push({ kind, id, whole: whole.before as Entity | null });
      }
      const fields: Record<string, unknown> = {}; for (const [f, c] of m) if (f !== WHOLE) fields[f] = c.before;
      if (Object.keys(fields).length && !(whole && whole.before === null)) out.push({ kind, id, fields });
    }
    return out;
  }
  private forward(s: Step): Apply[] {
    const out: Apply[] = [];
    for (const [k, m] of s.changes) {
      const [kind, id] = split(k); const whole = m.get(WHOLE);
      const fields: Record<string, unknown> = {}; for (const [f, c] of m) if (f !== WHOLE) fields[f] = c.after;
      if (Object.keys(fields).length && !(whole && whole.before === null)) out.push({ kind, id, fields });
      if (whole) out.push({ kind, id, whole: whole.after as Entity | null });
    }
    return out;
  }
}
