import Svg from 'react-native-svg';
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
  guestChannel: 'text',
  replyWindowExpiresAt: null,
  instagramUsername: null,
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

  // TAC-411. An empty preview means no message has reached this guest, so
  // `lastMessageDirection` came from an unsent draft — naming a speaker would
  // claim someone said something nobody received.
  describe('empty preview', () => {
    const EMPTY = { ...BASE, lastMessagePreview: '' };

    it('renders no speaker and no dash', () => {
      render(<ConversationRow conversation={EMPTY} onPress={() => {}} banded />);
      expect(screen.queryByText(/Sana/)).toBeNull();
      expect(screen.queryByText(/Guest/)).toBeNull();
      expect(screen.queryByText(/—/)).toBeNull();
    });

    it('names no speaker for an inbound-direction empty preview either', () => {
      render(
        <ConversationRow
          conversation={{ ...EMPTY, lastMessageDirection: 'inbound' }}
          onPress={() => {}}
          banded
        />,
      );
      expect(screen.queryByText(/Guest/)).toBeNull();
      expect(screen.queryByText(/—/)).toBeNull();
    });

    it('holds the preview line\'s height so the row keeps its rhythm', () => {
      render(<ConversationRow conversation={EMPTY} onPress={() => {}} banded />);
      const spacer = screen.getByTestId('conversation-row-no-preview');
      expect(spacer.props.style).toMatchObject({ height: 18, marginTop: 6 });
    });

    it('still renders the name, badge and time', () => {
      render(<ConversationRow conversation={EMPTY} onPress={() => {}} banded />);
      expect(screen.getByText('MAYA R.')).toBeTruthy();
      expect(screen.getByLabelText('Recognition: Returning')).toBeTruthy();
    });
  });

  it('fires onPress when tapped', () => {
    const onPress = jest.fn();
    render(<ConversationRow conversation={BASE} onPress={onPress} banded />);
    fireEvent.press(screen.getByLabelText('Open conversation with Maya R.'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

/**
 * Instagram rows in the Texts list (TAC-486, B3). Changes to each row and
 * nothing else: the banded-row layout, the activity dot, the time and the
 * preview are all untouched.
 */
describe('ConversationRow and Instagram guests', () => {
  const instagram = (over: Partial<ConversationSummary> = {}): ConversationSummary => ({
    ...BASE,
    guestChannel: 'instagram',
    instagramUsername: 'mia.brews',
    name: 'Mia B.',
    phoneFallback: '',
    ...over,
  });

  it('marks an Instagram row with the glyph', () => {
    render(<ConversationRow conversation={instagram()} onPress={() => {}} banded />);
    expect(screen.getByText('MIA B.')).toBeTruthy();
    // The glyph is the only SVG in a row.
    expect(screen.UNSAFE_queryAllByType(Svg).length).toBeGreaterThan(0);
  });

  it('leaves a text row unmarked, because text is the default channel', () => {
    render(<ConversationRow conversation={BASE} onPress={() => {}} banded />);
    expect(screen.UNSAFE_queryAllByType(Svg)).toHaveLength(0);
  });

  /**
   * The hand-off: "Never show a number for an Instagram guest." An unnamed one
   * shows their handle, in its own case — nobody can look up `@LENA.EATS`.
   */
  it('shows an unnamed Instagram guest by their handle, untracked', () => {
    render(
      <ConversationRow
        conversation={instagram({ name: null, instagramUsername: 'lena.eats' })}
        onPress={() => {}}
        banded
      />,
    );
    expect(screen.getByText('@lena.eats')).toBeTruthy();
    expect(screen.queryByText('@LENA.EATS')).toBeNull();
  });

  /**
   * The live defect. `phoneFallback` is `''` for a phoneless Instagram guest
   * and `??` does not fall back on an empty string, so `name ?? phoneFallback`
   * rendered a blank row name.
   */
  it('never renders a blank name', () => {
    render(
      <ConversationRow
        conversation={instagram({ name: null, instagramUsername: null })}
        onPress={() => {}}
        banded
      />,
    );
    expect(screen.getByText('INSTAGRAM GUEST')).toBeTruthy();
  });

  it('still shows an unnamed text guest by their number', () => {
    render(
      <ConversationRow
        conversation={{ ...BASE, name: null }}
        onPress={() => {}}
        banded
      />,
    );
    expect(screen.getByText('+15551110001')).toBeTruthy();
  });
});
