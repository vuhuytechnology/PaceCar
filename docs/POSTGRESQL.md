# Chuyển PaceCar sang PostgreSQL

## Cách lưu trữ

Khi có `DATABASE_URL`, backend dùng bảng `pacecar_store` với một hàng chứa toàn bộ dữ liệu ứng dụng dưới dạng JSONB. Store vẫn giữ giao diện đồng bộ hiện có; các lần ghi được xếp hàng tuần tự và API chờ lưu xong trước khi kết thúc phản hồi. Lỗi ghi trả về HTTP 503 và làm store từ chối các lần đọc tiếp theo để tránh báo thành công khi dữ liệu chưa bền vững.

Đây là bước chuyển đổi ít thay đổi nghiệp vụ, chưa phải schema quan hệ đã chuẩn hóa. Không chạy nhiều instance ứng dụng cùng lúc vì mỗi instance giữ cache riêng. Khi không có `DATABASE_URL`, backend tiếp tục dùng file JSON như trước.

Ảnh bằng chứng tranh chấp được lưu riêng trong bảng `pacecar_evidence_blobs` dưới dạng BYTEA khi có `DATABASE_URL`, không nằm trong JSONB của `pacecar_store`. Nếu không có PostgreSQL, ảnh bằng chứng vẫn dùng thư mục upload local. Ảnh tin xe và tài liệu riêng tư vẫn nằm trên filesystem; cần persistent disk hoặc object storage riêng để giữ các tệp này qua lần deploy.

Các ảnh bằng chứng đã tải lên trước thay đổi này vẫn được đọc từ filesystem nếu tệp còn tồn tại. Không thể khôi phục những tệp đã bị mất khỏi filesystem; người dùng cần tải lại ảnh gốc nếu còn bản sao.

## Render và cấu hình

1. Tạo PostgreSQL cùng region với web service.
2. Với dịch vụ Render, đặt `DATABASE_URL` bằng **Internal Database URL** của database. `render.yaml` khai báo biến này với `sync: false`, do đó Blueprint yêu cầu cấu hình thủ công và không tạo database có thể tính phí ngoài ý muốn.
3. Nếu chọn PostgreSQL Free của Render, cần lưu ý database sẽ hết hạn sau 30 ngày; không dùng làm nơi lưu dữ liệu production lâu dài. Chọn gói lưu trữ bền vững phù hợp trước khi chuyển production.
4. Không bật `DATABASE_URL` trên service trước khi import xong dữ liệu hiện có. Nếu database trống và service khởi động trước, ứng dụng sẽ khởi tạo dữ liệu seed.

Local development có thể giữ JSON bằng cách bỏ `DATABASE_URL`. `.env.example` liệt kê các biến liên quan.

## Nhập dữ liệu hiện có

Sao lưu file JSON hiện có trước. Lệnh import yêu cầu `DATABASE_URL`, chỉ ghi vào database chưa có dữ liệu PaceCar và không ghi đè một database đã được khởi tạo:

```powershell
$env:DATABASE_URL = "postgresql://..."
npm run db:import-json --prefix server -- "D:\backup\pacecar-db.json"
```

Sau khi import, cấu hình cùng `DATABASE_URL` cho web service rồi khởi động và kiểm tra `/api/health`, đăng nhập, tìm xe, xem chi tiết và gửi yêu cầu trên môi trường thử nghiệm. Không tạo lịch sử chấp thuận hay dữ liệu giao dịch giả trong quá trình import.

Nếu không có bản sao của file JSON đang chạy trên production, phải lấy được bản sao đó trước khi chuyển. Không thể khôi phục dữ liệu chỉ từ code hoặc dữ liệu seed trong repository.

## Sao lưu và rollback

Xuất dữ liệu PostgreSQL thành JSON trước khi thay đổi cấu hình hoặc rollback:

```powershell
$env:DATABASE_URL = "postgresql://..."
npm run db:export-json --prefix server -- "D:\backup\pacecar-db.json"
```

Lệnh export ghi file tạm cùng thư mục rồi đổi tên nguyên tử. Bảo vệ file sao lưu như dữ liệu nhạy cảm vì nó chứa thông tin ứng dụng.

Để quay lại bản JSON, dừng ghi vào database, export bản dữ liệu mới nhất, đặt file đã export tại vị trí bền vững, cấu hình `PACECAR_DB_FILE` trỏ tới file đó và bỏ `DATABASE_URL` trước khi triển khai lại phiên bản tương thích JSON. Giữ nguyên database PostgreSQL đến khi xác nhận bản rollback hoạt động; không xóa hoặc reset database để rollback.

## Kiểm thử và giới hạn

- `npm test` chạy smoke/deal tests với JSON cô lập; các test chủ động bỏ `DATABASE_URL`.
- PostgreSQL tự tạo các bảng `pacecar_store` và `pacecar_evidence_blobs` ở lần khởi động đầu; store cũng áp dụng các migration dữ liệu hiện có trong ứng dụng.
- Cần kiểm thử kết nối, import, luồng đọc/ghi, khởi động lại và backup/restore trên database thử trước khi đổi production.
- Migration không chuyển ảnh tin xe hoặc tài liệu riêng tư; không thay đổi nghiệp vụ và không thay schema JSON thành các bảng quan hệ riêng.
