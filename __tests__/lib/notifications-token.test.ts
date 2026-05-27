import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import * as devicesApi from '@/lib/api/devices';
import {
  __resetTokenStateForTests,
  fetchAndRegisterDeviceToken,
  wireTokenRotationListener,
} from '@/lib/notifications/token';

const getDevicePushTokenAsyncMock = Notifications.getDevicePushTokenAsync as jest.Mock;
const addPushTokenListenerMock = Notifications.addPushTokenListener as jest.Mock;

const STORAGE_KEY = 'analog-operator.notifications.last-registered-token.v1';

beforeEach(async () => {
  await __resetTokenStateForTests();
  getDevicePushTokenAsyncMock.mockReset();
  addPushTokenListenerMock.mockReset();
  addPushTokenListenerMock.mockReturnValue({ remove: jest.fn() });
  jest.restoreAllMocks();
});

describe('fetchAndRegisterDeviceToken', () => {
  it("registers a new token and persists it to AsyncStorage", async () => {
    getDevicePushTokenAsyncMock.mockResolvedValueOnce({ type: 'ios', data: 'tok-A' });
    const registerSpy = jest
      .spyOn(devicesApi, 'registerDeviceToken')
      .mockResolvedValueOnce({ ok: true, data: undefined });

    const result = await fetchAndRegisterDeviceToken();

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe('registered');
    expect(registerSpy).toHaveBeenCalledWith({ token: 'tok-A', platform: 'ios' });
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe('tok-A');
  });

  it("skips when the current token matches the last-registered one", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'tok-A');
    getDevicePushTokenAsyncMock.mockResolvedValueOnce({ type: 'ios', data: 'tok-A' });
    const registerSpy = jest.spyOn(devicesApi, 'registerDeviceToken');

    const result = await fetchAndRegisterDeviceToken();

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toBe('skipped');
    expect(registerSpy).not.toHaveBeenCalled();
  });

  it("re-registers when token changes", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'tok-OLD');
    getDevicePushTokenAsyncMock.mockResolvedValueOnce({ type: 'ios', data: 'tok-NEW' });
    jest
      .spyOn(devicesApi, 'registerDeviceToken')
      .mockResolvedValueOnce({ ok: true, data: undefined });

    const result = await fetchAndRegisterDeviceToken();

    expect(result.ok).toBe(true);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe('tok-NEW');
  });

  it("does NOT update AsyncStorage on HTTP failure (retry on next cold launch)", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'tok-OLD');
    getDevicePushTokenAsyncMock.mockResolvedValueOnce({ type: 'ios', data: 'tok-NEW' });
    jest.spyOn(devicesApi, 'registerDeviceToken').mockResolvedValueOnce({
      ok: false,
      error: { kind: 'HTTP', status: 500, message: 'server down' },
    });

    const result = await fetchAndRegisterDeviceToken();

    expect(result.ok).toBe(false);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe('tok-OLD');
  });

  it("does NOT update AsyncStorage on NETWORK failure", async () => {
    getDevicePushTokenAsyncMock.mockResolvedValueOnce({ type: 'ios', data: 'tok-NEW' });
    jest.spyOn(devicesApi, 'registerDeviceToken').mockResolvedValueOnce({
      ok: false,
      error: { kind: 'NETWORK', message: 'offline' },
    });

    const result = await fetchAndRegisterDeviceToken();

    expect(result.ok).toBe(false);
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("returns NETWORK error when getDevicePushTokenAsync throws", async () => {
    getDevicePushTokenAsyncMock.mockRejectedValueOnce(new Error('apns unavailable'));
    const result = await fetchAndRegisterDeviceToken();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NETWORK');
  });

  it("returns NETWORK error when the device token is empty", async () => {
    getDevicePushTokenAsyncMock.mockResolvedValueOnce({ type: 'ios', data: '' });
    const result = await fetchAndRegisterDeviceToken();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NETWORK');
  });
});

describe('wireTokenRotationListener', () => {
  it("re-POSTs and updates AsyncStorage when Apple rotates the token", async () => {
    const registerSpy = jest
      .spyOn(devicesApi, 'registerDeviceToken')
      .mockResolvedValue({ ok: true, data: undefined });

    let captured: ((event: { type: string; data: string }) => void) | null = null;
    addPushTokenListenerMock.mockImplementation((cb) => {
      captured = cb;
      return { remove: jest.fn() };
    });

    wireTokenRotationListener();
    expect(captured).not.toBeNull();

    // Simulate Apple firing a rotation event.
    captured!({ type: 'ios', data: 'tok-ROTATED' });
    // Allow the async IIFE inside the listener to settle.
    await new Promise((resolve) => setImmediate(resolve));

    expect(registerSpy).toHaveBeenCalledWith({ token: 'tok-ROTATED', platform: 'ios' });
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe('tok-ROTATED');
  });

  it("leaves AsyncStorage untouched when rotation re-register fails", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'tok-OLD');
    jest.spyOn(devicesApi, 'registerDeviceToken').mockResolvedValue({
      ok: false,
      error: { kind: 'NETWORK', message: 'offline' },
    });

    let captured: ((event: { type: string; data: string }) => void) | null = null;
    addPushTokenListenerMock.mockImplementation((cb) => {
      captured = cb;
      return { remove: jest.fn() };
    });

    wireTokenRotationListener();
    captured!({ type: 'ios', data: 'tok-NEW' });
    await new Promise((resolve) => setImmediate(resolve));

    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe('tok-OLD');
  });

  it("teardown removes the listener", () => {
    const remove = jest.fn();
    addPushTokenListenerMock.mockReturnValueOnce({ remove });
    const stop = wireTokenRotationListener();
    stop();
    expect(remove).toHaveBeenCalled();
  });

  it("ignores empty rotation tokens", async () => {
    const registerSpy = jest.spyOn(devicesApi, 'registerDeviceToken');
    let captured: ((event: { type: string; data: string }) => void) | null = null;
    addPushTokenListenerMock.mockImplementation((cb) => {
      captured = cb;
      return { remove: jest.fn() };
    });
    wireTokenRotationListener();
    captured!({ type: 'ios', data: '' });
    expect(registerSpy).not.toHaveBeenCalled();
  });
});
