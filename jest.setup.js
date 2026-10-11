process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: 'undetermined', granted: false })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'undetermined', granted: false })),
  getDevicePushTokenAsync: jest.fn(async () => ({ type: 'ios', data: 'mock-token' })),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  setBadgeCountAsync: jest.fn(async () => true),
  setNotificationHandler: jest.fn(),
}));

// Media modules (TAC-583). All three are native views or players with no Jest
// implementation, so every suite that renders a thread or a card gets these
// stand-ins. They are deliberately thin: each renders a plain `View` carrying
// the props it was given, so a test can read the source a tile was handed and
// fire its `onLoad` / `onError` by hand. A test that needs a player in a
// particular state overrides the hook's return value (`mockReturnValue`).
//
// The stand-in IS `View`, not a wrapper that calls `createElement`: NativeWind's
// Babel plugin rewrites that call to its own interop helper, and a `jest.mock`
// factory may not reference a variable from outside itself.
jest.mock('expo-image', () => ({
  Image: require('react-native').View,
}));

jest.mock('expo-video', () => {
  const { View } = require('react-native');
  return {
    VideoView: View,
    useVideoPlayer: jest.fn(() => ({
      play: jest.fn(),
      pause: jest.fn(),
      addListener: jest.fn(() => ({ remove: jest.fn() })),
    })),
  };
});

jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(async () => undefined),
  useAudioPlayer: jest.fn(() => ({
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(async () => undefined),
  })),
  useAudioPlayerStatus: jest.fn(() => ({
    playing: false,
    isLoaded: true,
    currentTime: 0,
    duration: 7,
  })),
}));
