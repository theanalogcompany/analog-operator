import { fireEvent, render, screen } from '@testing-library/react-native';

import { CardHead } from '@/components/queue/card-head';
import { isHandleTap } from '@/components/queue/queue-card-stack';
import { SubQueueRow } from '@/components/queue/sub-queue-row';
import { HandleLink } from '@/components/ui/handle-link';
import { InstagramGlyph } from '@/components/ui/instagram-glyph';
import { CARD_COPY } from '@/lib/card-copy';
import { guestIdentity } from '@/lib/guest-identity';
import { windowState } from '@/lib/reply-window';
import { instagramIdentity, subQueue } from '@/lib/theme';

const NOW = Date.parse('2026-09-23T12:00:00.000Z');

const igIdentity = (over = {}) =>
  guestIdentity({
    displayName: 'Mia B.',
    instagramUsername: 'mia.brews',
    phoneFallback: '',
    channel: 'instagram',
    ...over,
  });

const textIdentity = () =>
  guestIdentity({
    displayName: 'Nadia S.',
    instagramUsername: null,
    phoneFallback: '+15551110004',
    channel: 'text',
  });

const liveWindow = windowState({
  expiresAt: new Date(NOW + (4 * 60 + 5) * 60_000).toISOString(),
  channel: 'instagram',
  nowMs: NOW,
});
const noWindow = windowState({ expiresAt: null, channel: 'text', nowMs: NOW });

function renderHead(over: Record<string, unknown> = {}) {
  return render(
    <CardHead
      identity={igIdentity()}
      recognitionState="regular"
      window={liveWindow}
      expired={false}
      elapsedLabel="4 min"
      {...over}
    />,
  );
}

describe('the Instagram glyph', () => {
  it('announces itself as Instagram', () => {
    render(<InstagramGlyph size={12} color="#6F6658" />);
    expect(screen.getByLabelText(CARD_COPY.replyWindow.instagram)).toBeTruthy();
  });

  it('stays silent where the row around it already has a label', () => {
    render(<InstagramGlyph size={11} color="#4A4339" decorative />);
    expect(
      screen.queryByLabelText(CARD_COPY.replyWindow.instagram),
    ).toBeNull();
  });
});

describe('the handle link', () => {
  it('reads as a link out of the app', () => {
    render(
      <HandleLink
        handle="@mia.brews"
        ink="#6F6658"
        underlineColor="rgba(28,24,20,0.3)"
        mode="button"
        onPress={() => {}}
      />,
    );
    expect(screen.getByLabelText('Open @mia.brews in Instagram')).toBeTruthy();
  });

  it('opens on press in button mode', () => {
    const onPress = jest.fn();
    render(
      <HandleLink
        handle="@mia.brews"
        ink="#6F6658"
        underlineColor="rgba(28,24,20,0.3)"
        mode="button"
        onPress={onPress}
      />,
    );
    fireEvent.press(screen.getByLabelText('Open @mia.brews in Instagram'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  /**
   * On a live card the link is inert and the tap is hoisted into the stack's
   * gesture, because a `Pressable` inside a `GestureDetector` wins RN's
   * responder race and kills both the pan and the tap (CLAUDE.md, TAC-37).
   * It still has to be readable, so the label is asserted in both modes.
   */
  it('is inert and measurable in hoisted mode, rather than pressable', () => {
    render(
      <HandleLink
        handle="@mia.brews"
        ink="#6F6658"
        underlineColor="rgba(28,24,20,0.3)"
        mode="hoisted"
      />,
    );
    const node = screen.getByLabelText('Open @mia.brews in Instagram');
    expect(node).toBeTruthy();
    // No press handler: the tap belongs to the stack's gesture.
    expect(node.props.onPress).toBeUndefined();
    // RN flattens a view with no native interactable descendant, and a
    // flattened view cannot be measured at all.
    expect(node.props.collapsable).toBe(false);
  });
});

/**
 * The hoisted hit-test. Unlike the composer's, this needs a full rectangle:
 * the composer runs to the card's bottom edge so one boundary is enough, while
 * the handle is a short run of text in the middle of the head with the timer
 * pill beside it. Testing it by its top edge alone would swallow every tap on
 * the lower two thirds of the card, including every tap on the composer.
 */
describe('isHandleTap', () => {
  const SLOP = instagramIdentity.handle.hitSlopPx;
  // Page coordinates, which is what `measure()` returns and what the gesture's
  // absoluteX/absoluteY are in. The handle sits partway down a card that is
  // itself partway down the screen, so these are nothing like card-local.
  const rect = { x: 104, y: 383, width: 90, height: 16 };

  it('matches a tap inside the handle', () => {
    expect(isHandleTap(140, 390, rect, SLOP)).toBe(true);
  });

  it('matches the exact edges', () => {
    expect(isHandleTap(104, 383, rect, SLOP)).toBe(true);
    expect(isHandleTap(194, 399, rect, SLOP)).toBe(true);
  });

  /**
   * The handle is ~16pt tall, well under the 44pt Apple asks for, and the real
   * Pressable on the other two surfaces gets the same slop from RN.
   */
  it('accepts a near miss within the hit slop', () => {
    expect(isHandleTap(104 - SLOP, 383 - SLOP, rect, SLOP)).toBe(true);
    expect(isHandleTap(194 + SLOP, 399 + SLOP, rect, SLOP)).toBe(true);
  });

  it('misses past the slop, on every side', () => {
    expect(isHandleTap(104 - SLOP - 1, 390, rect, SLOP)).toBe(false);
    expect(isHandleTap(194 + SLOP + 1, 390, rect, SLOP)).toBe(false);
    expect(isHandleTap(140, 383 - SLOP - 1, rect, SLOP)).toBe(false);
    expect(isHandleTap(140, 399 + SLOP + 1, rect, SLOP)).toBe(false);
  });

  /**
   * The defect this signature exists to prevent, pinned as a coordinate-space
   * check rather than as prose.
   *
   * The first version compared an `onLayout` rect against the gesture's
   * card-local `event.x/y`. `onLayout` reports coordinates relative to the
   * IMMEDIATE PARENT, and the handle sits three levels inside the card's head,
   * so the rect came back at about (0, 0, 90, 16). Against that rect a tap in
   * the card's top-left corner — on the flag strip — matches, and the real
   * handle never does. Both halves are asserted, so a return to parent-relative
   * measurement fails here rather than on a device.
   */
  it('does not treat a parent-relative rect as if it were the real one', () => {
    const parentRelative = { x: 0, y: 0, width: 90, height: 16 };
    // A tap on the flag strip, near the card's top-left corner.
    expect(isHandleTap(30, 8, parentRelative, SLOP)).toBe(true);
    // ...and the handle's real page position misses it entirely.
    expect(isHandleTap(140, 390, parentRelative, SLOP)).toBe(false);
    // Against a properly measured rect, both answers invert.
    expect(isHandleTap(30, 8, rect, SLOP)).toBe(false);
    expect(isHandleTap(140, 390, rect, SLOP)).toBe(true);
  });

  it('never matches a rect with no area, however the tap lands', () => {
    // `measure()` returns null before layout, but a zero-sized rect must not
    // swallow a tap either.
    for (const empty of [
      { x: 0, y: 0, width: 0, height: 0 },
      { x: 104, y: 383, width: 0, height: 16 },
      { x: 104, y: 383, width: 90, height: 0 },
    ]) {
      expect(isHandleTap(0, 0, empty, SLOP)).toBe(false);
      expect(isHandleTap(104, 383, empty, SLOP)).toBe(false);
    }
  });
});

describe('the card head', () => {
  // The avatar is deliberately hidden from accessibility: the name sits right
  // beside it, and an avatar announcing "M" adds nothing an operator can use.
  const HIDDEN = { includeHiddenElements: true } as const;

  it('carries the avatar, the handle and the glyph on an Instagram card', () => {
    renderHead();
    expect(screen.getByTestId('guest-avatar', HIDDEN)).toBeTruthy();
    expect(screen.getByLabelText('Open @mia.brews in Instagram')).toBeTruthy();
    expect(screen.getByLabelText(CARD_COPY.replyWindow.instagram)).toBeTruthy();
  });

  it('takes the avatar initial from the name', () => {
    renderHead();
    expect(screen.getByText('M', HIDDEN)).toBeTruthy();
  });

  it('shows the handle as the name when there is none, and not twice', () => {
    renderHead({ identity: igIdentity({ displayName: null }) });
    // The name line already IS the handle, so a second handle row underneath
    // would print it twice.
    expect(screen.getByText('@mia.brews')).toBeTruthy();
    expect(screen.queryByLabelText('Open @mia.brews in Instagram')).toBeNull();
  });

  /**
   * The hand-off's binding constraint: text cards do not change. No avatar, no
   * handle, no glyph, and the elapsed reading rather than a timer.
   */
  it('leaves a text card exactly as it ships', () => {
    renderHead({ identity: textIdentity(), window: noWindow });
    expect(screen.queryByTestId('guest-avatar', HIDDEN)).toBeNull();
    expect(screen.queryByTestId('handle-link')).toBeNull();
    expect(
      screen.queryByLabelText(CARD_COPY.replyWindow.instagram),
    ).toBeNull();
    expect(screen.getByLabelText('4 min')).toBeTruthy();
    expect(screen.getByLabelText('Nadia S.')).toBeTruthy();
  });

  it('keeps the recognition chip on both channels, unchanged', () => {
    // Ruled 2026-09-23: recognitionState already ships on every card, so this
    // build invents no source and removes nothing.
    renderHead();
    expect(screen.getByLabelText('Recognition: Regular')).toBeTruthy();
    screen.unmount();
    renderHead({ identity: textIdentity(), window: noWindow });
    expect(screen.getByLabelText('Recognition: Regular')).toBeTruthy();
  });
});

/**
 * The sub-queue row (TAC-486, C1). Which card is which is covered by
 * `subQueuePositionFor`'s own tests; this is what the operator sees.
 */
describe('the sub-queue row', () => {
  const HIDDEN = { includeHiddenElements: true } as const;

  it('reads the way the hand-off writes it', () => {
    render(<SubQueueRow spot={{ position: 1, total: 3 }} guestName="Mia" />);
    expect(screen.getByLabelText('1 / 3 cards for Mia')).toBeTruthy();
  });

  it('draws one segment per card, with the current one filled', () => {
    render(<SubQueueRow spot={{ position: 2, total: 3 }} guestName="Mia" />);
    const row = screen.getByTestId('sub-queue-row', HIDDEN);
    type StyledNode = { type: unknown; props: { style?: Record<string, unknown> } };
    const segments = row.findAll(
      (node: StyledNode) =>
        typeof node.type === 'string' &&
        typeof node.props.style === 'object' &&
        node.props.style !== null &&
        node.props.style.width === subQueue.segment.widthPx,
    );
    expect(segments).toHaveLength(3);
    const fills = segments.map(
      (segment: StyledNode) => segment.props.style?.backgroundColor,
    );
    expect(fills).toEqual([
      subQueue.segment.offColor,
      subQueue.segment.onColor,
      subQueue.segment.offColor,
    ]);
  });

  it('names a guest with no name by their handle', () => {
    render(
      <SubQueueRow spot={{ position: 1, total: 2 }} guestName="@lena.eats" />,
    );
    expect(screen.getByLabelText('1 / 2 cards for @lena.eats')).toBeTruthy();
  });
});
