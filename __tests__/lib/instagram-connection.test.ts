import * as Linking from 'expo-linking';

import * as venuesApi from '@/lib/api/venues';
import {
  INSTAGRAM_COPY,
  connectionView,
  openInstagramConnect,
  rowAction,
  rowDetail,
  rowValue,
} from '@/lib/instagram-connection';

jest.mock('expo-linking', () => ({ openURL: jest.fn(async () => true) }));

const NOW = Date.parse('2026-10-15T12:00:00.000Z');
const DAY = 24 * 60 * 60_000;
const at = (ms: number) => new Date(ms).toISOString();

describe('connectionView', () => {
  it('reads an unreadable or missing block as unknown, never as not connected', () => {
    const view = connectionView(null, NOW);
    expect(view).toEqual({ kind: 'unknown' });
    expect(rowValue(view)).toBe("Couldn't check");
    expect(rowAction(view)).toBe('Try again');
    expect(rowDetail(view, "Le Mil's Coffee")).toBeNull();
  });

  it('shows a connected venue by its handle, with nothing to do', () => {
    const view = connectionView(
      { status: 'connected', username: 'lemilscoffee', expiresAt: at(NOW + 40 * DAY) },
      NOW,
    );
    expect(rowValue(view)).toBe('@lemilscoffee');
    expect(rowAction(view)).toBeNull();
    expect(rowDetail(view, "Le Mil's Coffee")).toBeNull();
  });

  it('says Connected when the server sends no handle', () => {
    const view = connectionView({ status: 'connected', username: null, expiresAt: null }, NOW);
    expect(rowValue(view)).toBe('Connected');
  });

  it('gives never connected and revoked one wording, naming the venue', () => {
    const view = connectionView({ status: 'disconnected', username: null, expiresAt: null }, NOW);
    expect(rowValue(view)).toBe('Not connected');
    expect(rowAction(view)).toBe('Connect');
    expect(rowDetail(view, "Le Mil's Coffee")).toBe(
      "Instagram messages aren't reaching Le Mil's Coffee. Connect the venue's account to start receiving them.",
    );
  });

  it.each([
    [3 * DAY + 60_000, 'The connection ends in 3 days. Reconnect to keep Instagram messages coming in.'],
    [4 * DAY - 1, 'The connection ends in 3 days. Reconnect to keep Instagram messages coming in.'],
    [DAY, 'The connection ends in 1 day. Reconnect to keep Instagram messages coming in.'],
    [DAY - 1, 'The connection ends today. Reconnect to keep Instagram messages coming in.'],
    [-DAY, 'The connection ends today. Reconnect to keep Instagram messages coming in.'],
  ])('expiring at now + %i ms reads %p (rounds down)', (offset, expected) => {
    const view = connectionView(
      { status: 'expiring', username: 'lemilscoffee', expiresAt: at(NOW + offset) },
      NOW,
    );
    expect(rowValue(view)).toBe('@lemilscoffee');
    expect(rowAction(view)).toBe('Reconnect');
    expect(rowDetail(view, "Le Mil's Coffee")).toBe(expected);
  });

  it.each([null, 'not a date'])('expiring with expiresAt %p reads "soon"', (expiresAt) => {
    const view = connectionView({ status: 'expiring', username: 'lemilscoffee', expiresAt }, NOW);
    expect(rowDetail(view, "Le Mil's Coffee")).toBe(
      'The connection ends soon. Reconnect to keep Instagram messages coming in.',
    );
  });

  it('loading shows no value and no action', () => {
    expect(rowValue({ kind: 'loading' })).toBeNull();
    expect(rowAction({ kind: 'loading' })).toBeNull();
  });
});

describe('copy', () => {
  it('carries no em dash, escaped or literal', () => {
    const views = [
      connectionView({ status: 'expiring', username: 'a', expiresAt: at(NOW + 3 * DAY) }, NOW),
      connectionView({ status: 'expiring', username: 'a', expiresAt: null }, NOW),
      connectionView({ status: 'disconnected', username: null, expiresAt: null }, NOW),
    ];
    const strings = [
      ...Object.values(INSTAGRAM_COPY),
      ...views.map((v) => rowDetail(v, 'Venue') ?? ''),
    ];
    for (const s of strings) expect(s).not.toMatch(/—|&mdash;/);
  });

  it('carries the approved toasts, both ending with a period', () => {
    expect(INSTAGRAM_COPY.connectFailedToast).toBe("Couldn't start connecting. Try again.");
    expect(INSTAGRAM_COPY.openFailedToast).toBe("Couldn't open the browser.");
  });
});

describe('openInstagramConnect', () => {
  afterEach(() => jest.restoreAllMocks());

  it('opens the authorizationUrl the server returned, in the system browser', async () => {
    jest.spyOn(venuesApi, 'startInstagramConnect').mockResolvedValue({
      ok: true,
      data: { authorizationUrl: 'https://www.instagram.com/oauth/authorize?x=1', expiresAt: '' },
    });
    const result = await openInstagramConnect('v1');
    expect(result.ok).toBe(true);
    expect(Linking.openURL).toHaveBeenCalledWith('https://www.instagram.com/oauth/authorize?x=1');
  });

  it('opens nothing when the server call fails', async () => {
    (Linking.openURL as jest.Mock).mockClear();
    jest.spyOn(venuesApi, 'startInstagramConnect').mockResolvedValue({
      ok: false,
      error: { kind: 'HTTP', status: 500, message: '' },
    });
    const result = await openInstagramConnect('v1');
    expect(result).toEqual({
      ok: false,
      error: { kind: 'START_FAILED', error: { kind: 'HTTP', status: 500, message: '' } },
    });
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('reports OPEN_FAILED when the browser cannot open', async () => {
    jest.spyOn(venuesApi, 'startInstagramConnect').mockResolvedValue({
      ok: true,
      data: { authorizationUrl: 'https://www.instagram.com/oauth/authorize', expiresAt: '' },
    });
    (Linking.openURL as jest.Mock).mockRejectedValueOnce(new Error('nope'));
    const result = await openInstagramConnect('v1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('OPEN_FAILED');
  });
});
