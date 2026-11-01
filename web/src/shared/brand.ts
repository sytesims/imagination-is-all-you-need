/** The app's display name (user decision, 2026-10-23). Internal ids (env vars, storage keys, package names, data dirs) stay "openhiggsfield". */
export const APP_NAME = 'Imagination Is All You Need';
export const APP_SHORT = 'Imagination';
/** Download names (imagination-<id>.png, imagination-<tool>-<job>-api.json …): one helper for the web app and the API. */
export { FILE_PREFIX, appFileName } from '../../../server/src/shared/fileNames';
/** The name users see for the MCP server in their client config (`claude mcp add imagination`, mcpServers.imagination). */
export const MCP_SERVER_KEY = 'imagination';
/** The project's "Get the app" link (docs, the promo line, the menus, share cards). One shared constant with the server's PROJECT_URL:
 *  server/src/shared/projectLinks.ts GET_APP_URL, the one line to change when it moves. */
import { GET_APP_URL } from '../../../server/src/shared/projectLinks';
export const REPO_URL = GET_APP_URL;
/** A file in the repo's docs on GitHub (docs/INSTALL.md → …/blob/main/docs/INSTALL.md), with an optional #anchor. */
export const repoDoc = (path: string, anchor = '') => `${REPO_URL}/blob/main/${path}${anchor ? `#${anchor}` : ''}`;
/** How Translate (voice) works: the Speech translation section of docs/CONFIGURATION.md. */
export const TRANSLATE_DOC = repoDoc('docs/CONFIGURATION.md', 'speech-translation');
