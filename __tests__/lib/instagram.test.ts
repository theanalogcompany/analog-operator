import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';

import { copyAndOpenInstagram, instagramMessageUrl } from '@/lib/instagram';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-linking', () => ({ openURL: jest.fn() }));

const setStringAsync = Clipboard.setStringAsync as jest.Mock;
const openURL = Linking.openURL as jest.Mock;

beforeEach(() => {
  setStringAsync.mockReset().mockResolvedValue(true);
  openURL.mockReset().mockResolvedValue(true);
});

describe('instagramMessageUrl', () => {
  it('builds the ig.me thread link the hand-off names', () => {
    expect(instagramMessageUrl('mia.brews')).toBe('https://ig.me/m/mia.brews');
  });

  it('escapes a handle rather than pasting it into a URL raw', () => {
    expect(instagramMessageUrl('a b/c')).toBe('https://ig.me/m/a%20b%2Fc');
  });
});

describe('copyAndOpenInstagram', () => {
  it('puts the draft on the clipboard and opens the guest thread', async () => {
    const result = await copyAndOpenInstagram({
      body: 'Sorry about Saturday.',
      username: 'mia.brews',
    });
    expect(result.ok).toBe(true);
    expect(setStringAsync).toHaveBeenCalledWith('Sorry about Saturday.');
    expect(openURL).toHaveBeenCalledWith('https://ig.me/m/mia.brews');
  });

  /**
   * Order is load-bearing. If the open fails the operator still holds the text
   * and can get there themselves; opening first and failing to copy would send
   * them to Instagram with an empty clipboard and nothing to paste, which is
   * the worse half to lose.
   */
  it('copies BEFORE it opens', async () => {
    const order: string[] = [];
    setStringAsync.mockImplementation(async () => {
      order.push('copy');
    });
    openURL.mockImplementation(async () => {
      order.push('open');
    });
    await copyAndOpenInstagram({ body: 'x', username: 'mia.brews' });
    expect(order).toEqual(['copy', 'open']);
  });

  it('does not open anything when the copy fails', async () => {
    setStringAsync.mockRejectedValue(new Error('clipboard unavailable'));
    const result = await copyAndOpenInstagram({ body: 'x', username: 'mia.brews' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('COPY_FAILED');
    expect(openURL).not.toHaveBeenCalled();
  });

  it('reports a failed open, with the draft already copied', async () => {
    openURL.mockRejectedValue(new Error('no handler'));
    const result = await copyAndOpenInstagram({ body: 'x', username: 'mia.brews' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('OPEN_FAILED');
    expect(setStringAsync).toHaveBeenCalledWith('x');
  });

  it('refuses without a handle rather than opening a broken link', async () => {
    for (const username of [null, '', '   ']) {
      setStringAsync.mockClear();
      openURL.mockClear();
      const result = await copyAndOpenInstagram({ body: 'x', username });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('NO_HANDLE');
      expect(openURL).not.toHaveBeenCalled();
      // Nothing is copied either: the operator has nowhere to paste it.
      expect(setStringAsync).not.toHaveBeenCalled();
    }
  });
});
