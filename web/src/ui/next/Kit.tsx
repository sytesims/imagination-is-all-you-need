import { useState } from 'react';
import { EXAMPLES } from '../examples';
import { DraftToggle, KeepAudioToggle, UpscaleButton, PrecheckWarnings, MOCK_WARNINGS, PromptEnhance, StylePresets, AudioModeTabs, AudioMode } from './Gen';
import MaskPaint from './MaskPaint';

import GenerateButton from '../b1/GenerateButton';
import QualitySelect from '../b1/QualitySelect';
import { useLocalFree, LocalFreeHeadline } from './LocalFree';
/** /kit.html?s=n-<item>: mock-prop showcase for the behaviour-spec batch. */
const Q = [{ value: '480p', label: '480p', desc: 'Fastest', price: 40 }, { value: '720p', label: '720p', desc: 'Balanced', price: 105 }, { value: '1080p', label: '1080p', desc: 'Best', price: 260 }];
const Box = ({ t, children }: { t: string; children: React.ReactNode }) => <section className="ws-panel nk-box"><h3 className="field">{t}</h3>{children}</section>;
export default function NextKit({ s }: { s: string }) {
  const [d, setD] = useState(true); const [ka, setKa] = useState(true); const [p, setP] = useState('a red vintage car on a coastal road'); const [st, setSt] = useState('film'); const [am, setAm] = useState<AudioMode>('voiceover'); const [q, setQ] = useState('720p');
  useLocalFree();
  const wrap = (c: React.ReactNode, w = 420) => <div style={{ maxWidth: w, margin: '24px auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>{c}</div>;
  if (s === 'n-draft') return wrap(<><Box t="Draft"><DraftToggle on={d} onChange={setD} /><GenerateButton ready price={d ? 40 : 105} onClick={() => 0} /></Box><Box t="Result (draft 480p)"><video src={EXAMPLES[2].src} poster={EXAMPLES[2].poster} muted style={{ width: '100%', borderRadius: 10 }} /><div className="row" style={{ gap: 8 }}><UpscaleButton jobId="mock" price={65} /></div></Box></>);
  if (s === 'n-precheck') return wrap(<Box t="Before you generate"><PrecheckWarnings warnings={MOCK_WARNINGS} /></Box>);
  if (s === 'n-audio-keep') return wrap(<Box t="Audio"><KeepAudioToggle on={ka} onChange={setKa} /></Box>);
  if (s === 'n-image') return wrap(<><Box t="Prompt"><textarea className="dir-prompt" value={p} onChange={e => setP(e.target.value)} /><div className="row"><PromptEnhance value={p} onChange={setP} /></div></Box><Box t="Style"><StylePresets value={st} onChange={setSt} styles={[['film', 'Film'], ['anime', 'Anime'], ['clay', 'Clay'], ['noir', 'Noir'], ['product', 'Product'], ['watercolour', 'Watercolour']].map(([id, label], i) => ({ id, label, poster: EXAMPLES[i].poster }))} /></Box></>);
  if (s === 'n-mask') return wrap(<Box t="Inpaint"><MaskPaint src={EXAMPLES[4].poster} /></Box>, 640);
  if (s === 'n-audio-modes') return wrap(<Box t="Audio"><AudioModeTabs value={am} onChange={setAm} /><p className="helper">{am === 'voiceover' ? 'Type a script and pick a voice.' : am === 'change-voice' ? 'Upload speech; we keep the timing and swap the voice.' : 'Upload speech and pick a target language.'}</p></Box>, 520);
  if (s === 'n-localfree') return wrap(<Box t="Local mode"><LocalFreeHeadline /><QualitySelect value={q} onChange={setQ} options={Q} /><GenerateButton ready price={105} onClick={() => 0} /></Box>);
  return wrap(<p>Unknown kit page</p>);
}
