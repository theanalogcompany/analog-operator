import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { __resetEntranceStateForTests, fadeInAt } from '@/lib/entrance';
import { EntranceProvider, useEntrance } from '@/lib/entrance-context';
import { entrance } from '@/lib/theme';

let seenMode: string | null = null;
let seenClock: number | null = null;

function Probe() {
  const { mode, clock } = useEntrance();
  seenMode = mode;
  seenClock = clock.value;
  return <Text>probe</Text>;
}

beforeEach(() => {
  __resetEntranceStateForTests();
  seenMode = null;
  seenClock = null;
});

describe('useEntrance without a provider', () => {
  /**
   * Load-bearing, and the reason the hook has a fallback at all.
   *
   * The ground, the nav, the deck and the hints are each rendered on their own
   * by existing test files, none of which know an entrance exists. Rather than
   * bolt a provider onto all of them — or make every consumer branch on
   * "is there an entrance?" — a consumer with no provider above it reads a
   * clock that has already run out. "No entrance" and "the entrance finished"
   * are then the same state, handled by the same code path.
   */
  it('reports off, with a clock that has already run out', () => {
    render(<Probe />);
    expect(seenMode).toBe('off');
    expect(seenClock).toBe(entrance.totalMs);
  });

  it('resolves every ramp, so a lone component renders finished', () => {
    render(<Probe />);
    const at = (delayMs: number, durationMs: number) =>
      fadeInAt({ elapsedMs: seenClock as number, delayMs, durationMs });

    expect(at(entrance.groundDelayMs, entrance.groundDurationMs)).toBe(1);
    expect(at(entrance.navDelayMs, entrance.navDurationMs)).toBe(1);
    expect(at(entrance.peekNearDelayMs, entrance.peekNearDurationMs)).toBe(1);
    expect(at(entrance.peekFarDelayMs, entrance.peekFarDurationMs)).toBe(1);
    expect(at(entrance.hintsDelayMs, entrance.hintsDurationMs)).toBe(1);
  });
});

describe('EntranceProvider', () => {
  it('plays the full entrance on the first mount of a process', () => {
    render(
      <EntranceProvider>
        <Probe />
      </EntranceProvider>,
    );
    expect(seenMode).toBe('full');
  });

  /**
   * The flag lives in module scope precisely so this is true. A remount is not
   * a cold launch, and on this app remounts are constant: every swipe remounts
   * `FrontCard`, every tab switch remounts the queue screen (the tab row is
   * `router.replace` between sibling stacks), and so does every venue switch.
   */
  it('plays nothing on a second mount', () => {
    const first = render(
      <EntranceProvider>
        <Probe />
      </EntranceProvider>,
    );
    expect(seenMode).toBe('full');
    first.unmount();

    render(
      <EntranceProvider>
        <Probe />
      </EntranceProvider>,
    );
    expect(seenMode).toBe('off');
  });

  it('starts its clock at zero, so the mark begins from nothing', () => {
    render(
      <EntranceProvider>
        <Probe />
      </EntranceProvider>,
    );
    // Sampled on the provider's first render, before the timing animation is
    // scheduled — the frame the veil is opaque and the mark has not begun.
    expect(seenClock).toBe(0);
  });
});
