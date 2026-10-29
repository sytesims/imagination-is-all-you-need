import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { listenHost } from '../server/src/shared/listenHost';
// QA isolation: pair this UI with its own API. Numeric loopback avoids localhost's IPv6 proxy ambiguity.
const API = process.env.OPENHIGGSFIELD_API_PROXY || `http://127.0.0.1:${Number(process.env.PORT) || 8787}`;
const HOST = listenHost(process.env, true);
export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  server: { host: HOST, port: Number(process.env.WEB_PORT) || 5174, strictPort: true, /* OPENHIGGSFIELD_NO_HMR=1: refresh manually */ hmr: process.env.OPENHIGGSFIELD_NO_HMR ? false : undefined, watch: process.env.OPENHIGGSFIELD_NO_HMR ? null : undefined, proxy: { '^/api/': API, '/files': API, '/samples': API, '^/s/': API } },
  // Preview has the same loopback default and proxy policy as development.
  preview: { host: HOST, port: Number(process.env.WEB_PORT) || 5174, strictPort: true, proxy: { '^/api/': API, '/files': API, '/samples': API, '^/s/': API } },
});
