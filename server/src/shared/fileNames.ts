/** Names of the files the app hands you (downloads, zips, exports). Shared by the API and the web app (web/src/shared/brand.ts re-exports it).
 *  The prefix follows the app name; internal ids (env vars, storage keys, the export format id) stay "openhiggsfield". */
export const FILE_PREFIX = 'imagination';
/** imagination-<stem>[.ext] */
export const appFileName = (stem: string, ext?: string) => `${FILE_PREFIX}-${stem}${ext ? `.${ext}` : ''}`;
