/**
 * Viral templates on the Video bar (2026-10-26; data: server/src/shared/viralTemplates.ts). One hook so VideoStudio only wires it in:
 *  - `lookTab`: the Look picker's "Viral" tab (shared LookPicker / PresetTile), one tile per template.
 *  - `strip`: the template's fill-in row above the prompt (shared TemplateSlots) while a template is on.
 *  - Opening the page with ?template=<id> (an Examples card) applies it once, on the template's model.
 * Picking a template fills the prompt (the first slot selected), clears a camera move or style (the template describes its own camera),
 * and applies its aspect, length and sound where the model allows them. The model in the bar stays unless it makes silent clips: then a
 * toast offers LTX-2.5 22B local instead of switching on its own. Nothing runs until Generate.
 */
import { useEffect, useRef, useState } from 'react';
import { VIRAL_TEMPLATES, viralTemplate, fillTemplate, firstSlotRange, templatePlan, VIRAL_ENGINE, type ViralTemplate } from '../../../../server/src/shared/viralTemplates';
import { TemplateSlots, templateCover, type TemplateState } from '../../shared/TemplateSlots';
import type { LookTab } from '../../shared/LookPicker';

export function useViralTemplates(o: {
  prompt: string; setPrompt: (s: string) => void; promptRef: React.RefObject<HTMLTextAreaElement>;
  provider: string; setProvider: (id: string) => void; engines: string[]; limOf: (id: string) => any;
  setFv: (k: string, v: any) => void; setDuration: (n: number) => void;
  toast: (msg: string, kind?: any, opts?: any) => void; closePop: () => void; engineName: (id: string) => string;
}) {
  const [tpl, setTpl] = useState<TemplateState | null>(null); const t = viralTemplate(tpl?.id);
  /* the template's aspect, length and sound on one model; returns what it set (for the toast) */
  const settle = (t: ViralTemplate, L: any): string[] => { const s = t.settings; const did: string[] = [];
    if (!L?.aspects || L.aspects.includes(s.aspect)) { o.setFv('aspect', s.aspect); did.push(s.aspect); }
    o.setDuration(s.seconds); did.push(`${s.seconds} s`);
    if (L?.audio?.supported && L.audio.toggle !== false) { o.setFv('audio', '1'); did.push('sound on'); }
    return did; };
  /* a model switch resets the length and shape to that model's defaults (AppTool, after this hook's effects): settle again once it has */
  const pending = useRef<ViralTemplate | null>(null);
  useEffect(() => { const t0 = pending.current; if (!t0) return; const id = setTimeout(() => { if (pending.current !== t0) return; pending.current = null; settle(t0, o.limOf(o.provider)); }, 0); return () => clearTimeout(id); }, [o.provider]); // eslint-disable-line react-hooks/exhaustive-deps
  const switchTo = (engine: string, t: ViralTemplate) => { pending.current = t; o.setProvider(engine); };
  const apply = (t: ViralTemplate, fresh = false) => {
    const text = fillTemplate(t); o.setPrompt(text); setTpl({ id: t.id, values: {} });
    o.setFv('cameraMove', ''); o.setFv('videoPreset', ''); o.setFv('intensity', '');
    const lim = o.limOf(o.provider); const plan = templatePlan(t, { soundOk: lim?.audio ? lim.audio.supported !== false : true /* unknown: no nagging */, fresh, engines: o.engines });
    const did = settle(t, plan.switchTo ? o.limOf(plan.switchTo) : lim);
    if (plan.switchTo && plan.switchTo !== o.provider) switchTo(plan.switchTo, t);
    const r = firstSlotRange(t); requestAnimationFrame(() => { const el = o.promptRef.current; if (el && r) { el.focus(); el.setSelectionRange(r[0], r[1]); } });
    if (plan.suggestEngine) o.toast(`${t.name} needs sound: this model makes silent clips`, 'info', { sub: `${o.engineName(plan.suggestEngine)} makes the sound with the video, free on your computer.`, ms: 10000,
      action: { label: `Use ${o.engineName(plan.suggestEngine)}`, onClick: () => switchTo(plan.suggestEngine!, t) } });
    else o.toast(`${t.name} template: ${did.join(' · ')}`, 'info', { sub: 'Change the orange fields above the prompt. Nothing runs until Generate.' });
  };
  /* ?template= from an Examples card: once, on the template's model (the card's ?model= / ?prompt= already filled the bar) */
  const once = useRef(false);
  useEffect(() => { if (once.current) return; once.current = true; const id = new URLSearchParams(location.search).get('template'); const t0 = viralTemplate(id); if (!t0) return; setTimeout(() => apply(t0, true), 0) /* after the page's own ?prompt= prefill */; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /* an emptied prompt ends the template */
  useEffect(() => { if (tpl && !o.prompt.trim()) setTpl(null); }, [o.prompt]); // eslint-disable-line react-hooks/exhaustive-deps

  const lookTab: LookTab = { id: 'viral', label: 'Viral', searchLabel: 'Search templates',
    note: <span>Prompt recipes with sound, made for {o.engineName(VIRAL_ENGINE)} (free, local). They work on other models too.</span>,
    items: VIRAL_TEMPLATES.map(x => ({ id: x.id, label: x.name, sub: `${x.settings.aspect} · ${x.settings.seconds} s · sound`, detail: x.line, testId: `vs-viral-${x.id}`, selected: tpl?.id === x.id,
      image: templateCover(x.id), title: `${x.name}: ${x.line}`, keywords: x.keywords, onPick: () => { o.closePop(); apply(x); } })) };
  const strip = t && tpl ? <TemplateSlots t={t} state={tpl} prompt={o.prompt} setPrompt={o.setPrompt} setState={setTpl} promptRef={o.promptRef} onClose={() => setTpl(null)} testId="vs-tpl" /> : null;
  return { lookTab, strip, active: t ?? null };
}
