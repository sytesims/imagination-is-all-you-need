/**
 * One Video page, step 2 (2026-10-25): the video workflows as bar recipes, the way Create Image's are (shared/workflows.ts).
 * A recipe says what the Video page's bottom bar shows when that workflow is picked: its inputs as labelled slots (the shared media
 * picker), its prompt (or none), its options as chips with popovers, and the fixed values the old screen always sent. The job still
 * runs on the workflow's own tool (h3-extend, reframe, app-transition…) with exactly the form fields its old screen posted, so the API,
 * MCP, prices and saved jobs keep their ids. Nothing here runs a job.
 *
 * Isomorphic: no server imports. Option lists that depend on the model (lengths, resolutions, aspects, moves) come from the live tool
 * (`from`), so the bar never offers what the server would refuse. test/video-unify.test.ts checks every recipe against the registry.
 */
import { FINISH_PRESETS } from './finishPresets.js';

export type VBarSlotKind = 'video' | 'image' | 'audio';
export interface VBarSlot {
  /** the form field the file goes out as */ name: string; label: string; kind: VBarSlotKind;
  /** true, false, or 'by-model' (the tool input's requiredByProvider says, per model) */ required: boolean | 'by-model';
  /** the empty slot's tooltip */ hint: string; /** Generate's words while it's empty */ missing: string;
  /** several files in one slot (style images); the number is the most it takes */ multiple?: number; min?: number;
  /** shown only for these models (Re-shoot's video references: Seedance only) */ providers?: string[];
  /** this slot also takes a photo, sent as this field instead (Re-shoot: a still in place of the take) */ altImage?: string;
}
export type VBarControlKind = 'choice' | 'toggle' | 'slider' | 'gallery' | 'tiles' | 'text';
export interface VBarOption { value: string; label: string; hint?: string }
export interface VBarControl {
  field: string; label: string; group: string; kind: VBarControlKind;
  maxLength?: number; placeholder?: string; required?: boolean;
  /** fixed options in our words (filtered by what the tool and model take); none = from the tool (`from`) */ options?: VBarOption[];
  /** where the options come from: the tool input of the same field (its byProvider list per model), the model's lengths or resolutions, or the tool's presets */
  from?: 'input' | 'durations' | 'resolutions' | 'presets';
  default?: string;
  /** how it goes out: the field (default), only as types=["<value>"] (the old screens' type picks), or both */ send?: 'field' | 'types' | 'field+types';
  /** slider range */ min?: number; max?: number; step?: number; /** slider shown as a percent of 1 */ percent?: boolean;
  /** shown and sent only for these models */ providers?: string[];
  /** label suffix for numeric values ("5 s", "+5 s") */ prefix?: string; suffix?: string;
  /** a gallery pick you may leave empty (Object Swap's presets): no "Pick …" step, a None tile first */ optional?: boolean;
  /** a toggle's words when on / off (default: Sound on / Sound off) */ onLabel?: string; offLabel?: string;
  /** a toggle that is off isn't sent at all (the old screen only sent it when on) */ omitOff?: boolean;
  /** shown and sent only while this slot holds a photo (Re-shoot's Length: a still has no length of its own) */ whenPhoto?: string;
  /** shown and sent only while the bar's gallery pick is one of these (Footage Effects: Extend the frame's shape and direction) */ whenPreset?: string[];
}
export interface VBarGroup { id: string; label: string; /** web icon key (ui/video/VideoWorkflowBar.tsx ICONS) */ icon: string }
export interface VideoBar {
  slots: VBarSlot[];
  prompt: { mode: 'required' | 'optional' | 'hidden'; placeholder: string;
    /** another prompt for some gallery picks (Footage Effects: Remove an object needs what to remove; Remove subtitles takes none) */ byPreset?: Record<string, { mode: 'required' | 'optional' | 'hidden'; placeholder: string }> };
  groups: VBarGroup[];
  controls: VBarControl[];
  /** values the old screen always sent (locked by the workflow) */ fixed?: Record<string, string>;
  /** the voice tool runs several jobs: only its models that run this mode (app.providerModes) */ mode?: string;
  /** the job's types when one of these slots holds a file (UGC Ad: a product or presenter photo runs as reference video, else text to video) */ typesWhenFile?: Record<string, string>;
  generateLabel: string;
}

const opt = (value: string, label: string, hint?: string): VBarOption => ({ value, label, ...(hint ? { hint } : {}) });
const clip = (label = 'Clip', missing = 'Add a clip', hint = 'The clip to work on · MP4, MOV or WEBM, 4–30 s'): VBarSlot => ({ name: 'video', label, kind: 'video', required: true, hint, missing });
const RES = (group = 'quality'): VBarControl => ({ field: 'resolution', label: 'Resolution', group, kind: 'choice', from: 'resolutions' });
const LEN = (): VBarControl => ({ field: 'duration', label: 'Length', group: 'length', kind: 'choice', from: 'durations', suffix: ' s' });
const ASPECT = (dflt?: string): VBarControl => ({ field: 'aspect', label: 'Aspect ratio', group: 'shape', kind: 'choice', from: 'input', ...(dflt ? { default: dflt } : {}) });
const KEEP_AUDIO: VBarControl = { field: 'keepAudio', label: 'Keep the clip’s sound', group: 'sound', kind: 'toggle', default: '1' };
const G = { length: { id: 'length', label: 'Length', icon: 'clock' }, quality: { id: 'quality', label: 'Quality', icon: 'resolution' }, shape: { id: 'shape', label: 'Shape', icon: 'aspect' } };

/** The recipes, by video workflow id (shared/videoWorkflows.ts). A workflow with no recipe keeps its own screen inside the Video page. */
export const VIDEO_BARS: Record<string, VideoBar> = {
  'photos-to-reel': {
    slots: [{ name: 'photos', label: 'Photos', kind: 'image', required: true, multiple: 15, min: 8,
      hint: '8–15 photos, shown in this order', missing: 'Add 8–15 photos' }],
    prompt: { mode: 'hidden', placeholder: '' },
    groups: [{ id: 'words', label: 'Words', icon: 'edit' }, { id: 'kind', label: 'Kind', icon: 'gallery' }, G.length,
      { id: 'motion', label: 'Motion', icon: 'camera' }, { id: 'sound', label: 'Music', icon: 'music' }],
    controls: [
      { field: 'title', label: 'Title', group: 'words', kind: 'text', required: true, maxLength: 120, placeholder: 'A short title for your reel' },
      { field: 'endLine', label: 'End card (optional)', group: 'words', kind: 'text', maxLength: 120, placeholder: 'A final line' },
      { field: 'kind', label: 'Kind', group: 'kind', kind: 'choice', default: 'listing', options: [opt('listing', 'Listing'), opt('event', 'Event'), opt('hotel', 'Hotel'), opt('trip', 'Trip'), opt('product', 'Product')] },
      { field: 'seconds', label: 'Length', group: 'length', kind: 'choice', default: '30', options: [opt('15', '15 s'), opt('30', '30 s')] },
      { field: 'motion', label: 'Camera moves', group: 'motion', kind: 'choice', default: 'heroes', options: [opt('heroes', 'Hero photos', 'Camera moves on 3–4 photos; a slow zoom on the rest'), opt('all', 'Every photo')] },
      { field: 'music', label: 'Music', group: 'sound', kind: 'choice', default: 'on', options: [opt('on', 'Music on'), opt('off', 'No music')] },
    ], fixed: { aspect: '9:16' }, generateLabel: 'Generate',
  },
  extend: { slots: [clip('Clip', 'Add the clip to extend', 'The clip to continue from its last frame · MP4, MOV or WEBM · up to 60 s in total'),
      /* H3 Extend · Comfy Cloud (2026-10-27): an optional character photo for every segment (carried over from the clip's own run when it had one) */
      { name: 'character', label: 'Character', kind: 'image', required: false, providers: ['comfy-h3-extend'], hint: 'Optional: a photo of the person, kept for every segment so the face stays the same (H3 Extend · Comfy Cloud). A photo from the clip\'s own run is used automatically', missing: 'Add a photo' }], prompt: { mode: 'optional', placeholder: 'What happens next? (optional)' },
    groups: [G.length, { id: 'direction', label: 'Direction', icon: 'extend' }, G.quality],
    controls: [{ field: 'extendSeconds', label: 'Added length', group: 'length', kind: 'choice', from: 'input', prefix: '+', suffix: ' s', default: '2' /* LTX-2.5 starts on +2 s (a few minutes on a laptop); H3 has no 2, so it keeps its own 5 */ },
      { field: 'direction', label: 'Direction', group: 'direction', kind: 'choice', options: [opt('forward', 'Forward', 'Continue from the last frame'), opt('sequel', 'Sequel', 'A new shot that follows on'), opt('camera-pull', 'Camera pull', 'Pull back to reveal more')] },
      { field: 'resolution', label: 'Resolution', group: 'quality', kind: 'choice', from: 'input' /* LTX-2.5: Draft / Sharper (byProvider) */ }, { field: 'bitrate', label: 'Bitrate', group: 'quality', kind: 'choice', options: [opt('standard', 'Standard'), opt('high', 'High')] },
      { field: 'audio', label: 'Sound', group: 'sound', kind: 'toggle', default: '1' }],
    generateLabel: 'Extend' },
  reframe: { slots: [clip()], prompt: { mode: 'optional', placeholder: 'What should fill the new edges? (optional)' }, groups: [G.shape, { id: 'speed', label: 'Quality', icon: 'quality' }],
    controls: [{ ...ASPECT(), default: '9:16', send: 'field+types' }, { field: 'quality', label: 'Quality', group: 'speed', kind: 'choice', options: [opt('high', 'High'), opt('fast', 'Fast')] }],
    fixed: { resolution: '720p' }, generateLabel: 'Reframe' },
  'sdr-hdr': { slots: [clip()], prompt: { mode: 'hidden', placeholder: '' }, groups: [{ id: 'format', label: 'Format', icon: 'hdr' }, { id: 'strength', label: 'Strength', icon: 'quality' }],
    controls: [{ field: 'format', label: 'Format', group: 'format', kind: 'choice', send: 'types', options: [opt('hdr10', 'HDR10'), opt('hlg', 'HLG')] },
      { field: 'strength', label: 'Strength', group: 'strength', kind: 'slider', min: 0, max: 1, step: 0.05, default: '0.5', percent: true }],
    generateLabel: 'Generate' },
  'fps-boost': { slots: [clip()], prompt: { mode: 'hidden', placeholder: '' }, groups: [{ id: 'fps', label: 'Frame rate', icon: 'fps' }],
    controls: [{ field: 'targetFps', label: 'Target frame rate', group: 'fps', kind: 'choice', send: 'field+types', options: [opt('60', '60 fps'), opt('48', '48 fps')] }],
    generateLabel: 'Generate' },
  'depth-map': { slots: [clip()], prompt: { mode: 'hidden', placeholder: '' }, groups: [{ id: 'format', label: 'Format', icon: 'depth' }],
    controls: [{ field: 'format', label: 'Format', group: 'format', kind: 'choice', send: 'field+types', options: [opt('grey', 'Near = white'), opt('inverted', 'Near = black')] }],
    generateLabel: 'Generate' },
  /* Footage Effects (2026-10-26): Lightricks IC-LoRA effects on the shared LTX-2.5 video-to-video base; free and local, slow (≈ 8 min per 2 s Draft) */
  'footage-fx': { slots: [clip('Clip', 'Add a clip', 'Your footage · MP4, MOV or WEBM; up to 5 s runs at a time (a longer clip uses its start)')],
    prompt: { mode: 'optional', placeholder: 'What is in the shot? One line helps, e.g. a cyclist on a sunny city street (optional)',
      byPreset: { 'remove-object': { mode: 'required', placeholder: 'What should go? e.g. the red car, the man in the hat' }, 'remove-text': { mode: 'hidden', placeholder: '' },
        'extend-frame': { mode: 'optional', placeholder: 'What fills the new edges? e.g. more of the beach and sky (optional)' }, restore: { mode: 'optional', placeholder: 'What is in the shot? e.g. a 1920s street parade (optional)' } } },
    groups: [{ id: 'effect', label: 'Effect', icon: 'fx' }, { id: 'shape', label: 'New shape', icon: 'aspect' }, G.length, G.quality],
    controls: [{ field: 'effect', label: 'Effect', group: 'effect', kind: 'gallery', from: 'presets', send: 'types' },
      { field: 'shape', label: 'New shape', group: 'shape', kind: 'choice', whenPreset: ['extend-frame'], default: '9:16', options: [opt('9:16', '9:16', 'Tall, for phones'), opt('16:9', '16:9', 'Wide'), opt('1:1', '1:1', 'Square')] },
      { field: 'grow', label: 'Grow', group: 'shape', kind: 'choice', whenPreset: ['extend-frame'], default: 'around', options: [opt('around', 'All around'), opt('up', 'Up'), opt('down', 'Down'), opt('left', 'Left'), opt('right', 'Right')] },
      { field: 'duration', label: 'Length', group: 'length', kind: 'choice', options: ['2', '3', '4', '5'].map((s) => opt(s, `${s} s`)), default: '2' },
      { field: 'resolution', label: 'Quality', group: 'quality', kind: 'choice', options: [opt('448p', 'Draft', 'Fastest'), opt('576p', 'Sharper', 'About twice as slow')], default: '448p' },
      { ...KEEP_AUDIO }],
    generateLabel: 'Apply effect' },
  /* Prompt Edit (2026-10-27): Bernini-R on Comfy Cloud (tools/promptEdit.ts), the first 5 s at 480p (fixed); Kling 4.0 (2026-10-31): 3–30 s
   * at 720p or 1080p, its Resolution chip shown for it alone (the tool's resolution input lists each model's sizes) */
  'prompt-edit': { slots: [clip('Clip', 'Add a clip', 'The clip to change · MP4, MOV or WEBM. Bernini-R edits up to 5 s at 480p (a longer clip uses its first 5 s); Kling 4.0 edits 3–30 s at 720p or 1080p')],
    prompt: { mode: 'required', placeholder: 'What should change? e.g. make it night, remove the cup, turn her coat red' }, groups: [G.quality], controls: [{ ...RES(), providers: ['cloud-kling4-edit'] }, { ...KEEP_AUDIO }],
    fixed: { types: '["edit"]', resolution: '480p' }, generateLabel: 'Generate' },
  /* Finish (2026-10-27): our own ffmpeg looks (shared/finishPresets.ts); free, a few seconds per clip */
  finish: { slots: [clip('Clip', 'Add a clip', 'Your footage · MP4, MOV or WEBM; up to 20 s (a longer clip uses its start) and 1080p (bigger is scaled down)')],
    prompt: { mode: 'hidden', placeholder: '' }, groups: [{ id: 'look', label: 'Look', icon: 'fx' }, { id: 'strength', label: 'Strength', icon: 'quality' }, { id: 'stack', label: 'Second look', icon: 'palette' }],
    controls: [{ field: 'look', label: 'Look', group: 'look', kind: 'gallery', from: 'presets', send: 'types' },
      { field: 'strength', label: 'Strength', group: 'strength', kind: 'slider', min: 0, max: 1, step: 0.05, default: '0.6', percent: true },
      { field: 'second', label: 'Second look', group: 'stack', kind: 'choice', default: '', options: [opt('', 'One look only'), ...FINISH_PRESETS.map((p) => opt(p.id, p.label, p.line))] },
      { ...KEEP_AUDIO }],
    generateLabel: 'Finish' },
  'remove-bg': { slots: [clip()], prompt: { mode: 'hidden', placeholder: '' }, groups: [{ id: 'bg', label: 'Background', icon: 'cutout' }],
    controls: [{ field: 'background', label: 'Background', group: 'bg', kind: 'choice', send: 'types', options: [opt('transparent', 'Transparent'), opt('green', 'Green screen'), opt('black', 'Black'), opt('white', 'White')] }],
    generateLabel: 'Generate' },
  cutout: { slots: [clip()], prompt: { mode: 'hidden', placeholder: '' }, groups: [{ id: 'bg', label: 'Background', icon: 'cutout' }, { id: 'edges', label: 'Edges', icon: 'quality' }, G.quality],
    controls: [{ field: 'background', label: 'Background', group: 'bg', kind: 'choice', send: 'types', default: 'green', options: [opt('green', 'Green screen'), opt('blue', 'Blue screen'), opt('white', 'White'), opt('black', 'Black')] },
      { field: 'detail', label: 'Edge detail', group: 'edges', kind: 'choice', options: [opt('fast', 'Fast'), opt('balanced', 'Balanced'), opt('fine', 'Fine', 'Hair and fur')] },
      { field: 'edgeSoftness', label: 'Edge softness', group: 'edges', kind: 'slider', min: 1, max: 30, step: 1, default: '6' }, RES()],
    generateLabel: 'Generate' },
  upscale: { slots: [clip()], prompt: { mode: 'optional', placeholder: 'Details to keep sharp (optional)' }, groups: [{ id: 'mode', label: 'Mode', icon: 'upscale' }, { id: 'out', label: 'Size', icon: 'resolution' }],
    // 2026-10-26 (shared/videoUpscale.ts): Mode only where the model has two (FLUX Video Upscale); one-mode models run their own (Topaz Astra 2 = creative).
    // Size = the output's short side (Topaz: 1080p or 4K only); 60 fps is FPS Boost's job (no upscale engine here makes it).
    controls: [{ field: 'mode', label: 'Mode', group: 'mode', kind: 'choice', send: 'types', providers: ['direct-flux3-upscale'], options: [opt('precise', 'Precise', 'Faithful, nothing added'), opt('creative', 'Creative', 'Adds fine detail')] },
      { field: 'scene', label: 'Footage', group: 'mode', kind: 'choice', providers: ['direct-flux3-upscale'], options: [opt('auto', 'Auto'), opt('ai-gen', 'AI video'), opt('short-series', 'Short series'), opt('ugc', 'Phone footage'), opt('old-film', 'Old film')] },
      { field: 'maxOutput', label: 'Size', group: 'out', kind: 'choice', default: '1080p', options: [opt('720p', '720p'), opt('1080p', '1080p'), opt('1440p', '1440p'), opt('4k', '4K')] }],
    fixed: { resolution: '1080p' }, generateLabel: 'Upscale' },
  'draft-upscale': { slots: [clip('Draft clip', 'Add the draft to upscale', 'A 480p draft · MP4, MOV or WEBM')], prompt: { mode: 'hidden', placeholder: '' }, groups: [], controls: [],
    fixed: { types: '["precise"]', prompt: '', resolution: '1080p' }, generateLabel: 'Upscale' },
  'anime-restyle': { slots: [clip()], prompt: { mode: 'hidden', placeholder: '' }, groups: [G.quality], controls: [RES(), { ...KEEP_AUDIO }],
    fixed: { mode: 'restyle', target: '', prompt: '', preset: 'anime-cel', count: '1' }, generateLabel: 'Restyle' },
  restyle: { slots: [clip(), { name: 'refs', label: 'Style images', kind: 'image', required: false, hint: 'Optional: pictures that show the look', missing: '', multiple: 4 }],
    prompt: { mode: 'optional', placeholder: 'Describe the look (optional)' }, groups: [{ id: 'style', label: 'Style', icon: 'palette' }, G.quality],
    controls: [{ field: 'preset', label: 'Style', group: 'style', kind: 'gallery', from: 'presets' }, RES(), { ...KEEP_AUDIO }],
    fixed: { mode: 'restyle', target: '', count: '1' }, generateLabel: 'Restyle' },
  'motion-control': { slots: [clip('Motion clip', 'Add the motion clip', 'The moves, timing and camera come from it · MP4, MOV or WEBM'), { name: 'refs', label: 'Character', kind: 'image', required: true, hint: 'One clear image of who does the moves', missing: 'Add your character' }],
    prompt: { mode: 'optional', placeholder: 'Anything to change? (optional)' }, groups: [G.quality], controls: [RES(), { ...KEEP_AUDIO }],
    fixed: { mode: 'motion_transfer', target: '', preset: '', count: '1' } /* the job's own mode id (tools/videoSwap.ts); the cloud swap routes judge the quote by it */, generateLabel: 'Generate' },
  transitions: { slots: [{ name: 'image', label: 'Start', kind: 'image', required: true, hint: 'Where the clip begins', missing: 'Add the start image' }, { name: 'lastFrame', label: 'End', kind: 'image', required: true, hint: 'Where the clip lands', missing: 'Add the end image' }],
    prompt: { mode: 'optional', placeholder: 'Describe the move between them (optional)' }, groups: [{ id: 'transition', label: 'Transition', icon: 'transition' }, G.length, G.shape, G.quality],
    controls: [{ field: 'transition', label: 'Transition', group: 'transition', kind: 'choice', from: 'input' }, { ...LEN(), from: 'input' }, ASPECT(), RES()],
    fixed: { types: '["flf"]', enhance: '1' }, generateLabel: 'Generate' },
  'orbit-shot': { slots: [{ name: 'image', label: 'Subject', kind: 'image', required: true, hint: 'One subject, clearly in view', missing: 'Add a photo of your subject' }],
    prompt: { mode: 'optional', placeholder: 'Describe your subject (optional)' }, groups: [{ id: 'orbit', label: 'Orbit', icon: 'orbit' }, G.length, G.shape, G.quality],
    controls: [{ field: 'orbit', label: 'Orbit', group: 'orbit', kind: 'choice', from: 'input' }, { field: 'backdrop', label: 'Backdrop', group: 'orbit', kind: 'choice', options: [opt('keep', 'Keep original'), opt('light', 'Plain light'), opt('dark', 'Plain dark')] },
      LEN(), ASPECT('1:1'), RES()],
    fixed: { types: '[]' }, generateLabel: 'Generate' },
  'camera-moves': { slots: [{ name: 'image', label: 'Photo', kind: 'image', required: 'by-model', hint: 'It becomes the first frame (optional on some models)', missing: 'Add a photo' }],
    prompt: { mode: 'optional', placeholder: 'Describe the scene (optional)' }, groups: [{ id: 'move', label: 'Move', icon: 'camera' }, { id: 'speed', label: 'Speed', icon: 'clock' }, G.length, G.shape, G.quality],
    controls: [{ field: 'move', label: 'Camera move', group: 'move', kind: 'gallery', from: 'presets', send: 'types' },
      { field: 'intensity', label: 'Intensity', group: 'speed', kind: 'choice', options: [opt('slow', 'Slow'), opt('aggressive', 'Aggressive')], providers: ['comfy-h3-camera'] },
      LEN(), ASPECT(), RES()],
    fixed: { enhance: '1', steps: '20' }, generateLabel: 'Generate' },
  'photo-fx': { slots: [{ name: 'image', label: 'Photo', kind: 'image', required: true, hint: 'It becomes the first frame', missing: 'Add a photo' }],
    prompt: { mode: 'optional', placeholder: 'Add a twist (optional)' }, groups: [{ id: 'effect', label: 'Effect', icon: 'fx' }, G.length, G.shape, G.quality],
    controls: [{ field: 'effect', label: 'Effect', group: 'effect', kind: 'gallery', from: 'presets', send: 'types' }, LEN(), ASPECT(), RES()],
    generateLabel: 'Generate' },
  // LTX-2.5 Talking Photo (2026-10-26): the portrait is optional on LTX (text only), an optional look / motion prompt, Draft / Sharper on LTX only.
  'lip-sync': { slots: [{ name: 'image', label: 'Portrait', kind: 'image', required: 'by-model', hint: 'A clear, front-facing photo of one person (optional on LTX-2.5: describe the person instead)', missing: 'Add a portrait' }, { name: 'speech', label: 'Speech', kind: 'audio', required: true, hint: 'WAV, MP3 or M4A · the length limit depends on the model', missing: 'Add the speech' }],
    prompt: { mode: 'optional', placeholder: 'Who is talking and how they look or move (optional)' }, groups: [G.quality, G.shape], mode: 'lipsync',
    controls: [{ field: 'resolution', label: 'Quality', group: 'quality', kind: 'choice', options: [opt('448p', 'Draft', 'Faster: a few minutes for 2 s'), opt('576p', 'Sharper', 'About twice as slow')], default: '448p', providers: ['comfy-ltx25-lipsync'] },
      /* InfiniteTalk · Comfy Cloud (2026-10-27): 480p in the photo's shape, or a picked one */ { field: 'aspect', label: 'Shape', group: 'shape', kind: 'choice', options: [opt('auto', 'Photo shape', 'Wide, tall or square, from the photo'), opt('16:9', '16:9', '832×480'), opt('9:16', '9:16', '480×832'), opt('1:1', '1:1', '640×640')], default: 'auto', providers: ['cloud-infinitetalk'] }],
    fixed: { types: '["lipsync"]', voice: 'narrator-warm', language: 'en', mix: 'replace', volume: '100' }, generateLabel: 'Generate' },
  /* The last three (2026-10-25, step 3): their old screens' extra steps live in the bar too (ui/video/barExtras/): Object Swap's "what to replace"
   * (name it, click it on a frame, or a mask clip; the person to swap), Re-shoot's angle pad and time ranges, UGC Ad's presenter tiles. */
  'object-swap': { slots: [clip('Clip', 'Add the clip to change', 'The shot to change · MP4, MOV or WEBM, 4–30 s'),
      { name: 'refs', label: 'New look', kind: 'image', required: true, hint: 'What goes in: the character, product, outfit or place · PNG, JPG or WEBP', missing: 'Add a photo of what goes in', multiple: 30 }],
    prompt: { mode: 'optional', placeholder: 'Say what should change, e.g. put @image1 in the shot (optional)' },
    groups: [{ id: 'swap', label: 'Swap', icon: 'swap' }, { id: 'preset', label: 'Preset', icon: 'palette' }, G.quality, { id: 'versions', label: 'Versions', icon: 'layers' }],
    controls: [{ field: 'swapType', label: 'What are you swapping?', group: 'swap', kind: 'choice', options: [opt('person', 'Person', 'Keeps their movement and expressions'), opt('object', 'Object', 'Swaps just that thing; the rest stays')] },
      { field: 'preset', label: 'Preset', group: 'preset', kind: 'gallery', from: 'presets', optional: true },
      { field: 'resolution', label: 'Resolution', group: 'quality', kind: 'choice', from: 'input' },
      { field: 'count', label: 'Versions', group: 'versions', kind: 'choice', options: [opt('1', '1 version'), opt('2', '2 versions'), opt('3', '3 versions'), opt('4', '4 versions')], default: '1' },
      { ...KEEP_AUDIO }],
    fixed: { mode: 'object_swap', target: '', preset: '' }, generateLabel: 'Swap' },
  reshoot: { slots: [{ ...clip('Take', 'Add a clip or a photo', 'One take, subject in view · MP4, MOV or WEBM, 4–30 s, or a photo'), altImage: 'sourceImage' },
      { name: 'refs', label: 'Refs', kind: 'image', required: false, hint: 'Optional reference pictures: the subject or the look', missing: '', multiple: 8 },
      { name: 'videoRefs', label: 'Moves', kind: 'video', required: false, hint: 'Optional: short clips that show the camera move (Seedance, up to 15 s in all)', missing: '', multiple: 3, providers: ['router-seedance'] },
      { name: 'audio', label: 'Sound', kind: 'audio', required: false, hint: 'Optional soundtrack: replaces the clip’s own sound · MP3, WAV or M4A', missing: '' }],
    prompt: { mode: 'optional', placeholder: 'Describe the angles, e.g. a low angle from the left, then a slow push in (optional with angles)' },
    groups: [{ id: 'angles', label: 'Angles', icon: 'camera' }, { id: 'output', label: 'Output', icon: 'layers' }, G.length, G.quality],
    controls: [{ field: 'angleCount', label: 'Batch', group: 'output', kind: 'choice', options: [opt('1', 'Single run', 'One run with your angles'), opt('4', 'Batch of 4', 'Four full-clip angles, one output each'), opt('8', 'Batch of 8'), opt('12', 'Batch of 12')], default: '1' },
      { field: 'fullClip', label: 'Each angle as a full clip too', group: 'output', kind: 'choice', options: [opt('0', 'Cut only', 'One multi-angle cut'), opt('1', 'Cut + full clips', 'Also each angle over the whole clip (costs more)')], default: '0' },
      { field: 'seconds', label: 'Length', group: 'length', kind: 'choice', options: [2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => opt(String(n), `${n} s`)), default: '5', whenPhoto: 'video' },
      { field: 'resolution', label: 'Resolution', group: 'quality', kind: 'choice', from: 'input' },
      { field: 'generateAudio', label: 'New sound for the new angles', group: 'sound', kind: 'toggle', default: '0', onLabel: 'New sound', offLabel: 'Clip sound', omitOff: true, providers: ['router-seedance', 'cloud-h3-crossview'] }],
    generateLabel: 'Generate' },
  'ugc-ad': { slots: [{ name: 'image', label: 'Product', kind: 'image', required: false, hint: 'Optional: a clear photo of the product for a closer match', missing: '' },
      { name: 'presenterImage', label: 'Face', kind: 'image', required: false, hint: 'Optional: your own presenter photo, face clearly visible (in place of a presenter tile)', missing: '' }],
    prompt: { mode: 'optional', placeholder: 'Your product and the pitch, e.g. a matte steel water bottle that keeps drinks cold all day (optional)' },
    groups: [{ id: 'presenter', label: 'Presenter', icon: 'person' }, { id: 'hook', label: 'Hook', icon: 'spark' }, G.length, G.quality],
    controls: [{ field: 'presenter', label: 'Presenter', group: 'presenter', kind: 'tiles', from: 'input' }, { field: 'hook', label: 'Hook style', group: 'hook', kind: 'choice', from: 'input' },
      { ...LEN(), default: '15' }, RES()],
    fixed: { types: '["t2v"]', enhance: '1' }, typesWhenFile: { image: '["r2v"]', presenterImage: '["r2v"]' },
    generateLabel: 'Generate' },
};
export const videoBarOf = (workflowId: string | null | undefined): VideoBar | null => (workflowId ? VIDEO_BARS[workflowId] ?? null : null);
/** A control's value as the job's types list (["green"]), or null when it isn't sent that way. */
export const typesOf = (c: VBarControl, v: string): string | null => (c.send === 'types' || c.send === 'field+types') && v ? JSON.stringify([v]) : null;
