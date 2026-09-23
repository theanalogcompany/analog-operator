import {
  CLOSE_HOURS,
  DISPLAY_MARGIN_MS,
  URGENT_MINS,
  WINDOW_HOURS,
  hasWindow,
  isExpired,
  windowState,
} from '@/lib/reply-window';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** A fixed instant, so nothing here depends on when the suite runs. */
const NOW = Date.parse('2026-09-23T12:00:00.000Z');

/**
 * Build a deadline that leaves exactly `remainingMs` AFTER the display margin
 * is subtracted. Every case below is written in terms of what the operator
 * should see, not in terms of the raw server value, which is what the margin
 * exists to separate.
 */
function deadlineLeaving(remainingMs: number): string {
  return new Date(NOW + DISPLAY_MARGIN_MS + remainingMs).toISOString();
}

function stateLeaving(remainingMs: number) {
  return windowState({
    expiresAt: deadlineLeaving(remainingMs),
    channel: 'instagram',
    nowMs: NOW,
  });
}

describe('windowState thresholds', () => {
  // The six boundaries the design hand-off names explicitly.

  it('is plenty above the close threshold', () => {
    expect(stateLeaving(CLOSE_HOURS * HOUR + 1).kind).toBe('plenty');
    expect(stateLeaving(18 * HOUR).kind).toBe('plenty');
  });

  it('is close at EXACTLY the close threshold, not plenty', () => {
    // The hand-off's table reads `60m <= remaining <= 6h`, so 6h is close.
    expect(stateLeaving(CLOSE_HOURS * HOUR).kind).toBe('close');
  });

  it('is close at EXACTLY the urgent threshold, not urgent', () => {
    // `urgent` is `remaining < 60m`, so 60m itself is still close.
    expect(stateLeaving(URGENT_MINS * MINUTE).kind).toBe('close');
  });

  it('is urgent one minute under the urgent threshold', () => {
    expect(stateLeaving(59 * MINUTE).kind).toBe('urgent');
  });

  it('is closed at exactly zero', () => {
    expect(stateLeaving(0).kind).toBe('closed');
  });

  it('is closed past zero', () => {
    expect(stateLeaving(-1).kind).toBe('closed');
    expect(stateLeaving(-3 * HOUR).kind).toBe('closed');
  });
});

describe('the display margin', () => {
  it('shows closed while the server deadline is still in the future', () => {
    // The whole reason the margin exists: inside it the server's own send gate
    // already refuses, so a card that still read "2m left" would invite a
    // swipe that fails.
    const state = windowState({
      expiresAt: new Date(NOW + DISPLAY_MARGIN_MS - MINUTE).toISOString(),
      channel: 'instagram',
      nowMs: NOW,
    });
    expect(state.kind).toBe('closed');
  });

  it('is exactly the margin wide', () => {
    // One millisecond the far side of the margin is still open.
    const state = windowState({
      expiresAt: new Date(NOW + DISPLAY_MARGIN_MS + 1).toISOString(),
      channel: 'instagram',
      nowMs: NOW,
    });
    expect(state.kind).toBe('urgent');
  });

  it('matches the server gate it mirrors', () => {
    expect(DISPLAY_MARGIN_MS).toBe(5 * MINUTE);
  });
});

describe('labels', () => {
  it('shows hours only when there is plenty of time', () => {
    const state = stateLeaving(18 * HOUR);
    expect(state.kind === 'plenty' && state.label).toBe('18h left');
  });

  it('rounds DOWN, so a card never overstates what is left', () => {
    // 59 minutes must never read as "1h left".
    const state = stateLeaving(HOUR + 59 * MINUTE);
    expect(state.kind === 'close' && state.label).toBe('1h 59m left');
  });

  it('shows minutes once the window is getting close', () => {
    const state = stateLeaving(4 * HOUR + 20 * MINUTE);
    expect(state.kind === 'close' && state.label).toBe('4h 20m left');
  });

  it('drops a zero minutes rather than reading "6h 0m left"', () => {
    const state = stateLeaving(CLOSE_HOURS * HOUR);
    expect(state.kind === 'close' && state.label).toBe('6h left');
  });

  it('carries the word Urgent, so the state never depends on colour', () => {
    const state = stateLeaving(42 * MINUTE);
    expect(state.kind === 'urgent' && state.label).toBe('Urgent · 42m left');
  });

  it('counts UP once the window has closed', () => {
    const state = stateLeaving(-3 * HOUR);
    expect(state.kind === 'closed' && state.label).toBe('Closed 3h ago');
  });

  it('counts closed time in minutes under an hour and days past one', () => {
    const minutes = stateLeaving(-42 * MINUTE);
    expect(minutes.kind === 'closed' && minutes.label).toBe('Closed 42m ago');
    const days = stateLeaving(-50 * HOUR);
    expect(days.kind === 'closed' && days.label).toBe('Closed 2d ago');
  });

  it('says "Just closed" rather than "Closed 0m ago"', () => {
    const state = stateLeaving(-1);
    expect(state.kind === 'closed' && state.label).toBe('Just closed');
  });

  it('carries no em dash anywhere', () => {
    // TAC-364: card-facing copy uses a middle dot, never an em dash.
    for (const remaining of [18 * HOUR, 4 * HOUR, 42 * MINUTE, -3 * HOUR]) {
      const state = stateLeaving(remaining);
      const label = 'label' in state ? state.label : '';
      expect(label).not.toContain('—');
    }
  });
});

describe('the bar fill', () => {
  it('is the fraction of the full window still open', () => {
    const state = stateLeaving(12 * HOUR);
    expect(state.kind === 'plenty' && state.fill).toBeCloseTo(0.5, 5);
  });

  it('never exceeds 1, even if the server sends a deadline beyond the window', () => {
    const state = stateLeaving(WINDOW_HOURS * HOUR * 2);
    expect(state.kind === 'plenty' && state.fill).toBe(1);
  });

  it('is nearly spent by the time the card is urgent', () => {
    const state = stateLeaving(42 * MINUTE);
    expect(state.kind === 'urgent' && state.fill).toBeLessThan(0.03);
  });
});

describe('a window that does not exist, and one nobody has measured', () => {
  it('reports none for a text guest', () => {
    const state = windowState({ expiresAt: null, channel: 'text', nowMs: NOW });
    expect(state.kind).toBe('none');
  });

  it('reports none for a text guest even if a deadline somehow came through', () => {
    // The channel decides. A text card has no reply window whatever else is on
    // the row.
    const state = windowState({
      expiresAt: deadlineLeaving(2 * HOUR),
      channel: 'text',
      nowMs: NOW,
    });
    expect(state.kind).toBe('none');
  });

  it('reports unknown, NOT closed, for an Instagram guest with no deadline', () => {
    // TAC-473's Contract is explicit: a null deadline on an Instagram
    // conversation means the window was never measured, not that it shut.
    // Rendering "expired" here tells the operator a reachable guest is out of
    // reach, and stops them answering someone they could still answer.
    const state = windowState({
      expiresAt: null,
      channel: 'instagram',
      nowMs: NOW,
    });
    expect(state.kind).toBe('unknown');
    expect(isExpired(state)).toBe(false);
  });

  it('fails toward unknown, not closed, on an unparseable deadline', () => {
    const state = windowState({
      expiresAt: 'not a date',
      channel: 'instagram',
      nowMs: NOW,
    });
    expect(state.kind).toBe('unknown');
    expect(isExpired(state)).toBe(false);
  });

  it('draws no bar for either', () => {
    expect(hasWindow(windowState({ expiresAt: null, channel: 'text', nowMs: NOW }))).toBe(false);
    expect(
      hasWindow(windowState({ expiresAt: null, channel: 'instagram', nowMs: NOW })),
    ).toBe(false);
  });

  it('draws a bar for every live state and for closed', () => {
    for (const remaining of [18 * HOUR, 4 * HOUR, 42 * MINUTE, -3 * HOUR]) {
      expect(hasWindow(stateLeaving(remaining))).toBe(true);
    }
  });
});

describe('isExpired', () => {
  it('is true only when the window has closed', () => {
    expect(isExpired(stateLeaving(-1))).toBe(true);
    expect(isExpired(stateLeaving(1))).toBe(false);
    expect(isExpired(stateLeaving(18 * HOUR))).toBe(false);
  });
});
