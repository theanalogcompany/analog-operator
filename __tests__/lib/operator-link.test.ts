import { linkOperator } from '@/lib/auth/operator';
import { supabase } from '@/lib/supabase/client';

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    rpc: jest.fn(),
    auth: { signOut: jest.fn() },
  },
}));

const rpc = supabase.rpc as jest.Mock;
const maybeSingle = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  rpc.mockReturnValue({ maybeSingle });
});

describe('linkOperator', () => {
  it('returns operator on happy path', async () => {
    const operator = {
      id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      phone_number: '+15551234567',
      email: 'op@cafe.com',
      auth_user_id: 'b3e8c8e8-1234-4567-89ab-cdef01234567',
    };
    maybeSingle.mockResolvedValue({ data: operator, error: null });
    const result = await linkOperator({ phone: '+15551234567' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.operator.id).toBe(operator.id);
  });

  it('returns not_provisioned when RPC returns null', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const result = await linkOperator({ phone: '+15551234567' });
    expect(result).toEqual({ ok: false, error: 'not_provisioned' });
  });

  it('returns rpc_failed when RPC errors', async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'boom', code: '12345' },
    });
    const result = await linkOperator({ phone: '+15551234567' });
    expect(result).toEqual({ ok: false, error: 'rpc_failed' });
  });

  it('returns invalid_response on malformed row', async () => {
    maybeSingle.mockResolvedValue({
      data: { not_an: 'operator' },
      error: null,
    });
    const result = await linkOperator({ phone: '+15551234567' });
    expect(result).toEqual({ ok: false, error: 'invalid_response' });
  });

  it('passes phone arg through to RPC, email null', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await linkOperator({ phone: '+15551234567' });
    expect(rpc).toHaveBeenCalledWith('link_operator_auth', {
      p_phone: '+15551234567',
      p_email: null,
    });
  });

  it('passes email arg through to RPC, phone null', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await linkOperator({ email: 'op@cafe.com' });
    expect(rpc).toHaveBeenCalledWith('link_operator_auth', {
      p_phone: null,
      p_email: 'op@cafe.com',
    });
  });
});
