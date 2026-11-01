import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { existsSync, linkSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR, config } from './config.js';
import * as lib from './library.js';
import { jobs, persistJob, type Job } from './jobs.js';
import { parseReelOptions, reelPlan, reelResumePlan, reelMusicAction, REEL_MOODS, type ReelOptions } from './shared/photosToReel.js';
import { clipArgs } from './shareExport.js';
import { cameraDefaultMove, cameraPresetOff } from './tools/apps.js';
import { fillPattern } from './shared/promptPatterns.js';
import { jobSpendView } from './billing.js';
import { runFfmpeg, mediaDuration } from './ffmpeg.js';

export const REEL_TOOL = 'app-photos-to-reel';
const retryLocks = new Map<string, Promise<void>>();
/** Concurrent retry clicks must share one new parent, even while its quote is still being computed. */
export async function withReelRetryLock<T>(id: string, run: () => Promise<T>): Promise<T> {
  const previous = retryLocks.get(id); let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }); retryLocks.set(id,gate);
  if (previous) await previous;
  try { return await run(); } finally { release(); if (retryLocks.get(id) === gate) retryLocks.delete(id); }
}

const canceled = (j: Job) => j.status === 'canceled';
const terminal = (j: Job) => !['queued', 'running', 'needs_decision'].includes(j.status);
const touch = (j: Job) => { j.updatedAt = Date.now(); persistJob(j); };
const bad = (reply: FastifyReply, error: string, field = '') => reply.code(400).send({ error, errorType: 'validation', issues: [{ code: 'invalid', field, message: error }], charged: false });
const query = (v: Record<string, unknown>) => new URLSearchParams(Object.entries(v).filter(([,x]) => x != null && x !== '').map(([k,x]) => [k,String(x)])).toString();
/** Choose only presets supported by the quoted model, without switching its camera engine. */
export function reelCameraFields(v: Record<string, any>, photoOrdinal = 0) {
  const provider = v.model === 'ltx-2-19b' ? 'cloud-ltx-camera' : v.provider || (v.runOn === 'local' ? 'comfy-open' : 'api-minimax-h3');
  const fallback = cameraDefaultMove(provider);
  const ltx = provider === 'cloud-ltx-camera' || !!fallback?.startsWith('ltx-');
  const sequences: Record<string, string[]> = {
    listing: ['default', 'pan-left', 'crane-up'],
    event: ['default', 'pan-right', 'pull-out', 'crane-up'],
    hotel: ['default', 'pan-left', 'pull-out'],
    trip: ['default', 'crane-up', 'pan-right'],
    product: ['default', 'pan-left', 'pull-out'],
  };
  const sequence = sequences[v.kind] ?? sequences.listing;
  const chosen = sequence[photoOrdinal % sequence.length];
  const equivalents: Record<string,string> = { 'pan-left':'ltx-dolly-left', 'pan-right':'ltx-dolly-right', 'crane-up':'ltx-jib-up', 'pull-out':'ltx-dolly-out' };
  const candidate = chosen === 'default' ? fallback : ltx ? equivalents[chosen] : chosen;
  const move = candidate && !cameraPresetOff([candidate], provider) ? candidate : fallback;
  const model = ltx ? 'ltx-2-19b' : provider === 'api-minimax-h3' ? 'minimax-h3' : provider === 'comfy-open' ? 'wan-camera' : v.model;
  // The normal Camera parser/backend writes the selected move through its model's camera-move pattern.
  // This supplementary paragraph supplies pace and scene continuity, never a second conflicting move.
  const pace = v.kind === 'event' ? 'brisk, lively and controlled' : v.kind === 'hotel' ? 'very slow, smooth and steady' : 'slow, smooth and gentle';
  return { provider:v.provider, model:v.model, runOn:v.runOn, route:v.route, resolution:v.resolution || '720p', seconds:5, aspect:'9:16',
    types:JSON.stringify([move].filter(Boolean)), image:'1', rights:'1', prompt:fillPattern('camera-scene', model, { pace }) };
}
const cameraFields = reelCameraFields;
const musicFields = (v: Record<string, any>) => ({ provider: v.musicProvider || (v.runOn === 'local' ? 'comfy-acestep' : undefined), runOn: v.runOn === 'local' ? 'local' : undefined, route: v.musicRoute, seconds: v.seconds, types: '["music"]', video: '1', rights: '1', prompt: REEL_MOODS[v.kind as ReelOptions['kind']] });

/** Price every paid step through the same route-aware endpoint used for its submit. */
export async function quoteReel(app: FastifyInstance, v: Record<string, any>, pendingCameraCount?: number, pendingMusicCount = 1) {
  const count = Number(v.photoCount), o = parseReelOptions(v, count, true);
  if ('error' in o) return { status: 400, body: { ...o, valid: false, priceAvailable: false } };
  const plan = reelPlan(count, o);
  const request = async (tool: string, fields: Record<string, unknown>) => { const r = await app.inject({ method: 'GET', url: `/api/tools/${tool}/price?${query(fields)}` }); return { status: r.statusCode, body: r.json() }; };
  const camera = await request('camera', cameraFields(v));
  if (camera.status !== 200 || camera.body.valid === false || camera.body.priceAvailable === false || camera.body.runnable === false || !Number.isFinite(camera.body.credits)) return { status: camera.status === 200 ? 400 : camera.status, body: { ...camera.body,reelStep:'Camera Moves' } };
  const music = o.music === 'on' ? await request('app-music-bed', musicFields({ ...v, ...o })) : null;
  if (music && (music.status !== 200 || music.body.valid === false || music.body.priceAvailable === false || music.body.runnable === false || !Number.isFinite(music.body.credits))) return { status: music.status === 200 ? 400 : music.status, body: { ...music.body,reelStep:'Music Bed' } };
  const steps = [{ toolId: 'camera', count: pendingCameraCount ?? plan.cameraCount, quote: camera.body }, ...(music ? [{ toolId: 'app-music-bed', count: pendingMusicCount, quote: music.body }] : [])];
  const credits = steps.reduce((s,x) => s + Number(x.quote.credits ?? 0) * x.count, 0);
  const realRunUsd = steps.reduce((s,x) => s + Number(x.quote.cost?.realRunUsd ?? x.quote.cost?.estUsd ?? 0) * x.count, 0);
  const estUnits = steps.reduce((s,x) => s + Number(x.quote.cost?.estUnits ?? 0) * x.count, 0);
  const listCredits = steps.reduce((s,x) => s + Number(x.quote.listCredits ?? x.quote.credits ?? 0) * x.count, 0);
  const estUsd = steps.reduce((s,x) => s + Number(x.quote.cost?.estUsd ?? 0) * x.count, 0);
  const activeSteps = steps.filter(x => x.count > 0);
  const accounts = [...new Set(activeSteps.map(x => x.quote.cost?.billedTo).filter(Boolean))];
  const mixedAccounts = accounts.length > 1;
  return { status: 200, body: { ...camera.body, composite: true, toolId: REEL_TOOL, routeId: camera.body.routeId ?? camera.body.route, route: camera.body.routeId ?? camera.body.route, credits, listCredits, exactUsd: realRunUsd, photoCount: count, cameraCount: pendingCameraCount ?? plan.cameraCount, seconds: o.seconds,
    cost: { ...(activeSteps[0]?.quote.cost ?? { billedTo:'local',billedToName:'This computer',estimated:false,demo:config.backend==='mock' }), ...(mixedAccounts ? { billedTo: null, billedToName: 'Multiple accounts', estUnits: undefined, unitLabel: undefined, sourceUrl: null, plan: null, failureRule: 'varies', failureNote: 'Each step follows its account’s billing rules.' } : {}), estUsd, credits, realRunUsd, estUnits: mixedAccounts ? undefined : estUnits, accounts: activeSteps.map(x => ({ toolId:x.toolId, count:x.count, ...x.quote.cost, estUnits:x.quote.cost?.estUnits==null?undefined:Number(x.quote.cost.estUnits)*x.count, usdText:`~$${(Number(x.quote.cost?.realRunUsd ?? x.quote.cost?.estUsd ?? 0)*x.count).toFixed(2)}`, estUsd:Number(x.quote.cost?.estUsd ?? 0)*x.count, realRunUsd:Number(x.quote.cost?.realRunUsd ?? x.quote.cost?.estUsd ?? 0)*x.count })), usdText: realRunUsd > 0 ? `~$${realRunUsd.toFixed(2)}` : 'Free', detail: 'Total for the reel; individual steps use their own billing accounts.' }, priceText: realRunUsd > 0 ? `~$${realRunUsd.toFixed(2)}` : 'Free', breakdown: steps.map(x => ({ label: `${x.count} × ${x.toolId === 'camera' ? 'Camera Moves' : 'Music Bed'}`, factor: x.count, credits: Number(x.quote.credits ?? 0) * x.count })), steps,
    local: steps.every(x => x.quote.local), localRun: steps.every(x => x.quote.localRun), priceAvailable: true, valid: true } };
}

function headersOf(req: FastifyRequest) {
  const out: Record<string,string> = {};
  for (const key of ['x-ohf-agent-budget','x-client-id']) { const v = req.headers[key]; if (typeof v === 'string') out[key] = v; }
  return out;
}
async function submit(app: FastifyInstance, parent: Job, tool: string, fields: Record<string,unknown>, header: Record<string,string>, key: string) {
  if (canceled(parent)) throw new Error('Canceled');
  const savedQuote = parent.input.stepQuotes[tool === 'camera' ? 0 : 1]?.quote;
  fields = { ...fields, ...(savedQuote ? { quotedCredits: savedQuote.credits, quotedRouteId: savedQuote.routeId ?? savedQuote.route, allowFallback: '0' } : {}) };
  const boundary = `reel${randomUUID()}`;
  const payload = Object.entries({ ...fields, parentId: parent.id, reelParentId:parent.id, boardId: parent.input.boardId }).filter(([,v]) => v != null).map(([k,v]) => `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${String(v)}\r\n`).join('') + `--${boundary}--\r\n`;
  const r = await app.inject({ method:'POST', url:`/api/tools/${tool}/jobs`, headers:{ ...header, 'content-type':`multipart/form-data; boundary=${boundary}`, 'idempotency-key':`reel:${parent.id}:${key}` }, payload });
  const body = r.json(); if (r.statusCode !== 200 || !body.id) throw new Error(reelErrorText(body, `Could not start ${tool === 'camera' ? 'this photo' : 'the music'}.`));
  const child = jobs.get(body.id); if (!child) throw new Error('The child job was not saved.');
  if (key.startsWith('photo-')) parent.input.photoJobs[Number(key.slice(6))] = child.id;
  if (key === 'music') parent.input.musicJobId = child.id;
  child.input.reelParentId = parent.id; child.parentId=parent.id; touch(child);
  parent.input.childIds.push(child.id); parent.input.activeChild = child.id; touch(parent);
  while (!terminal(child)) {
    if (canceled(parent)) { await app.inject({ method:'POST', url:`/api/jobs/${child.id}/cancel`, headers: header }); throw new Error('Canceled'); }
    if (child.status === 'needs_decision') { parent.stage = 'Choose where to continue this step'; touch(parent); }
    await new Promise(r => setTimeout(r, 250));
  }
  parent.input.activeChild = null; touch(parent);
  if (child.status !== 'done' || !child.resultUrl) throw new Error(reelErrorText({ error: child.error, code:child.reasonCode }, 'This step did not finish.'));
  return child;
}

async function runReel(app: FastifyInstance, job: Job, headers: Record<string,string>) {
  if (canceled(job)) return;
  const input = job.input, o = input.options as ReelOptions, plan = reelPlan(input.photoUrls.length, o);
  try {
    job.status = 'running'; job.startedAt = Date.now(); touch(job);
    const clips: string[] = []; input.clipsByPhoto ??= {}; input.failedPhotos = [];
    for (let i = 0; i < input.photoUrls.length; i++) {
      if (canceled(job)) return;
      input.currentPhoto = i; job.stage = `Photo ${i + 1} of ${input.photoUrls.length}`; job.progress = Math.round(i / input.photoUrls.length * 75); touch(job);
      try {
        if (input.clipsByPhoto[i]) { clips.push(input.clipsByPhoto[i]); continue; }
        // A restart may leave a normal camera child reconnecting. Reuse that run instead of paying for a duplicate.
        const previous = jobs.get(input.photoJobs[i]);
        if (previous && !terminal(previous)) {
          input.activeChild = previous.id; touch(job);
          while (!terminal(previous)) { if (canceled(job)) return; await new Promise(r => setTimeout(r,250)); }
          input.activeChild = null;
        }
        if (previous?.status === 'done' && previous.resultUrl) { input.clipsByPhoto[i] = previous.resultUrl; clips.push(previous.resultUrl); continue; }
        if (plan.heroes.includes(i)) {
          const child = await submit(app, job, 'camera', { ...cameraFields(input.fields, plan.heroes.indexOf(i)), '@file:image': input.photoUrls[i], image: undefined,
            simulate: config.backend === 'mock' && String(input.fields.simulateGroup ?? '').split(',').map(Number).includes(i+1) ? 'temporary' : '' }, headers, `photo-${i}`);
          clips.push(child.resultUrl!); input.clipsByPhoto[i] = child.resultUrl; input.photoJobs[i] = child.id;
        } else {
          const name = `${job.id}-still-${i}.mp4`, out = path.join(DATA_DIR,name);
          const code = await runFfmpeg(clipArgs(path.join(DATA_DIR,input.photos[i]), 'still', null, out, { W:720,H:1280,secs:5,blurFit:true,zoomSeconds:plan.photoSeconds }));
          if (code !== 0 || !existsSync(out)) throw new Error('Could not make this photo’s slow zoom.');
          clips.push(`/files/${name}`); input.clipsByPhoto[i] = `/files/${name}`;
        }
      } catch (e) {
        if (canceled(job)) return;
        job.partial = true; input.failedPhotos.push(i); job.failedGroups = [...input.failedPhotos]; job.warnings.push(`Photo ${i+1}: ${(e as Error).message}`);
      }
      touch(job);
    }
    if (canceled(job)) return;
    if (!clips.length) throw new Error('None of the photos finished. Retry the failed photo jobs.');
    job.stage = 'Stitching'; job.progress = 80; touch(job);
    const perClip = o.seconds / clips.length;
    // Hold a short successful clip’s final frame so partial completion keeps the requested reel length.
    for (let i=0;i<clips.length;i++) {
      const file = path.join(DATA_DIR,path.basename(clips[i]));
      if (await mediaDuration(file) + 0.02 < perClip) {
        const name = `${job.id}-hold-${i}.mp4`;
        const code = await runFfmpeg(clipArgs(file,'clip',null,path.join(DATA_DIR,name),{W:720,H:1280,secs:perClip,blurFit:true,hold:true}));
        if (code !== 0) throw new Error('Could not keep the requested reel length. Retry the reel.');
        clips[i] = `/files/${name}`;
      }
      if (canceled(job)) return;
    }
    const savedCompose = input.composeJobId ? jobs.get(input.composeJobId) : null;
    let body: { id: string; resultUrl: string };
    if (savedCompose?.status === 'done' && savedCompose.resultUrl) body = { id: savedCompose.id, resultUrl: savedCompose.resultUrl };
    else {
      const r = await app.inject({ method:'POST', url:'/api/compose', headers, payload:{ clips, trims:clips.map(() => ({ in:0,out:perClip })), aspect:'9:16', fit:'blur', transition:'cut', title:o.title,
        titleCard:{ text:o.title, mode:'over', sec:Math.min(2,perClip) }, ...(o.endLine ? { endCard:{ text:o.endLine, mode:'over', sec:Math.min(2,perClip) } } : {}), keepClipAudio:false } });
      const result = r.json(); if (r.statusCode !== 200 || !result.resultUrl) throw new Error(result.error || 'Could not stitch the reel.');
      body = result; input.composeJobId = body.id; const compose = jobs.get(body.id); if (compose) { compose.parentId = job.id; compose.input.reelParentId = job.id; touch(compose); }
    }
    touch(job);
    if (canceled(job)) return;
    let result = body.resultUrl;
    if (o.music === 'on') {
      job.stage = 'Adding music'; job.progress = 90; touch(job);
      try {
        const previousMusic = input.musicJobId ? jobs.get(input.musicJobId) : null;
        if (previousMusic && !terminal(previousMusic)) {
          input.activeChild = previousMusic.id; touch(job);
          while (!terminal(previousMusic)) { if (canceled(job)) return; await new Promise(r => setTimeout(r,250)); }
          input.activeChild = null;
        }
        if (previousMusic?.status === 'done' && previousMusic.resultUrl) result = previousMusic.resultUrl;
        else {
          if (reelMusicAction(previousMusic?.status, Number(input.stepQuotes[1]?.count ?? 0)) !== 'submit') throw Object.assign(new Error('The existing music run did not finish. Retry the reel to review the price of a new music run.'), { reelNeedsRetry: true });
          const music = await submit(app, job, 'app-music-bed', { ...musicFields({...input.fields,...o}), video:undefined, fromJob:body.id, simulate:config.backend === 'mock' ? input.fields.simulateMusic : undefined }, headers, 'music'); result = music.resultUrl!;
        }
      }
      catch (e) { if (canceled(job)) return; if ((e as any).reelNeedsRetry) throw e; job.partial = true; input.failedMusic = true; job.warnings.push(`Music was left out: ${(e as Error).message}`); }
    }
    if (canceled(job)) return;
    job.resultUrl = result; job.outputs = [{ label:o.title,url:result }]; job.status = 'done'; job.progress = 100; job.stage = 'done';
  } catch (e) { if (!canceled(job)) { job.status = 'failed'; job.stage = 'failed'; job.error = (e as Error).message; } }
  finally { updateReelSpend(job); job.finishedAt = Date.now(); touch(job); }
}

export async function startReel(app: FastifyInstance, req: FastifyRequest, reply: FastifyReply, id: string, fields: Record<string,string>, files: Record<string,string[]>, resume?: Job) {
  // Recreate links only the original parent's recorded photos, never caller-supplied disk paths.
  if (!files.photos?.length && fields.fromJob && fields.reuseInputs) {
    const old = jobs.get(fields.fromJob);
    if (old?.toolId === REEL_TOOL && !lib.metaOf(old.id).deletedAt) {
      files.photos = [];
      for (const [i, name] of (old.input.photos ?? []).entries()) {
        if (typeof name !== 'string' || path.basename(name) !== name || !existsSync(path.join(DATA_DIR,name))) return bad(reply,'A photo is no longer available.','photos');
        const dst = `${id}-photos${i}${path.extname(name)}`;
        try { linkSync(path.join(DATA_DIR,name),path.join(DATA_DIR,dst)); } catch { copyFileSync(path.join(DATA_DIR,name),path.join(DATA_DIR,dst)); }
        files.photos.push(dst);
      }
    }
  }
  const o = parseReelOptions(fields, files.photos?.length ?? 0);
  if ('error' in o) return bad(reply,o.error,o.field);
  const resumePlan = reelResumePlan(files.photos.length,o,resume ? { clipsByPhoto:resume.input.clipsByPhoto, musicStatus:jobs.get(resume.input.musicJobId)?.status } : undefined);
  const quote = await quoteReel(app,{...fields,photoCount:files.photos.length},resumePlan.pendingCameraCount,resumePlan.pendingMusicCount);
  if (quote.status !== 200) return reply.code(quote.status).send(quote.body);
  const { admitBudget, budgetOfRequest } = await import('./agentBudget.js');
  const admission = admitBudget(budgetOfRequest(req), { jobId: id, toolId: REEL_TOOL, model: null, estUsd: quote.body.cost.estUsd, credits: quote.body.demo ? 0 : quote.body.credits, hold: false });
  if ('refused' in admission) return reply.code(admission.refused.status).send(admission.refused.body);
  const quoted = fields.quotedCredits == null || fields.quotedCredits === '' ? null : Number(fields.quotedCredits);
  if (quoted != null && Number.isFinite(quoted) && Number(quote.body.credits) > quoted + 0.000001) return reply.code(409).send({ error: 'route_changed', code: 'route_changed', message: 'The reel price has changed. Review the new price and press Generate again.', charged: false, quote: quote.body, quotedCredits: quoted, credits: quote.body.credits, dearer: true });
  const cameraQuote = quote.body.steps[0].quote, musicQuote = quote.body.steps[1]?.quote;
  fields = { ...fields, provider: cameraQuote.provider ?? fields.provider, route: cameraQuote.routeId ?? cameraQuote.route ?? fields.route, ...(musicQuote ? { musicProvider: musicQuote.provider, musicRoute: musicQuote.routeId ?? musicQuote.route } : {}) };
  const { unchangedVisual } = resumePlan;
  const now = Date.now();
  const job: Job = { id,toolId:REEL_TOOL,provider:String(quote.body.provider ?? fields.provider ?? 'composite'),status:'queued',stage:'queued',progress:0,queuePos:0,eta:0,resultUrl:null,outputs:[],error:null,warnings:[],cost:0,simulated:config.backend === 'mock',createdAt:now,parentId:resume?.id ?? fields.fromJob ?? null,
    input:{ ...o,aspect:'9:16', fields, options:o, photos:files.photos,photoUrls:files.photos.map(n=>`/files/${n}`),photosUrls:files.photos.map(n=>`/files/${n}`),prompt:o.title,appPrompt:o.title,retryOf:resume?.id,demo:config.backend === 'mock',reelCost:quote.body.cost,reelCostText:(quote.body.cost.estUsd > 0 || quote.body.cost.realRunUsd > 0) ? `Estimated ${quote.body.cost.usdText} across steps` : 'Free · this computer',stepQuotes:quote.body.steps,...(unchangedVisual ? { composeJobId:resume!.input.composeJobId,musicJobId:resume!.input.musicJobId } : {}),clipsByPhoto:resume ? { ...resume.input.clipsByPhoto } : {},childIds:[],photoJobs:resume ? { ...resume.input.photoJobs } : {},failedPhotos:[],boardId:fields.boardId,lookId:fields.lookId } };
  jobs.set(id,job); touch(job);
  // The parent holds no queue slot or credits. Each child uses the usual submit, spend guard and queue.
  setTimeout(() => { void runReel(app,job,headersOf(req)); },0);
  return { id,toolId:REEL_TOOL,provider:job.provider,cost:0,estimate:quote.body.cost,warnings:[],composite:true };
}

export async function cancelReel(app: FastifyInstance, j: Job) {
  if (terminal(j)) return false;
  updateReelSpend(j); j.status='canceled'; j.stage='canceled'; j.finishedAt=Date.now(); touch(j);
  const id = j.input.activeChild;
  if (id) { const r = await app.inject({method:'POST',url:`/api/jobs/${id}/cancel`}); if (r.statusCode === 409) { j.warnings.push('The current provider run has already started. It may finish and be billed; no further reel steps will start.'); touch(j); } }
  return true;
}

/** Codes are API details; the reel presents the recovery action in plain language. */
export function reelErrorText(body: Record<string,any>, fallback: string): string {
  const code = String(body.code ?? body.error ?? '');
  const known: Record<string,string> = { route_changed:'The price changed. Retry this step to review the new price.', credits:'There are not enough credits for this step.', no_connection:'Connect a model provider or your computer, then retry.', no_provider:'No model is ready for this step. Choose an available model and retry.', weights_missing:'This model is not installed on your computer yet.', model_missing:'This model is not installed on your computer yet.', agent_budget:'This step is over the approved budget.' };
  if (known[code]) return known[code];
  const message = String(body.userMessage ?? body.message ?? body.error ?? '').trim();
  return message && !/^[a-z0-9_:-]+$/i.test(message) ? message : fallback;
}
function updateReelSpend(job: Job) {
  const children = (job.input.childIds ?? []).map((id:string)=>jobs.get(id)).filter(Boolean) as Job[];
  job.input.childCost = children.reduce((sum,j)=>sum+Math.max(0,Number(j.cost??0)-Number(j.refunded??0)),0);
  job.input.childCostUsd = children.reduce((sum,j)=>sum+Number(jobSpendView(j.id)?.countedUsd ?? (j.simulated ? 0 : Math.max(0,Number(j.cost??0)-Number(j.refunded??0))/100)),0);
}
