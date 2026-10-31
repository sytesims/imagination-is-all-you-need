// iiayn.app: the website's Worker. Static files come from ../public (Workers static assets);
// this file only adds the two installer routes and the old-domain redirect.
//
//   /install       -> scripts/get.sh  from GitHub (main), as plain text
//   /install.ps1   -> scripts/get.ps1 from GitHub (main), as plain text
//   imaginationisallyouneed.com, www.imaginationisallyouneed.com, www.iiayn.app -> 301 to https://iiayn.app (same path)
//   everything else -> the static site
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import { handle } from './routes.js';

export default {
  fetch(request, env) {
    return handle(request, env.ASSETS);
  },
};
