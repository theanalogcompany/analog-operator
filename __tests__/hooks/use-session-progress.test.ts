import { act, renderHook } from '@testing-library/react-native';

import {
  emptyProgress,
  observeDrafts,
  readProgress,
  recordCleared,
  recordRestored,
  useSessionProgress,
} from '@/hooks/use-session-progress';

// The counter is session progress, not deck position. The distinction only
// shows up under two events — a realtime insert and an undo — so those are
// what these tests are actually about.
describe('session progress', () => {
  const deck = ['a', 'b', 'c', 'd'];

  it('starts at the first of however many were loaded', () => {
    const state = observeDrafts(emptyProgress, deck);
    expect(readProgress(state)).toEqual({ position: 1, total: 4 });
  });

  it('advances the numerator as cards are cleared', () => {
    let state = observeDrafts(emptyProgress, deck);
    state = recordCleared(state, 'a');
    expect(readProgress(state)).toEqual({ position: 2, total: 4 });
    state = recordCleared(state, 'b');
    expect(readProgress(state)).toEqual({ position: 3, total: 4 });
  });

  it('keeps the denominator when a cleared card leaves the deck', () => {
    let state = observeDrafts(emptyProgress, deck);
    state = recordCleared(state, 'a');
    // The next load no longer contains 'a'.
    state = observeDrafts(state, ['b', 'c', 'd']);
    expect(readProgress(state)).toEqual({ position: 2, total: 4 });
  });

  it('grows the denominator on a realtime insert rather than moving the numerator', () => {
    // The whole reason for this shape. A position-in-list counter would read
    // "01 / 05" here and look like the operator had gone backwards; this reads
    // "02 / 05", which says plainly: you have done one, more came in.
    let state = observeDrafts(emptyProgress, deck);
    state = recordCleared(state, 'a');
    state = observeDrafts(state, ['b', 'c', 'd', 'e']);
    expect(readProgress(state)).toEqual({ position: 2, total: 5 });
  });

  it('rolls the numerator back on undo', () => {
    let state = observeDrafts(emptyProgress, deck);
    state = recordCleared(state, 'a');
    state = recordCleared(state, 'b');
    expect(readProgress(state)).toEqual({ position: 3, total: 4 });
    state = recordRestored(state, 'b');
    expect(readProgress(state)).toEqual({ position: 2, total: 4 });
  });

  it('does not let an undo of something never cleared move the counter', () => {
    let state = observeDrafts(emptyProgress, deck);
    state = recordRestored(state, 'a');
    expect(readProgress(state)).toEqual({ position: 1, total: 4 });
  });

  it('is idempotent when the same card is cleared twice', () => {
    let state = observeDrafts(emptyProgress, deck);
    state = recordCleared(state, 'a');
    state = recordCleared(state, 'a');
    expect(readProgress(state)).toEqual({ position: 2, total: 4 });
  });

  it('counts a card cleared without ever being observed', () => {
    // A notification tap can dispatch a card that was never the front of a
    // rendered deck. Without folding it into `seen`, position would overtake
    // total and the card would read "02 / 01".
    let state = observeDrafts(emptyProgress, ['a']);
    state = recordCleared(state, 'z');
    const { position, total } = readProgress(state);
    expect(total).toBe(2);
    expect(position).toBeLessThanOrEqual(total);
  });

  it('never reads past the total once the deck is drained', () => {
    let state = observeDrafts(emptyProgress, deck);
    for (const id of deck) state = recordCleared(state, id);
    const { position, total } = readProgress(state);
    expect(position).toBeLessThanOrEqual(total);
  });

  it('returns the same state object when nothing new was seen', () => {
    const state = observeDrafts(emptyProgress, deck);
    expect(observeDrafts(state, deck)).toBe(state);
  });
});

// TAC-382: the counter is scoped to the selected venue. Driving the real hook
// rather than the reducers, because the scoping is the hook's behavior — the
// reducers below it never see a venue at all.
describe('useSessionProgress scoped to a venue', () => {
  const VENUE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const VENUE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  it('starts the count over when the venue changes', () => {
    const { result, rerender } = renderHook(
      ({ ids, venue }: { ids: string[]; venue: string }) =>
        useSessionProgress(ids, venue),
      { initialProps: { ids: ['a', 'b', 'c', 'd'], venue: VENUE_A } },
    );
    expect(result.current.total).toBe(4);

    // Switching to a venue with three cards must read "01 / 03", not "01 / 07".
    rerender({ ids: ['x', 'y', 'z'], venue: VENUE_B });
    expect(result.current.total).toBe(3);
    expect(result.current.position).toBe(1);
  });

  it('forgets cards cleared at the previous venue', () => {
    const { result, rerender } = renderHook(
      ({ ids, venue }: { ids: string[]; venue: string }) =>
        useSessionProgress(ids, venue),
      { initialProps: { ids: ['a', 'b'], venue: VENUE_A } },
    );
    act(() => result.current.markCleared('a'));
    expect(result.current.position).toBe(2);

    rerender({ ids: ['x', 'y'], venue: VENUE_B });
    expect(result.current.position).toBe(1);
    expect(result.current.total).toBe(2);
  });

  it('keeps counting normally while the venue holds still', () => {
    const { result, rerender } = renderHook(
      ({ ids, venue }: { ids: string[]; venue: string }) =>
        useSessionProgress(ids, venue),
      { initialProps: { ids: ['a', 'b'], venue: VENUE_A } },
    );
    act(() => result.current.markCleared('a'));
    // A realtime insert grows the denominator rather than resetting it.
    rerender({ ids: ['b', 'c'], venue: VENUE_A });
    expect(result.current.total).toBe(3);
    expect(result.current.position).toBe(2);
  });

  it('restores the count when returning to the original venue', () => {
    // Progress is per-session and not persisted per venue, so coming back
    // starts fresh rather than resurrecting a stale denominator.
    const { result, rerender } = renderHook(
      ({ ids, venue }: { ids: string[]; venue: string }) =>
        useSessionProgress(ids, venue),
      { initialProps: { ids: ['a', 'b', 'c'], venue: VENUE_A } },
    );
    rerender({ ids: ['x'], venue: VENUE_B });
    rerender({ ids: ['a', 'b', 'c'], venue: VENUE_A });
    expect(result.current.total).toBe(3);
    expect(result.current.position).toBe(1);
  });
});
