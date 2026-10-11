import { readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';

import { type View } from 'react-native';
import { type AnimatedRef, measure } from 'react-native-reanimated';

import {
  guardGesture,
  isRefAttached,
  measureIfAttached,
} from '@/lib/gesture-guard';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated'),
  measure: jest.fn(),
}));

const measureMock = measure as jest.MockedFunction<typeof measure>;

/**
 * A ref as the UI thread sees it: a function returning the shadow node wrapper
 * of the view it is attached to, or `null` when no view ever took it.
 */
function uiRef(wrapper: unknown): AnimatedRef<View> {
  return Object.assign(() => wrapper, {
    current: null,
    observe: () => undefined,
  }) as unknown as AnimatedRef<View>;
}

const ROOT = join(__dirname, '..', '..');
const SOURCE_DIRS = ['app', 'components', 'hooks', 'lib'];
const HELPER = 'lib/gesture-guard.ts';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** Source with comments removed, so prose about a pattern is not the pattern. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const files = SOURCE_DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir))).map(
  (path) => ({ name: relative(ROOT, path), text: code(path) }),
);

describe('measureIfAttached', () => {
  beforeEach(() => {
    measureMock.mockReset();
  });

  // The production crash. On a text card, a heads-up card and an Instagram
  // card with no handle line, nothing takes the handle ref, and the native
  // measure throws on the null it is handed.
  it('never reaches the native measure for a ref no view is attached to', () => {
    expect(measureIfAttached(uiRef(null))).toBeNull();
    expect(measureMock).not.toHaveBeenCalled();
  });

  it('measures a ref a view is attached to', () => {
    const rect = { x: 0, y: 0, width: 80, height: 16, pageX: 40, pageY: 120 };
    measureMock.mockReturnValue(rect);
    const ref = uiRef({ shadowNode: true });

    expect(measureIfAttached(ref)).toBe(rect);
    expect(measureMock).toHaveBeenCalledWith(ref);
  });

  it.each([
    [null, false],
    [undefined, false],
    [-1, false],
    [{ shadowNode: true }, true],
  ])('isRefAttached(%p) is %p', (wrapper, expected) => {
    expect(isRefAttached(wrapper)).toBe(expected);
  });
});

describe('guardGesture', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  // The report crosses to the JS thread through `runOnJS`, which under Jest
  // lands a microtask later.
  const flush = (): Promise<void> => Promise.resolve();

  it('reports an error thrown by the callback and does not rethrow it', async () => {
    const guarded = guardGesture('tap.onEnd', () => {
      'worklet';
      throw new Error('Value is null, expected an Object');
    });

    expect(() => guarded()).not.toThrow();
    await flush();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain('tap.onEnd');
    expect(errorSpy.mock.calls[0][0]).toContain(
      'Value is null, expected an Object',
    );
  });

  it('reports a thrown value that is not an Error', async () => {
    const guarded = guardGesture('pan.onUpdate', () => {
      'worklet';
      throw 'plain string';
    });

    expect(() => guarded()).not.toThrow();
    await flush();
    expect(errorSpy.mock.calls[0][0]).toContain('plain string');
  });

  it('passes its arguments through and stays silent when nothing throws', async () => {
    const seen: unknown[][] = [];
    guardGesture('tap.onEnd', (...args: unknown[]) => {
      'worklet';
      seen.push(args);
    })('event', true);
    await flush();

    expect(seen).toEqual([['event', true]]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  // gesture-handler runs a callback on the UI thread only when it carries
  // `__workletHash`. Without it the callback silently moves to the JS thread.
  it('returns a worklet', () => {
    const guarded = guardGesture('tap.onEnd', () => {
      'worklet';
    });
    expect(guarded).toHaveProperty('__workletHash');
  });

  // Wrapping a callback takes it out of the position where the babel plugin
  // workletizes it automatically. One that lost its directive would throw on
  // every event and be swallowed, so it is refused where it is registered.
  it('refuses a callback that is not a worklet', () => {
    expect(() => guardGesture('tap.onEnd', () => undefined)).toThrow(
      /no 'worklet' directive/,
    );
  });
});

/**
 * The two static rules. They read the source because the failure they prevent
 * cannot happen in Jest: a worklet that throws here is an ordinary exception,
 * and only a release build turns it into an abort.
 */
describe('gesture callbacks in the app source', () => {
  const CALLBACK =
    /\.on(?:Begin|Start|Update|Change|End|Finalize|TouchesDown|TouchesMove|TouchesUp|TouchesCancelled)\(\s*(\S{0,13})/g;

  it('finds the gestures it is meant to be checking', () => {
    const withGestures = files.filter((file) => /Gesture\.\w+\(\)/.test(file.text));
    expect(withGestures.map((file) => file.name).sort()).toEqual([
      'components/queue/queue-card-stack.tsx',
      'hooks/use-queue-swipe.ts',
    ]);
  });

  it('registers every gesture callback through guardGesture', () => {
    const unguarded = files
      .filter((file) => /Gesture\.\w+\(\)/.test(file.text))
      .flatMap((file) =>
        [...file.text.matchAll(CALLBACK)]
          .filter((match) => !match[1].startsWith('guardGesture('))
          .map((match) => `${file.name}: ${match[0]}`),
      );

    expect(unguarded).toEqual([]);
  });

  it('imports measure from reanimated only inside the guard module', () => {
    const direct = files
      .filter((file) => file.name !== HELPER)
      .filter((file) =>
        [
          ...file.text.matchAll(
            /import\s+(?:type\s+)?(?:\w+\s*,\s*)?\{([^}]*)\}\s*from\s*'react-native-reanimated'/g,
          ),
        ].some((match) =>
          match[1].split(',').some((name) => name.trim() === 'measure'),
        ),
      )
      .map((file) => file.name);

    expect(direct).toEqual([]);
  });
});
