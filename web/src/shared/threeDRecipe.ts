/**
 * A 3D model's settings as a workflow recipe (detail, face count, texture as the shared group chips), so a bar's WorkflowControls shows only
 * what this model takes. Moved out of ui/three/ThreeDStudio.tsx (2026-10-24) so the 3D page and the Canvas bar's 3D card share it.
 */
import type { WfRecipe } from '../ui/next/WorkflowBar';
import { THREE_D_TOOL as TOOL, type ThreeDWorkflow, type ThreeDModel } from '../../../server/src/shared/threeD';

/** The model's settings as a workflow recipe, so the bar's shared group chips (WorkflowControls) show only what this model takes. */
export function recipeFor(m: ThreeDModel | null, wf: ThreeDWorkflow): WfRecipe {
  const ctl = (field: 'detail' | 'texture' | 'faces', label: string, group: string, opts: { value: string; label: string; note?: string }[] | null) => opts && opts.length > 0 ? [{ field, label, kind: 'segmented', group, options: opts.map((o) => ({ value: o.value, label: o.label, ...(o.note ? { credit: o.note } : {}) })), default: m!.defaults[field] }] : [];
  const controls = m ? [...ctl('detail', 'Detail', 'detail', m.detail), ...ctl('faces', 'Face count', 'detail', m.faces), ...ctl('texture', 'Texture', 'texture', m.texture)] : [];
  const groups = [controls.some((c) => c.group === 'detail') && { id: 'detail', label: 'Detail', icon: 'detail', summary: controls.filter((c) => c.group === 'detail').map((c) => c.field) },
    controls.some((c) => c.group === 'texture') && { id: 'texture', label: 'Texture', icon: 'texture', summary: ['texture'] }].filter(Boolean);
  return { id: wf.id, name: wf.name, icon: wf.icon, tagline: wf.tagline, needs: wf.needs, category: wf.category, status: wf.status, slots: [{ name: 'image', label: 'Image', required: true, sendsAs: 'image', order: 1, hint: 'One object or character, on a plain background if you can', missing: 'Add an image' }],
    controls, groups, modes: { default: 'image-to-3d', whenSlot: null }, prompt: { mode: 'hidden', placeholder: '', composer: 'plain' }, source: { kind: wf.source.kind, note: wf.source.note }, models: {}, locked: {}, runner: { kind: 'tool', toolId: TOOL }, generateLabel: wf.generateLabel, modelInfo: {} } as unknown as WfRecipe;
}
