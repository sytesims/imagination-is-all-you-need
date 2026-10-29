/**
 * Share cards (Most Viral). Registered from index.ts.
 *  PUT /api/jobs/:id/share/card   the browser-drawn card (PNG 1200×630, web/src/shared/shareCard.ts), only while the result has a share link
 *  GET /s/:token/card.png         the card behind the link preview: the uploaded one, else the server card (shareCard.ts)
 *  GET /s/:token                  the shared result page with Open Graph + X card meta (title, card image, "Made with Imagination Is All You Need · open source")
 * Privacy: only shared, finished, not-trashed results; a revoked link is 404 on the page and the card; the prompt is never shown.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { jobs, type Job } from './jobs.js';
import * as lib from './library.js';
import { getTool } from './tools/registry.js';
import { validCardPng, saveUploadedCard, uploadedCardFile, serverCard, MAX_CARD_BYTES, CARD_W, CARD_H } from './shareCard.js';
import { ownerOf, LOCAL_OWNER } from './owner.js';
import { engineNameOf } from './engineName.js';
import { jobModelFields } from './routing/modelRegistry.js';
import { jobAttribution, nonCommercialOf } from './attribution.js';
import { featureOfJob } from './shared/imageFeatures.js';
import { videoAppFeatureOfJob } from './shared/videoAppWorkflows.js';
import { readProfile } from './profile.js';
import { beanSvg, avatarChoiceOf } from './shared/beanSvg.js';
import { cleanUrl } from './cleanMedia.js';
import { appWorkflowFor } from './shared/appWorkflows.js';
import { layersPosterUrl, ensureLayersPoster } from './layerPoster.js';
import { recipeSettings, sanitizeRecipe, recipePath, RECIPE_VERSION } from './shared/recipe.js';
import { GET_APP_URL } from './shared/projectLinks.js';

/** Where the project lives (share pages and cards link here). OPENHIGGSFIELD_PROJECT_URL overrides. */
export const PROJECT_URL = (process.env.OPENHIGGSFIELD_PROJECT_URL || GET_APP_URL).replace(/\/$/, '');
const esc = (x: string) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
/** Absolute origin for OG URLs: OPENHIGGSFIELD_PUBLIC_URL, else the request's own host (proxies: X-Forwarded-*). */
function originOf(req: FastifyRequest) {
  const env = process.env.OPENHIGGSFIELD_PUBLIC_URL?.trim(); if (env) return env.replace(/\/$/, '');
  const h = req.headers; const proto = String(h['x-forwarded-proto'] ?? '').split(',')[0].trim() || req.protocol || 'http';
  const host = String(h['x-forwarded-host'] ?? '').split(',')[0].trim() || String(h.host ?? 'localhost');
  return `${/^https?$/.test(proto) ? proto : 'http'}://${host.replace(/[^\w.:\-[\]]/g, '')}`;
}
/** What a share preview may say: tool, model, where it ran. Never the prompt. */
export function shareFacts(j: Job) {
  const tool = getTool(j.toolId); const mf = jobModelFields(j as any); let model = ''; try { model = engineNameOf(j); } catch { /* */ }
  /* Round 1 (J16): the model's clean name (no endpoint word such as "edit") and where it ran, in the past tense. */
  return { toolName: tool?.name ?? j.toolId, toolRoute: tool?.route ?? null, model: model.replace(/\s+(edit|i2v|t2v)$/i, '').trim() || null, runOn: mf.runOnLabel ?? null, attribution: jobAttribution(j)?.text ?? null };
}
export { recipeSettings } from './shared/recipe.js';
/** "Copy recipe" on /s/:token and the share sheet: what made the result (tool, workflow, model, settings) so anyone can make one like it in
 *  their own app (shared/recipe.ts has the link format and the checks on the way back in). The prompt is in it only when the sharer chose:
 *  "Show my prompt" on the page, or `withPrompt` from the owner's share sheet. Never a link into the sharer's app, never files or keys. */
export function shareRecipe(j: Job, o: { withPrompt?: boolean } = {}) {
  const f = shareFacts(j); const wf = (() => { try { return appWorkflowFor(j.toolId, String(j.provider ?? '')) as any; } catch { return null; } })();
  const showPrompt = o.withPrompt ?? !!lib.metaOf(j.id).published?.showPrompt; const prompt = typeof j.input?.prompt === 'string' && j.input.prompt.trim() ? j.input.prompt : null;
  const engine = (() => { try { return engineNameOf(j); } catch { return null; } })(); const feat = featureOfJob(j as any, engine) ?? videoAppFeatureOfJob(j as any);
  return { v: RECIPE_VERSION, app: 'Imagination Is All You Need', getIt: PROJECT_URL, tool: { id: j.toolId, name: f.toolName },
    workflow: wf || feat ? { id: feat?.id ?? null, name: feat?.name ?? wf?.name ?? wf?.note ?? null, source: wf?.kind ?? wf?.source ?? null, author: wf?.author ?? null, url: wf?.url ?? null, licence: wf?.licence ?? null, file: wf?.file ?? null } : null,
    model: { id: j.provider ?? null, name: (feat as any)?.model || f.model }, ranOn: f.runOn, settings: recipeSettings(j.input), ...(showPrompt && prompt ? { prompt } : {}) };
}
/** Image to layers (2026-10-24): the share sheet, card and link page show the stacked composite (job.layersPosterUrl), never output 0
 *  (the background plate), plus how many layers there are. */
const IMG = /\.(png|jpe?g|webp)$/i;
export function layerFacts(j: Job): { layers: number | null; layersPosterUrl: string | null } {
  const url = layersPosterUrl(j); return url ? { layers: j.outputs.filter((o) => IMG.test(o.url)).length, layersPosterUrl: url } : { layers: null, layersPosterUrl: null };
}
const sharedJob = (token: string) => { const id = lib.jobByToken(token); const j = id ? jobs.get(id) : undefined; return j && !lib.metaOf(j.id).deletedAt && j.status === 'done' ? j : null; };

export function registerShare(app: FastifyInstance) {
  // ---------------- B. Share cards ----------------
  app.register(async (sub) => {
    sub.addContentTypeParser('image/png', { parseAs: 'buffer', bodyLimit: MAX_CARD_BYTES }, (_r, body, done) => done(null, body));
    sub.put<{ Params: { id: string } }>('/api/jobs/:id/share/card', async (req, reply) => {
      const j = jobs.get(req.params.id); if (!j || lib.metaOf(j.id).deletedAt) return reply.code(404).send({ error: 'not found', errorType: 'not_found' });
      if (ownerOf(j) !== LOCAL_OWNER) return reply.code(403).send({ error: 'Only the owner can set the share card.', errorType: 'forbidden' });
      if (!lib.metaOf(j.id).shareToken) return reply.code(409).send({ error: 'Turn on link sharing first: the card only exists for shared results.', errorType: 'validation', code: 'not_shared' });
      const b = req.body as Buffer; const bad = Buffer.isBuffer(b) ? validCardPng(b) : 'Send the card as image/png.'; if (bad) return reply.code(400).send({ error: bad, errorType: 'validation' });
      saveUploadedCard(j.id, b); return { ok: true, url: `/s/${lib.metaOf(j.id).shareToken}/card.png`, bytes: b.length };
    });
  });
  app.get<{ Params: { token: string } }>('/s/:token/card.png', async (req, reply) => {
    const j = sharedJob(req.params.token); if (!j) return reply.code(404).header('cache-control', 'no-store').send({ error: 'This link was revoked or never existed.', errorType: 'not_found' });
    const up = uploadedCardFile(j.id); const png = existsSync(up) ? readFileSync(up) : await serverCard(j);
    return reply.type('image/png').header('cache-control', 'public, max-age=300').header('x-card-source', existsSync(up) ? 'designed' : 'server').send(png);
  });
  /** Share sheet (step 2): everything the owner's sheet draws and says, in one call. Owner only (it carries the prompt for the Framed card). */
  app.get<{ Params: { id: string } }>('/api/jobs/:id/share/info', async (req, reply) => {
    const j = jobs.get(req.params.id); if (!j || lib.metaOf(j.id).deletedAt) return reply.code(404).send({ error: 'not found', errorType: 'not_found' });
    if (ownerOf(j) !== LOCAL_OWNER) return reply.code(403).send({ error: 'Only the owner can share this.', errorType: 'forbidden' });
    const f = shareFacts(j); const engine = (() => { try { return engineNameOf(j); } catch { return null; } })();
    const feat = featureOfJob(j as any, engine) ?? videoAppFeatureOfJob(j as any);
    const i: any = j.input ?? {}; const files = [i.imageUrl, ...(Array.isArray(i.refUrls) ? i.refUrls : []), i.lastFrameUrl, i.videoUrl].filter((u) => typeof u === 'string' && /^\/(files|samples)\//.test(u));
    const pf = readProfile();
    return { jobId: j.id, toolId: j.toolId, toolName: f.toolName, featureId: feat?.id ?? null, workflow: feat?.name ?? f.toolName, model: (feat as any)?.model || f.model, runOn: f.runOn,
      profile: { displayName: pf.displayName, handle: pf.handle, avatar: avatarChoiceOf(pf.avatar), avatarUrl: pf.avatarUrl && /^(\/files\/|\/samples\/)/.test(pf.avatarUrl) ? pf.avatarUrl : null },
      usedInputPhoto: files.some((u) => !/\.(mp3|wav|m4a|ogg|flac)$/i.test(u)), nonCommercial: nonCommercialOf(j.provider), prompt: typeof i.prompt === 'string' && i.prompt.trim() ? i.prompt.trim() : null,
      repoUrl: PROJECT_URL, ...layerFacts(j) };
  });
  /** Share sheet "Copy recipe" / "Copy recipe link" (2026-10-25): the recipe and the app's own /r link. Owner only; ?prompt=1 puts the prompt in. */
  app.get<{ Params: { id: string }; Querystring: { prompt?: string } }>('/api/jobs/:id/recipe', async (req, reply) => {
    const j = jobs.get(req.params.id); if (!j || lib.metaOf(j.id).deletedAt) return reply.code(404).send({ error: 'not found', errorType: 'not_found' });
    if (ownerOf(j) !== LOCAL_OWNER) return reply.code(403).send({ error: 'Only the owner can share this.', errorType: 'forbidden' });
    const full = shareRecipe(j, { withPrompt: req.query.prompt === '1' }); const s = sanitizeRecipe(full);
    if (!s.ok) return reply.code(422).send({ error: s.error, errorType: 'validation' });
    return reply.header('cache-control', 'no-store').send({ recipe: s.recipe, path: recipePath(s.recipe), hasPrompt: !!s.recipe.prompt });
  });
  app.get<{ Params: { token: string } }>('/s/:token/recipe.json', async (req, reply) => {
    const j = sharedJob(req.params.token); if (!j) return reply.code(404).send({ error: 'This link was revoked or never existed.', errorType: 'not_found' });
    return reply.header('cache-control', 'no-store').send(shareRecipe(j));
  });
  app.get<{ Params: { token: string } }>('/s/:token', async (req, reply) => {
    const j = sharedJob(req.params.token);
    if (!j) return reply.code(404).type('text/html').send('<!doctype html><meta charset="utf-8"><title>Not found · Imagination Is All You Need</title><meta name="robots" content="noindex"><p style="font-family:system-ui">This link was revoked or never existed.</p>');
    const o = originOf(req); const f = shareFacts(j); const url = `${o}/s/${req.params.token}`; const card = `${o}/s/${req.params.token}/card.png`;
    const v = existsSync(uploadedCardFile(j.id)) ? statSync(uploadedCardFile(j.id)).mtimeMs.toFixed(0) : '0';
    const title = `${f.toolName}${f.model ? ` · ${f.model}` : ''}`;
    const made = [f.model && `Made with ${f.model}`, f.runOn && `ran on ${f.runOn}`].filter(Boolean).join(' · ').replace(/^ran/, 'Ran');
    const desc = `Made with Imagination Is All You Need · open source.${made ? ` ${made}.` : ''}`;
    const first = j.outputs[0]; const isVid = !!first && /\.(mp4|mov|webm|m4v)$/i.test(first.url); const src = (u: string) => esc(cleanUrl(u)); // share step 1: metadata-free copies
    const poster = await ensureLayersPoster(j).catch(() => null); const lf = layerFacts(j);
    const media = poster && lf.layers ? `<figure><img src="${src(poster)}" alt="${esc(`${f.toolName}: all ${lf.layers} layers stacked`)}"><figcaption>${lf.layers} layers, stacked</figcaption></figure>`
      + `<div class="lys" aria-label="The layers, bottom first">${j.outputs.filter((x) => IMG.test(x.url)).map((x, k) => `<span class="ly"><img src="${src(x.url)}" alt="" loading="lazy"><b>${esc(x.label || (k === 0 ? 'Background' : `Layer ${k}`))}</b></span>`).join('')}</div>`
      + `<p class="ly-dl"><a class="btn btn-2" href="/api/share/${esc(req.params.token)}/download.zip" download data-layers-zip>Download all ${lf.layers} layers (.zip)</a> <span class="small">Transparent PNGs, one per layer.</span></p>`
      : j.outputs.map((x) => /\.(png|jpe?g|webp|gif)$/i.test(x.url) ? `<figure><img src="${src(x.url)}" alt="${esc(x.label)}"></figure>`
      : /\.(m4a|mp3|wav|ogg|flac)$/i.test(x.url) ? `<figure><audio controls src="${src(x.url)}" aria-label="${esc(x.label)}"></audio></figure>`
      : `<figure><video controls playsinline muted src="${src(x.url)}" aria-label="${esc(x.label)}"></video></figure>`).join('');
    const meta = [['og:type', isVid ? 'video.other' : 'website'], ['og:site_name', 'Imagination Is All You Need'], ['og:title', title], ['og:description', desc], ['og:url', url],
      ['og:image', `${card}?v=${v}`], ['og:image:type', 'image/png'], ['og:image:width', String(CARD_W)], ['og:image:height', String(CARD_H)], ['og:image:alt', `${title}, made with Imagination Is All You Need`],
      ...(isVid ? [['og:video', `${o}${cleanUrl(first.url)}`], ['og:video:type', 'video/mp4']] : [])]
      .map(([p, c]) => `<meta property="${p}" content="${esc(c)}">`).join('\n');
    const tw = [['twitter:card', 'summary_large_image'], ['twitter:title', title], ['twitter:description', desc], ['twitter:image', `${card}?v=${v}`], ['twitter:image:alt', `${title}, made with Imagination Is All You Need`]]
      .map(([n, c]) => `<meta name="${n}" content="${esc(c)}">`).join('\n');
    const repoShort = PROJECT_URL.replace(/^https?:\/\//, '');
    // Who shared it: the bean (or the photo over it; a photo that fails to load falls back to the bean). Same picture as the app's header.
    const pf = readProfile(); const who = pf.displayName || (pf.handle ? `@${pf.handle}` : 'A local creator');
    const byline = `<p class="by" data-byline><span class="av">${beanSvg({ ...avatarChoiceOf(pf.avatar), uid: 'share', size: 32 })}${pf.avatarUrl && /^(\/files\/|\/samples\/|https:\/\/)/.test(pf.avatarUrl) ? `<img src="${esc(pf.avatarUrl)}" alt="" onerror="this.remove()">` : ''}</span><span>Shared by <b>${esc(who)}</b>${pf.displayName && pf.handle ? ` <span class="h">@${esc(pf.handle)}</span>` : ''}</span></p>`;
    return reply.type('text/html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Imagination Is All You Need</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${esc(url)}"><link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><meta name="theme-color" content="#0F1113">
${meta}
${tw}
<style>
:root{color-scheme:dark}body{margin:0;background:#0F1113;color:#F7F7F8;font:500 15px/1.6 Inter,system-ui,-apple-system,sans-serif}
main{max-width:1000px;margin:0 auto;padding:28px 16px 48px}header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:20px}
.wm{display:flex;align-items:center;gap:8px;color:#F7F7F8;text-decoration:none;font-weight:600;letter-spacing:-.01em}.wm-n{display:flex;flex-direction:column;line-height:1.05}.wm-1{font:700 17px/18px "Space Grotesk",Inter,system-ui,sans-serif;letter-spacing:-.02em}.wm-2{font:500 10.5px/12px Inter,system-ui,sans-serif;letter-spacing:.06em;color:#FF7A1A}
h1{font-size:22px;line-height:1.25;margin:0 0 4px}.facts{color:#898A8B;margin:0 0 18px}
figure{margin:0 0 16px}img,video{display:block;max-width:100%;max-height:78vh;margin:0 auto;border-radius:14px;background:#131517}audio{width:100%}figcaption{color:rgba(255,255,255,.5);font-size:13px;margin-top:6px;text-align:center}
.cta{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-top:24px;padding:16px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:#131517}
.cta a{color:#F7F7F8}.btn{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border-radius:10px;background:#FF7A1A;color:#14151A!important;font-weight:600;text-decoration:none}
.cta-b{display:flex;gap:8px;flex-wrap:wrap}button.btn{font:inherit;font-weight:600;cursor:pointer;border:0}.btn-2{background:transparent!important;color:#F7F7F8!important;border:1px solid rgba(255,255,255,.25)}
.by{display:flex;align-items:center;gap:10px;margin:0 0 6px;color:#C9CACB}.by b{color:#F7F7F8}.by .h{color:#898A8B}.av{position:relative;width:32px;height:32px;flex:none;border-radius:50%;overflow:hidden}.av svg,.av img{position:absolute;inset:0;width:32px;height:32px;border-radius:50%;object-fit:cover;margin:0;max-height:none}
.attr{font-weight:600}.small{color:rgba(255,255,255,.5);font-size:12px}
.lys{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px;margin:0 0 12px}.ly{display:flex;flex-direction:column;gap:4px;min-width:0}
.ly img{width:100%;aspect-ratio:1;object-fit:contain;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:repeating-conic-gradient(#16181a 0 25%,#1b1d20 0 50%) 0 0/12px 12px;max-height:none;margin:0}
.ly b{font-size:12px;font-weight:500;color:#C9CACB;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ly-dl{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
</style></head><body><main>
<header><a class="wm" href="${esc(PROJECT_URL)}" aria-label="Imagination Is All You Need"><svg width="24" height="24" viewBox="0 0 16 16" aria-hidden="true"><g fill="none" stroke="#FF7A1A" stroke-width="2.3" stroke-linecap="round"><path d="M11.4 3.8A5.4 5.4 0 0 1 13.04 9.94"/><path d="M9.94 13.04A5.4 5.4 0 0 1 3.8 11.4"/><path d="M2.67 7.16A5.4 5.4 0 0 1 7.16 2.67"/></g><circle cx="8" cy="8" r="2.3" fill="#F7F7F8"/></svg><span class="wm-n" aria-hidden="true"><span class="wm-1">Imagination</span><span class="wm-2">is all you need</span></span></a><span class="small">Shared result</span></header>
<h1>${esc(f.toolName)}</h1>${byline}<p class="facts">${esc(made)}</p>
${media}${f.attribution ? `<p class="attr" data-attribution>${esc(f.attribution)}</p>` : ''}
<div class="cta"><span>Made with Imagination Is All You Need · open source. Every tool is a ComfyUI workflow you can run yourself.</span><span class="cta-b"><button type="button" class="btn btn-2" id="recipe" data-recipe>Copy recipe</button><a class="btn" href="${esc(PROJECT_URL)}" data-make-own>Make your own · Get the app</a></span></div>
<p class="small" id="recipe-msg" aria-live="polite">The recipe is the tool, workflow, model and settings${lib.metaOf(j.id).published?.showPrompt ? ' and the prompt' : ''} as JSON. Paste it into <b>Make this</b> (the /r page) in your own app to make one like it. Nothing runs until you press Generate.</p>
<script type="application/json" id="recipe-json">${JSON.stringify(shareRecipe(j)).replace(/</g, '\\u003c')}</script>
<script>document.getElementById('recipe').onclick=function(){var t=document.getElementById('recipe-json').textContent,m=document.getElementById('recipe-msg');var done=function(){m.textContent='Recipe copied.'};if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(JSON.stringify(JSON.parse(t),null,2)).then(done,function(){fallback()})}else fallback();function fallback(){var a=document.createElement('textarea');a.value=JSON.stringify(JSON.parse(t),null,2);document.body.appendChild(a);a.select();try{document.execCommand('copy');done()}catch(e){m.textContent='Copy was blocked. Select the recipe below.'}a.remove()}};</script>
<p class="small">${esc(repoShort)} · Not affiliated with Higgsfield.</p>
</main></body></html>`);
  });
}
