import { filterByVenue } from '@/lib/venue-filter';

const VENUE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VENUE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const items = [
  { id: '1', venueId: VENUE_A },
  { id: '2', venueId: VENUE_B },
  { id: '3', venueId: VENUE_A },
];

describe('filterByVenue', () => {
  it('keeps only the selected venue, in order', () => {
    expect(filterByVenue(items, VENUE_A)).toEqual([
      { id: '1', venueId: VENUE_A },
      { id: '3', venueId: VENUE_A },
    ]);
  });

  it('returns nothing when no venue is selected — never the whole list', () => {
    // The load-bearing assertion of this ticket. A `null` selection returning
    // the unfiltered list would be the merged view TAC-382 exists to remove,
    // reappearing in exactly the state where the filter is least sure.
    expect(filterByVenue(items, null)).toEqual([]);
  });

  it('returns nothing for a venue with no items', () => {
    expect(filterByVenue(items, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')).toEqual(
      [],
    );
  });

  it('does not mutate the input', () => {
    const original = [...items];
    filterByVenue(items, VENUE_A);
    expect(items).toEqual(original);
  });

  it('handles an empty list', () => {
    expect(filterByVenue([], VENUE_A)).toEqual([]);
  });
});
