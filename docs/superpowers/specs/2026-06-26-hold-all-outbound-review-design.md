# Hold-all-outbound review (per-venue) — design

**Date:** 2026-06-26
**Status:** Design approved, pending spec review
**Repos:** `analog-guest` (the build) ↔ `analog-operator` (no code; UAT only)

## Problem

For a specific venue, the operator wants to review **every** guest-facing outbound
message before it ships. Today the operator app already holds AI-drafted *replies*
for approval (the queue → approve / edit / skip flow), but **proactive / follow-up /
automated** messages still auto-send without review. The goal is to close that gap on
a per-venue basis.

## Key realization

The decision of "hold this message vs. auto-send it" lives entirely in
`analog-guest`'s send path. The operator app only ever renders what the server places
in the queue. Therefore this feature is **almost entirely an `analog-guest` change**.

The operator app needs **zero code changes**, verified against the current code:

- `lib/api/queue.ts::PendingDraftSchema` already parses any draft the server returns.
- `components/queue/queue-card.tsx:82` already guards empty conversation context
  (`thread.length > 0 ? (…) : null`), so a held proactive message with no triggering
  inbound renders cleanly as guest name + draft body + approve/edit/skip buttons.
- `lib/realtime/queue-channel.ts` already subscribes to `messages` rows filtered by
  `venue_id` and reloads the queue on any outbound change — a newly-held proactive
  message flows in for free.
- The existing approve / edit / skip endpoints already send a held message; a held
  proactive message is sent the same way a held reply is.

## Decisions

1. **Trigger:** a single boolean column on the venue record, server-side. No operator-app
   settings UI.
2. **What's held:** all guest-facing *content* messages (AI replies — already held —
   plus proactive / follow-up / marketing outreach).
3. **Compliance carve-out:** mandatory compliance replies (STOP / HELP / opt-out
   confirmations) **always auto-send** regardless of the flag. These are legally
   expected to be instant (TCPA / carrier rules). `analog-guest` owns the definition of
   which message types are compliance; the operator app never sees them.
4. **Approach A (reuse the existing card):** held proactive messages are returned in the
   existing `PendingDraft` shape and render on the existing card. No new card variant, no
   `messageKind` field, no badge (dropped during design as YAGNI — the operator can read
   the body and guest; v1 does not need to label reply-vs-proactive).

## Data flow

```
Outbound message created in analog-guest (reply OR proactive)
        │
        ▼
  Is this a compliance message (STOP/HELP/opt-out)? ──yes──► send immediately (unchanged)
        │ no
        ▼
  venue.hold_all_outbound = true? ──no──► existing behavior
        │                                  (auto-send proactive; hold replies as today)
        │ yes
        ▼
  Mark message pending_review instead of sending   ◄── the only new behavior
        │
        ▼
  Row lands in `messages` (venue_id scoped) → realtime INSERT fires
        │
        ▼
  Operator app's existing queue channel reloads → GET /api/operator/queue
        │
        ▼
  Existing card renders → operator swipes approve / edit / skip
        │
        ▼
  approve/edit → message sends; skip → never sends
```

## Contract

Per the cross-repo rules in `CLAUDE.md`, this section is the single source of truth.
`analog-guest`'s ticket owns and restates this Contract; the operator-app ticket links here.

### Venue flag (analog-guest, DB)

- New boolean column on the venue record: **`hold_all_outbound`**, default `false`.
- When `true`, the send path holds all *content* messages for that venue
  (`pending_review`) instead of sending.

### Send-path gating (analog-guest)

Precedence, evaluated per outbound message:

1. If the message is a **compliance** type (STOP / HELP / opt-out confirmation) → **send
   immediately**, ignore the flag.
2. Else if `venue.hold_all_outbound === true` → mark the message with the **existing
   pending review state** the operator queue already consumes (exact `review_state`
   value confirmed in the `analog-guest` ticket). Do not send.
3. Else → **existing behavior** unchanged (auto-send proactive; hold AI replies as today).

### Queue payload (no shape change)

- `GET /api/operator/queue` keeps its existing envelope `{ drafts: PendingDraft[] }`.
- Held proactive messages MUST be returned populating the **existing** `PendingDraft`
  fields the operator app requires (non-exhaustive, see `lib/api/queue.ts`):
  `messageId`, `venueId`, `venueSlug`, `guestId`, `guestDisplayName` (nullable),
  `guestPhoneFallback`, `draftBody`, `pendingSinceMs`.
- `recentContext` MAY be empty for a proactive message (no triggering inbound) — the
  operator card already handles this.
- No new fields. No new endpoints. No client schema change.

### Approve / edit / skip (no change)

- `POST /api/operator/messages/{messageId}/approve` — sends the held message.
- `POST /api/operator/messages/{messageId}/edit` `{ body }` — edits then sends.
- `POST /api/operator/messages/{messageId}/skip` — never sends.
- A held proactive message is acted on identically to a held reply.

## Rollout (server-first, per CLAUDE.md)

1. `analog-guest` lands the column + send-path gating + compliance carve-out, deploys,
   and is **`curl`-verified**: with `hold_all_outbound = true` for a test venue, a
   triggered proactive message appears in `GET /api/operator/queue`; a triggered
   compliance message does **not**.
2. Only then is the operator app exercised (no code to land — UAT only).
3. **Manual E2E UAT is a Done gate** (shared by both tickets):
   - Flip `hold_all_outbound = true` for a test venue.
   - Trigger a proactive message in `analog-guest` → confirm it lands as a card on
     device → approve → confirm the guest receives it.
   - Trigger a compliance message (STOP/HELP) → confirm it bypasses the queue and sends
     immediately.
   - **UAT must run against the live backend** — fixtures must be OFF
     (`EXPO_PUBLIC_USE_FIXTURES` unset). Note: fixtures are currently ON in the EAS
     production environment from an earlier test build; remove before UAT builds.

## Operator-app footprint

**None.** No schema edit, no component change, no new tests. The feature is consumed by
existing code. If UAT surfaces a rendering edge case for empty-context cards, that would
be a small follow-up — but the current code path already guards it.

## Ticket split

- **`analog-guest` ticket (the build):** `hold_all_outbound` column; send-path hold gate;
  compliance carve-out; ensure held proactive messages surface in `/api/operator/queue`
  in the existing `PendingDraft` shape. **Owns the `## Contract`.**
- **`analog-operator` ticket (verification only):** no code. Run the E2E UAT above; link
  to the Contract. (Effectively a single-repo feature with an operator-side UAT gate.)

## Out of scope

- Operator-app settings UI to toggle the flag (server-side only for v1).
- Per-message-type granularity beyond the compliance carve-out.
- Any reply-vs-proactive labeling/badge in the queue card.
- Changes to realtime, undo, or the edit screen.
```
