import * as Notifications from 'expo-notifications';

export async function setBadgeCount(count: number): Promise<void> {
  const value = Math.max(0, Math.floor(count));
  try {
    await Notifications.setBadgeCountAsync(value);
  } catch (e) {
    if (__DEV__) {
      console.warn('[notifications/badge] setBadgeCountAsync failed', e);
    }
  }
}
