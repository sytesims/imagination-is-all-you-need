import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { checkMediaFailure, mediaFailureOf, type MediaFailure } from './mediaFailure';

export function useMediaFailure(src: string) {
  const [bad, setBad] = useState<{ src: string; reason: MediaFailure } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const pending = useRef<AbortController | null>(null);
  const clear = () => { pending.current?.abort(); pending.current = null; setBad(null); };
  useEffect(() => { clear(); return () => { pending.current?.abort(); }; }, [src]);
  const onError = (e: SyntheticEvent<HTMLMediaElement>): boolean => {
    const el = e.currentTarget;
    const reason = mediaFailureOf(el.error?.code);
    if (e.target !== el || !reason || !el.isConnected) return false;
    // A late event from a replaced/unloaded source must not poison the next output.
    if (!el.getAttribute('src') || (el.currentSrc && el.currentSrc !== new URL(src, document.baseURI).href)) return false;
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    setBad({ src, reason });
    void checkMediaFailure(src, reason, controller.signal).then(why => { if (!controller.signal.aborted) setBad({ src, reason: why }); });
    return true;
  };
  return { reason: bad?.src === src ? bad.reason : null, attempt, onError, clear,
    retry: () => { clear(); setAttempt(n => n + 1); } };
}
