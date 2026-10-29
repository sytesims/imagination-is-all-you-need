/** server_status accounts: GET /api/accounts answers {accounts: [...], cacheSeconds, mockBackend} (an array in older servers). Names, connection and
 *  balance only (never keys). null when the answer isn't readable. Setup step 6 (2026-10-26): it checked Array.isArray on the object, so accounts was always null. */
export function accountsOf(acc: unknown): { provider: string; name: string; connected: boolean; balanceUsd?: number; sample?: true }[] | null {
  const list = Array.isArray(acc) ? acc : acc && typeof acc === 'object' && Array.isArray((acc as any).accounts) ? (acc as any).accounts : null;
  if (!list) return null;
  return list.filter((x: any) => x && typeof x === 'object').map((x: any) => ({ provider: String(x.provider ?? ''), name: String(x.name ?? x.provider ?? ''), connected: !!x.connected,
    ...(typeof x.balanceUsd === 'number' ? { balanceUsd: x.balanceUsd } : {}), ...(x.mock ? { sample: true as const } : {}) }));
}
