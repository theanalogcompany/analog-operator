import { fireEvent, render, screen } from '@testing-library/react-native';

import { CardHead } from '@/components/queue/card-head';
import {
  UNMEASURED_RECT,
  isHandleTap,
} from '@/components/queue/queue-card-stack';
import { SubQueueRow } from '@/components/queue/sub-queue-row';
import { HandleLink } from '@/components/ui/handle-link';
import { InstagramGlyph } from '@/components/ui/instagram-glyph';
import { CARD_COPY } from '@/lib/card-copy';
import { guestIdentity } from '@/lib/guest-identity';
import { windowState } from '@/lib/reply-window';
import { subQueue } from '@/lib/theme';

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
  it('reports its frame instead of pressing, in hoisted mode', () => {
    const onLayout = jest.fn();
    render(
      <HandleLink
        handle="@mia.brews"
        ink="#6F6658"
        underlineColor="rgba(28,24,20,0.3)"
        mode="hoisted"
        onLayout={onLayout}
      />,
    );
    const node = screen.getByLabelText('Open @mia.brews in Instagram');
    expect(node).toBeTruthy();
    expect(node.props.onLayout).toBe(onLayout);
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
  const rect = { x: 43, y: 20, width: 90, height: 14 };

  it('matches a tap inside the handle', () => {
    expect(isHandleTap(60, 26, rect)).toBe(true);
  });

  it('matches the exact edges', () => {
    expect(isHandleTap(43, 20, rect)).toBe(true);
    expect(isHandleTap(133, 34, rect)).toBe(true);
  });

  it('misses a tap to either side, where the avatar and the pill sit', () => {
    expect(isHandleTap(20, 26, rect)).toBe(false);
    expect(isHandleTap(300, 26, rect)).toBe(false);
  });

  it('misses a tap above or below, including the whole composer', () => {
    expect(isHandleTap(60, 10, rect)).toBe(false);
    expect(isHandleTap(60, 400, rect)).toBe(false);
  });

  it('never matches before the handle has been measured', () => {
    // A zero-width default would match the card's left edge on every tap.
    expect(isHandleTap(0, 0, UNMEASURED_RECT)).toBe(false);
    expect(isHandleTap(43, 26, UNMEASURED_RECT)).toBe(false);
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
