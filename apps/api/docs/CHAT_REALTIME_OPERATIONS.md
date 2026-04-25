# Chat Realtime Operations

This guide is the ops/runbook companion for chat, call, and video-call realtime performance.

Use it together with:
- `/api/health/metrics`
- `/api/health/metrics/prometheus`
- `apps/api/docs/CHAT_PERFORMANCE_CONSISTENCY_PLAN.md`

## Primary Metrics

### Realtime ack latency

Prometheus metrics:
- `urban_api_realtime_ack_total{event, outcome}`
- `urban_api_realtime_ack_average_duration_milliseconds{event}`

Important events:
- `message.send`
- `message.update`
- `message.delete`
- `message.recall`
- `conversation.read`
- `call.init`
- `call.accept`
- `call.reject`
- `call.end`
- `call.heartbeat`
- `webrtc.offer`
- `webrtc.answer`
- `webrtc.ice-candidate`

Recommended dashboard panels:
- realtime ack throughput by event
- realtime ack failure count by event
- realtime ack average duration by event

Suggested first thresholds:
- `message.send` average ack under `150ms` in normal load
- `call.init` average ack under `120ms`
- `webrtc.*` average ack under `80ms`
- failed ack ratio under `1%` for any single event over 5 minutes

### Chat outbox fallback

Prometheus metrics:
- `urban_api_chat_outbox_replay_total{event, outcome}`
- `urban_api_chat_outbox_replay_average_duration_milliseconds{event}`

Outcomes:
- `deferred`
- `success`
- `failed`

Why this matters:
- rising `deferred` means realtime dispatch is missing the fast path more often
- rising `failed` means replay cannot recover cleanly
- replay duration tells us whether fallback recovery itself is becoming slow

Recommended dashboard panels:
- deferred chat outbox events by event name
- replay success/failure by event name
- replay average duration by event name
- current outbox backlog from `/api/health/metrics`

Suggested alerts:
- `failed` replay count > `0` for 5 consecutive minutes
- replay average duration > `1000ms`
- backlog growing continuously for more than `10 minutes`

### HTTP + readiness correlation

Prometheus metrics already exposed:
- `urban_api_http_requests_total`
- `urban_api_http_average_duration_milliseconds`
- `urban_api_http_responses_total{status_code}`
- `urban_api_circuit_breaker_state`

Use these to answer:
- is chat lag really websocket latency, or is the whole API slowing down?
- is DynamoDB/S3 trouble pushing traffic into fallback behavior?

## Call / Video Call Monitoring

### What to watch first

- `call.init` ack latency
- `call.accept` ack latency
- `call.end` ack latency
- `webrtc.offer` / `webrtc.answer` / `webrtc.ice-candidate` ack latency
- any rise in `CHAT_CALL_*_FAILED` acks from client logs

### Operational interpretation

- `call.init` high, but `webrtc.*` low:
  likely access resolution or call-session creation path
- `webrtc.*` high, but `call.init` normal:
  likely signaling spam, transport pressure, or frontend reconnect churn
- outbox deferred rising during call bursts:
  chat dispatch side-effects are falling back too often

## Recommended Dashboards

### Dashboard 1: Chat Realtime Overview

Panels:
- realtime ack total by event
- realtime ack average duration by event
- chat outbox deferred by event
- chat outbox replay failure by event
- active websocket connection count if available from infra

### Dashboard 2: Call / Video Call

Panels:
- `call.init`, `call.accept`, `call.end` average ack latency
- `webrtc.offer`, `webrtc.answer`, `webrtc.ice-candidate` average ack latency
- call ack failures by event
- application logs filtered by `CHAT_CALL_`

### Dashboard 3: Recovery / Fallback

Panels:
- chat outbox backlog
- push outbox backlog
- circuit breaker state
- HTTP `429` / `503`

## Release Gate Suggestions

Before a large FE test or release:
- run a burst test for direct messages
- run a burst test for group messages
- run a burst test for `call.init + accept + end`
- run a burst test for `webrtc.*` signaling volume

Ship only when:
- average ack latency stays inside agreed thresholds
- replay failures are zero in the test window
- no unexplained outbox backlog growth appears

## FE / QA Coordination Notes

- FE should log ack error code, message, and `conversationId` for every failed call/chat socket command.
- QA should test duplicate `call.init`, stale `call.accept`, and long-call heartbeat refresh.
- `call.heartbeat` is now available for long-running calls and should be sent periodically once the call is active.
- Tune `CHAT_CALL_INVITE_TTL_SECONDS` and `CHAT_CALL_ACTIVE_TTL_SECONDS` deliberately; if active calls can run long, rely on `call.heartbeat` rather than inflating TTL blindly.
