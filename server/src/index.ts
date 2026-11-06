/** Server entry (npm start / npm run dev / tests): boots the plugin tree from the profile (boot.ts). The server itself runs inside it as the
 *  `legacy` plugin (legacy.ts). OPENHIGGSFIELD_PROFILE picks the profile (default server/profiles/desktop.yml). */
import { boot } from './boot.js';
await boot();
