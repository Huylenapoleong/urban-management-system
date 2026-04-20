# Chat Performance Baseline Checklist

Use this checklist before and after each chat-related refactor.

## Runtime Signals (dev mode)

- Open chat detail screen and keep it active for at least 30 seconds.
- Watch logs from useChatPerformanceMonitor:
  - `[Perf][OfficialChatDetail] FPS=...`
  - `chat.header: avg=...ms`
  - `chat.message-list: avg=...ms`
  - `chat.composer: avg=...ms`
  - `chat.media-panels: avg=...ms`
- Capture one baseline snapshot before changes and one snapshot after changes.

## React Profiler Pass

- Run React DevTools Profiler for chat detail interactions:
  - Open conversation
  - Scroll up/down in message list
  - Type and send one message
  - Open and close info/media panels
- Record:
  - Commit count
  - Average commit duration
  - Max commit duration

## JS FPS Pass

- Interact on message list for 20-30 seconds.
- Record average FPS from monitor logs.
- Flag if FPS drops below 45 for more than 3 seconds.

## Change Log Table

| Change ID | Scope | Before FPS | After FPS | Before Avg Commit (ms) | After Avg Commit (ms) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| example-001 | chat.message-list windowing | 42.1 | 54.8 | 18.4 | 9.2 | reduced re-render churn |
