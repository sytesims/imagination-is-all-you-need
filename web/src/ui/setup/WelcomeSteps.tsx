/** Welcome, option A (?welcome=a): three short steps. 1 How → 2 Connect → 3 Ready. Shared parts: WelcomeParts.tsx. */
import { useState } from 'react';
import { CHECK } from '../../shared/checkGlyph';
import type { RunChoice } from '../../shared/runChoices';
import { useWelcome, Sheet, Primary, LookAround, Ready, ChoiceVisual, FORMS, WELCOME_CHOICES, tryFirst } from './WelcomeParts';

const STEPS = ['How', 'Connect', 'Ready'] as const;
const CONNECT_TITLE: Record<RunChoice, string> = { gpu: 'Connect your computer', comfy: 'Add your Comfy key', direct: 'Add your keys' };

export function WelcomeSteps({ onClose }: { onClose: () => void }) {
  const w = useWelcome(onClose);
  const [step, setStep] = useState(0); const [pick, setPick] = useState<RunChoice[]>([]); const [ways, setWays] = useState<RunChoice[]>([]);
  /* Recommended: your computer when ComfyUI answers here, else Comfy Cloud. Nothing until the look is done. */
  const rec: RunChoice | null = w.comfy.state === 'found' ? 'gpu' : w.comfy.state === 'missing' ? 'comfy' : null;
  const toggle = (c: RunChoice) => setPick(p => p.includes(c) ? p.filter(x => x !== c) : WELCOME_CHOICES.map(x => x.id).filter(x => x === c || p.includes(x)));
  const working = pick.filter(w.connected);
  const indicator = <ol className="wl-steps" aria-label={`Step ${step + 1} of 3`} data-testid="wl-steps">{STEPS.map((s, i) => <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}><span>{s}</span></li>)}</ol>;

  const gpuLine = w.comfy.state === 'looking' ? <span className="wl-mini"><span className="as-spin" aria-hidden />Looking…</span>
    : w.comfy.state === 'found' ? <span className="wl-mini ok"><span className="wl-tick" aria-hidden>{CHECK}</span>Found on this computer</span> : null;
  const body = step === 0 ? <>
    <h3 className="wl-q" id="wl-q">How do you want to start?</h3>
    <p className="wl-sub">Pick one or more. You see the price before every run.</p>
    <div className="wl-cards" role="group" aria-labelledby="wl-q">{WELCOME_CHOICES.map(c => { const on = pick.includes(c.id);
      return <button key={c.id} type="button" className={`wl-card${on ? ' on' : ''}`} aria-pressed={on} onClick={() => toggle(c.id)} data-testid={`wl-opt-${c.id}`}>
        <ChoiceVisual id={c.id} /><span className="wl-card-copy"><b>{c.name}{rec === c.id && <span className="wl-rec" data-testid="wl-rec">Recommended</span>}</b><small>{c.line}</small>{c.id === 'gpu' && gpuLine}</span>
        <span className="wl-check" aria-hidden>{on && CHECK}</span></button>; })}</div></>
    : step === 1 ? <>
      <h3 className="wl-q">{pick.length === 1 ? CONNECT_TITLE[pick[0]] : 'Connect what you picked'}</h3>
      <p className="wl-sub">{pick.length > 1 ? 'One is enough to start. You can add the rest later in Settings.' : 'You can change this later in Settings.'}</p>
      {pick.map(id => { const c = WELCOME_CHOICES.find(x => x.id === id)!; const F = FORMS[id];
        return <section key={id} className="wl-part">{pick.length > 1 && <h4><ChoiceVisual id={id} />{c.name}{w.connected(id) && <span className="conn-pill cp-ok">Connected</span>}</h4>}<F w={w} /></section>; })}</>
    : <><h3 className="wl-q">You’re ready</h3><p className="wl-sub">Here’s what’s connected.</p><Ready w={w} ways={ways} /></>;

  const next = async () => { if (step === 0) { setStep(1); return; }
    if (step === 1) { const ok = await w.finish(pick); if (ok) { setWays(working); setStep(2); } } };
  const foot = step === 2
    ? <><LookAround w={{ ...w, skip: onClose }} /><Primary onClick={tryFirst(onClose)} testId="wl-try">Make your first picture</Primary></>
    : <>{step > 0 ? <button type="button" className="btn btn-sm btn-ghost" onClick={() => setStep(step - 1)} data-testid="wl-back">Back</button> : <span />}
      <span className="wl-foot-r"><LookAround w={w} />
        <Primary onClick={() => void next()} disabled={step === 0 ? !pick.length : !working.length} busy={w.busy} testId="wl-next">Continue</Primary></span></>;
  /* on Ready everything is saved: Escape and "Look around first" only close */
  return <Sheet w={step === 2 ? { ...w, skip: onClose } : w} step={indicator} view={String(step)} body={body} foot={foot} label="Welcome" testId="welcome-a" />;
}
