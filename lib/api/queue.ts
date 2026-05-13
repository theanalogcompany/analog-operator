import { z } from 'zod';

import * as fixtures from '@/lib/fixtures/queue';

import { authedFetch, parseHttpError } from './client';
import { type ApiError, type Result, err, ok } from './errors';

export const RecognitionBandSchema = z.enum([
  'guest',
  'regular',
  'returning',
  'raving-fan',
]);
export type RecognitionBand = z.infer<typeof RecognitionBandSchema>;

export const MessageSchema = z.object({
  id: z.string().uuid(),
  body: z.string(),
  direction: z.enum(['inbound', 'outbound']),
  created_at: z.string(),
});
export type Message = z.infer<typeof MessageSchema>;

export const PendingDraftSchema = z.object({
  id: z.string().uuid(),
  guest_id: z.string().uuid(),
  guest_name: z.string().nullable(),
  guest_phone: z.string(),
  recognition_band: RecognitionBandSchema,
  recognition_signals: z.array(z.string()).default([]),
  context_messages: z.array(MessageSchema).default([]),
  current_inbound: MessageSchema,
  agent_draft: z.string(),
  agent_reasoning: z.string().nullable(),
  flag_reason: z.string().nullable(),
  pending_since: z.string(),
  created_at: z.string(),
});
export type PendingDraft = z.infer<typeof PendingDraftSchema>;

const PendingDraftListSchema = z.array(PendingDraftSchema);

export function isFixtureMode(): boolean {
  return !process.env.EXPO_PUBLIC_API_BASE_URL;
}

function parseFailure(reason: string): { ok: false; error: ApiError } {
  return err<ApiError>({ kind: 'PARSE', message: reason });
}

async function emptyOkOrError(response: Response): Promise<Result<void>> {
  if (response.ok) return ok(undefined);
  return err<ApiError>(await parseHttpError(response));
}

export async function listQueue(): Promise<Result<PendingDraft[]>> {
  if (isFixtureMode()) {
    return ok(fixtures.listQueueFixture());
  }
  const result = await authedFetch('/api/operator/queue', { method: 'GET' });
  if (!result.ok) return result;
  if (!result.data.ok) return err<ApiError>(await parseHttpError(result.data));
  let json: unknown;
  try {
    json = await result.data.json();
  } catch (e) {
    return parseFailure(e instanceof Error ? e.message : 'invalid json');
  }
  const parsed = PendingDraftListSchema.safeParse(json);
  if (!parsed.success) return parseFailure(parsed.error.message);
  return ok(parsed.data);
}

export async function approveDraft(messageId: string): Promise<Result<void>> {
  if (isFixtureMode()) {
    return fixtures.approveDraftFixture(messageId);
  }
  const result = await authedFetch(
    `/api/operator/queue/${encodeURIComponent(messageId)}/approve`,
    { method: 'POST' },
  );
  if (!result.ok) return result;
  return emptyOkOrError(result.data);
}

export async function editAndSend(
  messageId: string,
  body: string,
): Promise<Result<void>> {
  if (isFixtureMode()) {
    return fixtures.editAndSendFixture(messageId, body);
  }
  const result = await authedFetch(
    `/api/operator/queue/${encodeURIComponent(messageId)}/edit`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    },
  );
  if (!result.ok) return result;
  return emptyOkOrError(result.data);
}

export async function skipDraft(messageId: string): Promise<Result<void>> {
  if (isFixtureMode()) {
    return fixtures.skipDraftFixture(messageId);
  }
  const result = await authedFetch(
    `/api/operator/queue/${encodeURIComponent(messageId)}/skip`,
    { method: 'POST' },
  );
  if (!result.ok) return result;
  return emptyOkOrError(result.data);
}

export async function undoAction(messageId: string): Promise<Result<void>> {
  if (isFixtureMode()) {
    return fixtures.undoActionFixture(messageId);
  }
  const result = await authedFetch(
    `/api/operator/queue/${encodeURIComponent(messageId)}/undo`,
    { method: 'POST' },
  );
  if (!result.ok) return result;
  return emptyOkOrError(result.data);
}
