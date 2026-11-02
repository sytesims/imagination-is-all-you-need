/**
 * "Get ComfyUI" by platform (Windows/Mac/Linux setup PR 1, 2026-11-02): one rule for the shared connect form (web ComfyConnect) and the doctor.
 * Comfy Desktop runs on Windows, Apple Silicon Macs and Linux desktops (.deb / AppImage); not on Intel Macs, and not headless.
 * Pure: the server passes its own platform, arch and whether a screen is attached (the app runs on the person's computer).
 */
export type HostInfo = { platform: string; arch: string; headless?: boolean };
export type GetComfy = { url: string | null; label: string; note: string | null;
  /** first-run lines for Comfy Desktop on this platform (the connect form's helper) */ help: string[] };

export const COMFY_DOWNLOAD_URL = 'https://www.comfy.org/download';
export const COMFY_LINUX_DESKTOP_URL = 'https://docs.comfy.org/installation/desktop/linux';
export const COMFY_MANUAL_INSTALL_URL = 'https://docs.comfy.org/installation/manual_install';
const LOCAL = 'When it asks, choose Local, let it finish installing, then press Launch. Keep its window open while you use this app.';

export function getComfyFor(h: HostInfo | null | undefined): GetComfy {
  const p = h?.platform ?? ''; const a = h?.arch ?? '';
  if (p === 'darwin' && a !== 'arm64') return { url: null, label: 'Use Comfy Cloud', note: 'ComfyUI Desktop doesn’t run on this computer. Use Comfy Cloud to make things from here.', help: [] };
  if (p === 'darwin') return { url: COMFY_DOWNLOAD_URL, label: 'Get ComfyUI Desktop ↗', note: null,
    help: [LOCAL, 'If macOS says it can’t be opened: System Settings → Privacy & Security → Open Anyway.'] };
  if (p === 'linux' && h?.headless) return { url: COMFY_MANUAL_INSTALL_URL, label: 'How to install ComfyUI ↗', note: 'This computer has no screen attached, so use the manual install (ComfyUI Desktop needs a desktop).', help: [] };
  if (p === 'linux') return { url: COMFY_LINUX_DESKTOP_URL, label: 'Get ComfyUI Desktop ↗', note: null,
    help: [LOCAL, 'Using the AppImage? Install libfuse2 first (on Ubuntu: sudo apt install libfuse2).'] };
  return { url: COMFY_DOWNLOAD_URL, label: 'Get ComfyUI Desktop ↗', note: null, help: [LOCAL] }; // Windows (and anything unknown)
}
