/** BH4 #8 (G11): GET /api/export and POST /api/import (see backup.ts for the archive layout and how an import is applied). */
import type { FastifyInstance } from 'fastify';
import { appFileName } from './shared/fileNames.js';
import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { DATA_DIR } from './config.js';
import { db } from './db.js';
import { flushJobs } from './jobs.js';
import { EXPORT_FORMAT, EXPORT_VERSION, EXPORT_TMP, STAGE_DIR, TAR, exportSelection } from './backup.js';
import { collectRefs } from './mediaPaths.js';

const UPLOAD_DIR = path.join(DATA_DIR, '.import-upload');
const counts = (d: Database.Database) => Object.fromEntries((['jobs', 'ledger', 'job_meta', 'projects', 'elements', 'uploads', 'kv'] as const).map((t) => { try { return [t, (d.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as any).n]; } catch { return [t, null]; } }));
const bad = (reply: any, code: number, error: string, detail?: string) => reply.code(code).send({ error, errorType: 'validation', ...(detail ? { detail } : {}) });

export function registerBackup(app: FastifyInstance) {
  /** GET /api/export[?media=0] → application/gzip stream (imagination-export-<YYYY-MM-DD>.tar.gz). */
  app.get<{ Querystring: { media?: string } }>('/api/export', async (req, reply) => {
    const withMedia = req.query.media !== '0'; const work = path.join(EXPORT_TMP, randomUUID().slice(0, 8)); mkdirSync(work, { recursive: true });
    try {
      flushJobs(); await db.backup(path.join(work, 'openhiggsfield.db'));
      const snap = new Database(path.join(work, 'openhiggsfield.db'), { readonly: true }); const c = counts(snap); snap.close();
      // BUG-HUNT-8: only media a row references (orphans listed in excluded[]); rows carry data-dir-relative paths (mediaPaths.ts)
      const refs = new Set<string>(); if (withMedia) { const s2 = new Database(path.join(work, 'openhiggsfield.db'), { readonly: true });
        for (const t of ['jobs', 'job_meta', 'elements', 'projects', 'uploads', 'kv', 'canvas_boards', 'films']) for (const r of s2.prepare(`SELECT data FROM ${t}`).iterate() as Iterable<{ data: string }>) { try { collectRefs(JSON.parse(r.data), DATA_DIR, refs); } catch { /* skip */ } }
        s2.close(); }
      const sel = withMedia ? exportSelection(refs) : { files: [], orphans: [] }; const media = sel.files;
      const manifest = { format: EXPORT_FORMAT, version: EXPORT_VERSION, createdAt: new Date().toISOString(), counts: c, media: { included: withMedia, entries: media.length, bytes: media.reduce((s, m) => s + m.bytes, 0), pathsRelativeToDataDir: true },
        excluded: [{ path: 'thumbs/', reason: 'cache' }, { path: 'posters/', reason: 'cache' }, { path: 'pre-*', reason: 'precheck temps' }, { path: 'backups/', reason: 'backups' }, ...sel.orphans],
        orphans: { files: sel.orphans.length, bytes: sel.orphans.reduce((s, o) => s + o.bytes, 0) } };
      writeFileSync(path.join(work, 'manifest.json'), JSON.stringify(manifest, null, 2));
      writeFileSync(path.join(work, 'files.txt'), media.map((m) => m.rel).join('\n'));
      const args = ['-czf', '-', '-C', work, 'manifest.json', 'openhiggsfield.db', ...(media.length ? ['-C', DATA_DIR, ...media.map((m) => m.rel)] : [])]; // operands, not -T: macOS bsdtar reads a -T after operands as a file name and drops every media file
      const tar = spawn(TAR, args, { stdio: ['ignore', 'pipe', 'pipe'] }); let err = ''; tar.stderr.on('data', (d) => { err += d; });
      const cleanup = () => rmSync(work, { recursive: true, force: true }); tar.on('close', (code) => { if (code) app.log.error({ code, err: err.slice(-400) }, 'export tar failed'); cleanup(); });
      reply.raw.on('close', () => { if (tar.exitCode == null) tar.kill(); });
      const day = new Date().toISOString().slice(0, 10);
      return reply.header('content-type', 'application/gzip').header('content-disposition', `attachment; filename="${appFileName(`export-${day}`, 'tar.gz')}"`).header('x-export-manifest', JSON.stringify({ counts: c, mediaEntries: media.length, orphansExcluded: sel.orphans.length })).send(tar.stdout);
    } catch (e: any) { rmSync(work, { recursive: true, force: true }); throw e; }
  });
  /** POST /api/import (body: the .tar.gz as application/gzip or application/octet-stream) → 200 {staged, restartRequired, manifest, counts}. */
  app.register(async (sub) => {
    sub.addContentTypeParser(['application/gzip', 'application/x-gzip', 'application/octet-stream', 'application/x-tar'], (_req, payload, done) => done(null, payload));
    sub.post('/api/import', async (req, reply) => {
      if (!req.body || typeof (req.body as any).pipe !== 'function') return bad(reply, 415, 'Send the export file (.tar.gz) as the request body.', 'Content-Type application/gzip or application/octet-stream');
      mkdirSync(UPLOAD_DIR, { recursive: true }); const file = path.join(UPLOAD_DIR, `${randomUUID().slice(0, 8)}.tar.gz`); const stage = path.join(DATA_DIR, `.import-check-${randomUUID().slice(0, 8)}`);
      try {
        await pipeline(req.body as any, createWriteStream(file));
        let list: string[]; try { list = execFileSync(TAR, ['-tvzf', file], { maxBuffer: 256 * 1024 * 1024 }).toString().split('\n').filter(Boolean); } catch { return bad(reply, 400, 'This file isn’t an Imagination Is All You Need export.', 'tar could not read it as .tar.gz'); }
        for (const l of list) { const type = l[0]; const name = l.split(/\s+/).slice(5).join(' ');
          if (!['-', 'd'].includes(type) || name.split(' ').some((t) => t.startsWith('/') || t.startsWith('\\') || /^[a-z]:/i.test(t) || t.split(/[\\/]/).includes('..')) /* per token: macOS bsdtar -tv has 3 date fields, so name also holds the date */) return bad(reply, 400, 'This export contains an entry that can’t be imported safely.', `entry ${JSON.stringify(name)} (type ${type})`); }
        mkdirSync(stage, { recursive: true }); execFileSync(TAR, ['-xzf', file, '-C', stage, '--no-same-owner', '--no-same-permissions']);
        const mf = path.join(stage, 'manifest.json'); const dbf = path.join(stage, 'openhiggsfield.db');
        if (!existsSync(mf) || !existsSync(dbf)) return bad(reply, 400, 'This file isn’t an Imagination Is All You Need export.', 'manifest.json or openhiggsfield.db missing');
        const manifest = JSON.parse(readFileSync(mf, 'utf8')); if (manifest.format !== EXPORT_FORMAT || !(manifest.version <= EXPORT_VERSION)) return bad(reply, 400, 'This export was made by a newer or different app and can’t be imported.', `format ${manifest.format} v${manifest.version}`);
        const chk = new Database(dbf, { readonly: true }); const ok = (chk.pragma('integrity_check', { simple: true }) as string) === 'ok'; const c = counts(chk); chk.close();
        if (!ok || c.jobs == null || c.ledger == null) return bad(reply, 400, 'The database in this export is damaged.', 'integrity_check failed or tables missing');
        rmSync(STAGE_DIR, { recursive: true, force: true }); (await import('node:fs')).renameSync(stage, STAGE_DIR); writeFileSync(path.join(STAGE_DIR, 'READY'), new Date().toISOString());
        const mediaEntriesN = readdirSync(STAGE_DIR).filter((n) => !['READY', 'manifest.json', 'openhiggsfield.db'].includes(n)).length;
        return { staged: true, restartRequired: true, message: 'Backup checked and ready. Restart the server to switch to it; your current library is kept in a backup folder.', manifest, counts: c, mediaEntries: mediaEntriesN, bytes: statSync(file).size };
      } finally { rmSync(file, { force: true }); rmSync(stage, { recursive: true, force: true }); }
    });
  });
}
