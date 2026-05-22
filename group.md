# Phân tích Tính năng Nhóm (Group Feature) trong Urban Management System

Tài liệu này tổng hợp và phân tích đầy đủ các chức năng cũng như công nghệ đã được sử dụng để xây dựng tính năng Nhóm (Group) trên cả hai nền tảng Frontend (`web-app`) và Backend (`api`).

---

## 1. Phân tích Chức năng (Features)

Hệ thống cung cấp một hệ sinh thái quản lý nhóm toàn diện, hỗ trợ nhiều loại hình nhóm khác nhau (Khu vực, Chủ đề, Riêng tư, Chính thức) với hệ thống phân quyền rõ ràng.

### 1.1. Chức năng trên Frontend (`web-app`)
Frontend được tổ chức thành các trang và component chuyên biệt để quản lý trải nghiệm người dùng:

- **Trang Danh sách và Quản lý Nhóm (`GroupsPage.tsx`)**:
  - **Hiển thị & Tìm kiếm**: Hiển thị danh sách tất cả các nhóm công khai và nhóm đã tham gia.
  - **Tạo Nhóm Mới**: Hỗ trợ tạo nhóm theo các loại `AREA`, `TOPIC`, `PRIVATE`, `OFFICIAL` (tùy thuộc vào quyền hạn của tài khoản như CITIZEN hay PROVINCE_OFFICER). 
    - Với nhóm `PRIVATE`, hệ thống bắt buộc (enforce) người dùng phải thêm ít nhất 2 bạn bè để tạo thành nhóm tối thiểu 3 người.
    - Tự động lấy và hiển thị thông tin địa bàn (Location) dựa vào tài khoản.
  - **Tham gia Nhóm**: Cho phép tham gia trực tiếp vào các nhóm công khai hoặc tham gia thông qua mã mời (Invite Code/Link).
  - **Rời Nhóm & Chuyển quyền**: Cho phép thành viên rời nhóm. Nếu là Trưởng nhóm (Owner), hệ thống bắt buộc người dùng phải chọn một thành viên khác (Successor) để chuyển quyền trước khi rời đi.
  - **Tích hợp Chat**: Liên kết trực tiếp để mở khung chat của nhóm trong `ChatPage.tsx`.

- **Trang Nhận Lời mời (`JoinGroupPage.tsx`)**:
  - Landing page chuyên dụng để xử lý các liên kết mời tham gia nhóm.
  - Kiểm tra trạng thái đăng nhập. Nếu chưa đăng nhập, hướng dẫn người dùng đăng nhập/đăng ký. Nếu đã đăng nhập, tự động thực hiện thao tác tham gia nhóm và chuyển hướng thẳng vào phòng chat.

- **Dịch vụ API (`group.api.ts`)**:
  - Cung cấp toàn bộ các hàm gọi API được định kiểu chặt chẽ (TypeScript interfaces).
  - Xử lý các thao tác quản lý chuyên sâu như: Quản lý thành viên, danh sách cấm (Ban), liên kết mời (Invite Links), và nhật ký hoạt động (Audit Events).

### 1.2. Chức năng trên Backend (`api` - `GroupsController` & `GroupsService`)
Backend được xây dựng dựa trên NestJS, cung cấp RESTful API với các chức năng bảo mật và nghiệp vụ phức tạp:

- **Vòng đời của Nhóm (Group Lifecycle)**:
  - Create, List, Get, Update.
  - Delete & Dissolve: Hỗ trợ "Dissolve group" (xóa an toàn trên production) bằng cách đánh dấu xóa, lên lịch dọn dẹp và thu hồi quyền truy cập chat của thành viên thay vì xóa cứng dữ liệu.
- **Hệ thống Phân quyền (Role-based Access Control)**:
  - Hỗ trợ 3 vai trò chính trong nhóm: `OWNER` (Trưởng nhóm), `DEPUTY` (Phó nhóm), và `MEMBER` (Thành viên).
  - API chuyển quyền sở hữu (`ownership-transfer`) an toàn.
- **Quản lý Thành viên (Member Management)**:
  - Thêm, Xóa, Cập nhật vai trò thành viên (Update Role).
  - Các ràng buộc nghiệp vụ: Không thể tự xóa Trưởng nhóm nếu chưa chuyển quyền, Phó nhóm không thể ban Trưởng nhóm, v.v.
- **Hệ thống Cấm (Ban System)**:
  - `banMember` / `unbanMember`: Khi một thành viên bị cấm, họ bị loại khỏi nhóm ngay lập tức và không thể tham gia lại cho đến khi được gỡ cấm.
- **Hệ thống Lời mời (Invite Link System)**:
  - Tạo, danh sách, thu hồi (revoke) các liên kết mời tham gia.
  - Tham gia nhóm bằng mã mời với giới hạn lượt sử dụng hoặc thời gian hết hạn.
- **Nhật ký Hoạt động (Audit Logging)**:
  - Mọi thao tác quan trọng (thêm/xóa thành viên, ban, thay đổi quyền) đều được ghi log dưới dạng `AuditEventItem` để phục vụ tra cứu và quản lý minh bạch.

### 1.3. Danh sách các API Endpoints
Dưới đây là các đường dẫn (routes) API được cung cấp bởi `GroupsController`:

**Vòng đời nhóm:**
- `POST /groups`: Tạo nhóm mới
- `GET /groups`: Lấy danh sách nhóm (có phân trang/bộ lọc)
- `GET /groups/:groupId`: Lấy chi tiết một nhóm
- `PATCH /groups/:groupId`: Cập nhật thông tin nhóm
- `DELETE /groups/:groupId`: Xóa nhóm (xóa cứng)
- `POST /groups/:groupId/dissolve`: Giải tán nhóm (xóa mềm an toàn trên production)
- `POST /groups/:groupId/ownership-transfer`: Chuyển quyền Trưởng nhóm

**Thành viên & Quyền hạn:**
- `GET /groups/:groupId/members`: Lấy danh sách thành viên
- `POST /groups/:groupId/members`: Thêm thành viên mới
- `PATCH /groups/:groupId/members/:userId/role`: Cập nhật vai trò (Role) của thành viên
- `DELETE /groups/:groupId/members/:userId`: Xóa thành viên
- `POST /groups/:groupId/join`: Tự động tham gia nhóm (nếu được phép)
- `POST /groups/:groupId/leave`: Rời nhóm

**Quản lý Cấm (Ban):**
- `GET /groups/:groupId/bans`: Lấy danh sách thành viên bị cấm
- `POST /groups/:groupId/bans/:userId`: Cấm thành viên (kick & ban)
- `DELETE /groups/:groupId/bans/:userId`: Gỡ lệnh cấm

**Liên kết mời (Invite Links):**
- `GET /groups/:groupId/invite-links`: Lấy danh sách link mời
- `POST /groups/:groupId/invite-links`: Tạo link mời mới
- `DELETE /groups/:groupId/invite-links/:inviteId`: Thu hồi link mời
- `POST /groups/invite-links/:code/join`: Tham gia nhóm bằng mã mời

**Audit & Log:**
- `GET /groups/:groupId/audit`: Lấy danh sách lịch sử thao tác (Audit Events)

### 1.4. Tính năng Gọi Nhóm (Group Call)
Hệ thống cung cấp tính năng gọi thoại và gọi video thời gian thực (Real-time) cho nhóm được tích hợp chặt chẽ trong `ChatPage.tsx` và `CallModal.tsx`:

- **Kiến trúc Mạng (WebRTC & Socket.io)**:
  - **Full Mesh Topology**: Trong cuộc gọi nhóm, mỗi thành viên sẽ kết nối trực tiếp (Peer-to-Peer) với tất cả các thành viên khác đang trong cuộc gọi thông qua WebRTC `RTCPeerConnection`.
  - **Định tuyến Tín hiệu (Signaling)**: Sử dụng Socket.io làm Signaling Server để trao đổi `Offer`, `Answer` và `ICE Candidates`. Các gói tin WebRTC được gắn thêm `senderId` và `targetId` để định tuyến chính xác trong lưới Mesh.
  - **Tự động ngắt kết nối (Auto-hangup & Heartbeat)**: Hệ thống sử dụng cơ chế `CALL_HEARTBEAT` mỗi 5 giây để kiểm tra kết nối. Nếu không có phản hồi trong 45 giây ở trạng thái đang gọi, hệ thống sẽ tự động ngắt (`CALL_END`).

- **Giao diện & Trải nghiệm Người dùng (CallModal.tsx)**:
  - **Giao diện Video dạng Lưới (Grid Layout)**: Tự động chia lưới hiển thị (Grid 1x1, 2x2, 3x3, v.v.) tùy thuộc vào số lượng thành viên tham gia (`totalVideos`).
  - **Phát hiện giọng nói (Speaking Detection)**: Sử dụng `AudioContext` kết hợp với `AnalyserNode` để phân tích tần số âm thanh từ `MediaStream`. Nếu thành viên đang nói, giao diện avatar hoặc video của họ sẽ sáng lên (viền màu xanh).
  - **Draggable Modal**: Modal cuộc gọi có thể kéo thả tự do trên màn hình (thông qua Pointer Events) để không cản trở việc xem tin nhắn.
  - **Quản lý Luồng Âm thanh/Hình ảnh (Media Stream)**: Cung cấp fallback tự động (chuyển sang gọi thoại nếu camera bị lỗi hoặc không cấp quyền), đồng thời hỗ trợ bật/tắt Micro và Camera linh hoạt.

---

## 2. Phân tích Công nghệ đã sử dụng (Tech Stack)

### 2.1. Frontend (`web-app`)
- **Core**: React 18 (sử dụng Functional Components và Hooks).
- **Routing**: `react-router-dom` để xử lý điều hướng, đặc biệt là lấy các tham số động trên URL (`useParams`) cho tính năng Join Invite.
- **State Management & Data Fetching**: 
  - **`@tanstack/react-query`**: Quản lý state của server (cache, fetch, mutate). Sử dụng `useQuery` để lấy danh sách nhóm và `useMutation` kèm `invalidateQueries` để tự động làm mới giao diện sau khi tạo/rời nhóm.
- **UI & Styling**:
  - **Tailwind CSS**: Utility-first CSS, tận dụng các class để dựng layout dạng grid/flexbox, hỗ trợ Dark mode (qua các class `dark:bg-...`).
  - **Lucide React**: Thư viện icon chuẩn mực, hiện đại (các icon như `Users`, `ShieldCheck`, `LogOut`, v.v.).
  - **react-hot-toast**: Hiển thị thông báo (toast) cho các thao tác thành công/thất bại.
- **TypeScript**: Định nghĩa kiểu dữ liệu chặt chẽ sử dụng các types dùng chung từ package `@urban/shared-types` và `@urban/shared-constants`.

### 2.2. Backend (`api`)
- **Core Framework**: NestJS.
- **Architecture**: Mô hình Controller - Service - Module tiêu chuẩn của Nest.
- **API Documentation**: Sử dụng `@nestjs/swagger` để tự động tạo tài liệu OpenAPI (các decorator như `@ApiOperation`, `@ApiOkEnvelopeResponse`, `@ApiBadRequestExamples`).
- **Data Validation & DTOs**: Sử dụng các Data Transfer Objects (DTO) để kiểm tra tính hợp lệ của dữ liệu đầu vào.
- **Authentication/Authorization**: Decorator `@CurrentUser` để lấy thông tin người dùng từ JWT Token, kiểm tra quyền thao tác ngay từ Controller.

---

## 3. Đánh giá Kiến trúc

- **Bảo mật và Phân quyền**: Được làm rất chặt chẽ từ Frontend đến Backend. Frontend ẩn/hiện các lựa chọn dựa trên Role (ví dụ chỉ Admin/Officer mới được tạo nhóm Official), trong khi Backend xác thực lại (validate) quyền này để ngăn chặn truy cập trái phép.
- **Trải nghiệm Người dùng (UX)**: Giao diện trực quan, các trạng thái loading (spinners), disable nút khi đang xử lý (optimistic/pessimistic UI thông qua `react-query`) được thực hiện đồng bộ. Flow bắt buộc chọn người kế nhiệm khi Trưởng nhóm rời nhóm là một thiết kế UX xuất sắc để tránh nhóm bị bỏ hoang (orphaned group).
- **Tái sử dụng (Reusability)**: Việc sử dụng shared types (từ thư mục `packages/shared-types`) đảm bảo sự đồng nhất tuyệt đối giữa Client và Server về cấu trúc dữ liệu.

---

## 4. Phân tích Tính năng Nhóm trên Mobile (Flutter)

Dựa trên mã nguồn hiện tại của ứng dụng Flutter (`mobile-app-fluter`), tính năng Nhóm đang ở giai đoạn nền tảng và cần được mở rộng thêm để đạt được độ hoàn thiện như trên Web App.

### 4.1. Tình trạng hiện tại
- **Giao diện Tạo Nhóm (`CreateGroupScreen`)**: Đã hoàn thiện giao diện tạo nhóm hiện đại. Cho phép chọn loại nhóm (OFFICIAL, TOPIC, AREA, PRIVATE), kết hợp tính năng chọn bạn bè từ danh bạ với thanh tìm kiếm trực quan. Thiết kế mang phong cách Minimal với màu chủ đạo `#7C3AED` (Tím Violet).
- **Kết nối API (`GroupService`)**: Đã triển khai các lời gọi API cơ bản (CRUD nhóm, lấy danh sách, tham gia/rời nhóm, thêm/sửa/xóa thành viên).
- **Kiến trúc UI/UX**: Tuân thủ tốt các tiêu chuẩn phân tách Widget, tránh Deep Nesting và quản lý trạng thái hiệu quả.

### 4.2. Các chức năng và giao diện còn thiếu (Khoảng trống so với Web App)
Dù API đã hỗ trợ, nhưng ứng dụng di động vẫn còn thiếu nhiều giao diện (UI) để người dùng có thể thao tác:
1. **Màn hình Tham gia Nhóm qua Link (✅ Đã hoàn thành)**: 
   - Đã xây dựng `JoinGroupScreen` hỗ trợ nhập mã mời thủ công và hiển thị kết quả thành công/thất bại.
   - API `joinByInviteCode` đã tích hợp trong `GroupService`.
2. **Quản lý Quyền và Thành viên nâng cao (✅ Đã sửa lỗi hiển thị và tích hợp Xem, Xóa, Cấm, Chuyển quyền trực tiếp)**: 
   - Đã cải tiến `GroupMembersScreen` sử dụng nút 3 chấm (`Icons.more_vert`) cho từng hàng thành viên và hỗ trợ chạm (`onTap`) trực tiếp để mở Bottom Sheet hành động cực kỳ trực quan và dễ khám phá.
   - Hỗ trợ đầy đủ các hành động nghiệp vụ theo quyền hạn: **Xem thông tin (Profile)** (dành cho tất cả), **Chuyển quyền Trưởng nhóm**, **Thăng/Hạ chức Phó nhóm**, **Xóa khỏi nhóm (Kick)**, và **Cấm khỏi nhóm (Ban)**.
   - Đã sửa lỗi hiển thị 'Thành viên' hàng loạt bằng cách tự động tải thông tin chi tiết (tên, ảnh đại diện) từ `UserService.getUserById` song song cho từng thành viên và truyền đối tượng `UserProfile` hoàn chỉnh vào màn hình Xem cá nhân.
3. **Quản lý Liên kết Mời (Invite Links) (✅ Đã hoàn thành)**: 
   - Đã xây dựng `GroupInviteLinksScreen` hỗ trợ tạo link mới, sao chép mã, và thu hồi link.
4. **Nhật ký Hoạt động (Audit Logs) (✅ Đã sửa lỗi hiển thị trắng)**: 
   - Đã xây dựng `GroupAuditLogsScreen` với Shimmer loading, hiển thị icon/màu sắc theo loại sự kiện.
   - Đã ánh xạ chính xác các trường sự kiện (`summary` và `occurredAt`) từ Backend để hiển thị đầy đủ, sinh động lịch sử hoạt động nhóm thay vì để trống.
5. **Nâng cấp Gọi nhóm đa chiều (Group Call) (✅ Đã hoàn thành Polite Peer + PiP + Speaking Detection)**: 
   - *Kiến trúc WebRTC*: Đã triển khai thuật toán **Polite/Impolite Peer** trong `webrtc_service.dart`.
   - *Giao diện Lưới (Grid Layout)*: Đã có sẵn khung Grid 2 cột, stream ổn định hơn nhờ logic chống xung đột.
   - *Picture-in-Picture (✅)*: Đã triển khai `FloatingCallOverlay` — widget nổi có thể kéo thả, hiển thị video/audio, đếm thời gian, nút kết thúc cuộc gọi. Nhấn vào để quay lại `CallScreen` đầy đủ.
   - *Speaking Detection (✅)*: Đã triển khai hoàn toàn bằng Dart bằng cách định kỳ thăm dò `getStats()` từ `RTCPeerConnection` để lấy mức decibel âm thanh (`audioLevel`). Hiển thị viền phát sáng màu tím và biểu tượng mic khi phát hiện thành viên đang nói, đồng bộ trực quan như Web App.
6. **Bình chọn (Polls) (✅ Đã hoàn thành)**: 
   - Đã tích hợp `PollMessageBubble` và `CreatePollBottomSheet` vào Flutter.
   - Hỗ trợ đầy đủ logic parse JSON, tuỳ chọn "Chọn một/Chọn nhiều", xem phần trăm (%) phiếu bầu và đồng bộ trực tiếp (`editMessage` / `PATCH`) giống hệt Web App.
7. **Gửi GIF (Giphy Integration) (✅ Đã thêm nút GIF trong chat detail và hoàn thiện gửi GIF)**:
   - Đã xây dựng `GifPickerSheet` với Giphy REST API.
   - Hỗ trợ tải vô cực (Infinite Scroll), Shimmer Loading, và tích hợp trực tiếp vào màn hình Chat thông qua thuộc tính `attachmentUrl` và `type: 'IMAGE'`.
   - Đã thêm biểu tượng nút GIF (`gif_box_outlined`) ngay cạnh ô nhập tin nhắn và liên kết hiển thị `GifPickerSheet` để gửi GIF trực tiếp dạng file đính kèm.
8. **Đặt biệt danh (Aliases/Nicknames) (❌ Chưa có trên Mobile — Web App đã hoàn thiện)**:
   - **Tình trạng trên Web App**: Đã có đầy đủ chức năng đặt/xóa biệt danh cho các thành viên trong hội thoại thông qua component `nicknameModal` trong `ChatPage.tsx`. Chức năng này được định nghĩa qua `manageAliasMutation` sử dụng các API:
     - `GET /conversations/:conversationId/aliases` (Lấy danh sách biệt danh).
     - `PUT /conversations/:conversationId/aliases/:userId` (Đặt biệt danh, gửi kèm `{ alias }`).
     - `DELETE /conversations/:conversationId/aliases/:userId` (Xóa biệt danh).
   - **Tình trạng trên Mobile**: Chưa có bất kỳ giao diện hay dịch vụ API nào được triển khai cho tính năng này trong `ConversationService` hoặc UI.
   - **Kế hoạch triển khai trên Mobile**: Cần tích hợp các API trên vào `ConversationService` và bổ sung tùy chọn "Đặt biệt danh" trong menu tùy chọn thành viên hoặc khi nhấn giữ tin nhắn của người dùng trong chat.


### 4.3. Hướng phát triển và Cải thiện UI/UX (Theo tiêu chuẩn `uiuxfluter.md`)
Để phát triển các chức năng còn thiếu, cần bám sát các tiêu chuẩn UI/UX sau:
- **Tích hợp Shimmer Loading**: Khi tải danh sách nhóm, danh sách thành viên hoặc nhật ký (Audit), cần thay thế `CircularProgressIndicator` bằng các khối Skeleton (Shimmer Effect) để tạo cảm giác mượt mà và cao cấp.
- **Sử dụng Bottom Sheet với Drag Handle**: Các thao tác quản lý thành viên (Kick, Ban, Chuyển quyền) không nên dùng Popup Dialog mà nên hiển thị dưới dạng **Modal Bottom Sheet** trượt từ dưới lên, hỗ trợ thao tác một tay tốt hơn.
- **Áp dụng Dark Mode**: Các mã màu (như `Color(0xFF7C3AED)` hay nền trắng) hiện đang bị hard-code. Hướng phát triển tới là tích hợp toàn bộ các màu này vào `ThemeData` để tự động chuyển đổi Dark/Light mode, đặc biệt quan trọng với màn hình chat và nhóm.
- **Tích hợp Swipe Gestures**: Tại danh sách thành viên của nhóm, có thể sử dụng `flutter_slidable` để Trưởng nhóm vuốt sang trái/phải để hiện ra nút Kick (Xóa) hoặc Ban (Cấm) một cách nhanh chóng.
