/** GET /api/jobs/:id/support → copyable text (falls back to a local summary). */
export async function copySupport(id: string, fallback: string): Promise<void> {
  let text = fallback;
  try { const r = await fetch(`/api/jobs/${id}/support`); if (r.ok) { const j = await r.json(); text = j.text ?? JSON.stringify(j, null, 2); } } catch { /* offline */ }
  await navigator.clipboard?.writeText(text);
}
