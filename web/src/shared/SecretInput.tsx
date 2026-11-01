/** One masked field for API keys and tokens (Welcome, Settings → Connections, the connect sheet).
 *  The look is the shared text field (styles.css); this adds a Show/Hide toggle and keeps password managers out:
 *  autocomplete off plus the 1Password / LastPass / Bitwarden / Dashlane opt-outs, and the browser's own key button hidden in CSS.
 *  Enter calls onEnter, so callers don't need a <form> (a lone password field in a form reads as a login to browsers). */
import { useState, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { onEnter?: () => void };

export function SecretInput({ onEnter, onKeyDown, disabled, ...rest }: Props) {
  const [shown, setShown] = useState(false);
  return <span className="secret">
    <input {...rest} disabled={disabled} type={shown ? 'text' : 'password'} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
      data-1p-ignore="" data-lpignore="true" data-bwignore="" data-form-type="other"
      onKeyDown={e => { onKeyDown?.(e); if (!e.defaultPrevented && e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); } }} />
    {/* mousedown keeps focus in the field, so showing the key doesn't count as leaving it */}
    <button type="button" className="secret-eye" aria-pressed={shown} aria-label={shown ? 'Hide key' : 'Show key'} disabled={disabled}
      onMouseDown={e => e.preventDefault()} onClick={() => setShown(s => !s)}>{shown ? 'Hide' : 'Show'}</button>
  </span>;
}
