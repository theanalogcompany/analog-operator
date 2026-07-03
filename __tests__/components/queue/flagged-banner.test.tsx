import { render, screen } from '@testing-library/react-native';

import { FlaggedBanner } from '@/components/queue/flagged-banner';

describe('FlaggedBanner', () => {
  it('renders the label and the "Flagged because" prefix when label is set', () => {
    render(<FlaggedBanner label="low fidelity" />);
    expect(screen.getByText(/Flagged because:/)).toBeTruthy();
    expect(screen.getByText(/low fidelity/)).toBeTruthy();
  });

  it('renders nothing when label is null', () => {
    render(<FlaggedBanner label={null} />);
    expect(screen.queryByText(/Flagged because:/)).toBeNull();
  });

  it('renders nothing when label is undefined', () => {
    render(<FlaggedBanner label={undefined} />);
    expect(screen.queryByText(/Flagged because:/)).toBeNull();
  });
});
