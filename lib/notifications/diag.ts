/**
 * Production-visible diagnostic logs for the push-notification registration
 * path. Plain `console.*` (NOT `__DEV__`-gated) so the messages survive into
 * release builds and surface in macOS Console.app filtered by the analog-
 * operator bundle when an operator pulls device logs during UAT.
 *
 * Sized to be cheap (one line per event) and unambiguous (prefix + structured
 * key/value pairs). When TAC-288's APNs flow stops needing forensic-grade
 * tracing post-pilot, fold these back to `__DEV__` gates or remove entirely.
 *
 * ## Why `level` exists (TAC-419)
 *
 * React Native routes every JS console call through `RCTDefaultLogFunction`,
 * which calls `os_log_with_type` with a `%{public}s` format — so the text is
 * never redacted to `<private>`. But the os_log TYPE is derived from the JS
 * level by `RCTLogTypeForLogLevel` (RCTLog.mm), and BOTH `console.log` and
 * `console.warn` map to `OS_LOG_TYPE_INFO`. **Console.app hides Info and Debug
 * messages by default** — they are not recorded to the persistent store either,
 * so they cannot be recovered after the fact.
 *
 * That default is almost certainly why TAC-288 concluded production builds
 * "can't bridge `console.log` to iOS unified logging" and fell back to toasts:
 * an Info line that is present but filtered out looks exactly like no line at
 * all. Only `console.error` maps to `OS_LOG_TYPE_ERROR`, which Console.app
 * shows without any filter change and which persists in the log store.
 *
 * So a diagnostic whose whole purpose is to be read off a TestFlight build
 * passes `level: 'error'`. It is not reporting an error; it is asking for the
 * one os_log type that is visible by default. The default stays `'log'` so
 * every existing caller is unchanged.
 */
export function logDiag(
  event: string,
  details?: Record<string, unknown>,
  level: 'log' | 'error' = 'log',
): void {
  // eslint-disable-next-line no-console
  const sink = level === 'error' ? console.error : console.log;
  if (details) {
    sink(`[apns] ${event}`, details);
  } else {
    sink(`[apns] ${event}`);
  }
}
