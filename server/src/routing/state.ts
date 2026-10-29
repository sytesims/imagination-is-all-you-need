/** Job ids currently executing a single route attempt (providers.runWithProvider must not re-enter the router for them). */
export const directRun = new Set<string>();
/** Fix-ups a routed failure (routing/run.ts) registers for the end of the queue's settle(), which rewrites refund + message for a plain failure.
 *  A setImmediate alone loses that race when settle() runs inside a timer callback: an HTTP poll handled before the check phase saw
 *  settle's refunded:false (seen on slow CI runners, bh9-filming). */
export const afterSettle = new WeakMap<object, () => void>();
