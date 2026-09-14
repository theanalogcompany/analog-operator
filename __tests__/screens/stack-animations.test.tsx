import { render } from '@testing-library/react-native';
import { type ReactNode } from 'react';

import ConversationsLayout from '@/app/conversations/_layout';
import QueueLayout from '@/app/queue/_layout';

/**
 * Pushes into the edit screen and into a thread keep their animations.
 * (TAC-388.)
 *
 * The tab row stopped animating by giving the ROOT stack's Queue, Texts and You
 * screens `animation: 'none'` (see `__tests__/screens/root-layout.test.tsx`).
 * The edit screen and the thread live in these nested stacks, so their
 * transitions are configured here and must survive that change. What this pins
 * is the configuration native-stack receives; that the push reads as motion on
 * a phone is device UAT.
 */

type ScreenProps = { name: string; options?: Record<string, unknown> };

const mockScreens: Record<string, Record<string, unknown> | undefined> = {};

jest.mock('expo-router', () => {
  const { View } = jest.requireActual('react-native');
  const Stack = ({ children }: { children?: ReactNode }) => <View>{children}</View>;
  Stack.Screen = ({ name, options }: ScreenProps) => {
    mockScreens[name] = options;
    return null;
  };
  return { Stack };
});

jest.mock('@/lib/conversations-context', () => ({
  ConversationsProvider: ({ children }: { children?: ReactNode }) => children,
}));

beforeEach(() => {
  for (const key of Object.keys(mockScreens)) delete mockScreens[key];
});

describe('nested stack transitions', () => {
  it('fades the edit screen in over the queue', () => {
    render(<QueueLayout />);
    expect(mockScreens.edit).toEqual({ presentation: 'transparentModal', animation: 'fade' });
  });

  it('slides a thread in from the right', () => {
    render(<ConversationsLayout />);
    expect(mockScreens['[guestId]']).toEqual({ animation: 'slide_from_right' });
  });

  it('never turns a nested push off', () => {
    render(<QueueLayout />);
    render(<ConversationsLayout />);
    for (const options of Object.values(mockScreens)) {
      expect(options?.animation).not.toBe('none');
    }
  });
});
