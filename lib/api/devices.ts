import { z } from 'zod';

import { authedFetch, parseHttpError } from './client';
import { type ApiError, type Result, err, ok } from './errors';
import { isFixtureMode } from './queue';

// Server contract per TAC-207 settled-decision #7. Strict — no tolerant fallback
// or optional fields; analog-guest's `/api/operators/devices` is live and the
// shape is locked.
export const RegisterDeviceTokenRequestSchema = z.strictObject({
  token: z.string().min(1),
  platform: z.literal('ios'),
});
export type RegisterDeviceTokenRequest = z.infer<typeof RegisterDeviceTokenRequestSchema>;

export async function registerDeviceToken(
  request: RegisterDeviceTokenRequest,
): Promise<Result<void>> {
  const parsed = RegisterDeviceTokenRequestSchema.safeParse(request);
  if (!parsed.success) {
    return err<ApiError>({ kind: 'PARSE', message: parsed.error.message });
  }

  if (isFixtureMode()) {
    return ok(undefined);
  }

  const result = await authedFetch('/api/operators/devices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.data),
  });
  if (!result.ok) return result;
  if (!result.data.ok) return err<ApiError>(await parseHttpError(result.data));
  return ok(undefined);
}
