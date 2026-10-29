import { splitLead } from './quote';
/** A server demo sentence, shown verbatim. B28a: with the server's short demoTag ('Sample') the tag is a badge and the sentence
 *  is left whole; only when the field is missing does the sentence's own 'Lead:' stand in as the bold tag (the B27 behaviour). */
export function DemoText({ text, tag }: { text: string | null | undefined; tag?: string | null }) {
  if (tag) return <><em className="demo-badge demo-tag" data-testid="demo-tag">{tag}</em> {String(text ?? '').trim()}</>;
  const [lead, rest] = splitLead(text);
  return lead ? <><b>{lead}:</b> {rest}</> : <>{rest}</>;
}
