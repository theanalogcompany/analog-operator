import * as Notifications from 'expo-notifications';

import {
  __resetPermissionStateForTests,
  getCurrentPermissionStatus,
  refreshPermissionStatus,
  requestPermission,
  subscribeToPermissionStatus,
} from '@/lib/notifications/permissions';

const getPermissionsAsyncMock = Notifications.getPermissionsAsync as jest.Mock;
const requestPermissionsAsyncMock = Notifications.requestPermissionsAsync as jest.Mock;

beforeEach(() => {
  __resetPermissionStateForTests();
  getPermissionsAsyncMock.mockReset();
  requestPermissionsAsyncMock.mockReset();
});

describe('lib/notifications/permissions', () => {
  it('starts in loading state', () => {
    expect(getCurrentPermissionStatus()).toBe('loading');
  });

  it('refreshPermissionStatus normalizes granted', async () => {
    getPermissionsAsyncMock.mockResolvedValueOnce({ status: 'granted' });
    const result = await refreshPermissionStatus();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe('granted');
    expect(getCurrentPermissionStatus()).toBe('granted');
  });

  it('refreshPermissionStatus normalizes denied', async () => {
    getPermissionsAsyncMock.mockResolvedValueOnce({ status: 'denied' });
    const result = await refreshPermissionStatus();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe('denied');
  });

  it('refreshPermissionStatus normalizes undetermined for unknown status', async () => {
    getPermissionsAsyncMock.mockResolvedValueOnce({ status: 'unknown-thing' });
    const result = await refreshPermissionStatus();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe('undetermined');
  });

  it('refreshPermissionStatus returns NETWORK error on throw', async () => {
    getPermissionsAsyncMock.mockRejectedValueOnce(new Error('boom'));
    const result = await refreshPermissionStatus();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NETWORK');
  });

  it('requestPermission fires the OS prompt and emits the resolved status', async () => {
    requestPermissionsAsyncMock.mockResolvedValueOnce({ status: 'granted' });
    const result = await requestPermission();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe('granted');
    expect(requestPermissionsAsyncMock).toHaveBeenCalledTimes(1);
  });

  it('subscribers receive the current status immediately on subscribe', () => {
    const fn = jest.fn();
    const unsub = subscribeToPermissionStatus(fn);
    expect(fn).toHaveBeenCalledWith('loading');
    unsub();
  });

  it('subscribers receive new status when refreshPermissionStatus emits', async () => {
    const fn = jest.fn();
    const unsub = subscribeToPermissionStatus(fn);
    getPermissionsAsyncMock.mockResolvedValueOnce({ status: 'denied' });
    await refreshPermissionStatus();
    expect(fn).toHaveBeenCalledWith('denied');
    unsub();
  });

  it('emit deduplicates identical statuses', async () => {
    getPermissionsAsyncMock.mockResolvedValue({ status: 'granted' });
    const fn = jest.fn();
    const unsub = subscribeToPermissionStatus(fn);
    fn.mockClear();
    await refreshPermissionStatus();
    await refreshPermissionStatus();
    expect(fn).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('unsubscribe stops further notifications', async () => {
    const fn = jest.fn();
    const unsub = subscribeToPermissionStatus(fn);
    unsub();
    fn.mockClear();
    getPermissionsAsyncMock.mockResolvedValueOnce({ status: 'granted' });
    await refreshPermissionStatus();
    expect(fn).not.toHaveBeenCalled();
  });
});
