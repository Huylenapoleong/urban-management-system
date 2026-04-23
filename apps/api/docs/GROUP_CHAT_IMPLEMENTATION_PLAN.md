# Group Chat Implementation Plan

This plan breaks the target group-chat architecture into reviewable backend commits.
It is intended to keep implementation safe, production-oriented, and easy to integrate with FE.

Use together with:

- [GROUP_CHAT_ARCHITECTURE.md](D:/CN_New/urban-management-system/apps/api/docs/GROUP_CHAT_ARCHITECTURE.md)
- [FE_INTEGRATION.md](D:/CN_New/urban-management-system/apps/api/docs/FE_INTEGRATION.md)

## Planning Principles

- one commit should change one business capability, not an entire subsystem
- shared contracts should change before or together with the first runtime usage
- every permission change must include regression tests
- keep backward compatibility where needed, then remove old contracts later
- avoid mixing naming migration with invite-link and moderation rollout in the same commit

## Execution Order

1. introduce role vocabulary migration path
2. add ownership transfer
3. split member-management endpoints
4. add message policy
5. add group ban and unban
6. add invite links
7. add group audit events
8. add group lifecycle system events
9. deprecate old action-style member endpoint

## Commit 1

### Goal

Introduce `DEPUTY` as the canonical group-management role while keeping runtime compatibility with the current `OFFICER` value during migration.

### Commit Message

```text
refactor(api-groups): introduce deputy role as canonical group member role
```

### Scope

- shared constants
- shared types
- Swagger DTOs
- service normalization helpers
- authorization checks
- tests

### Likely Files

- `packages/shared-constants/index.js`
- `packages/shared-constants/index.d.ts`
- `packages/shared-types/index.d.ts`
- `apps/api/src/common/openapi/swagger.models.ts`
- `apps/api/src/common/authorization.service.ts`
- `apps/api/src/modules/groups/groups.service.ts`
- `apps/api/src/modules/groups/groups.service.spec.ts`
- `apps/api/src/common/authorization.service.spec.ts`

### Rules

- outward-facing API returns `DEPUTY`
- input may temporarily accept `OFFICER` and normalize to `DEPUTY`
- persistence should move toward storing `DEPUTY`

### Acceptance Criteria

- Swagger shows only `OWNER | DEPUTY | MEMBER`
- old FE payloads with `OFFICER` still work temporarily
- group management permissions still behave exactly as before

### Tests

- normalize `OFFICER -> DEPUTY`
- owner/deputy/member permission matrix unchanged in behavior
- DTO validation accepts `DEPUTY`

## Commit 2

### Goal

Add owner leave-with-successor flow so ownership handoff only happens when the owner actually leaves the group.

### Commit Message

```text
feat(api-groups): require owner successor selection inside leave-group flow
```

### API

### Scope

- new DTO
- leave-group body contract
- service transaction
- tests

### Likely Files

- `apps/api/src/modules/groups/groups.controller.ts`
- `apps/api/src/modules/groups/groups.service.ts`
- `apps/api/src/common/openapi/swagger.models.ts`
- `apps/api/src/modules/groups/groups.service.spec.ts`

### Rules

- non-owner members leave as before
- if the current member is `OWNER`, `successorUserId` is required
- successor must be an active member different from the owner
- owner is soft-deleted from membership in the same transaction that promotes the successor to `OWNER`
- owner does not remain in the group as `DEPUTY`

### Acceptance Criteria

- owner can leave only when a valid successor is supplied
- leaving owner loses group access immediately
- successor becomes `OWNER` immediately
- owner cannot leave without successor

### Tests

- happy path owner leave with successor
- bad request when successor missing or self
- not found for non-member successor
- conflict safety on concurrent membership update

## Commit 3

### Goal

Introduce explicit member-management endpoints while keeping the legacy action-style endpoint for compatibility.

### Commit Message

```text
feat(api-groups): add explicit member management endpoints
```

### APIs

```http
POST /groups/:groupId/members
PATCH /groups/:groupId/members/:userId/role
DELETE /groups/:groupId/members/:userId
```

### Scope

- new DTOs
- new controller methods
- service method split
- FE-friendly Swagger docs
- tests

### Likely Files

- `apps/api/src/modules/groups/groups.controller.ts`
- `apps/api/src/modules/groups/groups.service.ts`
- `apps/api/src/common/openapi/swagger.models.ts`
- `apps/api/src/modules/groups/groups.service.spec.ts`

### Rules

- `POST /members` cannot assign owner
- role patch cannot assign owner
- owner cannot be removed through remove endpoint
- keep current friend-only citizen add policy unless product changes it later

### Acceptance Criteria

- explicit endpoints are fully usable
- legacy `action=add|update|remove` endpoint still works
- behavior is identical between legacy and explicit routes

### Tests

- add member success/failure
- update role success/failure
- remove member success/failure
- parity coverage with old endpoint

## Commit 4

### Goal

Add `messagePolicy` to group metadata and enforce it in group chat sending.

### Commit Message

```text
feat(api-group-chat): add role-based group message policies
```

### Model

```ts
type GroupMessagePolicy =
  | 'ALL_MEMBERS'
  | 'OWNER_AND_DEPUTIES'
  | 'OWNER_ONLY';
```

### Scope

- shared constants/types
- group metadata DTO
- create/update group DTOs
- authorization helper for send permission
- conversations service send path
- tests

### Likely Files

- `packages/shared-constants/index.js`
- `packages/shared-constants/index.d.ts`
- `packages/shared-types/index.d.ts`
- `apps/api/src/common/openapi/swagger.models.ts`
- `apps/api/src/common/authorization.service.ts`
- `apps/api/src/modules/groups/groups.service.ts`
- `apps/api/src/modules/conversations/conversations.service.ts`
- `apps/api/src/modules/groups/groups.service.spec.ts`
- `apps/api/src/modules/conversations/conversations.service.spec.ts`

### Rules

- default on create: `ALL_MEMBERS`
- only owner/admin may update policy
- read access remains member-only
- send access depends on policy

### Acceptance Criteria

- member blocked from sending when policy forbids it
- deputy can send under `OWNER_AND_DEPUTIES`
- owner-only mode enforced in HTTP and socket send flows

### Tests

- send message under each policy
- socket send parity if gateway uses same access resolution

## Commit 5

### Goal

Add group-level moderation with `ban/unban`.

### Commit Message

```text
feat(api-groups): add ban and unban flows for group moderation
```

### APIs

```http
GET /groups/:groupId/bans
POST /groups/:groupId/bans/:userId
DELETE /groups/:groupId/bans/:userId
```

### Scope

- new storage entity for group bans
- DTOs
- controller endpoints
- service logic
- chat access enforcement
- leave room / summary removal for banned users
- tests

### Likely Files

- `apps/api/src/common/storage-records.ts`
- `packages/shared-types/index.d.ts`
- `apps/api/src/common/mappers.ts`
- `apps/api/src/common/openapi/swagger.models.ts`
- `apps/api/src/modules/groups/groups.controller.ts`
- `apps/api/src/modules/groups/groups.service.ts`
- `apps/api/src/modules/conversations/conversations.service.ts`
- `apps/api/src/modules/conversations/conversations.gateway.ts`
- `apps/api/src/modules/groups/groups.service.spec.ts`
- `apps/api/src/modules/conversations/conversations.service.spec.ts`

### Rules

- cannot ban self
- deputy cannot ban owner
- ban removes active membership if present
- banned user cannot join, be added, or send/read/realtime-join

### Acceptance Criteria

- banned member immediately loses group chat access
- banned non-member cannot join by any route
- unban restores eligibility, not membership

### Tests

- ban active member
- ban non-member
- unban user
- send/join denied while banned

## Commit 6

### Goal

Add invite link lifecycle.

### Commit Message

```text
feat(api-groups): add invite link lifecycle for group onboarding
```

### APIs

```http
GET /groups/:groupId/invite-links
POST /groups/:groupId/invite-links
DELETE /groups/:groupId/invite-links/:inviteId
POST /groups/invite-links/:code/join
```

### Scope

- invite-link storage entity
- code lookup strategy
- DTOs
- controller/service
- tests

### Likely Files

- `apps/api/src/common/storage-records.ts`
- `packages/shared-types/index.d.ts`
- `apps/api/src/common/mappers.ts`
- `apps/api/src/common/openapi/swagger.models.ts`
- `apps/api/src/modules/groups/groups.controller.ts`
- `apps/api/src/modules/groups/groups.service.ts`
- `apps/api/src/modules/groups/groups.service.spec.ts`

### Rules

- owner/deputy/admin manage invite links
- banned users cannot redeem
- disabled or expired links cannot be redeemed
- usage count changes atomically

### Acceptance Criteria

- join by invite works and respects bans and max-use limits
- invite link listing is scoped to authorized managers

### Tests

- create link
- redeem link
- redeem expired link
- redeem exhausted link
- revoke link

## Commit 7

### Goal

Add dedicated group audit events separate from conversation audit.

### Commit Message

```text
feat(api-groups): add dedicated group audit trail
```

### APIs

```http
GET /groups/:groupId/audit
```

### Scope

- new `GROUP_AUDIT_EVENT` storage type
- audit builder/list methods
- controller/service hook-ups
- writes on group lifecycle actions
- tests

### Likely Files

- `apps/api/src/common/storage-records.ts`
- `packages/shared-types/index.d.ts`
- `apps/api/src/common/mappers.ts`
- `apps/api/src/infrastructure/audit/audit-trail.service.ts`
- `apps/api/src/modules/groups/groups.controller.ts`
- `apps/api/src/modules/groups/groups.service.ts`
- `apps/api/src/modules/groups/groups.service.spec.ts`

### Actions

- `GROUP_CREATED`
- `GROUP_UPDATED`
- `GROUP_MEMBER_ADDED`
- `GROUP_MEMBER_REMOVED`
- `GROUP_MEMBER_LEFT`
- `GROUP_ROLE_UPDATED`
- `GROUP_OWNERSHIP_TRANSFERRED`
- `GROUP_MEMBER_BANNED`
- `GROUP_MEMBER_UNBANNED`
- `GROUP_INVITE_CREATED`
- `GROUP_INVITE_REVOKED`
- `GROUP_INVITE_REDEEMED`
- `GROUP_MESSAGE_POLICY_UPDATED`

### Acceptance Criteria

- audit log is queryable without mixing message mutation audit
- every management action leaves a structured event

### Tests

- event emitted for ownership transfer
- event emitted for role update
- event emitted for ban/unban

## Commit 8

### Goal

Persist user-visible group lifecycle system messages.

### Commit Message

```text
feat(api-group-chat): emit system messages for group lifecycle events
```

### Scope

- system message creation helpers
- hooks in groups service
- dispatch through existing conversation pipeline
- tests

### Likely Files

- `apps/api/src/modules/groups/groups.service.ts`
- `apps/api/src/modules/conversations/conversations.service.ts`
- `apps/api/src/modules/conversations/conversation-dispatch.service.ts`
- `apps/api/src/modules/groups/groups.service.spec.ts`
- `apps/api/src/modules/conversations/conversations.service.spec.ts`

### Events

- member added
- member removed
- member left
- role changed
- ownership transferred
- message policy changed
- user banned
- user unbanned

### Acceptance Criteria

- visible timeline events appear in correct order
- audit and system events both exist where appropriate
- no duplicate system message on retry or conflict

### Tests

- system message appears after owner leave with successor handoff
- system message appears after role change
- system message appears after member leave/remove

## Commit 9

### Goal

Deprecate and prepare removal of the legacy action-style member-management endpoint.

### Commit Message

```text
chore(api-groups): deprecate legacy action-style member management endpoint
```

### Scope

- Swagger deprecation flag
- FE integration guide update
- Postman update
- optional warning log in server metrics

### Likely Files

- `apps/api/src/modules/groups/groups.controller.ts`
- `apps/api/src/common/openapi/swagger.models.ts`
- `apps/api/docs/FE_INTEGRATION.md`
- `apps/api/docs/postman/urban-management-api.postman_collection.json`

### Acceptance Criteria

- FE has a clean migration path
- legacy endpoint remains functional during rollout

## Cross-Cutting Test Strategy

For every commit:

- run focused service specs first
- run related gateway specs when access control or realtime room behavior changes
- run `tsc --noEmit`
- run lint on touched files

Recommended minimum matrix:

- `groups.service.spec.ts`
- `conversations.service.spec.ts`
- `conversations.gateway.spec.ts`
- `authorization.service.spec.ts`

## Backward Compatibility Notes

### Role migration

- tolerate `OFFICER` only temporarily
- all new docs and FE integrations should use `DEPUTY`

### Legacy member-management endpoint

- keep it until FE fully switches
- ensure shared service methods back both old and new routes to avoid divergent behavior

## Risks and Mitigations

### Risk

Role rename breaks FE or stored data assumptions.

### Mitigation

- normalize old input
- return only canonical values
- ship migration notes with Swagger and FE integration docs

### Risk

Ban or ownership transfer leaves stale socket access.

### Mitigation

- force room leave
- emit `conversation.removed` or `conversation.updated`
- cover with gateway/service tests

### Risk

Invite link redemption introduces race conditions.

### Mitigation

- use transactional update for `usedCount`
- check expiry and `disabledAt` inside the same critical path

## First Recommended Coding Step

Start with Commit 1 and Commit 2 only.

Reason:

- they establish the correct domain language
- they unblock the owner leave flow
- they have low blast radius compared to bans, invite links, and message policy

Once those two are stable, the rest of the roadmap becomes much easier to implement without rework.
