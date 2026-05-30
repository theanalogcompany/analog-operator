import { z } from 'zod';

// Shared primitives used by both `lib/api/queue.ts` (drafts) and
// `lib/api/commitments.ts` (heads-up commitments). Extracted here to break
// the import cycle: queue.ts depends on HeadsUpCommitmentSchema for the
// response envelope, and commitments.ts depends on RecognitionStateSchema +
// isFixtureMode. Without this split they'd form a circular import that
// breaks at runtime initialization. (TAC-298.)

export const RecognitionStateSchema = z.enum([
  'new',
  'returning',
  'regular',
  'raving_fan',
]);
export type RecognitionState = z.infer<typeof RecognitionStateSchema>;

export function isFixtureMode(): boolean {
  return process.env.EXPO_PUBLIC_USE_FIXTURES === 'true';
}
