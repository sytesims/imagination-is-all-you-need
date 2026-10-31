/** Create Image feed layout: the shown jobs split into sections, in order. Each Compare models run is one section (its own row with a
 *  header); the singles between groups are plain sections that flow into the justified tile rows (imageCanvas.css .ic-jfeed).
 *  A plain section followed by a group must end its last row with a filler (.ic-jfill): the group takes a full line, so without it the
 *  tiles on that last row grow to fill the whole width (one single result became a full-width, cropped banner above the group). */
export interface FeedSection<J, T> { group: string | null; jobs: J[]; tiles: T[]; /** end the last tile row here (a group comes next) */ fill: boolean }

export function feedSections<J extends { compare?: { id?: string } | null }, T>(shown: J[], tileOf: (j: J) => T[]): FeedSection<J, T>[] {
  const out: FeedSection<J, T>[] = [];
  for (const j of shown) {
    const g = j.compare?.id || null; const last = out[out.length - 1];
    if (last && last.group === g) { last.jobs.push(j); last.tiles.push(...tileOf(j)); continue; } // same compare group, or more singles
    if (last && !last.group && g) last.fill = true;
    out.push({ group: g, jobs: [j], tiles: tileOf(j), fill: false });
  }
  return out;
}

/** A set that is still being sent (Material Swap's swatches, Compare models' runs go one request at a time): every place it will have,
 *  from the first frame, so the set row appears once at its full size and each card updates in place. `members` are the set's jobs so far
 *  (any order); `make(i)` is a waiting card for place i. Places are 0 … n-1 (n from the members' compare.n). Sorted by place. */
export function withSetPlaces<J extends { compare?: { n?: number; i?: number } | null }>(members: J[], make: (i: number) => J): J[] {
  const byI = (x: J) => Number(x.compare?.i ?? 0); const n = Math.max(0, ...members.map(x => Number(x.compare?.n ?? 0)));
  const have = new Set(members.map(byI)); const out = [...members];
  for (let i = 0; i < n; i++) if (!have.has(i)) out.push(make(i));
  return out.sort((a, b) => byI(a) - byI(b));
}
