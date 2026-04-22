# Group Chat Architecture

This document defines the target production design for group management in `apps/api`.
It is written as the implementation blueprint for the backend team and the integration contract reference for FE.

## Goals

- support production-ready group management and moderation
- make naming consistent with product language
- keep validation strict and explicit
- preserve chat correctness across HTTP, realtime, audit, and system events
- avoid coupling group lifecycle too tightly to message persistence

## Current State

The API already supports these group capabilities:

- create group
- list groups
- get group metadata
- update group metadata
- delete group
- join group
- leave group
- list members
- add, update, remove members through a single management endpoint
- member-only group chat access at the conversation layer

Current implementation references:

- [groups.controller.ts](D:/CN_New/urban-management-system/apps/api/src/modules/groups/groups.controller.ts)
- [groups.service.ts](D:/CN_New/urban-management-system/apps/api/src/modules/groups/groups.service.ts)
- [authorization.service.ts](D:/CN_New/urban-management-system/apps/api/src/common/authorization.service.ts)
- [conversations.service.ts](D:/CN_New/urban-management-system/apps/api/src/modules/conversations/conversations.service.ts)

Current gaps:

- no ownership transfer
- no invite links
- no group-level ban or unblock flow
- no explicit message policy by role
- no group audit stream separate from conversation message audit
- no group lifecycle system messages
- role naming uses `OFFICER`, which is ambiguous against app-level user roles
- member management is multiplexed behind `action=add|update|remove`, which is less explicit than production-grade endpoint separation

## Naming Decision

### Current

```ts
type GroupMemberRole = 'OWNER' | 'OFFICER' | 'MEMBER';
```

### Target

```ts
type GroupMemberRole = 'OWNER' | 'DEPUTY' | 'MEMBER';
```

### Why

- `OFFICER` collides conceptually with `WARD_OFFICER` and `PROVINCE_OFFICER`
- product language is `owner / deputy / member`
- FE and BE will both reason more clearly about permissions

### Migration Rule

During migration:

- backend may temporarily accept `OFFICER` on input
- backend should persist and return `DEPUTY`
- Swagger and shared contracts should expose only `DEPUTY`

## Target Scope

This design covers:

- create group
- add and remove members
- role management with `OWNER / DEPUTY / MEMBER`
- ownership transfer
- message permission policy
- invite links
- group-level ban and unban
- leave group
- group audit log
- group system events

This design does not cover:

- threaded sub-conversations inside groups
- per-message moderation workflow
- approval-based join requests
- end-to-end encryption

## Domain Model

### Group Metadata

```ts
export const GROUP_MEMBER_ROLES = ['OWNER', 'DEPUTY', 'MEMBER'] as const;
export type GroupMemberRole = (typeof GROUP_MEMBER_ROLES)[number];

export const GROUP_MESSAGE_POLICIES = [
  'ALL_MEMBERS',
  'OWNER_AND_DEPUTIES',
  'OWNER_ONLY',
] as const;
export type GroupMessagePolicy = (typeof GROUP_MESSAGE_POLICIES)[number];

export interface GroupMetadata {
  id: string;
  groupName: string;
  groupType: GroupType;
  locationCode: string;
  createdBy: string;
  description?: string;
  memberCount: number;
  isOfficial: boolean;
  messagePolicy: GroupMessagePolicy;
  inviteLinkEnabled: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### Membership

```ts
export interface GroupMembership {
  groupId: string;
  userId: string;
  roleInGroup: GroupMemberRole;
  joinedAt: string;
  deletedAt: string | null;
  updatedAt: string;
}
```

### Invite Link

```ts
export interface GroupInviteLink {
  inviteId: string;
  groupId: string;
  code: string;
  createdBy: string;
  expiresAt: string | null;
  maxUses: number | null;
  usedCount: number;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### Ban

```ts
export interface GroupBan {
  groupId: string;
  userId: string;
  bannedByUserId: string;
  reason?: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

## Permission Matrix

### Group Metadata

| Action                    | Owner | Deputy | Member | Admin |
| ------------------------- | ----- | ------ | ------ | ----- |
| read metadata             | yes   | yes    | yes    | yes   |
| update name / description | yes   | yes    | no     | yes   |
| update message policy     | yes   | no     | no     | yes   |
| delete group              | yes   | no     | no     | yes   |
| create invite link        | yes   | yes    | no     | yes   |
| revoke invite link        | yes   | yes    | no     | yes   |

### Membership

| Action             | Owner                        | Deputy | Member | Admin |
| -------------------------------- | ------------------------------------ | ------ | ------ | ----- |
| add member                       | yes                                  | yes    | no     | yes   |
| remove member                    | yes                                  | yes    | no     | yes   |
| promote to deputy                | yes                                  | no     | no     | yes   |
| demote deputy                    | yes                                  | no     | no     | yes   |
| choose successor while leaving   | yes                                  | no     | no     | yes   |
| leave group                      | yes, but only with a valid successor | yes    | yes    | yes   |

### Moderation

| Action       | Owner | Deputy | Member | Admin |
| ------------ | ----- | ------ | ------ | ----- |
| ban member   | yes   | yes    | no     | yes   |
| unban member | yes   | yes    | no     | yes   |
| list bans    | yes   | yes    | no     | yes   |

### Messaging

| Policy               | Owner | Deputy    | Member    |
| -------------------- | ----- | --------- | --------- |
| `ALL_MEMBERS`        | send  | send      | send      |
| `OWNER_AND_DEPUTIES` | send  | send      | read-only |
| `OWNER_ONLY`         | send  | read-only | read-only |

Notes:

- `ADMIN` bypasses all role restrictions
- `MEMBER` must still be active, not deleted, and not banned
- non-members cannot read or send group messages even if the group metadata is public

## API Design

### Keep

These endpoints already exist and should remain:

- `POST /groups`
- `GET /groups`
- `GET /groups/:groupId`
- `PATCH /groups/:groupId`
- `DELETE /groups/:groupId`
- `POST /groups/:groupId/join`
- `POST /groups/:groupId/leave`
- `GET /groups/:groupId/members`

### Deprecate

Deprecate this multiplexed endpoint:

- `PATCH /groups/:groupId/members/:userId`

It should remain temporarily for compatibility, but new FE work should not depend on it.

### Add

#### Add member

```http
POST /groups/:groupId/members
```

```ts
export class AddGroupMemberRequestDto {
  @IsString()
  @MinLength(5)
  @MaxLength(50)
  userId!: string;

  @IsOptional()
  @IsIn(['MEMBER', 'DEPUTY'])
  roleInGroup?: 'MEMBER' | 'DEPUTY';
}
```

Rules:

- cannot add `OWNER`
- cannot add banned user
- if actor is `CITIZEN`, still enforce the current friend-only policy for adding other citizens unless product changes it later

#### Update member role

```http
PATCH /groups/:groupId/members/:userId/role
```

```ts
export class UpdateGroupMemberRoleRequestDto {
  @IsIn(['DEPUTY', 'MEMBER'])
  roleInGroup!: 'DEPUTY' | 'MEMBER';
}
```

Rules:

- cannot set role to `OWNER`
- only `OWNER` or `ADMIN` can change roles
- cannot demote the only owner through this endpoint

#### Remove member

```http
DELETE /groups/:groupId/members/:userId
```

Rules:

- cannot remove owner directly
- must remove from realtime room and inbox summary immediately
- emit `conversation.removed`

#### Owner leave with successor

```http
POST /groups/:groupId/leave
```

```ts
export class LeaveGroupRequestDto {
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(50)
  successorUserId?: string;
}
```

Rules:

- non-owner members may leave without a request body
- if the actor is the current owner, `successorUserId` is required
- successor must be an active member different from the owner
- successor becomes `OWNER` in the same transaction that soft-deletes the current owner membership
- the old owner leaves immediately and does not remain in the group as `DEPUTY`

#### List invite links

```http
GET /groups/:groupId/invite-links
```

#### Create invite link

```http
POST /groups/:groupId/invite-links
```

```ts
export class CreateGroupInviteLinkRequestDto {
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxUses?: number;
}
```

#### Revoke invite link

```http
DELETE /groups/:groupId/invite-links/:inviteId
```

#### Join by invite link

```http
POST /groups/invite-links/:code/join
```

Rules:

- banned users cannot join
- expired or disabled links must return `403` or `404` according to product preference
- link use count must update atomically

#### List bans

```http
GET /groups/:groupId/bans
```

#### Ban member

```http
POST /groups/:groupId/bans/:userId
```

```ts
export class BanGroupMemberRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
```

Rules:

- if target is active member, remove membership in same transaction when possible
- owner cannot be banned through this endpoint
- ban must immediately revoke chat access

#### Unban member

```http
DELETE /groups/:groupId/bans/:userId
```

#### Group audit events

```http
GET /groups/:groupId/audit
```

Rules:

- owner, deputy, admin only
- returns management and moderation events, not message mutation events

## Validation Rules

### Group creation and update

- `groupName`
  - required on create
  - min 1, max 100
  - trim input before persist
- `description`
  - optional
  - max 500
- `locationCode`
  - must pass existing location validation
- `messagePolicy`
  - optional on create, default `ALL_MEMBERS`
  - only owner/admin may update

### Membership actions

- `userId` must resolve to an active user when relevant
- cannot add deleted or locked users
- cannot add duplicate active membership
- cannot assign `OWNER` through generic member APIs
- cannot remove or demote owner outside transfer flow

### Invite links

- `expiresAt` must be in the future
- `maxUses` must be positive
- only one active permanent invite link may be allowed if product wants simple UX

### Ban rules

- cannot ban self
- cannot ban owner through deputy privileges
- reason max 500
- expired bans should be filtered out automatically at read-time or cleaned asynchronously

## Persistence Design

### Existing entities

- `GROUP_METADATA`
- `GROUP_MEMBERSHIP`

### New entities

```ts
export interface StoredGroupInviteLink extends TableItemBase {
  entityType: 'GROUP_INVITE_LINK';
  groupId: string;
  inviteId: string;
  code: string;
  createdBy: string;
  expiresAt: string | null;
  maxUses: number | null;
  usedCount: number;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoredGroupBan extends TableItemBase {
  entityType: 'GROUP_BAN';
  groupId: string;
  userId: string;
  bannedByUserId: string;
  reason?: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoredGroupAuditEvent extends TableItemBase {
  entityType: 'GROUP_AUDIT_EVENT';
  eventId: string;
  groupId: string;
  action: string;
  actorUserId: string;
  targetUserId?: string;
  inviteId?: string;
  occurredAt: string;
  summary: string;
  metadata?: Record<string, unknown>;
}
```

### Keying recommendation

Use the same table if that matches the current architecture, but keep key prefixes unambiguous:

- `PK = GROUP#<groupId>`
- invite link `SK = INVITE#<inviteId>`
- ban `SK = BAN#<userId>`
- audit `SK = AUDIT#<occurredAt>#<eventId>`

If invite links need lookup by code:

- add a secondary lookup record or dedicated GSI-backed entity, for example:
  - `PK = GROUP_INVITE_CODE#<code>`
  - `SK = METADATA`

## Group Audit Design

### Separate group audit from conversation audit

Current conversation audit is useful for message mutations, but it is not the right abstraction for group lifecycle.

Group audit actions should include:

- `GROUP_CREATED`
- `GROUP_UPDATED`
- `GROUP_DELETED`
- `GROUP_MEMBER_ADDED`
- `GROUP_MEMBER_REMOVED`
- `GROUP_MEMBER_LEFT`
- `GROUP_ROLE_UPDATED`
- `GROUP_OWNERSHIP_TRANSFERRED`
- `GROUP_INVITE_CREATED`
- `GROUP_INVITE_REVOKED`
- `GROUP_INVITE_REDEEMED`
- `GROUP_MEMBER_BANNED`
- `GROUP_MEMBER_UNBANNED`
- `GROUP_MESSAGE_POLICY_UPDATED`

Each record should contain:

- actor
- target user if applicable
- occurredAt
- summary
- structured metadata

## Group System Events

These are user-visible timeline events, persisted as `SYSTEM` messages in the group conversation.

Recommended events:

- `A added B to the group.`
- `A removed B from the group.`
- `A left the group.`
- `A changed B's role to Deputy.`
- `Ownership was transferred from A to B.`
- `A changed message permissions to Owner and Deputies only.`
- `A banned B from the group.`
- `A unbanned B.`

Do not emit system messages for:

- raw invite link creation
- audit-only metadata changes that do not matter to members

### Important separation

- audit event = immutable server trace
- system event = user-facing timeline record

Both may happen for the same action, but they serve different purposes.

## Chat Enforcement Rules

Group membership must be enforced at the conversation layer, not only at the groups layer.

Checks before send/read/realtime join should evaluate:

1. group exists and is not deleted
2. actor is active member or admin
3. actor is not group-banned
4. actor satisfies message policy for send actions

Recommended helper:

```ts
interface GroupConversationAccess {
  group: StoredGroup;
  membership?: StoredMembership;
  isAdmin: boolean;
  canRead: boolean;
  canSend: boolean;
}
```

This should be resolved once and reused through message send, typing, call signaling, and realtime room joins.

## Realtime Rules

On membership removal, leave, ban, or group deletion:

- remove inbox summary if the user should no longer see the group chat
- force leave socket room
- emit `conversation.removed`

On ownership transfer, role update, and message policy change:

- emit `conversation.updated`
- optionally emit dedicated management event later if FE needs it

## Service Boundaries

### GroupsService

Responsible for:

- metadata lifecycle
- membership lifecycle
- ownership transfer
- invite links
- bans
- management audit records

### ConversationsService

Responsible for:

- message persistence
- message mutations
- system message creation
- conversation audit records
- chat-layer access enforcement

### AuditTrailService

Should be extended to support:

- `buildGroupEvent(...)`
- `listGroupEvents(...)`

## Migration Strategy

### Phase 1

- add `messagePolicy` to group metadata with default `ALL_MEMBERS`
- add new DTOs and endpoints
- add `DEPUTY` to shared constants
- keep `OFFICER` alias accepted on read/write temporarily if needed

### Phase 2

- migrate data or normalize any stored `OFFICER` value to `DEPUTY`
- update FE to new member role vocabulary
- update Swagger and Postman

### Phase 3

- deprecate and later remove `PATCH /groups/:groupId/members/:userId` action-style endpoint
- drop `OFFICER` compatibility if no client depends on it

## Recommended Implementation Order

1. role model rename to `DEPUTY`
2. ownership transfer
3. explicit member APIs
4. `messagePolicy`
5. group ban and unban
6. invite links
7. group audit
8. group system events

## Final Recommendation

For this codebase, the highest-value changes are:

- replace `OFFICER` with `DEPUTY`
- introduce ownership transfer before touching leave-group UX
- add `messagePolicy` before FE builds advanced group chat controls
- use `ban/unban`, not `block/unblock`, for group moderation
- separate group audit from conversation audit
- emit system messages only for user-visible group lifecycle actions

This order keeps the architecture understandable and minimizes backward-compatibility pain while moving the API toward a true production group-chat model.
