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
- `POST /auth/logout`
- `POST /auth/logout-all`

Useful client metadata headers:
- `X-Device-Id`
- `X-App-Variant`
- `User-Agent`

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

## Chat Rules

For sending messages:
- always send a unique `clientMessageId`
- reuse the same `clientMessageId` only when retrying the same logical message
- `replyTo` must be the API message `id`, not `conversationId` or `groupId`
- `content` for `TEXT/EMOJI/SYSTEM` should be canonical JSON string, for example:

```json
{"text":"Da tiep nhan, se cu can bo kiem tra.","mention":[]}
```

For deleting a conversation:
- `DELETE /conversations/:conversationId` means delete from current user inbox only
- shared messages stay intact for other participants
- the inbox is recreated automatically when a new message arrives

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
2. take `data.url` or `data.key` from response
3. include that URL in report/message payloads

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
6. realtime socket join/send/read/typing
7. uploads
