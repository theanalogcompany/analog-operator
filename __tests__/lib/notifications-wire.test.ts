import * as toast from '@/components/auth/toast';
import * as permissions from '@/lib/notifications/permissions';
import * as tapHandler from '@/lib/notifications/tap-handler';
import * as token from '@/lib/notifications/token';
import { wireNotifications } from '@/lib/notifications/wire';

jest.mock('@/components/auth/toast');

beforeEach(() => {
  jest.restoreAllMocks();
  // The jest.mock() auto-mocks above persist across tests; clearAllMocks
  // resets their call counts so each test starts with a clean slate.
  jest.clearAllMocks();
  jest.spyOn(toast, 'showToast').mockImplementation(() => undefined);
  // Suppress diag noise during tests.
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('wireNotifications — toast surfacing on registration failure', () => {
  it('does NOT show toast when permission status is not granted', () => {
    let captured: ((status: permissions.PermissionStatus) => void) | null = null;
    jest.spyOn(permissions, 'subscribeToPermissionStatus').mockImplementation((fn) => {
      captured = fn;
      return () => undefined;
    });
    jest.spyOn(permissions, 'refreshPermissionStatus').mockResolvedValue({
      ok: true,
      data: 'undetermined',
    });
    jest.spyOn(tapHandler, 'wireTapResponseListener').mockImplementation(() => () => undefined);
    jest.spyOn(tapHandler, 'captureInitialTap').mockResolvedValue(undefined);
    jest.spyOn(token, 'wireTokenRotationListener').mockImplementation(() => () => undefined);
    const registerSpy = jest.spyOn(token, 'fetchAndRegisterDeviceToken');

    wireNotifications();

    captured!('undetermined');
    captured!('denied');
    captured!('loading');

    expect(registerSpy).not.toHaveBeenCalled();
    expect(toast.showToast).not.toHaveBeenCalled();
  });

  it("shows a toast with stage='fetch-token' when token fetch fails after grant", async () => {
    let captured: ((status: permissions.PermissionStatus) => void) | null = null;
    jest.spyOn(permissions, 'subscribeToPermissionStatus').mockImplementation((fn) => {
      captured = fn;
      return () => undefined;
    });
    jest.spyOn(permissions, 'refreshPermissionStatus').mockResolvedValue({
      ok: true,
      data: 'granted',
    });
    jest.spyOn(tapHandler, 'wireTapResponseListener').mockImplementation(() => () => undefined);
    jest.spyOn(tapHandler, 'captureInitialTap').mockResolvedValue(undefined);
    jest.spyOn(token, 'wireTokenRotationListener').mockImplementation(() => () => undefined);
    jest.spyOn(token, 'fetchAndRegisterDeviceToken').mockResolvedValue({
      ok: false,
      error: { kind: 'NETWORK', message: 'apns unavailable', stage: 'fetch-token' },
    });

    wireNotifications();
    captured!('granted');
    await new Promise((resolve) => setImmediate(resolve));

    expect(toast.showToast).toHaveBeenCalledWith(
      expect.stringContaining('fetch-token'),
    );
  });

  it("shows a toast with stage='post-token' when POST fails after grant", async () => {
    let captured: ((status: permissions.PermissionStatus) => void) | null = null;
    jest.spyOn(permissions, 'subscribeToPermissionStatus').mockImplementation((fn) => {
      captured = fn;
      return () => undefined;
    });
    jest.spyOn(permissions, 'refreshPermissionStatus').mockResolvedValue({
      ok: true,
      data: 'granted',
    });
    jest.spyOn(tapHandler, 'wireTapResponseListener').mockImplementation(() => () => undefined);
    jest.spyOn(tapHandler, 'captureInitialTap').mockResolvedValue(undefined);
    jest.spyOn(token, 'wireTokenRotationListener').mockImplementation(() => () => undefined);
    jest.spyOn(token, 'fetchAndRegisterDeviceToken').mockResolvedValue({
      ok: false,
      error: { kind: 'HTTP', status: 500, message: 'server down', stage: 'post-token' },
    });

    wireNotifications();
    captured!('granted');
    await new Promise((resolve) => setImmediate(resolve));

    expect(toast.showToast).toHaveBeenCalledWith(
      expect.stringContaining('post-token'),
    );
  });

  it('does NOT show a toast when registration succeeds', async () => {
    let captured: ((status: permissions.PermissionStatus) => void) | null = null;
    jest.spyOn(permissions, 'subscribeToPermissionStatus').mockImplementation((fn) => {
      captured = fn;
      return () => undefined;
    });
    jest.spyOn(permissions, 'refreshPermissionStatus').mockResolvedValue({
      ok: true,
      data: 'granted',
    });
    jest.spyOn(tapHandler, 'wireTapResponseListener').mockImplementation(() => () => undefined);
    jest.spyOn(tapHandler, 'captureInitialTap').mockResolvedValue(undefined);
    jest.spyOn(token, 'wireTokenRotationListener').mockImplementation(() => () => undefined);
    jest.spyOn(token, 'fetchAndRegisterDeviceToken').mockResolvedValue({
      ok: true,
      data: 'registered',
    });

    wireNotifications();
    captured!('granted');
    await new Promise((resolve) => setImmediate(resolve));

    expect(toast.showToast).not.toHaveBeenCalled();
  });
});
