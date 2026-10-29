/** Talking Video in the Lip Sync bar (2026-10-27, server/src/shared/talkingVideo.ts): on InfiniteTalk (Wan 2.1) · Comfy Cloud one "Speech" chip
 *  opens a popover with
 *   - a script box: type the words instead of adding speech. Generate first makes the voice on the voice tool (Voiceover: a voice from the list,
 *     or your own sample on a model that clones, so a film character speaks in their own voice), then makes the photo say it. The price on
 *     Generate is both: the voice plus the talking video (an estimate from the script's length until the voice exists);
 *   - the plan for long speech: over 60 s (up to 5 minutes) the speech runs in parts of up to 55 s cut at pauses, each part its own job with the
 *     same photo, prompt and seed, joined with soft cuts over your full speech. Shown before anything runs; over 5 minutes is refused plainly. */
import { useMemo, useRef, useState } from 'react';
import type { UseBarExtra, BarLive } from './types';
import { BarPopover, PopSection, PopNote, Segmented } from '../../../shared/BarPop';
import { tip } from '../../../shared/Tooltip';
import { MicIcon, CloseIcon } from '../../Icons';
import { createJob, getJob } from '../../../api';
import { useDraftField } from '../../../shared/batch1';
import { useToolQuote } from '../../../shared/useToolQuote';
import { shownCredits } from '../../../shared/quote';
import './talkingExtra.css';
import { TV_SINGLE_MAX, TV_MAX_SECONDS, TV_SCRIPT_MAX, planTalkChunks, talkSummary, talkPartCount, scriptSeconds, fmtTalkSeconds } from '../../../../../server/src/shared/talkingVideo';

const IT = 'cloud-infinitetalk';
const usd = (credits: number | null | undefined) => credits == null ? '' : credits === 0 ? 'Free' : `≈ $${(credits / 100).toFixed(2)}`;
/** A quote in words: its price, or "Free sample (≈ $x for real)" when this run is a sample and the real one has a list price. */
const priceOf = (q: any) => { if (!q) return '…'; const cr = shownCredits(q); const list = typeof q.listCredits === 'number' ? q.listCredits : null;
  return cr === 0 && list ? `Free sample · ${usd(list)} for real` : cr == null ? (list ? usd(list) : '…') : usd(cr); };
const audioSeconds = (f: File) => new Promise<number>(res => { const u = URL.createObjectURL(f); const a = document.createElement('audio'); a.preload = 'metadata';
  a.onloadedmetadata = () => { res(a.duration || 0); URL.revokeObjectURL(u); }; a.onerror = () => { res(0); URL.revokeObjectURL(u); }; a.src = u; });
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

export const useTalkingExtra: UseBarExtra = (c0) => {
  const tool = c0.tool; const app: any = tool.app ?? {};
  const dKey = `${tool.id}:vbar:${c0.wf.id}`; const [script, setScript] = useDraftField(dKey, 'talkScript', ''); const [voice, setVoice] = useDraftField(dKey, 'talkVoice', 'narrator-warm'); const [sample, setSample] = useState<File | null>(null);
  const sampleIn = useRef<HTMLInputElement>(null); const itQ = useRef<any>(null); /* the talking video's own part of the quote (wrapQuote sees it) */
  /* the voice models: the voice tool's Voiceover models that run here, in its own order; with a sample, only the ones that clone */
  const voiceModels = useMemo(() => tool.providers.filter((p: any) => (app.providerModes?.[p.id] ?? []).includes('voiceover') && p.runnable !== false), [tool.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const clones = (id: string) => Number(app.voiceCaps?.[id]?.maxVoiceSamples ?? 0) > 0;
  const [pickedModel, setPickedModel] = useState<string>('');
  const pool = sample ? voiceModels.filter((p: any) => clones(p.id)) : voiceModels;
  const ttsProv = pool.some((p: any) => p.id === pickedModel) ? pickedModel : (pool[0]?.id ?? '');
  const ttsName = (pool.find((p: any) => p.id === ttsProv) as any)?.displayName ?? ttsProv;
  const voices: { value: string; label: string }[] = (app.fields ?? []).find((f: any) => f.name === 'voice')?.options?.filter((o: any) => o.value !== 'clone') ?? [];
  const text = script.trim(); const est = scriptSeconds(text);
  /* the voice's own quote (the same voice tool Voiceover job Generate runs first) */
  const ttsQ = useToolQuote(text && ttsProv ? tool.id : null, ttsProv, { types: '["voiceover"]', mode: 'voiceover', prompt: text, voice: sample ? 'clone' : voice, ...(sample ? { voiceAudio: '1' } : {}) });
  const ttsCr = shownCredits(ttsQ);

  const on = (c: BarLive) => c.prov === IT;
  const speechFile = (c: BarLive) => c.files.speech?.[0];
  const useScript = (c: BarLive) => on(c) && !speechFile(c) && !!text;
  const secondsOf = (c: BarLive): number | null => { const f = speechFile(c); if (f?.sec) return f.sec; return useScript(c) ? est : null; };
  const long = (s: number | null) => s != null && s > TV_SINGLE_MAX + 0.05;

  return {
    slotRequired: (s, c) => (s.name === 'speech' && useScript(c) ? false : undefined),
    slotInfo: (s, c) => (s.name === 'speech' && on(c) ? { hint: 'WAV, MP3 or M4A, up to 5 minutes (over 60 s runs in parts) · or type a script', missing: 'Add the speech or type a script' } : undefined),
    quote: c => { if (!on(c)) return {}; const s = secondsOf(c); const o: Record<string, string | null> = { split: long(s) ? '1' : null };
      if (useScript(c)) { o.speechSeconds = String(est); o.speech = '1'; } return o; },
    form: (c): Record<string, string> => (on(c) && long(secondsOf(c)) ? { split: '1' } : {}),
    omit: c => (on(c) && long(secondsOf(c)) ? [] : ['split']),
    wrapQuote: (q, c) => { itQ.current = q; if (!useScript(c) || !q || typeof q.credits !== 'number' || ttsCr == null) return q;
      return { ...q, credits: q.credits + ttsCr, listCredits: typeof q.listCredits === 'number' ? q.listCredits + ttsCr : q.listCredits, talkVoiceCredits: ttsCr }; },
    needs: c => { if (!on(c)) return []; const s = secondsOf(c);
      if (script.length > TV_SCRIPT_MAX) return [{ missing: `Shorten the script to ${TV_SCRIPT_MAX} characters`, group: 'talk' }];
      if (useScript(c) && !ttsProv) return [{ missing: sample ? 'No voice model here can use your sample' : 'No voice model runs here yet', group: 'talk' }];
      if (s != null && s > TV_MAX_SECONDS + 0.05) return [{ missing: `Speech is ${fmtTalkSeconds(s)}: keep it under ${TV_MAX_SECONDS / 60} minutes`, group: 'talk' }];
      return []; },
    /* Script only: make the voice first (the voice tool's Voiceover), then send it as the speech; stop if it came out much longer than estimated */
    beforeSubmit: async (fd, c) => {
      if (!useScript(c)) { if (on(c) && speechFile(c) && text) c.toast('Using your speech file. Remove it to read the script instead.'); return fd; }
      const v = new FormData(); v.append('types', '["voiceover"]'); v.append('prompt', text); v.append('provider', ttsProv); v.append('voice', sample ? 'clone' : voice);
      if (sample) v.append('voiceAudio', sample, sample.name);
      c.toast(`Making the voice first (${ttsName})…`);
      let id: string; try { id = (await createJob(tool.id, v, { showsIssues: true })).id; } catch (e: any) { c.toast(e?.issues?.[0]?.message || e?.message || 'The voice didn’t start. Nothing was charged.', 'error'); return null; }
      let j = await getJob(id); for (let k = 0; k < 900 && (j.status === 'queued' || j.status === 'running'); k++) { await wait(1500); j = await getJob(id); }
      const url = j.outputs?.[0]?.url ?? j.resultUrl; if (j.status !== 'done' || !url) { c.toast(j.error || 'The voice didn’t finish, so the video wasn’t started.', 'error'); return null; }
      const blob = await fetch(url).then(r => r.blob()); const ext = (url.match(/\.([a-z0-9]+)(?:$|\?)/i)?.[1] ?? 'mp3').toLowerCase();
      const file = new File([blob], `script-voice.${ext}`, { type: blob.type || 'audio/mpeg' }); const real = await audioSeconds(file);
      if (real > TV_MAX_SECONDS + 0.05) { c.toast(`The voice came out ${fmtTalkSeconds(real)}, over ${TV_MAX_SECONDS / 60} minutes. It is in your audio; shorten the script.`, 'error'); return null; }
      if (real > est * 1.25 + 3) { c.toast(`The voice came out ${fmtTalkSeconds(real)}, longer than the ${fmtTalkSeconds(est)} estimate, so the price changed. It is in your audio: add it as the speech to check the new price.`, 'warn'); return null; }
      fd.set('speech', file, file.name); if (long(real)) fd.set('split', '1'); else fd.delete('split');
      return fd; },
    chips: c => { if (!on(c)) return null; const s = secondsOf(c); const isOn = c.pop === 'g:talk'; const n = s ? talkPartCount(s) : 0;
      const over = s != null && s > TV_MAX_SECONDS + 0.05;
      const sum = useScript(c) ? (over ? `Script · too long` : `Script · ${fmtTalkSeconds(est)}`) : s ? (over ? `${fmtTalkSeconds(s)} · too long` : n > 1 ? `${fmtTalkSeconds(s)} · ${n} parts` : fmtTalkSeconds(s)) : 'Script';
      return <button key="talk" ref={c.chipRef('talk')} type="button" className={`ic-chip wf-grp wf-fold${isOn ? ' on' : ''}${over || script.length > TV_SCRIPT_MAX ? ' vbar-need' : ''}`} aria-haspopup="dialog" aria-expanded={isOn}
        data-testid="vbar-group-talk" aria-label={`Speech: ${sum}`} {...tip(isOn ? null : 'Type a script, pick the voice, see the plan for long speech')} onClick={() => c.setPop(isOn ? '' : 'g:talk')}>
        <MicIcon size={14} /><span className="wf-grp-l">Speech</span><b>{sum}</b></button>; },
    pops: c => { if (!on(c)) return null; const f = speechFile(c); const s = secondsOf(c); const parts = s ? planTalkChunks([], s) : []; const over = s != null && s > TV_MAX_SECONDS + 0.05;
      return <BarPopover key="talk" open={c.pop === 'g:talk'} anchor={c.anchorOf('talk')} avoid={c.dock} watch={c.dock} placement="top" gap={8} onClose={() => c.setPop('')} label="Speech" testId="vbar-pop-talk" width={380}>
        <PopSection label="Script" aside={f ? undefined : <span className={script.length > TV_SCRIPT_MAX ? 'tv-over' : ''}>{script.length}/{TV_SCRIPT_MAX}</span>} testId="vbar-talk-script">
          {f ? <p className="tv-line" data-testid="vbar-talk-has-speech">Your speech file is used. Remove it from the Speech slot to type a script instead.</p>
            : <textarea className="tv-script" rows={4} value={script} placeholder="Type what they say. We make the voice first, then the photo says it." aria-label="Script" data-testid="vbar-talk-script-input"
              onChange={e => setScript(e.target.value)} />}
          {!f && text && <p className="tv-line" data-testid="vbar-talk-est">About {fmtTalkSeconds(est)} of speech ({text.split(/\s+/).length} words)</p>}
        </PopSection>
        {!f && <PopSection label="Voice" testId="vbar-talk-voice">
          {sample ? <div className="tv-sample" data-testid="vbar-talk-sample"><MicIcon size={14} /><span>{sample.name}</span><small>Your voice sample</small>
            <button type="button" className="tv-x" aria-label="Remove the voice sample" onClick={() => setSample(null)}><CloseIcon size={12} /></button></div>
            : <Segmented label="Voice" value={voice} cols={3} testId="vbar-talk-voices" options={voices.map(o => ({ value: o.value, label: o.label, testId: `vbar-talk-voice-${o.value}` }))} onChange={setVoice} />}
          {voiceModels.some((p: any) => clones(p.id)) && !sample && <button type="button" className="tv-add" data-testid="vbar-talk-add-sample" onClick={() => sampleIn.current?.click()}>+ Use a voice sample (5–15 s), so a character speaks in their own voice</button>}
          <input ref={sampleIn} type="file" hidden accept="audio/*" data-picker-title="Choose a voice sample" onChange={e => { const x = e.target.files?.[0]; if (x) setSample(x); e.currentTarget.value = ''; }} />
        </PopSection>}
        {!f && pool.length > 1 && <PopSection label="Voice model" testId="vbar-talk-models">
          <Segmented label="Voice model" value={ttsProv} cols={2} options={pool.map((p: any) => ({ value: p.id, label: p.displayName ?? p.name, hint: clones(p.id) ? 'Takes your sample' : 'Its own voices', testId: `vbar-talk-model-${p.id}` }))} onChange={setPickedModel} />
        </PopSection>}
        {s != null && <PopSection label="Plan" testId="vbar-talk-plan">
          {over ? <PopNote tone="warn" testId="vbar-talk-over">{fmtTalkSeconds(s)} is over {TV_MAX_SECONDS / 60} minutes. Trim the speech or shorten the script, or make it in two videos.</PopNote>
            : parts.length > 1 ? <>
              <p className="tv-line" data-testid="vbar-talk-summary"><b>{talkSummary(parts)}</b></p>
              <ol className="tv-parts" data-testid="vbar-talk-parts">{parts.map((p, k) => <li key={k}><span>Part {k + 1}</span><em>{fmtTalkSeconds(p.start)}–{fmtTalkSeconds(p.end)}</em></li>)}</ol>
              <p className="tv-line tv-soft">Each part is its own job with the same photo, prompt and seed. The cuts move to the nearest pause; the sound is your full speech.</p></>
            : <p className="tv-line" data-testid="vbar-talk-summary">One part: {fmtTalkSeconds(s)} in one job.</p>}
        </PopSection>}
        {useScript(c) && <PopSection label="Price" testId="vbar-talk-price">
          <p className="tv-line"><span>Voice ({ttsName})</span><em>{priceOf(ttsQ)}</em></p>
          <p className="tv-line"><span>Talking video, InfiniteTalk ({fmtTalkSeconds(est)})</span><em>{priceOf(itQ.current)}</em></p>
          <PopNote>Estimates. The talking video is billed by GPU time on Comfy Cloud; its length follows the voice, so the price is checked again once the voice is made.</PopNote>
        </PopSection>}
      </BarPopover>; },
  };
};
