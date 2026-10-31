/** Welcome, option B (?welcome=b): one calm panel. Each way to run is a row with its status; opening a row shows only its small form. Shared parts: WelcomeParts.tsx. */
import { useState } from 'react';
import { ChevronDownIcon } from '../Icons';
import type { RunChoice } from '../../shared/runChoices';
import { useWelcome, Sheet, Primary, LookAround, Ready, ChoiceVisual, FORMS, WELCOME_CHOICES, tryFirst } from './WelcomeParts';

export function WelcomeList({ onClose }: { onClose: () => void }) {
  const w = useWelcome(onClose);
  const [open, setOpen] = useState<RunChoice | null>(null); const [useGpu, setUseGpu] = useState(false); const [ways, setWays] = useState<RunChoice[] | null>(null);
  /* your computer counts once the person says "Use it" (or checks their own address), never just because ComfyUI answered */
  const on = (c: RunChoice) => c === 'gpu' ? useGpu && w.connected('gpu') : w.connected(c);
  const count = WELCOME_CHOICES.filter(c => on(c.id)).length;
  const rec: RunChoice | null = w.comfy.state === 'found' ? 'gpu' : w.comfy.state === 'missing' ? 'comfy' : null;
  const pill = (c: RunChoice) => on(c) ? <span className="conn-pill cp-ok">Connected ✓</span>
    : c === 'gpu' && w.comfy.state === 'looking' ? <span className="conn-pill cp-calm"><span className="as-spin" aria-hidden />Looking…</span>
    : c === 'gpu' && w.comfy.state === 'found' ? <span className="conn-pill cp-calm">Found</span> : <span className="conn-pill">Not set</span>;
  const comfyCheck = w.checkAddress; const ww = { ...w, checkAddress: async (u: string) => { setUseGpu(true); await comfyCheck(u); } };

  if (ways) return <Sheet view="ready" w={{ ...w, skip: onClose }} body={<><h3 className="wl-q">You’re ready</h3><p className="wl-sub">Here’s what’s connected.</p><Ready w={w} ways={ways} /></>}
    foot={<><LookAround w={{ ...w, skip: onClose }} /><Primary onClick={tryFirst(onClose)} testId="wl-try">Make your first picture</Primary></>} label="Welcome" testId="welcome-b" />;

  const body = <>
    <div className="wl-progress" data-testid="wl-progress"><div className="wl-progress-t"><b id="wl-q">Connect one way to start</b><span>{count ? `${count} of 3 connected` : 'You can add more later in Settings'}</span></div>
      <div className="wl-bar" aria-hidden>{WELCOME_CHOICES.map((c, i) => <i key={c.id} className={i < count ? 'on' : ''} />)}</div></div>
    <div className="wl-rows" role="list" aria-labelledby="wl-q">{WELCOME_CHOICES.map(c => { const isOpen = open === c.id; const F = FORMS[c.id];
      return <div key={c.id} role="listitem" className={`wl-acc${isOpen ? ' open' : ''}${on(c.id) ? ' ok' : ''}`} data-testid={`wl-row-${c.id}`}>
        <button type="button" className="wl-acc-h" aria-expanded={isOpen} aria-controls={`wl-p-${c.id}`} onClick={() => setOpen(isOpen ? null : c.id)}>
          <ChoiceVisual id={c.id} /><span className="wl-card-copy"><b>{c.name}{rec === c.id && !on(c.id) && <span className="wl-rec" data-testid="wl-rec">Recommended</span>}</b><small>{c.line}</small></span>
          {pill(c.id)}<ChevronDownIcon size={16} className="wl-chev" /></button>
        {isOpen && <div className="wl-acc-p" id={`wl-p-${c.id}`}><F w={c.id === 'gpu' ? ww : w} onUse={c.id === 'gpu' && !useGpu ? () => setUseGpu(true) : undefined} /></div>}
      </div>; })}</div></>;
  const go = async () => { const picked = WELCOME_CHOICES.map(c => c.id).filter(on); if (await w.finish(picked)) setWays(picked); };
  return <Sheet view="list" w={w} body={body} label="Welcome" testId="welcome-b"
    foot={<><span /><span className="wl-foot-r"><LookAround w={w} /><Primary onClick={() => void go()} disabled={!count} busy={w.busy} testId="wl-next">Continue</Primary></span></>} />;
}
