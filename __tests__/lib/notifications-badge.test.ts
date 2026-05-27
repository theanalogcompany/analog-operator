import * as Notifications from 'expo-notifications';

import { setBadgeCount } from '@/lib/notifications/badge';

const setBadgeCountAsyncMock = Notifications.setBadgeCountAsync as jest.Mock;

beforeEach(() => {
  setBadgeCountAsyncMock.mockReset();
  setBadgeCountAsyncMock.mockResolvedValue(true);
});

describe('lib/notifications/badge', () => {
  it('setBadgeCount forwards the value to expo-notifications', async () => {
    await setBadgeCount(3);
    expect(setBadgeCountAsyncMock).toHaveBeenCalledWith(3);
  });

  it('setBadgeCount clamps negative values to 0', async () => {
    await setBadgeCount(-5);
    expect(setBadgeCountAsyncMock).toHaveBeenCalledWith(0);
  });

  it('setBadgeCount floors fractional values', async () => {
    await setBadgeCount(2.9);
    expect(setBadgeCountAsyncMock).toHaveBeenCalledWith(2);
  });

  it('swallows errors so a flaky badge call never crashes the screen', async () => {
    setBadgeCountAsyncMock.mockRejectedValueOnce(new Error('badge unavailable'));
    await expect(setBadgeCount(1)).resolves.toBeUndefined();
  });
});
