/** The bar's "+" tile words (shared/AddTile.tsx), pure: server/test/add-tile.test.ts. */
/** What the tile says: its label, the badge (only near the limit) and whether it is full. */
export function addTileState(used: number, max: number, noun = 'picture'): { label: string; badge: string | null; full: boolean } {
  const left = Math.max(0, max - used); const full = max > 0 && left === 0;
  const label = full ? 'That’s the most this model takes' : max > 1 ? `Add a ${noun} · up to ${max}` : `Add a ${noun}`;
  return { label, badge: !full && max > 2 && left <= 2 ? `${left} left` : null, full };
}

