import { render, screen } from '@testing-library/react-native';

import HomeScreen from '@/app/index';

describe('HomeScreen', () => {
  it('renders the Analog wordmark and Operator subtitle', () => {
    render(<HomeScreen />);
    expect(screen.getByText('Analog')).toBeTruthy();
    expect(screen.getByText('Operator')).toBeTruthy();
  });
});
