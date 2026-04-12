# Urban Management API

NestJS backend for SmartCity OTT using six DynamoDB tables on AWS.

## FE Handoff

- Swagger UI: `http://localhost:3001/api/docs`
- Integration guide: `apps/api/docs/FE_INTEGRATION.md`
- Postman collection: `apps/api/docs/postman/urban-management-api.postman_collection.json`
- Postman environment: `apps/api/docs/postman/urban-management-api.postman_environment.json`
- Release checklist: `apps/api/docs/RELEASE_CHECKLIST.md`

## Modules

- `auth`: citizen registration/login, OTP-based register/login flows, refresh token, logout, password change/reset, current user
- `users`: self profile, user listing, staff creation, status update, presence lookup, push device registry
- `groups`: group CRUD, membership management, join/leave
- `conversations`: inbox, direct messages, group messages, realtime chat, mark as read, audit, archive/mute/pin preferences
- `reports`: report creation, listing, assignment, status transition, audit trail, linked group conversations
- `uploads`: S3 media upload for reports, messages, avatars, and general files

## Shared Packages

- `@urban/shared-constants`
- `@urban/shared-types`
- `@urban/shared-utils`

## Product Policy Decisions

These are intentional product/backend policies, not accidental restrictions:

- Direct messages are not globally open. Citizen-to-citizen DM is blocked; DM access is constrained by role and scope.
- Group management is membership-based. `ADMIN` can manage any group, while non-admin staff must be an `OWNER` or `OFFICER` member to manage a group.
- Report status transitions follow a backend state machine. FE should only show actions valid for the current status.

## Environment

Default runtime is AWS DynamoDB with six separate tables.
Tracked template: `apps/api/.env.example`.

Important variables:

- `PORT=3001`
- `API_PREFIX=api`
- `NODE_ENV=development`
- `SWAGGER_ENABLED=true`
- `CORS_ORIGIN=http://localhost:3000,http://localhost:8081`
- `AWS_REGION=ap-southeast-1`
- `AWS_MAX_ATTEMPTS=3`
- `DYNAMODB_USERS_TABLE_NAME=Users`
- `DYNAMODB_GROUPS_TABLE_NAME=Groups`
- `DYNAMODB_MEMBERSHIPS_TABLE_NAME=Memberships`
- `DYNAMODB_MESSAGES_TABLE_NAME=Messages`
- `DYNAMODB_CONVERSATIONS_TABLE_NAME=Conversations`
- `DYNAMODB_REPORTS_TABLE_NAME=Reports`
- `REDIS_URL=redis://127.0.0.1:6379`
- `REDIS_KEY_PREFIX=urban`
- `CHAT_PRESENCE_TTL_SECONDS=90`
- `CHAT_PRESENCE_HEARTBEAT_SECONDS=30`
- `CHAT_PRESENCE_LAST_SEEN_TTL_SECONDS=2592000`
- `CHAT_OUTBOX_POLL_INTERVAL_MS=3000`
- `CHAT_OUTBOX_BATCH_SIZE=100`
- `CHAT_OUTBOX_SHARD_COUNT=8`
- `PUSH_PROVIDER=log`
- `PUSH_WEBHOOK_URL` optional bridge endpoint when `PUSH_PROVIDER=webhook`
- `AUTH_OTP_PROVIDER=log`
- `AUTH_OTP_WEBHOOK_URL` optional bridge endpoint when `AUTH_OTP_PROVIDER=webhook`
- `AUTH_OTP_SMTP_HOST=smtp.gmail.com`
- `AUTH_OTP_SMTP_PORT=465`
- `AUTH_OTP_SMTP_SECURE=true`
- `AUTH_OTP_SMTP_USERNAME=your-email@gmail.com`
- `AUTH_OTP_SMTP_PASSWORD=your-app-password`
- `AUTH_OTP_SMTP_FROM=Urban Management <your-email@gmail.com>`
- `AUTH_OTP_SMTP_HELO` optional SMTP HELO host
- `AUTH_OTP_CODE_LENGTH=6`
- `AUTH_OTP_TTL_SECONDS=300`
- `AUTH_OTP_RESEND_COOLDOWN_SECONDS=60`
- `AUTH_OTP_MAX_ATTEMPTS=5`
- `AUTH_OTP_REQUEST_RATE_LIMIT_WINDOW_SECONDS=3600`
- `AUTH_OTP_REQUEST_RATE_LIMIT_MAX_PER_WINDOW=10`
- `AUTH_OTP_REDIS_LOCK_SECONDS=5`
- `AUTH_REGISTER_DRAFT_TTL_SECONDS=900`
- `PUSH_SKIP_ACTIVE_USERS=true`
- `PUSH_OUTBOX_POLL_INTERVAL_MS=4000`
- `PUSH_OUTBOX_BATCH_SIZE=100`
- `PUSH_OUTBOX_SHARD_COUNT=8`
- `CIRCUIT_BREAKER_FAILURE_THRESHOLD=5`
- `CIRCUIT_BREAKER_OPEN_DURATION_MS=30000`
- `S3_BUCKET_NAME=your-s3-bucket-name`
- `UPLOAD_KEY_PREFIX=uploads`
- `UPLOAD_MAX_FILE_SIZE_BYTES=10485760`
- `JWT_ACCESS_SECRET=change-me-access-secret`
- `JWT_REFRESH_SECRET=change-me-refresh-secret`
- `PASSWORD_MIN_LENGTH=10`
- `PASSWORD_MAX_LENGTH=64`
- `PASSWORD_MIN_CHARACTER_CLASSES=3`
- `PASSWORD_REQUIRE_SYMBOL=false`
- `PASSWORD_PRIVILEGED_MIN_LENGTH=12`
- `PASSWORD_PRIVILEGED_MIN_CHARACTER_CLASSES=4`
- `PASSWORD_PRIVILEGED_REQUIRE_SYMBOL=true`
- `PASSWORD_BLOCKLIST_ENABLED=true`
- `PASSWORD_BLOCKLIST_TERMS` optional extra comma-separated weak terms
- `CHAT_MESSAGE_RATE_LIMIT_WINDOW_SECONDS=10`
- `CHAT_MESSAGE_RATE_LIMIT_MAX_PER_WINDOW=20`
- `RETENTION_EXPIRED_SESSION_GRACE_DAYS=30`
- `RETENTION_DISMISSED_SESSION_DAYS=14`
- `RETENTION_AUTH_EMAIL_OTP_DAYS=2`
- `RETENTION_AUTH_REGISTER_DRAFT_DAYS=2`
- `RETENTION_REVOKED_REFRESH_TOKEN_GRACE_DAYS=30`
- `RETENTION_CHAT_OUTBOX_DAYS=7`
- `RETENTION_PUSH_OUTBOX_DAYS=7`
- `RETENTION_DELETED_CONVERSATION_SUMMARY_DAYS=30`
- `RETENTION_MAINTENANCE_ENABLED=false`
- `RETENTION_MAINTENANCE_INTERVAL_MS=21600000`
- `RETENTION_MAINTENANCE_LOCK_TTL_MS=1800000`
- `CHAT_RECONCILIATION_MAINTENANCE_ENABLED=false`
- `CHAT_RECONCILIATION_MAINTENANCE_MODE=preview`
- `CHAT_RECONCILIATION_MAINTENANCE_INTERVAL_MS=21600000`
- `CHAT_RECONCILIATION_MAINTENANCE_LOCK_TTL_MS=1800000`
- `GROUP_DELETE_CLEANUP_ENABLED=true`
- `GROUP_DELETE_CLEANUP_INTERVAL_MS=300000`
- `GROUP_DELETE_CLEANUP_LOCK_TTL_MS=600000`

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
- Redis is optional for local single-instance development; if `REDIS_URL` is unset the API falls back to in-memory presence and local outbox locking, and OTP still works with DynamoDB cooldown/attempt guards.
- `CORS_ORIGIN` is a comma-separated exact allowlist for browser origins; requests without an `Origin` header, such as server-to-server calls or Postman, are still accepted.
- In production, the API fails fast on unsafe config such as default JWT secrets, identical access/refresh secrets, wildcard `CORS_ORIGIN`, `PUSH_PROVIDER=webhook` without `PUSH_WEBHOOK_URL`, `AUTH_OTP_PROVIDER=webhook` without `AUTH_OTP_WEBHOOK_URL`, or `AUTH_OTP_PROVIDER=smtp` without required SMTP settings.

## AWS DynamoDB

Main flow:

- Update `apps/api/.env` with the real AWS region, table names, and credentials or profile if needed.
- Keep `DYNAMODB_ENDPOINT` unset for AWS.
- Start Redis if you want multi-instance websocket fanout or shared presence.
- Run `pnpm dev:api`.
- Open Swagger UI at `http://localhost:3001/api/docs` when `SWAGGER_ENABLED=true`.
- Open OpenAPI JSON at `http://localhost:3001/api/docs/json`.
- Open OpenAPI YAML at `http://localhost:3001/api/docs/yaml`.
- Liveness probe: `GET /api/health/live`.
- Readiness probe: `GET /api/health/ready`.
- Metrics endpoint (JSON): `GET /api/health/metrics`.
- Prometheus scrape endpoint: `GET /api/health/metrics/prometheus`.
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

- `admin@smartcity.local` / `Ums@2026Secure1`
- `province.officer@smartcity.local` / `Ums@2026Secure1`
- `ward.officer@smartcity.local` / `Ums@2026Secure1`
- `citizen.a@smartcity.local` / `Ums@2026Secure1`
- `citizen.b@smartcity.local` / `Ums@2026Secure1`

## Message Migration

Use this once on AWS before removing old client behavior:

- `pnpm --filter api db:backfill:message-refs`
- The script scans `Messages`, backfills missing `messageId` from legacy `id` when possible, and writes `MESSAGE_REF` records.
- After that, `replyTo` should always use the API message `id`.

## Fault Tolerance

- Socket and REST message sending are retry-safe when clients reuse `clientMessageId`.
- New message writes are atomic through DynamoDB transactions.
- Chat send, update, delete, and read events write a chat outbox record before realtime fanout; if emit fails mid-flight, the outbox worker retries dispatch.
- Outbox fanout includes stable `eventId` so clients can deduplicate repeated socket deliveries.
- Redis-backed Socket.IO adapter is enabled automatically when `REDIS_URL` is set; this is the recommended mode for multi-instance deployments.
- Presence is shared through Redis when configured, and falls back to process memory for single-instance local development.
- Message sends are rate-limited per authenticated user.
- Transient DynamoDB and S3 failures are surfaced as HTTP `503` so clients can retry instead of treating them as generic `500` errors.
- DynamoDB and S3 are protected by circuit breakers; repeated retryable failures open the breaker and future calls fail fast with `503` until the cool-down window expires.
- `GET /api/health/live` is a fast liveness probe.
- `GET /api/health/ready` checks application state, Redis health, circuit-breaker state, DynamoDB readiness, and S3 configuration.
- `GET /api/health/metrics` exposes JSON metrics for HTTP request volume, `429`/`503`, session revocations, outbox backlog, and circuit-breaker snapshots.
- `GET /api/health/metrics/prometheus` exposes the same operational signals in Prometheus text exposition format for scraping.
- Every HTTP response includes `X-Request-Id`; server-side request logs emit the same id for traceability.
- The API enables graceful shutdown hooks so probes can observe shutdown before the process exits.

### Client Retry Policy

Recommended client behavior:

- `401`: attempt refresh once, then redirect to login if refresh fails.
- `429`: exponential backoff with jitter; if the server sends `Retry-After`, honor it.
- `503`: limited retries with backoff.
- `message.send`: only retry when reusing the same `clientMessageId` for the same logical message.
- `message.update` and `message.delete`: safe to retry only when the client can tolerate duplicate socket events by `eventId`.

## Auth Sessions and OTP

- Refresh tokens are persisted as hashed session records inside the `Users` table under the same `USER#<id>` partition.
- `POST /api/auth/refresh` rotates the refresh session and revokes the previous refresh token.
- `POST /api/auth/logout` revokes the refresh session identified by the provided refresh token.
- `GET /api/auth/sessions` lists active sessions and recent session history for the current user and marks the active session with `isCurrent=true`.
- `DELETE /api/auth/sessions/:sessionId` revokes one specific session and disconnects its sockets immediately.
- `DELETE /api/auth/sessions/:sessionId/history` hides one revoked or expired session from the current user's security history (`dismissedAt`).
- `POST /api/auth/logout-all` revokes every non-expired session for the current user and disconnects all of their sockets immediately.
- `POST /api/auth/register`, `POST /api/auth/login`, and `POST /api/auth/refresh` capture optional session metadata from `User-Agent`, `X-Device-Id`, `X-App-Variant`, and client IP.
- OTP-based auth endpoints:
  - `POST /api/auth/register/request-otp`
  - `POST /api/auth/register/verify-otp`
  - `POST /api/auth/login/request-otp`
  - `POST /api/auth/login/verify-otp`
  - `POST /api/auth/password/forgot/request`
  - `POST /api/auth/password/forgot/confirm`
  - `POST /api/auth/password/change/request-otp`
  - `POST /api/auth/password/change`
- OTP delivery providers:
  - `log`: write OTP to server log (dev/local)
  - `webhook`: forward OTP payload to external mail service
  - `smtp`: send email directly via SMTP (supports personal mailbox + app password)
- For `webhook` and `smtp`, OTP delivery is enqueued asynchronously (Redis-backed when available, local in-process queue as fallback) so request-OTP APIs respond faster; worker retries transient delivery failures.
- OTP safety controls:
  - DynamoDB challenge state includes expiry, resend cooldown, and max verification attempts.
  - when Redis is connected, OTP request flow adds a short distributed lock per `purpose+email` to reduce concurrent race conditions.
  - when Redis is connected, OTP request flow adds per-window request rate limiting per `purpose+email`.
- Password policy:
  - Standard accounts: default `10-64` chars, at least `3/4` character classes.
  - Privileged accounts (`ADMIN`, `WARD_OFFICER`, `PROVINCE_OFFICER`): default minimum `12` chars, all `4/4` classes, symbol required.
  - New passwords are blocked when they are common/predictable or include personal identifiers (email local-part, name token, phone digits).
- Resetting password revokes all refresh sessions and disconnects realtime sockets for that user.
- Changing password revokes other sessions but keeps the current session active.
- Access tokens now carry the same session id and are rejected immediately after that session is revoked.
- Legacy access tokens without a session id are rejected immediately and must use `POST /api/auth/refresh` once to obtain a session-based token pair.
- Legacy refresh tokens issued before the session-based rollout can still be used exactly once to migrate into a session-based token pair without forcing sign-in again.
- After that one-time migration, or after `POST /api/auth/logout`, the legacy refresh token is revoked and cannot be reused.

## Retention Maintenance

- `GET /api/maintenance/retention/preview` previews purge candidates for expired refresh sessions, dismissed refresh-session history entries, expired auth OTP challenges, expired registration drafts, expired refresh-token revocations, old chat outbox events, old push outbox events, and inbox summaries soft-deleted for longer than the configured retention window.
- `POST /api/maintenance/retention/purge` deletes those candidates.
- When `RETENTION_MAINTENANCE_ENABLED=true`, an automatic scheduler runs the same purge flow every `RETENTION_MAINTENANCE_INTERVAL_MS`.
- If Redis is configured and connected, the automatic scheduler uses a Redis lock with `RETENTION_MAINTENANCE_LOCK_TTL_MS` to avoid duplicate runs across multiple API instances.
- Both endpoints are `ADMIN`-only.
- Core domain records such as messages, reports, groups, and audit events are intentionally not hard-deleted by this maintenance flow.

## Chat Reconciliation

- `GET /api/maintenance/chat-reconciliation/preview` previews inbox-summary drift between the `Conversations` and `Messages` tables.
- `POST /api/maintenance/chat-reconciliation/repair` repairs existing inbox summaries when preview, sender, unread count, key/index metadata, or updated timestamps drift from the underlying active message history.
- Orphaned inbox summaries with no remaining active messages are removed by the repair flow.
- The repair flow intentionally does not recreate missing summaries, because a missing inbox can be the valid result of `delete conversation for me`.
- When `CHAT_RECONCILIATION_MAINTENANCE_ENABLED=true`, an automatic scheduler runs every `CHAT_RECONCILIATION_MAINTENANCE_INTERVAL_MS` in `preview` or `repair` mode according to `CHAT_RECONCILIATION_MAINTENANCE_MODE`.
- If Redis is configured and connected, the scheduler uses `CHAT_RECONCILIATION_MAINTENANCE_LOCK_TTL_MS` to avoid duplicate runs across multiple API instances.

## Group Cleanup Replay

- `deleteGroup` now commits the deleted group metadata together with a durable cleanup task, then attempts immediate cleanup as a best-effort replay.
- If the immediate cleanup flow fails part-way, the cleanup task remains in the `Groups` table and can be replayed safely without re-deleting the group metadata.
- When `GROUP_DELETE_CLEANUP_ENABLED=true`, an automatic scheduler scans and retries pending cleanup tasks every `GROUP_DELETE_CLEANUP_INTERVAL_MS`.
- If Redis is configured and connected, the scheduler uses `GROUP_DELETE_CLEANUP_LOCK_TTL_MS` to avoid duplicate runs across multiple API instances.

## Search and Pagination

List endpoints now support cursor-based pagination through `meta.nextCursor`.
Send that value back as `cursor` on the next request to continue the same result set.

Supported query patterns:

- `GET /api/users`: `role`, `status`, `locationCode`, `q`, `cursor`, `limit`
- `GET /api/groups`: `mine`, `groupType`, `locationCode`, `q`, `cursor`, `limit`
- `GET /api/reports`: `mine`, `assignedToMe`, `status`, `category`, `priority`, `assignedOfficerId`, `locationCode`, `q`, `createdFrom`, `createdTo`, `cursor`, `limit`
- `GET /api/conversations`: `q`, `isGroup`, `unreadOnly`, `includeArchived`, `cursor`, `limit`
- `GET /api/conversations/:conversationId/messages`: `q`, `type`, `fromUserId`, `before`, `after`, `cursor`, `limit`

Notes:

- `cursor` is opaque and should be treated as-is by clients.
- Search on `users`, `groups`, `reports`, `conversations`, and `messages-in-one-conversation` is currently filter-based rather than full-text indexed search.
- Message search is intentionally scoped to one conversation; there is still no global full-text search across all messages.

## App Runtime

- Every route is protected by Bearer JWT unless marked public.
- Authorization is role-based and scope-based with `locationCode`.
- GSI lookups are resolved back to full items by primary key.

## Response Format

Successful responses:

All HTTP responses also include the `X-Request-Id` header for correlation.

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
  "timestamp": "2026-03-17T10:00:00.000Z",
  "requestId": "01JREQUEST0000000000000001"
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

## User Presence API

- `GET /api/users/me/presence`
- `GET /api/users/:userId/presence`

Response fields:

- `userId`
- `isActive`
- `activeSocketCount`
- `lastSeenAt` when offline
- `occurredAt`

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
- `conversation.delete`: same payload as join; removes the conversation from the current user inbox only
- `message.send`: `{ "conversationId": "group:<groupId>", "content": "{\"text\":\"Hello\",\"mention\":[]}", "type": "TEXT", "clientMessageId": "local-id-1", "replyTo": "01JPCY3000GROUPMSG00000001" }`
- `message.update`: `{ "conversationId": "group:<groupId>", "messageId": "01JPCY3000GROUPMSG00000001", "content": "{\"text\":\"Da cap nhat noi dung\",\"mention\":[]}" }`
- `message.delete`: `{ "conversationId": "group:<groupId>", "messageId": "01JPCY3000GROUPMSG00000001" }`
- Reuse the same `clientMessageId` when retrying the same logical message.
- `replyTo` must be the message `id` returned by the API, not `groupId`, `conversationId`, or raw DynamoDB `SK`.
- `conversation.read`: `{ "conversationId": "dm:<userId>" }`
- `typing.start`: `{ "conversationId": "group:<groupId>", "clientTimestamp": "2026-03-17T11:00:00.000Z" }`
- `typing.stop`: same payload as `typing.start`

Server push events:

- `message.created`: new message with per-user `conversationId`, canonical `conversationKey`, stable `eventId`, and latest summary
- `message.updated`: edited message payload for open conversation views
- `message.deleted`: deleted message tombstone for open conversation views
- `conversation.updated`: inbox summary change after new message, edit of the latest message, delete of the latest message, or read action
- `conversation.removed`: emitted when deleting the last visible message removes the conversation from inbox state, or when a user deletes that conversation from their own inbox
- `conversation.read`: read receipt with `readByUserId` and `readAt`
- `presence.snapshot`: emitted to the joining socket after `conversation.join`
- `presence.updated`: emitted to conversation room members when a participant connects or disconnects
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
- Message sending and read receipts emitted through REST endpoints are also pushed over the same socket events.
- Message sends are rate-limited per authenticated user; when exceeded, the API returns HTTP `429` or socket ack error `CHAT_MESSAGE_SEND_FAILED`.
- `PATCH /api/conversations/:conversationId/messages/:messageId` edits a message and syncs inbox preview when the latest visible message changes.
- `DELETE /api/conversations/:conversationId/messages/:messageId` soft-deletes a message and removes the conversation from inbox when the last visible message is deleted.
- `DELETE /api/conversations/:conversationId` removes the conversation from the current user inbox only; shared messages remain intact for other participants and the inbox is recreated automatically on a new incoming message.
- `replyTo` must reference a message in the same conversation.
- Typing events are only broadcast to sockets that explicitly joined the conversation room via `conversation.join`.
- Outbox replay can re-emit the same logical event during recovery; clients should deduplicate by `eventId`.

## Push Notifications

- `GET /api/users/me/push-devices` lists the current user registered push devices.
- `POST /api/users/me/push-devices` registers or updates a device token.
- `DELETE /api/users/me/push-devices/:deviceId` removes a device token.
- Push dispatch is durable through a push outbox in the `Users` table.
- Supported backend modes:
  - `PUSH_PROVIDER=log`: log-only delivery for local/dev.
  - `PUSH_PROVIDER=webhook`: POST JSON payloads to `PUSH_WEBHOOK_URL` so an external bridge can talk to FCM/APNs/Web Push.
  - `PUSH_PROVIDER=disabled`: disable external delivery while still allowing device registry APIs.
- Chat message push skips active users by default and also suppresses notifications for conversations muted through `mutedUntil`.
- Report assignment and report status change events also enqueue push notifications.

## Audit Trail

- `GET /api/conversations/:conversationId/audit` returns chat audit events like `MESSAGE_CREATED`, `MESSAGE_UPDATED`, and `MESSAGE_DELETED`.
- `GET /api/reports/:reportId/audit` returns report audit events like create, update, assignment, status transitions, delete, and group-link changes.
- Audit events are stored durably in the owning table partition so they stay colocated with the main entity.

## Report Conversation Links

- `GET /api/reports/:reportId/conversations` lists group conversations linked to a report.
- `POST /api/reports/:reportId/conversations` links an additional group conversation using `{ "groupId": "..." }`.
- The report `groupId` is treated as an implicit primary linked conversation and is included in the list response.

## Conversation Preferences

- `PATCH /api/conversations/:conversationId/preferences` updates per-user inbox preferences.
- Supported fields: `archived`, `isPinned`, `mutedUntil`.
- `archived` hides the conversation from default inbox listing; use `includeArchived=true` to list archived items.
- New incoming messages automatically unarchive the conversation for that user while preserving pin and mute settings.

## Message State

- `GET /api/conversations/:conversationId/messages` now returns aggregate sender-facing state fields when available: `recipientCount`, `deliveredCount`, `readByCount`, `deliveryState`, `lastReadAt`.
- These states are server-side aggregates derived from conversation summaries and read markers, not device-level acknowledgements.
