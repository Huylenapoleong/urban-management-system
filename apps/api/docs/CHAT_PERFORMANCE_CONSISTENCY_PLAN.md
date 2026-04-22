# Chat Performance, Latency, and Consistency Plan

## Why this plan exists

The current chat stack is in a much better state than before, but a production chat product still needs a short list of focused follow-up phases.

This plan prioritizes:

- low message latency
- predictable realtime behavior
- consistent business semantics across DM, groups, calls, and moderation
- safe migration away from temporary compatibility paths

It is written as an execution guide, not just an architecture note.

## What is already done

The following high-impact work is already in place:

- session scope inference no longer collapses mobile web and native app into the same bucket
- accepting a friendship bootstraps DM availability
- socket auth context is cached on hot realtime paths
- DM call signaling goes directly to user rooms
- group cleanup removes ex-members from inbox/room access quickly
- group role model now uses `OWNER / DEPUTY / MEMBER`
- owner leave requires choosing a successor
- group member management has explicit endpoints
- group message policy is enforced
- group `ban/unban` exists
- invite link lifecycle exists
- group audit trail exists
- group system events exist
- invite redemption now validates link state before idempotent member return
- system-event copy now uses display names instead of raw user ids

These changes remove the biggest correctness and UX blockers.

## Remaining hotspots in current code

The following areas are still worth attention because they can become latency or consistency pain under load:

- `apps/api/src/modules/conversations/chat-outbox.service.ts`
  - realtime fallback still relies on a timer-driven outbox drain
- `apps/api/src/infrastructure/config/app-config.service.ts`
  - current outbox interval defaults still shape replay latency
- `apps/api/src/modules/groups/groups.service.ts`
  - `listGroups()` still falls back to `scanAll()` in broad query paths
- `apps/api/src/modules/conversations/conversation-summary.service.ts`
  - there is still a `scanAll()` path for summary synchronization
- `apps/api/src/modules/groups/group-cleanup.service.ts`
  - report cleanup still scans the reports table
- `apps/api/src/infrastructure/notifications/push-notification.service.ts`
  - push device lookup still uses `scanAll()`
- `apps/api/src/infrastructure/realtime/chat-presence.service.ts`
  - presence is much better now, but still depends on TTL-based recency windows

None of these are immediate correctness bugs, but they are the places most likely to show up as “chat feels slow” when volume increases.

## Success targets

Before doing more product work, we should agree on concrete targets:

- DM send ack p95: under `150ms` inside one region
- group send ack p95: under `250ms`
- typing / call signal delivery p95: under `120ms`
- outbox replay fallback p95: under `1s`
- conversation summary lag after send/update/recall: under `1s`
- zero business inconsistencies for:
  - friend accept -> DM available
  - owner leave -> successor promoted atomically
  - ban -> no residual group access
  - expired/revoked invite -> never redeemed as success

## Phase 1: Immediate latency wins

### Goal

Reduce the amount of time users can feel in the hot path of sending messages, receiving realtime updates, and initiating calls.

### Work

- make outbox replay more event-driven and less timer-dependent
  - keep timer drain as fallback
  - trigger drain immediately after write success when a deferred event is recorded
- add observability around:
  - ack latency
  - outbox pending count
  - oldest outbox age
  - failed realtime dispatch count
- lower the perceived latency of fallback delivery
  - tune drain interval only after metrics exist
- review duplicated repository reads in send/update/recall paths and collapse unnecessary reads where safe

### Why do this now

This is the phase most directly connected to “the app feels laggy.”

### Acceptance criteria

- no visible multi-second delay on normal DM/group send paths
- metrics can tell us whether latency is HTTP, websocket, or outbox-related
- fallback replay happens fast enough that FE does not look stalled

## Phase 2: Query and scan elimination

### Goal

Remove broad scans from user-facing paths and high-frequency background work.

### Work

- replace `scanAll()` in `GroupsService.listGroups()` with indexed query paths where possible
- replace `scanAll()` in `ConversationSummaryService` synchronization with narrower sources
- replace `scanAll()` in push device lookup with a direct lookup or indexed access path
- review `GroupCleanupService` report cleanup and use a narrower data access pattern

### Why do this now

These are not always obvious in local dev, but they become a real source of p95/p99 latency and cost in production.

### Acceptance criteria

- no scan-heavy path remains in normal user-facing request handling
- background maintenance scans are isolated and not part of chat hot paths

## Phase 3: Consistency closure

### Goal

Finish the remaining semantics so FE and BE never disagree about chat/group state.

### Work

- document the exact contract for invite redemption when the actor is already a member
- decide public-group roster visibility explicitly
- decide whether admin has any override around owner succession
- snapshot display names in group system-event metadata if we want timeline text to stay historically stable
- review all idempotent endpoints and standardize:
  - join
  - leave
  - ban/unban
  - revoke invite
  - recall

### Why do this now

This phase reduces “weird edge-case bugs” that are really product ambiguity.

### Acceptance criteria

- FE can implement every group/chat action from explicit documented semantics
- repeated requests do not produce contradictory behavior

## Phase 4: Call and realtime resilience

### Goal

Make call/video signaling more robust under imperfect network conditions.

### Work

- introduce explicit call-session state with timeout/cleanup rules
- dedupe or reject duplicated signaling events safely
- define recovery behavior for:
  - caller disconnect
  - callee reconnect
  - accepted call with stale session
  - call-end after failed system-message persistence
- measure call init -> accepted latency separately from message latency

### Why do this now

This is the next major quality lever after text chat latency.

### Acceptance criteria

- call setup is not coupled to message persistence side effects
- stale or duplicated signals no longer create inconsistent FE state

## Phase 5: Contract cleanup and migration removal

### Goal

Remove transitional compatibility paths before they become permanent maintenance cost.

### Work

- backfill old `OFFICER` memberships to `DEPUTY`
- remove or sunset the legacy action-based group member endpoint
- make FE/Postman/Swagger use only canonical role names and explicit endpoints
- review old compatibility code in chat/media/group flows and remove what is no longer needed

### Why do this now

Every compatibility branch left in place increases cognitive load and bug surface.

### Acceptance criteria

- API contract is canonical and consistent
- old aliases are no longer required for normal operation

## Phase 6: Load validation and release gates

### Goal

Prove that the chat stack behaves well under load, not just under happy-path tests.

### Work

- create load scenarios for:
  - DM burst
  - group burst
  - typing bursts
  - call signal burst
  - invite redeem burst
- define release gates:
  - p95 latency budget
  - websocket error rate ceiling
  - outbox oldest-age ceiling
  - summary lag ceiling
- add dashboards and alerts for the above

### Why do this now

Without this, “it feels fast” is guesswork.

### Acceptance criteria

- staging/prod readiness is based on measured chat behavior
- regressions are detected by monitoring, not by user complaints

## Recommended implementation order

If we want the best return on engineering time, the order should be:

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 6
5. Phase 4
6. Phase 5

Reason:

- Phase 1 and Phase 2 directly affect perceived speed
- Phase 3 prevents FE/BE drift while flows are still changing
- Phase 6 gives us confidence before broader rollout
- Phase 4 matters most when call volume starts growing
- Phase 5 is cleanup, important but not the first latency lever

## What I would do next

If we continue immediately, the next concrete batch should be:

### Batch A

- instrument realtime/outbox latency
- trigger outbox drain eagerly after deferred writes
- benchmark message ack and replay age

### Batch B

- remove remaining scan-heavy request paths
- review summary sync and push device lookup

### Batch C

- finalize group roster/privacy semantics
- finalize invite idempotency semantics in docs/OpenAPI

This is the most practical order if product quality is the main goal.
