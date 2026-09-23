import { type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { QueueCardStack } from '@/components/queue/queue-card-stack';
import { __resetNowClockForTests } from '@/hooks/use-now';
import { type PendingDraft } from '@/lib/api/queue';
import { CARD_COPY } from '@/lib/card-copy';
import { draftItem } from '@/lib/queue-items';

const NOW = Date.parse('2026-09-23T12:00:00.000Z');

/** A deadline leaving `minutes` of window AFTER the 5 minute display margin. */
const leaving = (minutes: number): string =>
  new Date(NOW + (minutes + 5) * 60_000).toISOString();

function makeDraft(overrides: Partial<PendingDraft> = {}): PendingDraft {
  return {
    messageId: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueSlug: 'mock-sextant',
    venueTimezone: null,
    guestId: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    guestDisplayName: 'Mia B.',
    guestPhoneFallback: '',
    guestChannel: 'instagram',
    replyWindowExpiresAt: leaving(-3 * 60),
    instagramUsername: 'mia.brews',
    replacedDraft: null,
    replyingTo: null,
    draftBody:
      'Sorry about Saturday. Your next round is on us, come in any time this week.',
    category: null,
    voiceFidelity: null,
    reviewReason: 'This commits you to something.',
    reviewReasonCode: 'commitment_type_gated',
    reviewTriggers: [],
    reviewTriggerLabels: [],
    ungroundedClaims: [],
    recognitionState: 'regular',
    agentReasoning: null,
    pendingSinceMs: 240_000,
    recentContext: [],
    langfuseTraceId: null,
    ...overrides,
  };
}

const noop = () => {};

const metrics = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 62, left: 0, right: 0, bottom: 34 },
};

function Wrapper({ children }: { children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={metrics}>{children}</SafeAreaProvider>;
}

function renderStack(draft: PendingDraft, over: Record<string, unknown> = {}) {
  return render(
    <QueueCardStack
      items={[draftItem(draft)]}
      position={1}
      total={1}
      onApprove={noop}
      onEdit={noop}
      onRefuseApprove={noop}
      onAcknowledge={noop}
      onDecline={noop}
      onPressHelp={noop}
      onCopyAndOpen={noop}
      onOpenHandle={noop}
      onBlockedExpired={noop}
      {...over}
    />,
    { wrapper: Wrapper },
  );
}

describe('the expired card', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    __resetNowClockForTests();
  });

  afterEach(() => {
    __resetNowClockForTests();
    jest.useRealTimers();
  });

  it('says the window is closed on the strip, in place of the bucket', () => {
    renderStack(makeDraft());
    expect(screen.getByLabelText(CARD_COPY.replyWindow.strip)).toBeTruthy();
    // The bucket's own name is gone: the card has left play.
    expect(screen.queryByLabelText('Obligation')).toBeNull();
  });

  it('explains what happened, with a live duration', () => {
    renderStack(makeDraft());
    expect(screen.getByTestId('expired-reason').props.children).toBe(
      'Instagram stopped accepting replies 3 hours ago. The draft is still good, it just has to go out from Instagram.',
    );
  });

  it('keeps the draft visible and selectable rather than hiding it', () => {
    renderStack(makeDraft());
    const box = screen.getByTestId('expired-composer');
    expect(box).toBeTruthy();
    expect(screen.getByText(/Your next round is on us/)).toBeTruthy();
  });

  it('replaces the composer outright, so nothing looks sendable', () => {
    renderStack(makeDraft());
    expect(screen.getByTestId('expired-composer')).toBeTruthy();
    expect(screen.queryByTestId('queue-card-composer')).toBeNull();
    // The send-ready caption would be a straight lie here.
    expect(screen.queryByLabelText(CARD_COPY.composer.hasDraft)).toBeNull();
  });

  it('offers exactly one action', () => {
    renderStack(makeDraft());
    expect(
      screen.getByLabelText(CARD_COPY.replyWindow.copyAction),
    ).toBeTruthy();
  });

  it('runs that action on press', () => {
    const onCopyAndOpen = jest.fn();
    const draft = makeDraft();
    renderStack(draft, { onCopyAndOpen });
    fireEvent.press(screen.getByLabelText(CARD_COPY.replyWindow.copyAction));
    expect(onCopyAndOpen).toHaveBeenCalledWith(draft);
  });

  /**
   * Ruled 2026-09-23, option B. The line is on EVERY expired card, not only
   * ones whose reason code looks like a commitment: TAC-401 measured the agent
   * promising in prose with no carrier in 20 of 60 replies, so a notice that
   * appeared only on flagged cards would teach the operator that its absence
   * means "this one is safe".
   */
  it('says plainly that copying records nothing', () => {
    renderStack(makeDraft());
    expect(screen.getByTestId('copy-records-nothing').props.children).toBe(
      CARD_COPY.replyWindow.copyRecordsNothing,
    );
  });

  it('says it on a card with no commitment code at all', () => {
    renderStack(makeDraft({ reviewReasonCode: 'knowledge_gap' }));
    expect(screen.getByTestId('copy-records-nothing')).toBeTruthy();
  });

  /**
   * Design resolution 1: the greyed "EDIT OFF / SEND OFF" row goes, because it
   * points at what is missing rather than at the one thing available. The row
   * itself stays, because it carries the only "Chat with Jaipal" affordance on
   * this screen and losing that would be a regression rather than a
   * translation.
   */
  it('drops both swipe hints but keeps the way to reach a human', () => {
    renderStack(makeDraft());
    expect(screen.getByTestId('swipe-hints-expired')).toBeTruthy();
    expect(screen.queryByLabelText(CARD_COPY.hints.send)).toBeNull();
    expect(screen.queryByLabelText(CARD_COPY.hints.edit)).toBeNull();
    expect(screen.queryByLabelText(CARD_COPY.hints.sendUnavailable)).toBeNull();
    expect(screen.getByLabelText('Chat with Jaipal via SMS')).toBeTruthy();
  });

  it('leaves a live card with its swipe hints', () => {
    renderStack(makeDraft({ replyWindowExpiresAt: leaving(4 * 60) }));
    expect(screen.queryByTestId('swipe-hints-expired')).toBeNull();
    expect(screen.getByLabelText(CARD_COPY.hints.send)).toBeTruthy();
  });

  it('keeps the composer and the bucket strip while the window is open', () => {
    renderStack(makeDraft({ replyWindowExpiresAt: leaving(4 * 60) }));
    expect(screen.getByTestId('queue-card-composer')).toBeTruthy();
    expect(screen.queryByTestId('expired-composer')).toBeNull();
    expect(screen.getByLabelText('Obligation')).toBeTruthy();
  });
});
