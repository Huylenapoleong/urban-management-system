# Đồng bộ Dữ liệu FE - BE (API & Socket.IO)

Tài liệu này đóng vai trò giao kèo (contract) giữa Backend và Frontend (Mobile, Web).

## 1. Socket.IO (Namespace `/chat`)

### 1.1 Client Events (Gửi từ App lên Server)
- `conversation.join` { conversationId }
- `conversation.leave` { conversationId }
- `conversation.read` { conversationId }
- `message.send` { conversationId, content, type, clientMessageId }
- `message.recall` { conversationId, messageId }
- `typing.start` { conversationId }
- `typing.stop` { conversationId }

### 1.2 Server Events (Nhận từ Server)
- `chat.ready` (Khi kết nối thành công & server sẵn sàng)
- `message.created` { message }
- `message.updated` { message }
- `message.deleted` { messageId }
- `conversation.updated` { conversation }
- `presence.updated` { userId, isOnline, lastSeen }
- `typing.state` { conversationId, userId, isTyping }
- `chat.error` { code, message }

## 2. Rest API Endpoints

### 2.1 Auth
- `POST /auth/login` - Đăng nhập
- `POST /auth/register` - Đăng ký (OTP)
- `POST /auth/refresh` - Cấp lại Access Token
- `GET /auth/me` - Lấy thông tin user hiện tại

### 2.2 Users & Contacts
- `GET /users` - Lấy danh sách (Cursor pagination)
- `GET /users/:id` - Lấy chi tiết user
- `GET /users/me/friends` - Danh sách bạn bè
- `POST /users/me/friends/:id/request` - Kết bạn

### 2.3 Conversations & Messages
- `GET /conversations` - Danh sách chat (Cursor pagination)
- `GET /conversations/:id/messages` - Lịch sử tin nhắn
- `POST /conversations/direct` - Tạo DM chat mới

### 2.4 Reports
- `GET /reports` - Lấy danh sách sự cố
- `POST /reports` - Gửi sự cố
- `PATCH /reports/:id/status` - Cập nhật tiến độ

## 3. Cấu trúc Response
Mọi API JSON của hệ thống đều tuân thủ envelope:

**Thành công:**
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "cursor": "...",
    "hasNextPage": true
  }
}
```

**Thất bại:**
```json
{
  "success": false,
  "error": "Error code / message",
  "path": "/api/...",
  "timestamp": "2026-...",
  "requestId": "..."
}
```
