import { render, screen } from '@testing-library/react-native';

import { FlaggedBanner } from '@/components/queue/flagged-banner';

describe('FlaggedBanner', () => {
  it('renders the reason and the label prefix when reason is set', () => {
    render(<FlaggedBanner reason="low fidelity" />);
    expect(screen.getByText(/Flagged because:/)).toBeTruthy();
    expect(screen.getByText(/low fidelity/)).toBeTruthy();
  });

  it('renders nothing when reason is null', () => {
    render(<FlaggedBanner reason={null} />);
    expect(screen.queryByText(/Flagged because:/)).toBeNull();
  });

  it('renders nothing when reason is undefined', () => {
    render(<FlaggedBanner reason={undefined} />);
    expect(screen.queryByText(/Flagged because:/)).toBeNull();
  });
});
