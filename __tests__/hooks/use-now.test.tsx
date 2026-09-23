import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';

import { TICK_MS, __resetNowClockForTests, useNow } from '@/hooks/use-now';

function Probe({ onRender }: { onRender: (nowMs: number) => void }) {
  const now = useNow();
  onRender(now);
  return <Text>{String(now)}</Text>;
}

describe('useNow', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    __resetNowClockForTests();
  });

  afterEach(() => {
    __resetNowClockForTests();
    jest.useRealTimers();
  });

  it('ticks once a minute, not once a second', () => {
    const seen: number[] = [];
    render(<Probe onRender={(n) => seen.push(n)} />);
    const before = seen.length;

    act(() => {
      jest.advanceTimersByTime(TICK_MS - 1);
    });
    expect(seen.length).toBe(before);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(seen.length).toBeGreaterThan(before);
  });

  it('uses the interval the hand-off specifies', () => {
    expect(TICK_MS).toBe(60_000);
  });

  it('gives every subscriber the same instant', () => {
    // Two cards on screen must never disagree about what time it is.
    const a: number[] = [];
    const b: number[] = [];
    render(
      <>
        <Probe onRender={(n) => a.push(n)} />
        <Probe onRender={(n) => b.push(n)} />
      </>,
    );
    act(() => {
      jest.advanceTimersByTime(TICK_MS);
    });
    expect(a[a.length - 1]).toBe(b[b.length - 1]);
  });

  /**
   * The TAC-266 leak, in its own shape. A module-level timer that is never
   * disposed keeps the Jest worker alive and shows up as a force-exit rather
   * than as a failing assertion, so it is asserted directly here.
   */
  it('disposes the interval when the last subscriber unmounts', () => {
    const first = render(<Probe onRender={() => {}} />);
    const second = render(<Probe onRender={() => {}} />);
    expect(jest.getTimerCount()).toBeGreaterThan(0);

    first.unmount();
    // One subscriber left: the clock is still needed.
    expect(jest.getTimerCount()).toBeGreaterThan(0);

    second.unmount();
    expect(jest.getTimerCount()).toBe(0);
  });

  /**
   * The corollary CLAUDE.md names: disposing on last-unmount means the next
   * mount has to re-arm, or the clock never restarts. The queue screen unmounts
   * on every tab return and every venue switch, so this is the common path, not
   * an edge case.
   */
  it('re-arms on the next mount after being disposed', () => {
    render(<Probe onRender={() => {}} />).unmount();
    expect(jest.getTimerCount()).toBe(0);

    const seen: number[] = [];
    render(<Probe onRender={(n) => seen.push(n)} />);
    const before = seen.length;
    act(() => {
      jest.advanceTimersByTime(TICK_MS);
    });
    expect(seen.length).toBeGreaterThan(before);
  });
});
