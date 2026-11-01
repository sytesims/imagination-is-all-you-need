/** All multipart intake is quarantined before route handlers see any file. No client MIME trust. */
import type { FastifyInstance } from 'fastify';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';

type Kind = 'image' | 'video' | 'audio';
export const acceptKind = (accept = ''): Kind | null => /audio\//.test(accept) ? 'audio' : /video\//.test(accept) ? 'video' : /image\//.test(accept) ? 'image' : null;
const formats: Record<string, { kind: Kind; mime: string; codec?: string[] }> = {
  png: { kind: 'image', mime: 'image/png', codec: ['png'] }, jpg: { kind: 'image', mime: 'image/jpeg', codec: ['mjpeg'] },
  webp: { kind: 'image', mime: 'image/webp', codec: ['webp'] },
  mp4: { kind: 'video', mime: 'video/mp4' }, mov: { kind: 'video', mime: 'video/quicktime' }, webm: { kind: 'video', mime: 'video/webm' }, m4v: { kind: 'video', mime: 'video/x-m4v' },
  mjpeg: { kind: 'video', mime: 'video/x-motion-jpeg', codec: ['mjpeg'] },
  wav: { kind: 'audio', mime: 'audio/wav' }, mp3: { kind: 'audio', mime: 'audio/mpeg' }, m4a: { kind: 'audio', mime: 'audio/mp4' },
  aac: { kind: 'audio', mime: 'audio/aac' }, ogg: { kind: 'audio', mime: 'audio/ogg' }, flac: { kind: 'audio', mime: 'audio/flac' },
};
export function uploadKind(field: string): Kind | null {
  if (/^(video|refVideos?|videoRefs|matte|clip|streams)$/.test(field)) return 'video';
  if (/^(audio|voiceAudio|refAudios?|speech|samples|voiceSamples|voiceSample|sample)$/.test(field)) return 'audio';
  if (/^(refs?|refImages|images?|imageOriginal|style|mask|frame|start|end|sourceImage|keyframes?|firstFrame|startFrame|lastFrame|endImage|colourRef|personA|personB|presenterImage|faces?|person|garment|characters?|photos|reference|location|poster|titleCard|endCard|endcard|still|products|cue\d{1,3}|overlay|foreground|background)$/.test(field)) return 'image';
  return null;
}
const bad = (field: string, message = 'Unsupported or damaged media. Use a supported raster image, video or audio file.') => Object.assign(new Error(message), { statusCode: 400, code: 'upload_format', field });
const routeFields: Record<string, RegExp> = {
  '/api/media': /^file$/, '/api/me/avatar': /^file$/, '/api/elements': /^image$/, '/api/elements/:id/images': /^image$/,
  '/api/jobs/:id/3d-poster': /^image$/, '/api/3d/upload': /^model$/, '/api/3d/rig': /^(model|poster)$/,
  '/api/precheck': /^(video|image|startFrame|refs?|photos|characters?|faces|reference|audio|samples|voiceSamples|voiceSample|sample)$/,
  '/api/compose': /^(titleCard|endCard|cue\d{1,3})$/, '/api/jobs/:id/captions/burn': /^cue\d{1,3}$/,
  '/api/jobs/:id/stamp': /^(overlay|endcard)$/, '/api/jobs/:id/share/export': /^(overlay|endcard)$/,
  '/api/jobs/:id/share/clip': /^(still|clip|endcard)$/, '/api/tools/object-swap/mask-preview': /^(video|matte|firstFrame)$/,
};
function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }); let out = '', err = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('Media validation timed out.')); }, 30000);
    p.stdout.on('data', d => { if (out.length < 200000) out += d; });
    p.stderr.on('data', d => { if (err.length < 200000) err += d; });
    p.on('error', e => { clearTimeout(timer); reject(e); }); p.on('close', code => { clearTimeout(timer); code === 0 && !err.trim() ? resolve(out) : reject(new Error(err)); });
  });
}
function signature(b: Buffer, ext: string): boolean {
  const s = (a: number, z: number) => b.subarray(a, z).toString('ascii');
  if (ext === 'png') {
    if (!b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || b.length < 33) return false;
    let pos = 8, imageData = false;
    while (pos + 12 <= b.length) {
      const size = b.readUInt32BE(pos), type = s(pos + 4, pos + 8); const end = pos + 12 + size;
      if (end > b.length || (pos === 8 && (type !== 'IHDR' || size !== 13))) return false;
      if (type === 'IDAT') imageData = true;
      if (type === 'IEND') return size === 0 && imageData && end === b.length;
      pos = end;
    }
    return false;
  }
  if (ext === 'jpg' || ext === 'mjpeg') return b[0] === 255 && b[1] === 216 && b[2] === 255 && b[b.length - 2] === 255 && b[b.length - 1] === 217;
  if (ext === 'webp') return s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP' && b.readUInt32LE(4) + 8 === b.length;
  if (ext === 'wav') return s(0, 4) === 'RIFF' && s(8, 12) === 'WAVE' && b.readUInt32LE(4) + 8 === b.length;
  if (ext === 'flac') return s(0, 4) === 'fLaC';
  if (ext === 'ogg') return s(0, 4) === 'OggS';
  if (ext === 'webm') {
    const doc = b.indexOf(Buffer.from([0x42, 0x82, 0x84])); // EBML DocType, four-byte string
    return b.subarray(0, 4).equals(Buffer.from([26,69,223,163])) && doc >= 0 && doc < 256 && s(doc + 3, doc + 7) === 'webm';
  }
  if (['mp4', 'm4v', 'mov', 'm4a'].includes(ext)) {
    if (s(4, 8) !== 'ftyp' || b.length < 24) return false;
    let pos = 0;
    while (pos + 8 <= b.length) {
      let size = b.readUInt32BE(pos);
      if (size === 1) { if (pos + 16 > b.length) return false; const large = b.readBigUInt64BE(pos + 8); if (large > BigInt(b.length)) return false; size = Number(large); if (size < 16) return false; }
      if (size === 0) return true; // ISO box extending to EOF
      if (size < 8 || pos + size > b.length) return false;
      pos += size;
    }
    return pos === b.length;
  }
  if (ext === 'mp3') return s(0, 3) === 'ID3' || (b[0] === 255 && (b[1] & 0xe0) === 0xe0);
  if (ext === 'aac') return b[0] === 255 && (b[1] & 0xf6) === 0xf0;
  return false;
}
export async function validateUpload(file: string, filename: string, mime: string, field: string, expected?: Kind | 'any') {
  const base = path.basename(filename); let ext = path.extname(base).slice(1).toLowerCase(); if (ext === 'jpeg') ext = 'jpg';
  const fmt = formats[ext]; const kind = expected ?? uploadKind(field);
  if (!fmt || !kind || (kind !== 'any' && fmt.kind !== kind) || (ext === 'mjpeg' && field !== 'streams')) throw bad(field);
  const aliases: Record<string, string[]> = { wav: ['audio/x-wav', 'audio/wave'], mp3: ['audio/mp3'], m4v: ['video/mp4'], aac: ['audio/x-aac'], flac: ['audio/x-flac'], ogg: ['application/ogg'] };
  if (mime && mime !== 'application/octet-stream' && mime !== fmt.mime && !aliases[ext]?.includes(mime)) throw bad(field, 'The declared media type does not match the file.');
  const bytes = await readFile(file);
  if (bytes.length < 12 || !signature(bytes, ext)) throw bad(field);
  try {
    // A saved .jpg otherwise probes as image2, while the same quarantined bytes probe as jpeg_pipe. Keep both validation passes identical.
    const opts = ['-protocol_whitelist', 'file,pipe', ...(ext === 'mjpeg' ? ['-f', 'mjpeg'] : ext === 'jpg' ? ['-f', 'jpeg_pipe'] : [])];
    const info = JSON.parse(await run('ffprobe', ['-v', 'error', ...opts, '-show_streams', '-show_format', '-of', 'json', file]));
    const containers: Record<string, string> = { png: 'png_pipe', jpg: 'jpeg_pipe', webp: 'webp_pipe', wav: 'wav', mp3: 'mp3', aac: 'aac', ogg: 'ogg', flac: 'flac', webm: 'matroska,webm', mp4: 'mov,mp4,m4a,3gp,3g2,mj2', mov: 'mov,mp4,m4a,3gp,3g2,mj2', m4v: 'mov,mp4,m4a,3gp,3g2,mj2', m4a: 'mov,mp4,m4a,3gp,3g2,mj2', mjpeg: 'mjpeg' };
    if (info.format?.format_name !== containers[ext]) throw bad(field);
    const streams = info.streams ?? []; const video = streams.filter((s: any) => s.codec_type === 'video' && !s.disposition?.attached_pic); const audio = streams.filter((s: any) => s.codec_type === 'audio');
    if (fmt.kind === 'image' ? !fmt.codec?.includes(video[0]?.codec_name) : fmt.kind === 'video' ? !video.length : !audio.length || video.length) throw bad(field);
    // MOV/MP4 may carry inert timecode or subtitle tracks; decode only image/video/audio.
    if (streams.some((s: any) => !['video', 'audio', 'data', 'subtitle'].includes(s.codec_type))) throw bad(field);
    if (fmt.kind === 'video' && video.some((s: any) => !['h264', 'hevc', 'av1', 'vp8', 'vp9', 'mpeg4', 'mjpeg', 'prores'].includes(s.codec_name))) throw bad(field);
    if (audio.some((s: any) => !/^(aac|mp3|flac|vorbis|opus|alac|pcm_\w+)$/.test(s.codec_name))) throw bad(field);
    if (ext === 'webm' && (video.some((s: any) => !['vp8', 'vp9', 'av1'].includes(s.codec_name)) || audio.some((s: any) => !['opus', 'vorbis'].includes(s.codec_name)))) throw bad(field);
    if (fmt.kind !== 'image' && ext !== 'mjpeg' && !(Number(info.format?.duration) > 0)) throw bad(field);
    if (fmt.codec && !fmt.codec.includes(video[0]?.codec_name)) throw bad(field);
    // Decode, rather than accepting a readable header. Fail closed on missing tools/timeouts.
    await run('ffmpeg', ['-v', 'error', '-xerror', ...opts, '-i', file, '-map', '0:v?', '-map', '0:a?', ...(fmt.kind === 'image' ? ['-frames:v', '1'] : []), '-f', 'null', '-']);
  } catch { throw bad(field); }
  return { ext: `.${ext}`, mime: fmt.mime, kind: fmt.kind };
}

export function registerUploadSecurity(app: FastifyInstance, tempRoot = os.tmpdir()) {
  app.addHook('preValidation', async (req, reply) => {
    if (!req.isMultipart()) return;
    const dir = await mkdtemp(path.join(tempRoot, 'ohf-upload-')); const staged: any[] = [];
    const cleanup = () => rm(dir, { recursive: true, force: true });
    (req as any).uploadCleanup = cleanup;
    req.raw.once('aborted', () => { void cleanup(); });
    reply.raw.once('close', () => { void cleanup(); });
    // multipart v8 can emit a malformed-part error before its async iterator yields the
    // FileStream. Attach a synchronous listener at the parser's public stream event;
    // pipeline below still rejects destroyed/errored streams instead of crashing Node.
    const originalPipe = req.raw.pipe;
    let multipartError: Error | null = null;
    req.raw.pipe = function (this: typeof req.raw, destination: any, ...args: any[]) {
      destination.on('file', (_name: string, stream: import('node:stream').Readable) => stream.on('error', error => {
        multipartError = error;
        if (!stream.destroyed) stream.destroy(error);
        if (!destination.destroyed) destination.destroy(error);
      }));
      return (originalPipe as any).call(this, destination, ...args);
    } as any;
    try {
      // Validate the entire request before yielding even its first part: a bad second file cannot persist the first.
      for await (const part of req.parts()) {
        if (multipartError) throw multipartError;
        if (part.type !== 'file') { staged.push(part); continue; }
        const file = path.join(dir, String(staged.length));
        await pipeline(part.file, createWriteStream(file, { mode: 0o600 }));
        if (part.file.truncated) throw bad(part.fieldname, 'File too large.');
        const route = req.routeOptions.url;
        const field = part.fieldname;
        if ((route && routeFields[route] && !routeFields[route].test(field)) || (route?.startsWith('/api/brand-kits/') && field !== 'file')) throw bad(field);
        const model = (route === '/api/3d/upload' || route === '/api/3d/rig') && part.fieldname === 'model';
        let canonical: { ext: string; mime: string };
        if (route === '/api/brand-kits/:id/font') {
          // brand fonts: checked by content (brandFonts.sniffFont), never decoded by ffprobe
          const { sniffFont, FONT_MIME } = await import('./brandFonts.js'); const ext = path.extname(part.filename).toLowerCase();
          const f = sniffFont(await readFile(file), ext); if (!f) throw bad(field, 'That isn’t a font file. Use a TTF, OTF, WOFF or WOFF2 file.');
          canonical = { ext, mime: FONT_MIME[f] };
        } else if (model) {
          const { glbProblem } = await import('./routes3d.js');
          if (glbProblem(await readFile(file))) throw bad(part.fieldname, 'Invalid GLB model.');
          canonical = { ext: '.glb', mime: 'model/gltf-binary' };
        } else {
          const generic = route === '/api/media' && part.fieldname === 'file';
          const imageFile = part.fieldname === 'file' && (route === '/api/me/avatar' || route?.startsWith('/api/brand-kits/'));
          let expected: Kind | 'any' | undefined = generic ? 'any' : imageFile ? 'image' : undefined;
          if (route === '/api/precheck' && /^(refs?|photos|characters?|faces|reference)$/.test(field)) expected = formats[path.extname(part.filename).slice(1).toLowerCase()]?.kind === 'audio' ? 'audio' : 'image';
          if (route === '/api/tools/:toolId/jobs' || route === '/api/jobs' || route === '/api/tools/:id/price') {
            const { getTool, DEFAULT_TOOL_ID } = await import('./tools/registry.js');
            const tool = getTool((req.params as any)?.toolId ?? (req.params as any)?.id ?? DEFAULT_TOOL_ID);
            // imageOriginal: the photo as picked, before the bar fitted or cropped it (apps.ts imagePrepOf)
            const input = field === 'imageOriginal' ? { accept: 'image/*' } : tool?.inputs.find(i => ['file', 'files'].includes(i.kind) && i.name === field);
            if (!input) throw bad(field, 'Unknown file input.');
            expected = acceptKind(input.accept) ?? undefined;
            if (!expected) throw bad(field);
          }
          // Brand logos may also be SVG or GIF (brandKits.ts refuses SVGs with script); checked by content here, not by ffprobe
          const logoExt = route === '/api/brand-kits/:id/logo' ? path.extname(part.filename).toLowerCase() : '';
          if (logoExt === '.svg' || logoExt === '.gif') {
            const head = (await readFile(file)).subarray(0, 512).toString('utf8');
            if (logoExt === '.gif' ? !head.startsWith('GIF8') : !/<svg[\s>]/i.test(head)) throw bad(field);
            canonical = logoExt === '.gif' ? { ext: '.gif', mime: 'image/gif' } : { ext: '.svg', mime: 'image/svg+xml' };
          } else canonical = await validateUpload(file, part.filename, part.mimetype, part.fieldname, expected);
        }
        staged.push({ ...part, filename: `${path.basename(part.filename, path.extname(part.filename))}${canonical.ext}`, mimetype: canonical.mime, privateFile: file });
      }
      const replay = (part: any) => {
        if (part.type !== 'file') return part;
        const stream = createReadStream(part.privateFile);
        return { ...part, file: stream, toBuffer: async () => { const chunks: Buffer[] = []; for await (const c of stream) chunks.push(Buffer.from(c)); return Buffer.concat(chunks); } };
      };
      req.parts = (async function* () { for (const part of staged) yield replay(part); }) as any;
      req.files = (async function* () { for (const part of staged) if (part.type === 'file') yield replay(part); }) as any;
      req.file = (async () => { const part = staged.find(p => p.type === 'file'); return part ? replay(part) : undefined; }) as any;
    } catch (e: any) {
      await cleanup();
      return reply.code(400).send({ error: e.code === 'upload_format' ? e.message : 'The media upload could not be validated.', errorType: 'validation', code: 'upload_format', issues: [{ code: 'format', field: e.field ?? 'file', message: 'Unsupported or damaged media.' }] });
    } finally { req.raw.pipe = originalPipe; }
  });
  app.addHook('onResponse', async req => { await (req as any).uploadCleanup?.(); });
  // Includes the ?clean=1 onRequest responder, not only @fastify/static's handler.
  app.addHook('onSend', async (req, reply, payload) => {
    if (req.url.startsWith('/files/')) {
      let file = req.url.split('?')[0]; try { file = decodeURIComponent(file); } catch { /* unknown extension downloads */ }
      mediaResponseHeaders({ setHeader: (name, value) => reply.header(name, value) }, file);
    }
    return payload;
  });
}

/** Sandbox also covers legacy HTML/SVG or active bytes renamed to media, without purging user files. */
export function mediaResponseHeaders(res: { setHeader(name: string, value: string): unknown }, file: string) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; media-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'");
  if (!/\.(png|jpe?g|webp|mp4|mov|webm|m4v|wav|mp3|m4a|aac|ogg|flac|glb|vtt|srt)$/i.test(file) && !/\/brand-[^/]*\.(svg|gif)$/i.test(file) && !/\/brand-fonts\/[\w-]+\/[^/]+\.(ttf|otf|woff2?)$/i.test(file)) {
    res.setHeader('Content-Type', 'application/octet-stream'); res.setHeader('Content-Disposition', 'attachment');
  }
}
