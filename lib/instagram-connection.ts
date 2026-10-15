/**
 * What the You screen's Instagram row says about the selected venue (TAC-517).
 *
 * Three Instagram states, per the ruling of 2026-10-15: connected, expiring
 * and not connected. "Never connected" and "revoked or expired" share one
 * wording because the server sends them the same way (`disconnected`, no
 * handle, no date), so the app cannot tell them apart.
 *
 * A fourth kind, `unknown`, is not an Instagram state: it is what the row
 * shows when the fetch failed or the payload couldn't be read. **An unknown is
 * never shown as not connected.** That wording tells an operator their
 * messages aren't arriving, which is a claim the app can only make when the
 * server said so. Same reasoning as the reply window's `'unknown'`
 * (lib/reply-window.ts).
 *
 * Copy approved 2026-10-15. Every string a state shows lives here, so the
 * screen holds no wording of its own. No em dashes.
 */

import * as Linking from 'expo-linking';

import { type ApiError, type Result, err, ok } from '@/lib/api/errors';
import { type InstagramConnection, startInstagramConnect } from '@/lib/api/venues';

const DAY_MS = 24 * 60 * 60_000;

export const INSTAGRAM_COPY = {
  label: 'Instagram',
  connectedNoHandle: 'Connected',
  notConnected: 'Not connected',
  couldntCheck: "Couldn't check",
  connect: 'Connect',
  reconnect: 'Reconnect',
  tryAgain: 'Try again',
  confirmTitle: 'Connect Instagram',
  confirmMessage:
    "Instagram opens in your browser. Make sure it's logged in to the venue's own account, not a personal one. Whichever account is logged in is the one that gets connected.",
  confirmCancel: 'Not now',
  confirmContinue: 'Continue',
  connectFailedToast: "Couldn't start connecting. Try again.",
  openFailedToast: "Couldn't open the browser.",
} as const;

export type InstagramRowView =
  | { kind: 'loading' }
  | { kind: 'unknown' }
  | { kind: 'connected'; handle: string | null }
  | { kind: 'expiring'; handle: string | null; daysLeft: number | null }
  | { kind: 'notConnected' };

/**
 * `connection` is null when the state couldn't be read. `daysLeft` rounds
 * down, so "3 days" never promises more time than there is; an unparseable
 * or missing date is null and reads as "soon".
 */
export function connectionView(
  connection: InstagramConnection | null,
  nowMs: number,
): InstagramRowView {
  if (!connection) return { kind: 'unknown' };
  const handle = connection.username?.trim() ? connection.username.trim() : null;
  switch (connection.status) {
    case 'connected':
      return { kind: 'connected', handle };
    case 'disconnected':
      return { kind: 'notConnected' };
    case 'expiring': {
      const expiresMs = connection.expiresAt ? Date.parse(connection.expiresAt) : NaN;
      const daysLeft = Number.isNaN(expiresMs)
        ? null
        : Math.max(0, Math.floor((expiresMs - nowMs) / DAY_MS));
      return { kind: 'expiring', handle, daysLeft };
    }
  }
}

/** The value beside the label, or null for none. */
export function rowValue(view: InstagramRowView): string | null {
  switch (view.kind) {
    case 'loading':
      return null;
    case 'unknown':
      return INSTAGRAM_COPY.couldntCheck;
    case 'connected':
    case 'expiring':
      return view.handle ? `@${view.handle}` : INSTAGRAM_COPY.connectedNoHandle;
    case 'notConnected':
      return INSTAGRAM_COPY.notConnected;
  }
}

/** The trailing action, or null when there is nothing to do. */
export function rowAction(view: InstagramRowView): string | null {
  switch (view.kind) {
    case 'loading':
    case 'connected':
      return null;
    case 'unknown':
      return INSTAGRAM_COPY.tryAgain;
    case 'expiring':
      return INSTAGRAM_COPY.reconnect;
    case 'notConnected':
      return INSTAGRAM_COPY.connect;
  }
}

/** The explanation under the row, or null when there is nothing to explain. */
export function rowDetail(view: InstagramRowView, venueName: string): string | null {
  switch (view.kind) {
    case 'expiring': {
      const tail = 'Reconnect to keep Instagram messages coming in.';
      if (view.daysLeft === null) return `The connection ends soon. ${tail}`;
      if (view.daysLeft === 0) return `The connection ends today. ${tail}`;
      const unit = view.daysLeft === 1 ? 'day' : 'days';
      return `The connection ends in ${view.daysLeft} ${unit}. ${tail}`;
    }
    case 'notConnected':
      return `Instagram messages aren't reaching ${venueName}. Connect the venue's account to start receiving them.`;
    default:
      return null;
  }
}

export type InstagramConnectError =
  | { kind: 'START_FAILED'; error: ApiError }
  | { kind: 'OPEN_FAILED'; message: string };

/**
 * Ask the server for Instagram's approval URL and open it in the system
 * browser, not an in-app web view, so the phone's existing Instagram session
 * applies. Call only after the operator has confirmed the warning.
 *
 * Nothing is recorded on this side: the server's state stays `disconnected`
 * until its callback lands, and the screen learns the result by refetching
 * when the app returns to the foreground. An abandoned flow therefore changes
 * nothing, which is what the ticket asks for.
 */
export async function openInstagramConnect(
  venueId: string,
): Promise<Result<void, InstagramConnectError>> {
  const started = await startInstagramConnect(venueId);
  if (!started.ok) {
    return err<InstagramConnectError>({ kind: 'START_FAILED', error: started.error });
  }
  try {
    await Linking.openURL(started.data.authorizationUrl);
  } catch (e) {
    return err<InstagramConnectError>({
      kind: 'OPEN_FAILED',
      message: e instanceof Error ? e.message : String(e),
    });
  }
  return ok(undefined);
}
