// The You screen's Instagram row (TAC-517). The API layer is mocked here
// because the claims are about the screen: which copy each state renders, and
// that the browser opens only after the warning is confirmed. What goes over
// the wire is __tests__/lib/api-venues.test.ts's job, against TAC-516's
// Contract.

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Linking from 'expo-linking';
import { Alert, AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import YouScreen from '@/app/you/index';
import { showToast } from '@/components/auth/toast';
import { getVenueState, startInstagramConnect } from '@/lib/api/venues';

const VENUE = {
  id: '8b985b7e-5f8d-4c67-abff-486aabaa5116',
  name: "Le Mil's Coffee",
  slug: 'le-mils-coffee-test',
  timezone: 'America/Los_Angeles',
};

jest.mock('expo-linking', () => ({
  openURL: jest.fn().mockResolvedValue(undefined),
  openSettings: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/you',
}));
jest.mock('@/components/shell/top-nav', () => ({ TopNav: () => null }));
jest.mock('@/components/shell/venue-picker', () => ({ VenuePicker: () => null }));
jest.mock('@/lib/venue-context', () => ({
  useVenueSelection: () => ({
    venues: [VENUE],
    selectedVenueId: VENUE.id,
    selectedVenue: VENUE,
    status: 'ready',
    select: jest.fn(),
  }),
}));
jest.mock('@/lib/auth/use-session', () => ({
  useSession: () => ({ status: 'signed-in', session: { user: { phone: '+15550000000' } } }),
}));
jest.mock('@/hooks/use-notification-permission', () => ({
  useNotificationPermission: () => 'granted',
}));
jest.mock('@/lib/supabase/client', () => ({ supabase: { auth: { signOut: jest.fn() } } }));
jest.mock('@/components/auth/toast', () => ({ showToast: jest.fn(), Toast: () => null }));
jest.mock('@/lib/api/venues', () => ({
  getVenueState: jest.fn(),
  startInstagramConnect: jest.fn(),
}));

const getVenueStateMock = getVenueState as jest.MockedFunction<typeof getVenueState>;
const startMock = startInstagramConnect as jest.MockedFunction<typeof startInstagramConnect>;
const openURLMock = Linking.openURL as jest.Mock;
const showToastMock = showToast as jest.Mock;

const DAY = 24 * 60 * 60_000;
const AUTH_URL = 'https://www.instagram.com/oauth/authorize?state=abc';

const metrics = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 62, left: 0, right: 0, bottom: 34 },
};

async function renderScreen() {
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <YouScreen />
    </SafeAreaProvider>,
  );
  await act(async () => {});
}

type AlertButton = { text: string; onPress?: () => void };
let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  startMock.mockResolvedValue({ ok: true, data: { authorizationUrl: AUTH_URL, expiresAt: '' } });
});

afterEach(() => {
  alertSpy.mockRestore();
});

function pressAlertButton(text: string) {
  const buttons = alertSpy.mock.calls[0][2] as AlertButton[];
  const button = buttons.find((b) => b.text === text);
  if (!button) throw new Error(`no alert button "${text}"`);
  button.onPress?.();
}

describe('the three Instagram states', () => {
  it('connected: the handle in its own case, with nothing to press', async () => {
    getVenueStateMock.mockResolvedValue({
      ok: true,
      data: {
        instagram: {
          status: 'connected',
          username: 'lemilscoffee',
          expiresAt: new Date(Date.now() + 40 * DAY).toISOString(),
        },
      },
    });
    await renderScreen();
    expect(screen.getByText('@lemilscoffee')).toBeTruthy();
    expect(screen.queryByText('RECONNECT')).toBeNull();
    expect(screen.queryByText('CONNECT')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Instagram/ })).toBeNull();
  });

  it('expiring: the handle, Reconnect, and the days left', async () => {
    getVenueStateMock.mockResolvedValue({
      ok: true,
      data: {
        instagram: {
          status: 'expiring',
          username: 'lemilscoffee',
          expiresAt: new Date(Date.now() + 3 * DAY + 60 * 60_000).toISOString(),
        },
      },
    });
    await renderScreen();
    expect(screen.getByText('@lemilscoffee')).toBeTruthy();
    expect(screen.getByText('RECONNECT')).toBeTruthy();
    expect(
      screen.getByText(
        'The connection ends in 3 days. Reconnect to keep Instagram messages coming in.',
      ),
    ).toBeTruthy();
  });

  it('not connected: says messages are not reaching the venue, with Connect', async () => {
    getVenueStateMock.mockResolvedValue({
      ok: true,
      data: { instagram: { status: 'disconnected', username: null, expiresAt: null } },
    });
    await renderScreen();
    expect(screen.getByText('NOT CONNECTED')).toBeTruthy();
    expect(screen.getByText('CONNECT')).toBeTruthy();
    expect(
      screen.getByText(
        "Instagram messages aren't reaching Le Mil's Coffee. Connect the venue's account to start receiving them.",
      ),
    ).toBeTruthy();
  });
});

describe("states that aren't Instagram's", () => {
  it('a payload missing the instagram field still renders, as Couldn’t check', async () => {
    getVenueStateMock.mockResolvedValue({ ok: true, data: { instagram: null } });
    await renderScreen();
    expect(screen.getByText("COULDN'T CHECK")).toBeTruthy();
    expect(screen.queryByText('NOT CONNECTED')).toBeNull();
    expect(screen.getByText('PUSH NOTIFICATIONS')).toBeTruthy();
  });

  it('a failed fetch reads Couldn’t check, and Try again refetches without a warning', async () => {
    getVenueStateMock.mockResolvedValue({
      ok: false,
      error: { kind: 'NETWORK', message: 'offline' },
    });
    await renderScreen();
    expect(screen.queryByText('NOT CONNECTED')).toBeNull();
    expect(getVenueStateMock).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByRole('button', { name: /^Instagram/ }));
    await act(async () => {});

    expect(alertSpy).not.toHaveBeenCalled();
    expect(getVenueStateMock).toHaveBeenCalledTimes(2);
  });
});

describe('connecting', () => {
  beforeEach(() => {
    getVenueStateMock.mockResolvedValue({
      ok: true,
      data: { instagram: { status: 'disconnected', username: null, expiresAt: null } },
    });
  });

  it('shows the warning first, and opens nothing until Continue', async () => {
    await renderScreen();
    fireEvent.press(screen.getByRole('button', { name: /^Instagram/ }));

    expect(alertSpy).toHaveBeenCalledWith(
      'Connect Instagram',
      "Instagram opens in your browser. Make sure it's logged in to the venue's own account, not a personal one. Whichever account is logged in is the one that gets connected.",
      expect.any(Array),
    );
    expect(startMock).not.toHaveBeenCalled();
    expect(openURLMock).not.toHaveBeenCalled();

    await act(async () => {
      pressAlertButton('Continue');
    });

    expect(startMock).toHaveBeenCalledWith(VENUE.id);
    expect(openURLMock).toHaveBeenCalledWith(AUTH_URL);
  });

  it('Not now calls neither the server nor the browser', async () => {
    await renderScreen();
    fireEvent.press(screen.getByRole('button', { name: /^Instagram/ }));
    await act(async () => {
      pressAlertButton('Not now');
    });
    expect(startMock).not.toHaveBeenCalled();
    expect(openURLMock).not.toHaveBeenCalled();
  });

  it('a failed connect call toasts and opens nothing', async () => {
    startMock.mockResolvedValue({ ok: false, error: { kind: 'HTTP', status: 500, message: '' } });
    await renderScreen();
    fireEvent.press(screen.getByRole('button', { name: /^Instagram/ }));
    await act(async () => {
      pressAlertButton('Continue');
    });
    expect(openURLMock).not.toHaveBeenCalled();
    expect(showToastMock).toHaveBeenCalledWith("Couldn't start connecting. Try again.");
  });

  it('a browser that will not open toasts', async () => {
    openURLMock.mockRejectedValueOnce(new Error('no'));
    await renderScreen();
    fireEvent.press(screen.getByRole('button', { name: /^Instagram/ }));
    await act(async () => {
      pressAlertButton('Continue');
    });
    expect(showToastMock).toHaveBeenCalledWith("Couldn't open the browser.");
  });

  it('returning to the app refetches, and an abandoned flow leaves the state as it was', async () => {
    const listeners: ((s: string) => void)[] = [];
    const appStateSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type, handler) => {
        listeners.push(handler as (s: string) => void);
        return { remove: jest.fn() } as never;
      });

    await renderScreen();
    expect(getVenueStateMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      for (const l of listeners) l('active');
    });

    expect(getVenueStateMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText('NOT CONNECTED')).toBeTruthy();
    expect(showToastMock).not.toHaveBeenCalled();
    appStateSpy.mockRestore();
  });
});
