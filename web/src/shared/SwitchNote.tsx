import { useEffect, useRef, useState } from 'react';
import './switchNote.css';
/**
 * The bar's one calm line after a model switch moved a setting (2026-10-27, shared/settingsFit.ts fitNote): "Length set to 10 s, the longest
 * LTX-2.5 Pro makes." Same component on Image, Video and Audio. It fades after a few seconds and is replaced by the next switch's note;
 * changing the setting back is the undo (nothing is locked). Polite live region, so a screen reader hears it once.
 */
export function useSwitchNote(ms = 8000): { note: string; show: (t: string | null | undefined) => void } {
  const [note, setNote] = useState(''); const t = useRef<number | undefined>(undefined);
  const show = (s: string | null | undefined) => { window.clearTimeout(t.current); setNote(s ?? ''); if (s) t.current = window.setTimeout(() => setNote(''), ms); };
  useEffect(() => () => window.clearTimeout(t.current), []);
  return { note, show };
}
export function SwitchNote({ note, testId = 'switch-note' }: { note: string; testId?: string }) {
  return <div className="sw-note" role="status" aria-live="polite" data-testid={testId} data-shown={note ? '' : undefined}>{note ? <span>{note}</span> : null}</div>;
}
