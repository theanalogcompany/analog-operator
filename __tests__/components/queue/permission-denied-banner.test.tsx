import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Linking from 'expo-linking';

import { PermissionDeniedBanner } from '@/components/queue/permission-denied-banner';
import { useNotificationPermission } from '@/hooks/use-notification-permission';

jest.mock('expo-linking', () => ({
  openSettings: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/hooks/use-notification-permission', () => ({
  useNotificationPermission: jest.fn(),
}));

const useNotificationPermissionMock = useNotificationPermission as jest.Mock;

beforeEach(() => {
  useNotificationPermissionMock.mockReset();
  (Linking.openSettings as jest.Mock).mockClear();
});

describe('PermissionDeniedBanner', () => {
  it('renders nothing when status is granted', () => {
    useNotificationPermissionMock.mockReturnValue('granted');
    render(<PermissionDeniedBanner />);
    expect(screen.queryByLabelText(/Settings/)).toBeNull();
  });

  it('renders nothing when status is undetermined', () => {
    useNotificationPermissionMock.mockReturnValue('undetermined');
    render(<PermissionDeniedBanner />);
    expect(screen.queryByLabelText(/Settings/)).toBeNull();
  });

  it('renders nothing while loading', () => {
    useNotificationPermissionMock.mockReturnValue('loading');
    render(<PermissionDeniedBanner />);
    expect(screen.queryByLabelText(/Settings/)).toBeNull();
  });

  it('renders the banner copy when status is denied', () => {
    useNotificationPermissionMock.mockReturnValue('denied');
    render(<PermissionDeniedBanner />);
    expect(
      screen.getByText('Push notifications are off. Tap to enable in Settings.'),
    ).toBeTruthy();
  });

  it('opens iOS Settings on press when denied', () => {
    useNotificationPermissionMock.mockReturnValue('denied');
    render(<PermissionDeniedBanner />);
    fireEvent.press(screen.getByLabelText('Enable push notifications in Settings'));
    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
  });
});
