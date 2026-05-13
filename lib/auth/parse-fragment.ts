export type FragmentTokens =
  | { ok: true; accessToken: string; refreshToken: string }
  | { ok: false; error?: string };

export function parseFragmentTokens(url: string): FragmentTokens {
  const hashIdx = url.indexOf('#');
  if (hashIdx === -1) {
    return { ok: false };
  }
  const fragment = url.slice(hashIdx + 1);
  const params = new URLSearchParams(fragment);
  const error =
    params.get('error_description') ?? params.get('error') ?? undefined;
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) {
    return error ? { ok: false, error } : { ok: false };
  }
  return { ok: true, accessToken, refreshToken };
}
