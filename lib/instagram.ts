/**
 * Opening a guest's Instagram DM thread, and putting a draft on the clipboard
 * on the way.
 *
 * **Instagram cannot be handed prefilled text.** That has been confirmed
 * repeatedly and it is why this is a copy-then-open rather than a share sheet:
 * the operator pastes once they arrive. Three taps, not one. If a future
 * Instagram release changes that, this module is where it changes.
 *
 * The deep link is the `ig.me` web form rather than an `instagram://` scheme.
 * Both were considered: the scheme opens the app directly when it is installed
 * but fails silently to nothing when it is not, and `Linking.canOpenURL` needs
 * the scheme declared in `LSApplicationQueriesSchemes` to answer honestly,
 * which is an `app.json` change and a native rebuild. `https://ig.me/m/<handle>`
 * is handed to iOS, which routes it into the Instagram app through its
 * universal link when installed and to the web otherwise. One URL, no silent
 * failure, no native config. The hand-off's own copy table names this URL.
 *
 * **Whichever account Instagram is logged into is the account the thread opens
 * from.** That is a property of the phone, not of this link, and it is why the
 * ticket asks for a first-use explainer.
 *
 * (TAC-486.)
 */

import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';

import { type Result, err, ok } from '@/lib/api/errors';

/**
 * Why a copy-and-open did not finish. Errors as values, per the repo
 * convention: this is called from a press handler, which is an outer boundary,
 * but the caller decides what the operator is told.
 */
export type InstagramOpenError =
  | { kind: 'NO_HANDLE' }
  | { kind: 'COPY_FAILED'; message: string }
  | { kind: 'OPEN_FAILED'; message: string };

/**
 * The guest's DM thread. `username` is the handle WITHOUT its `@`, exactly as
 * the wire carries it (TAC-473's Contract).
 */
export function instagramMessageUrl(username: string): string {
  return `https://ig.me/m/${encodeURIComponent(username)}`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Put the draft on the clipboard, then open the guest's thread.
 *
 * The order matters. Copying first means that if the open fails the operator
 * still holds the text and can get there themselves; opening first and failing
 * to copy would send them to Instagram with an empty clipboard and nothing to
 * paste, which is the worse half to lose.
 */
export async function copyAndOpenInstagram(args: {
  body: string;
  username: string | null;
}): Promise<Result<void, InstagramOpenError>> {
  const { body, username } = args;
  if (!username || username.trim().length === 0) {
    return err<InstagramOpenError>({ kind: 'NO_HANDLE' });
  }

  try {
    await Clipboard.setStringAsync(body);
  } catch (e) {
    return err<InstagramOpenError>({ kind: 'COPY_FAILED', message: messageOf(e) });
  }

  try {
    await Linking.openURL(instagramMessageUrl(username.trim()));
  } catch (e) {
    return err<InstagramOpenError>({ kind: 'OPEN_FAILED', message: messageOf(e) });
  }

  return ok(undefined);
}
