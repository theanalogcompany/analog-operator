import {
  resendPhoneOtp,
  sendMagicLink,
  sendPhoneOtp,
  verifyPhoneOtp,
} from '@/lib/auth/sign-in';
import { supabase } from '@/lib/supabase/client';

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: {
      signInWithOtp: jest.fn(),
      verifyOtp: jest.fn(),
    },
  },
}));

const signInWithOtp = supabase.auth.signInWithOtp as jest.Mock;
const verifyOtp = supabase.auth.verifyOtp as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('sendPhoneOtp', () => {
  it('returns ok on success', async () => {
    signInWithOtp.mockResolvedValue({ data: null, error: null });
    const r = await sendPhoneOtp('+15551234567');
    expect(r.ok).toBe(true);
  });

  it('maps 429 to rate_limited', async () => {
    signInWithOtp.mockResolvedValue({
      data: null,
      error: { status: 429, message: 'Too many requests' },
    });
    const r = await sendPhoneOtp('+15551234567');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('rate_limited');
  });

  it('maps network errors to network', async () => {
    signInWithOtp.mockResolvedValue({
      data: null,
      error: { status: 0, message: 'Network request failed' },
    });
    const r = await sendPhoneOtp('+15551234567');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('network');
  });

  it('maps unknown errors to unknown', async () => {
    signInWithOtp.mockResolvedValue({
      data: null,
      error: { status: 500, message: 'whoa' },
    });
    const r = await sendPhoneOtp('+15551234567');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('unknown');
  });
});

describe('verifyPhoneOtp', () => {
  it('returns session on success', async () => {
    const session = { access_token: 'a', refresh_token: 'r' };
    verifyOtp.mockResolvedValue({ data: { session }, error: null });
    const r = await verifyPhoneOtp('+15551234567', '123456');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toBe(session);
  });

  it('maps invalid-code errors', async () => {
    verifyOtp.mockResolvedValue({
      data: { session: null },
      error: { status: 400, message: 'Invalid OTP token' },
    });
    const r = await verifyPhoneOtp('+15551234567', '999999');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('invalid_code');
  });
});

describe('sendMagicLink', () => {
  it('passes redirectTo to signInWithOtp', async () => {
    signInWithOtp.mockResolvedValue({ data: null, error: null });
    await sendMagicLink('op@cafe.com', 'analog-operator://auth/callback');
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'op@cafe.com',
      options: { emailRedirectTo: 'analog-operator://auth/callback' },
    });
  });
});

describe('resendPhoneOtp', () => {
  it('delegates to sendPhoneOtp', async () => {
    signInWithOtp.mockResolvedValue({ data: null, error: null });
    const r = await resendPhoneOtp('+15551234567');
    expect(r.ok).toBe(true);
    expect(signInWithOtp).toHaveBeenCalledWith({ phone: '+15551234567' });
  });
});
