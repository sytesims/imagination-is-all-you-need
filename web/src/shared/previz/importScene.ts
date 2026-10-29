/**
 * Imported scenes for Direct a Shot (2026-10-24): a self-contained .html page a coding agent wrote that follows our contract
 * (window.previz = { duration, seek(t), setPass(name), passes }; docs/PLAN-A-SHOT.md). It runs in an <iframe sandbox="allow-scripts">
 * (no same-origin: it can't read the app, its storage or its cookies). We add a small bridge script at the top of the page that
 *  - reports load errors and what window.previz looks like (the parent checks it with validatePrevizContract),
 *  - answers seek / pass / frame requests over postMessage; a frame comes back as an ImageBitmap of the page's largest canvas.
 */
import { validatePrevizContract, type PrevizContractCheck, type PrevizPass } from '../../../../server/src/shared/previzTemplates';

const BRIDGE = `<script>(function(){
var P=window.parent;function post(m){m.__previz=1;try{P.postMessage(m,'*',m.bitmap?[m.bitmap]:[]);}catch(e){}}
var errs=[];function err(m){m=String(m||'Script error');if(errs.length<5){errs.push(m);post({type:'error',message:m});}}
addEventListener('error',function(e){err(e.message||(e.error&&e.error.message));});
addEventListener('unhandledrejection',function(e){err('Unhandled promise: '+((e.reason&&e.reason.message)||e.reason));});
function desc(){var p=window.previz;if(!p||typeof p!=='object')return null;var ps=p.passes;return{duration:p.duration,seek:typeof p.seek,setPass:typeof p.setPass,passes:Array.isArray(ps)?ps.slice(0,8).map(String):ps==null?null:'bad'};}
var sent=false,n=0;function check(final){if(sent)return;var d=desc();if((d&&d.seek==='function'&&d.setPass==='function')||final){sent=true;post({type:'ready',desc:d,errors:errs});}}
var iv=setInterval(function(){n++;check(n>=60);if(sent)clearInterval(iv);},100);
addEventListener('load',function(){setTimeout(function(){check(false);},50);setTimeout(function(){check(true);},1500);});
function canvas(){var b=null,a=0;document.querySelectorAll('canvas').forEach(function(c){var s=c.width*c.height;if(s>a){a=s;b=c;}});return b;}
addEventListener('message',function(e){var m=e.data;if(!m||!m.__previzReq)return;var p=window.previz;
 Promise.resolve().then(function(){if(!p)throw new Error('window.previz is missing');
  if(m.pass)p.setPass(m.pass);if(m.t!=null)return p.seek(m.t);}).then(function(){
  if(m.type!=='frame'){post({type:'done',id:m.id});return;}var c=canvas();if(!c)throw new Error('The scene has no canvas to record.');
  return createImageBitmap(c).then(function(b){post({type:'frame',id:m.id,bitmap:b});});
 }).catch(function(x){post({type:'fail',id:m.id,message:String((x&&x.message)||x)});});});
})();<\/script>`;

/** The page with our bridge first (after <head> when there is one, so the page keeps its doctype). */
export function withBridge(html: string): string {
  const m = /<head[^>]*>/i.exec(html); if (m) return html.slice(0, m.index + m[0].length) + BRIDGE + html.slice(m.index + m[0].length);
  const d = /<!doctype[^>]*>/i.exec(html); if (d) return html.slice(0, d.index + d[0].length) + BRIDGE + html.slice(d.index + d[0].length);
  return BRIDGE + html;
}

export type SceneStatus = { state: 'loading' } | { state: 'ready'; check: PrevizContractCheck; errors: string[] } | { state: 'error'; problems: string[]; errors: string[] };
export interface SceneLink { seek(t: number): Promise<void>; setPass(p: PrevizPass): Promise<void>; frame(t: number, pass: PrevizPass): Promise<ImageBitmap>; dispose(): void }

/** Talk to one sandboxed frame. onStatus reports loading → ready (contract ok) or error (with the problems in plain words). */
export function linkScene(frame: HTMLIFrameElement, onStatus: (s: SceneStatus) => void, timeoutMs = 9000): SceneLink {
  let seq = 0; const waits = new Map<number, { ok: (v: any) => void; bad: (e: Error) => void }>(); const errors: string[] = []; let done = false;
  const onMsg = (e: MessageEvent) => {
    if (e.source !== frame.contentWindow) return; const m = e.data; if (!m || m.__previz !== 1) return;
    if (m.type === 'error') { errors.push(String(m.message).slice(0, 300)); if (done) return; }
    if (m.type === 'ready' && !done) { done = true; clearTimeout(timer);
      const d = m.desc; const fake = d ? { duration: d.duration, seek: d.seek === 'function' ? () => 0 : undefined, setPass: d.setPass === 'function' ? () => 0 : undefined, passes: d.passes === 'bad' ? ['?'] : d.passes ?? undefined } : null;
      const check = validatePrevizContract(fake); const errs = [...new Set([...(m.errors ?? []), ...errors])];
      onStatus(check.ok ? { state: 'ready', check, errors: errs } : { state: 'error', problems: check.problems, errors: errs }); }
    const w = m.id != null ? waits.get(m.id) : undefined; if (!w) return; waits.delete(m.id);
    if (m.type === 'fail') w.bad(new Error(m.message || 'The scene failed.')); else w.ok(m.type === 'frame' ? m.bitmap : undefined);
  };
  window.addEventListener('message', onMsg);
  const timer = setTimeout(() => { if (done) return; done = true; onStatus({ state: 'error', problems: ['The scene didn’t answer within a few seconds. It must set window.previz when it loads.'], errors }); }, timeoutMs);
  onStatus({ state: 'loading' });
  const ask = (type: string, extra: Record<string, unknown>, ms = 8000) => new Promise<any>((ok, bad) => { const id = ++seq; waits.set(id, { ok, bad });
    frame.contentWindow?.postMessage({ __previzReq: 1, type, id, ...extra }, '*'); setTimeout(() => { if (waits.delete(id)) bad(new Error('The scene stopped answering.')); }, ms); });
  return {
    seek: (t) => ask('seek', { t }), setPass: (p) => ask('pass', { pass: p }), frame: (t, pass) => ask('frame', { t, pass }),
    dispose: () => { window.removeEventListener('message', onMsg); clearTimeout(timer); for (const w of waits.values()) w.bad(new Error('closed')); waits.clear(); },
  };
}
