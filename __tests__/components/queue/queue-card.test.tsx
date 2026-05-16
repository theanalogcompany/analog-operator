import { fireEvent, render, screen } from '@testing-library/react-native';

import { QueueCard } from '@/components/queue/queue-card';
import { type PendingDraft } from '@/lib/api/queue';

function makeDraft(overrides: Partial<PendingDraft> = {}): PendingDraft {
  return {
    messageId: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueSlug: 'mock-sextant',
    guestId: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    guestDisplayName: 'Maya R.',
    guestPhoneFallback: '+15551110001',
    draftBody: "Yes — patio's open until 9.",
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

describe('QueueCard', () => {
  it('renders the guest name + recognition badge', () => {
    render(<QueueCard draft={makeDraft({ recognitionState: 'raving_fan' })} />);
    expect(screen.getByText('Maya R.')).toBeTruthy();
    expect(screen.getByText('Raving Fan')).toBeTruthy();
  });

  it('falls back to guestPhoneFallback when guestDisplayName is null', () => {
    render(<QueueCard draft={makeDraft({ guestDisplayName: null })} />);
    expect(screen.getByText('+15551110001')).toBeTruthy();
  });

  it('renders the review-reason banner when present', () => {
    render(
      <QueueCard
        draft={makeDraft({ reviewReason: 'first message from new guest' })}
      />,
    );
    expect(screen.getByText(/first message from new guest/)).toBeTruthy();
    expect(screen.getByText(/Flagged because:/)).toBeTruthy();
  });

  it('omits the review-reason banner when reviewReason is null', () => {
    render(<QueueCard draft={makeDraft({ reviewReason: null })} />);
    expect(screen.queryByText(/Flagged because:/)).toBeNull();
  });

  it('renders only the most recent inbound when recentContext has multiple entries', () => {
    render(
      <QueueCard
        draft={makeDraft({
          recentContext: [
            {
              id: 'bb11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
              direction: 'inbound',
              body: 'earlier inbound from yesterday',
              createdAt: '2026-05-14T16:00:00.000Z',
            },
            {
              id: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
              direction: 'outbound',
              body: 'operator reply in between',
              createdAt: '2026-05-14T16:05:00.000Z',
            },
            {
              id: 'dd11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
              direction: 'inbound',
              body: 'the latest inbound message',
              createdAt: '2026-05-14T16:10:00.000Z',
            },
          ],
        })}
      />,
    );
    expect(screen.getByText('the latest inbound message')).toBeTruthy();
    expect(screen.queryByText('earlier inbound from yesterday')).toBeNull();
    expect(screen.queryByText('operator reply in between')).toBeNull();
  });

  it('renders no inbound bubble when recentContext is empty', () => {
    render(<QueueCard draft={makeDraft({ recentContext: [] })} />);
    // Draft body still renders; that confirms the card mounted with no inbound.
    expect(screen.getByText("Yes — patio's open until 9.")).toBeTruthy();
  });

  it('renders no inbound bubble when recentContext has only outbound messages', () => {
    render(
      <QueueCard
        draft={makeDraft({
          recentContext: [
            {
              id: 'ee11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
              direction: 'outbound',
              body: 'operator-initiated outbound',
              createdAt: '2026-05-14T16:00:00.000Z',
            },
          ],
        })}
      />,
    );
    expect(screen.queryByText('operator-initiated outbound')).toBeNull();
  });

  it('renders agentReasoning when present', () => {
    render(
      <QueueCard
        draft={makeDraft({
          agentReasoning: 'Operator should lean into the warmth here.',
        })}
      />,
    );
    expect(
      screen.getByText('Operator should lean into the warmth here.'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Agent reasoning')).toBeTruthy();
  });

  it('omits agentReasoning when null', () => {
    render(<QueueCard draft={makeDraft({ agentReasoning: null })} />);
    expect(screen.queryByLabelText('Agent reasoning')).toBeNull();
  });

  it('omits agentReasoning when empty string (defensive trim)', () => {
    render(<QueueCard draft={makeDraft({ agentReasoning: '   ' })} />);
    expect(screen.queryByLabelText('Agent reasoning')).toBeNull();
  });

  it('renders the draftBody', () => {
    render(<QueueCard draft={makeDraft({ draftBody: 'a unique draft body' })} />);
    expect(screen.getByText('a unique draft body')).toBeTruthy();
  });

  it('omits the recognition badge when recognitionState is null', () => {
    render(<QueueCard draft={makeDraft({ recognitionState: null })} />);
    expect(screen.queryByLabelText(/Recognition:/)).toBeNull();
  });

  it('fires onPressDraftBubble when the draft bubble Pressable is pressed', () => {
    const onPress = jest.fn();
    render(<QueueCard draft={makeDraft()} onPressDraftBubble={onPress} />);
    fireEvent.press(screen.getByLabelText('Edit draft'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('marks the draft bubble disabled when no onPressDraftBubble is given (PeekCard usage)', () => {
    render(<QueueCard draft={makeDraft()} />);
    const pressable = screen.getByLabelText('Edit draft');
    expect(pressable.props.accessibilityState).toMatchObject({ disabled: true });
  });
});
