/** The footer's links, one list for both footers (2026-10-31): Explore's orange footer shows every column; the grey strip on other pages
 *  shows the Learn column's two notes next to Source code. Settings, Spend and Assets live in the header and its menus, so not here.
 *  Guides is the book's BOOK_PATH (learn/ecomChapters.ts; the test checks they match), written out so the main bundle doesn't load the book's text.
 *  A link starting with http opens in a new tab; Source code takes the repo URL the server reports (Home reads /api/config). */
import { IMAGE_PAGE, VIDEO_PAGE, AUDIO_PAGE, THREE_D_PAGE } from '../../../server/src/shared/pages';

export type FootLink = [label: string, to: string];

/** Models & licences and Usage notes: in Explore's Learn column and on the grey strip. */
export const FOOT_NOTES: FootLink[] = [['Models & licences', '/licenses'], ['Usage notes', '/terms']];

export const footerCols = (repoUrl: string): [string, FootLink[]][] => [
  ['Make', [['Image', IMAGE_PAGE], ['Video', VIDEO_PAGE], ['Audio', AUDIO_PAGE], ['3D', THREE_D_PAGE], ['Canvas', '/canvas'], ['Workflows', '/workflows']]],
  ['Learn', [['Guides', '/learn/ai-ecommerce'], ...FOOT_NOTES]],
  ['Project', [['Source code', repoUrl], ['MCP', '/mcp'], ['API docs', '/api-docs'], ['Plugins', '/plugins']]],
];

/** The quiet line under both footers: the name and licence (the grey strip adds its links after them). */
export const FOOT_NAME = 'Imagination Is All You Need · AGPL-3.0';
