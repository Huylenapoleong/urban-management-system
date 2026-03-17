# Urban Management API

NestJS backend for SmartCity OTT using six DynamoDB tables on AWS.

## Modules
- `auth`: citizen registration, login, refresh token, current user
- `users`: self profile, user listing, staff creation, status update
- `groups`: group CRUD, membership management, join/leave
- `conversations`: inbox, direct messages, group messages, mark as read
- `reports`: report creation, listing, assignment, status transition

## Shared Packages
- `@urban/shared-constants`
- `@urban/shared-types`
- `@urban/shared-utils`

## Environment
Default runtime is AWS DynamoDB with six separate tables.
Tracked template: `apps/api/.env.example`.

Important variables:
- `PORT=3001`
- `API_PREFIX=api`
- `AWS_REGION=ap-southeast-1`
- `AWS_MAX_ATTEMPTS=3`
- `DYNAMODB_USERS_TABLE_NAME=Users`
- `DYNAMODB_GROUPS_TABLE_NAME=Groups`
- `DYNAMODB_MEMBERSHIPS_TABLE_NAME=Memberships`
- `DYNAMODB_MESSAGES_TABLE_NAME=Messages`
- `DYNAMODB_CONVERSATIONS_TABLE_NAME=Conversations`
- `DYNAMODB_REPORTS_TABLE_NAME=Reports`
- `S3_BUCKET_NAME=your-s3-bucket-name`
- `UPLOAD_KEY_PREFIX=uploads`
- `UPLOAD_MAX_FILE_SIZE_BYTES=10485760`
- `JWT_ACCESS_SECRET=change-me-access-secret`
- `JWT_REFRESH_SECRET=change-me-refresh-secret`
- `CHAT_MESSAGE_RATE_LIMIT_WINDOW_SECONDS=10`
- `CHAT_MESSAGE_RATE_LIMIT_MAX_PER_WINDOW=20`

Index names:
- `DYNAMODB_USERS_PHONE_INDEX_NAME=GSI1-Phone`
- `DYNAMODB_USERS_EMAIL_INDEX_NAME=GSI2-Email`
- `DYNAMODB_GROUPS_TYPE_LOCATION_INDEX_NAME=GSI1-Type-Loc`
- `DYNAMODB_MEMBERSHIPS_USER_GROUPS_INDEX_NAME=GSI1-UserGroups`
- `DYNAMODB_CONVERSATIONS_INBOX_STATS_INDEX_NAME=GSI1-InboxStats`
- `DYNAMODB_REPORTS_CATEGORY_LOCATION_INDEX_NAME=GSI1-CatLoc`
- `DYNAMODB_REPORTS_STATUS_LOCATION_INDEX_NAME=GSI2-StatusLoc`

AWS credentials:
- If the machine already has IAM credentials or an AWS profile configured, leave `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` unset.
- If needed, add `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_SESSION_TOKEN` to `apps/api/.env`.
- Only set `DYNAMODB_ENDPOINT` when connecting to DynamoDB Local or another custom endpoint.
- Optional upload vars: `S3_PUBLIC_BASE_URL`, `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE`, `UPLOAD_ALLOWED_MIME_TYPES`.

## AWS DynamoDB
Main flow:
- Update `apps/api/.env` with the real AWS region, table names, and credentials or profile if needed.
- Keep `DYNAMODB_ENDPOINT` unset for AWS.
- Run `pnpm dev:api`.
- Open Swagger UI at `http://localhost:3001/api/docs`.
- Open OpenAPI JSON at `http://localhost:3001/api/docs/json`.
- Open OpenAPI YAML at `http://localhost:3001/api/docs/yaml`.
- Liveness probe: `GET /api/health/live`.
- Readiness probe: `GET /api/health/ready`.
- Upload endpoint: `POST /api/uploads/media` with `multipart/form-data`.

## Local DynamoDB
Local DynamoDB is optional and uses the same six-table layout.

Root scripts:
- `pnpm db:local:up`
- `pnpm db:local:init`
- `pnpm db:local:reset`
- `pnpm db:local:down`
- `pnpm db:local:logs`
- `pnpm db:local:setup`

API scripts:
- `pnpm --filter api db:table:create`
- `pnpm --filter api db:table:delete`
- `pnpm --filter api db:seed`
- `pnpm --filter api db:backfill:message-refs`
- `pnpm --filter api db:local:init`
- `pnpm --filter api db:local:reset`

When using local DynamoDB:
- Set `DYNAMODB_ENDPOINT=http://127.0.0.1:8000`
- Keep the six table names or change them to local variants if preferred
- Start Docker compose from `docker-compose.local.yml`

## Seed Data
Seed script writes into all six tables:
- 5 users: admin, province officer, ward officer, 2 citizens
- 3 groups with memberships
- 3 reports in different statuses
- group conversation and direct conversation sample data

Seeded message data also writes `MESSAGE_REF` records into the `Messages` table for reply lookup.

Seeded accounts all use the same password:
- `admin@smartcity.local` / `Password123!`
- `province.officer@smartcity.local` / `Password123!`
- `ward.officer@smartcity.local` / `Password123!`
- `citizen.a@smartcity.local` / `Password123!`
- `citizen.b@smartcity.local` / `Password123!`

## Message Migration
Use this once on AWS before removing old client behavior:
- `pnpm --filter api db:backfill:message-refs`
- The script scans `Messages`, backfills missing `messageId` from legacy `id` when possible, and writes `MESSAGE_REF` records.
- After that, `replyTo` should always use the API message `id`.

## Fault Tolerance
- Socket and REST message sending are retry-safe when clients reuse `clientMessageId`.
- Message sends are rate-limited per authenticated user.
- New message writes are atomic through DynamoDB transactions.
- Transient DynamoDB and S3 failures are surfaced as HTTP `503` so clients can retry instead of treating them as generic `500` errors.
- `GET /api/health/live` is a fast liveness probe.
- `GET /api/health/ready` checks application state and DynamoDB readiness, and returns `503` while degraded or shutting down.
- The API now enables graceful shutdown hooks so probes can observe shutdown before the process exits.

## Auth Sessions
- Refresh tokens are persisted as hashed session records inside the `Users` table under the same `USER#<id>` partition.
- `POST /api/auth/refresh` now rotates the refresh session and revokes the previous refresh token.
- `POST /api/auth/logout` revokes the refresh session identified by the provided refresh token.
- Access tokens now carry the same session id and are rejected immediately after that session is revoked.
- Legacy access tokens without a session id are rejected immediately and must use `POST /api/auth/refresh` once to obtain a session-based token pair.
- Legacy refresh tokens issued before the session-based rollout can still be used exactly once to migrate into a session-based token pair without forcing sign-in again.
- After that one-time migration, or after `POST /api/auth/logout`, the legacy refresh token is revoked and cannot be reused.

## App Runtime
- Every route is protected by Bearer JWT unless marked public.
- Authorization is role-based and scope-based with `locationCode`.
- GSI lookups are resolved back to full items by primary key.

## Response Format
Successful responses:
```json
{
  "success": true,
  "data": {},
  "meta": {
    "count": 2
  }
}
```

Notes:
- `meta` is included for array responses and currently exposes `count`.
- Single-item responses omit `meta`.

Error responses:
```json
{
  "success": false,
  "error": {
    "statusCode": 400,
    "message": "Invalid credentials.",
    "error": "Bad Request"
  },
  "path": "/api/auth/login",
  "timestamp": "2026-03-17T10:00:00.000Z"
}
```


## Upload API
`POST /api/uploads/media`

Multipart fields:
- `target`: `REPORT`, `MESSAGE`, `AVATAR`, or `GENERAL`
- `entityId` optional: related report/message/user identifier
- `file`: binary file payload

Response data returns:
- `key`: S3 object key
- `url`: object URL or CDN URL when `S3_PUBLIC_BASE_URL` is set
- `bucket`, `contentType`, `size`, `uploadedAt`, `uploadedBy`

Notes:
- `AVATAR` only accepts image mime types.
- Allowed mime types come from `UPLOAD_ALLOWED_MIME_TYPES`.
- Upload endpoint requires Bearer JWT like the rest of the API.
## Chat Realtime
Socket transport uses Socket.IO with namespace `/chat`.

Handshake authentication:
- Send the access JWT in `auth.token` or `auth.accessToken`
- Or send `Authorization: Bearer <access-token>` in handshake headers

Connection event:
- Server emits `chat.ready` after successful authentication
- Payload includes authenticated user, namespace, and `connectedAt`

Client command events:
- `conversation.join`: `{ "conversationId": "group:<groupId>" }` or `{ "conversationId": "dm:<userId>" }`
- `conversation.leave`: same payload as join
- `message.send`: `{ "conversationId": "group:<groupId>", "content": "{\"text\":\"Hello\",\"mention\":[]}", "type": "TEXT", "clientMessageId": "local-id-1", "replyTo": "01JPCY3000GROUPMSG00000001" }`
- `message.update`: `{ "conversationId": "group:<groupId>", "messageId": "01JPCY3000GROUPMSG00000001", "content": "{\"text\":\"Da cap nhat noi dung\",\"mention\":[]}" }`
- `message.delete`: `{ "conversationId": "group:<groupId>", "messageId": "01JPCY3000GROUPMSG00000001" }`
- Reuse the same `clientMessageId` when retrying the same logical message.
- `replyTo` must be the message `id` returned by the API, not `groupId`, `conversationId`, or raw DynamoDB `SK`.
- `conversation.read`: `{ "conversationId": "dm:<userId>" }`
- `typing.start`: `{ "conversationId": "group:<groupId>", "clientTimestamp": "2026-03-17T11:00:00.000Z" }`
- `typing.stop`: same payload as `typing.start`

Server push events:
- `message.created`: new message with per-user `conversationId`, canonical `conversationKey`, and latest summary
- `message.updated`: edited message payload for open conversation views
- `message.deleted`: deleted message tombstone for open conversation views
- `conversation.updated`: inbox summary change after new message, edit of the latest message, delete of the latest message, or read action
- `conversation.removed`: emitted when deleting the last visible message removes the conversation from inbox state
- `conversation.read`: read receipt with `readByUserId` and `readAt`
- `typing.state`: ephemeral typing state for sockets that joined the conversation room
- `chat.error`: emitted on connection auth failure before disconnect

Socket ack format:
```json
{
  "success": true,
  "data": {}
}
```

On command failure:
```json
{
  "success": false,
  "error": {
    "code": "CHAT_MESSAGE_SEND_FAILED",
    "message": "Only active members can send messages to this group.",
    "statusCode": 403
  }
}
```

Notes:
- `conversationId` is route-safe and user-facing, for example `group:01...` or `dm:01...`
- `conversationKey` is the canonical internal conversation identifier, for example `GRP#...` or `DM#...`
- Message sending and read receipts emitted through REST endpoints are also pushed over the same socket events
- Message sends are rate-limited per authenticated user; when exceeded, the API returns HTTP `429` or socket ack error `CHAT_MESSAGE_SEND_FAILED`
- `PATCH /api/conversations/:conversationId/messages/:messageId` edits a message and syncs inbox preview when the latest visible message changes
- `DELETE /api/conversations/:conversationId/messages/:messageId` soft-deletes a message and removes the conversation from inbox when the last visible message is deleted
- `replyTo` must reference a message in the same conversation
- Typing events are only broadcast to sockets that explicitly joined the conversation room via `conversation.join`




