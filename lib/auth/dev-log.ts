import * as Linking from 'expo-linking';

let logged = false;

export function logAuthCallbackUrl(): void {
  if (logged || !__DEV__) {
    return;
  }
  logged = true;
  const url = Linking.createURL('auth/callback');
  console.log('[analog-operator] auth callback URL:', url);
}
