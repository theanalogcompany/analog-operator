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
        top={242}
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
        top={242}
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
        top={242}
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
        top={242}
        onSelect={() => {}}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.press(screen.getByLabelText('Dismiss filter menu'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  // The panel used to be an inline absolutely-positioned overlay, which meant
  // hand-tuning zIndex so the scrim out-ranked the row list rendered after it
  // and still lost to the panel. A Modal leaves the parent stacking context
  // altogether, so that whole class of bug is gone — but only while it stays a
  // Modal. If this ever reverts to an inline View, the row list paints over
  // the menu again and taps land on conversations instead of options.
  it('renders in a Modal, so nothing in the screen can paint over it', () => {
    const { toJSON } = render(
      <TypeFilterMenu
        visible
        selected="all"
        counts={COUNTS}
        top={242}
        onSelect={() => {}}
        onDismiss={() => {}}
      />,
    );
    const root = toJSON();
    const node = Array.isArray(root) ? root[0] : root;
    expect(node?.type).toBe('Modal');
  });
});
