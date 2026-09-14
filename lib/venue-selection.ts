import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';

/**
 * Which venue each operator last chose, on this device.
 *
 * Stored as a map keyed by operator id rather than a bare venue id, because
 * this is a shared venue device: operator A signing out and operator B
 * signing in must not hand B whatever A was looking at. Keying by operator
 * also means A's choice is still waiting when A comes back, which a
 * clear-on-sign-out scheme would throw away for no benefit.
 *
 * Key follows the documented `analog-operator.<area>.v<n>` convention. Bump
 * the version if the stored shape changes — never re-parse a new shape
 * against the old key.
 */
const STORAGE_KEY = 'analog-operator.selected-venue.v1';

// Storage is a boundary, so it gets parsed rather than trusted. A map that
// fails to parse is treated as absent: the only thing a corrupt blob can cost
// is one re-pick, and refusing to start because a preference is malformed
// would be a worse trade.
const SelectionMapSchema = z.record(z.string(), z.string());
type SelectionMap = z.infer<typeof SelectionMapSchema>;

async function readMap(): Promise<SelectionMap> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = SelectionMapSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

/**
 * The venue this operator last selected, or `null` if they never have (or the
 * value is unreadable — both mean the same thing to every caller: no stored
 * choice, go pick a default).
 */
export async function readSelectedVenueId(
  operatorId: string,
): Promise<string | null> {
  const map = await readMap();
  return map[operatorId] ?? null;
}

/**
 * Persist this operator's choice. Best-effort, matching the other AsyncStorage
 * writers in this app (`lib/notifications/token.ts`, `hooks/use-undo-state.ts`):
 * a failed write costs the operator a re-pick on next launch, which is not
 * worth surfacing an error state for, and there is no retry that would help.
 */
export async function writeSelectedVenueId(
  operatorId: string,
  venueId: string,
): Promise<void> {
  try {
    const map = await readMap();
    map[operatorId] = venueId;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // best-effort — see above
  }
}

/**
 * Resolve which venue should be active, given what is stored and what the
 * operator is actually mapped to today.
 *
 * Pure, so the precedence rules are testable without touching storage. A
 * stored venue the operator is no longer mapped to is discarded rather than
 * honoured — otherwise removing someone's venue access would leave them
 * pinned to a venue with no data and no explanation. Falls back to the first
 * venue by name so the default is stable across launches instead of tracking
 * whatever order the API happened to return.
 */
export function resolveSelectedVenueId<T extends { id: string; name: string }>(
  venues: readonly T[],
  storedVenueId: string | null,
): string | null {
  if (venues.length === 0) return null;
  if (storedVenueId && venues.some((v) => v.id === storedVenueId)) {
    return storedVenueId;
  }
  return [...venues].sort((a, b) => a.name.localeCompare(b.name))[0].id;
}
