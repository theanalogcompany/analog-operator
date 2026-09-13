/**
 * A display name for the venue, derived from its slug.
 *
 * INTERIM. The queue payload carries `venueSlug` and no display name, so this
 * un-slugifies: `mock-sextant-coffee-roasters` -> `Sextant Coffee Roasters`.
 * It will be wrong for any venue whose real name carries punctuation, an
 * ampersand, a lowercase brand ("b. patisserie"), or an acronym — a slug is a
 * lossy encoding and no amount of cleverness here recovers what it dropped.
 *
 * The fix is `venueName` in the operator queue payload, which is a cross-repo
 * Contract change in `analog-guest`. Until that lands, this is the honest
 * stop-gap; do not grow it into a rules engine.
 */
export function venueNameFromSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const cleaned = slug.trim().replace(/^mock-/, '');
  if (cleaned.length === 0) return null;
  return cleaned
    .split('-')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
