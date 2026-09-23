import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import {
  ReplyQuote,
  lastRenderedMessageId,
  shouldShowReplyQuote,
} from '@/components/queue/reply-quote';
import { type ReplyingTo } from '@/lib/api/queue';
import { CARD_COPY } from '@/lib/card-copy';
import { dividerBacking } from '@/lib/theme';
import { type ThreadItem } from '@/lib/thread-cluster';

const OAT_MILK = 'a1b2c3d4-4444-4a5b-8c6d-7e8f9a0b1c2d';
const SUNDAY = 'a1b2c3d4-4446-4a5b-8c6d-7e8f9a0b1c2d';

const replyingTo: ReplyingTo = {
  messageId: OAT_MILK,
  body: 'do you have oat milk for any drink?',
  createdAt: '2026-09-23T18:04:11.271Z',
};

function bubble(id: string): ThreadItem {
  return {
    kind: 'bubble',
    key: `b-${id}`,
    message: { id, direction: 'inbound', body: 'x', createdAt: '2026-09-23T18:00:00.000Z' },
    position: 'only',
  };
}

function separator(): ThreadItem {
  return { kind: 'timestamp', key: 't-1', label: 'Today · 9:39 AM' };
}

describe('shouldShowReplyQuote', () => {
  it('withholds the quote when there is nothing to quote', () => {
    expect(shouldShowReplyQuote(null, SUNDAY)).toBe(false);
  });

  it('shows the quote when the draft answers something other than the last message', () => {
    // TAC-533's whole case: the question is scrolled out of view above, and
    // three newer unrelated questions sit between it and the draft.
    expect(shouldShowReplyQuote(replyingTo, SUNDAY)).toBe(true);
  });

  it('withholds the quote when the draft answers the last message already shown', () => {
    // Acceptance criterion 3: "a card whose draft answers the newest message
    // looks no worse than it does today" — literally, as a zero-pixel diff.
    expect(shouldShowReplyQuote(replyingTo, OAT_MILK)).toBe(false);
  });

  it('shows the quote when the thread renders no messages at all', () => {
    // An empty thread cannot already be showing the question, so the quote is
    // the only thing naming it.
    expect(shouldShowReplyQuote(replyingTo, null)).toBe(true);
  });
});

describe('lastRenderedMessageId', () => {
  it('is the last bubble, not the last item, so a trailing separator is skipped', () => {
    expect(lastRenderedMessageId([bubble(OAT_MILK), separator()])).toBe(OAT_MILK);
  });

  it('is the LAST bubble when several are rendered', () => {
    expect(lastRenderedMessageId([bubble(OAT_MILK), bubble(SUNDAY)])).toBe(SUNDAY);
  });

  it('is null for a thread with no bubbles', () => {
    expect(lastRenderedMessageId([])).toBeNull();
    expect(lastRenderedMessageId([separator()])).toBeNull();
  });
});

describe('ReplyQuote', () => {
  it('renders the label and the guest’s words', () => {
    render(
      <ReplyQuote replyingTo={replyingTo} lastRenderedMessageId={SUNDAY} surface="card" />,
    );

    expect(screen.getByTestId('reply-quote')).toBeTruthy();
    // TrackedCaps uppercases in JS, so the rendered string is the caps form.
    expect(screen.getByText(CARD_COPY.replyingTo.toUpperCase())).toBeTruthy();
    expect(screen.getByText(replyingTo.body)).toBeTruthy();
  });

  it('renders nothing when the quote is withheld', () => {
    render(
      <ReplyQuote replyingTo={replyingTo} lastRenderedMessageId={OAT_MILK} surface="card" />,
    );

    expect(screen.queryByTestId('reply-quote')).toBeNull();
  });

  it('renders nothing before the server sends the field', () => {
    // The client ships ahead of TAC-534, so `replyingTo` is null on every card
    // until that deploys. The card must look exactly like today's.
    render(<ReplyQuote replyingTo={null} lastRenderedMessageId={SUNDAY} surface="card" />);

    expect(screen.queryByTestId('reply-quote')).toBeNull();
  });

  it('pins the quote to one line, so the row can never steal thread height', () => {
    // The card is fixed-height with only the thread flexing. A wrapping quote
    // would silently eat conversation, which is the thing this ticket is
    // trying to give back.
    render(
      <ReplyQuote
        replyingTo={{ ...replyingTo, body: 'a '.repeat(400) }}
        lastRenderedMessageId={SUNDAY}
        surface="card"
      />,
    );

    const quote = screen.UNSAFE_getByProps({ numberOfLines: 1 });
    expect(quote.props.ellipsizeMode).toBe('tail');
  });

  it('announces the whole untruncated question to VoiceOver', () => {
    // The visual row is clipped to one line; what is read out must not be.
    render(
      <ReplyQuote replyingTo={replyingTo} lastRenderedMessageId={SUNDAY} surface="card" />,
    );

    expect(screen.getByLabelText(`Replying to: ${replyingTo.body}`)).toBeTruthy();
  });

  it('takes the left rule and no fill on the white card surface', () => {
    render(
      <ReplyQuote replyingTo={replyingTo} lastRenderedMessageId={SUNDAY} surface="card" />,
    );

    const style = StyleSheet.flatten(screen.getByTestId('reply-quote').props.style);
    expect(style.borderLeftWidth).toBe(1);
    expect(style.backgroundColor).toBeUndefined();
  });

  it('takes the divider scrim on the takeover, where it sits on a card ground', () => {
    // White 8.5px caps directly on a card ground misses 4.5:1 (Honey falls to
    // 2.45:1). Same colour and alpha as the date dividers beside it, so
    // ground-contrast.test.ts's divider case already gates this pairing.
    render(
      <ReplyQuote replyingTo={replyingTo} lastRenderedMessageId={SUNDAY} surface="takeover" />,
    );

    const style = StyleSheet.flatten(screen.getByTestId('reply-quote').props.style);
    expect(style.backgroundColor).toBe(dividerBacking.color);
    expect(style.borderLeftWidth).toBeUndefined();
  });
});
