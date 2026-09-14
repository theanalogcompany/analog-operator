import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  readSelectedVenueId,
  resolveSelectedVenueId,
  writeSelectedVenueId,
} from '@/lib/venue-selection';

const STORAGE_KEY = 'analog-operator.selected-venue.v1';

const OPERATOR_A = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const OPERATOR_B = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const VENUE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VENUE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const LE_MILS = { id: VENUE_A, name: "Le Mil's Coffee" };
const CENTRAL_PERK = { id: VENUE_B, name: 'Mock Central Perk' };

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe('venue selection storage', () => {
  it('round-trips a selection', async () => {
    await writeSelectedVenueId(OPERATOR_A, VENUE_A);
    expect(await readSelectedVenueId(OPERATOR_A)).toBe(VENUE_A);
  });

  it('returns null when this operator has never chosen', async () => {
    expect(await readSelectedVenueId(OPERATOR_A)).toBeNull();
  });

  it('does not let one operator inherit another operator’s venue', async () => {
    // The shared-device case the ticket calls out: operator A signs out, B
    // signs in, and B must not land on whatever A was looking at.
    await writeSelectedVenueId(OPERATOR_A, VENUE_A);
    expect(await readSelectedVenueId(OPERATOR_B)).toBeNull();
  });

  it('keeps each operator’s own choice side by side', async () => {
    await writeSelectedVenueId(OPERATOR_A, VENUE_A);
    await writeSelectedVenueId(OPERATOR_B, VENUE_B);
    expect(await readSelectedVenueId(OPERATOR_A)).toBe(VENUE_A);
    expect(await readSelectedVenueId(OPERATOR_B)).toBe(VENUE_B);
  });

  it('overwrites the same operator’s previous choice', async () => {
    await writeSelectedVenueId(OPERATOR_A, VENUE_A);
    await writeSelectedVenueId(OPERATOR_A, VENUE_B);
    expect(await readSelectedVenueId(OPERATOR_A)).toBe(VENUE_B);
  });

  it('treats a corrupt blob as no stored selection rather than throwing', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'not json at all');
    expect(await readSelectedVenueId(OPERATOR_A)).toBeNull();
  });

  it('treats a wrong-shaped blob as no stored selection', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ [OPERATOR_A]: 42 }));
    expect(await readSelectedVenueId(OPERATOR_A)).toBeNull();
  });

  it('survives an unreadable store', async () => {
    jest
      .spyOn(AsyncStorage, 'getItem')
      .mockRejectedValueOnce(new Error('storage is gone'));
    expect(await readSelectedVenueId(OPERATOR_A)).toBeNull();
  });

  it('does not throw when the write fails', async () => {
    jest
      .spyOn(AsyncStorage, 'setItem')
      .mockRejectedValueOnce(new Error('storage is full'));
    await expect(
      writeSelectedVenueId(OPERATOR_A, VENUE_A),
    ).resolves.toBeUndefined();
  });
});

describe('resolveSelectedVenueId', () => {
  it('honours a stored venue the operator is still mapped to', () => {
    expect(
      resolveSelectedVenueId([LE_MILS, CENTRAL_PERK], VENUE_B),
    ).toBe(VENUE_B);
  });

  it('falls back to the first venue by name when nothing is stored', () => {
    // Name-sorted rather than payload-ordered, so the default is the same
    // venue on every launch instead of tracking API ordering.
    expect(resolveSelectedVenueId([CENTRAL_PERK, LE_MILS], null)).toBe(VENUE_A);
  });

  it('discards a stored venue the operator is no longer mapped to', () => {
    // Losing access to a venue must not pin the operator to a venue with no
    // data and no way out.
    expect(
      resolveSelectedVenueId([CENTRAL_PERK], VENUE_A),
    ).toBe(VENUE_B);
  });

  it('returns null when the operator is mapped to nothing', () => {
    expect(resolveSelectedVenueId([], VENUE_A)).toBeNull();
  });

  it('auto-selects the only venue for a single-venue operator', () => {
    expect(resolveSelectedVenueId([LE_MILS], null)).toBe(VENUE_A);
  });

  it('does not mutate the venues it was given', () => {
    const venues = [CENTRAL_PERK, LE_MILS];
    resolveSelectedVenueId(venues, null);
    expect(venues).toEqual([CENTRAL_PERK, LE_MILS]);
  });
});
