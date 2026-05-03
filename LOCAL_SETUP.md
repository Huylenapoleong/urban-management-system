# Hướng dẫn chạy Local toàn bộ Hệ sinh thái Urban Management System

Hệ sinh thái bao gồm Backend (NestJS) và các frontend (Mobile, Web). Hướng dẫn này giúp thiết lập môi trường cho lập trình viên.

## Yêu cầu môi trường
- Node.js (v18+)
- pnpm (khuyến nghị dùng pnpm thay vì npm/yarn trong thư mục gốc)
- Docker & Docker Compose (cho Redis, DynamoDB local)
- Flutter SDK (v3.5.0+)
- Android Studio / Xcode (cho Mobile App)

## 1. Khởi động Backend (`apps/api`)
Backend cung cấp API và Socket.IO cho toàn bộ hệ thống.

```bash
cd apps/api
# Hoặc chạy từ root: pnpm install
pnpm install

# Khởi động các dịch vụ phụ trợ (Redis, LocalStack/DynamoDB) nếu có
# docker-compose up -d

# Chạy server
pnpm run start:dev
```
Backend mặc định chạy ở cổng `3001` (API) và namespace socket `/chat`.

## 2. Khởi động Web App (`apps/web-app`)
Ứng dụng web dành cho người dùng (Vite/React).

```bash
cd apps/web-app
pnpm install
pnpm run dev
```

## 3. Khởi động Mobile App Flutter (`apps/mobile-app-fluter`)
Ứng dụng di động chính thức bằng Flutter.

```bash
cd apps/mobile-app-fluter
# Tải dependencies
flutter pub get

# Chạy trên máy ảo (Emulator) hoặc máy thật
flutter run --release --dart-define=API_BASE_URL=http://192.168.2.195:3001
```
*Lưu ý:* Cần trỏ IP kết nối API/Socket trong config của Flutter đến IP máy tính (VD: `192.168.1.x:3001`) thay vì `localhost` nếu chạy trên thiết bị thật/máy ảo Android.

## 4. Các lưu ý khi phát triển
- Luôn kiểm tra `update.md` để nắm bắt tiến độ và định hướng của dự án.
- Tra cứu danh sách API tại `FE_BE_SYNC.md`.
