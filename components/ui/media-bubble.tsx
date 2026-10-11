import { useEventListener } from 'expo';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { VideoView, useVideoPlayer } from 'expo-video';
import { type ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  type GestureResponderEvent,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showToast } from '@/components/auth/toast';
import { type BubbleSurface } from '@/components/ui/message-bubble';
import { TrackedCaps } from '@/components/ui/tracked-caps';
import { type Attachment, type ThreadMessage } from '@/lib/api/queue';
import { CARD_COPY } from '@/lib/card-copy';
import {
  type PinnedSource,
  formatMediaDuration,
  mediaVariantFor,
  nextPinnedSource,
  pinSource,
  scrubPositionSec,
  shouldRefetchOnLoadError,
  tileHeightFor,
} from '@/lib/media-variant';
import { body as bodyType, card, media, replyWindow, typePresets } from '@/lib/theme';

/**
 * What a guest sent that is not text: photos, GIFs and stickers, videos, voice
 * notes, reel shares and stories. Sits beside `message-bubble.tsx` and follows
 * it: same alignment, same fills, same surfaces. (TAC-583.)
 *
 * One of these per MESSAGE. Several attachments stack in the order the server
 * sent them.
 *
 * Three things shape everything below.
 *
 * 1. WHAT RENDERS IS DECIDED ELSEWHERE. `mediaVariantFor` in
 *    `lib/media-variant.ts` reads `kind` and `status`; this file only switches
 *    on its answer. In particular nothing here reads `mimeType`, which is how a
 *    voice note that arrives as `video/mp4` still gets the audio player.
 *
 * 2. EVERYTHING THAT IS NOT THE MEDIA ITSELF SITS ON A BUBBLE FILL. The share
 *    card, the voice note, and the "Expired" / "Couldn't load" / "can't show"
 *    lines are dark ink on the same fills `MessageBubble` uses. These render
 *    on six different grounds, and Honey holds 4.5:1 for white text only in the
 *    top third of the screen (CLAUDE.md, TAC-364). Text on its own fill never
 *    has to ask which ground it is on.
 *
 * 3. `interactive={false}` IS FOR THE CARDS, AND IT IS NOT OPTIONAL THERE. A
 *    queue card lives inside a `GestureDetector`, where a `Pressable` claims
 *    the touch and kills the pan and the tap composed with it (CLAUDE.md,
 *    TAC-37). So on a card nothing is pressable and no player is mounted: a
 *    photo and a GIF still show, and a voice note or a video is named rather
 *    than played. The takeover is one swipe away and plays them.
 */
type Props = {
  message: ThreadMessage;
  surface?: BubbleSurface;
  /** False on the queue card and the heads-up card. See note 3 above. */
  interactive?: boolean;
  /** Smaller tiles, for the cards' fixed-height conversation region. */
  compact?: boolean;
  /**
   * The clock the variants are decided against. Defaults to the wall clock at
   * render, which is right for a screen and wrong for a test.
   */
  nowMs?: number;
  /**
   * A file failed to load after its signed URL ran out. The screen refetches
   * the thread, which mints fresh URLs. Passed the attachment id so the screen
   * can ask once per attachment rather than once per failure.
   */
  onUrlExpired?: (attachmentId: string) => void;
};

const TAIL_RADIUS = 5;

type Tone = {
  inbound: boolean;
  fill: string;
  ink: string;
  metaInk: string;
  borderWidth: number;
  borderColor: string;
};

/** The same fills, ink and hairline rule as `MessageBubble`. */
function toneFor(direction: ThreadMessage['direction'], surface: BubbleSurface): Tone {
  const inbound = direction === 'inbound';
  const expired = surface === 'expiredCard';
  const onCard = surface === 'card' || expired;
  return {
    inbound,
    fill: expired
      ? inbound
        ? replyWindow.expired.inboundBubble
        : replyWindow.expired.outboundBubble
      : inbound
        ? '#E3DCCE'
        : '#FFFFFF',
    ink: inbound ? '#1C1814' : '#4A4339',
    metaInk: '#4A4339',
    borderWidth: !inbound && onCard ? 1 : 0,
    borderColor: expired ? replyWindow.expired.outboundBorder : 'rgba(28,24,20,0.14)',
  };
}

export function MediaBubble({
  message,
  surface = 'card',
  interactive = true,
  compact = false,
  nowMs,
  onUrlExpired,
}: Props) {
  const tone = toneFor(message.direction, surface);
  const now = nowMs ?? Date.now();
  const attachments = message.attachments ?? [];

  return (
    <View
      testID="media-bubble"
      style={{
        alignSelf: tone.inbound ? 'flex-start' : 'flex-end',
        alignItems: tone.inbound ? 'flex-start' : 'flex-end',
        maxWidth: `${card.bubbleMaxWidthPct}%`,
        gap: card.bubbleGapPx,
      }}
    >
      {attachments.map((attachment, index) => (
        <AttachmentTile
          // NOT keyed on the URL. Every refetch returns a fresh signed URL for
          // every file, and a tile that remounted on each one would stop a
          // playing voice note whenever anything else in the thread changed.
          // The tile decides for itself when to take a new URL up: see
          // `nextPinnedSource`. The index covers an id that didn't parse.
          key={`${attachment.id}:${index}`}
          attachment={attachment}
          tone={tone}
          interactive={interactive}
          compact={compact}
          nowMs={now}
          onUrlExpired={onUrlExpired}
        />
      ))}
      {message.unsupported === true ? (
        <NoteCard tone={tone} text={CARD_COPY.media.unsupported} />
      ) : null}
    </View>
  );
}

type TileProps = {
  attachment: Attachment;
  tone: Tone;
  interactive: boolean;
  compact: boolean;
  nowMs: number;
  onUrlExpired?: (attachmentId: string) => void;
};

function AttachmentTile({
  attachment,
  tone,
  interactive,
  compact,
  nowMs,
  onUrlExpired,
}: TileProps) {
  // The URL this tile is showing, and whether its load failed. Adjusted during
  // render when the latest fetch calls for it, which is React's own pattern
  // for state derived from a prop: no effect, and no frame drawn on the old
  // value.
  const [pinnedState, setPinned] = useState<PinnedSource>(() => pinSource(attachment));
  const pinned = nextPinnedSource(pinnedState, attachment);
  if (pinned !== pinnedState) setPinned(pinned);

  const shown: Attachment = {
    ...attachment,
    url: pinned.url,
    urlExpiresAt: pinned.urlExpiresAt,
  };

  /**
   * Every loader reports failure here.
   *
   * If a newer URL is already in hand, the tile simply moves to it: the pinned
   * one was kept only because it worked. Otherwise, past the URL's expiry the
   * screen is asked for a refetch, and either way the tile reads "Couldn't
   * load" until a newer URL arrives. The clock is read at the moment of
   * failure, not at render: a thread left open for an hour rendered long before
   * its URLs ran out.
   */
  const handleLoadError = (): void => {
    if (attachment.url !== pinned.url) {
      setPinned(pinSource(attachment));
      return;
    }
    if (shouldRefetchOnLoadError(shown, Date.now())) {
      onUrlExpired?.(attachment.id);
    }
    setPinned({ ...pinned, failed: true });
  };

  const variant = mediaVariantFor(shown, nowMs);
  // Remounts the loader or player when, and only when, the tile changes URL.
  const sourceKey = pinned.url ?? '';

  if (pinned.failed) {
    return <NoteCard tone={tone} text={CARD_COPY.media.couldntLoad} />;
  }

  switch (variant.type) {
    case 'loading':
      return <LoadingCard tone={tone} />;
    case 'couldntLoad':
      return <NoteCard tone={tone} text={CARD_COPY.media.couldntLoad} />;
    case 'expired':
      return <NoteCard tone={tone} text={CARD_COPY.media.expired} />;
    case 'unsupported':
      return <NoteCard tone={tone} text={CARD_COPY.media.unsupported} />;
    case 'image':
      return (
        <ImageTile
          key={sourceKey}
          url={variant.url}
          cacheKey={attachment.id}
          label={CARD_COPY.media.spoken.photo}
          interactive={interactive}
          compact={compact}
          onError={handleLoadError}
        />
      );
    case 'gif':
      return (
        <StickerTile
          key={sourceKey}
          url={variant.url}
          cacheKey={attachment.id}
          compact={compact}
          onError={handleLoadError}
        />
      );
    case 'video':
      return interactive ? (
        <VideoTile key={sourceKey} url={variant.url} onError={handleLoadError} />
      ) : (
        <NoteCard tone={tone} text={CARD_COPY.media.video} />
      );
    case 'audio':
      return interactive ? (
        <VoiceNote
          key={sourceKey}
          url={variant.url}
          tone={tone}
          isUrlExpired={() => shouldRefetchOnLoadError(shown, Date.now())}
          onError={handleLoadError}
        />
      ) : (
        <NoteCard tone={tone} text={CARD_COPY.media.voiceNote} />
      );
    case 'story':
      return (
        <StoryTile
          key={sourceKey}
          url={variant.url}
          interactive={interactive}
          compact={compact}
          onError={handleLoadError}
        />
      );
    case 'share':
      return (
        <ShareCard
          title={variant.title}
          linkUrl={variant.linkUrl}
          tone={tone}
          interactive={interactive}
        />
      );
  }
}

/** The bubble shape every non-media tile sits on. */
function BubbleShell({
  tone,
  children,
  width,
  accessibilityLabel,
}: {
  tone: Tone;
  children: ReactNode;
  width?: number;
  accessibilityLabel?: string;
}) {
  return (
    <View
      accessible={accessibilityLabel ? true : undefined}
      accessibilityLabel={accessibilityLabel}
      style={{
        width,
        backgroundColor: tone.fill,
        borderWidth: tone.borderWidth,
        borderColor: tone.borderColor,
        borderRadius: media.radiusPx,
        borderBottomLeftRadius: tone.inbound ? TAIL_RADIUS : media.radiusPx,
        borderBottomRightRadius: tone.inbound ? media.radiusPx : TAIL_RADIUS,
        paddingHorizontal: 13,
        paddingVertical: 9,
      }}
    >
      {children}
    </View>
  );
}

/**
 * One quiet line where media would be: "Expired", "Couldn't load", "Sent
 * something we can't show.", and on a card the name of a thing that can't be
 * played there.
 */
function NoteCard({ tone, text }: { tone: Tone; text: string }) {
  return (
    <BubbleShell tone={tone}>
      <Text
        allowFontScaling={false}
        className="font-inter-tight"
        style={{
          color: tone.metaInk,
          fontSize: bodyType.bubble.size,
          lineHeight: bodyType.bubble.lineHeight,
        }}
      >
        {text}
      </Text>
    </BubbleShell>
  );
}

/** Re-hosting hasn't settled. Deliberately wordless: it is seconds long. */
function LoadingCard({ tone }: { tone: Tone }) {
  return (
    <BubbleShell tone={tone} accessibilityLabel={CARD_COPY.media.spoken.loading}>
      <View
        style={{
          height: bodyType.bubble.lineHeight,
          minWidth: 44,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator size="small" color={tone.metaInk} />
      </View>
    </BubbleShell>
  );
}

/**
 * An image source whose disk cache is keyed on the attachment, so a photo
 * already seen survives its signed URL being replaced. An id that didn't parse
 * is the empty string, and two files must never share a cache entry, so it
 * falls back to the URL's own key.
 */
function cachedSource(url: string, cacheKey: string | undefined) {
  return cacheKey ? { uri: url, cacheKey } : { uri: url };
}

const ASPECT_BOUNDS = {
  minAspect: media.minAspect,
  maxAspect: media.maxAspect,
  defaultAspect: media.defaultAspect,
};

/** A photo, or a live story's frame. Opens full screen on tap when it can. */
function ImageTile({
  url,
  cacheKey,
  label,
  interactive,
  compact,
  onError,
}: {
  url: string;
  /**
   * Keys the disk cache on the attachment rather than on the URL, so a photo
   * already seen survives its signed URL being replaced. Absent for a story,
   * which is not cached at all.
   */
  cacheKey?: string;
  label: string;
  interactive: boolean;
  compact: boolean;
  onError: () => void;
}) {
  const [aspect, setAspect] = useState<number>(media.defaultAspect);
  const [open, setOpen] = useState(false);
  const width = compact ? media.compactTileWidthPx : media.tileWidthPx;
  const source = cachedSource(url, cacheKey);

  const image = (
    <Image
      testID="media-image"
      source={source}
      // No `cacheKey` means a story, which is never written to disk: Meta
      // forbids storing them, and it must not be drawable after it expires.
      cachePolicy={cacheKey ? 'disk' : 'none'}
      accessibilityLabel={label}
      contentFit="cover"
      transition={120}
      onLoad={(event) => {
        const { width: w, height: h } = event.source;
        if (w > 0 && h > 0) setAspect(w / h);
      }}
      onError={onError}
      style={{
        width,
        height: tileHeightFor(width, aspect, ASPECT_BOUNDS),
        borderRadius: media.radiusPx,
        backgroundColor: 'rgba(28,24,20,0.12)',
      }}
    />
  );

  if (!interactive) return image;

  return (
    <>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={label}
        onPress={() => setOpen(true)}
        // Object form, per the CLAUDE.md Pressable gotcha. Nothing structural
        // is at stake here, but there is no press feedback worth the risk.
        style={{ borderRadius: media.radiusPx }}
      >
        {image}
      </Pressable>
      {open ? (
        <FullScreenImage source={source} label={label} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function FullScreenImage({
  source,
  label,
  onClose,
}: {
  source: { uri: string; cacheKey?: string };
  label: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* The whole screen closes it: with one photo and nothing else to do,
          anywhere is the obvious place to tap. The mark top right is the
          visible affordance and is part of the same target. */}
      <Pressable
        testID="media-fullscreen"
        accessibilityRole="button"
        accessibilityLabel={CARD_COPY.media.spoken.closePhoto}
        onPress={onClose}
        style={{ flex: 1, backgroundColor: '#000000' }}
      >
        <Image
          source={source}
          accessibilityLabel={label}
          contentFit="contain"
          style={{ flex: 1 }}
        />
        <Text
          allowFontScaling={false}
          accessible={false}
          style={{
            position: 'absolute',
            top: insets.top + 12,
            right: 20,
            fontSize: 22,
            lineHeight: 26,
            color: '#FFFFFF',
          }}
        >
          ✕
        </Text>
      </Pressable>
    </Modal>
  );
}

/**
 * A GIF or a sticker. Animates in place, is never cropped, and has no frame:
 * a sticker on a grey tile stops being a sticker. Nothing to open, so it is
 * the same on a card as in a thread.
 */
function StickerTile({
  url,
  cacheKey,
  compact,
  onError,
}: {
  url: string;
  cacheKey: string;
  compact: boolean;
  onError: () => void;
}) {
  const size = compact ? media.compactStickerSizePx : media.stickerSizePx;
  return (
    <Image
      testID="media-gif"
      source={cachedSource(url, cacheKey)}
      accessibilityLabel={CARD_COPY.media.spoken.gif}
      contentFit="contain"
      autoplay
      onError={onError}
      style={{ width: size, height: size }}
    />
  );
}

/**
 * A video, on the platform's own controls: play, scrub and full screen come
 * with them. Not started; the player holding its first frame is the poster.
 */
function VideoTile({ url, onError }: { url: string; onError: () => void }) {
  const player = useVideoPlayer(url);
  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'error') onError();
  });
  const width = media.tileWidthPx;
  return (
    <VideoView
      testID="media-video"
      player={player}
      nativeControls
      contentFit="contain"
      style={{
        width,
        height: tileHeightFor(width, media.minAspect, ASPECT_BOUNDS),
        borderRadius: media.radiusPx,
        backgroundColor: '#000000',
        overflow: 'hidden',
      }}
    />
  );
}

/**
 * A story mention or reply while the story is still up.
 *
 * Meta's link says nothing about whether the story is a photo or a video, and
 * the attachment's `mimeType` is null (checked on production, 2026-10-11). So
 * it is tried as a photo first and, if that fails, as a video. Only when both
 * fail does the tile report a load error.
 *
 * No `cacheKey`, which also turns the disk cache off for it.
 */
function StoryTile({
  url,
  interactive,
  compact,
  onError,
}: {
  url: string;
  interactive: boolean;
  compact: boolean;
  onError: () => void;
}) {
  const [asVideo, setAsVideo] = useState(false);
  if (asVideo) {
    return <VideoTile url={url} onError={onError} />;
  }
  return (
    <ImageTile
      url={url}
      label={CARD_COPY.media.spoken.story}
      interactive={interactive}
      compact={compact}
      // A card mounts no player (see the note on `interactive`), so there the
      // photo attempt is the only one.
      onError={interactive ? () => setAsVideo(true) : onError}
    />
  );
}

/**
 * A voice note: play or pause, a scrubber, and how long it is.
 *
 * Rendered for `kind: "audio"` whatever the file's MIME type. The player is
 * AVPlayer underneath, which plays the audio track of an `video/mp4` file as
 * readily as an `audio/mp4` one.
 */
function VoiceNote({
  url,
  tone,
  isUrlExpired,
  onError,
}: {
  url: string;
  tone: Tone;
  isUrlExpired: () => boolean;
  onError: () => void;
}) {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  const [trackWidth, setTrackWidth] = useState(0);

  const duration = Number.isFinite(status.duration) ? status.duration : 0;
  const position = Math.min(status.currentTime, duration || status.currentTime);
  const fraction = duration > 0 ? Math.min(1, position / duration) : 0;

  const handleToggle = (): void => {
    if (status.playing) {
      player.pause();
      return;
    }
    // A note that never loaded and whose URL has since run out will never
    // play. There is no error event to wait for, so it is caught at the tap:
    // the tile reports the failure and the screen refetches.
    if (!status.isLoaded && isUrlExpired()) {
      onError();
      return;
    }
    // The ringer switch must not mute a guest's voice note. An operator's
    // phone is on silent for most of a shift. Fire and forget: if it fails the
    // note still plays wherever the system would have played it anyway.
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    // At the end, play means play again.
    if (duration > 0 && position >= duration - 0.05) {
      void player.seekTo(0);
    }
    player.play();
  };

  const seekFromTouch = (event: GestureResponderEvent): void => {
    if (duration <= 0) return;
    void player.seekTo(
      scrubPositionSec(event.nativeEvent.locationX, trackWidth, duration),
    );
  };

  const step = media.audio.accessibilityStepSec;

  return (
    <BubbleShell tone={tone} width={media.audio.widthPx}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            status.playing
              ? CARD_COPY.media.spoken.pauseVoiceNote
              : CARD_COPY.media.spoken.playVoiceNote
          }
          onPress={handleToggle}
          hitSlop={10}
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: tone.ink,
          }}
        >
          <PlayPauseGlyph playing={status.playing} color={tone.fill} />
        </Pressable>

        {/* The scrubber. Plain responder props rather than a gesture handler
            or a slider package: one small control, no new dependency. Its
            children take no touches, so `locationX` is always measured from
            this view's own left edge, and it refuses to hand the touch to the
            thread's ScrollView once a drag has started. */}
        <View
          testID="voice-note-scrubber"
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={CARD_COPY.media.spoken.voiceNotePosition}
          accessibilityValue={{
            min: 0,
            max: Math.round(duration),
            now: Math.round(position),
            text: `${formatMediaDuration(position)} of ${formatMediaDuration(duration)}`,
          }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) => {
            if (duration <= 0) return;
            const delta = event.nativeEvent.actionName === 'increment' ? step : -step;
            void player.seekTo(Math.min(duration, Math.max(0, position + delta)));
          }}
          onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          onResponderGrant={seekFromTouch}
          onResponderMove={seekFromTouch}
          style={{
            flex: 1,
            height: media.audio.scrubHeightPx,
            justifyContent: 'center',
          }}
        >
          <View
            pointerEvents="none"
            style={{
              height: media.audio.trackHeightPx,
              borderRadius: media.audio.trackHeightPx,
              backgroundColor: 'rgba(28,24,20,0.2)',
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              width: `${fraction * 100}%`,
              height: media.audio.trackHeightPx,
              borderRadius: media.audio.trackHeightPx,
              backgroundColor: tone.ink,
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: Math.max(0, fraction * trackWidth - media.audio.thumbSizePx / 2),
              width: media.audio.thumbSizePx,
              height: media.audio.thumbSizePx,
              borderRadius: media.audio.thumbSizePx,
              backgroundColor: tone.ink,
            }}
          />
        </View>

        {/* Counts up while it plays and shows the length at rest, the way a
            voice note reads everywhere else. Blank until the length is known:
            "0:00" would be a claim about a file that hasn't loaded. */}
        <Text
          allowFontScaling={false}
          accessible={false}
          className="font-inter-tight"
          style={{
            minWidth: 30,
            textAlign: 'right',
            fontSize: bodyType.preview.size,
            lineHeight: bodyType.preview.lineHeight,
            color: tone.metaInk,
            fontVariant: ['tabular-nums'],
          }}
        >
          {duration > 0
            ? formatMediaDuration(status.playing || position > 0 ? position : duration)
            : ''}
        </Text>
      </View>
    </BubbleShell>
  );
}

/** Drawn from views, so it needs no icon font and no SVG. */
function PlayPauseGlyph({ playing, color }: { playing: boolean; color: string }) {
  if (playing) {
    return (
      <View style={{ flexDirection: 'row', gap: 3 }}>
        <View style={{ width: 3, height: 11, borderRadius: 1, backgroundColor: color }} />
        <View style={{ width: 3, height: 11, borderRadius: 1, backgroundColor: color }} />
      </View>
    );
  }
  return (
    <View
      style={{
        marginLeft: 2,
        width: 0,
        height: 0,
        borderTopWidth: 6,
        borderBottomWidth: 6,
        borderLeftWidth: 10,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        borderLeftColor: color,
      }}
    />
  );
}

/**
 * A reel or post share: the caption, and a way out to Instagram. There is no
 * thumbnail to show, because Meta sends none.
 */
function ShareCard({
  title,
  linkUrl,
  tone,
  interactive,
}: {
  title: string | null;
  linkUrl: string;
  tone: Tone;
  interactive: boolean;
}) {
  const caption = title?.trim() ?? '';
  const link = (
    <TrackedCaps
      {...typePresets.link}
      color={tone.ink}
      decorative={interactive}
      style={{ textDecorationLine: 'underline' }}
    >
      {CARD_COPY.media.openInInstagram}
    </TrackedCaps>
  );

  return (
    <BubbleShell tone={tone}>
      {caption.length > 0 ? (
        <Text
          allowFontScaling={false}
          className="font-inter-tight"
          numberOfLines={3}
          style={{
            marginBottom: 7,
            color: tone.ink,
            fontSize: bodyType.bubble.size,
            lineHeight: bodyType.bubble.lineHeight,
          }}
        >
          {caption}
        </Text>
      ) : null}
      {interactive ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={CARD_COPY.media.openInInstagram}
          hitSlop={10}
          onPress={() => {
            // An event handler is an outer boundary, so the failure is caught
            // here and told to the operator rather than thrown.
            void (async () => {
              try {
                await Linking.openURL(linkUrl);
              } catch {
                showToast(CARD_COPY.media.openFailed);
              }
            })();
          }}
          style={{ alignSelf: 'flex-start' }}
        >
          {link}
        </Pressable>
      ) : (
        link
      )}
    </BubbleShell>
  );
}
