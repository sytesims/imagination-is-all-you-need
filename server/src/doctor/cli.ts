/** `npm run doctor` entry (scripts/doctor.mjs runs it with tsx). See doctor.ts. */
import { main } from './doctor.js';
main(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((e) => { console.error(`doctor: ${e?.message ?? e}`); process.exitCode = 2; });
