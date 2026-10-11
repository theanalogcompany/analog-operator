import { type Attachment } from '@/lib/api/queue';
import {
  formatMediaDuration,
  isPastUrlExpiry,
  mediaVariantFor,
  nextPinnedSource,
  pinSource,
  scrubPositionSec,
  shouldRefetchOnLoadError,
  tileHeightFor,
} from '@/lib/media-variant';

/**
 * The attachment shapes here are TAC-582's `## Contract` examples, transcribed,
 * with ids and the storage path filled in where the Contract elides them. The
 * expected variants come from TAC-583's "User-facing behavior" list, not from
 * the function under test.
 */
const SENT_AT = Date.parse('2026-10-11T17:12:33.000Z');
const NOW = SENT_AT + 5 * 60_000;

const CONTRACT_IMAGE: Attachment = {
  id: 'a1',
  kind: 'image',
  status: 'ready',
  url: 'https://project.supabase.co/storage/v1/object/sign/guest-media/v/g/m/a1',
  urlExpiresAt: '2026-10-11T18:12:33.000Z',
  mimeType: 'image/jpeg',
  title: null,
  linkUrl: null,
};

const CONTRACT_GIF: Attachment = {
  id: 'a2',
  kind: 'gif',
  status: 'ready',
  url: 'https://media3.giphy.com/media/abc/200.gif',
  urlExpiresAt: null,
  mimeType: 'image/gif',
  title: null,
  linkUrl: null,
};

const CONTRACT_SHARE: Attachment = {
  id: 'a3',
  kind: 'share',
  status: 'link_only',
  url: null,
  urlExpiresAt: null,
  mimeType: null,
  title: 'the amount of times we lost him was crazy 😂',
  linkUrl: 'https://www.instagram.com/reel/DcPVXR9vbun/',
};

// Contract, story kinds: "while live, `status: "link_only"`, `url` = Meta's
// link, `urlExpiresAt` = sent time + 24 h, `linkUrl: null`."
const LIVE_STORY: Attachment = {
  id: 'a4',
  kind: 'story_mention',
  status: 'link_only',
  url: 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1',
  urlExpiresAt: new Date(SENT_AT + 24 * 60 * 60_000).toISOString(),
  mimeType: null,
  title: null,
  linkUrl: null,
};

// "Afterwards `status: "expired"`, `url: null`, `urlExpiresAt: null`."
const EXPIRED_STORY: Attachment = {
  ...LIVE_STORY,
  status: 'expired',
  url: null,
  urlExpiresAt: null,
};

describe('mediaVariantFor', () => {
  describe('the Contract examples', () => {
    it('an image shows inline', () => {
      expect(mediaVariantFor(CONTRACT_IMAGE, NOW)).toEqual({
        type: 'image',
        url: CONTRACT_IMAGE.url,
      });
    });

    it('a GIF animates inline', () => {
      expect(mediaVariantFor(CONTRACT_GIF, NOW)).toEqual({
        type: 'gif',
        url: CONTRACT_GIF.url,
      });
    });

    it('a reel share is a card with the caption and the link out', () => {
      expect(mediaVariantFor(CONTRACT_SHARE, NOW)).toEqual({
        type: 'share',
        title: 'the amount of times we lost him was crazy 😂',
        linkUrl: 'https://www.instagram.com/reel/DcPVXR9vbun/',
      });
    });
  });

  /**
   * The rule Jaipal added on 2026-10-11: "choose the player by `kind`, never
   * by `mimeType`. Instagram voice notes arrive with mimeType "video/mp4" but
   * kind "audio". They must render as an audio player."
   *
   * The first case is the production row. The rest make the same point from
   * every side, so a renderer that consults `mimeType` at all fails here
   * whichever way it leans.
   */
  describe('the player follows kind, never mimeType', () => {
    const ready = (kind: Attachment['kind'], mimeType: string | null): Attachment => ({
      ...CONTRACT_IMAGE,
      kind,
      mimeType,
    });

    it('a voice note whose file is video/mp4 is still a voice note', () => {
      expect(mediaVariantFor(ready('audio', 'video/mp4'), NOW).type).toBe('audio');
    });

    it.each([
      ['audio', 'video/mp4', 'audio'],
      ['audio', 'audio/mp4', 'audio'],
      ['audio', null, 'audio'],
      ['audio', 'image/jpeg', 'audio'],
      ['video', 'audio/mp4', 'video'],
      ['video', 'video/mp4', 'video'],
      ['video', null, 'video'],
      ['image', 'video/mp4', 'image'],
      ['image', 'image/gif', 'image'],
      ['gif', 'video/mp4', 'gif'],
      ['gif', 'image/jpeg', 'gif'],
    ] as const)('kind %p with mimeType %p renders as %p', (kind, mimeType, expected) => {
      expect(mediaVariantFor(ready(kind, mimeType), NOW).type).toBe(expected);
    });

    it('gives the same answer for every mimeType, on every kind and status', () => {
      const kinds: Attachment['kind'][] = [
        'image', 'gif', 'video', 'audio', 'file', 'share',
        'story_mention', 'story_reply', 'unknown',
      ];
      const statuses: Attachment['status'][] = [
        'ready', 'pending', 'link_only', 'expired', 'failed',
      ];
      const mimeTypes = [null, 'video/mp4', 'audio/mp4', 'image/jpeg', 'image/gif', 'x/y'];
      for (const kind of kinds) {
        for (const status of statuses) {
          const base: Attachment = {
            ...CONTRACT_IMAGE,
            kind,
            status,
            linkUrl: 'https://www.instagram.com/reel/x/',
          };
          const answers = mimeTypes.map((mimeType) =>
            JSON.stringify(mediaVariantFor({ ...base, mimeType }, NOW)),
          );
          expect(new Set(answers).size).toBe(1);
        }
      }
    });
  });

  describe('status decides before kind does', () => {
    it.each(['image', 'gif', 'video', 'audio', 'file', 'share', 'story_reply'] as const)(
      'a pending %s is the loading state',
      (kind) => {
        expect(
          mediaVariantFor({ ...CONTRACT_IMAGE, kind, status: 'pending', url: null }, NOW),
        ).toEqual({ type: 'loading' });
      },
    );

    it.each(['image', 'gif', 'video', 'audio', 'file', 'share', 'story_reply'] as const)(
      'a failed %s reads "couldn\'t load"',
      (kind) => {
        expect(
          mediaVariantFor({ ...CONTRACT_IMAGE, kind, status: 'failed', url: null }, NOW),
        ).toEqual({ type: 'couldntLoad' });
      },
    );

    it('expired reads "expired" on a kind the Contract never pairs it with', () => {
      expect(
        mediaVariantFor({ ...CONTRACT_IMAGE, status: 'expired', url: null }, NOW),
      ).toEqual({ type: 'expired' });
    });
  });

  describe('stories', () => {
    it('a live story mention shows the story', () => {
      expect(mediaVariantFor(LIVE_STORY, NOW)).toEqual({
        type: 'story',
        url: LIVE_STORY.url,
      });
    });

    it('a live story reply shows the story too', () => {
      expect(mediaVariantFor({ ...LIVE_STORY, kind: 'story_reply' }, NOW).type).toBe(
        'story',
      );
    });

    it('an expired story is the "Expired" placeholder', () => {
      expect(mediaVariantFor(EXPIRED_STORY, NOW)).toEqual({ type: 'expired' });
    });

    it('reads as expired once the device clock passes urlExpiresAt, before any refetch says so', () => {
      const justBefore = SENT_AT + 24 * 60 * 60_000 - 1;
      const atExpiry = SENT_AT + 24 * 60 * 60_000;
      expect(mediaVariantFor(LIVE_STORY, justBefore).type).toBe('story');
      expect(mediaVariantFor(LIVE_STORY, atExpiry)).toEqual({ type: 'expired' });
    });

    it('a story with no url has nothing to show, whatever its status says', () => {
      expect(mediaVariantFor({ ...LIVE_STORY, url: null }, NOW)).toEqual({
        type: 'expired',
      });
    });
  });

  describe('where the Contract is silent', () => {
    it('file and unknown are the "can\'t show" card', () => {
      expect(mediaVariantFor({ ...CONTRACT_IMAGE, kind: 'file' }, NOW)).toEqual({
        type: 'unsupported',
      });
      expect(mediaVariantFor({ ...CONTRACT_IMAGE, kind: 'unknown' }, NOW)).toEqual({
        type: 'unsupported',
      });
    });

    it('ready with no url cannot be loaded, and says so', () => {
      expect(mediaVariantFor({ ...CONTRACT_IMAGE, url: null }, NOW)).toEqual({
        type: 'couldntLoad',
      });
    });

    it('link_only on a non-share kind is the share card when there is a link', () => {
      expect(
        mediaVariantFor(
          { ...CONTRACT_SHARE, kind: 'video', title: null },
          NOW,
        ),
      ).toEqual({
        type: 'share',
        title: null,
        linkUrl: CONTRACT_SHARE.linkUrl,
      });
    });

    it('link_only with no link is the "can\'t show" card', () => {
      expect(mediaVariantFor({ ...CONTRACT_SHARE, linkUrl: null }, NOW)).toEqual({
        type: 'unsupported',
      });
    });

    it('a share never tries to load its url as media', () => {
      const variant = mediaVariantFor(
        { ...CONTRACT_SHARE, status: 'ready', url: 'https://example.test/x.mp4' },
        NOW,
      );
      expect(variant.type).toBe('share');
    });
  });
});

describe('isPastUrlExpiry / shouldRefetchOnLoadError', () => {
  const expiry = Date.parse('2026-10-11T18:12:33.000Z');

  it('is false before the expiry and true from it', () => {
    expect(isPastUrlExpiry(CONTRACT_IMAGE, expiry - 1)).toBe(false);
    expect(isPastUrlExpiry(CONTRACT_IMAGE, expiry)).toBe(true);
    expect(isPastUrlExpiry(CONTRACT_IMAGE, expiry + 60 * 60_000)).toBe(true);
  });

  it('a url with no expiry is never past it', () => {
    expect(isPastUrlExpiry(CONTRACT_GIF, expiry + 365 * 24 * 60 * 60_000)).toBe(false);
  });

  it('an unreadable expiry is not treated as expired', () => {
    expect(
      isPastUrlExpiry({ ...CONTRACT_IMAGE, urlExpiresAt: 'soon' }, expiry + 1),
    ).toBe(false);
  });

  // "On a load error past `urlExpiresAt`, refetch once." (TAC-583.)
  it('asks for a refetch only when the load failed after the url ran out', () => {
    expect(shouldRefetchOnLoadError(CONTRACT_IMAGE, expiry + 1)).toBe(true);
    // A failure on a url that should still be good is a real failure.
    expect(shouldRefetchOnLoadError(CONTRACT_IMAGE, expiry - 1)).toBe(false);
    // A Giphy url never expires, so a failure there never refetches.
    expect(shouldRefetchOnLoadError(CONTRACT_GIF, expiry + 1)).toBe(false);
  });
});

describe('formatMediaDuration', () => {
  it.each([
    [0, '0:00'],
    [7, '0:07'],
    [7.9, '0:07'],
    [59, '0:59'],
    [60, '1:00'],
    [83, '1:23'],
    [725, '12:05'],
  ])('%p seconds reads %p', (seconds, expected) => {
    expect(formatMediaDuration(seconds)).toBe(expected);
  });

  it('reads 0:00 for a length that is not a number yet', () => {
    expect(formatMediaDuration(Number.NaN)).toBe('0:00');
    expect(formatMediaDuration(Number.POSITIVE_INFINITY)).toBe('0:00');
    expect(formatMediaDuration(-3)).toBe('0:00');
  });
});

describe('scrubPositionSec', () => {
  it('maps a touch to its share of the note', () => {
    expect(scrubPositionSec(0, 200, 10)).toBe(0);
    expect(scrubPositionSec(50, 200, 10)).toBe(2.5);
    expect(scrubPositionSec(200, 200, 10)).toBe(10);
  });

  it('clamps a drag that runs off either end of the track', () => {
    expect(scrubPositionSec(-40, 200, 10)).toBe(0);
    expect(scrubPositionSec(260, 200, 10)).toBe(10);
  });

  it('is zero until both the track and the length are known', () => {
    expect(scrubPositionSec(50, 0, 10)).toBe(0);
    expect(scrubPositionSec(50, 200, 0)).toBe(0);
    expect(scrubPositionSec(50, 200, Number.NaN)).toBe(0);
  });
});

describe('tileHeightFor', () => {
  const bounds = { minAspect: 0.72, maxAspect: 1.9, defaultAspect: 1 };

  it('follows the media\'s own shape inside the range', () => {
    expect(tileHeightFor(220, 1, bounds)).toBe(220);
    expect(tileHeightFor(220, 1.5, bounds)).toBe(147);
  });

  it('stops a tall screenshot at the tallest allowed tile', () => {
    expect(tileHeightFor(220, 0.46, bounds)).toBe(Math.round(220 / 0.72));
  });

  it('stops a panorama at the shortest allowed tile', () => {
    expect(tileHeightFor(220, 4, bounds)).toBe(Math.round(220 / 1.9));
  });

  it('falls back to the default shape when the file reports none', () => {
    expect(tileHeightFor(220, 0, bounds)).toBe(220);
    expect(tileHeightFor(220, Number.NaN, bounds)).toBe(220);
  });
});

/**
 * Which URL a tile shows. Every thread fetch returns a fresh signed URL for
 * every re-hosted file, so "follow the newest" would rebuild every player in
 * the thread whenever anything in it changed.
 */
describe('nextPinnedSource', () => {
  const first = { url: 'https://project.supabase.co/first', urlExpiresAt: '2026-10-11T18:00:00.000Z' };
  const second = { url: 'https://project.supabase.co/second', urlExpiresAt: '2026-10-11T19:00:00.000Z' };

  it('keeps a working URL when a refetch brings a newer one', () => {
    const pinned = pinSource(first);
    expect(nextPinnedSource(pinned, second)).toBe(pinned);
  });

  it('keeps the pinned URL\'s OWN expiry, so a later failure is judged against it', () => {
    const pinned = pinSource(first);
    expect(nextPinnedSource(pinned, second).urlExpiresAt).toBe(first.urlExpiresAt);
  });

  it('takes the newer URL once the pinned load has failed, and clears the failure', () => {
    const failed = { ...pinSource(first), failed: true };
    expect(nextPinnedSource(failed, second)).toEqual({ ...second, failed: false });
  });

  it('stays failed while no newer URL has arrived', () => {
    const failed = { ...pinSource(first), failed: true };
    expect(nextPinnedSource(failed, first)).toBe(failed);
  });

  it('takes a URL up when there was none: pending becoming ready', () => {
    const pending = pinSource({ url: null, urlExpiresAt: null });
    expect(nextPinnedSource(pending, first)).toEqual({ ...first, failed: false });
  });

  it('lets go when the server stops sending one: a story expiring', () => {
    const pinned = pinSource(first);
    expect(nextPinnedSource(pinned, { url: null, urlExpiresAt: null })).toEqual({
      url: null,
      urlExpiresAt: null,
      failed: false,
    });
  });
});
