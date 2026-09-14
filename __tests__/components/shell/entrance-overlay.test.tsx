import { render, screen } from '@testing-library/react-native';

import { EntranceOverlay } from '@/components/shell/entrance-overlay';

let mockMode: 'off' | 'full' | 'reduced' = 'full';
let mockRunning = true;

jest.mock('@/lib/entrance-context', () => ({
  useEntrance: () => ({
    mode: mockMode,
    running: mockRunning,
    clock: { value: 0 },
    reduced: { value: 1 },
    elapsedMs: () => 0,
  }),
}));

jest.mock('@/components/ground/ground', () => {
  const { View } = jest.requireActual('react-native');
  return { GroundPaint: () => <View testID="veil-paint" /> };
});

// The overlay is hidden from screen readers on purpose, and RNTL's queries skip
// hidden elements by default. Without this, "not rendered" and "rendered but
// hidden" are indistinguishable, and every absence assertion passes for free.
const HIDDEN = { includeHiddenElements: true } as const;

beforeEach(() => {
  mockMode = 'full';
  mockRunning = true;
});

describe('EntranceOverlay', () => {
  it('covers the app during a full entrance without taking touches', () => {
    render(<EntranceOverlay />);
    const overlay = screen.getByTestId('entrance-overlay', HIDDEN);
    expect(overlay.props.pointerEvents).toBe('none');
    expect(screen.getByTestId('veil-paint', HIDDEN)).toBeTruthy();
  });

  /**
   * It leaves with the entrance rather than on a timer of its own: a JS timer
   * at the mark's last frame raced the UI clock and could cut a still-visible
   * mark on a slow launch.
   */
  it('leaves when the entrance stops running', () => {
    const { rerender } = render(<EntranceOverlay />);
    expect(screen.queryByTestId('entrance-overlay', HIDDEN)).not.toBeNull();

    mockRunning = false;
    rerender(<EntranceOverlay />);
    expect(screen.queryByTestId('entrance-overlay', HIDDEN)).toBeNull();
  });

  /**
   * Reduced motion skips to the resolved state: no veil, no mark. Outside a
   * cold launch — or on a signed-out one — there is no entrance at all.
   */
  it.each(['off', 'reduced'] as const)('renders nothing when the mode is %s', (mode) => {
    mockMode = mode;
    render(<EntranceOverlay />);
    expect(screen.queryByTestId('entrance-overlay', HIDDEN)).toBeNull();
  });
});
