// The notification tap, for a guest at a venue that isn't the one on screen.
//
// The APNs payload carries no venueId (lib/notifications/tap-handler.ts), so
// the venue has to be resolved from the queue after the tap lands. Both naive
// placements fail: filtering after the surface memo hoists a foreign card onto
// the deck and recolours the screen from it; filtering before it makes the tap
// silently do nothing. The settled behavior is to switch venues and say so.

import { act, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import QueueScreen from '@/app/queue/index';
import { showToast } from '@/components/auth/toast';
import { type QueueContextValue } from '@/lib/queue-context';
import { type PendingDraft } from '@/lib/api/queue';
import {
  __resetTapStateForTests,
  setPendingTap,
} from '@/lib/notifications/tap-handler';

const VENUE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VENUE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const GUEST_AT_B = 'b0000000-2f3e-4a5b-8c6d-7e8f9a0b1c2d';
const GUEST_AT_A = 'a0000000-2f3e-4a5b-8c6d-7e8f9a0b1c2d';

const LE_MILS = {
  id: VENUE_A,
  name: "Le Mil's Coffee",
  slug: 'le-mils-coffee',
  timezone: 'America/Los_Angeles',
};
const CENTRAL_PERK = {
  id: VENUE_B,
  name: 'Mock Central Perk',
  slug: 'mock-central-perk',
  timezone: 'America/New_York',
};

const selectVenue = jest.fn();
const findVenueIdForGuest = jest.fn<string | null, [string]>();

const mockQueue: QueueContextValue = {
  drafts: [] as PendingDraft[],
  status: 'ready',
  error: null,
  reload: jest.fn().mockResolvedValue(undefined),
  optimisticallyRemove: jest.fn(),
  restore: jest.fn(),
  findVenueIdForGuest,
};

const mockVenue: {
  venues: (typeof LE_MILS)[];
  selectedVenueId: string | null;
  selectedVenue: typeof LE_MILS | null;
  status: 'loading' | 'ready' | 'error';
  select: typeof selectVenue;
} = {
  venues: [LE_MILS, CENTRAL_PERK],
  selectedVenueId: VENUE_A,
  selectedVenue: LE_MILS,
  status: 'ready',
  select: selectVenue,
};

jest.mock('expo-linking', () => ({
  openURL: jest.fn().mockResolvedValue(undefined),
  openSettings: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/queue',
}));
jest.mock('@/lib/queue-context', () => ({ useQueueContext: () => mockQueue }));
jest.mock('@/lib/venue-context', () => ({ useVenueSelection: () => mockVenue }));
jest.mock('@/lib/auth/use-session', () => ({
  useSession: () => ({
    status: 'signed-in',
    session: { user: { email: 'jaipal@theanalog.company' } },
  }),
}));
jest.mock('@/lib/supabase/client', () => ({
  supabase: { auth: { signOut: jest.fn() } },
}));
jest.mock('@/components/queue/queue-card-stack', () => ({
  QueueCardStack: () => null,
}));
jest.mock('@/components/auth/toast', () => ({
  showToast: jest.fn(),
  Toast: () => null,
}));
jest.mock('@/lib/notifications/badge', () => ({
  setBadgeCount: jest.fn().mockResolvedValue(undefined),
}));

const showToastMock = showToast as jest.MockedFunction<typeof showToast>;

const metrics = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 62, left: 0, right: 0, bottom: 34 },
};

// Render outside act(), then flush: the tap resolution runs in a passive
// effect, so it needs a flush to be observed, and rendering INSIDE act()
// unmounts the tree before the assertions read it.
async function renderScreen() {
  const view = render(
    <SafeAreaProvider initialMetrics={metrics}>
      <QueueScreen />
    </SafeAreaProvider>,
  );
  await act(async () => {});
  return view;
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetTapStateForTests();
  mockVenue.selectedVenueId = VENUE_A;
  findVenueIdForGuest.mockReturnValue(null);
});

describe('notification tap for a guest at another venue', () => {
  it('switches to that guest’s venue', async () => {
    findVenueIdForGuest.mockReturnValue(VENUE_B);
    setPendingTap(GUEST_AT_B);

    await renderScreen();

    expect(selectVenue).toHaveBeenCalledWith(VENUE_B);
  });

  it('says which venue it switched to, rather than switching silently', async () => {
    // An unexplained jump is how an operator learns to distrust the app.
    findVenueIdForGuest.mockReturnValue(VENUE_B);
    setPendingTap(GUEST_AT_B);

    await renderScreen();

    expect(showToastMock).toHaveBeenCalledWith('Switched to Mock Central Perk');
  });

  it('does not switch when the guest is already at the selected venue', async () => {
    findVenueIdForGuest.mockReturnValue(VENUE_A);
    setPendingTap(GUEST_AT_A);

    await renderScreen();

    expect(selectVenue).not.toHaveBeenCalled();
    expect(showToastMock).not.toHaveBeenCalled();
  });

  it('does not switch when the guest has no pending draft anywhere', async () => {
    // Sent or skipped from another device between the push and the tap.
    findVenueIdForGuest.mockReturnValue(null);
    setPendingTap(GUEST_AT_B);

    await renderScreen();

    expect(selectVenue).not.toHaveBeenCalled();
  });

  it('stays silent when the venue is not one the operator is mapped to', async () => {
    // `select` ignores an unmapped venue, so announcing a switch here would
    // claim something that never happened — and because selectedVenueId would
    // not move, the effect would re-fire and re-toast on every reload.
    mockVenue.venues = [];
    mockVenue.selectedVenueId = null;
    findVenueIdForGuest.mockReturnValue(VENUE_B);
    setPendingTap(GUEST_AT_B);

    await renderScreen();

    expect(selectVenue).not.toHaveBeenCalled();
    expect(showToastMock).not.toHaveBeenCalled();
    mockVenue.venues = [LE_MILS, CENTRAL_PERK];
  });

  it('does nothing at all without a tap', async () => {
    await renderScreen();
    expect(selectVenue).not.toHaveBeenCalled();
    expect(findVenueIdForGuest).not.toHaveBeenCalled();
  });
});
