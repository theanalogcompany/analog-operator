import { render, screen } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  QueueCardStack,
  isComposerTap,
  peekOpacity,
  resolveCardLayout,
} from '@/components/queue/queue-card-stack';
import {
  LEFT_WASH,
  OVERLAY_WIDTH_FRACTION,
  RIGHT_WASH,
  WASH_LOCATIONS,
  washOpacity,
} from '@/components/queue/swipe-overlay';
import { hintState } from '@/components/queue/swipe-hints';
import { type PendingDraft } from '@/lib/api/queue';
import { card, peek } from '@/lib/theme';

/**
 * TAC-312, restated: a claim about what the swipe does cannot be made by a test
 * that mocks the swipe away. The previous suite drove `onApprove` directly with
 * `QueueCardStack` mocked to `() => null` and reported green while the gesture
 * flew blank cards off the deck.
 *
 * So the drag-derived values — card geometry, peek brightness, wash opacity,
 * hint sizing, composer hit-testing — are extracted as pure functions and
 * tested here at full resolution. The render tests below cover wiring only, and
 * claim nothing about the gesture.
 */

const metrics = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 62, left: 0, right: 0, bottom: 34 },
};

function Wrapper({ children }: { children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={metrics}>{children}</SafeAreaProvider>;
}

function makeDraft(overrides: Partial<PendingDraft> = {}): PendingDraft {
  return {
    messageId: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueSlug: 'mock-sextant',
    venueTimezone: null,
    guestId: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    guestDisplayName: 'Maya R.',
    guestPhoneFallback: '+15551110001',
    draftBody: 'Patio is open until 9.',
    category: 'reservation',
    voiceFidelity: 0.81,
    reviewReason: 'low fidelity score',
    recognitionState: 'returning',
    agentReasoning: null,
    pendingSinceMs: 240_000,
    recentContext: [],
    langfuseTraceId: null,
    ...overrides,
  };
}

describe('resolveCardLayout', () => {
  it('uses the design geometry when there is room for it', () => {
    // 874 tall, minus the top inset and nav, still leaves well over 560 + 96.
    expect(resolveCardLayout(720)).toEqual({
      cardHeight: card.heightPx,
      hintReserve: card.hintReservePx,
    });
  });

  it('assumes the design geometry before the first measurement', () => {
    expect(resolveCardLayout(0)).toEqual({
      cardHeight: card.heightPx,
      hintReserve: card.hintReservePx,
    });
  });

  it('shrinks the card first, keeping the hint row whole', () => {
    // 600 available - 96 reserve = 504, which is above the floor.
    expect(resolveCardLayout(600)).toEqual({
      cardHeight: 504,
      hintReserve: card.hintReservePx,
    });
  });

  it('never returns more than the design height, however tall the screen', () => {
    expect(resolveCardLayout(2000).cardHeight).toBe(card.heightPx);
  });

  it('borrows from the hint reserve rather than shrinking past the floor', () => {
    // 520 - 96 = 424, under the 440 floor. The 16px deficit comes out of the
    // reserve, which has 36px of give before it hits its own minimum.
    const { cardHeight, hintReserve } = resolveCardLayout(520);
    expect(cardHeight).toBe(card.minHeightPx);
    expect(hintReserve).toBe(card.hintReservePx - 16);
    expect(hintReserve).toBeGreaterThanOrEqual(card.hintReserveMinPx);
  });

  it('stops borrowing at the hint reserve minimum', () => {
    const { hintReserve } = resolveCardLayout(300);
    expect(hintReserve).toBe(card.hintReserveMinPx);
  });

  it('gives the remainder to the card once both budgets are spent', () => {
    // Genuinely tiny screens: the card goes under its floor, and because region
    // c is the only flex child, the loss lands on the conversation rather than
    // on the head or the composer.
    const { cardHeight, hintReserve } = resolveCardLayout(300);
    expect(cardHeight).toBe(300 - card.hintReserveMinPx);
    expect(hintReserve + cardHeight).toBe(300);
  });

  it('never returns a negative height', () => {
    expect(resolveCardLayout(10).cardHeight).toBeGreaterThanOrEqual(0);
  });

  it('always leaves the hint row somewhere to sit', () => {
    for (const height of [300, 400, 520, 600, 720, 900]) {
      const { cardHeight, hintReserve } = resolveCardLayout(height);
      expect(hintReserve).toBeGreaterThanOrEqual(card.hintReserveMinPx);
      expect(cardHeight + hintReserve).toBeLessThanOrEqual(
        Math.max(height, card.heightPx + card.hintReservePx),
      );
    }
  });
});

describe('peekOpacity', () => {
  it('rests at the design’s base alpha for each depth', () => {
    expect(peekOpacity(peek.near.baseOpacity, peek.near.dragGain, 0)).toBeCloseTo(
      0.55,
    );
    expect(peekOpacity(peek.far.baseOpacity, peek.far.dragGain, 0)).toBeCloseTo(
      0.26,
    );
  });

  it('brightens to base + gain at full drag', () => {
    expect(peekOpacity(peek.near.baseOpacity, peek.near.dragGain, 1)).toBeCloseTo(
      0.9,
    );
    expect(peekOpacity(peek.far.baseOpacity, peek.far.dragGain, 1)).toBeCloseTo(
      0.42,
    );
  });

  it('scales linearly in between', () => {
    expect(
      peekOpacity(peek.near.baseOpacity, peek.near.dragGain, 0.5),
    ).toBeCloseTo(0.725);
  });

  it('clamps out-of-range intensity instead of overshooting', () => {
    expect(peekOpacity(0.55, 0.35, 5)).toBeCloseTo(0.9);
    expect(peekOpacity(0.55, 0.35, -3)).toBeCloseTo(0.55);
  });

  it('never exceeds fully opaque', () => {
    expect(peekOpacity(0.9, 0.9, 1)).toBe(1);
  });
});

describe('washOpacity', () => {
  it('shows the send wash only while the drag heads right', () => {
    expect(washOpacity('right', 1, 0.6)).toBeCloseTo(0.6);
    expect(washOpacity('right', -1, 0.6)).toBe(0);
    expect(washOpacity('right', 0, 0.6)).toBe(0);
  });

  it('shows the edit wash only while the drag heads left', () => {
    expect(washOpacity('left', -1, 0.6)).toBeCloseTo(0.6);
    expect(washOpacity('left', 1, 0.6)).toBe(0);
  });

  it('leaves both washes invisible at rest', () => {
    expect(washOpacity('left', 0, 0)).toBe(0);
    expect(washOpacity('right', 0, 0)).toBe(0);
  });
});

describe('hintState', () => {
  it('grows the hint being dragged toward', () => {
    expect(hintState({ side: 'left', direction: -1, intensity: 1 })).toEqual({
      grow: 1,
      dim: 0,
    });
  });

  it('dims the opposite hint', () => {
    expect(hintState({ side: 'right', direction: -1, intensity: 1 })).toEqual({
      grow: 0,
      dim: 1,
    });
  });

  it('leaves both at rest when the card is not moving', () => {
    expect(hintState({ side: 'left', direction: 0, intensity: 0 })).toEqual({
      grow: 0,
      dim: 0,
    });
    expect(hintState({ side: 'right', direction: 0, intensity: 0 })).toEqual({
      grow: 0,
      dim: 0,
    });
  });

  it('never grows and dims the same hint at once', () => {
    for (const side of ['left', 'right'] as const) {
      for (const direction of [-1, 0, 1] as const) {
        const { grow, dim } = hintState({ side, direction, intensity: 0.7 });
        expect(grow === 0 || dim === 0).toBe(true);
      }
    }
  });
});

describe('isComposerTap', () => {
  it('accepts a tap at or below the composer’s top edge', () => {
    expect(isComposerTap(431, 431)).toBe(true);
    expect(isComposerTap(500, 431)).toBe(true);
  });

  it('rejects a tap above the composer', () => {
    expect(isComposerTap(430, 431)).toBe(false);
    expect(isComposerTap(0, 431)).toBe(false);
  });

  it('rejects every tap before the composer has been measured', () => {
    // -1 is the unmeasured sentinel. Without this guard the first tap anywhere
    // on a freshly-mounted card would open the takeover.
    expect(isComposerTap(0, -1)).toBe(false);
    expect(isComposerTap(800, -1)).toBe(false);
  });
});

describe('QueueCardStack — wiring', () => {
  const noop = () => {};

  it('renders the front draft', () => {
    render(
      <Wrapper>
        <QueueCardStack
          drafts={[makeDraft()]}
          position={1}
          total={4}
          onApprove={noop}
          onEdit={noop}
          onRefuseApprove={noop}
          onPressHelp={noop}
        />
      </Wrapper>,
    );
    expect(screen.getByText('MAYA R.')).toBeTruthy();
    expect(screen.getByText('01 / 04')).toBeTruthy();
  });

  it('renders only the front draft, not the whole deck', () => {
    render(
      <Wrapper>
        <QueueCardStack
          drafts={[
            makeDraft(),
            makeDraft({
              messageId: '22b5e0d2-3a4f-4b6c-9d7e-8f9a0b1c2d3e',
              guestDisplayName: 'Devon L.',
            }),
          ]}
          position={1}
          total={4}
          onApprove={noop}
          onEdit={noop}
          onRefuseApprove={noop}
          onPressHelp={noop}
        />
      </Wrapper>,
    );
    expect(screen.getByText('MAYA R.')).toBeTruthy();
    // The peek cards behind the front one are blank slabs, not rendered cards.
    expect(screen.queryByText('DEVON L.')).toBeNull();
  });

  it('offers the edit hint and the send hint on a sendable card', () => {
    render(
      <Wrapper>
        <QueueCardStack
          drafts={[makeDraft()]}
          position={1}
          total={4}
          onApprove={noop}
          onEdit={noop}
          onRefuseApprove={noop}
          onPressHelp={noop}
        />
      </Wrapper>,
    );
    expect(screen.getByLabelText('Swipe left to edit')).toBeTruthy();
    expect(screen.getByLabelText('Swipe right to send')).toBeTruthy();
  });

  it('tells the operator that a blank card cannot be sent', () => {
    render(
      <Wrapper>
        <QueueCardStack
          drafts={[makeDraft({ draftBody: '' })]}
          position={1}
          total={4}
          onApprove={noop}
          onEdit={noop}
          onRefuseApprove={noop}
          onPressHelp={noop}
        />
      </Wrapper>,
    );
    // "Write", not "Edit" — there is nothing to edit.
    expect(screen.getByLabelText('Swipe left to write')).toBeTruthy();
    expect(
      screen.getByLabelText(
        'Swipe right to send, unavailable — nothing drafted',
      ),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Swipe right to send')).toBeNull();
  });

  it('renders nothing when the deck is empty', () => {
    render(
      <Wrapper>
        <QueueCardStack
          drafts={[]}
          position={1}
          total={0}
          onApprove={noop}
          onEdit={noop}
          onRefuseApprove={noop}
          onPressHelp={noop}
        />
      </Wrapper>,
    );
    expect(screen.queryByText('MAYA R.')).toBeNull();
  });
});

// Unlike the grounds, the wash colors are final in the handoff — so unlike
// lib/grounds.test.ts, locking literal values here is the right call. The
// failure this guards against is one ramp being wired to feed both directions:
// it would look almost identical and would quietly lose the design's
// distinction between committing to send and committing to edit.
describe('the swipe washes', () => {
  it('covers 64% of the card from each edge', () => {
    expect(OVERLAY_WIDTH_FRACTION).toBe(0.64);
  });

  it('ramps the send wash from 0.94', () => {
    expect(RIGHT_WASH).toEqual([
      'rgba(168,86,56,0.94)',
      'rgba(168,86,56,0.52)',
      'rgba(168,86,56,0.18)',
      'rgba(168,86,56,0)',
    ]);
  });

  it('ramps the edit wash from 0.92 — a different ramp, not the same one', () => {
    expect(LEFT_WASH).toEqual([
      'rgba(58,53,48,0.92)',
      'rgba(58,53,48,0.5)',
      'rgba(58,53,48,0.16)',
      'rgba(58,53,48,0)',
    ]);
  });

  it('keeps the two ramps distinct', () => {
    const alphaOf = (c: string) => c.slice(c.lastIndexOf(',') + 1, -1);
    expect(RIGHT_WASH.map(alphaOf)).not.toEqual(LEFT_WASH.map(alphaOf));
  });

  it('shares the stop positions, which the design does unify', () => {
    expect(WASH_LOCATIONS).toEqual([0, 0.44, 0.74, 1]);
  });
});
