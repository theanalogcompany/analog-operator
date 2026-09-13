import {
  emptyProgress,
  observeDrafts,
  readProgress,
  recordCleared,
  recordRestored,
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
