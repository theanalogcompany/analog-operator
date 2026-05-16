import { render } from '@testing-library/react-native';

import HomeScreen from '@/app/index';

// `expo-router`'s real Redirect imperatively navigates on render and complains
// in jest without a NavigationContainer. Mock it as a tagged sentinel View so
// we can assert the redirect target without instantiating the router.
jest.mock('expo-router', () => {
  const { View } = jest.requireActual('react-native');
  return {
    Redirect: ({ href }: { href: string }) => (
      <View testID="redirect" accessibilityLabel={`redirect:${href}`} />
    ),
  };
});

describe('HomeScreen', () => {
  it('redirects to /queue', () => {
    const { getByTestId } = render(<HomeScreen />);
    expect(getByTestId('redirect').props.accessibilityLabel).toBe(
      'redirect:/queue',
    );
  });
});
