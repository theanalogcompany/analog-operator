import { fireEvent, render, screen } from '@testing-library/react-native';

import VerifyScreen from '@/app/sign-in/verify';
import { resendPhoneOtp } from '@/lib/auth/sign-in';

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: {
      verifyOtp: jest.fn(),
      signOut: jest.fn(),
    },
    rpc: jest.fn(),
  },
}));

jest.mock('@/lib/auth/sign-in', () => ({
  resendPhoneOtp: jest.fn().mockResolvedValue({ ok: true, data: undefined }),
  verifyPhoneOtp: jest.fn(),
}));

jest.mock('@/lib/auth/operator', () => ({
  linkOperator: jest.fn(),
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ phone: '+15551234567' }),
}));

describe('VerifyScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the verify heading and shows the masked phone', () => {
    render(<VerifyScreen />);
    expect(screen.getByText('Enter the code')).toBeTruthy();
    expect(screen.getByText(/Sent to \+15551234567/)).toBeTruthy();
    expect(screen.getByPlaceholderText('123456')).toBeTruthy();
  });

  it('renders the Resend button and dispatches resendPhoneOtp on tap', () => {
    render(<VerifyScreen />);
    const resend = screen.getByText('Resend code');
    fireEvent.press(resend);
    expect(resendPhoneOtp).toHaveBeenCalledWith('+15551234567');
  });
});
