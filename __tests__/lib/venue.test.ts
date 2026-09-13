import {
  __resetVenueSlugForTests,
  getVenueSlug,
  rememberVenueSlug,
} from '@/lib/venue';

beforeEach(() => {
  __resetVenueSlugForTests();
});

// The You screen names the venue, but only a queue draft carries a slug — so
// in live mode with an empty queue there is nothing to derive from and the
// title fell back to "Your venue". A venue does not change between sessions,
// which is what makes remembering it the right answer rather than a cache hack.
describe('venue slug memory', () => {
  it('starts empty', () => {
    expect(getVenueSlug()).toBeNull();
  });

  it('remembers the first slug it is given', () => {
    rememberVenueSlug('mock-sextant-coffee-roasters');
    expect(getVenueSlug()).toBe('mock-sextant-coffee-roasters');
  });

  it('survives the queue going empty', () => {
    rememberVenueSlug('mock-sextant-coffee-roasters');
    // A later render with no drafts passes undefined; the slug must stand.
    rememberVenueSlug(undefined);
    rememberVenueSlug(null);
    expect(getVenueSlug()).toBe('mock-sextant-coffee-roasters');
  });

  it('takes a new slug when one actually arrives', () => {
    rememberVenueSlug('mock-a');
    rememberVenueSlug('mock-b');
    expect(getVenueSlug()).toBe('mock-b');
  });

  it('ignores empty strings, which are not venues', () => {
    rememberVenueSlug('mock-a');
    rememberVenueSlug('');
    expect(getVenueSlug()).toBe('mock-a');
  });
});
