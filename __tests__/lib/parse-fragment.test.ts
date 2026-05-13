import { parseFragmentTokens } from '@/lib/auth/parse-fragment';

describe('parseFragmentTokens', () => {
  it('extracts tokens from a valid magic-link callback URL', () => {
    const url =
      'analog-operator://auth/callback#access_token=abc.def.ghi&refresh_token=xyz123&token_type=bearer';
    const result = parseFragmentTokens(url);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.accessToken).toBe('abc.def.ghi');
      expect(result.refreshToken).toBe('xyz123');
    }
  });

  it('returns ok:false when URL has no fragment', () => {
    expect(parseFragmentTokens('analog-operator://auth/callback').ok).toBe(
      false,
    );
  });

  it('returns ok:false when fragment lacks access_token', () => {
    const r = parseFragmentTokens('foo://x#refresh_token=r');
    expect(r.ok).toBe(false);
  });

  it('returns ok:false when fragment lacks refresh_token', () => {
    const r = parseFragmentTokens('foo://x#access_token=a');
    expect(r.ok).toBe(false);
  });

  it('surfaces error_description when Supabase returns an error fragment', () => {
    const r = parseFragmentTokens(
      'foo://x#error=access_denied&error_description=Link+expired',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('Link expired');
  });

  it('falls back to error code if no error_description is present', () => {
    const r = parseFragmentTokens('foo://x#error=otp_expired');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('otp_expired');
  });
});
