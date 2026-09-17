import { render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthFrame } from '@/components/auth/auth-frame';
import { __resetEntranceStateForTests } from '@/lib/entrance';
import { EntranceProvider, useEntrance } from '@/lib/entrance-context';
import { entrance } from '@/lib/theme';

/**
 * The sign-in screens draw the Analog mark, and so does the cold-launch
 * entrance. Now that the entrance plays on a signed-out launch too, the screen
 * gives way whenever the entrance played in full, so only one mark is ever on
 * screen. It keeps the mark's space, so the title never jumps. (TAC-388.)
 *
 * These run the real provider, so "played in full" is the real decision drained
 * from the real cold-launch flag, not a mocked mode.
 */

let mockReducedMotion = false;
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => mockReducedMotion,
}));

const metrics = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 62, left: 0, right: 0, bottom: 34 },
};

function renderFrame({ withEntrance }: { withEntrance: boolean }) {
  const frame = (
    <AuthFrame title="Welcome back" subtitle="We'll text you a 6-digit code to sign in.">
      <Text>phone field</Text>
    </AuthFrame>
  );
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      {withEntrance ? <EntranceProvider>{frame}</EntranceProvider> : frame}
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  __resetEntranceStateForTests();
  mockReducedMotion = false;
});

describe('AuthFrame: the mark', () => {
  it('gives way on a launch whose entrance played, keeping its space', () => {
    renderFrame({ withEntrance: true });
    expect(screen.queryByLabelText('Analog')).toBeNull();
    const slot = screen.getByTestId('auth-mark-slot');
    expect(StyleSheet.flatten(slot.props.style)).toMatchObject({ width: 44, height: 44 });
  });

  it('shows when no entrance played', () => {
    renderFrame({ withEntrance: false });
    expect(screen.getByLabelText('Analog')).toBeTruthy();
    expect(screen.queryByTestId('auth-mark-slot')).toBeNull();
  });

  /**
   * The root provider mounts once per process, so a sign-in screen reached
   * later in the same launch (signing out from You) mounts a fresh AuthFrame
   * under the SAME provider. `mode` stays 'full' for the whole process, so the
   * mark stays hidden there too, long after the entrance has ended. That is the
   * approved reading of "whenever the entrance played this launch"; showing it
   * once the entrance ends would put a second mark on screen. Pinned here so
   * the consequence is stated, not discovered.
   */
  it('stays hidden on a sign-in screen reached later in the same launch', async () => {
    // Real timers, and a wait on the provider's own `running` flag, rather than
    // `jest.useFakeTimers()` + `advanceTimersByTime`. That version hung forever
    // on Node 22, which is CI's `.nvmrc`, and passed on Node 25: the event loop
    // kept turning without the test finishing, so no Jest timeout fired and CI's
    // Test step ran until GitHub cancelled the job at six hours. (TAC-427.)
    //
    // Waiting for `running` to go false is the point, not a delay: the claim is
    // that the mark stays hidden AFTER the entrance has ended, so the test proves
    // the entrance ended before it signs out. An AuthFrame keyed on `running`
    // instead of `mode` would show the mark here and fail.
    function EntranceState() {
      return <Text>{useEntrance().running ? 'entrance running' : 'entrance ended'}</Text>;
    }
    function Root({ signedOut }: { signedOut: boolean }) {
      return (
        <SafeAreaProvider initialMetrics={metrics}>
          <EntranceProvider>
            <EntranceState />
            {signedOut ? (
              <AuthFrame title="Welcome back" subtitle="Sign in again.">
                <Text>phone field</Text>
              </AuthFrame>
            ) : (
              <Text>queue</Text>
            )}
          </EntranceProvider>
        </SafeAreaProvider>
      );
    }
    const { rerender } = render(<Root signedOut={false} />);
    expect(screen.getByText('entrance running')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('entrance ended')).toBeTruthy(), {
      timeout: entrance.totalMs + 3_000,
    });
    rerender(<Root signedOut />);
    expect(screen.queryByLabelText('Analog')).toBeNull();
    expect(screen.getByTestId('auth-mark-slot')).toBeTruthy();
  }, 15_000);

  it('shows when the provider was not the cold launch', () => {
    renderFrame({ withEntrance: true }).unmount();
    renderFrame({ withEntrance: true });
    expect(screen.getByLabelText('Analog')).toBeTruthy();
  });

  it('shows under reduced motion, where the entrance draws no mark', () => {
    mockReducedMotion = true;
    renderFrame({ withEntrance: true });
    expect(screen.getByLabelText('Analog')).toBeTruthy();
  });
});
