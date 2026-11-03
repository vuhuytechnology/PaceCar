# Hướng dẫn chạy PaceCar trên máy khác

## 1. Yêu cầu

- Windows 10/11, macOS hoặc Linux.
- Node.js 20 trở lên: https://nodejs.org/
- Kết nối Internet trong lần cài thư viện đầu tiên và để tải ảnh xe mẫu.

Kiểm tra Node.js và npm:

```powershell
node -v
npm -v
```

## 2. Cài và chạy

1. Giải nén file ZIP vào một thư mục không dấu, ví dụ `D:\PaceCar_Test`.
2. Mở PowerShell/Terminal tại thư mục vừa giải nén.
3. Chạy:

```powershell
npm run install-all
npm run dev
```

Đợi đến khi terminal hiển thị frontend và backend đã khởi động, sau đó mở:

- Website: http://localhost:5173
- API health check: http://localhost:4000/api/health

Không đóng cửa sổ terminal trong thời gian kiểm thử. Nhấn `Ctrl + C` để dừng hệ thống.

## 3. Tài khoản demo

| Vai trò | Email | Mật khẩu |
| --- | --- | --- |
| Người thuê | `renter@pacecar.vn` | `123456` |
| Chủ xe | `owner@pacecar.vn` | `123456` |
| Quản trị | `admin@pacecar.vn` | `123456` |

Các màn hình nên kiểm thử:

- Trang chủ, tìm kiếm và lọc xe.
- Người thuê: yêu thích, báo giá, mã ưu đãi, tạo đơn thuê, hợp đồng và bằng chứng.
- Chủ xe: đăng xe, quản lý tin và xử lý yêu cầu thuê.
- Admin: dashboard, duyệt tin xe, cảnh báo rủi ro và quản lý ưu đãi tại `/admin/promotions`.
- Footer: Tìm xe, Cách hoạt động và Hỗ trợ tranh chấp.

## 4. Kịch bản kiểm thử hành trình khách hàng

Persona: khách hàng ở Hà Nội, thuê xe tự lái để đi Hải Phòng, nhận lúc 06:00 và trả lúc 22:00 trong cùng một ngày tương lai.

1. Ở trang chủ, chọn **Tự lái**, **Địa điểm nhận xe: Hà Nội**, **Điểm đến dự kiến: Hải Phòng**, ngày tương lai và giờ `06:00`–`22:00`.
2. Tìm xe, mở một xe phù hợp và kiểm tra báo giá hiển thị `16 giờ (tính 1 ngày)`.
3. Tiếp tục đặt xe, đăng nhập `renter@pacecar.vn`, đồng ý điều khoản và gửi yêu cầu.
4. Đăng nhập `owner@pacecar.vn`, mở **Đơn thuê xe** và chấp nhận yêu cầu.
5. Đăng nhập lại người thuê, mở **Đơn thuê xe** và chọn **Tạo QR chuyển cọc**. Quét QR hoặc đối chiếu mã chuyển khoản; booking vẫn chờ đến khi chủ xe xác nhận đã nhận đủ tiền.
6. Chủ xe mở hợp đồng, phát hành và ký; người thuê đăng nhập để ký phần còn lại.
7. Tại thời điểm nhận xe, mở **Giao nhận**, tải ảnh, nhập nhiên liệu/ODO và lưu biên bản check-in.
8. Khi trả xe, lưu biên bản check-out tương tự. Chủ xe xác nhận **Hoàn tất chuyến**.
9. Người thuê kiểm tra trạng thái `Completed` và gửi đánh giá chuyến đi.

Để chạy kịch bản thanh toán, chủ xe cần cấu hình mã ngân hàng, số tài khoản và tên chủ tài khoản tại **Hồ sơ cá nhân → Tài khoản nhận tiền cọc**. QR gửi tiền trực tiếp cho chủ xe; chủ xe phải kiểm tra giao dịch thực tế trước khi bấm **Xác nhận đã nhận cọc**. Không xác nhận dựa trên ảnh chụp do người thuê gửi. Xem thêm [hướng dẫn SePay](./SEPAY_SETUP.md). Nếu người test không biết phải bấm gì tiếp theo ở bất kỳ bước nào, ghi lại ảnh màn hình, vai trò đăng nhập và trạng thái booking để xem đó là một vấn đề UX cần cải thiện.

Để kiểm tra hoa hồng, admin cấu hình tài khoản nhận tiền tại **Trung tâm quản trị → Tài khoản nhận hoa hồng SePay**. Khi chuyến mới chuyển sang `Completed`, chủ xe vào **Đơn thuê xe → Hoa hồng nền tảng**, tạo QR và chuyển đúng số tiền/nội dung. Admin chỉ xác nhận sau khi đối chiếu sao kê; QR chưa tự đồng bộ giao dịch.

## 5. Kiểm tra trước khi test

```powershell
npm test
npm run build
```

`npm test` dùng database tạm nên không làm thay đổi dữ liệu demo.

Smoke test backend kiểm tra API tìm kiếm/bộ lọc và chi tiết xe; báo giá do
server tính; dashboard theo vai trò; tạo và quản lý booking; thanh toán cọc mô
phỏng; hợp đồng; bằng chứng check-in/check-out và hoàn tất chuyến; đánh giá,
tranh chấp, đăng/duyệt xe, Trust Score và Risk Level/cảnh báo. Bộ test dùng
database và thư mục upload tạm, không sửa dữ liệu demo.

## 6. Xử lý lỗi thường gặp

### PowerShell chặn npm

Mở Command Prompt (`cmd`) thay cho PowerShell và chạy lại các lệnh npm, hoặc dùng:

```powershell
npm.cmd run install-all
npm.cmd run dev
```

### Cổng 4000 hoặc 5173 đang được sử dụng

Đóng tiến trình Node.js/dev server cũ rồi chạy lại. Trên Windows có thể kiểm tra:

```powershell
Get-NetTCPConnection -State Listen | Where-Object LocalPort -in 4000,5173
```

### Muốn phục hồi dữ liệu demo ban đầu

1. Dừng server bằng `Ctrl + C`.
2. Xóa `server/src/data/db.json`.
3. Chạy lại `npm run dev`.

Backend sẽ tự tạo lại database từ seed. Không gửi file `db.json` có dữ liệu kiểm thử hoặc session thật cho người khác.

### Frontend báo không kết nối được backend

Đảm bảo cả hai dòng Vite và PaceCar API đều đang chạy trong terminal. Kiểm tra trực tiếp http://localhost:4000/api/health; kết quả đúng là JSON có `"ok": true`.

## 7. Gửi báo lỗi

Khi gặp lỗi, gửi kèm:

- Vai trò/tài khoản đang dùng.
- Đường dẫn trang và các bước để tái hiện.
- Ảnh chụp màn hình.
- Nội dung lỗi trong terminal và Console của trình duyệt.
- Trình duyệt, hệ điều hành và phiên bản Node.js.
