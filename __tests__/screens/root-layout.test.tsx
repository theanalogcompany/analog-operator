// The global.css import in app/_layout.tsx is a Tailwind directive file that
// jest can't parse as JS. Stub it before any layout-pulling import.
jest.mock('@/global.css', () => ({}), { virtual: true });

import { render } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';

// useSession is mocked to start at 'loading', then flip to 'signed-in' before
// re-render so the auth-gated effect can be observed firing on the transition.
type SessionState =
  | { status: 'loading'; session: null }
  | { status: 'signed-in'; session: { user: { email: string | null } } }
  | { status: 'signed-out'; session: null };

let mockSession: SessionState = { status: 'loading', session: null };

// All the boot-time side effects from app/_layout.tsx are mocked to no-ops so
// the test only observes the permission-request behavior.
jest.mock('@/lib/auth/use-session', () => ({
  useSession: () => mockSession,
}));
jest.mock('@/lib/auth/app-state', () => ({
  wireAuthAutoRefresh: () => () => {},
}));
jest.mock('@/lib/auth/dev-log', () => ({ logAuthCallbackUrl: jest.fn() }));
jest.mock('@/lib/auth/operator', () => ({
  wireOperatorCacheClear: () => () => {},
}));
jest.mock('@/hooks/use-undo-state', () => ({
  rehydrateUndoState: jest.fn().mockResolvedValue(undefined),
  wireUndoAutoClearOnSignOut: () => () => {},
}));
jest.mock('@/lib/notifications/wire', () => ({
  wireNotifications: () => () => {},
}));
jest.mock('@/lib/notifications/tap-handler', () => ({
  subscribeToTaps: () => () => {},
}));
jest.mock('@/components/auth/toast', () => ({ Toast: () => null }));

// expo-router's Stack is a screen registry that bails outside a navigation
// context. Replace with a passthrough so layout effects run cleanly.
jest.mock('expo-router', () => {
  const { View } = jest.requireActual('react-native');
  const Stack: React.FC<{ children?: React.ReactNode }> & {
    Screen: React.FC<{ name: string }>;
    Protected: React.FC<{ guard: boolean; children?: React.ReactNode }>;
  } = ({ children }) => <View>{children}</View>;
  Stack.Screen = () => null;
  Stack.Protected = ({ guard, children }) => (guard ? <View>{children}</View> : null);
  return {
    Stack,
    useRouter: () => ({ push: jest.fn() }),
  };
});

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(),
}));

jest.mock('react-native-gesture-handler', () => {
  const { View } = jest.requireActual('react-native');
  return { GestureHandlerRootView: View };
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaProvider: View };
});

// Fonts are mocked as loaded so the layout doesn't sit at `return null`.
jest.mock('@expo-google-fonts/fraunces', () => ({
  Fraunces_400Regular_Italic: 'Fraunces_400Regular_Italic',
  useFonts: () => [true],
}));
jest.mock('@expo-google-fonts/inter-tight', () => ({
  InterTight_400Regular: 'InterTight_400Regular',
  InterTight_500Medium: 'InterTight_500Medium',
  useFonts: () => [true],
}));

const getPermissionsAsyncMock = Notifications.getPermissionsAsync as jest.Mock;
const requestPermissionsAsyncMock = Notifications.requestPermissionsAsync as jest.Mock;

// Imported after mocks so the layout pulls the mocked deps.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const RootLayout = require('@/app/_layout').default as () => React.ReactNode;

beforeEach(() => {
  mockSession = { status: 'loading', session: null };
  getPermissionsAsyncMock.mockReset();
  requestPermissionsAsyncMock.mockReset();
  getPermissionsAsyncMock.mockResolvedValue({ status: 'undetermined' });
  requestPermissionsAsyncMock.mockResolvedValue({ status: 'granted' });
});

describe('RootLayout — first-authenticated-render permission prompt (TAC-288)', () => {
  it('does NOT request push permission while the session is still loading', async () => {
    render(<RootLayout />);
    // Allow any queued microtasks to flush — the effect bails synchronously
    // on `loading` so nothing should be in flight, but a microtask drain
    // protects against false negatives if the effect ever becomes async.
    await Promise.resolve();
    expect(requestPermissionsAsyncMock).not.toHaveBeenCalled();
  });

  it('does NOT request push permission while signed out', async () => {
    mockSession = { status: 'signed-out', session: null };
    render(<RootLayout />);
    await Promise.resolve();
    expect(requestPermissionsAsyncMock).not.toHaveBeenCalled();
  });

  it('requests push permission when session resolves as signed-in and status is undetermined', async () => {
    mockSession = {
      status: 'signed-in',
      session: { user: { email: 'jaipal@theanalog.company' } },
    };
    render(<RootLayout />);
    // Microtask drain — `refreshPermissionStatus` is awaited inside the
    // helper before `requestPermission` fires.
    await Promise.resolve();
    await Promise.resolve();
    expect(requestPermissionsAsyncMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT call requestPermissionsAsync when status is already granted', async () => {
    getPermissionsAsyncMock.mockResolvedValue({ status: 'granted' });
    mockSession = {
      status: 'signed-in',
      session: { user: { email: 'jaipal@theanalog.company' } },
    };
    render(<RootLayout />);
    await Promise.resolve();
    await Promise.resolve();
    expect(requestPermissionsAsyncMock).not.toHaveBeenCalled();
  });

  it('does NOT call requestPermissionsAsync when status is already denied', async () => {
    getPermissionsAsyncMock.mockResolvedValue({ status: 'denied' });
    mockSession = {
      status: 'signed-in',
      session: { user: { email: 'jaipal@theanalog.company' } },
    };
    render(<RootLayout />);
    await Promise.resolve();
    await Promise.resolve();
    expect(requestPermissionsAsyncMock).not.toHaveBeenCalled();
  });

  it('fires once on transition from loading → signed-in (SecureStore auto-login path)', async () => {
    mockSession = { status: 'loading', session: null };
    const { rerender } = render(<RootLayout />);
    await Promise.resolve();
    expect(requestPermissionsAsyncMock).not.toHaveBeenCalled();

    mockSession = {
      status: 'signed-in',
      session: { user: { email: 'jaipal@theanalog.company' } },
    };
    rerender(<RootLayout />);
    await Promise.resolve();
    await Promise.resolve();
    expect(requestPermissionsAsyncMock).toHaveBeenCalledTimes(1);
  });

  it('fires once on transition from signed-out → signed-in (SMS OTP path)', async () => {
    mockSession = { status: 'signed-out', session: null };
    const { rerender } = render(<RootLayout />);
    await Promise.resolve();
    expect(requestPermissionsAsyncMock).not.toHaveBeenCalled();

    mockSession = {
      status: 'signed-in',
      session: { user: { email: 'jaipal@theanalog.company' } },
    };
    rerender(<RootLayout />);
    await Promise.resolve();
    await Promise.resolve();
    expect(requestPermissionsAsyncMock).toHaveBeenCalledTimes(1);
  });
});
