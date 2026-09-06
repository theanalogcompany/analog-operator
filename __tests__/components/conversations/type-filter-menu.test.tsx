import { fireEvent, render, screen } from '@testing-library/react-native';

import { TypeFilterMenu, type TypeFilterOption } from '@/components/conversations/type-filter-menu';

const COUNTS: Record<TypeFilterOption, number> = {
  all: 12,
  new: 4,
  returning: 3,
  regular: 3,
  raving_fan: 2,
};

describe('TypeFilterMenu', () => {
  it('renders nothing when not visible', () => {
    const { toJSON } = render(
      <TypeFilterMenu
        visible={false}
        selected="all"
        counts={COUNTS}
        onSelect={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(toJSON()).toBeNull();
  });

  it('renders every option with its count', () => {
    render(
      <TypeFilterMenu
        visible
        selected="all"
        counts={COUNTS}
        onSelect={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText('All guests')).toBeTruthy();
    expect(screen.getByText('Raving Fan')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('fires onSelect with the tapped option\'s key', () => {
    const onSelect = jest.fn();
    render(
      <TypeFilterMenu
        visible
        selected="all"
        counts={COUNTS}
        onSelect={onSelect}
        onDismiss={() => {}}
      />,
    );
    fireEvent.press(screen.getByLabelText('Regular'));
    expect(onSelect).toHaveBeenCalledWith('regular');
  });

  it('fires onDismiss when the backdrop is pressed', () => {
    const onDismiss = jest.fn();
    render(
      <TypeFilterMenu
        visible
        selected="all"
        counts={COUNTS}
        onSelect={() => {}}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.press(screen.getByLabelText('Dismiss filter menu'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
