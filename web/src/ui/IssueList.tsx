import { Notice } from '../shared/Notice';
/** Submit errors (400 `issues: [{code, field, message}]`): summary list + per-field inline helper. */
export interface Issue { code: string; field?: string; message: string; /** B27: unsupported_aspect etc.: the values the server accepts; each is offered as a switch */ allowed?: string[] }
/** B27: 'Use 9:16' offers for an issue with allowed values; the tool form listens for ohf:fix-field and sets the field. */
export const FIX_FIELD_EVT = 'ohf:fix-field';
const Offers = ({ i }: { i: Issue }) => Array.isArray(i.allowed) && i.allowed.length && i.field ? <span className="iss-offers" data-testid="issue-offers">{i.allowed.slice(0, 7).map(v => <button key={v} type="button" className="link-btn iss-offer" data-testid={`issue-use-${v}`} onClick={() => window.dispatchEvent(new CustomEvent(FIX_FIELD_EVT, { detail: { field: i.field, value: v } }))}>Use {v}</button>)}</span> : null;
export default function IssueList({ issues }: { issues: Issue[] }) {
  if (!issues.length) return null;
  return <Notice kind="error" className="issue-sum" title={issues.length === 1 ? 'Fix this to continue' : `Fix these ${issues.length} things to continue`}><ul>{issues.map((i, k) => <li key={k} data-field={i.field || undefined}>{i.message} <Offers i={i} /></li> /* B27: the server's sentence names the setting; the raw field id isn't shown */)}</ul></Notice>;
}
export const FieldIssue = ({ issues, field }: { issues: Issue[]; field: string }) => { const i = issues.find(x => x.field === field); return i ? <Notice as="p" kind="error" tone="line" className="field-err" testId={`field-issue-${field}`}>{i.message} <Offers i={i} /></Notice> : null; };
