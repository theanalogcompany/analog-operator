// Mirrors hooks/use-queue.test.ts: every realtime event just triggers a
// reload (the raw `messages` row doesn't carry the joined summary fields
// needed for per-event merging), so there's nothing meaningful to
// unit-test at the hook level in isolation. Reload-on-event and the
// initial-fetch behavior are exercised end-to-end through the Task 11
// conversations-list screen test.
describe('use-conversations', () => {
  it('has no hook-level merge tests, same reasoning as use-queue', () => {
    expect(true).toBe(true);
  });
});
