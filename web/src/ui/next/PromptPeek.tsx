/**
 * "See the exact prompt" (2026-10-23): a small button by Generate opens what this run would send, built by the server's own job code
 * (POST /api/tools/:id/prompt-peek runs the tool's parseInput: Product Shot / Relight compose, Create Image's enhance, style and camera rig).
 * Nothing runs and nothing is charged. It refreshes as you type (debounced). Photos are named "(your photo)"; Upscale has no prompt.
 * Closing: the eye again, ✕, Esc, or any click outside it (the prompt line too). Typing in the prompt never closes it, so it follows the text.
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Popover } from '../../shared/Popover';
import { tip } from '../../shared/Tooltip';
import { rowAnchor } from '../../shared/RowMore';
import { fitPri } from '../../shared/chipFit';
import { scaleText } from '../../shared/scaleText';
import { useBrand, withBrandFields } from '../../shared/brandStore';
import './promptPeek.css';

export interface PeekForm { toolId: string; fields: Record<string, string>; files: Record<string, number>; photo?: { width: number; height: number } | null }
export interface PeekResult { prompt: string | null; shots: { label: string; prompt: string }[] | null; noPrompt: string | null; provider: string; model: string | null;
  promptNote?: string;
  workflowFile: string | null; workflowLine: string | null; /** video: the full workflow credit (the line's tooltip) */ workflowCredit?: string | null; settings: { aspect: string | null; resolution: string | null; quality: string | null; n: number | null; seed: number | null; mode: string | null;
    /** video */ duration?: number | null; audio?: boolean | null; bitrate?: string | null; /** audio */ voice?: string | null; language?: string | null; format?: string | null };
  /** audio: the lyrics sent with the prompt */ lyrics?: string | null;
  /** Brand Kit: the words "Brand: <name>" added after the typed prompt (applied false: nothing added) */ brand?: { id: string; name: string; phrase: string; applied: boolean } | null;
  /** video: the files the run takes, named as yours by the server ("Start frame (your start frame)") */ inputs?: string[] | null;
  /** Nano Banana: the image fields the model request carries (aspectRatio null = left out: the result keeps your photo's shape) */
  request?: { model: string; aspectRatio: string | null; imageSize: string | null; images: number; /** GPT Image: exact size, quality, n per request */ size?: string; quality?: string; n?: number; /** Image to layers */ layers?: boolean;
    /** Qwen Image 3.0 / Wan 2.5: the model's own prompt rewrite and the negative prompt */ promptRewrite?: boolean; negativePrompt?: string | null } | null }
/** "aspectRatio 16:9 · imageSize 2K · 3 images" or, for GPT Image, "size 1024x1536 · quality high · n 1" (the request's own field names, so you can check them before paying). */
export function requestLine(q: NonNullable<PeekResult['request']>): string {
  if (q.layers) return ['layer_decomposition on', q.imageSize ? `size ${q.imageSize}` : '', `${q.images} image${q.images === 1 ? '' : 's'} in`, 'background + layers out'].filter(Boolean).join(' · ');
  if (q.size) return [`size ${q.size}`, q.quality ? `quality ${q.quality}` : '', q.n ? `n ${q.n}` : '', q.images ? `${q.images} image${q.images > 1 ? 's' : ''}` : '',
    q.promptRewrite != null ? `prompt_extend ${q.promptRewrite ? 'on' : 'off'}` : '', q.negativePrompt ? 'negative_prompt sent' : ''].filter(Boolean).join(' · '); // GPT Image: "size 1024x1536 · quality high · n 1"; Seedream / Qwen / Wan: "size 1664x2496"
  return [q.aspectRatio ? `aspectRatio ${q.aspectRatio}` : 'aspectRatio left out (keeps your photo’s shape)', q.imageSize ? `imageSize ${q.imageSize}` : '', q.images ? `${q.images} image${q.images > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
}
type State = { kind: 'idle' | 'loading' } | { kind: 'ok'; r: PeekResult } | { kind: 'invalid'; message: string } | { kind: 'offline' };

const DEBOUNCE_MS = 350;
const QUALITY: Record<string, string> = { low: 'Low', med: 'Medium', high: 'High', quality: 'Best', fast: 'Fast' };
/** "16:9 · 2K · High · 2 images · seed 1234" (only what the run fixes); a video adds "5 s · Sound on" (and a high bitrate). */
export function settingsLine(s: PeekResult['settings']): string {
  return [s.voice ? `Voice ${s.voice}` : '', s.language ? `Language ${s.language}` : '', s.format ? s.format.toUpperCase() : '', s.duration ? `${s.duration} s` : '', s.aspect && s.aspect !== 'auto' ? s.aspect : s.aspect === 'auto' ? 'Auto shape' : '', s.resolution ?? '', s.quality ? QUALITY[s.quality] ?? s.quality : '',
    s.audio === true ? 'Sound on' : s.audio === false ? 'Sound off' : '', s.bitrate === 'high' ? 'High bitrate' : '',
    s.n ? (s.voice !== undefined ? `${s.n} takes` : `${s.n} image${s.n > 1 ? 's' : ''}`) : '', s.seed != null ? `seed ${s.seed}` : 'random seed'].filter(Boolean).join(' · ');
}
/** The eye: "see the exact prompt" (also the result viewer's full-prompt toggle, shared/ResultViewer ViewerPrompt). */
export const PeekIcon = () => <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>;

export function PromptPeek({ form, place, photos, watch }: { /** null: nothing to peek yet (the workflow list is loading) */ form: PeekForm | null; /** where it runs: "Local", "Comfy", "fal"… */ place: string;
  /** the filled photo slots, e.g. ["Product photo"], each shown as "(your photo)" */ photos: string[]; /** the dock: the peek opens above it, never over its controls */ watch?: RefObject<HTMLElement | null> }) {
  const [open, setOpen] = useState(false); const [st, setSt] = useState<State>({ kind: 'idle' }); const [copied, setCopied] = useState(false);
  const btn = useRef<HTMLButtonElement>(null); useBrand(); /* Brand on / off or another kit re-reads the peek */
  const sent = form ? { ...form, fields: withBrandFields(form.toolId, form.fields) } : null; const key = sent ? JSON.stringify(sent) : '';
  useEffect(() => { if (!open || !sent) return; setSt(s => s.kind === 'ok' ? s : { kind: 'loading' }); const ac = new AbortController();
    const t = setTimeout(async () => {
      try { const r = await fetch(`/api/tools/${encodeURIComponent(sent.toolId)}/prompt-peek`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fields: sent.fields, files: sent.files, photo: sent.photo ?? undefined }), signal: ac.signal });
        const b = await r.json().catch(() => null);
        if (r.ok && b?.ok) setSt({ kind: 'ok', r: b }); else if (r.status === 400 && b?.error) setSt({ kind: 'invalid', message: String(b.error) }); else setSt({ kind: 'offline' });
      } catch (e) { if ((e as Error).name !== 'AbortError') setSt({ kind: 'offline' }); } }, DEBOUNCE_MS);
    return () => { clearTimeout(t); ac.abort(); }; }, [open, key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setCopied(false); }, [key]);
  const r = st.kind === 'ok' ? st.r : null;
  const text = r ? (r.shots && r.shots.length > 1 ? r.shots.map(s => `${s.label}: ${s.prompt}`).join('\n\n') : `${r.prompt ?? ''}${r.lyrics ? `\n\nLyrics:\n${r.lyrics}` : ''}`) : '';
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* the text stays selectable */ } };
  return <>
    <button ref={btn} type="button" className={`ic-chip ic-sq ic-peek${open ? ' on' : ''}`} aria-haspopup="dialog" aria-expanded={open} aria-label="See the exact prompt" data-testid="ic-peek" data-row-fold="peek" {...fitPri('low')} {...tip(open ? null : 'See the exact prompt')} disabled={!form} onClick={() => setOpen(o => !o)}><PeekIcon /></button>
    <Popover open={open} anchor={rowAnchor(btn)} avoid={watch} watch={watch} gap={8} align="end" closeButton onClose={() => setOpen(false)} label="What will be sent" testId="ic-pop-peek" className="pk-pop">
      <div className="pk" data-testid="ic-peek-panel" data-state={st.kind}>
        {st.kind === 'offline' ? <p className="pk-msg" role="status">Can’t load the prompt right now</p>
          : st.kind === 'invalid' ? <p className="pk-msg" role="status" data-testid="ic-peek-invalid">{st.message}</p>
          : !r ? <p className="pk-msg" role="status">Loading…</p>
          : <>
            {r.noPrompt ? <p className="pk-msg" data-testid="ic-peek-noprompt">{r.noPrompt}</p>
              : r.shots && r.shots.length > 1 ? <div className="pk-text" tabIndex={0} data-testid="ic-peek-prompt">{r.shots.map((s, i) => <p key={i}><b>{s.label}</b> {s.prompt}</p>)}</div>
              : <div className="pk-text" tabIndex={0} data-testid="ic-peek-prompt">{r.prompt ? r.prompt : <i>(empty prompt)</i>}</div>}
            {r.lyrics && <div className="pk-text pk-lyrics" tabIndex={0} data-testid="ic-peek-lyrics"><b>Lyrics</b>{'\n'}{r.lyrics}</div>}
            {r.promptNote && <p className="pk-msg" data-testid="ic-peek-prompt-note">{r.promptNote}</p>}
            <dl className="pk-meta">
              {r.inputs ? r.inputs.length > 0 && <><dt>Inputs</dt><dd data-testid="ic-peek-photos">{r.inputs.join(', ')}</dd></>
                : photos.length > 0 && <><dt>Photos</dt><dd data-testid="ic-peek-photos">{photos.map(p => `${p} (your photo)`).join(', ')}</dd></>}
              {r.brand && <><dt>Brand</dt><dd data-testid="ic-peek-brand">{r.brand.applied ? <>{r.brand.name}: added “{r.brand.phrase}”</> : `${r.brand.name}: nothing added${r.brand.phrase ? ' (no prompt yet)' : ' (the kit has no colours or mood)'}`}</dd></>}
              <dt>Model</dt><dd data-testid="ic-peek-model">{r.model ?? r.provider}{place ? ` · ${place}` : ''}</dd>
              <dt>Settings</dt><dd data-testid="ic-peek-settings">{r.noPrompt ? (form?.fields.scale ? scaleText(form.fields.scale) : '—') : settingsLine(r.settings)}</dd>
              {r.request && <><dt>Request</dt><dd data-testid="ic-peek-request" {...tip(`Fields sent to ${r.request.model}, ${r.request.layers ? 'one request for every layer' : 'one request per image'}`)}>{requestLine(r.request)}</dd></>}
              <dt>Workflow</dt>{r.workflowCredit !== undefined /* video: the model, mode, place and source in words; the credit and file on hover */ ? <dd data-testid="ic-peek-workflow" {...tip([r.workflowCredit, r.workflowFile].filter(Boolean).join(' · ') || null)}>{r.workflowLine || 'Built in'}</dd>
                : <dd data-testid="ic-peek-workflow" {...tip(r.workflowLine)}>{r.workflowFile ?? r.workflowLine ?? 'Built in'}</dd>}
            </dl>
            <div className="pk-foot"><p>Built by the same code as the run. Nothing runs and nothing is charged.</p>
              {!r.noPrompt && <button type="button" className="pk-copy" data-testid="ic-peek-copy" onClick={copy} disabled={!text}>{copied ? 'Copied' : 'Copy'}</button>}</div></>}
      </div>
    </Popover></>;
}
