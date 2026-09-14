import { fireEvent, render, screen } from '@testing-library/react-native';

import { ConversationRow } from '@/components/conversations/conversation-row';
import { type ConversationSummary } from '@/lib/api/conversations';

const BASE: ConversationSummary = {
  guestId: 'g1',
  venueId: 'v1',
  venueSlug: 'mock-sextant',
  venueTimezone: 'America/Los_Angeles',
  agentName: 'Sana',
  name: 'Maya R.',
  phoneFallback: '+15551110001',
  recognitionState: 'returning',
  lastMessageAt: new Date(Date.now() - 2 * 60_000).toISOString(),
  lastMessageDirection: 'outbound',
  lastMessagePreview: 'Done — got you down for two at 7:30.',
  conversationCount: 4,
  firstConversationAt: new Date(Date.now() - 90 * 24 * 60 * 60_000).toISOString(),
};

describe('ConversationRow', () => {
  it('renders the guest name, badge label, and preview', () => {
    render(<ConversationRow conversation={BASE} onPress={() => {}} banded />);
    // Row names render as tracked caps on the ground.
    expect(screen.getByText('MAYA R.')).toBeTruthy();
    expect(screen.getByLabelText('Recognition: Returning')).toBeTruthy();
    expect(screen.getByText(/Done — got you down for two at 7:30\./)).toBeTruthy();
  });

  it('falls back to the phone number when name is null', () => {
    render(<ConversationRow conversation={{ ...BASE, name: null }} onPress={() => {}} banded />);
    expect(screen.getByText('+15551110001')).toBeTruthy();
  });

  it('labels the speaker as the agent name for an outbound last message', () => {
    render(<ConversationRow conversation={BASE} onPress={() => {}} banded />);
    // The design's preview format is "Sana — Done — got you down…".
    expect(screen.getByText(/Sana —/)).toBeTruthy();
  });

  it('labels the speaker as "Guest" for an inbound last message', () => {
    render(
      <ConversationRow
        conversation={{ ...BASE, lastMessageDirection: 'inbound', lastMessagePreview: 'hi!' }}
        onPress={() => {}}
        banded
      />,
    );
    expect(screen.getByText(/Guest —/)).toBeTruthy();
  });

  it('fires onPress when tapped', () => {
    const onPress = jest.fn();
    render(<ConversationRow conversation={BASE} onPress={onPress} banded />);
    fireEvent.press(screen.getByLabelText('Open conversation with Maya R.'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
