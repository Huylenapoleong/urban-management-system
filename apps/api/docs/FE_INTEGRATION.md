# FE Integration Guide

This guide is the backend handoff pack for `apps/api`.
Use it together with Swagger at `/api/docs` and the Postman collection in `apps/api/docs/postman`.

## Quick Start

1. Import `urban-management-api.postman_collection.json`.
2. Import `urban-management-api.postman_environment.json`.
3. Set `baseUrl` to your active API origin, for example `http://localhost:3001/api`.
4. Run `Auth > Login` or `Auth > Register Citizen`.
5. The collection test script stores `accessToken`, `refreshToken`, and `currentUserId` automatically.

## Response Contract

All success responses follow this envelope:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "count": 2,
    "nextCursor": "..."
  }
}
```

All error responses follow this envelope:

```json
{
  "success": false,
  "error": {
    "statusCode": 400,
    "message": "Invalid credentials.",
    "error": "Bad Request"
  },
  "path": "/api/auth/login",
  "timestamp": "2026-03-18T10:00:00.000Z",
  "requestId": "req-..."
}
```

Notes:

- Read `X-Request-Id` from every HTTP response and surface it in FE error reporting.
- Treat `meta.nextCursor` as opaque.
- Only array responses include `meta`.

## Auth Flow

Recommended sequence:

1. `POST /auth/login` or `POST /auth/register`
2. store `accessToken` and `refreshToken`
3. call protected APIs with `Authorization: Bearer <accessToken>`
4. on `401`, call `POST /auth/refresh` once
5. if refresh fails, force sign-in again

Session APIs available for account/device management:

- `GET /auth/sessions`
- `DELETE /auth/sessions/:sessionId`
- `DELETE /auth/sessions/:sessionId/history`
- `POST /auth/logout`
- `POST /auth/logout-all`

OTP/password APIs for stronger auth:

- `POST /auth/register/request-otp`
- `POST /auth/register/verify-otp`
- `POST /auth/login/request-otp`
- `POST /auth/login/verify-otp`
- `POST /auth/password/forgot/request`
- `POST /auth/password/forgot/confirm`
- `POST /auth/password/change/request-otp`
- `POST /auth/password/change`

OTP behavior:

- OTP endpoint responses do not include OTP code.
- Backend can deliver OTP via `log`, `webhook`, or `smtp` provider based on environment config.
- OTP requests may return `429` due to cooldown, redis lock conflict, or per-window rate limiting.

Useful client metadata headers:

- `X-Device-Id`
- `X-App-Variant`
- `User-Agent`

Session-scope behavior:

- one active session per scope (`MOBILE_APP`, `WEB_DESKTOP`, `WEB_MOBILE`, `UNKNOWN`)
- a new login in the same scope replaces the previous session
- revoked or expired sessions can be hidden from history with `DELETE /auth/sessions/:sessionId/history`
- sessions with `dismissedAt` are hidden from default `GET /auth/sessions`
- successful `password/change` and `password/forgot/confirm` revoke all sessions for that user

## Pagination And Search

Endpoints using cursor pagination:

- `GET /users`
- `GET /groups`
- `GET /reports`
- `GET /conversations`
- `GET /conversations/:conversationId/messages`

Client rules:

- send the returned `meta.nextCursor` back as `cursor`
- reset cursor when any filter changes
- keep FE filters stable while paginating

## Conversation Id Rules

Use only route-safe ids in FE:

- group conversation: `group:<groupId>`
- direct message: `dm:<userId>`

Do not use internal keys like `GRP#...` or `DM#...` in FE state.
Backend may still accept legacy keys, but FE should not rely on them.

## Product Policy Decisions

The backend currently enforces these product rules and FE should align UI/UX with them:

- Direct messages are not globally open:
  - citizen can DM citizen only when they are friends or a same-scope direct message request was accepted
  - citizen can DM in-scope staff/admin according to backend authorization
  - staff-to-staff DM is allowed only when scope rules overlap
- Public groups are public only at metadata/discovery level:
  - same-scope users can see the group exists
  - only active members or admin can read messages, join realtime rooms, or access audit
- Group management is membership-based:
  - `ADMIN` can manage any group
  - `OWNER` and `OFFICER` members can manage their group
  - staff outside the group cannot manage a non-private group just because it is in scope
- Report status uses a state machine, not free-form transitions:
  - FE must render actions from the current status, not from a global list
  - citizen is only expected to close their own resolved report
  - invalid transitions will be rejected by the API

## Chat Rules

For sending messages:

- always send a unique `clientMessageId`
- reuse the same `clientMessageId` only when retrying the same logical message
- `replyTo` must be the API message `id`, not `conversationId` or `groupId`
- use `POST /conversations/:conversationId/messages/:messageId/recall` for end-user message removal UX
- use `DELETE /conversations/:conversationId/messages/:messageId` only for admin/moderation tooling
- use `POST /conversations/:conversationId/messages/:messageId/forward` to forward an existing message into other conversations
- `content` for `TEXT/EMOJI/SYSTEM` should be canonical JSON string, for example:

```json
{ "text": "Da tiep nhan, se cu can bo kiem tra.", "mention": [] }
```

For deleting a conversation:

- `DELETE /conversations/:conversationId` means delete from current user inbox only
- shared messages stay intact for other participants
- the inbox is recreated automatically when a new message arrives

For recall vs delete:

- `recall scope=EVERYONE` keeps a placeholder in the thread for all participants
- `recall scope=SELF` hides the message only from the current actor's own view/inbox (the actor can hide messages sent by any participant)
- `delete message` is permanent and admin-only
- FE chat UI should not show a permanent delete action for normal users

## Socket.IO Contract

Namespace: `/chat`

Handshake auth:

- `auth.token` or `auth.accessToken` with Bearer token
- or `Authorization` header in the handshake

Client command events:

- `conversation.join`
- `conversation.leave`
- `conversation.delete`
- `conversation.read`
- `message.send`
- `message.update`
- `message.delete`
- `message.recall`
- `typing.start`
- `typing.stop`

Server push events:

- `chat.ready`
- `message.created`
- `message.updated`
- `message.deleted`
- `conversation.updated`
- `conversation.removed`
- `conversation.read`
- `presence.snapshot`
- `presence.updated`
- `typing.state`
- `chat.error`

Client rules:

- deduplicate socket side effects by `eventId`
- deduplicate send retries by `clientMessageId`
- rejoin active conversations after reconnect
- do not assume every socket event is unique; outbox replay can redeliver safely

## Upload Flow

Endpoint: `POST /uploads/media` with `multipart/form-data`.

Fields:

- `target`: `REPORT | MESSAGE | AVATAR | GENERAL`
- `entityId` optional
- `file` binary

Recommended FE flow:

1. upload file first
2. keep `data.key` as the canonical value for later business requests
3. send:
   - `avatarKey` for profile/avatar updates
   - `attachmentKey` for message send/update
   - `mediaKeys` for report create/update
4. treat `avatarUrl`, `attachmentUrl`, and `mediaUrls` as legacy fallback only

Important compatibility rule:

- if FE sends both canonical key fields and legacy URL fields during migration, backend now prefers the key field and ignores the legacy URL field

Upload history endpoints:

- `GET /uploads/media?target=AVATAR`
- `GET /uploads/media?target=REPORT&entityId=<reportId>`
- `GET /uploads/media?target=MESSAGE&entityId=<conversationId>`
- `DELETE /uploads/media`

Avatar-specific rules:

- `PATCH /users/me` with `avatarKey` sets the selected uploaded avatar as the current profile avatar
- the `avatarKey` can come from a fresh upload or from an older item returned by `GET /uploads/media?target=AVATAR`
- `DELETE /users/me/avatar` removes only the current avatar from the user profile
- `DELETE /users/me/avatar` does not remove the uploaded file from avatar history
- after clearing the current avatar, that same file can still be selected again later via `avatarKey`

Delete rules:

- a file can be deleted only by its uploader
- backend blocks deletion when the file is still actively referenced by:
  - current avatar
  - current report media
  - an active message attachment
- FE should use `isInUse` from `GET /uploads/media` to disable destructive delete actions

## Common Errors

- `400`: invalid body, invalid conversation id, invalid reply target
- `401`: token missing/expired/revoked
- `403`: role/scope denied
- `404`: resource not found
- `409`: dedup or logical conflict
- `429`: rate limit
- `503`: transient infra issue, retry with backoff

Retry guidance:

- `401`: refresh once
- `429`: exponential backoff + jitter
- `503`: limited retries + backoff
- message send retry only with same `clientMessageId`

## Suggested FE Integration Order

1. auth + me + session handling
2. users/groups/reports list views with pagination and filters
3. report detail + audit + linked conversations
4. conversations list + messages list
5. send/update/delete/read message over REST
6. add recall/forward flows for chat moderation UX
7. realtime socket join/send/read/typing
8. uploads
