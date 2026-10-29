import { useEffect, useRef } from 'react';
import { materializeFile } from './formFiles';

/** Drafts for uploaded files. Files stay in this browser only (IndexedDB), never on the server, so a refresh can show the
 *  same upload again. Removing the file in the tool removes the saved copy. */
const DB = 'ohf-drafts', STORE = 'files';
let dbp: Promise<IDBDatabase> | null = null;
const db = () => dbp ??= new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const tx = <T,>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>) => db().then(d => new Promise<T>((res, rej) => { const q = f(d.transaction(STORE, mode).objectStore(STORE)); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }));
type Saved = { name: string; type: string; lastModified: number; blob: Blob };
export const saveDraftFile = (key: string, f: File | null) => (f ? tx('readwrite', s => s.put({ name: f.name, type: f.type, lastModified: f.lastModified, blob: f } as Saved, key)) : tx('readwrite', s => s.delete(key))).catch(() => undefined);
/** 2026-10-27: the restored file is copied into memory. A File that only points at the stored blob can stop being readable once the
 *  draft is saved again (the restore re-saves it), and an unreadable file makes the submit fail as "Can't reach the server"
 *  (shared/formFiles.ts). A stored copy that can't be read comes back as null (no draft) instead of a dead file. */
export const loadDraftFile = (key: string): Promise<File | null> => tx<Saved | undefined>('readonly', s => s.get(key)).then(v => v?.blob ? materializeFile(v.blob, v.name, v.type, v.lastModified) : null).catch(() => null);

/** Keep `current` saved under toolId + name; on mount, hand a saved file back to `restore` (which validates it like a fresh drop)
 *  unless the tool already has one (Recreate / prefill win). Saving starts only after that first look, so it can't wipe the draft. */
export function useDraftFile(toolId: string | undefined, name: string, current: File | null | undefined, restore: (f: File) => void) {
  const key = toolId ? `${toolId}:${name}` : ''; const ready = useRef(false); const cur = useRef(current); cur.current = current; const rf = useRef(restore); rf.current = restore;
  useEffect(() => { ready.current = false; if (!key) return; let on = true;
    loadDraftFile(key).then(f => { if (!on) return; if (f && !cur.current) rf.current(f); ready.current = true; }); return () => { on = false; }; }, [key]);
  useEffect(() => { if (key && ready.current) saveDraftFile(key, current ?? null); }, [key, current]);
}

/** Several photos in order (Create Image: photo 1 + the extra references, QA #3), saved as one entry so they come back in the same order. */
export type SavedFile = Saved;
/** The stored form of a list of files (pure: the test checks it without IndexedDB). */
export const packDraftFiles = (fs: File[]): Saved[] => fs.map(f => ({ name: f.name, type: f.type, lastModified: f.lastModified, blob: f }));
/** Back to files, in order; an entry that can't be read becomes null, so the caller knows which photo number was lost. */
export const unpackDraftFiles = (v: unknown): (File | null)[] => Array.isArray(v) ? v.map((x: any) => x && x.blob instanceof Blob && typeof x.name === 'string'
  ? new File([x.blob], x.name, { type: String(x.type ?? x.blob.type ?? ''), lastModified: Number(x.lastModified) || Date.now() }) : null) : [];
export const saveDraftFileList = (key: string, fs: File[]) => (fs.length ? tx('readwrite', s => s.put(packDraftFiles(fs), key)) : tx('readwrite', s => s.delete(key))).catch(() => undefined);
export const loadDraftFileList = (key: string): Promise<(File | null)[]> => tx<unknown>('readonly', s => s.get(key)).then(v => Promise.all(unpackDraftFiles(v).map(f => f ? materializeFile(f, f.name, f.type, f.lastModified) : null))).catch(() => []); // in memory, as loadDraftFile

/** useDraftFile for a list: on mount, hands the saved files back to `restore` (null where one couldn't be read) unless the tool already has
 *  photos; `legacy` names an older single-file entry to read when the list has never been saved. Saving starts after that first look. */
export function useDraftFileList(toolId: string | undefined, name: string, current: File[], restore: (fs: (File | null)[]) => void, legacy?: string) {
  const key = toolId ? `${toolId}:${name}` : ''; const ready = useRef(false); const cur = useRef(current); cur.current = current; const rf = useRef(restore); rf.current = restore;
  useEffect(() => { ready.current = false; if (!key) return; let on = true;
    (async () => { let fs = await loadDraftFileList(key); if (!fs.length && legacy && toolId) { const f = await loadDraftFile(`${toolId}:${legacy}`); if (f) fs = [f]; }
      if (!on) return; if (fs.length && !cur.current.length) rf.current(fs); ready.current = true; })(); return () => { on = false; }; }, [key]);
  const sig = current.map(f => `${f.name}|${f.size}|${f.lastModified}`).join('/');
  useEffect(() => { if (!key || !ready.current) return; saveDraftFileList(key, current); if (legacy && toolId) saveDraftFile(`${toolId}:${legacy}`, null); }, [key, sig]); // eslint-disable-line react-hooks/exhaustive-deps
}
