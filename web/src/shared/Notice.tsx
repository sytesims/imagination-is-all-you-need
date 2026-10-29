import type { HTMLAttributes, ReactNode } from 'react';
import { Link } from '../platform/router';
import { KindIcon } from './Toast';
import type { ToastAction, ToastKind } from './toastLogic';

/** The one in-page notice (2026-10-25): the toast's visual language, but in the flow of the page, never floating.
 *  - kind: success (orange) · info (neutral) · warn (amber) · error (red), the same four as toasts.
 *  - tone: "box" is a soft tinted glass card for a message about a whole panel or page (queue full, couldn't load);
 *          "line" is just an icon and text, for a message under one field or control (a field error, a save note).
 *  - action: a link / button at the end ({ label, to } or { label, onClick }), or any node (a Retry button).
 *  Screen readers: errors are role="alert", the rest role="status"; `live={false}` for a notice that is not news. */
export type NoticeKind = ToastKind;
type Props = Omit<HTMLAttributes<HTMLElement>, 'title' | 'role'> & {
  kind?: NoticeKind; tone?: 'box' | 'line'; title?: ReactNode; children?: ReactNode;
  action?: ToastAction | ReactNode; onClose?: () => void; /** hide the kind icon */ noIcon?: boolean;
  testId?: string; /** false: no live role; 'alert' / 'status' to force one */ live?: boolean | 'alert' | 'status'; as?: 'div' | 'p' | 'span' | 'small';
};
const isAction = (a: unknown): a is ToastAction => !!a && typeof a === 'object' && 'label' in (a as object) && !('$$typeof' in (a as object));

export function Notice({ kind = 'info', tone = 'box', title, children, action, onClose, noIcon, testId, live = true, as: Tag = 'div', className = '', ...rest }: Props) {
  const role = !live ? undefined : typeof live === 'string' ? live : kind === 'error' ? 'alert' : 'status';
  const act = isAction(action)
    ? action.to ? <Link to={action.to} className="notice-act">{action.label}</Link>
      : <button type="button" className="notice-act" onClick={action.onClick}>{action.label}</button>
    : action;
  return <Tag data-kind={kind} {...rest} className={`notice notice-${kind} notice-${tone}${className ? ' ' + className : ''}`} role={role} data-testid={testId ?? (rest as Record<string, unknown>)['data-testid'] as string | undefined}>
    {!noIcon && <span className="notice-ic" aria-hidden><KindIcon kind={kind} size={tone === 'line' ? 12 : 13} /></span>}
    <span className="notice-body">{title != null && title !== false && <b className="notice-title">{title}</b>}{children != null && children !== false && <span className="notice-text">{children}</span>}</span>
    {act && <span className="notice-acts">{act}</span>}
    {onClose && <button type="button" className="notice-x" aria-label="Dismiss" onClick={onClose}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg></button>}
  </Tag>;
}
