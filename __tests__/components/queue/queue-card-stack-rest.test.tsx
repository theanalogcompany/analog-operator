import { act, render, screen } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { QueueCardStack } from '@/components/queue/queue-card-stack';
import { type PendingDraft } from '@/lib/api/queue';
import { draftItem } from '@/lib/queue-items';

/**
 * A queue card sits square at rest. (TAC-388.)
 *
 * The hook test proves the rotation value is zero; this proves the card is drawn
 * with it. It reads the transform on the real front card, the one view the
 * gesture moves, so any rotation composed into it (the swipe's, the entrance's,
 * or one added later) shows up here.
 */

jest.mock('@/hooks/use-haptics', () => ({
  useHaptics: () => ({
    swipeThresholdCrossed: jest.fn(),
    swipeRightSuccess: jest.fn(),
    swipeRefused: jest.fn(),
    swipeLeftEdit: jest.fn(),
  }),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 62, left: 0, right: 0, bottom: 34 },
};

function Wrapper({ children }: { children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={metrics}>{children}</SafeAreaProvider>;
}

function makeDraft(): PendingDraft {
  return {
    messageId: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueSlug: 'mock-sextant',
    venueTimezone: null,
    guestId: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    guestDisplayName: 'Maya R.',
    guestPhoneFallback: '+15551110001',
    draftBody: 'Patio is open until 9.',
    category: null,
    voiceFidelity: 0.81,
    reviewReason: null,
    recognitionState: 'returning',
    agentReasoning: null,
    pendingSinceMs: 240_000,
    recentContext: [],
    langfuseTraceId: null,
    reviewReasonCode: '',
    reviewTriggers: [],
    reviewTriggerLabels: [],
    ungroundedClaims: [],
  };
}

type Transform = Record<string, string | number>;

describe('QueueCardStack: the front card at rest', () => {
  it('is drawn with no rotation', async () => {
    render(
      <Wrapper>
        <QueueCardStack
          items={[draftItem(makeDraft())]}
          position={1}
          total={1}
          onApprove={jest.fn()}
          onEdit={jest.fn()}
          onRefuseApprove={jest.fn()}
          onAcknowledge={jest.fn()}
          onDecline={jest.fn()}
          onPressHelp={jest.fn()}
        />
      </Wrapper>,
    );
    // Let the card's icon font settle, so its state update lands inside act().
    await act(async () => {});
    const style = StyleSheet.flatten(screen.getByTestId('queue-front-card').props.style);
    const transform = (style.transform ?? []) as Transform[];
    const rotate = transform.find((entry) => 'rotate' in entry);
    // Guards the guard: a card drawn with no rotate entry at all would pass the
    // value check below while telling us nothing.
    expect(rotate).toBeDefined();
    expect(rotate?.rotate).toBe('0deg');
    expect(transform.find((entry) => 'translateX' in entry)?.translateX).toBe(0);
  });
});
