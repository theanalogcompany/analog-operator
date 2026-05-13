import { supabase } from '@/lib/supabase/client';

import { type ApiError, type Result, err, ok } from './errors';

type AuthedFetchInit = Omit<RequestInit, 'headers'> & {
  headers?: Record<string, string>;
};

const debug = (message: string): void => {
  if (__DEV__) {
    console.debug(`[api] ${message}`);
  }
};

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token && token.length > 0 ? token : null;
}

function buildHeaders(token: string, extra?: Record<string, string>): Record<string, string> {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    ...(extra ?? {}),
  };
}

async function attempt(
  baseUrl: string,
  path: string,
  init: AuthedFetchInit,
  token: string,
): Promise<Result<Response>> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: buildHeaders(token, init.headers),
    });
  } catch (networkError) {
    const message =
      networkError instanceof Error ? networkError.message : 'network request failed';
    return err<ApiError>({ kind: 'NETWORK', message });
  }
  return ok(response);
}

/**
 * Fetch with the operator's Supabase access token attached as a Bearer header.
 * One refresh-and-retry on 401/403; never loops. Returns NO_SESSION when the
 * session is missing or refresh fails — callers do NOT navigate, the global
 * session listener owns that side effect.
 */
export async function authedFetch(
  path: string,
  init: AuthedFetchInit = {},
): Promise<Result<Response>> {
  const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (!baseUrl) {
    debug('no api base url — caller should be in fixture mode');
    return err<ApiError>({ kind: 'NO_SESSION' });
  }

  const token = await getAccessToken();
  if (!token) {
    debug('no session');
    return err<ApiError>({ kind: 'NO_SESSION' });
  }
  debug('bearer attached');

  const first = await attempt(baseUrl, path, init, token);
  if (!first.ok) return first;
  if (first.data.status !== 401 && first.data.status !== 403) return first;

  debug(`${first.data.status} — refreshing once`);
  const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError || !refreshData.session?.access_token) {
    debug('refresh failed → NO_SESSION');
    return err<ApiError>({ kind: 'NO_SESSION' });
  }

  const retry = await attempt(baseUrl, path, init, refreshData.session.access_token);
  if (!retry.ok) return retry;
  if (retry.data.status === 401 || retry.data.status === 403) {
    debug(`retry still ${retry.data.status} → NO_SESSION`);
    return err<ApiError>({ kind: 'NO_SESSION' });
  }
  return retry;
}

/**
 * Coarse HTTP error mapping. Current callers in `app/queue/*` treat every
 * non-ok response as "retryable" (revert into queue + error toast). That's
 * deliberate while TAC-258 firms up its contract; if it ends up distinguishing
 * 4xx terminal (404 / 410 — draft gone) from 5xx transient, add a finer-
 * grained `kind` here and route accordingly in the screen handlers.
 */
export async function parseHttpError(response: Response): Promise<ApiError> {
  let message = `http ${response.status}`;
  try {
    const text = await response.text();
    if (text) message = text.slice(0, 300);
  } catch {
    // ignore — keep default
  }
  return { kind: 'HTTP', status: response.status, message };
}
