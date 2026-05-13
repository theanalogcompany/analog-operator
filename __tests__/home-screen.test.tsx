import { render, screen } from '@testing-library/react-native';

import HomeScreen from '@/app/index';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

describe('HomeScreen', () => {
  it('renders the Analog wordmark and Operator subtitle', () => {
    render(<HomeScreen />);
    expect(screen.getByText('Analog')).toBeTruthy();
    expect(screen.getByText('Operator')).toBeTruthy();
  });

  it('exposes the approval-queue link', () => {
    render(<HomeScreen />);
    expect(screen.getByLabelText('Open approval queue')).toBeTruthy();
  });
});
