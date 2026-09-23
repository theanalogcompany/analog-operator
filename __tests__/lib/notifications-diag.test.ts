import { logDiag } from '@/lib/notifications/diag';

/**
 * TAC-419 — the `level` argument is the whole reason a tap diagnostic is
 * readable off a TestFlight build, and until this file existed nothing gated
 * it. CLAUDE.md asserts the property in prose; a prose claim about behaviour
 * that no test pins is the defect class its own TAC-408 entry names. Folding
 * `logDiag` back to a single `console.log` must turn something red.
 *
 * Why it matters, verified against the installed RN 0.81.5:
 * `RCTLogTypeForLogLevel` (RCTLog.mm) maps BOTH console.log and console.warn to
 * `OS_LOG_TYPE_INFO`, which Console.app hides by default and never persists to
 * the log store. Only console.error reaches `OS_LOG_TYPE_ERROR`.
 */
describe('logDiag level routing', () => {
  let log: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
    error = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    log.mockRestore();
    error.mockRestore();
  });

  it("routes level 'error' to console.error, the only level Console.app shows by default", () => {
    logDiag('tap parse FAILED', { data: 'null' }, 'error');
    expect(error).toHaveBeenCalledWith('[apns] tap parse FAILED', { data: 'null' });
    expect(log).not.toHaveBeenCalled();
  });

  it('defaults to console.log so existing callers are unchanged', () => {
    logDiag('register start');
    expect(log).toHaveBeenCalledWith('[apns] register start');
    expect(error).not.toHaveBeenCalled();
  });

  it('carries the details object through on both levels', () => {
    logDiag('a', { k: 1 });
    logDiag('b', { k: 2 }, 'error');
    expect(log).toHaveBeenCalledWith('[apns] a', { k: 1 });
    expect(error).toHaveBeenCalledWith('[apns] b', { k: 2 });
  });

  it('omits the second argument entirely when there are no details', () => {
    logDiag('tap listener fired', undefined, 'error');
    expect(error).toHaveBeenCalledWith('[apns] tap listener fired');
  });
});
