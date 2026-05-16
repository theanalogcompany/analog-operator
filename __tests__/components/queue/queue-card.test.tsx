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

  it('renders recentContext bubbles by default (always-expanded)', () => {
    render(
      <QueueCard
        draft={makeDraft({
          recentContext: [
            {
              id: 'bb11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
              direction: 'inbound',
              body: 'is the patio open',
              createdAt: '2026-05-14T16:00:00.000Z',
            },
          ],
        })}
      />,
    );
    expect(screen.getByText('is the patio open')).toBeTruthy();
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
