/**
 * "Make this" (/r, 2026-10-25): open someone's recipe in your own app. The link is `/r?recipe=<base64url>` (shared/recipe.ts); a recipe can
 * also be pasted (the link, the plain-text copy from the share sheet, or the JSON from a share page's "Copy recipe").
 * The page shows the recipe first and checks every part against this app: the tool, the model (and whether it can run here), the workflow,
 * each setting against the tool's real options. "Open in <Tool>" fills that tool's bar through the same prefill as Recreate (?recipe=, one
 * object: prompt, model, quality, duration, aspect, seed, fields). Nothing runs until Generate. Everything from the link is shown as text.
 */
import { IMAGE_PAGE, toolPage } from '../../../../server/src/shared/pages';
import { jobWorkflowHref, withSearch } from '../../shared/workflowLinks';
import { goToWorkflow } from '../../shared/goToWorkflow';
import { useEffect, useMemo, useState } from 'react';
import type { ToolInfo } from '../../api';
import type { ToolModel } from '../../shared/models';
import { navigate, Link } from '../../platform/router';
import { Notice } from '../../shared/Notice';
import { decodeRecipe, parseRecipeInput, encodeRecipe, closest, type Recipe, type SettingValue } from '../../../../server/src/shared/recipe';
import { receiptFromText } from '../../../../server/src/shared/shareReceipt';
import { ReceiptChip } from '../../shared/ReceiptChip';
import Page from './Page';
import './recipe.css';

type Check = { key: string; value: string; ok: boolean; note?: string };
const READY = new Set(['ready', 'sample']);
const valText = (v: SettingValue) => (Array.isArray(v) ? v.join(', ') : String(v));
const LABELS: Record<string, string> = { aspect: 'Aspect', seed: 'Seed', duration: 'Duration', resolution: 'Resolution', quality: 'Quality', steps: 'Steps', n: 'Images', imageResolution: 'Size', enhance: 'Enhance prompt', preset: 'Preset', types: 'Style', mode: 'Mode' };
/** Carried to the tool but not worth a row: internal mode keys, and video-only defaults an image job's input also holds. */
const hiddenRow = (k: string, tool: ToolInfo | null) => k === 'types' || k === 'mode' || (tool?.media === 'image' && (k === 'duration' || k === 'resolution'));
const labelOf = (k: string) => LABELS[k] ?? k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

function modelOf(tool: ToolInfo, id: string): { model: ToolModel | null; known: boolean } {
  const m = (tool.models ?? []).find((x) => x.key === id || x.engines.includes(id) || x.primaryEngine === id) ?? null;
  return { model: m, known: !!m || tool.providers.some((p) => p.id === id) };
}
const modelLabel = (m: ToolModel) => m.displayName || m.name;

/** One setting against the tool's own options: kept, or skipped with the reason. */
function checkSetting(tool: ToolInfo, k: string, v: SettingValue): Check {
  const value = valText(v); const app = tool.app;
  const opts = tool.inputs.find((i) => i.name === k)?.options;
  if (k === 'duration' && app?.durations?.length && !app.durations.includes(Number(v))) return { key: k, value, ok: false, note: `This tool makes ${app.durations.join(', ')} s here` };
  if (k === 'resolution' && app?.resolutions?.length && !app.resolutions.includes(String(v))) return { key: k, value, ok: false, note: `Offered here: ${app.resolutions.join(', ')}` };
  if (k === 'steps' && app?.steps?.length && !app.steps.includes(Number(v))) return { key: k, value, ok: false, note: 'Not a step count this tool offers' };
  if (opts?.length && !Array.isArray(v) && !opts.includes(String(v))) return { key: k, value, ok: false, note: 'Not offered by this tool here' };
  return { key: k, value, ok: true };
}

export default function RecipeImport({ tools }: { tools: ToolInfo[] }) {
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('recipe') ?? '');
  const [paste, setPaste] = useState(''); const [pasteErr, setPasteErr] = useState(''); const [showPaste, setShowPaste] = useState(false);
  const [toolPick, setToolPick] = useState<string | null>(null); const [modelPick, setModelPick] = useState<string | null>(null);
  const [imgWfs, setImgWfs] = useState<{ id: string; name: string }[] | null>(null);
  useEffect(() => { let on = true; fetch('/api/image-workflows').then((r) => (r.ok ? r.json() : null)).then((j) => on && setImgWfs(Array.isArray(j?.workflows) ? j.workflows.map((w: any) => ({ id: String(w.id), name: String(w.name ?? w.id) })) : [])).catch(() => on && setImgWfs([])); return () => { on = false; }; }, []);
  /* the address bar follows the recipe on screen (a pasted one too), so Back and reload keep it */
  useEffect(() => { const want = code ? `/r?recipe=${code}` : '/r'; if (location.pathname + location.search !== want) history.replaceState(history.state, '', want); }, [code]);

  const parsed = useMemo(() => (code ? decodeRecipe(code) : null), [code]);
  const r: Recipe | null = parsed?.ok ? parsed.recipe : null;
  useEffect(() => { setToolPick(null); setModelPick(null); }, [code]);

  /* ---------- the checks ---------- */
  const toolExact = r ? tools.find((t) => t.id === r.tool.id) ?? null : null;
  const toolAlt = r && !toolExact && tools.length ? closest([r.tool.name ?? '', r.tool.id], tools, (t) => [t.name, t.id]) : null;
  const tool = toolExact ?? (toolPick ? tools.find((t) => t.id === toolPick) ?? null : null);
  const mm = r?.model && tool ? modelOf(tool, r.model.id) : null;
  const readyModels = (tool?.models ?? []).filter((m) => READY.has(m.state));
  const modelAlt = r?.model && tool && (!mm?.known || (mm.model && !READY.has(mm.model.state)))
    ? closest([r.model.name ?? '', r.model.id], readyModels.filter((m) => m !== mm?.model), (m) => [modelLabel(m), m.name, m.key, ...(m.aliases ?? [])], 0.45) ?? readyModels.find((m) => m.isDefault) ?? readyModels[0] ?? null : null;
  const pickedModel = modelPick ? (tool?.models ?? []).find((m) => m.key === modelPick) ?? null : null;
  const modelState = pickedModel ? pickedModel.state : mm?.model?.state ?? (mm?.known ? 'ready' : null);
  const wf = r?.workflow?.id && tool?.id === 'create-image' && r.workflow.id !== 'create-image' && imgWfs ? (imgWfs.find((w) => w.id === r.workflow!.id) ?? null) : null;
  const wfMissing = !!(r?.workflow?.id && tool?.id === 'create-image' && r.workflow.id !== 'create-image' && imgWfs && !wf && !['edit-image', 'brush-edit'].includes(r.workflow.id));
  const checks: Check[] = r && tool ? Object.entries(r.settings).map(([k, v]) => checkSetting(tool, k, v)) : [];
  const skipped = checks.filter((c) => !c.ok);

  const open = () => {
    if (!r || !tool) return;
    const engine = pickedModel ? (pickedModel.primaryEngine || pickedModel.engines[0]) : r.model?.id ?? null;
    const settings = Object.fromEntries(Object.entries(r.settings).filter(([k]) => !skipped.some((c) => c.key === k)));
    const out: Recipe = { ...r, tool: { id: tool.id, name: tool.name }, model: engine ? { id: engine, name: pickedModel ? modelLabel(pickedModel) : r.model?.name ?? null } : null, settings };
    const q = new URLSearchParams(); if (wf) q.set('workflow', wf.id); if (engine && (pickedModel || mm?.known)) q.set('model', pickedModel?.key ?? engine); q.set('recipe', encodeRecipe(out));
    /* the tool's tab with its workflow picked (shared/workflowLinks; a route that already carries ?workflow= used to get a second '?') */
    const types = (r.settings as any)?.types; const t0 = Array.isArray(types) ? types[0] : typeof types === 'string' ? types : (r.settings as any)?.preset;
    const base = wf ? IMAGE_PAGE : jobWorkflowHref({ toolId: tool.id, input: t0 ? { types: [t0] } : {} }) ?? tool.route ?? toolPage(tool.id);
    goToWorkflow(withSearch(base, q.toString()));
  };
  const loadPaste = () => { const p = parseRecipeInput(paste); if (!p.ok) { setPasteErr(p.error); return; } setPasteErr(''); setPaste(''); setShowPaste(false); setCode(encodeRecipe(p.recipe)); };

  const modelName = pickedModel ? modelLabel(pickedModel) : r?.model?.name ?? (mm?.model ? modelLabel(mm.model) : r?.model?.id) ?? null;
  const pasteBox = <section className="rcp-paste" data-testid="rcp-paste">
    <label htmlFor="rcp-paste-in" className="rcp-lbl">Paste a recipe</label>
    <p className="rcp-hint">A recipe link (it has “/r?recipe=” in it), the recipe text from Share → Copy link → Copy recipe, or a share page’s “Copy recipe”.</p>
    <textarea id="rcp-paste-in" className="rcp-paste-in" rows={4} value={paste} onChange={(e) => { setPaste(e.target.value); setPasteErr(''); }} placeholder="http://localhost:5174/r?recipe=…" spellCheck={false} data-testid="rcp-paste-in" />
    {pasteErr && <Notice kind="error" tone="line" testId="rcp-paste-err">{pasteErr}</Notice>}
    <div className="rcp-acts"><button type="button" className="btn btn-primary" disabled={!paste.trim()} onClick={loadPaste} data-testid="rcp-paste-go">Show recipe</button></div>
  </section>;

  return <Page eyebrow="Recipe" title="Make this" lede="Someone shared how they made something. Check it, then open it in your own tool. Nothing runs until you press Generate.">
    <div className="rcp" data-testid="recipe-page">
      {parsed && !parsed.ok && <Notice kind="error" title="This recipe can’t be opened" testId="rcp-bad">{parsed.error}</Notice>}
      {r && <article className="rcp-card" data-testid="rcp-card">
        <header className="rcp-head"><div><span className="rcp-eyebrow">{toolExact ? 'Tool' : 'From a tool called'}</span><h2 className="rcp-tool" data-testid="rcp-tool">{tool?.name ?? r.tool.name ?? r.tool.id}</h2>
          {r.workflow?.name && r.workflow.name !== (tool?.name ?? r.tool.name) && <p className="rcp-sub">Workflow: <span data-testid="rcp-workflow">{r.workflow.name}</span></p>}</div>
          {modelName && <span className={`rcp-model${modelState && READY.has(modelState) ? ' ok' : ''}`} data-testid="rcp-model">{modelName}</span>}</header>
        {(() => { const rc = receiptFromText(r.receipt); return rc ? <div className="rcp-receipt" data-testid="rcp-receipt"><span className="rcpt-h">What it took them</span><ReceiptChip receipt={rc} testId="rcp-receipt-chip" label="What it took them" /></div> : null; })()}

        {parsed?.ok && parsed.newer && <Notice kind="info" tone="line" testId="rcp-newer">Made with a newer version of the app. What this version knows is below; anything else is left out.</Notice>}
        {parsed?.ok && parsed.dropped.length > 0 && <Notice kind="info" tone="line" testId="rcp-dropped">Left out (not something a recipe can carry): {parsed.dropped.join(', ')}.</Notice>}

        {/* tool */}
        {!toolExact && !tool && tools.length > 0 && <Notice kind="warn" title={`This app has no “${r.tool.name ?? r.tool.id}” tool`} testId="rcp-no-tool"
          action={toolAlt ? { label: `Use ${toolAlt.name}`, onClick: () => setToolPick(toolAlt.id) } : undefined}>
          {toolAlt ? `The closest one here is ${toolAlt.name}.` : 'It may come from a newer version, or a plugin you don’t have.'} Update the app to get every tool.</Notice>}
        {!toolExact && tool && <Notice kind="info" tone="line" testId="rcp-tool-swap">Using {tool.name} instead of “{r.tool.name ?? r.tool.id}”.</Notice>}

        {/* model */}
        {tool && r.model && !pickedModel && !mm?.known && <Notice kind="warn" title={`${tool.name} here has no “${r.model.name ?? r.model.id}”`} testId="rcp-no-model"
          action={modelAlt ? { label: `Use ${modelLabel(modelAlt)}`, onClick: () => setModelPick(modelAlt.key) } : undefined}>
          {modelAlt ? `Closest that runs here: ${modelLabel(modelAlt)}.` : 'Open it anyway to use the tool’s own model.'}</Notice>}
        {tool && mm?.model && !pickedModel && !READY.has(mm.model.state) && <Notice kind="warn" testId="rcp-model-setup"
          title={mm.model.state === 'not-installed' ? `${modelLabel(mm.model)} isn’t installed on this computer` : mm.model.state === 'needs-key' ? `${modelLabel(mm.model)} needs a key to run here` : `${modelLabel(mm.model)} can’t run here yet`}>
          <span>{mm.model.setup?.length ? `Places it can run: ${mm.model.setup.map((s) => s.label).join(' · ')}. ` : ''}Set it up on the Models page{modelAlt ? `, or use ${modelLabel(modelAlt)} for now` : ''}.</span>
          <span className="rcp-inline-acts"><Link to={`/models${tool.media ? `?media=${tool.media}` : ''}`} className="btn" data-testid="rcp-setup">{mm.model.state === 'not-installed' ? 'Download or pick a place' : 'Set it up'}</Link>
            {modelAlt && <button type="button" className="btn" onClick={() => setModelPick(modelAlt.key)} data-testid="rcp-use-alt">Use {modelLabel(modelAlt)}</button>}</span></Notice>}
        {pickedModel && <Notice kind="info" tone="line" testId="rcp-model-swap" action={{ label: 'Undo', onClick: () => setModelPick(null) }}>Using {modelLabel(pickedModel)} instead of {r.model?.name ?? r.model?.id}.</Notice>}
        {wfMissing && <Notice kind="info" tone="line" testId="rcp-no-wf">This app has no “{r.workflow?.name ?? r.workflow?.id}” workflow, so it opens plain {tool?.name}.</Notice>}

        {/* prompt */}
        <section className="rcp-sec"><h3 className="rcp-lbl">Prompt</h3>
          {r.prompt ? <blockquote className="rcp-prompt" data-testid="rcp-prompt">{r.prompt}</blockquote>
            : <p className="rcp-hint" data-testid="rcp-no-prompt">The sharer kept the prompt private. You’ll write your own.</p>}</section>

        {/* settings */}
        <section className="rcp-sec"><h3 className="rcp-lbl">Settings</h3>
          {Object.keys(r.settings).length === 0 ? <p className="rcp-hint">None: the tool’s own defaults.</p>
            : <dl className="rcp-set" data-testid="rcp-settings">{(checks.length ? checks : Object.entries(r.settings).map(([k, v]) => ({ key: k, value: valText(v), ok: true } as Check))).filter((c) => !hiddenRow(c.key, tool)).map((c) =>
              <div key={c.key} className={c.ok ? '' : 'skip'} data-testid={`rcp-set-${c.key}`}><dt>{labelOf(c.key)}</dt><dd>{c.value}{!c.ok && <small> · skipped: {c.note}</small>}</dd></div>)}</dl>}
          {r.ranOn && <p className="rcp-hint">The sharer ran it on {r.ranOn}. Yours runs wherever you’ve set this model up.</p>}</section>

        <footer className="rcp-foot">
          <button type="button" className="btn btn-primary" disabled={!tool} onClick={open} data-testid="rcp-open">{tool ? `Open in ${tool.name}` : 'Open'}</button>
          <span className="rcp-hint">Fills the bar. You press Generate.</span>
        </footer>
      </article>}
      {!r && tools.length === 0 && code && <p className="rcp-hint">Loading the tools…</p>}
      {r && !showPaste ? <button type="button" className="rcp-more" onClick={() => setShowPaste(true)} data-testid="rcp-paste-toggle">Have another recipe? Paste it</button> : pasteBox}
    </div>
  </Page>;
}
