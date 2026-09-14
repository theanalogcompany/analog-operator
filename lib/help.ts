import * as Linking from 'expo-linking';

/** Jaipal's line. The operator's only in-app escape hatch to a human. */
const HELP_SMS_URL = 'sms:+17869530853';

export async function openHelpSms(): Promise<{ ok: boolean }> {
  try {
    await Linking.openURL(HELP_SMS_URL);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
