/**
 * Saved user styles (DP ask #5: Create Image's 'Saved' tab). A style = name + prompt fragment + optional settings (any small JSON the
 * client wants back: aspect, quality, model, look ids…). Stored in the SQLite kv table ('userStyles') inside DATA_DIR, so the whole-library
 * export / import (backup.ts: DB snapshot) carries them with no extra code.
 *   GET    /api/user-styles[?toolId=]   → { items: UserStyle[], max }
 *   POST   /api/user-styles             {name, prompt (alias promptFragment), settings?, toolId?} → 201 UserStyle
 *   DELETE /api/user-styles/:id         → { ok: true, id }  (404 unknown)
 */
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { getKv, setKv } from './db.js';

export interface UserStyle { id: string; name: string; prompt: string; settings: Record<string, unknown> | null; toolId: string; createdAt: string }
export const USER_STYLES_MAX = 200; const NAME_MAX = 60; const PROMPT_MAX = 1000; const SETTINGS_MAX_BYTES = 4096;
const KEY = 'userStyles';
export const listUserStyles = (): UserStyle[] => getKv<UserStyle[]>(KEY, []);
const save = (xs: UserStyle[]) => setKv(KEY, xs);
const bad = (field: string, message: string, code = 'invalid') => ({ error: message, errorType: 'validation', code, issues: [{ code, field, message }] });

export function registerUserStyles(app: FastifyInstance) {
  app.get<{ Querystring: { toolId?: string } }>('/api/user-styles', async (req) => {
    const t = req.query.toolId?.trim(); const all = listUserStyles();
    return { items: (t ? all.filter((s) => s.toolId === t) : all).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)), max: USER_STYLES_MAX };
  });
  app.post<{ Body: Record<string, unknown> }>('/api/user-styles', async (req, reply) => {
    const b = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const name = typeof b.name === 'string' ? b.name.trim() : ''; const prompt = typeof (b.prompt ?? b.promptFragment) === 'string' ? String(b.prompt ?? b.promptFragment).trim() : '';
    if (!name) return reply.code(400).send(bad('name', 'Give the style a name.', 'required'));
    if (name.length > NAME_MAX) return reply.code(400).send(bad('name', `Style names can be up to ${NAME_MAX} characters.`, 'too_long'));
    if (!prompt) return reply.code(400).send(bad('prompt', 'Add the prompt text this style adds.', 'required'));
    if (prompt.length > PROMPT_MAX) return reply.code(400).send(bad('prompt', `The prompt fragment can be up to ${PROMPT_MAX} characters.`, 'too_long'));
    let settings: Record<string, unknown> | null = null;
    if (b.settings != null) {
      if (typeof b.settings !== 'object' || Array.isArray(b.settings)) return reply.code(400).send(bad('settings', 'settings must be an object.'));
      if (Buffer.byteLength(JSON.stringify(b.settings)) > SETTINGS_MAX_BYTES) return reply.code(400).send(bad('settings', `settings can be up to ${SETTINGS_MAX_BYTES} bytes.`, 'too_long'));
      settings = b.settings as Record<string, unknown>;
    }
    const toolId = typeof b.toolId === 'string' && /^[\w-]{1,64}$/.test(b.toolId) ? b.toolId : 'create-image';
    const all = listUserStyles();
    if (all.length >= USER_STYLES_MAX) return reply.code(400).send(bad('name', `You can save up to ${USER_STYLES_MAX} styles. Delete one first.`, 'too_many'));
    if (all.some((s) => s.toolId === toolId && s.name.toLowerCase() === name.toLowerCase())) return reply.code(409).send({ ...bad('name', `You already have a style called "${name}".`, 'duplicate'), errorType: 'conflict' });
    const style: UserStyle = { id: randomUUID().slice(0, 8), name, prompt, settings, toolId, createdAt: new Date().toISOString() };
    save([...all, style]); return reply.code(201).send(style);
  });
  app.delete<{ Params: { id: string } }>('/api/user-styles/:id', async (req, reply) => {
    const all = listUserStyles(); const i = all.findIndex((s) => s.id === req.params.id);
    if (i < 0) return reply.code(404).send({ error: 'Style not found.', errorType: 'not_found', code: 'not_found' });
    save(all.filter((_, k) => k !== i)); return { ok: true, id: req.params.id };
  });
}
