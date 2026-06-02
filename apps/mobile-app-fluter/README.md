# Urban Management System - Mobile App (Flutter)

Đây là ứng dụng di động chính thức của **Hệ sinh thái quản lý đô thị (SmartCity)**, được phát triển bằng framework Flutter.

## 📱 Tính năng cốt lõi
- **Xác thực (Auth):** OTP Register/Login, Quản lý tài khoản.
- **Tin nhắn (Chat):** Gắn kết người dân và cán bộ qua Socket.IO Realtime Chat, đính kèm media, gửi vị trí.
- **Báo cáo sự cố (Reports):** Tiếp nhận, chuyển trạng thái, phân công và kiểm toán (Audit).
- **Nhóm (Groups):** Quản lý thành viên, vai trò, chia sẻ liên kết mời, cấm/mở cấm.
- **Cá nhân:** Quản lý bạn bè, chặn, thông báo, cấu hình sở thích cá nhân.

## 📂 Cấu trúc thư mục (`lib/`)
Dự án được tổ chức theo kiến trúc sạch và chia module (feature-based):

```
lib/
├── core/       # Nền tảng dùng chung (constants, theme, utils, error handling)
├── features/   # Các tính năng chính (auth, chat, reports, groups, profile)
├── models/     # Các Data Transfer Object (DTO) và Isar Entities
├── services/   # Tầng tương tác dữ liệu (API, Socket.IO, Local DB)
├── state/      # Quản lý trạng thái tập trung (Provider/Riverpod)
└── main.dart   # Điểm bắt đầu (Entry point)
```

## 🛠 Lộ trình tối ưu hoá kỹ thuật
- **Local DB:** Sử dụng **Isar NoSQL** để thay thế SQLite nhằm tăng tốc truy xuất, hỗ trợ tính năng Offline Cache và làm mượt giao diện.
- **Pagination:** Sử dụng **Cursor-based Pagination** (hỗ trợ bởi BE) để render mượt danh sách tin nhắn và danh bạ.
- **Event-Driven:** Thay thế triệt để cơ chế Polling REST API bằng **Socket.IO** (Namespace `/chat`), tối ưu pin và dữ liệu di động.
- **Uploads:** Tích hợp S3 Presigned URL, upload file dung lượng lớn ngầm ở Background.

## 🚀 Hướng dẫn phát triển
Vui lòng xem tài liệu chung của toàn hệ sinh thái trong các file:
- `LOCAL_SETUP.md` (Hướng dẫn chạy dự án)
- `FE_BE_SYNC.md` (Cấu trúc Event, Endpoint và DTO)
