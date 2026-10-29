import { useEffect, useState } from 'react';
/** <details> that opens itself when `autoOpen` turns true but never closes on its own. The old
 *  `open={!!prompt || undefined}` pattern collapsed the box the moment the prompt was cleared, so the next
 *  keystrokes went into a hidden textarea ("prompt box drops characters"). The user's own toggle always wins. */
export default function StickyDetails({ autoOpen, className, children }: { autoOpen: boolean; className?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(autoOpen);
  useEffect(() => { if (autoOpen) setOpen(true); }, [autoOpen]);
  return <details className={className} open={open} onToggle={e => { const o = e.currentTarget.open; if (o !== open) setOpen(o); }}>{children}</details>;
}
/** Batch 25: an on/off section. The header is a real switch (role=switch, aria-checked follows the open state); the body shows
 *  only while it's on. `onChange` lets the caller set aside or restore what the body holds, so "off" never sends hidden input. */
export function SwitchDetails({ autoOpen, className, label, testId, onChange, children }: { autoOpen: boolean; className?: string; label: React.ReactNode; testId?: string; onChange?: (on: boolean) => void; children: React.ReactNode }) {
  const [open, setOpen] = useState(autoOpen);
  useEffect(() => { if (autoOpen) setOpen(true); }, [autoOpen]);
  return <details className={className} data-testid={testId} open={open} onToggle={e => { const o = e.currentTarget.open; if (o !== open) { setOpen(o); onChange?.(o); } }}>
    <summary role="switch" aria-checked={open}>{label}<i className="toggle-ui" aria-hidden /></summary>{children}</details>;
}
