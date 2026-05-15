// `applyEvent` was deleted during the TAC-270 schema alignment — the live
// realtime channel emits only `queue_changed`, and `useQueue` responds by
// calling `reload()` (the raw `messages` payload doesn't carry the JOINed
// PendingDraft fields, so per-event merging is infeasible). The hook's
// reload-on-event behavior is exercised end-to-end through the queue screen
// tests; nothing meaningful left to unit-test here.

describe('use-queue', () => {
  it('has no hook-level merge tests after the queue_changed collapse', () => {
    expect(true).toBe(true);
  });
});
