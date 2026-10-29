import { KeyboardEvent, ReactNode, useEffect, useState } from 'react';
/** Shared stub-page frame: compact header + body + optional "coming" note. */
export default function Page({ eyebrow, title, lede, children, soon, menuHead }: { eyebrow: string; title: string; lede: string; children?: ReactNode; soon?: string; /** the account-menu pages' shared header (.mh) */ menuHead?: boolean }) {
  return <div className="xpage"><header className={`xpage-head${menuHead ? ' mh' : ''}`}><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p className="lede">{lede}</p>{soon && <span className="xpage-soon">{soon}</span>}</header>{children}</div>;
}
/** Code block with a Copy button (self-host, MCP and API snippets). */
export function Code({ children }: { children: string }) {
  const [done, setDone] = useState<'' | 'ok' | 'err'>('');
  const copy = () => navigator.clipboard?.writeText(children).then(() => setDone('ok'), () => setDone('err')).finally(() => setTimeout(() => setDone(''), 1600));
  return <div className="xcode-wrap"><pre className="xcode"><code>{children}</code></pre>
    <button type="button" className="xcode-copy" data-testid="code-copy" aria-label="Copy code" onClick={copy}>{done === 'ok' ? 'Copied' : done === 'err' ? 'Couldn’t copy' : 'Copy'}</button>
    <span className="sr-only" role="status">{done === 'ok' ? 'Copied to clipboard' : ''}</span></div>;
}
/** B19 (P13/P15): tabs that deep-link (#slug, kept with replaceState) and move with ←/→/Home/End like a real tablist. */
export const slugOf = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export function useTabs(names: string[], def = 0): [number, (i: number) => void, (e: KeyboardEvent<HTMLElement>) => void] {
  const [i, setI] = useState(() => { const h = decodeURIComponent(location.hash.slice(1)); const k = names.findIndex(n => slugOf(n) === h); return k >= 0 ? k : def; });
  useEffect(() => { const f = () => { const h = decodeURIComponent(location.hash.slice(1)); const k = names.findIndex(n => slugOf(n) === h); if (k >= 0) setI(k); }; window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, [names.join('|')]);
  const set = (k: number) => { setI(k); try { history.replaceState(history.state, '', `${location.pathname}${location.search}#${slugOf(names[k])}`); } catch { /* ignore */ } };
  const onKey = (e: KeyboardEvent<HTMLElement>) => { const n = names.length; const k = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1; if (k < 0) return; e.preventDefault(); set(k);
    const btn = (e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role=tab]')[k]; btn?.focus(); };
  return [i, set, onKey];
}
