# Hướng dẫn sử dụng GitNexus cho AI Coding Assistant

Tài liệu này tổng hợp chi tiết các lệnh và quy trình làm việc với GitNexus để đảm bảo AI hiểu và thực hiện đúng các phân tích tác động trước khi thay đổi code.

---

## 1. Quy trình làm việc bắt buộc (Mandatory Workflow)

Mỗi khi muốn thay đổi code, AI **PHẢI** thực hiện theo các bước sau:

1.  **Kiểm tra trạng thái index:** Kiểm tra `gitnexus://repo/urban-management-system/context` để xem index có bị cũ (stale) không. Nếu cũ, chạy `npx gitnexus analyze`.
2.  **Phân tích tác động (Impact Analysis):** Trước khi sửa bất kỳ hàm/lớp nào, chạy:
    `gitnexus_impact({target: "TênSymbol", direction: "upstream"})`
3.  **Đánh giá rủi ro:** Báo cáo cho người dùng mức độ rủi ro (LOW, MEDIUM, HIGH, CRITICAL) dựa trên kết quả phân tích.
4.  **Thực hiện chỉnh sửa:** Chỉ sửa sau khi đã hiểu rõ tầm ảnh hưởng.
5.  **Kiểm tra lại sau khi sửa:** Trước khi hoàn tất (commit), chạy:
    `gitnexus_detect_changes()` để xác nhận thay đổi không gây lỗi dây chuyền ngoài ý muốn.

---

## 2. Các công cụ MCP (Sử dụng trực tiếp trong prompt/tool call)

| Công cụ | Mục đích | Ví dụ sử dụng |
| :--- | :--- | :--- |
| `gitnexus_impact` | Tìm "vùng ảnh hưởng" khi thay đổi một symbol. | `gitnexus_impact({target: "loginUser", direction: "upstream"})` |
| `gitnexus_context` | Xem chi tiết 360 độ về một symbol (ai gọi nó, nó gọi ai, thuộc luồng nào). | `gitnexus_context({name: "AuthService"})` |
| `gitnexus_query` | Tìm các luồng thực thi (execution flows) liên quan đến một khái niệm. | `gitnexus_query({query: "WebRTC calling"})` |
| `gitnexus_detect_changes` | Phân tích tác động của các thay đổi hiện tại (dựa trên git diff). | `gitnexus_detect_changes({scope: "staged"})` |
| `gitnexus_rename` | Đổi tên symbol an toàn trên toàn bộ dự án. | `gitnexus_rename({oldName: "oldFunc", newName: "newFunc"})` |

---

## 3. Các lệnh CLI (Chạy trong Terminal)

Sử dụng các lệnh này qua `run_command` hoặc terminal:

*   **`npx gitnexus analyze`**: Xây dựng lại hoặc cập nhật chỉ mục mã nguồn. Chạy sau khi có thay đổi lớn hoặc khi index bị báo "stale".
*   **`npx gitnexus status`**: Kiểm tra xem index hiện tại có mới nhất không và quy mô của dự án.
*   **`npx gitnexus clean`**: Xóa index cũ nếu bị lỗi.
*   **`npx gitnexus wiki`**: Tự động tạo tài liệu hướng dẫn cho dự án dựa trên cấu trúc code.

---

## 4. Đánh giá mức độ rủi ro (Risk Assessment)

AI cần báo cáo rủi ro cho người dùng theo bảng sau:

| Mức độ | Điều kiện | Ý nghĩa |
| :--- | :--- | :--- |
| **LOW** | < 5 symbols bị ảnh hưởng, ít luồng thực thi. | Thay đổi an toàn. |
| **MEDIUM** | 5-15 symbols hoặc 2-5 luồng bị ảnh hưởng. | Cần cẩn trọng, kiểm tra các bên liên quan. |
| **HIGH** | > 15 symbols hoặc rất nhiều luồng bị ảnh hưởng. | **CẢNH BÁO:** Có thể gây lỗi hệ thống nếu không test kỹ. |
| **CRITICAL** | Ảnh hưởng đến các phần cốt lõi (Auth, Payments, Database). | **NGUY HIỂM:** Cần sự phê duyệt tuyệt đối từ người dùng. |

---

## 5. Tài nguyên tra cứu nhanh (MCP Resources)

AI có thể đọc các đường dẫn sau để hiểu nhanh kiến trúc:

*   `gitnexus://repo/urban-management-system/context`: Tổng quan dự án & độ tươi của index.
*   `gitnexus://repo/urban-management-system/processes`: Danh sách tất cả các luồng thực thi chính.
*   `gitnexus://repo/urban-management-system/clusters`: Các cụm chức năng (module) trong hệ thống.
*   `gitnexus://repo/urban-management-system/schema`: Cấu trúc đồ thị code (dành cho truy vấn Cypher nâng cao).

---
*Ghi chú: Luôn ưu tiên dùng `gitnexus_query` thay vì `grep` để tìm kiếm thông minh hơn.*
