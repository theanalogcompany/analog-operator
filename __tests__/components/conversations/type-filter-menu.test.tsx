import { fireEvent, render, screen } from '@testing-library/react-native';

import { TypeFilterMenu, type TypeFilterOption } from '@/components/conversations/type-filter-menu';

// Deliberately not imported from `react-test-renderer` (no @types package is
// installed for it in this project, and `render(...).toJSON()`'s return
// value is structurally compatible with this local shape) — a minimal local
// type for the bits of the rendered JSON tree this file actually reads.
type JsonTreeNode = {
  type: string;
  props?: { style?: unknown };
  children?: (JsonTreeNode | string)[] | null;
};

// Flattens an RN style prop (object or array-of-objects, RN's own convention
// for merged styles) down to a single plain object.
function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flattenStyle));
  return (style as Record<string, unknown>) ?? {};
}

// Walks the rendered JSON tree collecting every node's zIndex, keyed by node
// type — used to independently confirm the backdrop/panel stacking order
// without depending on the tree's exact nesting depth. `node` comes in as
// `unknown` because it's whatever `toJSON()` returns; narrowed by hand below
// rather than trusting a library type.
function collectZIndexesByType(
  node: unknown,
  out: { type: string; zIndex: number }[] = [],
): { type: string; zIndex: number }[] {
  if (!node || typeof node === 'string') return out;
  if (Array.isArray(node)) {
    for (const child of node) collectZIndexesByType(child, out);
    return out;
  }
  const typed = node as JsonTreeNode;
  const zIndex = flattenStyle(typed.props?.style).zIndex;
  if (typeof zIndex === 'number') out.push({ type: typed.type, zIndex });
  if (typed.children) collectZIndexesByType(typed.children, out);
  return out;
}

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

  // Regression guard: the backdrop must out-rank whatever renders after this
  // component in the host screen's JSX (app/conversations/index.tsx's row
  // list) but still lose to the menu panel itself. RNTL can't simulate
  // coordinate-based hit-testing, so this only asserts the zIndex values are
  // ordered correctly — the actual tap-wins-over-the-list behavior is an
  // on-device check. See the file-level comment in type-filter-menu.tsx.
  it('stacks the backdrop above default siblings but below the menu panel', () => {
    const { toJSON } = render(
      <TypeFilterMenu
        visible
        selected="all"
        counts={COUNTS}
        onSelect={() => {}}
        onDismiss={() => {}}
      />,
    );
    const zIndexes = collectZIndexesByType(toJSON()).map((n) => n.zIndex);
    // Exactly two nodes declare a zIndex in this tree: the backdrop and the
    // menu panel. The backdrop must be above the (unset, effectively 0)
    // default of any sibling rendered after it in the host screen, and the
    // panel must still win over the backdrop so tapping an option works.
    expect(zIndexes.sort((a, b) => a - b)).toEqual([4, 5]);
  });
});
