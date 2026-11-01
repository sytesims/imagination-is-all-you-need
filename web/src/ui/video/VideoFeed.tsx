/**
 * Generate Video's results (2026-10-24): the same feed as Create Image (ui/next/feed: toolbar, justified grid, Select mode, Show more, the shared
 * result viewer), listing every video from the server (one Video feed, narrowed only by Filter: Type, From, Show; ui/video/VideoPage renders it once). A clip card is the shared FeedCard with FeedVideo (first frame, muted play on hover,
 * length); running runs are the shared GenTile, failed ones the shared FailureState. Clicking a card opens ResultView's viewer, where the run-again
 * actions this page had on its old stage (Generate more, Re-run same seed, +5s / +10s, Render final) sit in More.
 */
import type { ReactNode } from 'react';
import type { JobState, ToolInfo } from '../../api';
import GenTile from '../../shared/GenTile';
import ResultView from '../../shared/ResultView';
import { FailedViewer } from '../../shared/ResultViewer';
import { FeedCaption, jobCaption } from '../../shared/FeedCaption';
import { useOwnAccounts } from '../../shared/billing';
import { QueueLine } from '../edge/Edge';
import FeedToolbar from '../next/feed/FeedToolbar';
import SelectBar, { unselectable } from '../next/feed/SelectBar';
import FeedCard, { FeedVideo } from '../next/feed/FeedCard';
import { videoOutOf, askedAr, clampAr, tileMaxH, videoTag } from '../next/feed/feedMedia';
import { useFeedState, useFeedViewer, FeedGallery } from '../next/feed/ResultFeed';
import { feedSections, groupSets, setWords } from '../next/feed/feedLayout';
import { SetRow, useSetFold } from '../next/feed/SetRow';
import { CompareIcon } from '../Icons';
import { emptyTextFor, videoScope, type FeedScope } from '../next/feed/feedFilter';
import { ALL_VIDEO_FEED, VIDEO_FEED_GROUPS, inVideoFeed, videoWorkflowNameOf } from '../../../../server/src/shared/videoFeed';
import { useLiveJobs, UploadsFeed, useUploads } from '../next/feed/FeedScope';
import '../next/imageCanvas.css';
import '../next/feed/feed.css';
import { typedPromptOf } from '../../../../server/src/shared/typedPrompt';

/** Every video; Filter › Type narrows it to one of server/src/shared/videoFeed.ts VIDEO_FEED_GROUPS (feedFilter scopeFor). */
const SCOPE: FeedScope = videoScope(ALL_VIDEO_FEED);
const isActive = (j: JobState) => j.status === 'queued' || j.status === 'running';
export default function VideoFeed({ jobs, onSelect, viewerActions, tools, workflowId = 'create' }: { jobs: JobState[]; onSelect: (id: string) => void; /** the tool list: the viewer offers Extend and Upscale when they exist */ tools?: ToolInfo[];
  /** the workflow picked in the bar ('create' or 'all' = Create Video): only whose run-again actions the viewer offers; never filters */ workflowId?: string;
  /** the More menu's run-again items for the open clip */ viewerActions?: (j: JobState, close: () => void) => ReactNode }) {
  /* One Video feed always (user, 2026-10-26: "one Video feed always, workflow only changes the bar"), like the Image tab: every video, narrowed only
   * by Filter (Type, From, Show). Picking a workflow never filters or resets it. */
  const barWf = !workflowId || workflowId === ALL_VIDEO_FEED ? 'create' : workflowId;
  /* Live jobs from anywhere (2026-10-26): the page's own runs plus every queued / running job on the server (another workflow, tab, MCP, Canvas)
   * and the ones that finished since load, so a run started elsewhere shows at once with its progress and turns into its result */
  const live = useLiveJobs(jobs);
  const fs = useFeedState(live, { scope: SCOPE, sizeKey: 'ohf:feedSize:video' }); const { pj, filt, setFilt, feed, selecting, setSelecting, sel, setSel, allBusy, stopSelect, togglePick, selectAll } = fs;
  /* Filter › From › Uploads (2026-10-26): your uploaded clips from the media library, not jobs (ui/next/feed/FeedScope UploadsFeed) */
  const upOn = filt.source === 'uploads'; const up = useUploads('video', pj.pid, filt, upOn);
  const own = useOwnAccounts();
  /* a set (clips that share a compare id, e.g. video variations) sits together and opens or folds into one card, like the Image feed's (SetRow) */
  const shown = groupSets(feed.jobs.filter(j => j.status !== 'canceled') as (JobState & { compare?: any })[]) as JobState[];
  const fold = useSetFold(); const items = feedSections(shown as (JobState & { compare?: any })[], j => [j], fold.isOpen);
  const setIds = items.flatMap(it => it.group ? [it.group] : []);
  const viewable = shown.filter(j => !isActive(j));
  const v = useFeedViewer(viewable, onSelect, id => `vf-tile-${id}`, !feed.loading);
  const tagOf = (j: JobState) => videoWorkflowNameOf(j as any) ?? videoTag(j); /* every card names the workflow that made it */
  const card = (j: JobState) => { const out = videoOutOf(j); const ar = out?.ar ?? askedAr(j); const act = isActive(j); const cap = jobCaption(j, own); const prompt = typedPromptOf((j as any).input).trim();
    return <FeedCard key={j.id || (j as any).clientKey || 'new'} job={j} ar={ar} active={act} idPre="vf" testId={`vf-tile-${j.id}`} className="vf-tile"
      run={<GenTile job={j} tag={tagOf(j)} testId={`vf-run-${j.id}`} />} on={v.viewId === j.id} selecting={selecting} picked={selecting && sel.has(j.id)} noPick={selecting ? unselectable(j) : null}
      tag={tagOf(j)} onOpen={e => v.open(j.id, 0, e.currentTarget)} onTogglePick={() => togglePick(j)}
      media={out ? <FeedVideo src={out.url} poster={out.poster} sec={out.sec} width={tileMaxH() * clampAr(ar)} testId={`vf-video-${j.id}`} /> : null}
      caption={act ? null : j.status !== "done" ? undefined : <FeedCaption className="vf-cap" title={prompt || cap.model} parts={[prompt ? cap.model : null, cap.price]} testId={`vf-cap-${j.id}`} />} />; };
  return <div className="ic ic2 vf" data-testid="vf">
    <div className="ic-work ic-work2" data-testid="vs-history">
      <FeedGallery title="Video" st={fs} count={upOn ? up.items.length : shown.length} emptyText={emptyTextFor(filt, pj.pid, SCOPE)} testId="vf-feed" override={upOn ? <UploadsFeed up={up} media="video" size={filt.size} idPre="vf" /> : undefined}
        toolbar={selecting ? <SelectBar sel={sel} setSel={setSel} total={feed.total} onExit={stopSelect} selectAll={selectAll} allLoading={allBusy} projects={pj.list} currentProject={pj.pid} patch={feed.patch} unpatch={feed.unpatch} refresh={feed.refresh}
            noun="clip" onTrashed={ids => { if (v.viewId && ids.includes(v.viewId)) v.setViewId(null); }} />
          : <FeedToolbar f={filt} setF={setFilt} groups={VIDEO_FEED_GROUPS} noun="videos" sets={setIds.length ? { n: setIds.length, open: items.filter(it => it.group && !it.folded).length, setAll: o => fold.setOpen(setIds, o) } : null} total={upOn ? up.total : feed.total} failed={upOn ? null : feed.failed} loading={upOn ? up.loading : feed.loading} pj={pj} selecting={selecting} onSelect={() => selecting ? stopSelect() : setSelecting(true)} live={<QueueLine className="ic-gal-live" />} />}>
        {items.map(it => it.group
          ? <SetRow key={`g-${it.group}`} id={it.group} jobs={it.jobs} open={!it.folded} onToggle={o => fold.setOpen([it.group!], o)} thumbOf={j => videoOutOf(j)?.poster ?? null}
              head={f => <div className="cmp-gh" data-testid="cmp-group-head"><CompareIcon size={14} /><b>{(w => `${w.title} · ${w.count}`)(setWords(it.jobs as any))}</b>{f}</div>}>{it.jobs.map(card)}</SetRow>
          : [...it.jobs.map(card), it.fill && <i key={`f-${it.jobs[0].id}`} className="ic-jfill" aria-hidden />])}
      </FeedGallery>
      {v.viewJob && (v.viewJob.status === 'done' && (v.viewJob.resultUrl || (v.viewJob as any).outputs?.length)
        ? <ResultView variant="viewer" job={v.viewJob} out={v.viewOut} beforeUrl={(v.viewJob.input as any)?.compareUrl ?? v.viewJob.resultUrl ?? ''} /* a clip edit that keeps a same-size source (Footage Effects) opens the before / after slider */ title="Your clip" onClose={v.close} {...v.nav} menuTop={inVideoFeed(v.viewJob as any, barWf) /* run-again actions belong to the bar's workflow tool (the feed lists every workflow's) */ ? viewerActions?.(v.viewJob, v.close) : undefined} tools={tools} />
        : <FailedViewer job={v.viewJob} model={(v.viewJob as any).modelName ?? (v.viewJob as any).model} onClose={v.close} {...v.nav} />)}
    </div>
  </div>;
}
