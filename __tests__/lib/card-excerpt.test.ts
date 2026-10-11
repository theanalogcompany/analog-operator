import { type ThreadMessage } from '@/lib/api/queue';
import {
  CARD_EXCERPT_SIZE,
  cardExcerpt,
  needsThreadExcerpt,
} from '@/lib/card-excerpt';

const REPLYING_TO_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

function draft(overrides: {
  reviewReasonCode?: string;
  reviewTriggers?: string[];
  replyingTo?: { messageId: string; body: string } | null;
}) {
  return {
    reviewReasonCode: '',
    reviewTriggers: [],
    replyingTo: null,
    ...overrides,
  };
}

function msg(id: string, minute: number): ThreadMessage {
  return {
    id,
    direction: 'inbound',
    body: id,
    createdAt: new Date(Date.parse('2026-10-11T17:00:00.000Z') + minute * 60_000).toISOString(),
  };
}

describe('needsThreadExcerpt', () => {
  // The production shape (2026-10-11): `review_reason = 'media_only_inbound'`,
  // an empty draft, and a `reply_to_message_id`.
  it('is true for a card whose reason is media_only_inbound', () => {
    expect(needsThreadExcerpt(draft({ reviewReasonCode: 'media_only_inbound' }))).toBe(true);
  });

  it('is true for an unsupported_inbound card (TAC-582 rulings)', () => {
    expect(needsThreadExcerpt(draft({ reviewReasonCode: 'unsupported_inbound' }))).toBe(true);
  });

  it('is true for a media_context card: the text is in recentContext, the attachment is not', () => {
    expect(needsThreadExcerpt(draft({ reviewReasonCode: 'media_context' }))).toBe(true);
  });

  it('is true when the media code is a secondary trigger', () => {
    expect(
      needsThreadExcerpt(
        draft({
          reviewReasonCode: 'previous_pending_held',
          reviewTriggers: ['previous_pending_held', 'media_only_inbound'],
        }),
      ),
    ).toBe(true);
  });

  it('is true for any card answering a message with no text, whatever it is called', () => {
    expect(
      needsThreadExcerpt(
        draft({
          reviewReasonCode: 'some_future_code',
          replyingTo: { messageId: REPLYING_TO_ID, body: '' },
        }),
      ),
    ).toBe(true);
  });

  it('is false for an ordinary text card, so the deck does not fetch a thread per card', () => {
    expect(
      needsThreadExcerpt(
        draft({
          reviewReasonCode: 'knowledge_gap',
          reviewTriggers: ['knowledge_gap'],
          replyingTo: { messageId: REPLYING_TO_ID, body: 'are you open sunday?' },
        }),
      ),
    ).toBe(false);
    expect(needsThreadExcerpt(draft({}))).toBe(false);
  });
});

describe('cardExcerpt', () => {
  const recent = [msg('r1', 0), msg('r2', 1)];

  it('is recentContext until a thread arrives, and whenever the fetch fails or is empty', () => {
    expect(cardExcerpt(recent, [])).toEqual(recent);
  });

  it('is the tail of the thread once there is one', () => {
    const thread = [msg('t1', 0), msg('t2', 1), msg('t3', 2), msg('t4', 3), msg('t5', 4)];
    const excerpt = cardExcerpt(recent, thread);
    expect(excerpt.map((m) => m.id)).toEqual(['t3', 't4', 't5']);
    expect(excerpt).toHaveLength(CARD_EXCERPT_SIZE);
  });

  it('takes a short thread whole', () => {
    expect(cardExcerpt(recent, [msg('t1', 0)]).map((m) => m.id)).toEqual(['t1']);
  });
});
