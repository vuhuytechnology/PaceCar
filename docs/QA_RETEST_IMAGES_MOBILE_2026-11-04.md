# Kết quả kiểm thử lại — ảnh xe, ảnh bằng chứng và mobile

**Ngày:** 2026-11-04 (Asia/Bangkok)  
**Môi trường:** Windows, Edge headless, Express production build  
**Viewport mobile:** 430 × 932 CSS px

## Phạm vi sửa

- Ảnh xe ưu tiên `photos[0]` (ảnh chủ xe vừa tải) trước `imageUrl`, có ảnh dự
  phòng nội bộ nếu nguồn chính lỗi và giải mã ảnh bất đồng bộ.
- Ảnh bằng chứng dùng chung `AuthorizedEvidenceImage`, gửi token khi tải, thu
  hồi object URL khi unmount, hiển thị lỗi và cho phép thử lại.
- Response ảnh xe và ảnh bằng chứng khai báo `X-Content-Type-Options: nosniff`;
  ảnh xe công khai được cache bất biến, ảnh bằng chứng vẫn `private, no-store`.
- Chuyển năm ảnh PNG lớn ở trang chủ/đăng ký sang JPEG tối ưu; tách tải theo
  route cho các màn hình quản trị, quản lý xe và quản lý booking.

## Kết quả

| Hạng mục                         |           Trước |                         Sau | Kết quả    |
| -------------------------------- | --------------: | --------------------------: | ---------- |
| 5 ảnh mobile chính               | 12.796.836 byte |                921.578 byte | Giảm 92,8% |
| JS entry production              |       521,19 KB |                   443,29 KB | Giảm 14,9% |
| Tràn ngang trang chủ 430 px      |     Chưa đo lại |                        0 px | Pass       |
| Tràn ngang danh sách xe 430 px   |     Chưa đo lại |                        0 px | Pass       |
| Ảnh điểm đến JPEG tải thành công |               — |                         4/4 | Pass       |
| Ảnh xe đã kích hoạt lazy-load    |               — | 12/12 có `naturalWidth > 0` | Pass       |
| Lỗi JavaScript trên trang        |               — |                           0 | Pass       |

Chunk chuyển HEIC/HEIF 3,22 MB vẫn được tải động chỉ khi người dùng chọn ảnh
HEIC/HEIF, không nằm trong lượt tải mở trang thông thường.

## Lệnh và kết quả kiểm thử lại

- `npm run build --prefix client`: **Pass**.
- `npm test --prefix server`: **Pass** — gồm upload/đọc lại byte ảnh xe, upload
  và đọc ảnh bằng chứng có xác thực, kiểm tra content type, cache policy và
  `nosniff`.
- `PACECAR_BASE_URL=http://127.0.0.1:4288 npm run test:browser:images`:
  **Pass** — viewport 430 × 932, không overflow, không ảnh xe vỡ sau lazy-load,
  route quản lý xe tách chunk tải thành công và không có page error.
- `git diff --check`: chạy ở bước xác nhận cuối.

## Giới hạn

- Đây là kiểm thử local/headless; chưa phải số liệu Lighthouse trên thiết bị
  Android/iOS vật lý hoặc mạng di động thật.
- Ảnh xe mẫu bên ngoài có thể bị nguồn Wikimedia giới hạn; giao diện đã có ảnh
  dự phòng nội bộ để không hiển thị ảnh vỡ. Ảnh do chủ xe tải lên được phục vụ
  từ backend/Persistent PostgreSQL blob theo cấu hình hiện tại.
