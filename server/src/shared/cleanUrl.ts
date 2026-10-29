/** Share step 1: the metadata-free copy of a /files/ media URL (GET /files/<name>?clean=1, server/src/cleanMedia.ts). Anything else is unchanged.
 *  Shared by the server (share page, zip) and the web app (every download button, the Share sheet). */
export const cleanUrl = (u: string) => /^\/files\//.test(u) && !/[?&]clean=1/.test(u) ? `${u}${u.includes('?') ? '&' : '?'}clean=1` : u;
