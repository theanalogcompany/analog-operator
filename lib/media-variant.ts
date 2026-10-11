import { type Attachment } from '@/lib/api/queue';

/**
 * What one attachment renders as. (TAC-583; shapes from TAC-582's Contract.)
 *
 * The one place `kind` and `status` are read together, so the component under
 * `components/ui/media-bubble.tsx` only switches on the answer. Pure and
 * exported for the usual reason (TAC-312): the decision is testable against the
 * Contract's own JSON without mounting a player.
 */
export type MediaVariant =
  | { type: 'image'; url: string }
  | { type: 'gif'; url: string }
  | { type: 'video'; url: string }
  | { type: 'audio'; url: string }
  /** A reel or post share: the caption and a link out. */
  | { type: 'share'; title: string | null; linkUrl: string }
  /** A story mention or story reply while the story is still up. */
  | { type: 'story'; url: string }
  | { type: 'expired' }
  /** Re-hosting hasn't settled yet. An UPDATE on the live channel follows. */
  | { type: 'loading' }
  | { type: 'couldntLoad' }
  | { type: 'unsupported' };

function isStory(attachment: Attachment): boolean {
  return attachment.kind === 'story_mention' || attachment.kind === 'story_reply';
}

/**
 * Whether the attachment's URL has run out, by this device's clock.
 *
 * `urlExpiresAt: null` means the URL has no expiry (a Giphy GIF) or there is no
 * URL, and is never past. An unparseable timestamp is treated the same way:
 * guessing "expired" would hide media that may be perfectly loadable.
 */
export function isPastUrlExpiry(attachment: Attachment, nowMs: number): boolean {
  if (attachment.urlExpiresAt === null) return false;
  const expiresMs = Date.parse(attachment.urlExpiresAt);
  if (Number.isNaN(expiresMs)) return false;
  return nowMs >= expiresMs;
}

/**
 * Maps `kind` x `status` to a render variant.
 *
 * **The player is chosen by `kind`, never by `mimeType`.** An Instagram voice
 * note is `kind: "audio"` with `mimeType: "video/mp4"`. It is a voice note and
 * renders as one, with a duration and a scrubber. `mimeType` is not read
 * anywhere in this function, and `__tests__/lib/media-variant.test.ts` pins
 * that with the production shape.
 *
 * Status is read before kind, because a status that means "there is nothing to
 * show" means it for every kind:
 *
 * - `pending` is a quiet loading state, `failed` is "Couldn't load", and
 *   `expired` is "Expired". The Contract only describes `expired` on story
 *   kinds; on any other kind it reads the same way rather than inventing a
 *   second behaviour.
 * - A live story (`link_only`, `url` = Meta's link, `urlExpiresAt` = sent time
 *   + 24 h) shows the story. Once this device's clock passes `urlExpiresAt` it
 *   reads "Expired" without waiting for a refetch to say so, because Meta's
 *   link is dead from that moment whatever the last response said.
 * - `link_only` with a `linkUrl` is the share card. Without one there is
 *   nothing to show and nowhere to send the operator, so it is the "can't
 *   show" card.
 * - `ready` with no `url` is a state the Contract is silent on. It cannot be
 *   loaded, so it says so.
 * - `file` and `unknown` have no rendering in the ticket and fall to the
 *   "can't show" card, which the ticket defines as the fallback.
 */
export function mediaVariantFor(attachment: Attachment, nowMs: number): MediaVariant {
  if (attachment.status === 'pending') return { type: 'loading' };
  if (attachment.status === 'failed') return { type: 'couldntLoad' };
  if (attachment.status === 'expired') return { type: 'expired' };

  if (isStory(attachment)) {
    if (attachment.url === null) return { type: 'expired' };
    if (isPastUrlExpiry(attachment, nowMs)) return { type: 'expired' };
    return { type: 'story', url: attachment.url };
  }

  if (attachment.status === 'link_only' || attachment.kind === 'share') {
    if (attachment.linkUrl === null) return { type: 'unsupported' };
    return { type: 'share', title: attachment.title, linkUrl: attachment.linkUrl };
  }

  // status === 'ready' from here on.
  if (attachment.kind === 'file' || attachment.kind === 'unknown') {
    return { type: 'unsupported' };
  }
  if (attachment.url === null) return { type: 'couldntLoad' };

  switch (attachment.kind) {
    case 'image':
      return { type: 'image', url: attachment.url };
    case 'gif':
      return { type: 'gif', url: attachment.url };
    case 'video':
      return { type: 'video', url: attachment.url };
    case 'audio':
      return { type: 'audio', url: attachment.url };
    default:
      return { type: 'unsupported' };
  }
}

/**
 * Whether a media load error is worth a thread refetch.
 *
 * A re-hosted file's signed URL lasts an hour, so on a thread left open longer
 * than that the first scroll to an image, or the first tap on a voice note,
 * fails. A refetch mints fresh URLs. Only an error PAST the expiry asks for
 * one: an error on a URL that should still be good is a real failure, and
 * refetching for it would loop on a file that is simply broken.
 */
export function shouldRefetchOnLoadError(
  attachment: Attachment,
  nowMs: number,
): boolean {
  return isPastUrlExpiry(attachment, nowMs);
}

/** "0:07", "1:23", "12:05". A voice note's length, and its position. */
export function formatMediaDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

/**
 * Where in a voice note a touch on the scrubber lands, in seconds.
 *
 * Clamped at both ends: a drag that runs off the track is still a drag, and a
 * seek past the end would stop the note where a seek to the end would not.
 * Zero when the track hasn't been measured or the length isn't known yet,
 * because a position computed from either would be noise.
 */
export function scrubPositionSec(
  locationX: number,
  trackWidth: number,
  durationSec: number,
): number {
  if (trackWidth <= 0 || !Number.isFinite(durationSec) || durationSec <= 0) return 0;
  const fraction = Math.min(1, Math.max(0, locationX / trackWidth));
  return fraction * durationSec;
}

/**
 * A tile's height for a given width, from the media's own shape held inside
 * the allowed range. `aspect` is width / height; anything unusable (zero, NaN,
 * a file that reported no size) takes the fallback.
 */
export function tileHeightFor(
  widthPx: number,
  aspect: number,
  bounds: { minAspect: number; maxAspect: number; defaultAspect: number },
): number {
  const usable = Number.isFinite(aspect) && aspect > 0 ? aspect : bounds.defaultAspect;
  const clamped = Math.min(bounds.maxAspect, Math.max(bounds.minAspect, usable));
  return Math.round(widthPx / clamped);
}

/**
 * The URL a tile is actually showing, which is not always the newest one.
 *
 * Every thread fetch mints a fresh signed URL for every re-hosted file, not
 * just for the one that changed. If a tile followed its prop, each refetch
 * would rebuild every player in the thread: a guest sending a second photo
 * would stop the voice note the operator was listening to and close the photo
 * they had open. So a tile PINS the URL it started with and keeps it for as
 * long as it works.
 */
export type PinnedSource = {
  url: string | null;
  /** The pinned URL's own expiry, not the newest one's. */
  urlExpiresAt: string | null;
  failed: boolean;
};

export function pinSource(
  attachment: Pick<Attachment, 'url' | 'urlExpiresAt'>,
): PinnedSource {
  return { url: attachment.url, urlExpiresAt: attachment.urlExpiresAt, failed: false };
}

/**
 * What a tile should be showing, given what it has pinned and what the latest
 * fetch says. Returns `pinned` itself when nothing changes, so a caller can
 * compare by identity.
 *
 * A newer URL is taken up in exactly three cases, and never while the pinned
 * one is working:
 *
 * - the pinned load FAILED, which is the whole point of refetching;
 * - there was no URL yet, which is `pending` becoming `ready`;
 * - the server now sends none, which is a story expiring. There is nothing
 *   left to protect, and holding the old link would keep showing a story the
 *   server has withdrawn.
 */
export function nextPinnedSource(
  pinned: PinnedSource,
  attachment: Pick<Attachment, 'url' | 'urlExpiresAt'>,
): PinnedSource {
  if (attachment.url === pinned.url) return pinned;
  if (pinned.failed || pinned.url === null || attachment.url === null) {
    return pinSource(attachment);
  }
  return pinned;
}
