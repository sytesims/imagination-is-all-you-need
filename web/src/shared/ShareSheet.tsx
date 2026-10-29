/**
 * Share sheet v3 (2026-10-24). The one Share UI for every entry point (result viewer, result card, Assets / History).
 * Layout: a big live preview on the left; on the right "Where to?" (X, Instagram, TikTok, Copy link, Download, AirDrop), then the format for
 * that place, then Clean | Branded, then the caption.
 *  - AirDrop (2026-10-25, replaces "Share…"): hands the file (Clean or Branded, the same file Download saves; videos use the server export)
 *    to navigator.share({ files }), which on Safari for Mac opens the system share menu with AirDrop in it (and Messages, Mail…, so a
 *    separate "Share…" added nothing and was merged in). Where the browser can't share files (Chrome on a Mac, Windows) the button says so in
 *    one line and downloads instead.
 *  - Copy link also has the recipe: "Copy recipe" (plain text ending with the link) and "Copy recipe link" (<this app>/r?recipe=…, the
 *    "Make this" page; shared/recipe.ts). The prompt goes in only with "Include my prompt".
 *  - Clean: the file without hidden data (GET /files/<name>?clean=1, or redrawn on a canvas, which keeps no metadata).
 *  - Branded: Corner badge | Bottom strip | Framed card and its toggles (shareBrand.ts). Video: burned in by the server, plus an end card.
 *  - Instagram and TikTok can't take a post from a desktop web page, so their button does three honest things: saves the file in the right
 *    shape (4:5 / 1:1 posts, 9:16 Reels and TikToks; sharePlatforms.ts has the sizes and their sources), copies the caption and opens the
 *    platform's upload page in a new tab. Nothing posts by itself; X opens its own composer.
 *  - Image to layers shares the stacked composite (job.layersPosterUrl), never output 0 (the background plate), says "13 layers" on the
 *    card, offers the layers as a .zip or PSD, and a 9:16 "layers video" where the stack fans apart (shareFrame.ts).
 * Cost receipt (2026-10-26, shared/shareReceipt.ts): "≈ $0.32 · Kling 3.0 · Comfy Router · 41 s" / "Made free on my Mac · LTX-2.5 22B · 8 min" from the job's
 * own figures. "Include cost receipt" (on by default, remembered) adds it to the caption, the recipe link and the link card; "Burn into the file"
 * (off by default, remembered) draws a small corner tag on the picture, or into the overlay the server burns into a video (audio kept).
 * X captions end with #ImaginationIsAllYouNeed while "Add #ImaginationIsAllYouNeed" is on (default on, remembered; sharePlatforms.ts captionFor).
 */
import { Notice } from './Notice';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { appFileName } from './brand';
import { listTools, type ToolInfo } from '../api';
import { navigate } from '../platform/router';
import { useCopied, Copied } from './Toast';
import { tip } from './Tooltip';
import { cleanModelName } from './models';
import { renderShareCard, cardBlob, uploadCard, isPrivateHost, loadImg, REPO_URL } from './shareCard';
import { shareTagDefault, setShareTagDefault } from './sharePrefs';
import { recipeText, recipePath, type Recipe } from '../../../server/src/shared/recipe';
import { shareReceipt, receiptFacts } from '../../../server/src/shared/shareReceipt';
import { shareReceiptDefault, setShareReceiptDefault, shareReceiptBurnDefault, setShareReceiptBurnDefault } from './sharePrefs';
import { sharePromptDefault, cleanHref, shareStyleDefault, setShareStyleDefault, brandPrefs, setBrandPrefs, shareDestDefault, setShareDestDefault, type ShareStyle, type BrandPrefs, type BrandToggles, type BrandStyle } from './sharePrefs';
import { drawReceiptTag, renderEndCard, canvasBlob, exportType, shareFileName, hasAnything, framedSize, type BrandInfo, type BrandOpts } from './shareBrand';
import { composeStill, composeVideoOverlay, recordExplode, drawExplodeFrame, explodeAmount } from './shareFrame';
import { shareMedia, mediaKindOf, modelName, PLATFORMS, FRAME_PX, STILL_VIDEO_S, formatsFor, destOk, sameShape, outSize, captionOf, captionFor, xIntent, xLength, APP_HASHTAG, type Dest, type Fit, type MediaKind, type FormatOpt } from './sharePlatforms';
import { layersOf, downloadLayersPsd, layerCountText } from './LayerStack';
import { posterOf3d } from './model3d';
import { Segmented, PopSwitch } from './BarPop';
import { ReceiptChip } from './ReceiptChip';
import { XLogoIcon, InstagramIcon, TikTokIcon, LinkIcon, DownloadIcon, AirDropIcon, CloseIcon, LayerSheetsIcon, CubeIcon, MusicIcon } from '../ui/Icons';
import './sharecard.css';

interface ShareInfo { toolName: string; featureId: string | null; workflow: string; model: string | null; runOn: string | null; profile: { displayName: string | null; handle: string | null; avatar: any; avatarUrl: string | null }; usedInputPhoto: boolean; nonCommercial: { names: string[]; url: string | null } | null; prompt: string | null; repoUrl: string; layers?: number | null; layersPosterUrl?: string | null }
const kindOf = mediaKindOf;
const extOf = (u: string) => (u.split('?')[0].split('.').pop() || 'png').toLowerCase().slice(0, 4);
const STYLES: [BrandStyle, string][] = [['badge', 'Badge'], ['strip', 'Strip'], ['card', 'Framed card']];
const save = (href: string, name: string) => { const a = document.createElement('a'); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
const loadVideoSize = (url: string) => new Promise<{ w: number; h: number }>((res, rej) => { const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true; v.onloadedmetadata = () => res({ w: v.videoWidth, h: v.videoHeight }); v.onerror = () => rej(new Error('video')); v.src = url; });
const fmtBytes = (b: number) => b >= 1e6 ? `${(b / 1e6).toFixed(b >= 1e7 ? 0 : 1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;
/** Open a site in a new tab; false when the browser blocked it (then the step offers a plain link). */
const openTab = (href: string) => { const w = window.open(href, '_blank'); if (!w) return false; try { w.opener = null; } catch { /* cross-origin */ } return true; };
/** Can this browser hand a file to the system share sheet (AirDrop)? Safari on macOS and phones can; Chrome on a Mac and Windows mostly can't.
 *  Asked on each render (cheap), so the answer follows the browser it runs in. */
const canShareFilesNow = () => { try { return typeof navigator !== 'undefined' && !!navigator.canShare && !!navigator.share && navigator.canShare({ files: [new File([new Uint8Array(1)], 'x.png', { type: 'image/png' })] }); } catch { return false; } };
export const AIRDROP_UNSUPPORTED = 'AirDrop works from Safari. Open this page in Safari, or download the file.';

type Prepared = { key: string; href: string; name: string; blob: Blob | null; bytes: number | null; mime: string };
type Steps = { saved: boolean; copied: 'ok' | 'fail' | 'busy'; opened: boolean; dest: Dest };
const DESTS: { id: Dest; label: string; icon: ReactNode; hint: string }[] = [
  { id: 'x', label: 'X', icon: <XLogoIcon size={20} />, hint: 'Opens X with your caption' },
  { id: 'instagram', label: 'Instagram', icon: <InstagramIcon size={20} />, hint: 'Saves a 4:5 post or a 9:16 Reel, copies the caption, opens Instagram' },
  { id: 'tiktok', label: 'TikTok', icon: <TikTokIcon size={20} />, hint: 'Saves a 9:16 video, copies the caption, opens TikTok’s upload page' },
  { id: 'link', label: 'Copy link', icon: <LinkIcon size={20} />, hint: 'A link with a preview card' },
  { id: 'download', label: 'Download', icon: <DownloadIcon size={20} />, hint: 'Save the file' },
  { id: 'system', label: 'AirDrop', icon: <AirDropIcon size={20} />, hint: 'Send the file to a nearby Apple device (opens the share menu in Safari)' },
];

export function ShareSheet({ jobId, out = 0, onClose, onCopy, onError, mediaUrl }: { jobId: string; out?: number; onClose: () => void; onCopy?: () => void; onError: (m: string) => void; /** share this file instead of the output (the copy with your logo: LogoStamp) */ mediaUrl?: string }) {
  const canShareFiles = canShareFilesNow();
  const [copied, flash] = useCopied(); const [capCopied, flashCap] = useCopied();
  const [job, setJob] = useState<any>(null); const [info, setInfo] = useState<ShareInfo | null>(null); const [loadErr, setLoadErr] = useState('');
  const [retry, setRetry] = useState(0); const [infoErr, setInfoErr] = useState(false);
  const [url, setUrl] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [vis, setVis] = useState<'private' | 'unlisted' | 'public' | null>(null); const [showPrompt, setShowPrompt] = useState(sharePromptDefault);
  const [mode, setModeS] = useState<ShareStyle>(shareStyleDefault); const [bp, setBp] = useState<BrandPrefs>(brandPrefs);
  const setMode = (m: ShareStyle) => { setModeS(m); setShareStyleDefault(m); };
  const setStyle = (s: BrandStyle) => setBp((p) => { const n = { ...p, style: s }; setBrandPrefs(n); return n; });
  const setT = (k: keyof BrandToggles, v: boolean) => setBp((p) => { const n = { ...p, toggles: { ...p.toggles, [k]: v } }; setBrandPrefs(n); return n; });
  const [endCard, setEndCard] = useState(true);
  const [destS, setDestS] = useState<Dest>(() => shareDestDefault());
  const setDest = (d: Dest) => { setDestS(d); setShareDestDefault(d); setSteps(null); setErr(''); };
  const [fmtPick, setFmtPick] = useState<Partial<Record<Dest, string>>>({}); const [fit, setFit] = useState<Fit>('fit'); const [dl, setDl] = useState<'file' | 'zip' | 'psd'>('file');
  /* the result */
  useEffect(() => { let on = true;
    fetch(`/api/jobs/${jobId}`).then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status)))).then(j => { const jj = j?.job ?? j; if (!on || !jj) return; setJob(jj); if (jj.visibility) setVis(jj.visibility);
      if (jj.shareToken || jj.shareUrl) setUrl(new URL(jj.shareUrl ?? `/s/${jj.shareToken}`, location.origin).href);
      else if (jj.visibility === 'public') fetch(`/api/jobs/${jobId}/share`, { method: 'POST' }).then(r => r.ok ? r.json() : null).then(b => { if (on && (b?.url || b?.token)) setUrl(new URL(b.url ?? `/s/${b.token}`, location.origin).href); }).catch(() => 0); })
      .catch(() => on && setLoadErr('Couldn’t load this result.'));
    setInfoErr(false);
    fetch(`/api/jobs/${jobId}/share/info`).then(r => r.ok ? r.json() : Promise.reject()).then(b => { if (on) setInfo(b); }).catch(() => on && setInfoErr(true));
    return () => { on = false; }; }, [jobId, retry]);
  /* what is shared: Image to layers → the stacked composite (output 0 is only the background plate); anything else → output `out` */
  const media = useMemo(() => job ? (mediaUrl ? { url: mediaUrl, kind: mediaKindOf(mediaUrl), layers: 0 } : shareMedia({ ...job, layersPosterUrl: job.layersPosterUrl || info?.layersPosterUrl }, out)) : null, [job, info?.layersPosterUrl, out, mediaUrl]);
  const nLayers = media?.layers ?? 0; const layers = useMemo(() => nLayers ? layersOf(job) : null, [job, nLayers]);
  const outs: { url: string; label?: string }[] = job?.outputs?.length ? job.outputs : job?.resultUrl ? [{ url: job.resultUrl }] : [];
  const layersPoster: string | null = nLayers ? media!.url : null;
  const cur = media ? { url: media.url } : null; const kind: MediaKind | null = media?.kind ?? null;
  const isAudio = kind === 'audio', isVideo = kind === 'video', is3d = kind === '3d', canBrand = kind === 'image' || kind === 'video';
  const model = modelName(info?.model || (job ? cleanModelName(job, job.modelName ?? job.model ?? '') : '') || null);
  const handle = info?.profile.handle ?? null;
  const brandInfo: BrandInfo | null = info ? { workflow: info.workflow, model, handle, displayName: info.profile.displayName, avatar: info.profile.avatar, avatarUrl: info.profile.avatarUrl, prompt: info.prompt, layers: nLayers || null } : null;
  const branded = mode === 'branded' && canBrand && !!brandInfo;
  /* cost receipt: the job's own figures (GET /api/jobs/:id: cost, actualUsd, spend, place, timing, machine), never made up */
  const receipt = useMemo(() => shareReceipt(job, { model }), [job, model]);
  const [withReceipt, setWithReceiptS] = useState(shareReceiptDefault); const setWithReceipt = (v: boolean) => { setWithReceiptS(v); setShareReceiptDefault(v); };
  const [burn, setBurnS] = useState(shareReceiptBurnDefault); const setBurn = (v: boolean) => { setBurnS(v); setShareReceiptBurnDefault(v); };
  const shownReceipt = withReceipt ? receipt : null;
  /* destination + format */
  const destUsable = (d: Dest) => destOk(d, kind);
  const dest: Dest = destUsable(destS) ? destS : 'x'; // a remembered Instagram on an audio result falls back to X
  const fmts = formatsFor(dest, kind, { layers: nLayers > 1 }); const fmt: FormatOpt = fmts.find(f => f.id === fmtPick[dest]) ?? fmts[0];
  const asVideo = fmt.as === 'video';
  /* a video can't be a framed card (yet): the badge instead (a still made into a video keeps it) */
  const style: BrandStyle = isVideo && bp.style === 'card' ? 'badge' : bp.style;
  const toggles = useMemo(() => ({ ...bp.toggles, handle: bp.toggles.handle && !!handle }), [bp.toggles, handle]);
  const opts: BrandOpts | null = brandInfo ? { style, toggles, info: brandInfo } : null;
  const brand = branded && opts ? opts : null;

  /* the source pixels: the image, the video's poster frame (sized to the video), or a 3D model's poster */
  const [src, setSrc] = useState<{ img: HTMLImageElement; w: number; h: number } | null>(null); const [srcErr, setSrcErr] = useState('');
  const poster3d = is3d ? (posterOf3d(job) ?? (typeof job?.input?.imageUrl === 'string' ? job.input.imageUrl : null)) : null;
  useEffect(() => { if (!cur || isAudio) return; let on = true; setSrc(null); setSrcErr('');
    (async () => { if (is3d) { if (!poster3d) return; const img = await loadImg(poster3d); if (on) setSrc({ img, w: img.naturalWidth, h: img.naturalHeight }); return; }
      if (isVideo) { const [sz, img] = await Promise.all([loadVideoSize(cur.url), loadImg(`/api/media/poster?url=${encodeURIComponent(cur.url)}`).catch(() => null)]); if (!img) throw new Error('poster');
        if (on) setSrc({ img, w: sz.w, h: sz.h }); } else { const img = await loadImg(cur.url); if (on) setSrc({ img, w: img.naturalWidth, h: img.naturalHeight }); } })().catch(() => on && setSrcErr('Couldn’t load the result for the preview.'));
    return () => { on = false; }; }, [cur?.url, isAudio, isVideo, is3d, poster3d, retry]);
  /* the layers themselves, for the layers video */
  const [layerImgs, setLayerImgs] = useState<HTMLImageElement[] | null>(null);
  useEffect(() => { if (!layers || !fmt.explode || layerImgs) return; let on = true; Promise.all(layers.map(l => loadImg(l.url))).then(a => on && setLayerImgs(a)).catch(() => on && setSrcErr('Couldn’t load the layers.')); return () => { on = false; }; }, [layers, fmt.explode]); // eslint-disable-line react-hooks/exhaustive-deps

  const burnTag = burn && canBrand && !fmt.explode && receipt ? receipt : null; // the corner tag burned into the file
  const showFit = fmt.frame !== 'original' && !fmt.explode && !!src && !sameShape(src.w, src.h, fmt.frame) && !(brand && style === 'card');
  const effFit: Fit = showFit ? fit : 'fit';
  const frameOpts = { frame: fmt.frame, fit: effFit, brand };
  const look = JSON.stringify([fmt.id, effFit, brand ? [style, toggles, brandInfo] : null, burnTag?.text ?? null]);
  const stillOf = async (k: number) => { const cv = await composeStill(src!.img, src!.w, src!.h, frameOpts, k); return burnTag ? drawReceiptTag(cv, burnTag, cv) : cv; };
  /* live preview: the same renderer as the file, scaled down */
  const [preview, setPreview] = useState(''); const seq = useRef(0); const [drawing, setDrawing] = useState(false);
  const plainPreview = !fmt.explode && fmt.frame === 'original' && !brand && !burnTag; // the file itself (img / video element)
  useEffect(() => { if (!src || fmt.explode || plainPreview || is3d) { setPreview(''); return; } const n = ++seq.current; setDrawing(true);
    const [W, H] = outSize(src.w, src.h, fmt.frame); const k = Math.min(1, 1000 / Math.max(W, H));
    const t = setTimeout(() => { stillOf(k).then(cv => { if (n === seq.current) { setPreview(cv.toDataURL('image/jpeg', 0.86)); setDrawing(false); } }).catch(() => n === seq.current && setDrawing(false)); }, 60);
    return () => clearTimeout(t); }, [src, look, plainPreview, is3d]); // eslint-disable-line react-hooks/exhaustive-deps
  /* the layers video, played live in the preview */
  const exCv = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (!fmt.explode || !layerImgs || !layers) return; const cv = exCv.current; if (!cv) return; const c = cv.getContext('2d')!; let raf = 0; const t0 = performance.now() - 3500; // start fanned out, so the first frame already shows the layers
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; const [W, H] = FRAME_PX['9:16'];
    const full = document.createElement('canvas'); full.width = W; full.height = H; const fc = full.getContext('2d')!;
    const draw = (first?: boolean) => { const t = reduce || first ? 0.5 : ((performance.now() - t0) / 7000) % 1; drawExplodeFrame(fc, layerImgs, layerImgs[0].naturalWidth, layerImgs[0].naturalHeight, explodeAmount(t), { W, H, label: layerCountText(nLayers), brand: !!brand && toggles.app });
      c.drawImage(full, 0, 0, cv.width, cv.height); if (!reduce) raf = requestAnimationFrame(() => draw()); };
    draw(true); return () => cancelAnimationFrame(raf); }, [fmt.explode, layerImgs, brand ? 1 : 0, toggles.app]); // eslint-disable-line react-hooks/exhaustive-deps
  const [endPrev, setEndPrev] = useState('');
  const wantEnd = asVideo && !!brand && endCard;
  useEffect(() => { if (!wantEnd || !opts) { setEndPrev(''); return; } let on = true; const size = fmt.frame === 'original' ? undefined : FRAME_PX[fmt.frame];
    renderEndCard(opts, 0.12, size).then(cv => on && setEndPrev(cv.toDataURL('image/jpeg', 0.85))).catch(() => 0); return () => { on = false; }; }, [wantEnd, fmt.frame, JSON.stringify(toggles), JSON.stringify(brandInfo)]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- making the file ---------- */
  const workflow = info?.workflow ?? info?.toolName ?? 'result';
  const privateLink = !url || isPrivateHost(url); const repo = info?.repoUrl ?? REPO_URL;
  const fileHandle = brand && toggles.handle ? handle : null;
  const tag = fmt.frame === 'original' ? '' : `-${fmt.frame.replace(':', 'x')}`;
  const nameFor = (ext: string) => shareFileName(`${workflow}${fmt.explode ? '-layers' : ''}${tag}`, fileHandle, ext);
  const key = JSON.stringify([cur?.url, dest === 'download' ? dl : '', look, wantEnd]);
  const [prepared, setPrepared] = useState<Prepared | null>(null); const [making, setMaking] = useState(''); const [err, setErr] = useState('');
  const [steps, setSteps] = useState<Steps | null>(null);
  const ready = prepared?.key === key ? prepared : null;
  useEffect(() => { setSteps(null); setErr(''); }, [key]);
  /** What the destination needs: an image (drawn here), a server video, the clean original, or nothing (a link). */
  const xByLink = dest === 'x' && !privateLink; // X with a link others can open needs no file
  const needsFile = dest !== 'link' && !(dest === 'download' && dl !== 'file') && !xByLink && !!cur;
  const cleanOriginal = needsFile && (!canBrand || (fmt.frame === 'original' && !brand && !fmt.explode && !burnTag)); // the file as made, without hidden data
  const madeOnServer = needsFile && asVideo && !cleanOriginal; // videos (branded, reframed, still → video, layers video)
  /* images and clean originals are made as soon as the look settles, so the platform buttons work in one click */
  useEffect(() => { if (!needsFile || madeOnServer || !cur || (!cleanOriginal && !src)) return; let on = true;
    if (cleanOriginal) { const name = shareFileName(workflow, null, extOf(cur.url)); const href = cleanHref(cur.url); setPrepared({ key, href, name, blob: null, bytes: null, mime: '' });
      if (canShareFiles && dest === 'system') fetch(href).then(r => r.blob()).then(b => on && setPrepared({ key, href, name, blob: b, bytes: b.size, mime: b.type })).catch(() => 0); return () => { on = false; }; }
    const t = setTimeout(async () => { try {
      const platform = dest === 'instagram' || dest === 'tiktok'; const type = platform ? 'image/jpeg' : exportType(cur.url, src!.w, src!.h);
      const cv = await stillOf(1); const b = await canvasBlob(cv, type); if (!on) return;
      setPrepared(p => { if (p?.href.startsWith('blob:')) URL.revokeObjectURL(p.href); return { key, href: URL.createObjectURL(b), name: nameFor(type === 'image/jpeg' ? 'jpg' : 'png'), blob: b, bytes: b.size, mime: type }; });
    } catch (e) { if (on) setErr((e as Error).message || 'Couldn’t draw the image.'); } }, 250);
    return () => { on = false; clearTimeout(t); }; }, [key, needsFile, madeOnServer, src, dest, retry]); // eslint-disable-line react-hooks/exhaustive-deps
  const postClip = async (fd: FormData, path: 'export' | 'clip') => { const r = await fetch(`/api/jobs/${jobId}/share/${path}`, { method: 'POST', body: fd }); const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b.error || `The export failed (HTTP ${r.status}).`); return b as { url: string; bytes: number }; };
  const makeVideo = async () => { if (!cur || !opts) return; setErr(''); setSteps(null);
    try {
      const end = async (fd: FormData) => { fd.append('endCard', wantEnd ? '1' : '0'); if (wantEnd) fd.append('endcard', await canvasBlob(await renderEndCard(opts, 1, fmt.frame === 'original' ? undefined : FRAME_PX[fmt.frame])), 'endcard.png'); };
      let b: { url: string; bytes: number };
      if (fmt.explode) {
        if (!layerImgs) throw new Error('The layers are still loading.');
        setMaking('Recording the layers… 0%');
        const rec = await recordExplode(layerImgs, layerImgs[0].naturalWidth, layerImgs[0].naturalHeight, { label: layerCountText(nLayers), brand: !!brand && toggles.app, onProgress: p => setMaking(`Recording the layers… ${Math.round(p * 100)}%`) });
        setMaking('Making the MP4…'); const fd = new FormData(); fd.append('frame', '9:16'); fd.append('clip', rec.blob, `layers.${rec.ext}`); await end(fd); b = await postClip(fd, 'clip');
      } else if (isVideo) {
        if (!src) throw new Error('The video is still loading.'); setMaking(fmt.frame === 'original' ? 'Making your branded video…' : `Making the ${fmt.frame} video…`);
        const ov0 = await composeVideoOverlay(src.w, src.h, frameOpts, src.img); const ov = burnTag ? await drawReceiptTag(ov0, burnTag) : ov0; const fd = new FormData();
        fd.append('style', brand ? style : 'clean'); fd.append('toggles', JSON.stringify(brand ? toggles : {})); fd.append('frame', fmt.frame); fd.append('fit', effFit); fd.append('overlay', await canvasBlob(ov), 'overlay.png'); if (mediaUrl) fd.append('source', mediaUrl); await end(fd);
        b = await postClip(fd, 'export');
      } else {
        if (!src) throw new Error('The image is still loading.'); setMaking(`Making a ${STILL_VIDEO_S} s video…`);
        const still = await canvasBlob(await stillOf(1), 'image/jpeg'); const fd = new FormData(); fd.append('frame', fmt.frame === 'original' ? '9:16' : fmt.frame); fd.append('seconds', String(STILL_VIDEO_S));
        fd.append('still', still, 'still.jpg'); await end(fd); b = await postClip(fd, 'clip');
      }
      const name = nameFor('mp4'); const href = `${b.url}?name=${encodeURIComponent(name)}`; let blob: Blob | null = null;
      if (canShareFiles) blob = await fetch(href).then(r => r.blob()).catch(() => null);
      setPrepared({ key, href, name, blob, bytes: b.bytes, mime: 'video/mp4' });
    } catch (e) { const m = (e as Error).message || ''; setErr(!m || /ffmpeg|HTTP 5/i.test(m) ? 'Couldn’t make the video on this computer. Nothing was saved. Try again, or pick another format.' : m); }
    setMaking(''); };

  /* ---------- link, card, caption ---------- */
  const [card, setCard] = useState<{ blob: Blob; src: string } | null>(null); const [cardErr, setCardErr] = useState(''); const uploaded = useRef('');
  useEffect(() => { if (!job) return; let on = true; let s = '';
    (async () => { const tools = await listTools().catch(() => [] as ToolInfo[]); const tn = tools.find(t => t.id === job.toolId)?.name ?? job.toolId;
      const o = layersPoster ? { url: layersPoster } : outs.find(x => kindOf(x.url) !== 'audio') ?? outs[0] ?? null; const k = o ? kindOf(o.url) : null;
      const media = k === '3d' ? poster3d : o?.url ?? null;
      const cv = await renderShareCard({ mediaUrl: media, kind: k === '3d' ? (media ? 'image' : null) : k, toolName: info?.workflow || tn, model, runOn: job.runOnLabel ?? null, receipt: receiptFacts(shownReceipt),
        badge: nLayers > 1 ? layerCountText(nLayers) : k === '3d' ? '3D model' : null });
      const blob = await cardBlob(cv); if (!on) return; s = URL.createObjectURL(blob); setCard({ blob, src: s }); })().catch(e => on && setCardErr((e as Error).message || 'Couldn’t draw the card'));
    return () => { on = false; if (s) URL.revokeObjectURL(s); }; }, [job, layersPoster, model, info?.workflow, shownReceipt?.text]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!url || !card || uploaded.current === url + card.src) return; uploaded.current = url + card.src; uploadCard(jobId, card.blob).catch(() => { uploaded.current = ''; }); }, [url, card]); // eslint-disable-line react-hooks/exhaustive-deps
  const linkOf = (j: any) => j?.shareUrl ? new URL(j.shareUrl, location.origin).href : j?.shareToken ? `${location.origin}/s/${j.shareToken}` : j?.url ? new URL(j.url, location.origin).href : j?.token ? `${location.origin}/s/${j.token}` : null;
  const setVisibility = async (v: 'private' | 'unlisted' | 'public', sp = showPrompt): Promise<string | null> => { setBusy(true); let link: string | null = null;
    try { const r = await fetch(`/api/jobs/${jobId}/visibility`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visibility: v, showPrompt: sp }) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Couldn’t change who can see this');
      link = linkOf(j);
      if (v !== 'private' && !link) { const s2 = await fetch(`/api/jobs/${jobId}/share`, { method: 'POST' }); const b = await s2.json().catch(() => ({})); if (s2.ok) link = linkOf(b); }
      setVis(j.visibility ?? v); setUrl(link); if (!link) uploaded.current = ''; } catch (e) { onError((e as Error).message); } setBusy(false); return link; };
  const copyText = (t: string) => navigator.clipboard?.writeText(t) ?? Promise.reject(new Error('no clipboard'));
  const copyLink = async () => { let link = url; if (!link) link = await setVisibility('unlisted'); if (!link) return;
    copyText(link).then(() => { flash(); onCopy?.(); }, () => onError('Couldn’t copy the link')); };
  const OPTS = [['private', 'Only you'], ['unlisted', 'With the link'], ['public', 'Community']] as const;
  const line = vis === 'public' ? 'Shown in Community → Shots. Anyone with the link can open it.' : vis === 'unlisted' ? 'Anyone with the link can open it. It isn’t listed in Community.' : 'Only you can see it. Copy link turns on “Anyone with the link”.';
  const [capPrompt, setCapPrompt] = useState(false); const [capTag, setCapTagS] = useState(shareTagDefault); const setCapTag = (v: boolean) => { setCapTagS(v); setShareTagDefault(v); }; const [capEdit, setCapEdit] = useState<Partial<Record<Dest, string>>>({});
  const capDest: Dest = dest === 'link' || dest === 'download' ? 'system' : dest;
  const base = captionOf({ featureId: info?.featureId ?? null, model, kind, layers: nLayers || null });
  const autoCaption = captionFor(capDest, { base, prompt: capPrompt ? info?.prompt : null, link: privateLink ? null : url, repo, tag: capTag, receipt: shownReceipt?.text ?? null });
  const caption = capEdit[capDest] ?? autoCaption; const capMax = capDest === 'x' ? PLATFORMS.x.captionMax : capDest === 'system' ? 0 : PLATFORMS[capDest as 'instagram'].captionMax;
  const capLen = capDest === 'x' ? xLength(caption) : [...caption].length;
  const xLink = privateLink ? repo : url!;
  const copyCaption = () => { void copyText(capDest === 'x' ? `${caption} ${xLink}` : caption).then(() => flashCap(), () => onError('Couldn’t copy the caption')); };
  /* recipe: fetched on click (owner-only route), so "Include my prompt" is always what goes out */
  const [recPrompt, setRecPrompt] = useState(false); const [recCopied, flashRec] = useCopied(); const [recLinkCopied, flashRecLink] = useCopied();
  const getRecipe = async (): Promise<{ recipe: Recipe; link: string } | null> => { try { const r = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/recipe?prompt=${recPrompt && info?.prompt ? 1 : 0}`); const b = await r.json().catch(() => ({}));
    if (!r.ok || !b?.path) throw new Error(b?.error || 'Couldn’t make the recipe.');
    const recipe: Recipe = shownReceipt ? { ...b.recipe, receipt: shownReceipt.text } : b.recipe; // the receipt rides in the link only while "Include cost receipt" is on
    return { recipe, link: new URL(shownReceipt ? recipePath(recipe) : b.path, location.origin).href }; } catch (e) { onError((e as Error).message || 'Couldn’t make the recipe.'); return null; } };
  const copyRecipe = async (as: 'text' | 'link') => { const r = await getRecipe(); if (!r) return;
    copyText(as === 'link' ? r.link : recipeText(r.recipe, r.link)).then(() => (as === 'link' ? flashRecLink : flashRec)(), () => onError('Couldn’t copy the recipe')); };
  const downloadCard = () => { if (card) save(card.src, appFileName(`${jobId}-card`, 'png')); };
  const empty = !!brand && !hasAnything(brand);
  /* Esc closes */
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }; addEventListener('keydown', k, true); return () => removeEventListener('keydown', k, true); }, [onClose]);
  useEffect(() => () => { if (prepared?.href.startsWith('blob:')) URL.revokeObjectURL(prepared.href); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- go ---------- */
  /* AirDrop: the file only (a caption alongside would arrive as a second item); the browser's own share menu, nothing sent by us */
  const sysShare = async (p: Prepared | null) => { if (!p?.blob) return; const file = new File([p.blob], p.name, { type: p.mime || p.blob.type });
    try { if (navigator.canShare && !navigator.canShare({ files: [file] })) { save(p.href, p.name); onError(AIRDROP_UNSUPPORTED); return; }
      await navigator.share({ files: [file] }); } catch (e) { if ((e as Error).name !== 'AbortError') onError('Couldn’t open the share menu. Use Download instead.'); } };
  const go = () => {
    if (dest === 'link') { void copyLink(); return; }
    if (dest === 'download') {
      if (dl === 'zip') { save(`/api/jobs/${encodeURIComponent(jobId)}/download.zip`, appFileName(jobId, 'zip')); return; }
      if (dl === 'psd' && layers) { setMaking('Building the PSD…'); downloadLayersPsd(jobId, layers, new Set()).catch(() => setErr('Couldn’t build the PSD. Try the .zip instead.')).finally(() => setMaking('')); return; }
      if (ready) save(ready.href, ready.name); return; }
    if (dest === 'system') { if (!canShareFiles) { if (ready) save(ready.href, ready.name); return; } void sysShare(ready); return; }
    if (dest === 'x') {
      if (!privateLink) { setSteps({ saved: false, copied: 'ok', opened: openTab(xIntent(caption, url!)), dest }); return; }
      if (ready) save(ready.href, ready.name); setSteps({ saved: !!ready, copied: 'ok', opened: openTab(xIntent(caption, xLink)), dest }); return; }
    // Instagram / TikTok: save the file, copy the caption (while this page still has focus), open the upload page
    if (!ready) return; save(ready.href, ready.name); setSteps({ saved: true, copied: 'busy', opened: false, dest });
    copyText(caption).then(() => setSteps(s => s && { ...s, copied: 'ok' }), () => setSteps(s => s && { ...s, copied: 'fail' }));
    const opened = openTab(PLATFORMS[dest].upload!); setSteps(s => s && { ...s, opened });
  };
  const needMake = madeOnServer && !ready;
  const platformName = dest === 'x' || dest === 'instagram' || dest === 'tiktok' ? PLATFORMS[dest].name : '';
  const goLabel = making ? making : needMake ? (fmt.explode ? 'Make the layers video' : isVideo ? (fmt.frame === 'original' ? (brand ? 'Make branded video' : 'Make video with receipt') : `Make the ${fmt.frame} video`) : `Make the ${STILL_VIDEO_S} s video`)
    : dest === 'x' ? 'Open X composer' : dest === 'instagram' ? 'Save · copy · open Instagram' : dest === 'tiktok' ? 'Save · copy · open TikTok'
    : dest === 'link' ? (copied ? 'Link copied' : url ? 'Copy link' : 'Turn on link and copy') : dest === 'system' ? (canShareFiles ? 'AirDrop' : 'Download') : dl === 'zip' ? `Download ${layerCountText(nLayers)} (.zip)` : dl === 'psd' ? 'Download PSD' : 'Download';
  const goDisabled = !!making || !cur || busy || (needMake && (!src || !opts)) || (empty && needsFile && !cleanOriginal) || (!needMake && needsFile && !ready) || (dest === 'system' && canShareFiles && !ready?.blob);
  const goIcon = dest === 'x' ? <XLogoIcon size={16} /> : dest === 'instagram' ? <InstagramIcon size={16} /> : dest === 'tiktok' ? <TikTokIcon size={16} /> : dest === 'link' ? <LinkIcon size={16} /> : dest === 'system' && canShareFiles ? <AirDropIcon size={16} /> : <DownloadIcon size={16} />;
  const [W, H] = !src ? [0, 0] : fmt.frame === 'original' && brand && style === 'card' ? (({ W: fw, H: fh }) => [fw, fh])(framedSize(src.w, src.h, brand)) : outSize(src.w, src.h, fmt.frame);
  const fileType = dest === 'download' && dl === 'zip' ? 'ZIP' : dest === 'download' && dl === 'psd' ? 'PSD' : isAudio ? extOf(cur?.url ?? '').toUpperCase() : is3d ? 'GLB' : asVideo ? 'MP4' : ready?.mime === 'image/jpeg' || dest === 'instagram' || dest === 'tiktok' ? 'JPG' : extOf(cur?.url ?? '').toUpperCase();
  const specLine = dest === 'link' ? '1200 × 630 · PNG · shown where the link is posted' : [W && !is3d && !isAudio && !(dest === 'download' && dl !== 'file') ? `${W} × ${H}` : '', fmt.frame !== 'original' ? fmt.frame : '', fileType, ready?.bytes ? fmtBytes(ready.bytes) : ''].filter(Boolean).join(' · ');
  const tooBig = ready?.bytes && (dest === 'instagram' || dest === 'tiktok') ? ready.bytes > (asVideo ? PLATFORMS[dest].videoMaxBytes : PLATFORMS[dest].imageMaxBytes) : false;

  const sw = (k: keyof BrandToggles, label: string, disabled?: boolean) =>
    <fieldset key={k} className="ss2-toggle" disabled={disabled}><PopSwitch label={label} on={!disabled && toggles[k]} onChange={v => setT(k, v)} testId={`ss-t-${k}`} rowTestId={`ss-row-${k}`} /></fieldset>;
  const stage = dest === 'link' ? (card ? <img src={card.src} alt="The link preview card" className="ss2-cardimg" /> : <span className="ss2-wait">{cardErr || 'Drawing your card…'}</span>)
    : fmt.explode ? <canvas ref={exCv} width={360} height={640} className="ss2-cv" aria-label={`${layerCountText(nLayers)} fanning apart`} data-testid="ss-explode" />
    : !cur ? <span className="ss2-wait">{loadErr || 'Loading…'}</span>
    : isAudio ? <div className="ss2-audio"><span className="ss2-glyph"><MusicIcon size={34} /></span><audio controls src={cur.url} /></div>
    : is3d ? (src ? <img src={src.img.src} alt="The 3D model’s picture" /> : <div className="ss2-audio"><span className="ss2-glyph"><CubeIcon size={34} /></span><span className="ss2-wait">3D model (.glb)</span></div>)
    : plainPreview ? (isVideo ? <video src={cur.url} controls muted playsInline /> : <img src={cur.url} alt="Your result" />)
    : preview ? <img src={preview} alt="Preview of the file" className={drawing ? 'is-drawing' : ''} /> : <span className="ss2-wait">{srcErr || 'Drawing…'}</span>;
  return <div className="mp-scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div className="dlg share-dlg ss ss2 bp-host" role="dialog" aria-modal="true" aria-labelledby="share-t" data-testid="share-sheet">
      <div className="ss2-left">
        <div className={`ss2-stage${fmt.frame !== 'original' || fmt.explode ? ' is-framed' : ''}`} data-testid="ss-preview" data-frame={fmt.explode ? 'explode' : fmt.frame}>
          {stage}
          <span className="ss2-chips">{dest !== 'link' && cur && !brand && !fmt.explode && <span className="ss2-chip" data-testid="ss-clean-chip">No hidden data</span>}
            {nLayers > 1 && dest !== 'link' && <span className="ss2-chip" data-testid="ss-layers-chip"><LayerSheetsIcon size={12} />{layerCountText(nLayers)}</span>}
            {asVideo && !isVideo && !fmt.explode && dest !== 'link' && <span className="ss2-chip">{STILL_VIDEO_S} s video</span>}
            {is3d && dest !== 'link' && <span className="ss2-chip"><CubeIcon size={12} />{src && !posterOf3d(job) ? '3D model · made from this picture' : '3D model'}</span>}</span>
        </div>
        <div className="ss2-meta"><span className="ss2-spec" data-testid="ss-spec">{specLine || ' '}</span>
          {endPrev && <span className="ss2-end" {...tip('Ends on this card for 1.5 s')}><img src={endPrev} alt="End card" />End card</span>}</div>
      </div>
      <div className="ss2-right">
        <header className="ss2-head"><div><h3 id="share-t">Share</h3><p className="ss2-sub">{[info?.workflow, model].filter(Boolean).join(' · ') || ' '}</p></div>
          <button type="button" className="ss2-x" aria-label="Close" onClick={onClose} data-testid="ss-close"><CloseIcon size={18} /></button></header>
        <fieldset className="ss2-controls" data-testid="ss-controls" disabled={!!making} aria-label="Share settings">
        <section className="ss2-sec"><h4 className="bp-lbl">Where to?</h4>
          <div className="ss2-dests" role="radiogroup" aria-label="Where to share" data-testid="ss-dests">
            {DESTS.map(d => { const ok = destUsable(d.id); const on = dest === d.id;
              return <button key={d.id} type="button" role="radio" aria-checked={on} className={`ss2-dest${on ? ' on' : ''}`} disabled={!ok} onClick={() => setDest(d.id)} data-testid={`ss-dest-${d.id}`}
                {...tip(ok ? d.hint : isAudio ? 'Needs a picture or a video' : 'Needs a picture or a video. Record a turntable in the 3D viewer first')}><span className="ss2-dest-ic" aria-hidden>{d.icon}</span><b>{d.label}</b></button>; })}
          </div></section>
        {/* format */}
        {(fmts.length > 1 || showFit || (dest === 'download' && nLayers > 1)) && <section className="ss2-sec" data-testid="ss-format"><h4 className="bp-lbl">Format</h4>
          {dest === 'download' && nLayers > 1 ? <Segmented label="What to download" value={dl} onChange={v => setDl(v as typeof dl)} testId="ss-dl" options={[
              { value: 'file', label: 'Picture', hint: 'All layers stacked' }, { value: 'zip', label: 'Layers .zip', hint: `${nLayers} PNGs` }, { value: 'psd', label: 'PSD', hint: 'Layered, named' }]} />
            : fmts.length > 1 && <Segmented label="Format" value={fmt.id} onChange={v => setFmtPick(p => ({ ...p, [dest]: v }))} testId="ss-fmt" options={fmts.map(f => ({ value: f.id, label: f.label, hint: f.hint, testId: `ss-fmt-${f.id}` }))} />}
          {showFit && <Segmented label="Fit" value={fit} onChange={setFit} testId="ss-fit" className="ss2-fit" options={[{ value: 'fit', label: 'Fit', hint: 'Whole picture, soft backdrop' }, { value: 'fill', label: 'Fill', hint: 'Crop to the frame' }]} />}
        </section>}
        {/* style */}
        {needsFile && <section className="ss2-sec" data-testid="ss-style"><h4 className="bp-lbl">Style</h4>
          <Segmented label="Clean or branded" value={branded ? 'branded' : 'clean'} onChange={v => canBrand && setMode(v as ShareStyle)} testId="ss-mode" options={[
            { value: 'clean', label: 'Clean', hint: 'No marks, no hidden data', testId: 'ss-clean' }, { value: 'branded', label: 'Branded', hint: 'Our mark, your handle', disabled: !canBrand || !brandInfo, testId: 'ss-branded' }]} />
          {canBrand && infoErr && <p className="bp-note">Brand details couldn’t load. <button type="button" className="ss2-link" onClick={() => setRetry(n => n + 1)}>Try again</button>, or choose Clean.</p>}
          {!canBrand && <p className="bp-note" data-testid="ss-audio-note">{isAudio ? 'Audio shares clean. A branded waveform video comes later.' : '3D models share clean (.glb).'}</p>}
          <div className={`ss2-brand${brand ? ' is-on' : ''}`} aria-hidden={!brand}>{brand && !fmt.explode && <>
            <Segmented label="Branded style" value={style} onChange={setStyle} testId="ss-styles" options={STYLES.map(([k, l]) => ({ value: k, label: l, testId: `ss-style-${k}`, disabled: k === 'card' && isVideo, title: k === 'card' && isVideo ? 'Framed card is for pictures' : undefined }))} />
            <div className="ss2-tgs">
              {sw('app', 'App name')}
              <div className="ss2-handle">{sw('handle', handle ? `@${handle}` : '@handle', !handle)}{!handle && <a className="ss2-sethandle" href="/profile" onClick={e => { e.preventDefault(); onClose(); navigate('/profile'); }} data-testid="ss-set-handle">Set a handle</a>}</div>
              {style !== 'badge' && sw('workflow', 'Workflow')}
              {style !== 'badge' && sw('model', 'Model', !model)}
              {style !== 'badge' && nLayers > 1 && sw('layers', layerCountText(nLayers))}
              {style === 'card' && sw('prompt', 'Prompt', !info?.prompt)}
              {asVideo && <PopSwitch label="End card" on={endCard} onChange={setEndCard} testId="ss-t-endcard" rowTestId="ss-row-endcard" />}
            </div>
            {empty && <p className="bp-note bp-note-warn">Nothing to show: turn on App name or your handle.</p>}</>}
            {brand && fmt.explode && <div className="ss2-tgs">{sw('app', 'App name')}{asVideo && <PopSwitch label="End card" on={endCard} onChange={setEndCard} testId="ss-t-endcard" rowTestId="ss-row-endcard" />}</div>}</div>
        </section>}
        {/* cost receipt */}
        {receipt && <section className="ss2-sec" data-testid="ss-receipt-sec"><h4 className="bp-lbl">Cost receipt</h4>
          <ReceiptChip receipt={receipt} off={!withReceipt && !burnTag} testId="ss-receipt" />
          <div className="ss2-tgs">
            <PopSwitch label="Include cost receipt" hint={dest === 'link' ? 'In the link card and the recipe' : dest === 'download' || dest === 'system' ? 'In the recipe and the link card' : 'In the caption, the recipe and the link card'} on={withReceipt} onChange={setWithReceipt} testId="ss-receipt-on" />
            {needsFile && canBrand && !fmt.explode && <PopSwitch label="Burn into the file" hint="A small tag in the top-left corner" on={burn} onChange={setBurn} testId="ss-receipt-burn" />}
          </div></section>}
        {/* link */}
        {dest === 'link' && <section className="ss2-sec" data-testid="ss-link-sec"><h4 className="bp-lbl">Who can see it</h4>
          <Segmented label="Who can see this" value={vis ?? 'private'} onChange={v => vis !== v && void setVisibility(v)} testId="vis-seg" options={OPTS.map(([k, l]) => ({ value: k, label: l, testId: `vis-${k}`, disabled: busy }))} />
          <p className="bp-note share-line" data-testid="share-line" aria-live="polite">{vis == null ? 'Checking who can see this…' : line}</p>
          {vis === 'public' && <PopSwitch label="Show my prompt" hint="On the Community page" on={showPrompt} onChange={v => { setShowPrompt(v); void setVisibility('public', v); }} testId="ss-show-prompt" />}
          <div className={`share-link${url ? '' : ' is-off'}`} data-testid="share-link"><input className="share-link-in" readOnly value={url ?? ''} placeholder="No link yet" aria-label="Share link" disabled={!url} onFocus={e => e.currentTarget.select()} />
            {url && <button type="button" className="ss2-mini" onClick={() => void setVisibility('private')} disabled={busy} data-testid="share-stop">Stop sharing</button>}</div>
          <p className="bp-note" data-testid="ss-link-note">{privateLink && url ? 'Works on this computer and your network.' : url ? 'Anyone with the link can open it.' : ' '}{nLayers > 1 && url ? ` The page offers all ${nLayers} layers as a .zip.` : ''}</p>
          <div className="ss2-caprow"><span className="bp-note ss2-grow">The preview card on the left shows wherever the link is posted.</span>
            <button type="button" className="ss2-mini" disabled={!card} onClick={downloadCard} data-testid="share-download-card">Download card</button></div>
        </section>}
        {dest === 'link' && <section className="ss2-sec" data-testid="ss-recipe-sec"><h4 className="bp-lbl">Recipe</h4>
          <p className="bp-note">The tool, model, workflow and settings, so others can make one like it in their own app. Never your files or keys. Nothing runs until they press Generate.</p>
          {info?.prompt && <PopSwitch label="Include my prompt" on={recPrompt} onChange={setRecPrompt} testId="ss-recipe-prompt" />}
          <div className="ss2-caprow ss2-recipe-acts"><span className="ss2-grow" />
            <button type="button" className="ss2-mini" onClick={() => void copyRecipe('text')} data-testid="ss-copy-recipe" {...tip('Plain text that ends with the recipe link')}>{recCopied ? <Copied /> : 'Copy recipe'}</button>
            <button type="button" className="ss2-mini" onClick={() => void copyRecipe('link')} data-testid="ss-copy-recipe-link" {...tip('Opens “Make this” in their own app')}>{recLinkCopied ? <Copied /> : 'Copy recipe link'}</button></div>
        </section>}
        {/* caption */}
        {(dest === 'x' || dest === 'instagram' || dest === 'tiktok') && <section className="ss2-sec" data-testid="ss-caption-sec">
          <div className="ss2-caph"><h4 className="bp-lbl">Caption</h4>{capMax > 0 && <span className={`bp-mono ss2-count${capLen > capMax ? ' over' : ''}`} data-testid="ss-cap-count">{capLen} / {capMax}</span>}</div>
          <textarea className="ss2-cap" value={caption} rows={4} onChange={e => setCapEdit(c => ({ ...c, [capDest]: e.target.value }))} aria-label="Caption" data-testid="ss-caption" spellCheck />
          {dest === 'x' && <div className="ss2-caprow"><PopSwitch label={`Add ${APP_HASHTAG}`} on={capTag} onChange={v => { setCapTag(v); setCapEdit(c => { const n = { ...c }; delete n[capDest]; return n; }); }} testId="ss-cap-tag" /></div>}
          <div className="ss2-caprow">{info?.prompt && <PopSwitch label="Add my prompt" on={capPrompt} onChange={v => { setCapPrompt(v); setCapEdit(c => { const n = { ...c }; delete n[capDest]; return n; }); }} testId="ss-cap-prompt" />}
            {capEdit[capDest] != null && <button type="button" className="ss2-mini" onClick={() => setCapEdit(c => { const n = { ...c }; delete n[capDest]; return n; })} data-testid="ss-cap-reset">Reset</button>}
            <button type="button" className="ss2-mini" onClick={copyCaption} data-testid="ss-copy-caption">{capCopied ? <Copied /> : 'Copy caption'}</button></div>
          {dest === 'x' && <p className="bp-note" data-testid="ss-attach-note">{privateLink ? 'Your link only works on your network, so the post links the project. The file is saved for you to attach in X.' : 'The post carries your link and its preview card.'}</p>}
        </section>}
        {(info?.usedInputPhoto || info?.nonCommercial) && <div className="ss2-fine">
          {info?.usedInputPhoto && <p className="bp-note" data-testid="ss-consent">Has a real person in it? Make sure they’re OK with you posting it.</p>}
          {info?.nonCommercial && <p className="bp-note" data-testid="ss-nc">Made with non-commercial weights ({info.nonCommercial.names.join(', ')}).{info.nonCommercial.url && <> <a href={info.nonCommercial.url} target="_blank" rel="noreferrer">Licence</a></>}</p>}</div>}
        </fieldset>
        {/* go */}
        <div className="ss2-go" data-toast-avoid>
          <div className="ss2-acts">
            <button type="button" className={`ss2-primary${making ? ' is-busy' : ''}${dest === 'link' && copied ? ' is-done' : ''}`} disabled={goDisabled} onClick={needMake ? () => void makeVideo() : go} data-testid="ss-go">{!making && goIcon}<span>{goLabel}</span></button>
          </div>
          <div className="ss2-feedback" data-testid="ss-feedback" aria-live="polite">
          {canShareFiles && (dest === 'instagram' || dest === 'tiktok') && <button type="button" className="ss2-secondary" disabled={!ready?.blob || !!making} onClick={() => void sysShare(ready)} data-testid="ss-sys-share" {...tip('Send it to your phone and post from there')}><AirDropIcon size={16} />AirDrop to your phone</button>}
          {err && <Notice kind="error" testId="ss-error" action={{ label: 'Try again', onClick: () => { setErr(''); if (madeOnServer) void makeVideo(); else setRetry(n => n + 1); } }}>{err}</Notice>}
          {tooBig && <p className="bp-note bp-note-warn">This file is over {platformName}’s limit ({fmtBytes(asVideo ? PLATFORMS[dest as 'instagram'].videoMaxBytes : PLATFORMS[dest as 'instagram'].imageMaxBytes)}).</p>}
          {steps && <ol className="ss2-steps" data-testid="ss-steps" aria-live="polite">
            {(steps.dest === 'x' ? [steps.saved ? ['Saved', true] : null, ['Caption in the post', true], ['X opened', steps.opened]] : [['Saved', steps.saved], [steps.copied === 'fail' ? 'Copy the caption' : 'Caption copied', steps.copied === 'ok'], [`${platformName} opened`, steps.opened]])
              .filter(Boolean).map((s, i, a) => { const last = i === a.length - 1; const href = steps.dest === 'x' ? xIntent(caption, privateLink ? xLink : url!) : PLATFORMS[steps.dest as 'instagram'].upload!;
                return <li key={i} className={s![1] ? 'ok' : ''} data-testid={`ss-step-${i + 1}`}><b>{i + 1}</b>{last && !s![1] ? <a href={href} target="_blank" rel="noopener noreferrer" data-testid="ss-open-upload">Open {platformName}</a>
                  : !s![1] && steps.copied === 'fail' && i === 1 ? <button type="button" className="ss2-link" onClick={copyCaption}>Copy the caption</button> : s![0] as string}</li>; })}
          </ol>}
          {steps && steps.dest !== 'x' && <p className="bp-note" data-testid="ss-step-hint">{PLATFORMS[steps.dest as 'instagram'].uploadStep}, then paste the caption. Nothing posts until you press Share there.</p>}
          {dest === 'system' && <p className="bp-note" data-testid="ss-airdrop-note">{canShareFiles ? `Opens the share menu: pick AirDrop, then the device. Sends the ${branded ? 'branded' : 'clean'} file shown here.` : AIRDROP_UNSUPPORTED}</p>}
          {steps && steps.dest === 'x' && <p className="bp-note">Nothing posts until you press Post in X.{steps.saved ? ' Attach the saved file there.' : ''}</p>}
          {!steps && dest !== 'system' && !err && <p className="bp-note">{making ? 'Preparing on your computer. No generation credits used.' : empty && needsFile && !cleanOriginal ? 'Turn on a brand detail, or choose Clean.' : goDisabled && needsFile ? (srcErr || 'Preparing your file…') : dest === 'x' ? (xByLink ? 'Opens X with your caption and result link. Nothing posts automatically.' : 'Opens a new tab with your caption. Attach the saved file there; nothing posts automatically.') : dest === 'instagram' || dest === 'tiktok' ? 'Saves the file, copies your caption and opens the site. You finish the post there.' : dest === 'link' ? 'Copies a link to this result. No post is published automatically.' : 'Saves the file shown in the preview to your computer.'}</p>}
          </div>
        </div>
      </div>
    </div></div>;
}
