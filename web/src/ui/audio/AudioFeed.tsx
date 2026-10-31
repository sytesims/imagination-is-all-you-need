/**
 * The Audio tab's results (2026-10-27, UX audit fix batch A): the same shared feed as Create Image and Generate Video (ui/next/feed: the
 * toolbar with Filter / Select / grid size, the server-paged list, live runs from anywhere, Show more, the shared result viewer), listing every
 * Audio workflow's results (server/src/shared/audioFeed.ts, GET /api/jobs?audioFeed=). A finished sound is the shared FeedCard with the shared
 * AudioCard tile as its body (play, title, kind chip, length, model, price, seekable waveform; 2026-10-29: no cover art, ~2.5x more per screen); a run still going is the shared GenTile with SyteSim warming up; a
 * failed one is the shared failure tile with its one fix (Try again stays on this page). Opening a sound shows it in the shared viewer over the
 * page (?view=<id>: Back closes it, ← / → stay within these results), never the /jobs/<id> page.
 * Loading: skeleton cells shaped like the grid (they fade in only if the first page is slow), never "No sounds yet" before the list arrives.
 */
import { useEffect, useRef, useState } from 'react';
import type { JobState } from '../../api';
import GenTile from '../../shared/GenTile';
import ResultView from '../../shared/ResultView';
import { FailedViewer } from '../../shared/ResultViewer';
import { AudioCard } from '../../shared/AudioCard';
import { BeanPerformer } from '../../shared/AudioViz';
import { audioKindOf } from '../../shared/audioVizLogic';
import { ownAccountsNow, jobCostText, ledgerUsd, usdToken } from '../../shared/billing';
import { useToolModels, modelOfEngine, shownName } from '../../shared/models';
import { QueueLine } from '../edge/Edge';
import FeedToolbar from '../next/feed/FeedToolbar';
import SelectBar, { unselectable } from '../next/feed/SelectBar';
import FeedCard from '../next/feed/FeedCard';
import { useFeedState, useFeedViewer, FeedGallery } from '../next/feed/ResultFeed';
import { useLiveJobs } from '../next/feed/FeedScope';
import { audioScope, emptyTextFor, type FeedScope } from '../next/feed/feedFilter';
import { AUDIO_FEED_GROUPS, audioWorkflowOfJob } from '../../../../server/src/shared/audioFeed';
import { audioWorkflowById } from '../../../../server/src/shared/audioWorkflows';
import { typedPromptOf } from '../../../../server/src/shared/typedPrompt';
import '../next/imageCanvas.css';
import '../next/feed/feed.css';
import './audioPage.css';

/** Every Audio workflow's results; Filter › Type narrows to Music, Sound effects, Voice or For a video. */
const SCOPE: FeedScope = audioScope();
/** Workflows whose kind chip already says it all (Music, Sound FX, Voiceover); the others name themselves ("Cover a song"). */
const PLAIN_KIND = new Set(['music', 'sfx', 'voiceover']);
const isActive = (j: JobState) => j.status === 'queued' || j.status === 'running' || (j.status as string) === 'needs_decision';
/** The tile test id (the viewer gives focus back to it on close). */
export const audioTileId = (id: string) => `ap-cell-${id || 'new'}`;

/** Jobs seen running or queued during this visit that are now done: their card's SyteSim cheers once when it appears. */
function useJustFinished(jobs: JobState[]): Set<string> {
  const running = useRef(new Set<string>()); const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const add: string[] = [];
    for (const j of jobs) { if (!j.id) continue; if (j.status === 'running' || j.status === 'queued') running.current.add(j.id); else if (j.status === 'done' && running.current.delete(j.id)) add.push(j.id); }
    if (add.length) setFresh(f => { const n = new Set(f); for (const id of add) n.add(id); return n; });
  }, [jobs]);
  return fresh;
}
/* SyteSim's warm-up on a generating tile: one shared performer (AudioViz), plain words under the progress */
const warmUp = <BeanPerformer move="warmUp" bpm={92} testId="ap-warmup" />;
const WARM_NOTE: Record<'music' | 'voice' | 'sfx', string> = { music: 'SyteSim is warming up for your track', voice: 'SyteSim is getting ready to listen', sfx: 'SyteSim is getting ready for your sound' };
/* one of the app's examples (the Examples project, $0 for you): what its run really cost the app's authors, never the seed's 0 */
const exPrice = (ex: { runOn?: string; costUsd?: number | null }) => ex.runOn === 'local' || !ex.costUsd ? 'Free' : usdToken(ex.costUsd);
const price = (j: JobState) => { const ex = (j as any).example; if (ex) return exPrice(ex); const c = (j as any).cost; if ((j as any).demo || (j as any).input?.demo) return 'Sample'; if (c == null) return null; if (c === 0) return 'Free'; return ownAccountsNow() ? jobCostText(c, (j as any).runOn) : ledgerUsd(c); };

/** The first page is on its way: cells shaped like the real grid (same columns, same card height). They fade in after a beat, so a quick local
 *  answer (a workflow switch) shows nothing at all instead of a flash. */
export function AudioFeedSkeleton({ count = 8 }: { count?: number }) {
  return <div className="ap-skel" role="status" aria-label="Loading your sounds" data-testid="ap-skel">{Array.from({ length: count }, (_, i) => <span key={i} className="ap-skel-i" aria-hidden><i /><b /><em /></span>)}</div>;
}

export default function AudioFeed({ jobs }: { jobs: JobState[] }) {
  useToolModels('audio'); useToolModels('voice'); useToolModels('soundtrack');
  /* live from anywhere: the page's own runs plus every queued / running job on the server and the ones that finished since load (the shared poller) */
  const live = useLiveJobs(jobs);
  const fs = useFeedState(live, { scope: SCOPE, sizeKey: 'ohf:feedSize:audio' }); const { pj, filt, setFilt, feed, selecting, setSelecting, sel, setSel, allBusy, stopSelect, togglePick, selectAll } = fs;
  const shown = feed.jobs.filter(j => j.status !== 'canceled');
  const firstLoad = feed.loading && !shown.length && !feed.stale;
  const viewable = shown.filter(j => !isActive(j) && !!j.id);
  const v = useFeedViewer(viewable, undefined, audioTileId, !feed.loading);
  const cheer = useJustFinished(shown);
  const card = (j: JobState, i: number) => { const w0 = audioWorkflowOfJob(j as any); const w = w0 ? audioWorkflowById(w0) : null; const m = modelOfEngine(j.toolId, j.provider);
    const model = (m ? shownName(m) : null) ?? j.provider ?? ''; const prompt = typedPromptOf((j as any).input).trim(); const title = prompt || w?.name || 'Audio';
    const kind = audioKindOf({ toolId: j.toolId, workflow: w0 }); const src = j.resultUrl ?? (j as any).outputs?.[0]?.url ?? null; const act = isActive(j) || !j.id;
    return <FeedCard key={j.id || (j as any).clientKey || `new-${i}`} job={j} ar={1} active={act} idPre="ap" testId={audioTileId(j.id)} className="ap-tile"
      run={<GenTile job={j} testId={`ap-run-${j.id || 'new'}`} art={warmUp} note={WARM_NOTE[kind]} tag={w?.name} />} on={v.viewId === j.id}
      selecting={selecting} picked={selecting && sel.has(j.id)} noPick={selecting ? unselectable(j) : null} tag={j.status === 'done' && src ? null /* the card's own kind chip says it */ : w?.name ?? null} caption={null}
      onOpen={e => v.open(j.id, 0, e.currentTarget)} onTogglePick={() => togglePick(j)} media={null}
      body={j.status === 'done' && src ? <AudioCard src={src} title={title} model={model} price={price(j)} duration={Number((j as any).input?.outputDuration) || null /* the output's real length only (audit B2): input.duration is what was asked (a cap, or a server default for a model with none); the card reads the file's own length */}
        onOpen={from => v.open(j.id, 0, from)} testId={`ap-card-${j.id}`} kind={kind} tag={w && !PLAIN_KIND.has(w.id) ? w.name : null} seed={j.id} prompt={prompt || w?.name} lyrics={typeof (j as any).input?.lyrics === 'string' ? (j as any).input.lyrics : null}
        jobId={j.id} danceStyle={(j as any).danceStyle} cheer={cheer.has(j.id)} /> : undefined} />; };
  const emptyText = fs.isDefault ? 'No sounds yet. Describe a song, a voice or a sound effect below and press Generate.' : emptyTextFor(filt, pj.pid, SCOPE);
  return <div className="ic ic2 apf" data-testid="ap-feed">
    <FeedGallery title="Audio" st={fs} count={shown.length} emptyText={emptyText} testId="ap-grid" className="ap-gal" override={firstLoad ? <AudioFeedSkeleton /> : undefined}
      toolbar={selecting ? <SelectBar sel={sel} setSel={setSel} total={feed.total} onExit={stopSelect} selectAll={selectAll} allLoading={allBusy} projects={pj.list} currentProject={pj.pid} patch={feed.patch} unpatch={feed.unpatch} refresh={feed.refresh}
          noun="sound" onTrashed={ids => { if (v.viewId && ids.includes(v.viewId)) v.setViewId(null); }} />
        : <FeedToolbar f={filt} setF={setFilt} groups={AUDIO_FEED_GROUPS} noun="sounds" from={['mine', 'featured']} total={feed.total} failed={feed.failed} loading={feed.loading} pj={pj} selecting={selecting} onSelect={() => selecting ? stopSelect() : setSelecting(true)} live={<QueueLine className="ic-gal-live" />} />}>
      {shown.map((j, i) => card(j, i))}
    </FeedGallery>
    {v.viewJob && (v.viewJob.status === 'done' && (v.viewJob.resultUrl || (v.viewJob as any).outputs?.length)
      ? <ResultView variant="viewer" job={v.viewJob} out={v.viewOut} beforeUrl={v.viewJob.resultUrl ?? ''} title={(v.viewJob as any).example ? (v.viewJob as any).example.title : "Your sound"} onClose={v.close} {...v.nav} />
      : <FailedViewer job={v.viewJob} model={(v.viewJob as any).modelName ?? (v.viewJob as any).model} onClose={v.close} {...v.nav} />)}
  </div>;
}
