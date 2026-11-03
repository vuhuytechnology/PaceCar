# PaceCar

PaceCar là ứng dụng demo marketplace kết nối người thuê xe và chủ xe. Dự án tập trung vào quy trình tìm xe, báo giá minh bạch, quản lý đặt xe và hỗ trợ giao nhận.

> **Thanh toán tiền cọc:** Người thuê chuyển khoản trực tiếp vào tài khoản do chủ xe cấu hình. QR được tạo qua SePay/VietQR; chủ xe phải tự kiểm tra giao dịch và xác nhận đã nhận tiền. PaceCar không nhận hoặc giữ tiền và không tự xác thực giao dịch qua webhook.

## Tính năng chính

- Tìm kiếm, lọc và xem thông tin xe; quản lý danh sách yêu thích.
- Báo giá được tính ở backend, áp dụng ưu đãi và kiểm tra lịch xe.
- Tạo QR chuyển khoản tiền cọc đến tài khoản của chủ xe; chủ xe xác nhận thủ công sau khi đối soát ngân hàng.
- Quy trình đặt xe theo vai trò: người thuê, chủ xe và quản trị viên.
- Đăng xe, duyệt tin, quản lý hợp đồng, biên bản giao nhận và tranh chấp.
- Thông báo, nhật ký hoạt động, đánh giá và cảnh báo rủi ro.
- Trust Score và Risk Level được tính theo quy tắc, không phải AI.

## Công nghệ

- **Frontend:** React, Vite, Tailwind CSS.
- **Backend:** Node.js, Express.
- **Lưu trữ:** PostgreSQL (JSONB) khi có `DATABASE_URL`; nếu không, dùng JSON cục bộ. Tệp tải lên được lưu riêng trên filesystem.

Yêu cầu Node.js 22 trở lên. Phiên bản dự án được ghim trong [`.node-version`](./.node-version).

## Bắt đầu

```bash
npm run install-all
npm run dev
```

Mở ứng dụng và kiểm tra API:

- Website: http://localhost:5173
- API: http://localhost:4000/api
- Health check: http://localhost:4000/api/health

Development server chạy frontend và backend đồng thời; frontend chuyển tiếp các request `/api` đến backend.

### Tài khoản demo

| Vai trò | Email | Mật khẩu |
| --- | --- | --- |
| Người thuê | `renter@pacecar.vn` | `123456` |
| Chủ xe | `owner@pacecar.vn` | `123456` |
| Quản trị viên | `admin@pacecar.vn` | `123456` |

Đây là tài khoản seed để kiểm thử trên môi trường demo. Không sử dụng các thông tin này khi triển khai dịch vụ thật.

## Lệnh thường dùng

| Lệnh | Mô tả |
| --- | --- |
| `npm run install-all` | Cài dependencies ở root, frontend và backend |
| `npm run dev` | Chạy frontend và backend ở chế độ phát triển |
| `npm run build` | Cài dependencies cần thiết và build frontend |
| `npm test` | Chạy smoke test backend |
| `npm start` | Khởi chạy Express; phục vụ frontend nếu đã có bản build |

## Cấu hình

Backend đọc cấu hình từ environment variables. `.env.example` liệt kê các biến được hỗ trợ; khi chạy local, hãy truyền biến qua shell hoặc công cụ chạy ứng dụng. Trên nền tảng deploy, cấu hình chúng trong phần environment của service.

| Biến | Mặc định / mục đích |
| --- | --- |
| `PORT` | `4000` — cổng backend |
| `CLIENT_ORIGIN` | `http://localhost:5173` — origin được phép gọi API |
| `TRUST_PROXY` | `loopback` — cấu hình proxy tin cậy |
| `PACECAR_DB_FILE` | Mặc định `server/src/data/db.json` |
| `DATABASE_URL` | Nếu có, dùng PostgreSQL thay cho JSON; phải nhập dữ liệu trước lần khởi chạy đầu |
| `PACECAR_UPLOAD_DIR` | Mặc định `server/uploads` |
| `EMAIL_VERIFICATION_ENABLED` | Tắt mặc định; cần cấu hình SMTP để gửi mã xác minh |

## Kiểm thử và tài liệu

```bash
npm test
npm run build
```

- [Hướng dẫn kiểm thử trên máy khác](./docs/HUONG_DAN_TEST.md)
- [Hệ thống thiết kế](./docs/DESIGN_SYSTEM.md)
- [Tài liệu tích hợp và quyết định sản phẩm](./docs/TICH_HOP_TAI_LIEU.md)
- [Hướng dẫn PostgreSQL, nhập dữ liệu và rollback](./docs/POSTGRESQL.md)
- [Cấu hình thanh toán QR SePay](./docs/SEPAY_SETUP.md)

## Triển khai

Dự án có cấu hình Render Blueprint tại [`render.yaml`](./render.yaml). Quy trình build chạy `npm run render-build`, khởi động bằng `npm start` và kiểm tra `/api/health`. Biến `DATABASE_URL` được khai báo để nhập URL PostgreSQL từ Render; tạo database và nhập bản sao dữ liệu trước khi khởi chạy dịch vụ với biến này.

Chủ xe gửi tin với ảnh trước; admin xem hồ sơ và có thể yêu cầu bổ sung đăng ký xe, bảo hiểm qua thông báo. Chủ xe tải giấy tờ trong mục riêng tư của tin đang chờ duyệt; chỉ admin được xem và duyệt công khai sau khi nhận đủ hồ sơ.

Các màn tải ảnh chấp nhận JPG, PNG, WEBP và HEIC/HEIF; HEIC/HEIF được chuyển sang JPEG ngay trên trình duyệt trước khi gửi lên. Giấy tờ vẫn hỗ trợ PDF.

Bộ chuyển đổi HEIC dùng `heic-to` 1.6.7 theo LGPL-3.0-or-later; xem [các thông báo và giấy phép](./client/public/licenses/index.html) cùng [mã nguồn upstream](https://github.com/hoppergee/heic-to).

Khi không có `DATABASE_URL`, dịch vụ tiếp tục dùng JSON như trước. Với PostgreSQL, dữ liệu ứng dụng hiện được lưu thành một tài liệu JSONB đơn và chỉ hỗ trợ một instance ứng dụng; tệp tải lên vẫn cần persistent disk hoặc object storage. Xem [hướng dẫn PostgreSQL](./docs/POSTGRESQL.md) trước khi chuyển môi trường đang chạy.

## Cấu trúc dự án

```text
client/       Ứng dụng React và tài nguyên giao diện
server/       Express API, dữ liệu seed và kiểm thử
scripts/      Script chạy môi trường phát triển
docs/         Tài liệu thiết kế, tích hợp và kiểm thử
render.yaml   Cấu hình triển khai Render
```
