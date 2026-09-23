import { render } from '@testing-library/react-native';

import { ReplyWindowBar } from '@/components/queue/reply-window-bar';
import { ReplyWindowPill } from '@/components/queue/reply-window-pill';
import { type ReplyWindowState, windowState } from '@/lib/reply-window';
import { replyWindow } from '@/lib/theme';

const NOW = Date.parse('2026-09-23T12:00:00.000Z');
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function stateLeaving(remainingMs: number): ReplyWindowState {
  return windowState({
    expiresAt: new Date(
      NOW + remainingMs + 5 * MINUTE, // the display margin
    ).toISOString(),
    channel: 'instagram',
    nowMs: NOW,
  });
}

const TEXT_GUEST = windowState({
  expiresAt: null,
  channel: 'text',
  nowMs: NOW,
});
const UNMEASURED = windowState({
  expiresAt: null,
  channel: 'instagram',
  nowMs: NOW,
});

describe('ReplyWindowPill', () => {
  it('states the window in words at every live threshold', () => {
    for (const [remaining, label] of [
      [18 * HOUR, '18h left'],
      [4 * HOUR + 20 * MINUTE, '4h 20m left'],
      [42 * MINUTE, 'Urgent · 42m left'],
      [-3 * HOUR, 'Closed 3h ago'],
    ] as const) {
      const { getByLabelText, unmount } = render(
        <ReplyWindowPill state={stateLeaving(remaining)} />,
      );
      // The accessibility label is the label itself, not a second description
      // that could drift from what is on screen.
      expect(getByLabelText(label)).toBeTruthy();
      unmount();
    }
  });

  /**
   * The escalation has to be legible without colour. "Urgent" is in the string,
   * so an operator who cannot use the clay fill still gets the state.
   */
  it('carries the word Urgent in the label, not only in the fill', () => {
    const { getByLabelText } = render(
      <ReplyWindowPill state={stateLeaving(42 * MINUTE)} />,
    );
    expect(getByLabelText(/Urgent/)).toBeTruthy();
  });

  it('takes a different fill and ink per state', () => {
    // Pinned so a colour edit has to be deliberate: these four are the whole
    // visual escalation, and two of them reading the same would collapse it.
    const kinds = ['plenty', 'close', 'urgent', 'closed'] as const;
    const fills = kinds.map((k) => replyWindow.pillColors[k].bg);
    const inks = kinds.map((k) => replyWindow.pillColors[k].ink);
    expect(new Set(fills).size).toBeGreaterThan(1);
    expect(new Set(inks).size).toBeGreaterThan(1);
    // Only the two loud states are filled; the quiet two sit on the card.
    expect(replyWindow.pillColors.plenty.bg).toBe('transparent');
    expect(replyWindow.pillColors.close.bg).toBe('transparent');
    expect(replyWindow.pillColors.urgent.bg).not.toBe('transparent');
    expect(replyWindow.pillColors.closed.bg).not.toBe('transparent');
  });

  it('renders nothing for a text guest, who keeps the elapsed pill', () => {
    const { queryByTestId } = render(<ReplyWindowPill state={TEXT_GUEST} />);
    expect(queryByTestId('reply-window-pill')).toBeNull();
  });

  /**
   * The Contract's distinction, at the surface. An Instagram guest with no
   * recorded deadline has an UNMEASURED window, not a shut one, so the pill
   * stays away rather than claiming "Closed" about a guest who is still
   * reachable.
   */
  it('renders nothing for an Instagram guest whose window was never measured', () => {
    const { queryByTestId } = render(<ReplyWindowPill state={UNMEASURED} />);
    expect(queryByTestId('reply-window-pill')).toBeNull();
  });
});

describe('ReplyWindowBar', () => {
  // The bar is deliberately hidden from accessibility — the pill beside the
  // guest's name states the same thing in words, and a second announcement of
  // a bar is noise an operator cannot act on. So every query here opts into
  // hidden elements; that it is hidden is itself asserted below.
  const HIDDEN = { includeHiddenElements: true } as const;

  it('draws for every live state and for a closed window', () => {
    for (const remaining of [18 * HOUR, 4 * HOUR, 42 * MINUTE, -3 * HOUR]) {
      const { queryByTestId, unmount } = render(
        <ReplyWindowBar state={stateLeaving(remaining)} />,
      );
      expect(queryByTestId('reply-window-bar', HIDDEN)).not.toBeNull();
      unmount();
    }
  });

  it('stays out of the accessibility tree, because the pill says it in words', () => {
    const { queryByTestId } = render(
      <ReplyWindowBar state={stateLeaving(18 * HOUR)} />,
    );
    expect(queryByTestId('reply-window-bar')).toBeNull();
    expect(queryByTestId('reply-window-bar', HIDDEN)).not.toBeNull();
  });

  it('draws nothing where there is no window to draw', () => {
    for (const state of [TEXT_GUEST, UNMEASURED]) {
      const { queryByTestId, unmount } = render(
        <ReplyWindowBar state={state} />,
      );
      expect(queryByTestId('reply-window-bar', HIDDEN)).toBeNull();
      unmount();
    }
  });

  /**
   * The gradient spans the FILLED width, so a nearly spent bar still shows
   * every colour rather than decaying into the yellows. It is also the same in
   * every live state: only the length changes.
   */
  it('uses the full Instagram gradient at the hand-off stops', () => {
    expect(replyWindow.gradient.colors).toEqual([
      '#FEDA75',
      '#FA7E1E',
      '#D62976',
      '#962FBF',
      '#4F5BD5',
    ]);
    expect(replyWindow.gradient.locations).toEqual([0, 0.25, 0.55, 0.8, 1]);
    // Horizontal, left to right.
    expect(replyWindow.gradient.start).toEqual({ x: 0, y: 0.5 });
    expect(replyWindow.gradient.end).toEqual({ x: 1, y: 0.5 });
  });

  it('is 6px tall on its own track, per A1', () => {
    expect(replyWindow.bar.heightPx).toBe(6);
    expect(replyWindow.bar.trackColor).toBe('rgba(28,24,20,0.10)');
    expect(replyWindow.bar.minFillPx).toBe(8);
  });
});
