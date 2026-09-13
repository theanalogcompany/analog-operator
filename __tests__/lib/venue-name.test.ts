import { venueNameFromSlug } from '@/lib/venue-name';

describe('venueNameFromSlug', () => {
  it('un-slugifies a venue name', () => {
    expect(venueNameFromSlug('sextant-coffee-roasters')).toBe(
      'Sextant Coffee Roasters',
    );
  });

  it('strips the fixture mock- prefix', () => {
    expect(venueNameFromSlug('mock-sextant-coffee-roasters')).toBe(
      'Sextant Coffee Roasters',
    );
  });

  it('returns null when there is no slug to work from', () => {
    expect(venueNameFromSlug(null)).toBeNull();
    expect(venueNameFromSlug(undefined)).toBeNull();
    expect(venueNameFromSlug('')).toBeNull();
    expect(venueNameFromSlug('mock-')).toBeNull();
  });

  it('is lossy, and that is why venueName belongs in the payload', () => {
    // Documenting the failure rather than pretending it doesn't exist: a slug
    // has already discarded the punctuation and the casing, and no amount of
    // cleverness here gets them back. These are wrong on purpose.
    expect(venueNameFromSlug('b-patisserie')).toBe('B Patisserie');
    expect(venueNameFromSlug('tartine-bakery-co')).toBe('Tartine Bakery Co');
  });

  it('does not lowercase the rest of a word it did not slugify', () => {
    expect(venueNameFromSlug('MOCK-abc')).toBe('MOCK Abc');
  });
});
