# API Release Checklist

Backend release checklist for `apps/api`.

## 1. Pre-release

- Confirm branch is clean and intended files only are included.
- Run:
  - `pnpm --filter api lint`
  - `pnpm --filter api build`
  - `pnpm --filter api test -- --runInBand`
  - `pnpm --filter api test:e2e -- --runInBand`
- Review `apps/api/.env` or deployment secrets:
  - `NODE_ENV=production`
  - `SWAGGER_ENABLED=false` unless explicitly needed
  - `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are strong and different
  - `CORS_ORIGIN` is an exact allowlist, not `*`
  - `PUSH_PROVIDER=webhook` only when `PUSH_WEBHOOK_URL` is set
  - AWS table names and index names match production
  - `S3_BUCKET_NAME` is correct if uploads are enabled
  - `REDIS_URL` is set if multi-instance socket/presence is required
- Confirm IAM/credentials can access:
  - DynamoDB tables
  - S3 bucket
  - Redis endpoint if used

## 2. Deployment checks

- Deploy one canary or first instance.
- Verify app boots without config validation errors.
- Verify readiness:
  - `GET /api/health/live`
  - `GET /api/health/ready`
- Verify admin-only metrics with a valid admin token:
  - `GET /api/health/metrics`
  - `GET /api/health/metrics/prometheus`

## 3. Smoke tests

- Auth:
  - login
  - refresh
  - logout
  - logout-all or revoke a session
- Users:
  - get self profile
  - update self profile
  - list users as admin/officer
- Groups:
  - create group
  - join/leave group
  - update group
  - delete group and confirm cleanup task is created
- Reports:
  - create report
  - update report
  - assign report
  - valid status transition
  - invalid status transition is rejected
- Chat REST:
  - list conversations
  - send message
  - reply to message using `replyTo=message.id`
  - edit message
  - delete message
  - delete conversation for me
- Chat socket:
  - connect with access token
  - join room
  - receive `message.created`
  - receive `conversation.read`
- Uploads:
  - upload a small file to S3

## 4. Post-release monitoring

- Check logs for:
  - `401`, `403`, `409`, `429`, `503`
  - circuit breaker open events
  - chat outbox replay warnings
  - retention / reconciliation / cleanup warnings
- Check metrics for:
  - request volume and status distribution
  - session revocation counters
  - chat outbox backlog
  - push outbox backlog
  - circuit breaker state
- Confirm no unexpected growth in:
  - cleanup tasks
  - unread drift / reconciliation candidates
  - push token conflict removals

## 5. Rollback triggers

Rollback or stop rollout if any of these occur:

- app fails readiness on healthy infrastructure
- auth flow breaks for normal login/refresh/logout
- reports cannot be created or status transitions fail unexpectedly
- chat messages are accepted but not visible to recipients
- outbox backlog grows continuously without draining
- circuit breakers open and stay open under normal load
- production config validation reveals bad secrets or wildcard CORS

## 6. Operational notes

- `delete conversation` is per-user inbox cleanup only; shared messages remain.
- `delete message` is a soft delete and may trigger summary refresh.
- `delete group` is durable via cleanup task replay, not one giant fan-out transaction.
- Swagger is intended for non-production or explicitly enabled environments.
