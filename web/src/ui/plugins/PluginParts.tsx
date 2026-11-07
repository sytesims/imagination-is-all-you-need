/**
 * The pieces the Plugins page and the header's quick menu share (one look in both): the icon tile, the orange switch (the shared .plug-sw),
 * the state label, the tags, and toggle() with its confirm, toast and restart note.
 */
import { useState, type ComponentType } from 'react';
import { useToast } from '../../shared/Toast';
import { tip } from '../../shared/Tooltip';
import { MADE_BY_US } from '../../shared/brand';
import { setPluginOn, installPlugin, stateLabel, type PluginRow } from '../../shared/plugins';
import {
  YourGpuIcon, ComfyPlaceIcon, ApiPlugIcon, LinkIcon, ImageStackIcon, ImageIcon, VideoIcon, AudioIcon, CubeIcon, ReframeIcon, GridIcon, LayersIcon,
  ShieldIcon, PriceTagIcon, UsageIcon, UserIcon, StarIcon, LayoutIcon, GenerateIcon, PlayIcon, StitchIcon, ExploreIcon, LibraryIcon, SystemShareIcon,
  TextIcon, DownloadIcon, BrandIcon, LaptopIcon, InfoIcon, AlignLeftIcon, OpenModelIcon, DocsIcon, MenuIcon, OfficialBadgeIcon, StopwatchIcon, UploadIcon,
  PuzzleIcon, LockIcon, KeyIcon, AlertIcon, type IconProps,
} from '../Icons';

const ICON: Record<string, ComponentType<IconProps>> = {
  'place-comfy-local': YourGpuIcon, 'place-comfy-cloud': ComfyPlaceIcon, 'place-comfy-router': ComfyPlaceIcon, 'place-fal': ApiPlugIcon, 'place-replicate': ApiPlugIcon,
  'place-sunra': ApiPlugIcon, 'place-direct': LinkIcon, 'place-sample': ImageStackIcon, 'place-kie': ApiPlugIcon, 'place-runpod': YourGpuIcon,
  'studio-image': ImageIcon, 'studio-video': VideoIcon, 'studio-audio': AudioIcon, 'studio-3d': CubeIcon, 'studio-edit': ReframeIcon, 'apps-gallery': GridIcon, 'workflow-folders': LayersIcon,
  'spend-guard': ShieldIcon, 'spend-cap': PriceTagIcon, 'agent-budgets': UsageIcon, 'billing-team-mode': UserIcon, 'hosted-grant': StarIcon,
  canvas: LayoutIcon, 'canvas-agent': GenerateIcon, 'canvas-demo': PlayIcon, film: StitchIcon, discover: ExploreIcon, hub: LibraryIcon, share: SystemShareIcon, captions: TextIcon,
  backup: DownloadIcon, 'brand-kits': BrandIcon, hardware: LaptopIcon, preflight: InfoIcon, 'prompt-grammar': AlignLeftIcon, 'open-models': OpenModelIcon, openapi: DocsIcon,
  edge: MenuIcon, 'comfy-featured': OfficialBadgeIcon, 'eta-learning': StopwatchIcon, 'comfy-deploy': UploadIcon, webhooks: LinkIcon,
};

export function PluginTile({ id, size = 'md' }: { id: string; size?: 'sm' | 'md' | 'lg' }) {
  const I = ICON[id] ?? PuzzleIcon;
  return <span className={`pgx-tile pgx-tile-${size}`} aria-hidden><I size={size === 'sm' ? 15 : size === 'lg' ? 20 : 17} /></span>;
}

export function StateTag({ p }: { p: PluginRow }) {
  const s = stateLabel(p);
  return <span className={`pgx-st pgx-st-${s.tone}`} data-testid={`plugin-state-${p.id}`}>
    {s.tone === 'lock' ? <LockIcon size={12} /> : s.tone === 'warn' && p.state === 'needs-key' ? <KeyIcon size={13} /> : s.tone === 'error' ? <AlertIcon size={13} /> : <i aria-hidden />}{s.text}</span>;
}

export function Tags({ p }: { p: PluginRow }) {
  return <span className="pgx-tags">
    {p.tag && <span className="pgx-tag pgx-tag-warn">{p.tag}</span>}
    {p.source === 'ours' && <span className="pgx-tag">{MADE_BY_US}</span>}
    {p.source === 'ours' && !p.installable && <span className="pgx-tag">Built in</span>}
    {p.key && !p.key.set && <span className="pgx-tag pgx-tag-warn">Needs a key</span>}
  </span>;
}

/** Turn on / off / install with the shared confirm, a toast, and the restart note. */
export function usePluginToggle() {
  const toast = useToast(); const [busy, setBusy] = useState<string | null>(null);
  const run = async (p: PluginRow, act: () => Promise<{ restartNeeded?: string[] } | null>, done: string) => {
    setBusy(p.id);
    try { const r = await act(); if (!r) return; toast(r.restartNeeded?.includes(p.id) ? `${p.name}: applies after restart. Your choice is saved.` : done, r.restartNeeded?.length ? 'info' : 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); } finally { setBusy(null); }
  };
  return {
    busy,
    toggle: (p: PluginRow, on: boolean) => run(p, () => setPluginOn(p, on), on ? `${p.name} is on.` : `${p.name} is off.`),
    install: (p: PluginRow) => run(p, () => installPlugin(p.id), `${p.name} is installed.`),
  };
}

/** The row's orange switch (the shared .plug-sw). The spend guard shows a lock instead: it has no switch. */
export function PluginSwitch({ p, busy, onToggle }: { p: PluginRow; busy: boolean; onToggle: (on: boolean) => void }) {
  if (p.core) return <span className="pgx-locked" {...tip('Always on: every paid run shows its price and waits for your OK')}><LockIcon size={14} /></span>;
  const on = p.wanted && p.state !== 'paused';
  return <button type="button" role="switch" aria-checked={on} aria-label={`${p.name}: ${on ? 'on' : 'off'}`} className={`plug-sw ${on ? 'on' : ''}`} disabled={busy || p.state === 'paused'}
    data-testid={`plugin-switch-${p.id}`} onClick={(e) => { e.stopPropagation(); onToggle(!on); }}><i /></button>;
}
