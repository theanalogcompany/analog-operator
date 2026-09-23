import { fireEvent, render, screen } from '@testing-library/react-native';

import { ReviewDetail } from '@/components/queue/review-detail';
import { type PendingDraft } from '@/lib/api/queue';

/**
 * The "Also" block: one reason per line, and a reason that does not fit is
 * withheld and counted, never cut off mid-sentence. (TAC-388.)
 *
 * Labels are transcribed from analog-guest's `REVIEW_REASON_LABELS`
 * (lib/operator/queue.ts), so the co-firing cases below read the way a live card
 * does. How many lines a label needs is measured on device through
 * `onTextLayout`; these tests fire that event on the hidden measuring copies,
 * which is the seam where a real layout reaches the component.
 */

const LABELS: Record<string, string> = {
  commitment_type_gated: 'This offers something free. Your call.',
  comp_regex_backstop: "This sounds like it's offering something on the house.",
  category_requires_approval: 'You chose to review these yourself.',
  hold_all_outbound: "You're holding everything here right now.",
  complaint_commitment_floor: 'Someone complained and this promises to make it right.',
};

function draftFiring(codes: string[]): PendingDraft {
  return {
    messageId: '11a4d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueId: 'cc11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    venueSlug: 'le-mils-coffee',
    venueTimezone: null,
    guestId: 'aa11d9c1-2f3e-4a5b-8c6d-7e8f9a0b1c2d',
    guestDisplayName: 'Maya R.',
    guestPhoneFallback: '+15551110001',
    guestChannel: 'text',
    replyWindowExpiresAt: null,
    instagramUsername: null,
    replacedDraft: null,
    draftBody: 'On the house next time.',
    category: null,
    voiceFidelity: 0.81,
    reviewReason: LABELS[codes[0]],
    recognitionState: 'returning',
    agentReasoning: null,
    pendingSinceMs: 240_000,
    recentContext: [],
    langfuseTraceId: null,
    reviewReasonCode: codes[0],
    // The server sends the primary inside the set, in server order.
    reviewTriggers: codes,
    reviewTriggerLabels: codes.map((code) => LABELS[code]),
    ungroundedClaims: [],
  };
}

/** Reports a layout for every measuring copy: `lines[label]` lines, else one. */
function layOut(lines: Record<string, number> = {}): void {
  for (const copy of screen.getAllByTestId('review-detail-also-measure', {
    includeHiddenElements: true,
  })) {
    const label = String(copy.props.children);
    const count = lines[label] ?? 1;
    fireEvent(copy, 'textLayout', {
      nativeEvent: { lines: Array.from({ length: count }, () => ({ text: label })) },
    });
  }
}

const shownReasons = (): string[] =>
  screen.queryAllByTestId('review-detail-also-item').map((node) => String(node.props.children));

const moreLine = (): string | null => {
  const node = screen.queryByTestId('review-detail-also-more');
  return node ? String(node.props.children) : null;
};

describe('ReviewDetail: the Also block', () => {
  it('shows nothing until the reasons have been measured', () => {
    render(
      <ReviewDetail
        draft={draftFiring(['commitment_type_gated', 'comp_regex_backstop'])}
        surface="card"
      />,
    );
    expect(shownReasons()).toEqual([]);
    expect(moreLine()).toBeNull();
  });

  describe('on the card', () => {
    it('two co-firing triggers: the one secondary reason, on its own', () => {
      render(
        <ReviewDetail
          draft={draftFiring(['commitment_type_gated', 'comp_regex_backstop'])}
          surface="card"
        />,
      );
      layOut({ [LABELS.comp_regex_backstop]: 2 });
      expect(shownReasons()).toEqual([LABELS.comp_regex_backstop]);
      expect(moreLine()).toBeNull();
    });

    // The Le Mil's card from build 46: these two ran together as one paragraph.
    it('three co-firing triggers: each reason on its own line, never joined', () => {
      render(
        <ReviewDetail
          draft={draftFiring([
            'commitment_type_gated',
            'comp_regex_backstop',
            'category_requires_approval',
          ])}
          surface="card"
        />,
      );
      layOut({ [LABELS.comp_regex_backstop]: 2 });
      expect(shownReasons()).toEqual([
        LABELS.comp_regex_backstop,
        LABELS.category_requires_approval,
      ]);
      expect(screen.getAllByText('ALSO')).toHaveLength(1);
      expect(moreLine()).toBeNull();
    });

    it('four co-firing triggers: all three reasons, nothing held back', () => {
      render(
        <ReviewDetail
          draft={draftFiring([
            'commitment_type_gated',
            'comp_regex_backstop',
            'category_requires_approval',
            'hold_all_outbound',
          ])}
          surface="card"
        />,
      );
      layOut({ [LABELS.comp_regex_backstop]: 2 });
      expect(shownReasons()).toEqual([
        LABELS.comp_regex_backstop,
        LABELS.category_requires_approval,
        LABELS.hold_all_outbound,
      ]);
      expect(moreLine()).toBeNull();
    });
  });

  describe('on the edit screen', () => {
    it('three co-firing triggers: both reasons, one line each', () => {
      render(
        <ReviewDetail
          draft={draftFiring([
            'commitment_type_gated',
            'comp_regex_backstop',
            'category_requires_approval',
          ])}
          surface="takeover"
        />,
      );
      layOut();
      expect(shownReasons()).toEqual([
        LABELS.comp_regex_backstop,
        LABELS.category_requires_approval,
      ]);
      expect(moreLine()).toBeNull();
    });

    it('four co-firing triggers: one reason and a count of the rest', () => {
      render(
        <ReviewDetail
          draft={draftFiring([
            'commitment_type_gated',
            'comp_regex_backstop',
            'category_requires_approval',
            'hold_all_outbound',
          ])}
          surface="takeover"
        />,
      );
      layOut();
      expect(shownReasons()).toEqual([LABELS.comp_regex_backstop]);
      expect(moreLine()).toBe('+2 more');
    });

    // At 375pt this label needs two lines on the edit screen. Cutting it to one
    // would end mid-sentence, so it is withheld and counted instead.
    it('withholds a reason that needs more lines than it has, and counts it', () => {
      render(
        <ReviewDetail
          draft={draftFiring([
            'commitment_type_gated',
            'complaint_commitment_floor',
            'category_requires_approval',
          ])}
          surface="takeover"
        />,
      );
      layOut({ [LABELS.complaint_commitment_floor]: 2 });
      expect(shownReasons()).toEqual([LABELS.category_requires_approval]);
      expect(moreLine()).toBe('+1 more');
    });
  });

  it('gives VoiceOver every reason in full, including the ones held back', () => {
    render(
      <ReviewDetail
        draft={draftFiring([
          'commitment_type_gated',
          'comp_regex_backstop',
          'category_requires_approval',
          'hold_all_outbound',
        ])}
        surface="takeover"
      />,
    );
    layOut();
    expect(
      screen.getByLabelText(
        `Also: ${LABELS.comp_regex_backstop} ${LABELS.category_requires_approval} ${LABELS.hold_all_outbound}`,
      ),
    ).toBeTruthy();
  });

  it('renders no Also block when only the primary fired', () => {
    render(<ReviewDetail draft={draftFiring(['commitment_type_gated'])} surface="card" />);
    expect(screen.queryByTestId('review-detail-also')).toBeNull();
  });
});
