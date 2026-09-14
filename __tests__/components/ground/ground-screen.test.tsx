import { render, screen, within } from '@testing-library/react-native';
import { Text } from 'react-native';

import { GroundScreen } from '@/components/ground/ground-screen';
import { type GroundName } from '@/lib/grounds';
import { entrance } from '@/lib/theme';

/**
 * GroundScreen owns the only frames of the entrance a screen paints: the
 * underlay, clay arriving, and the bucket ground's handoff. Those decisions live
 * in this component, so this is the layer the test drives — the provider is
 * replaced with a clock the test sets, and nothing about the ground is mocked
 * except the gradient painter. (CLAUDE.md, TAC-312.)
 */

type MockEntrance = {
  mode: 'off' | 'full' | 'reduced';
  running: boolean;
  clock: { value: number };
  reduced: { value: number };
  elapsedMs: () => number;
};

let mockEntrance: MockEntrance;

jest.mock('@/lib/entrance-context', () => ({
  useEntrance: () => mockEntrance,
  useRidesEntranceSlot: () => true,
}));

jest.mock('@/components/ground/ground', () => {
  const { View } = jest.requireActual('react-native');
  return {
    Ground: ({ name }: { name: string }) => <View testID={`paint-${name}`} />,
  };
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

function fullEntranceAt(elapsedMs: number, running = true): void {
  mockEntrance = {
    mode: 'full',
    running,
    clock: { value: elapsedMs },
    reduced: { value: 1 },
    elapsedMs: () => elapsedMs,
  };
}

function noEntrance(): void {
  mockEntrance = {
    mode: 'off',
    running: false,
    clock: { value: entrance.totalMs },
    reduced: { value: 1 },
    elapsedMs: () => entrance.totalMs,
  };
}

function queueScreen(name: GroundName) {
  return (
    <GroundScreen name={name} entranceGround="resting">
      <Text>queue</Text>
    </GroundScreen>
  );
}

/** The ground a layer is painting, or null when the layer is not rendered. */
function layer(testID: string): string | null {
  const node = screen.queryByTestId(testID);
  if (!node) return null;
  const [paint] = within(node).queryAllByTestId(/^paint-/);
  return paint ? String(paint.props.testID).replace('paint-', '') : null;
}

const underlay = () => screen.queryByTestId('ground-underlay');

beforeEach(() => {
  noEntrance();
});

describe('GroundScreen — outside an entrance', () => {
  it('paints the named ground over the near-black underlay', () => {
    render(queueScreen('draftWrong'));
    expect(layer('ground-current')).toBe('draftWrong');
    expect(underlay()).not.toBeNull();
    expect(screen.queryByTestId('entrance-base')).toBeNull();
  });

  it('crossfades a ground change over the outgoing ground', () => {
    const { rerender } = render(queueScreen('resting'));
    rerender(queueScreen('draftWrong'));
    expect(layer('ground-previous')).toBe('resting');
    expect(layer('ground-current')).toBe('draftWrong');
  });
});

describe('GroundScreen — mounted after the entrance', () => {
  /**
   * The regression from review. `mode` stays 'full' for the whole process, and
   * a GroundScreen that started its own 1.7s timer on every mount hard-cut its
   * ground changes after every tab return and venue switch. It must crossfade
   * from its first frame once the entrance is no longer running.
   */
  it('crossfades from its first frame, though the process had an entrance', () => {
    fullEntranceAt(entrance.totalMs + 5_000, false);
    const { rerender } = render(queueScreen('resting'));
    rerender(queueScreen('draftWrong'));
    expect(layer('ground-previous')).toBe('resting');
    expect(layer('ground-current')).toBe('draftWrong');
  });
});

describe('GroundScreen — during a full entrance', () => {
  /**
   * Veil out and clay in cross at 200–900ms, so for that window the ground is
   * partly transparent. Nothing else paints behind a screen but the navigator's
   * light grey, which showed through as a pale haze on build 40.
   */
  it('paints near-black under clay while the entrance runs', () => {
    fullEntranceAt(0);
    render(queueScreen('resting'));
    expect(underlay()).not.toBeNull();
    expect(layer('entrance-base')).toBe('resting');
    expect(screen.queryByTestId('ground-current')).toBeNull();
  });

  it('produces no bucket and no crossfade for an empty queue', () => {
    fullEntranceAt(0);
    const { rerender } = render(queueScreen('resting'));
    fullEntranceAt(1_200);
    rerender(queueScreen('resting'));
    expect(screen.queryByTestId('entrance-bucket')).toBeNull();
    expect(screen.queryByTestId('ground-previous')).toBeNull();
    expect(screen.queryByTestId('ground-current')).toBeNull();
    expect(layer('entrance-base')).toBe('resting');
  });

  /**
   * Fast fetch. The bucket is known at 300ms but belongs to the card's 940ms
   * slot, so it rides the clock — no crossfade starts on the response.
   */
  it('holds a bucket that lands before 940ms for the card', () => {
    fullEntranceAt(0);
    const { rerender } = render(queueScreen('resting'));
    fullEntranceAt(300);
    rerender(queueScreen('draftWrong'));
    expect(layer('entrance-bucket')).toBe('draftWrong');
    expect(layer('entrance-base')).toBe('resting');
    expect(screen.queryByTestId('ground-previous')).toBeNull();
    expect(screen.queryByTestId('ground-current')).toBeNull();
  });

  it('treats a bucket already known at mount the same way', () => {
    fullEntranceAt(0);
    render(queueScreen('draftWrong'));
    expect(layer('entrance-bucket')).toBe('draftWrong');
    expect(screen.queryByTestId('ground-previous')).toBeNull();
  });

  /**
   * Slow fetch, as corrected on the ticket. Nothing knows the bucket before the
   * data lands, so a queue at 1.2s has missed the card's slot. Riding the clock
   * would mount the bucket nearly opaque — a hard cut — so it takes the
   * ordinary crossfade from clay instead.
   */
  it('crossfades from clay when the bucket lands after 940ms', () => {
    fullEntranceAt(0);
    const { rerender } = render(queueScreen('resting'));
    fullEntranceAt(1_200);
    rerender(queueScreen('draftWrong'));
    expect(screen.queryByTestId('entrance-bucket')).toBeNull();
    expect(layer('ground-previous')).toBe('resting');
    expect(layer('ground-current')).toBe('draftWrong');
  });

  it('hands off to the deck when the entrance ends, on the same ground', () => {
    fullEntranceAt(0);
    const { rerender } = render(queueScreen('resting'));
    fullEntranceAt(300);
    rerender(queueScreen('draftWrong'));
    expect(layer('entrance-bucket')).toBe('draftWrong');

    fullEntranceAt(entrance.totalMs, false);
    rerender(queueScreen('draftWrong'));
    expect(screen.queryByTestId('entrance-bucket')).toBeNull();
    expect(screen.queryByTestId('entrance-base')).toBeNull();
    expect(screen.queryByTestId('ground-previous')).toBeNull();
    expect(layer('ground-current')).toBe('draftWrong');
  });
});

describe('GroundScreen — reduced motion', () => {
  /**
   * The whole ground fades up from transparent over 150ms. Without the
   * underlay that went dark splash → near-white → clay: a light flash for
   * exactly the operators who asked for less motion.
   */
  it('keeps near-black under the ground through the fade and after it, with no entrance layers', () => {
    mockEntrance = {
      mode: 'reduced',
      running: true,
      clock: { value: entrance.totalMs },
      reduced: { value: 0 },
      elapsedMs: () => entrance.totalMs,
    };
    const { rerender } = render(queueScreen('draftWrong'));
    expect(underlay()).not.toBeNull();
    expect(screen.queryByTestId('entrance-base')).toBeNull();
    expect(layer('ground-current')).toBe('draftWrong');

    // Still there once `running` ends: that flag is a JS timer, and the UI fade
    // can still be finishing when it flips.
    mockEntrance = { ...mockEntrance, running: false, reduced: { value: 1 } };
    rerender(queueScreen('draftWrong'));
    expect(underlay()).not.toBeNull();
  });
});
