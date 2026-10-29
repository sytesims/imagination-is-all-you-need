import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import './tokens.css';
import './styles.css';
import { EXAMPLES } from './ui/examples';
import MediaPicker, { MediaItem } from './ui/b1/MediaPicker';
import FilledMedia from './ui/b1/FilledMedia';
import ChipPrompt from './ui/b1/ChipPrompt';
import GenerateButton from './ui/b1/GenerateButton';
import QualitySelect from './ui/b1/QualitySelect';
import ModelPicker from './ui/b1/ModelPicker';
import PromptDock, { ImageHero, DockChip, CountStepper } from './ui/b1/PromptDock';
import { ModeSeg, Switch } from './ui/b1/ModeToggle';
import NextKit from './ui/next/Kit';
/** Dev-only component kit (/kit.html?s=...) for batch-1 UI with mock data. Not part of the production build. */
const vids: MediaItem[] = EXAMPLES.map((e, i) => ({ id: e.id, url: e.src, poster: e.poster, kind: 'video', name: e.title, ts: 100 - i, liked: i % 3 === 0 }));
const imgs: MediaItem[] = EXAMPLES.map((e, i) => ({ id: 'i' + e.id, url: e.poster, kind: 'image', name: e.title, ts: 50 - i, liked: i % 2 === 0 }));
const Q = [{ value: '480p', label: '480p', desc: 'Fastest and cheapest', price: 40 }, { value: '720p', label: '720p', desc: 'Balanced speed and detail', price: 105 }, { value: '1080p', label: '1080p', desc: 'Best fidelity · slower upscale pass', price: 300 }];
const IQ = [{ value: 'low', label: 'Low', desc: 'Fastest and cheapest' }, { value: 'med', label: 'Medium', desc: 'Balanced' }, { value: 'high', label: 'High', desc: 'Best fidelity' }];
const MODELS = [
  { id: 'wan-vace', name: 'Wan VACE', family: 'Video', blurb: 'Object and character swap with motion kept.', poster: EXAMPLES[0].poster, badge: 'new' as const, license: { name: 'Apache-2.0', osi: true } },
  { id: 'ltx', name: 'LTX Video', family: 'Video', blurb: 'Fast camera moves from one start image.', poster: EXAMPLES[1].poster, license: { name: 'LTXV Open', osi: false } },
  { id: 'flux-k', name: 'FLUX Kontext', family: 'Image', blurb: 'Instruction edits on a still.', poster: EXAMPLES[2].poster, badge: 'premium' as const, license: { name: 'Non-commercial', osi: false } },
  { id: 'qwen-edit', name: 'Qwen Image Edit', family: 'Image', blurb: 'Open-weights image editing.', poster: EXAMPLES[3].poster, badge: 'new' as const, license: { name: 'Apache-2.0', osi: true } },
  { id: 'seedvr', name: 'SeedVR2', family: 'Upscale', blurb: 'One-step video upscaler.', poster: EXAMPLES[4].poster, license: { name: 'Apache-2.0', osi: true } },
  { id: 'rife', name: 'RIFE', family: 'Upscale', blurb: 'Frame interpolation for smooth motion.', poster: EXAMPLES[5].poster, license: { name: 'MIT', osi: true } },
];
function Kit() {
  const s = new URLSearchParams(location.search).get('s') ?? 'panel';
  if (s.startsWith('n-')) return <NextKit s={s} />;
  const [vid, setVid] = useState(s !== 'empty'); const [refs, setRefs] = useState(['a', 'b', 'c']); const [q, setQ] = useState('720p'); const [iq, setIq] = useState('high');
  const [p, setP] = useState(s === 'stale' ? 'replace the man with the cat from @image1, keep the motion of @Video1' : 'replace the man with the cat from @image1, keep the motion of @Video1');
  const [mode, setMode] = useState<'motion' | 'swap'>('swap'); const [pr, setPr] = useState(true); const [n, setN] = useState(1); const [model, setModel] = useState('qwen-edit');
  const valid = [...(vid ? ['Video1'] : []), ...refs.map((_, i) => `image${i + 1}`)];
  const ready = vid && refs.length > 0;
  if (s === 'picker' || s === 'picker-img') return <MediaPicker open kind={s === 'picker' ? 'video' : 'image'} initialTab={s === 'picker' ? 'presets' : 'uploads'} sources={{ uploads: s === 'picker' ? vids.slice(0, 3) : imgs.slice(0, 5), presets: vids, generations: vids.slice(2, 8), liked: [...vids, ...imgs].filter(m => m.liked) }} onPick={() => 0} onUpload={() => 0} onClose={() => 0} />;
  if (s === 'models') return <ModelPicker open models={MODELS} value={model} onPick={setModel} onClose={() => 0} />;
  if (s === 'image') return <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 16 }}>
    <ImageHero art={EXAMPLES.slice(0, 5).map(e => e.poster)} title="Real-looking pictures from open image models" sub="Describe an image, attach references, pick a model. Free on your computer." />
    <PromptDock value="" onChange={() => 0} placeholder="Describe the image you want…" onAttach={() => 0}
      chips={<><DockChip icon="◆" on>Qwen Image</DockChip><DockChip icon="▭">Auto</DockChip><QualitySelect compact value={iq} onChange={setIq} options={IQ} /><DockChip>2K</DockChip><CountStepper value={n} onChange={setN} options={[1, 2, 3, 4]} /></>}
      generate={<GenerateButton ready price={n * 6} onClick={() => 0} />} /></div>;
  return (
    <div style={{ maxWidth: 380, margin: '24px auto', padding: 16 }} className="ws-panel">
      <ModeSeg modes={[['motion', 'Motion transfer'], ['swap', 'Object swap']]} value={mode} onChange={setMode} />
      <h3 className="field mt-16">VIDEO</h3>
      <FilledMedia items={vid ? [{ id: 'v', url: EXAMPLES[3].src, kind: 'video', label: '@Video 1' }] : []} max={1} onRemove={() => setVid(false)} onAdd={() => setVid(true)} emptyLabel="Add a 3–30 s video" />
      <h3 className="field mt-16">IMAGES</h3>
      <FilledMedia items={refs.map((r, i) => ({ id: r, url: EXAMPLES[i + 5].poster, kind: 'image', label: `@image${i + 1}` }))} max={4} onRemove={id => setRefs(refs.filter(x => x !== id))} onZoom={() => 0} onAdd={() => setRefs([...refs, 'x' + refs.length])} />
      <div className="mt-16"><Switch label="Prompt" checked={pr} onChange={setPr} /></div>
      {pr && <div className="mt-12"><ChipPrompt id="p" value={p} onChange={setP} valid={valid} placeholder="Say what to swap, e.g. put the coat from @image1 on the dancer…" /></div>}
      <div className="mt-16 row" style={{ justifyContent: 'space-between' }}><QualitySelect value={q} onChange={setQ} options={Q} /></div>
      <div className="mt-16"><GenerateButton ready={ready} price={Q.find(o => o.value === q)!.price} onClick={() => 0} missing={ready ? [] : ['video']} /></div>
    </div>);
}
document.title = 'UI kit · Imagination Is All You Need';
createRoot(document.getElementById('root')!).render(<Kit />);
