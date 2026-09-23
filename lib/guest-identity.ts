/**
 * What a guest is called, in one place, for every surface that names one.
 *
 * **This fixes a live defect.** `displayName()` on the queue card and
 * `name ?? phoneFallback` on the conversation row both fell through to the
 * phone with no non-empty guard, and TAC-473 ruled `phoneFallback` stays a
 * non-nullable string that is `''` for a phoneless guest (so that one Instagram
 * guest cannot empty the queue for every operator at that venue). `??` does not
 * fall back on `''`, so an unnamed Instagram guest rendered as a BLANK NAME.
 * Adding `instagramUsername` to the schema does not fix that on its own; the
 * chain itself has to be rewired, which is what this module is.
 *
 * The chain is: name, then the channel's own identifier, then a plain fallback.
 *
 * The identifier is channel-specific rather than "handle, then phone" in one
 * order, and that is deliberate. A card's identity has to agree with what
 * approving it will do: TAC-473's Contract makes `guestChannel` on a draft the
 * DRAFT ROW's channel precisely because that is what `dispatchOperatorOutbound`
 * routes on. A guest who holds both identifiers but is on the text channel gets
 * a message at their phone, so showing their Instagram handle on that card
 * would name the wrong destination. It is also what keeps the hand-off's
 * binding constraint true: text cards are unchanged, phone number included.
 *
 * (TAC-486, carrying TAC-474.)
 */

import { type GuestChannel } from '@/lib/api/queue';
import { CARD_COPY } from '@/lib/card-copy';

export type GuestIdentitySource = {
  /** `guestDisplayName` on a draft, `name` on a conversation summary. */
  displayName: string | null;
  instagramUsername: string | null;
  /** `guestPhoneFallback` / `phoneFallback`. `''` when the guest has no phone. */
  phoneFallback: string;
  channel: GuestChannel;
};

export type GuestIdentity = {
  /** What the name line reads. Never empty. */
  name: string;
  /**
   * True when `name` is standing in for a real name (a handle, or the plain
   * fallback). The hand-off sets a handle in its own case with its own
   * tracking, rather than as tracked caps, so the surface needs to know.
   */
  nameIsSubstitute: boolean;
  /** `@handle`, or null for a guest with none. Only ever shown on Instagram. */
  handle: string | null;
  /** The phone to show, or null. Never non-null on an Instagram guest. */
  phone: string | null;
  /** The avatar's letter. Never empty. */
  initial: string;
  channel: GuestChannel;
};

function trimmedOrNull(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** `hana.brews` → `@hana.brews`. The wire never carries the `@`. */
export function formatHandle(username: string): string {
  return `@${username}`;
}

/**
 * The first letter of whatever names the guest, uppercased.
 *
 * Instagram gives us no photo we can cache, so the initial is always the
 * avatar. A handle is used when there is no name, and its leading `@` is
 * skipped: an avatar reading "@" identifies nobody.
 */
function initialFor(name: string): string {
  for (const char of name) {
    if (/[\p{L}\p{N}]/u.test(char)) return char.toUpperCase();
  }
  // A name of nothing but punctuation. Rare enough to not be worth a branch
  // elsewhere, but it must not produce an empty avatar.
  return name.trim().charAt(0) || '?';
}

export function guestIdentity(source: GuestIdentitySource): GuestIdentity {
  const { channel } = source;
  const name = trimmedOrNull(source.displayName);
  const username = trimmedOrNull(source.instagramUsername);
  const phone = trimmedOrNull(source.phoneFallback);

  const isInstagram = channel === 'instagram';
  const handle = isInstagram && username ? formatHandle(username) : null;
  // "The phone number never appears on an Instagram card" (hand-off B2), and
  // "Never show a number for an Instagram guest" (B3).
  const shownPhone = isInstagram ? null : phone;

  const substitute =
    handle ??
    shownPhone ??
    (isInstagram ? CARD_COPY.guestFallback.instagram : CARD_COPY.guestFallback.text);

  const resolved = name ?? substitute;

  return {
    name: resolved,
    nameIsSubstitute: name === null,
    handle,
    phone: shownPhone,
    initial: initialFor(resolved),
    channel,
  };
}

/**
 * The first word of a guest's name, for the sub-queue row's "3 cards for Mia".
 *
 * Falls back to the whole substitute when there is no real name, so the row
 * reads "3 cards for @lena.eats" rather than inventing a first name. A handle
 * is one token, so it is never cut at a dot.
 */
export function guestFirstName(identity: GuestIdentity): string {
  if (identity.nameIsSubstitute) return identity.name;
  return identity.name.split(/\s+/)[0] || identity.name;
}
