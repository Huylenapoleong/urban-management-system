# Cap nhat du an urban-management-system

## Tong quan
Du an urban-management-system la he sinh thai quan ly do thi (SmartCity) gom BE (NestJS), cac ung dung web/di dong, va cac goi chia se. Trong do, BE tap trung vao chat thoi gian thuc, bao cao su co, va quan ly nhom; mobile-app-fluter la du an Flutter (hien dang o boilerplate mac dinh).

## Cau truc chinh
- apps/api: Backend NestJS + DynamoDB, Redis, S3, realtime chat
- apps/mobile-app-fluter: Flutter app (chua co phan mo ta chuc nang cu the)
- apps/mobile-app: Expo/React Native app
- apps/web-app: Vite web app
- apps/admin-web: Admin web
- packages/*: shared-constants, shared-types, shared-utils

## Chuc nang chinh (BE)
- Auth: OTP register/login, refresh token, logout, doi/quen mat khau
- Users: ho so, danh sach nguoi dung, tao nhan vien, presence, push device
- Groups: CRUD nhom, tham gia/roi nhom, quan ly thanh vien
- Conversations: inbox, DM, group chat, danh dau da doc, mute/pin, audit
- Reports: tao bao cao, phan cong, chuyen trang thai, audit trail
- Uploads: S3 media upload (report, message, avatar, file)

## API tong quan (BE)
### Response envelope
- Success: { success: true, data, meta? }
- Error: { success: false, error, path, timestamp, requestId }

### Auth
- POST /auth/register, /auth/login, /auth/refresh
- POST /auth/logout, /auth/logout-all
- GET /auth/me
- GET /auth/sessions
- DELETE /auth/sessions/:sessionId, /auth/sessions/:sessionId/history
- OTP register/login: /auth/register/request-otp, /auth/register/verify-otp, /auth/login/request-otp, /auth/login/verify-otp
- Password: /auth/password/forgot/request, /auth/password/forgot/verify, /auth/password/forgot/confirm
- Password change: /auth/password/change/request-otp, /auth/password/change
- Account deactivate: /auth/account/deactivate/request-otp, /auth/account/deactivate/confirm
- Account delete: /auth/account/delete/request-otp, /auth/account/delete/confirm
- Account reactivate: /auth/account/reactivate/request-otp, /auth/account/reactivate/confirm
- Unlock: /auth/unlock/request-otp, /auth/unlock/confirm

### Chatbot
- POST /chatbot/ask
- POST /chatbot/ask/stream (SSE)
- POST /chatbot/officer/generate-report
- POST /chatbot/officer/summarize-group

### Users
- GET /users (cursor pagination)
- POST /users (tao officer/admin)
- GET /users/:userId
- PATCH /users/:userId/status
- GET /users/:userId/presence
- GET /users/discover
- GET /users/search
- GET /users/me, PATCH /users/me
- DELETE /users/me/avatar
- Blocks: GET /users/me/blocks, POST /users/me/blocks/:userId, DELETE /users/me/blocks/:userId
- Friends: GET /users/me/friends, DELETE /users/me/friends/:userId, POST /users/me/friends/:userId/request
- Friend requests: GET /users/me/friend-requests, POST /users/me/friend-requests/:userId/accept,
  POST /users/me/friend-requests/:userId/reject, POST /users/me/friend-requests/:userId/cancel
- Aliases: PUT /users/me/contacts/:userId/alias, DELETE /users/me/contacts/:userId/alias
- Presence me: GET /users/me/presence
- Push devices: GET /users/me/push-devices, POST /users/me/push-devices, DELETE /users/me/push-devices/:deviceId

### Groups
- POST /groups, GET /groups, GET /groups/:groupId
- PATCH /groups/:groupId, DELETE /groups/:groupId
- POST /groups/:groupId/join, POST /groups/:groupId/leave
- POST /groups/invite-links/:code/join
- GET /groups/:groupId/members
- New flow: POST /groups/:groupId/members, PATCH /groups/:groupId/members/:userId/role, DELETE /groups/:groupId/members/:userId
- Legacy: PATCH /groups/:groupId/members/:userId (deprecated)
- POST /groups/:groupId/ownership-transfer
- POST /groups/:groupId/dissolve
- Audit: GET /groups/:groupId/audit
- Bans: GET /groups/:groupId/bans, POST /groups/:groupId/bans/:userId, DELETE /groups/:groupId/bans/:userId
- Invite links: GET /groups/:groupId/invite-links, POST /groups/:groupId/invite-links, DELETE /groups/:groupId/invite-links/:inviteId

### Conversations + Messages
- GET /conversations (cursor pagination)
- GET /conversations/:conversationId/messages (cursor pagination)
- POST /conversations/:conversationId/messages
- PATCH /conversations/:conversationId/messages/:messageId
- DELETE /conversations/:conversationId/messages/:messageId (admin)
- POST /conversations/:conversationId/messages/:messageId/recall
- POST /conversations/:conversationId/messages/:messageId/forward
- POST /conversations/:conversationId/read
- DELETE /conversations/:conversationId (delete in current user inbox)
- GET /conversations/:conversationId/audit
- POST /conversations/:conversationId/clear
- PATCH /conversations/:conversationId/preferences
- POST /conversations/direct
- Direct requests: GET /conversations/direct-requests, POST /conversations/direct-requests,
  POST /conversations/direct-requests/:conversationId/accept, /block, /ignore, /reject

### Reports
- POST /reports, GET /reports, GET /reports/:reportId
- PATCH /reports/:reportId
- DELETE /reports/:reportId
- POST /reports/:reportId/assign
- POST /reports/:reportId/status
- GET /reports/:reportId/audit
- GET /reports/:reportId/conversations
- POST /reports/:reportId/conversations

### Uploads
- GET /uploads/limits
- POST /uploads/media (multipart)
- GET /uploads/media?target=...
- DELETE /uploads/media
- POST /uploads/presign/upload
- POST /uploads/presign/download

### Locations (Public, không cần Auth)
- GET /locations/provinces — Danh sách 63 tỉnh/thành từ snapshot V2
- GET /locations/wards?provinceCode={xx} — Danh sách phường/xã theo tỉnh
- GET /locations/search?q={query}&limit={n} — Tìm kiếm tỉnh/phường theo tên
- GET /locations/resolve?locationCode={code} — Phân giải locationCode thành nhãn hiển thị

**Format locationCode V2** (thay thế format cũ 4-phần):
- Province-level: `VN-{provinceCode}` (ví dụ: `VN-79` = TP.HCM)
- Ward-level: `VN-{provinceCode}-{wardCode}` (ví dụ: `VN-79-00001`)
- ProvinceCode: 2 chữ số, WardCode: 5 chữ số
- Pattern: `/^VN-(\d{2})(?:-(\d{5}))?$/`
- Data source: `vietnam-location-v2.snapshot.json` (load local)

### Health + Maintenance
- GET /api (health check)
- GET /health/live, /health/ready
- GET /health/metrics, /health/metrics/prometheus
- POST /maintenance/retention/purge, GET /maintenance/retention/preview
- POST /maintenance/chat-reconciliation/repair, GET /maintenance/chat-reconciliation/preview

### Socket.IO (namespace /chat)
- Client events: conversation.join/leave/delete/read, message.send/update/delete/recall, typing.start/stop,
  call.init/accept/reject/end/heartbeat, webrtc.offer/answer/ice-candidate
- Server events: chat.ready, message.created/updated/deleted, conversation.updated/removed/read,
  presence.snapshot/updated, typing.state, chat.error, call.*, webrtc.*
- Client rules: dedupe by eventId, retry send with same clientMessageId, rejoin after reconnect

### Error + retry
- 401: refresh once
- 429: backoff + jitter
- 503: limited retries + backoff
- message send retry chi khi giu nguyen clientMessageId
- [PENDING] Message Reactions: Hien tai dang luu local (giong web-app). Can bo sung API: `POST /conversations/:id/messages/:mid/reactions` va sync qua Socket.
- [PENDING] Location Sharing: Hien tai gui link Google Maps. Co the nang cap thanh map preview neu can.

## Chat va nhom (tai lieu thiet ke)
- Chat quan tam den do tre (latency), outbox replay, va nhat quan nghiep vu
- Kien truc nhom de xuat ro role OWNER/DEPUTY/MEMBER, message policy
- Lo trinh trien khai nhom: doi ten role, ownership transfer, tach endpoint, ban/unban, invite link, audit, system events

## Ops + release (BE)
- Runbook realtime: ack latency, outbox fallback, call/webrtc metrics
- Release checklist: lint/build/test, readiness, metrics, smoke tests, rollback triggers

## Shared packages
### shared-constants
- User roles/statuses, group types/roles/policy, message types, report categories/status/priority
- Socket namespace + events, session scopes, OTP purposes
- Regex + pagination defaults

### shared-types
- AuthTokenPair, AuthSessionInfo, JwtClaims
- UserProfile, AuthenticatedUser, UserDirectoryItem
- GroupMetadata, GroupMembership, GroupBan, GroupInviteLink
- MessageItem, ConversationSummary
- ReportItem, AuditEventItem
- ApiResponse, ApiErrorResponse, ChatSocketAck

### shared-utils
- Ulid + nowIso helpers
- Normalize phone/email, parse locationCode (hỗ trợ legacy 4-phần lẫn V2 mới)
- DynamoDB key builders (USER#, GROUP#, CONV#, REPORT#, OUTBOX#)
- Conversation id helpers (DM/GRP)
- `isSameProvince(left, right)` / `isSameWard(left, right)` để so sánh phạm vi địa lý

## Hien trang mobile-app-fluter
- README hien la template Flutter mac dinh, chua neu ro cac man hinh hay flow nghiep vu
- Da co service layer cho Auth/Conversations/Groups/Reports/Uploads/Users
- Da co man hinh Login, Chat workspace + detail, Reports list + create, Profile
- Contacts + Notifications dang la placeholder
- Hien dang polling (8-25s) cho chat, chua co Socket.IO realtime
- Cache tam thoi bang sqlite JSON; Isar model da co nhung chua dung
- Auth moi co login/register co ban; chua ho tro OTP va luong account lifecycle

## Mobile-app-fluter: chuc nang con thieu
### Auth
- OTP flows: register/login request + verify
- Forgot password: request + verify + confirm
- Change password (OTP), deactivate/delete/reactivate/unlock
- Quan ly session list/revoke

### Chat
- Socket.IO realtime (join/leave/read/typing/presence/call/webrtc)
- Direct request flow (list/accept/ignore/reject/block)
- Preferences hoan thien (archive, mute-until, pin) + dong bo thong bao
- Message edit/delete, forward UI, recall UI ro rang
- Pagination + search, scroll load older/newer

### Groups
- Audit, bans, invite links, ownership transfer, dissolve
- Join by invite code, quan ly thanh vien va role

### Reports
- Report detail, update, delete
- Status transition, assign, audit
- Link group conversation voi report

### Users
- Discover/search user
- Friends + friend requests
- Blocks + private alias
- Presence + push device registry

### Uploads
- Upload limits, presign upload/download
- Media history per target

### Notifications
- FCM + device token registry
- Inbox thong bao + uu tien thong bao theo role

## Huong phat trien de xuat
### 1) Chuc nang san pham
- Dong bo ro luong nghiep vu chat va group theo tai lieu thiet ke
- Hoan thien luong bao cao su co: tao, danh muc, tien trinh, phan cong
- Quan ly nhan vien va phan quyen theo locationCode V2 (`VN-{provinceCode}` hoặc `VN-{provinceCode}-{wardCode}`)

### 2) Hieu nang va do tre
- Giam do tre chat bang outbox replay theo su kien (event-driven)
- Loai bo scanAll trong cac luong quan trong (list groups, summary sync, push device)
- Bo sung metric do tre: ack latency, outbox age, error rate

### 3) On dinh va nhat quan
- Chuan hoa cac hanh vi idempotent (join/leave/ban/unban)
- Lam ro semantics invite link va roster visibility
- Cau hinh quy trinh bao tri: retention, reconciliation

### 4) UX-UI
- Thiet ke luong chat va report theo ngu canh do thi (nhom cong dan, can bo)
- Uu tien timeline ro rang (chat, he thong, trang thai bao cao)
- Tinh nang cho mobile: bat thong bao, offline retry, nhanh chuyen doi vi tri

### 5) Ky thuat mobile
- Xac dinh dich vu push va luong nhan tin realtime
- Tich hop login OTP va refresh token theo chuan BE
- Dinh nghia kiem thu: latency, retry, socket reconnect

### 6) Mobile-app-fluter (uu tien thuc thi)
1) Realtime chat: Socket.IO + presence + typing + read
2) OTP auth + account lifecycle flows
3) Reports detail + status/assign/audit
4) Contacts + friends + blocks + alias
5) Notifications + push device registry
6) Group advanced: ban/invite/ownership transfer
7) Offline cache chuan (Isar) + pagination

## Mobile-app-fluter: toi uu hieu nang va do muot
- Thay polling bang socket, giu polling lam fallback khi mat ket noi
- Pagination thay cho list 100% moi lan; debounce search
- Dung Isar thay sqlite JSON, query theo index, cap nhat increment
- Image caching + thumbnail; gioi han chat bubble rebuild
- Tach state per feature, giam rebuild man hinh chat
- Upload presign cho file lon; compress anh theo upload limits
- Optimistic UI co retry theo clientMessageId

### 7) Roadmap kỹ thuật tối ưu hiệu năng Mobile (Flutter)
#### [x] 1. Bộ nhớ đệm (Cache) - Từ SQLite sang Isar NoSQL
- **Vấn đề:** SQLite lưu JSON gây chặn luồng chính, gây giật lag UI.
- **Kết quả:** Chuyển sang Isar NoSQL, giúp query tin nhắn và danh bạ ở luồng riêng, đạt chuẩn 60FPS.

#### [x] 2. Tối ưu hóa UI & Keyboard Handling
- **Keyboard Jank:** Tắt `resizeToAvoidBottomInset`, dùng Padding động đẩy Composer lên mượt mà.
- **Widget Isolation:** Tách `ChatComposer` để cô lập việc rebuild UI khi gõ phím.
- **Tab State:** Dùng `AutomaticKeepAliveClientMixin` giữ trạng thái các tab Danh bạ.

#### [x] 3. Hệ thống Build & Android SDK
- **SDK Upgrade:** Nâng cấp lên **Android API 36** để tương thích Isar và các plugin mới nhất.
- **Build Fix:** Ép phiên bản SDK đồng nhất cho tất cả các sub-plugins qua `local.properties`.

#### [x] 4. Modern UX Polish
- **Giao diện mới:** Hoàn thiện trang `Profile`, `Settings`, `Notifications` với hiệu ứng Skeleton loading.
- **Image Optimization:** Giới hạn `cacheWidth` cho ảnh chat để tối ưu RAM.

## Trạng thái hiện tại
- **Build:** Thành công bản Release (API 36).
- **Độ mượt:** 60FPS mượt mà trên các tác vụ chính.
- **Data Mapping:** Đã fix lỗi mapping JSON phẳng từ Backend.
- **Giải pháp:**
  - Chuyển hoàn toàn sang bản local database **Isar**. Isar hỗ trợ truy xuất đồng bộ và cực nhanh, zero-copy, không chặn UI.
  - Sử dụng Isolates (`compute()`) để xử lý việc chuyển đổi từ DTO (Backend trả về) sang Entity (Isar) trước khi lưu vào DB.
  - Phân tách dữ liệu: Cache danh sách hội thoại, tin nhắn lưu theo trang, và metadata người dùng.

#### [x] 2. Phân trang (Pagination) - Di chuyển sang Cursor-based / Infinite Scroll
- **Vấn đề hiện tại:** Dữ liệu tải một lần quá nhiều hoặc dùng thuật toán kéo trang kém tối ưu, gây lãng phí bộ nhớ và dễ tràn RAM.
- **Giải pháp:**
  - Tích hợp chuẩn **Cursor Pagination** của BE (dựa trên tham chiếu ID - ulid) cho API `Users`, `Conversations` và `Messages`.
  - Sử dụng package hỗ trợ danh sách vô tận như `infinite_scroll_pagination` kết hợp với `ListView.builder` để chỉ render các phần tử thực sự xuất hiện trên màn hình.
  - Duyệt ưu tiên dữ liệu từ Local Cache (Isar) lên UI tức thời ngay khi mở danh sách, sau đó gọi API nền (background fetch) kèm `cursor` để tải thêm dữ liệu mới. (Đã hoàn thành)

#### [x] 3. Realtime (Socket) - Chuyển đổi Polling sang Event-driven
- **Vấn đề hiện tại:** `Timer.periodic` gọi API REST liên tục (8-25s/lần) báo hiệu thay đổi. Cách tiếp cận này ăn mòn pin, sử dụng dữ liệu mạng không cần thiết, làm thiết bị nóng và chậm nhận tin nhắn.
- **Giải pháp:**
  - Xóa bỏ **hoàn toàn** cơ chế polling trong mã nguồn.
  - Tích hợp package `socket_io_client` kết nối thẳng vào namespace `/chat`.
  - Quản trị vòng đời Socket (App Lifecycle):
    - Background/Xoá bộ nhớ: Ngắt kết nối để OS tiết kiệm pin.
    - Foreground: Mở kết nối, gửi auth, hứng event `chat.ready`.
  - Xây dựng hàng đợi tin nhắn (Outbox Pattern) ở Local: Khi mạng ngắt, tin nhắn gửi lưu tạm trong Isar (`status = sending`) kèm ID ảo (`clientMessageId`). Khi socket online, auto replay các socket request.
  - Lắng nghe trực tiếp các sự kiện như `message.created/updated` và update thẳng State Management (Provider) mà bỏ qua bước fetch lại API.

#### [x] 4. Quản lý Tệp tin (Uploads) - Presigned URL & Background Processes
- **Vấn đề hiện tại:** Request tải tệp tin và media dung lượng lớn chạy theo luồng UI (Sử dụng Multipart của thư viện Dio), dễ chặn quá trình trải nghiệm và chết khi app rơi vào nền.
- **Giải pháp:**
  - **Sử dụng S3 Presigned URL:** Dời gánh nặng cho Node.js server. Ứng dụng di động chỉ gọi /uploads/presign để nhận chuỗi ký số URL, rồi tự đẩy trực tiếp tệp lên AWS S3 (PUT Method).
  - Nén Media Native (Image/Video): Dùng `flutter_image_compress` hay thư viện native phù hợp nhằm tối ưu hóa file trước khi up/gửi để tuân thủ `uploads/limits`.
  - Ứng dụng **Background Upload Queue**: Dùng các package như `background_downloader` hay `flutter_uploader` để giao tiếp với OS, ngay cả khi tắt ứng dụng / đóng màn hình thì tiến trình upload vẫn sẽ tiếp tục chạy sau nền. (Đã hoàn thành)

#### [x] 5. Trải nghiệm Người dùng & Tối ưu hóa UI (Modern UX Polish)
- **Chat Reload Bug Fix:** Giải quyết triệt để lỗi nhấp nháy/tải lại trang (flicker) khi gửi tin nhắn bằng cách áp dụng **Optimistic Update** (thay thế tin nhắn tạm bằng tin nhắn thật) và cập nhật danh sách tại chỗ (In-place list update) thay vì gọi `refresh()`.
- **Trang chủ (HomeScreen) Hiện đại:** Thiết kế mới trang chủ với Header cao cấp, tích hợp thông báo qua Icon, cung cấp cái nhìn tổng quan về hệ thống và các hành động nhanh (Quick Actions).
- **Tab Báo cáo (Reports Tab):** Chuyển đổi từ một nút bấm đơn thuần thành một Tab quản lý báo cáo chuyên nghiệp, hỗ trợ lọc trạng thái (Filter Chips), tìm kiếm và giao diện thẻ báo cáo chi tiết.
- **Tái cấu trúc Điều hướng:** Cập nhật `HomeShell` theo cấu trúc 4 Tab tối ưu (Home, Chat, Reports, Profile), loại bỏ các Tab dư thừa để tăng không gian trải nghiệm.
- **Ổn định Isar:** Khắc phục lỗi "Isar instance closed" bằng cách thêm cơ chế kiểm tra `isOpen` trước khi truy cập database, đảm bảo tính ổn định khi Hot Restart hoặc chuyển đổi Isolate.

#### [x] 6. Tính năng Chat nâng cao & Đồng bộ danh bạ (Mới)
- **Đồng bộ danh bạ:** Tích hợp `flutter_contacts` để lấy số điện thoại từ máy, đối chiếu với server qua API `/users/sync-contacts` để gợi ý kết bạn tự động.
- **Quản lý hội thoại:** 
  - Thêm menu ấn giữ (Long-press) để **Ẩn cuộc trò chuyện** (Archive) và **Tắt thông báo** (Mute).
  - Cập nhật tính năng **Vuốt để xóa** (Swipe-to-delete) kèm hộp thoại xác nhận (Confirmation Dialog).
- **Trạng thái tin nhắn:** 
  - Đồng bộ trạng thái "Đã đọc" (Mark as read) tức thì lên server khi mở chat.
  - Tự động cập nhật nội dung tin nhắn thu hồi/chỉnh sửa ngay tại danh sách chat list nhờ Socket.IO listener.
- **Fix Build & Compatibility:** 
  - Khắc phục lỗi cú pháp giao diện (InkWell) và lỗi mapping JSON.
  - Cấu hình `<queries>` trong AndroidManifest để `url_launcher` hoạt động chính xác cho link/bản đồ.

## Trạng thái hiện tại
- **Build:** Thành công bản Release (API 36).
- **Độ mượt:** 60FPS ổn định, không còn hiện tượng giật lag khi gửi tin nhắn.
- **UI/UX:** Đã chuyển đổi sang ngôn ngữ thiết kế Premium (Rounded corners, Soft shadows, Modern typography).
- **Sync:** Đã hoàn thành cơ chế đồng bộ danh bạ và quản lý hội thoại nâng cao.

#### [x] 8. Tái thiết kế Auth & Profile - Premium Glassmorphism & Architecture Migration
- **Auth UI Premium:** Tái thiết kế toàn bộ màn hình Đăng nhập/Đăng ký theo phong cách **Glassmorphism** (thủy tinh mờ), sử dụng hiệu ứng BackdropFilter và Gradient hiện đại.
- **Location Picker V2:** Thay thế việc nhập mã địa điểm thủ công bằng **BottomSheet chọn địa điểm đa bước** (Tỉnh -> Phường). Tự động phân giải và hiển thị tên địa danh thân thiện.
- **Architecture Migration:** Chuyển đổi thành công điểm đầu vào của ứng dụng (`main.dart`) sang kiến trúc **Riverpod + GoRouter**, loại bỏ sự phụ thuộc vào các lớp cũ (Provider legacy).
- **Profile Completion:** 
  - Hoàn thiện trang **Chỉnh sửa hồ sơ** cho cả Công dân và Cán bộ.
  - Tích hợp **Quản lý phiên đăng nhập** (Security) cho phép xem thiết bị đang truy cập và đăng xuất từ xa.
  - Đồng bộ typography bằng **Google Fonts (Poppins)** và tối ưu hóa UI "Pro Max" cho toàn bộ tab Cá nhân.
- **Bắt buộc đồng ý điều khoản:** Tích hợp quy trình xác nhận chính sách và điều khoản sử dụng vào luồng đăng ký tài khoản.

## Trạng thái hiện tại (Cập nhật 04/05/2026)
- **Kiến trúc:** Đã chuyển đổi hoàn toàn sang Riverpod + GoRouter ổn định.
- **Auth:** Luồng Đăng nhập/Đăng ký Premium đã sẵn sàng, hỗ trợ chọn địa điểm thông minh.
- **Profile:** Hoàn tất 100% các tính năng chỉnh sửa thông tin, bảo mật và quản lý avatar.
- **Dependencies:** Đã cấu hình và fix lỗi cho `flutter_markdown`, `google_fonts` và các thư viện hỗ trợ UI.

## Đề xuất tài liệu bổ sung
- [x] Bổ sung README cho mobile-app-fluter: cấu trúc thư mục, màn hình, flow chính.
- [x] Thêm hướng dẫn chạy local cho toàn bộ hệ sinh thái (api + mobile + web).
- [x] Thêm bảng đồng bộ FE/BE: endpoint, payload, socket events.
