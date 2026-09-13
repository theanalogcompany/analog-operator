import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

/**
 * The venue slug, remembered across an empty queue.
 *
 * The You screen names the venue, but the only place a slug appears in any
 * payload is on a queue draft — so in live mode with nothing pending, there is
 * nothing to derive a title from and the screen fell back to "Your venue". A
 * venue doesn't change between sessions, so the honest fix is to remember the
 * last one seen rather than to keep re-deriving it from whatever happens to be
 * in the queue right now.
 *
 * Still interim. `venueName` belongs in the operator payload — see
 * lib/venue-name.ts for why a slug is a lossy source.
 */
const KEY = 'analog-operator.venue.v1';

let cached: string | null = null;
const subscribers = new Set<(slug: string | null) => void>();

export function rememberVenueSlug(slug: string | null | undefined): void {
  if (!slug || slug === cached) return;
  cached = slug;
  void AsyncStorage.setItem(KEY, slug).catch(() => {});
  subscribers.forEach((fn) => fn(cached));
}

export function getVenueSlug(): string | null {
  return cached;
}

export async function rehydrateVenueSlug(): Promise<void> {
  if (cached) return;
  try {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored && !cached) {
      cached = stored;
      subscribers.forEach((fn) => fn(cached));
    }
  } catch {
    // A missing or unreadable value just means we fall back to the generic
    // title; it is not worth failing a screen over.
  }
}

export function useVenueSlug(): string | null {
  const [slug, setSlug] = useState<string | null>(cached);
  useEffect(() => {
    subscribers.add(setSlug);
    void rehydrateVenueSlug();
    return () => {
      subscribers.delete(setSlug);
    };
  }, []);
  return slug;
}

export function __resetVenueSlugForTests(): void {
  cached = null;
  subscribers.clear();
}
