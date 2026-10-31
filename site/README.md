# iiayn.app

The public website for Imagination Is All You Need: one page that helps people install the app, plus the two
one-line installer routes. It runs as a Cloudflare Worker with static assets.

```
site/
  wrangler.jsonc     Worker config: name iiayn-site, static assets from public/, the Worker runs first
  src/worker.js      the Worker entry (hands every request to routes.js)
  src/routes.js      /install, /install.ps1, the old-domain 301, everything else -> static files
  public/            the page (index.html, styles.css, app.js), 404.html, _headers, robots.txt
  public/media/      small web copies of showcase media made in the app (no EXIF)
  public/brand/      logo, wordmark, favicons and the social preview, from the repo's brand/ folder
```

## Routes

| Path | What it returns |
|---|---|
| `/install` | `scripts/get.sh` from this repo's `main` branch on GitHub, as `text/plain; charset=utf-8`, cached 5 minutes, `x-content-type-options: nosniff` |
| `/install.ps1` | `scripts/get.ps1`, the same way |
| anything else | the static site (`public/`), or `404.html` |

If GitHub can't be reached, the installer routes answer `502` with a plain-text message that links to the script on
GitHub. Every line is a comment and it ends with `exit 1` (or `Write-Error`), so piping it into a shell is harmless.
It is never HTML.

Requests to `imaginationisallyouneed.com`, `www.imaginationisallyouneed.com` and `www.iiayn.app` get a `301` to
`https://iiayn.app` with the same path and query. This only takes effect once those domains are attached to this
Worker (see below).

The routes are tested in `server/test/site-worker.test.ts` with a fake fetch (no network):
`cd server && npx tsx test/site-worker.test.ts`.

## Preview locally

```sh
cd site
npx wrangler dev --port 8799
```

Open http://localhost:8799. Try the installer routes with `curl -s localhost:8799/install | head` and
`curl -s localhost:8799/install.ps1 | head`. `?os=win` or `?os=unix` forces an install tab. `wrangler dev` runs
everything on your computer; it doesn't change anything in a Cloudflare account.

## Deploy (later, step by step)

Nothing here holds an account id: wrangler asks you to log in and picks the account when you deploy.

1. `npx wrangler login` (opens Cloudflare in the browser).
2. `cd site && npx wrangler deploy`. This uploads the Worker `iiayn-site` and the files in `public/`, and gives it
   a `*.workers.dev` address. It doesn't touch any domain.
3. Attach the domains (both zones must already be on the same Cloudflare account). Either in the dashboard
   (Workers & Pages → iiayn-site → Settings → Domains & Routes → Add → Custom domain) for `iiayn.app`,
   `www.iiayn.app`, `imaginationisallyouneed.com` and `www.imaginationisallyouneed.com`, or by uncommenting the
   `routes` block in `wrangler.jsonc` and running `npx wrangler deploy` again. Cloudflare then creates the DNS
   records and certificates for those hostnames.
4. Check: `curl -sI https://iiayn.app/install` (200, `text/plain`) and
   `curl -sI https://imaginationisallyouneed.com/` (301 to `https://iiayn.app/`).

## Media

Everything in `public/media/` was made in the app and comes from `web/public/showcase/` and
`web/public/examples/`, re-encoded smaller and without metadata. The first view on a desktop is about 0.85 MB
(most of it the hero clip); pictures further down load as you scroll, and the song loads only when played.

Licence: AGPL-3.0-or-later, like the rest of the repo.
