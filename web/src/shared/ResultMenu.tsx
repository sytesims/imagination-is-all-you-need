/**
 * The result viewer's action menus (More, and the Edit tab's "Use it in…" list), one shared component for Image, Video, Audio and 3D.
 * Rows: an icon, a short label, an optional disabled reason in a tooltip, nothing that wraps or gets cut off. Sections have a small
 * heading; no menu opens another "More". More keeps the file actions; the tools live in the Edit tab (user pick, 2026-10-29).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { tip } from './Tooltip';
import { goClick } from './goToWorkflow';
import { toolHandoffHref } from './workflowLinks';
import { ToolIconFor } from '../ui/Icons';
import { TOOL_TAGLINE } from '../ui/headerMenus';
import './resultMenu.css';

export type MItem = {
  k: string; label: ReactNode; icon: ReactNode; testid: string;
  /** shown as a tooltip, never as a second line */ hint?: string;
  href?: string; download?: string | boolean; onClick?: (e: React.MouseEvent) => void;
  /** disabled, with the reason as its tooltip */ dis?: string | null;
  /** a short state on the right (a check, "Set up your brand first") */ trail?: ReactNode;
  danger?: boolean; pressed?: boolean; keepOpen?: boolean;
  /** its own element (Move to, Trash confirm, GIF): rendered as is, in a row shell with the icon */ node?: ReactNode; /** node is a whole row already (Feature) */ bare?: boolean;
};
export type MSection = { k: string; title?: string; items: MItem[]; raw?: ReactNode };

const closeMenu = (el: Element) => { const d = el.closest('details.rv-more') as HTMLDetailsElement | null; if (d) d.open = false; };

export function MenuRow({ it }: { it: MItem }) {
  const cls = `rm-item${it.danger ? ' rm-danger' : ''}${it.dis ? ' rm-dis' : ''}`;
  const body = <><span className="rm-ic" aria-hidden>{it.icon}</span><span className="rm-label">{it.label}</span>{it.trail != null && <span className="rm-trail">{it.trail}</span>}</>;
  if (it.node && it.bare) return <>{it.node}</>;
  if (it.node) return <div className={`${cls} rm-node`} data-testid={`${it.testid}-row`}>{it.icon != null && <span className="rm-ic" aria-hidden>{it.icon}</span>}<div className="rm-node-in">{it.node}</div></div>;
  if (it.dis) return <span className={cls} role="menuitem" aria-disabled="true" data-testid={it.testid} {...tip(it.dis)}>{body}</span>;
  const click = (e: React.MouseEvent) => { const el = e.currentTarget; it.onClick?.(e); if (!it.keepOpen) closeMenu(el); };
  if (it.href) return <a className={cls} role="menuitem" href={it.href} download={it.download === true ? '' : it.download || undefined} data-testid={it.testid} onClick={click} {...tip(it.hint)}>{body}</a>;
  return <button type="button" className={cls} role="menuitem" aria-pressed={it.pressed} data-testid={it.testid} onClick={click} {...tip(it.hint)}>{body}</button>;
}

/** The menu body: sections with a small heading, a divider between them. */
export function MenuBody({ sections }: { sections: MSection[] }) {
  return <>{sections.map((s, i) => <div key={s.k} className="rm-sec" data-testid={`rm-sec-${s.k}`} role="group" aria-label={s.title ?? s.k}>
    {i > 0 && <hr className="rm-div" />}
    {s.title && <p className="rm-h">{s.title}</p>}
    {s.raw}
    {s.items.map(it => <MenuRow key={it.k} it={it} />)}
  </div>)}</>;
}

/* ---- Tools: where this result can go next (GET /api/jobs/:id/handoff), with the header menu's icons and taglines ---- */
type Target = { toolId: string; name?: string; slot?: string; as?: string };
const DEST: [RegExp, string][] = [[/\/tools\/(h3-video|h3-extend|object-swap|motion-transfer|restyle|reshoot|camera|photo-fx|upscale|footage-fx|two-person-swap|prompt-edit|finish|reframe|remove-bg|sdr-hdr|fps-boost|depth-map|cutout|app-(anime|video|transition|ugc|orbit))/, 'Video'],
  [/\/tools\/(voice|soundtrack|audio|app-(change-voice|translate|music))/, 'Sound'], [/\/tools\/three-d/, '3D'], [/./, 'Picture']];
const TITLE: Record<string, string> = { Picture: 'Edit the picture', Video: 'Make a video', Sound: 'Sound and voice', '3D': '3D' };
/** Plain names: no slashes or lab jargon. */
const nameOf = (t: Target) => (t.name ?? t.toolId).replace(/\s*\/\s*Angles$/, '').replace(/^3D$/, 'Make it 3D').replace(/^Generate Video$/, 'Turn into a video');
function useTargets(jobId: string) {
  const [t, setT] = useState<Target[] | null>(null);
  useEffect(() => { let live = true; setT(null); fetch(`/api/jobs/${encodeURIComponent(jobId)}/handoff`).then(r => r.ok ? r.json() : null).then(d => live && setT(d?.targets ?? [])).catch(() => live && setT([])); return () => { live = false; }; }, [jobId]);
  return t;
}
/** Hand-off rows grouped by where they open (Picture · Video · Sound · 3D), minus tool ids the Edit tab lists as its own rows. */
function toolSections(t: Target[] | null, jobId: string, out: number, onClose: (() => void) | undefined, skip: Set<string>): MSection[] {
  if (!t) return [{ k: 'tools-loading', items: [{ k: 'loading', label: 'Loading tools…', icon: null, testid: 'rm-tools-loading', dis: 'Loading' }] }];
  const seen = new Set<string>(); const by = new Map<string, MItem[]>();
  for (const x of t) {
    if (skip.has(x.toolId) || seen.has(x.toolId)) continue; seen.add(x.toolId);
    const url = toolHandoffHref({ id: x.toolId }, `fromJob=${encodeURIComponent(jobId)}&out=${out}${x.as ? `&as=${x.as}` : ''}`);
    const d = DEST.find(([r]) => r.test(url))![1]; const tag = TOOL_TAGLINE[x.toolId];
    by.set(d, [...(by.get(d) ?? []), { k: x.toolId, label: <><b>{nameOf(x)}</b>{tag && <small>{tag}</small>}</>, icon: <ToolIconFor id={x.toolId} size={16} />, testid: `rv-send-${x.toolId}`, href: url, onClick: goClick(url, onClose) }]);
  }
  return Object.keys(TITLE).filter(d => by.get(d)?.length).map(d => ({ k: `to-${d}`, title: TITLE[d], items: by.get(d)! }));
}

/** The Edit tab's "Use it in…" list: every other tool that takes this result, with an icon and a one-line hint. */
export function ToolsPanel({ jobId, out, onClose, skip }: { jobId: string; out: number; onClose?: () => void; skip: Set<string> }) {
  const t = useTargets(jobId);
  const secs = useMemo(() => toolSections(t, jobId, out, onClose, skip), [t, jobId, out, onClose, skip]);
  const count = t ? secs.reduce((n, s) => n + s.items.length, 0) : null;
  if (t && !count) return null;
  return <section className="rm-tools" data-testid="rvx-other-tools" aria-label="Use it in"><p className="rm-tools-h">Use it in…<small>{count != null ? `${count} tools` : ''}</small></p>
    <div className="rm rm-panel" role="menu"><MenuBody sections={secs} /></div></section>;
}
