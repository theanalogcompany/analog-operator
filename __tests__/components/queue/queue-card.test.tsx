import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { QueueCard } from '@/components/queue/queue-card';
import { __resetNowClockForTests } from '@/hooks/use-now';
import { type PendingDraft } from '@/lib/api/queue';
import { CARD_COPY } from '@/lib/card-copy';
import { card } from '@/lib/theme';

function makeDraft(overrides: Partial<PendingDraft> = {}): PendingDraft {
  return {
    messageId: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueSlug: 'mock-sextant',
    venueTimezone: null,
    guestId: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    guestDisplayName: 'Maya R.',
    guestPhoneFallback: '+15551110001',
    guestChannel: 'text',
    replyWindowExpiresAt: null,
    instagramUsername: null,
    replacedDraft: null,
    replyingTo: null,
    draftBody: "Yes — patio's open until 9.",
    category: 'reservation',
    voiceFidelity: 0.81,
    reviewReason: "This doesn't sound enough like you.",
    reviewReasonCode: 'fidelity_below_auto_send_floor',
    reviewTriggers: ['fidelity_below_auto_send_floor'],
    reviewTriggerLabels: ["This doesn't sound enough like you."],
    ungroundedClaims: [],
    recognitionState: 'returning',
    agentReasoning: null,
    pendingSinceMs: 240_000,
    recentContext: [],
    langfuseTraceId: null,
    ...overrides,
  };
}

const HEIGHT = card.heightPx;

type Node = { props: { style?: unknown }; parent: Node | null };

/** The nearest background colour at or above a rendered node. */
function backgroundOf(start: Node): string | undefined {
  for (let cursor: Node | null = start; cursor; cursor = cursor.parent) {
    const style = StyleSheet.flatten(cursor.props.style as never) as
      | { backgroundColor?: string }
      | undefined;
    if (style?.backgroundColor) return style.backgroundColor;
  }
  return undefined;
}

/** Every string the tree renders, in paint order. */
function renderedTextInOrder(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(renderedTextInOrder);
  if (node && typeof node === 'object' && 'children' in node) {
    return renderedTextInOrder((node as { children: unknown }).children);
  }
  return [];
}

describe('QueueCard — head', () => {
  it('renders the guest name and recognition badge', () => {
    render(
      <QueueCard
        draft={makeDraft({ recognitionState: 'raving_fan' })}
        height={HEIGHT}
      />,
    );
    expect(screen.getByText('MAYA R.')).toBeTruthy();
    expect(screen.getByLabelText('Recognition: Raving Fan')).toBeTruthy();
  });

  it('falls back to the phone number when there is no display name', () => {
    render(
      <QueueCard draft={makeDraft({ guestDisplayName: null })} height={HEIGHT} />,
    );
    expect(screen.getByText('+15551110001')).toBeTruthy();
  });

  it('renders agent reasoning when the agent left some', () => {
    render(
      <QueueCard
        draft={makeDraft({ agentReasoning: 'She is confirming, not asking.' })}
        height={HEIGHT}
      />,
    );
    expect(screen.getByLabelText('Agent reasoning')).toBeTruthy();
  });

  it('omits the reasoning block entirely when there is none', () => {
    render(<QueueCard draft={makeDraft({ agentReasoning: null })} height={HEIGHT} />);
    expect(screen.queryByLabelText('Agent reasoning')).toBeNull();
  });

  it('treats whitespace-only reasoning as none', () => {
    render(<QueueCard draft={makeDraft({ agentReasoning: '   ' })} height={HEIGHT} />);
    expect(screen.queryByLabelText('Agent reasoning')).toBeNull();
  });
});

describe('QueueCard — flag strip', () => {
  // The strip names the KIND of decision, keyed on the reason code. The
  // sentence saying why sits in the head, in sentence case. (TAC-364.)
  it('names the kind of decision in caps, keyed on the code', () => {
    render(
      <QueueCard
        draft={makeDraft({ reviewReasonCode: 'knowledge_gap_backstop' })}
        height={HEIGHT}
        position={1}
        total={4}
      />,
    );
    expect(screen.getByText('OUTSIDE THE DRAFT')).toBeTruthy();
  });

  it('paints the strip in its bucket colour', () => {
    render(<QueueCard draft={makeDraft()} height={HEIGHT} />);
    // Pewter's strip, from TAC-364's design spec.
    expect(backgroundOf(screen.getByText('DRAFT CAME OUT WRONG') as unknown as Node)).toBe(
      '#4F4B45',
    );
  });

  it('never says "Flagged" anywhere on the card', () => {
    const { toJSON } = render(<QueueCard draft={makeDraft()} height={HEIGHT} />);
    expect(renderedTextInOrder(toJSON()).join(' ')).not.toMatch(/flagged/i);
  });

  it('reads "Needs review", not a bucket name, for a code it does not know', () => {
    render(
      <QueueCard draft={makeDraft({ reviewReasonCode: 'something_new' })} height={HEIGHT} />,
    );
    expect(screen.getByText('NEEDS REVIEW')).toBeTruthy();
    expect(screen.queryByText('MID-THREAD')).toBeNull();
  });

  it('shows session progress, zero-padded', () => {
    render(
      <QueueCard draft={makeDraft()} height={HEIGHT} position={1} total={4} />,
    );
    expect(screen.getByText('01 / 04')).toBeTruthy();
    expect(screen.getByLabelText('Card 1 of 4')).toBeTruthy();
  });

  it('renders no counter when progress is not supplied', () => {
    render(<QueueCard draft={makeDraft()} height={HEIGHT} />);
    expect(screen.queryByText(/ \/ /)).toBeNull();
  });
});

describe('QueueCard — review detail', () => {
  it('states the reason in sentence case, not through caps', () => {
    render(<QueueCard draft={makeDraft()} height={HEIGHT} />);
    expect(screen.getByText("This doesn't sound enough like you.")).toBeTruthy();
    expect(screen.queryByText("THIS DOESN'T SOUND ENOUGH LIKE YOU.")).toBeNull();
  });

  it('lists the other triggers that fired, without repeating the primary', () => {
    render(
      <QueueCard
        draft={makeDraft({
          reviewTriggers: ['fidelity_below_auto_send_floor', 'model_flagged'],
          reviewTriggerLabels: [
            "This doesn't sound enough like you.",
            'Something felt off about this one.',
          ],
        })}
        height={HEIGHT}
      />,
    );
    expect(screen.getByLabelText('Also: Something felt off about this one.')).toBeTruthy();
  });

  it('shows no "Also" line when only the primary fired', () => {
    render(<QueueCard draft={makeDraft()} height={HEIGHT} />);
    expect(screen.queryByTestId('review-detail-also')).toBeNull();
  });

  // TAC-364 acceptance criterion: a grounding-backstop hold shows the flagged
  // claim verbatim.
  it('quotes a flagged claim verbatim', () => {
    const claim = 'we keep a gluten-free penne behind the bar';
    render(
      <QueueCard
        draft={makeDraft({
          reviewReason: "I wasn't sure this was true, so I didn't send it.",
          reviewReasonCode: 'knowledge_gap_backstop',
          reviewTriggers: ['knowledge_gap_backstop'],
          reviewTriggerLabels: ["I wasn't sure this was true, so I didn't send it."],
          ungroundedClaims: [claim],
        })}
        height={HEIGHT}
      />,
    );
    expect(screen.getByLabelText(`Couldn't verify: “${claim}”`)).toBeTruthy();
  });

  it('shows no claim line when the grounding check flagged nothing', () => {
    render(<QueueCard draft={makeDraft()} height={HEIGHT} />);
    expect(screen.queryByTestId('review-detail-claims')).toBeNull();
  });

  it('renders no reason for a row with none recorded', () => {
    render(
      <QueueCard
        draft={makeDraft({
          reviewReason: null,
          reviewReasonCode: '',
          reviewTriggers: [],
          reviewTriggerLabels: [],
        })}
        height={HEIGHT}
      />,
    );
    expect(screen.queryByTestId('review-detail-reason')).toBeNull();
    expect(screen.getByText('NEEDS REVIEW')).toBeTruthy();
  });
});

describe('QueueCard — conversation', () => {
  const thread = [
    {
      id: 'bb11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
      body: 'Is the patio open tonight?',
      direction: 'inbound' as const,
      createdAt: new Date('2026-09-13T19:14:00Z').toISOString(),
    },
    {
      id: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
      body: 'Two of us at 7:30 if you can swing it.',
      direction: 'inbound' as const,
      createdAt: new Date('2026-09-13T19:16:00Z').toISOString(),
    },
  ];

  it('renders the recent context oldest-first', () => {
    const { toJSON } = render(
      <QueueCard draft={makeDraft({ recentContext: thread })} height={HEIGHT} />,
    );
    const order = renderedTextInOrder(toJSON());
    const oldest = order.indexOf('Is the patio open tonight?');
    const newest = order.indexOf('Two of us at 7:30 if you can swing it.');
    expect(oldest).toBeGreaterThanOrEqual(0);
    expect(newest).toBeGreaterThan(oldest);
  });

  it('puts the newest message directly above the composer', () => {
    // Region c is bottom-anchored, so the last thing the guest said sits
    // against the composer and the slack collects as air under the head.
    const { toJSON } = render(
      <QueueCard draft={makeDraft({ recentContext: thread })} height={HEIGHT} />,
    );
    const order = renderedTextInOrder(toJSON());
    const newest = order.indexOf('Two of us at 7:30 if you can swing it.');
    const draftBody = order.indexOf("Yes — patio's open until 9.");
    expect(newest).toBeGreaterThan(-1);
    expect(draftBody).toBeGreaterThan(newest);
  });

  it('heads the excerpt with a relative day and an exact time', () => {
    // The operator is deciding whether a four-minute-old question is still
    // warm, so the divider is "Today · 7:14 PM", not a bare date.
    const justNow = [{ ...thread[0], createdAt: new Date().toISOString() }];
    render(
      <QueueCard draft={makeDraft({ recentContext: justNow })} height={HEIGHT} />,
    );
    expect(screen.getByText(/^TODAY · \d{1,2}:\d{2}\s?(AM|PM)$/)).toBeTruthy();
  });

  // The card's excerpt is the last few responses, so it can straddle midnight:
  // a guest asks something late and follows up the next morning. Without a
  // separator at the boundary the morning message sits under "Yesterday".
  // Built from local date parts, because the card reads the device's zone and
  // the runner's zone is not pinned. (TAC-408.)
  const DIVIDER = / · \d{1,2}:\d{2}\s?(AM|PM)$/;

  it('separates the days when the excerpt crosses midnight', () => {
    render(
      <QueueCard
        draft={makeDraft({
          recentContext: [
            { ...thread[0], createdAt: new Date(2026, 8, 10, 23, 50).toISOString() },
            { ...thread[1], createdAt: new Date(2026, 8, 11, 0, 10).toISOString() },
          ],
        })}
        height={HEIGHT}
      />,
    );
    expect(screen.getAllByText(DIVIDER)).toHaveLength(2);
  });

  it('shows one separator for messages hours apart on the same day', () => {
    render(
      <QueueCard
        draft={makeDraft({
          recentContext: [
            { ...thread[0], createdAt: new Date(2026, 8, 10, 8, 0).toISOString() },
            { ...thread[1], createdAt: new Date(2026, 8, 10, 20, 30).toISOString() },
          ],
        })}
        height={HEIGHT}
      />,
    );
    expect(screen.getAllByText(DIVIDER)).toHaveLength(1);
  });

  it('labels in the device zone, ignoring the venue zone', () => {
    // The card deliberately doesn't read `venueTimezone` yet, which is why the
    // claim that it matches the edit screen holds only within one zone. When
    // TAC-414 moves every surface to the venue's zone this goes red, which is
    // that ticket's starting point.
    render(
      <QueueCard
        draft={makeDraft({
          venueTimezone: 'Pacific/Kiritimati',
          recentContext: [
            { ...thread[0], createdAt: new Date(2026, 8, 10, 9, 39).toISOString() },
          ],
        })}
        height={HEIGHT}
      />,
    );
    expect(screen.getByText('THU SEP 10 · 9:39 AM')).toBeTruthy();
  });

  it('renders no divider when there is no context at all', () => {
    render(<QueueCard draft={makeDraft({ recentContext: [] })} height={HEIGHT} />);
    // The divider is "<day> · <time>". The composer caption has a middle dot
    // too, so match the time, not the dot.
    expect(screen.queryByText(/ · \d{1,2}:\d{2}/)).toBeNull();
  });
});

describe('QueueCard — composer', () => {
  it('shows the draft and the send-ready caption', () => {
    render(<QueueCard draft={makeDraft()} height={HEIGHT} />);
    expect(screen.getByText("Yes — patio's open until 9.")).toBeTruthy();
    expect(screen.getByText('DRAFT · SWIPE RIGHT TO SEND')).toBeTruthy();
  });

  // The blank-draft card is the important variant: the agent declined to draft,
  // so there is nothing to send and swipe-right is not available. The placeholder
  // wording is fixed by the TAC-309 Contract and deliberately says nothing about
  // drafts — from the operator's side a guest asked something and it is their
  // turn. Don't "improve" this into app-state language. (TAC-310.)
  describe('with a blank draft', () => {
    const blank = makeDraft({ draftBody: '', reviewReason: 'no draft generated' });

    it('shows the placeholder instead of an empty bubble', () => {
      render(<QueueCard draft={blank} height={HEIGHT} />);
      expect(
        screen.getByText('Type your answer to send to the guest'),
      ).toBeTruthy();
    });

    it('changes the caption to point left, not right', () => {
      render(<QueueCard draft={blank} height={HEIGHT} />);
      expect(screen.getByText('NOTHING DRAFTED · SWIPE LEFT TO WRITE')).toBeTruthy();
      expect(screen.queryByText('DRAFT · SWIPE RIGHT TO SEND')).toBeNull();
    });

    it('treats a whitespace-only body as blank', () => {
      render(
        <QueueCard draft={makeDraft({ draftBody: '   \n ' })} height={HEIGHT} />,
      );
      expect(
        screen.getByText('Type your answer to send to the guest'),
      ).toBeTruthy();
    });
  });

  it('reports the composer frame so the stack can hit-test taps', () => {
    // The composer cannot be a Pressable — one inside a GestureDetector wins
    // the responder race and kills the pan (TAC-37) — so the tap is hoisted
    // into the gesture and needs this measurement to know where it landed.
    // If this callback stops firing, composer taps silently stop opening the
    // takeover while everything still renders.
    const onComposerLayout = jest.fn();
    render(
      <QueueCard
        draft={makeDraft()}
        height={HEIGHT}
        onComposerLayout={onComposerLayout}
      />,
    );
    fireEvent(screen.getByTestId('queue-card-composer'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 431, width: 350, height: 129 } },
    });
    expect(onComposerLayout).toHaveBeenCalledTimes(1);
    expect(onComposerLayout.mock.calls[0][0].nativeEvent.layout.y).toBe(431);
  });
});

describe('QueueCard — geometry', () => {
  it('takes the height it is given, so every card in the deck matches', () => {
    const { toJSON } = render(<QueueCard draft={makeDraft()} height={480} />);
    const root = toJSON();
    const style = Array.isArray(root?.props?.style)
      ? Object.assign({}, ...root.props.style)
      : root?.props?.style;
    expect(style.height).toBe(480);
  });

  it('does not grow with the number of messages', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c${String(i).padStart(2, '0')}`,
      body: `message ${i}`,
      direction: 'inbound' as const,
      createdAt: new Date().toISOString(),
    }));
    const { toJSON } = render(
      <QueueCard draft={makeDraft({ recentContext: many })} height={HEIGHT} />,
    );
    const root = toJSON();
    const style = Array.isArray(root?.props?.style)
      ? Object.assign({}, ...root.props.style)
      : root?.props?.style;
    expect(style.height).toBe(HEIGHT);
  });
});

/**
 * The reply window on the card itself (TAC-486, A).
 *
 * The component tests for the bar and the pill live in
 * `reply-window.test.tsx`; these are about the CARD's wiring — that an
 * Instagram card swaps the elapsed pill for the timer and draws the bar, and
 * that a text card is left exactly as it ships.
 */
describe('QueueCard and the Instagram reply window', () => {
  const HIDDEN = { includeHiddenElements: true } as const;

  /**
   * Time is frozen so each threshold lands exactly where it is aimed.
   *
   * Without this the deadline is built a few milliseconds before `useNow()`
   * reads the clock, so a window aimed at exactly 18h renders as "17h left" —
   * correct behaviour (the label rounds DOWN so a card never overstates what is
   * left), but it makes a boundary test race the clock.
   */
  const NOW = Date.parse('2026-09-23T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    __resetNowClockForTests();
  });

  afterEach(() => {
    __resetNowClockForTests();
    jest.useRealTimers();
  });

  /** A deadline leaving `minutes` of window AFTER the 5 minute display margin. */
  const leaving = (minutes: number): string =>
    new Date(NOW + (minutes + 5) * 60_000).toISOString();

  const instagramDraft = (overrides: Partial<PendingDraft> = {}): PendingDraft =>
    makeDraft({
      guestChannel: 'instagram',
      instagramUsername: 'mia.brews',
      guestPhoneFallback: '',
      replyWindowExpiresAt: leaving(18 * 60),
      ...overrides,
    });

  it('shows the timer in place of the elapsed pill', () => {
    render(<QueueCard draft={instagramDraft()} height={HEIGHT} />);
    expect(screen.getByTestId('reply-window-pill')).toBeTruthy();
    expect(screen.getByLabelText('18h left')).toBeTruthy();
    // The elapsed reading is gone: two clocks in one slot would be two answers
    // to the same question.
    expect(screen.queryByLabelText('4 min')).toBeNull();
  });

  it('draws the drain bar under the flag strip', () => {
    render(<QueueCard draft={instagramDraft()} height={HEIGHT} />);
    expect(screen.getByTestId('reply-window-bar', HIDDEN)).toBeTruthy();
  });

  it('escalates the label as the window runs down', () => {
    for (const [minutes, label] of [
      [18 * 60, '18h left'],
      [4 * 60 + 20, '4h 20m left'],
      [42, 'Urgent · 42m left'],
    ] as const) {
      const view = render(
        <QueueCard
          draft={instagramDraft({ replyWindowExpiresAt: leaving(minutes) })}
          height={HEIGHT}
        />,
      );
      expect(screen.getByLabelText(label)).toBeTruthy();
      view.unmount();
    }
  });

  it('reads Closed once the window has shut', () => {
    render(
      <QueueCard
        draft={instagramDraft({ replyWindowExpiresAt: leaving(-3 * 60) })}
        height={HEIGHT}
      />,
    );
    expect(screen.getByLabelText('Closed 3h ago')).toBeTruthy();
  });

  // The hand-off's binding constraint: text cards don't change.
  it('leaves a text card with its elapsed pill and no bar', () => {
    render(<QueueCard draft={makeDraft()} height={HEIGHT} />);
    expect(screen.queryByTestId('reply-window-pill')).toBeNull();
    expect(screen.queryByTestId('reply-window-bar', HIDDEN)).toBeNull();
    expect(screen.getByLabelText('4 min')).toBeTruthy();
  });

  /**
   * TAC-473's Contract: a null deadline on an INSTAGRAM guest means the window
   * was never measured, not that it shut. The card says the only true thing it
   * can — how long the draft has been waiting — rather than claiming "Closed"
   * about a guest who is still reachable.
   */
  it('keeps the elapsed pill when the window was never measured', () => {
    render(
      <QueueCard
        draft={instagramDraft({ replyWindowExpiresAt: null })}
        height={HEIGHT}
      />,
    );
    expect(screen.queryByTestId('reply-window-pill')).toBeNull();
    expect(screen.queryByTestId('reply-window-bar', HIDDEN)).toBeNull();
    expect(screen.getByLabelText('4 min')).toBeTruthy();
  });
});

describe('QueueCard and a guest with no name', () => {
  /**
   * The live defect. `guestPhoneFallback` is `''` for a phoneless Instagram
   * guest (ruled non-nullable in TAC-473 so one such guest cannot empty the
   * queue), and the old chain was `guestDisplayName || guestPhoneFallback`,
   * which rendered BLANK.
   */
  it('names an unnamed Instagram guest by their handle, never blank', () => {
    render(
      <QueueCard
        draft={makeDraft({
          guestChannel: 'instagram',
          guestDisplayName: null,
          instagramUsername: 'lena.eats',
          guestPhoneFallback: '',
        })}
        height={HEIGHT}
      />,
    );
    expect(screen.getByLabelText('Pending draft for @lena.eats.')).toBeTruthy();
  });

  it('falls back to a plain label when there is no name and no handle', () => {
    render(
      <QueueCard
        draft={makeDraft({
          guestChannel: 'instagram',
          guestDisplayName: null,
          instagramUsername: null,
          guestPhoneFallback: '',
        })}
        height={HEIGHT}
      />,
    );
    expect(
      screen.getByLabelText('Pending draft for Instagram guest.'),
    ).toBeTruthy();
  });

  it('still names a text guest by their phone, as it ships today', () => {
    render(
      <QueueCard
        draft={makeDraft({ guestDisplayName: null })}
        height={HEIGHT}
      />,
    );
    expect(
      screen.getByLabelText('Pending draft for +15551110001.'),
    ).toBeTruthy();
  });
});

/**
 * The draft a regen replaced (TAC-397's `replacedDraft`, via TAC-402).
 *
 * Not the same thing as the hand-off's "corrected message" caption, which
 * quotes the GUEST's own edit of their DM. No contract carries that field, so
 * it is filed separately; this one is the agent's previous draft text.
 */
describe('QueueCard and a replaced draft', () => {
  it('shows what the draft replaced, labelled', () => {
    render(
      <QueueCard
        draft={makeDraft({
          replacedDraft: {
            body: 'we have oat and whole milk',
            replacedAt: '2026-09-21T16:10:29.000Z',
          },
        })}
        height={HEIGHT}
      />,
    );
    expect(screen.getByTestId('replaced-draft')).toBeTruthy();
    expect(screen.getByText('we have oat and whole milk')).toBeTruthy();
    expect(screen.getByLabelText(CARD_COPY.replacedDraft)).toBeTruthy();
  });

  it('shows nothing extra when there is nothing to compare against', () => {
    render(<QueueCard draft={makeDraft({ replacedDraft: null })} height={HEIGHT} />);
    expect(screen.queryByTestId('replaced-draft')).toBeNull();
  });

  it('keeps the new draft on screen beside it, which is the whole point', () => {
    render(
      <QueueCard
        draft={makeDraft({
          draftBody: 'we have oat, whole and soy',
          replacedDraft: {
            body: 'we have oat and whole milk',
            replacedAt: '2026-09-21T16:10:29.000Z',
          },
        })}
        height={HEIGHT}
      />,
    );
    expect(screen.getByText('we have oat and whole milk')).toBeTruthy();
    expect(screen.getByText('we have oat, whole and soy')).toBeTruthy();
  });
});

describe('QueueCard — what the draft is answering (TAC-533)', () => {
  const OAT = 'a1b2c3d4-4444-4a5b-8c6d-7e8f9a0b1c2d';
  const SUNDAY = 'a1b2c3d4-4446-4a5b-8c6d-7e8f9a0b1c2d';

  /** The ticket's own shape: the question, then two newer unrelated ones. */
  const threeQuestions = [
    {
      id: OAT,
      direction: 'inbound' as const,
      body: 'do you have oat milk for any drink?',
      createdAt: '2026-09-23T18:00:00.000Z',
    },
    {
      id: 'a1b2c3d4-4445-4a5b-8c6d-7e8f9a0b1c2d',
      direction: 'inbound' as const,
      body: 'do you have any events coming up in november?',
      createdAt: '2026-09-23T18:04:00.000Z',
    },
    {
      id: SUNDAY,
      direction: 'inbound' as const,
      body: 'and are you open on sunday mornings?',
      createdAt: '2026-09-23T18:06:00.000Z',
    },
  ];

  const answeringOat = {
    messageId: OAT,
    body: 'do you have oat milk for any drink?',
    createdAt: '2026-09-23T18:00:00.000Z',
  };

  it('names the question when it is buried under newer, unrelated ones', () => {
    // The defect: the draft sat directly under "are you open on sunday
    // mornings?" and read as a non-sequitur.
    render(
      <QueueCard
        draft={makeDraft({
          draftBody: 'yeah, any drink',
          recentContext: threeQuestions,
          replyingTo: answeringOat,
        })}
        height={HEIGHT}
      />,
    );

    expect(screen.getByTestId('reply-quote')).toBeTruthy();
    expect(
      screen.getByLabelText(`${CARD_COPY.replyingTo}: ${answeringOat.body}`),
    ).toBeTruthy();
    // The later messages are still there, in order: the quote says which one is
    // being answered, it does not hide the rest.
    expect(screen.getByText('and are you open on sunday mornings?')).toBeTruthy();
  });

  it('adds nothing when the draft already answers the last message shown', () => {
    render(
      <QueueCard
        draft={makeDraft({
          recentContext: [threeQuestions[0]],
          replyingTo: answeringOat,
        })}
        height={HEIGHT}
      />,
    );

    expect(screen.queryByTestId('reply-quote')).toBeNull();
  });

  it('shows both quotes on a correction the guest then wrote under, head first', () => {
    const { toJSON } = render(
      <QueueCard
        draft={makeDraft({
          recentContext: threeQuestions,
          replyingTo: answeringOat,
          replacedDraft: {
            body: 'we have oat and whole milk',
            replacedAt: '2026-09-21T16:10:29.000Z',
          },
        })}
        height={HEIGHT}
      />,
    );

    expect(screen.getByTestId('replaced-draft')).toBeTruthy();
    expect(screen.getByTestId('reply-quote')).toBeTruthy();

    // They sit in different regions with the thread between them, so they can
    // never stack: the replaced draft is in the head, the reply quote is
    // against the composer.
    const order = renderedTextInOrder(toJSON());
    expect(order.indexOf(CARD_COPY.replacedDraft.toUpperCase())).toBeLessThan(
      order.indexOf(CARD_COPY.replyingTo.toUpperCase()),
    );
  });

  it('does not change the card’s height', () => {
    // The card is fixed-height with only the thread flexing. If the row could
    // grow, it would silently eat the conversation it exists to make readable.
    const withQuote = render(
      <QueueCard
        draft={makeDraft({ recentContext: threeQuestions, replyingTo: answeringOat })}
        height={HEIGHT}
      />,
    );
    const outer = StyleSheet.flatten(withQuote.toJSON()!.props.style) as { height?: number };
    expect(outer.height).toBe(HEIGHT);
  });
});
