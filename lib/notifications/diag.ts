/**
 * Production-visible diagnostic logs for the push-notification registration
 * path. Plain `console.log` (NOT `__DEV__`-gated) so the messages survive into
 * release builds and surface in macOS Console.app filtered by the analog-
 * operator bundle when an operator pulls device logs during UAT.
 *
 * Sized to be cheap (one line per event) and unambiguous (prefix + structured
 * key/value pairs). When TAC-288's APNs flow stops needing forensic-grade
 * tracing post-pilot, fold these back to `__DEV__` gates or remove entirely.
 */
export function logDiag(event: string, details?: Record<string, unknown>): void {
  if (details) {
    // eslint-disable-next-line no-console
    console.log(`[apns] ${event}`, details);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[apns] ${event}`);
  }
}
