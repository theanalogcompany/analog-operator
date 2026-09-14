import { fireEvent, render, screen } from '@testing-library/react-native';

import { VenuePicker } from '@/components/shell/venue-picker';

const VENUE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VENUE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const LE_MILS = {
  id: VENUE_A,
  name: "Le Mil's Coffee",
  slug: 'le-mils-coffee',
  timezone: 'America/Los_Angeles',
};
const CENTRAL_PERK = {
  id: VENUE_B,
  name: 'Mock Central Perk',
  slug: 'mock-central-perk',
  timezone: 'America/New_York',
};

const select = jest.fn();
let mockVenue: {
  venues: typeof LE_MILS[];
  selectedVenueId: string | null;
  selectedVenue: typeof LE_MILS | null;
  status: 'loading' | 'ready' | 'error';
  select: typeof select;
};

jest.mock('@/lib/venue-context', () => ({
  useVenueSelection: () => mockVenue,
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockVenue = {
    venues: [LE_MILS, CENTRAL_PERK],
    selectedVenueId: VENUE_A,
    selectedVenue: LE_MILS,
    status: 'ready',
    select,
  };
});

describe('VenuePicker', () => {
  it('names the venue with its real name, punctuation and all', () => {
    render(<VenuePicker />);
    // The apostrophe is the whole reason names come from `venues.name` rather
    // than being un-slugified from `le-mils-coffee`.
    expect(screen.getByText("Le Mil's Coffee")).toBeTruthy();
  });

  it('opens a menu of the operator’s venues', () => {
    render(<VenuePicker />);
    fireEvent.press(screen.getByLabelText("Venue: Le Mil's Coffee"));
    expect(screen.getByLabelText('Mock Central Perk')).toBeTruthy();
  });

  it('selects the tapped venue and closes', () => {
    render(<VenuePicker />);
    fireEvent.press(screen.getByLabelText("Venue: Le Mil's Coffee"));
    fireEvent.press(screen.getByLabelText('Mock Central Perk'));
    expect(select).toHaveBeenCalledWith(VENUE_B);
    expect(screen.queryByLabelText('Mock Central Perk')).toBeNull();
  });

  it('marks the current venue as selected for assistive tech', () => {
    render(<VenuePicker />);
    fireEvent.press(screen.getByLabelText("Venue: Le Mil's Coffee"));
    expect(
      screen.getByLabelText("Le Mil's Coffee").props.accessibilityState
        .selected,
    ).toBe(true);
  });

  it('renders plain text with no control for a single-venue operator', () => {
    // Himanshu is mapped to one venue. A picker with one answer is a question
    // that should not have been asked.
    mockVenue = {
      venues: [LE_MILS],
      selectedVenueId: VENUE_A,
      selectedVenue: LE_MILS,
      status: 'ready',
      select,
    };
    render(<VenuePicker />);
    expect(screen.getByText("Le Mil's Coffee")).toBeTruthy();
    expect(screen.queryByLabelText("Venue: Le Mil's Coffee")).toBeNull();
  });

  it('shows a placeholder rather than guessing while venues load', () => {
    mockVenue = {
      venues: [],
      selectedVenueId: null,
      selectedVenue: null,
      status: 'loading',
      select,
    };
    render(<VenuePicker />);
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('falls back to a generic name when venues fail to load', () => {
    mockVenue = {
      venues: [],
      selectedVenueId: null,
      selectedVenue: null,
      status: 'error',
      select,
    };
    render(<VenuePicker />);
    expect(screen.getByText('Your venue')).toBeTruthy();
  });

  it('dismisses without selecting when the scrim is tapped', () => {
    render(<VenuePicker />);
    fireEvent.press(screen.getByLabelText("Venue: Le Mil's Coffee"));
    fireEvent.press(screen.getByLabelText('Dismiss venue menu'));
    expect(select).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Mock Central Perk')).toBeNull();
  });
});
