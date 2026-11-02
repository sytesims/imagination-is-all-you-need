/**
 * The hosted "Try it" site (try.iiayn.app): this same app, built with VITE_SAMPLE_SITE=1 (web/vite.try.config.ts) and answered in the
 * browser by web/try/sw.js. Nothing is generated there, no keys exist and nothing leaves the browser. Every place that reads the flag
 * says so in plain words; the normal build has SAMPLE_SITE false and keeps the app's own words.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
export const SAMPLE_SITE = (import.meta as any).env?.VITE_SAMPLE_SITE === '1';

/** Where the install steps live (the site's home page). */
export const INSTALL_URL = 'https://iiayn.app/#install';
/** A sample result's line (the app's mock backend, or the Try it site). */
export const SAMPLE_OUTPUT = SAMPLE_SITE ? 'Sample · real runs need the app on your computer.' : 'Sample output, nothing billed.';
/** The word for a place that can run: on the Try it site nothing runs, so it says Sample. */
export const READY_WORD = SAMPLE_SITE ? 'Sample' : 'Ready';
/** What the Try it site says where the app would need a computer (keys, downloads, agents). */
export const NEEDS_APP = 'This needs the app on your computer. Here you can click through it and make samples.';
export const KEYS_NOTE = 'Keys live on your computer, in the app. Here every run is a free sample.';
export const DOWNLOAD_NOTE = 'Downloads work in the app on your computer.';
export const UPLOAD_NOTE = 'Kept in this tab only, never sent anywhere.';
export const AGENT_NOTE = 'The agent and its demos run in the app on your computer. Here you can build a board by hand and press Go for a sample.';
export const SETTINGS_NOTE = 'Changes here last for this visit only.';
