// VenueProvider's own job: resolve which venue is active, persist it, and
// keep one operator's choice off another operator's screen. Mounted for real
// against a stubbed operator lookup and a real AsyncStorage mock, so the
// persistence assertions actually exercise the storage round-trip.

import { act, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from 'react-native';

import { VenueProvider, useVenueSelection } from '@/lib/venue-context';
import { resolveOperatorVenues } from '@/lib/auth/operator';

jest.mock('@/lib/auth/operator', () => ({
  resolveOperatorVenues: jest.fn(),
}));

let mockSession: { status: string; session: unknown } = {
  status: 'signed-in',
  session: { access_token: 't' },
};
jest.mock('@/lib/auth/use-session', () => ({ useSession: () => mockSession }));

const resolveOperatorVenuesMock = resolveOperatorVenues as jest.MockedFunction<
  typeof resolveOperatorVenues
>;

const STORAGE_KEY = 'analog-operator.selected-venue.v1';
const OPERATOR_A = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const OPERATOR_B = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const VENUE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VENUE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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

function resolved(operatorId: string, venues: typeof LE_MILS[]) {
  return { ok: true as const, operatorId, venues };
}

const handle: {
  selectedVenueId: string | null;
  selectedName: string | null;
  venueCount: number;
  status: string;
  select: (id: string) => void;
} = {
  selectedVenueId: null,
  selectedName: null,
  venueCount: 0,
  status: 'loading',
  select: () => {},
};

function Probe() {
  const v = useVenueSelection();
  handle.selectedVenueId = v.selectedVenueId;
  handle.selectedName = v.selectedVenue?.name ?? null;
  handle.venueCount = v.venues.length;
  handle.status = v.status;
  handle.select = v.select;
  return <Text>{v.status}</Text>;
}

function mount() {
  return render(
    <VenueProvider>
      <Probe />
    </VenueProvider>,
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockSession = { status: 'signed-in', session: { access_token: 't' } };
  resolveOperatorVenuesMock.mockResolvedValue(
    resolved(OPERATOR_A, [CENTRAL_PERK, LE_MILS]),
  );
});

describe('VenueProvider resolution', () => {
  it('name-sorts the venues and defaults to the first', async () => {
    mount();
    await waitFor(() => expect(handle.status).toBe('ready'));
    expect(handle.venueCount).toBe(2);
    expect(handle.selectedName).toBe("Le Mil's Coffee");
  });

  it('restores the venue this operator last chose', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ [OPERATOR_A]: VENUE_B }),
    );
    mount();
    await waitFor(() => expect(handle.status).toBe('ready'));
    expect(handle.selectedVenueId).toBe(VENUE_B);
  });

  it('persists a switch, so it survives the next launch', async () => {
    mount();
    await waitFor(() => expect(handle.status).toBe('ready'));

    await act(async () => {
      handle.select(VENUE_B);
    });
    await waitFor(async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      expect(JSON.parse(raw ?? '{}')[OPERATOR_A]).toBe(VENUE_B);
    });
  });

  it('persists the resolved default too, not just an explicit pick', async () => {
    mount();
    await waitFor(async () => {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      expect(JSON.parse(raw ?? '{}')[OPERATOR_A]).toBe(VENUE_A);
    });
  });

  it('does not hand operator B the venue operator A was on', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ [OPERATOR_A]: VENUE_B }),
    );
    resolveOperatorVenuesMock.mockResolvedValue(
      resolved(OPERATOR_B, [CENTRAL_PERK, LE_MILS]),
    );

    mount();
    await waitFor(() => expect(handle.status).toBe('ready'));
    // B gets the name-sorted default, not A's Central Perk.
    expect(handle.selectedVenueId).toBe(VENUE_A);
  });

  it('drops a stored venue the operator is no longer mapped to', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ [OPERATOR_A]: VENUE_B }),
    );
    resolveOperatorVenuesMock.mockResolvedValue(resolved(OPERATOR_A, [LE_MILS]));

    mount();
    await waitFor(() => expect(handle.status).toBe('ready'));
    expect(handle.selectedVenueId).toBe(VENUE_A);
  });

  it('auto-selects the single venue of a single-venue operator', async () => {
    resolveOperatorVenuesMock.mockResolvedValue(resolved(OPERATOR_A, [LE_MILS]));
    mount();
    await waitFor(() => expect(handle.status).toBe('ready'));
    expect(handle.venueCount).toBe(1);
    expect(handle.selectedVenueId).toBe(VENUE_A);
  });

  it('ignores a selection the operator is not mapped to', async () => {
    mount();
    await waitFor(() => expect(handle.status).toBe('ready'));
    await act(async () => {
      handle.select('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    });
    expect(handle.selectedVenueId).toBe(VENUE_A);
  });

  it('errors when the operator row cannot be resolved', async () => {
    resolveOperatorVenuesMock.mockResolvedValue({
      ok: false,
      error: 'not_provisioned',
    });
    mount();
    await waitFor(() => expect(handle.status).toBe('error'));
    expect(handle.selectedVenueId).toBeNull();
  });

  it('errors when the venue list cannot be loaded', async () => {
    resolveOperatorVenuesMock.mockResolvedValue({
      ok: false,
      error: 'rpc_failed',
    });
    mount();
    await waitFor(() => expect(handle.status).toBe('error'));
  });

  it('holds at loading while signed out — never ready with no venues', async () => {
    // 'ready' with an empty list would read as "this operator has no venues",
    // which is a different claim from "nobody is signed in".
    mockSession = { status: 'signed-out', session: null };
    mount();
    await waitFor(() => expect(handle.status).toBe('loading'));
    expect(handle.venueCount).toBe(0);
    expect(resolveOperatorVenuesMock).not.toHaveBeenCalled();
  });
});
