# Tích hợp "Điều khoản – Dịch vụ" và "Chiến lược giá" vào PaceCar

Trạng thái: **đã tích hợp và kiểm thử cục bộ; CHƯA deploy production** (chưa có URL production/staging và còn quyết định nghiệp vụ chặn phát hành).

## 1. Khác biệt giữa tài liệu và hệ thống đang vận hành

| Nội dung | Production hiện tại | Tài liệu | Xử lý |
|---|---|---|---|
| Phí nền tảng | Báo giá người thuê không cộng hoa hồng (`platformFeeRate = 0`) | Hoa hồng thu từ **chủ xe** 3–5%, không thu người thuê | Áp dụng mức 5% / 4% / 3%; QR SePay chuyển vào tài khoản PaceCar, admin đối chiếu thủ công |
| Hoa hồng | Ghi nhận phải thu khi booking mới chuyển sang `Completed` | Chủ xe chịu hoa hồng theo mức bậc | Tự tạo một khoản phải thu duy nhất cho mỗi booking; không tính hồi tố booking đã hoàn tất trước khi triển khai |
| "Giao dịch thành công" | `Completed` | Booking hoàn tất | Tạo khoản hoa hồng khi trạng thái chuyển lần đầu sang `Completed` |
| Làm tròn | Half-up về VNĐ nguyên | – | Dùng `half-up-vnd` |
| Thành phần cơ sở tính | `pricingSnapshot.baseRental` (ngày × giá/ngày) | "Tổng tiền thuê cơ bản" | Không gồm giao xe, cọc, bảo hiểm, phụ phí cuối tuần/tài xế, giảm giá dài ngày/khuyến mãi |
| Pháp nhân, ngày hiệu lực, chính sách dữ liệu, hủy/hoàn | Không có | Để trống | Hiển thị "chưa công bố"; không bịa |

## 2. Bảng truy vết yêu cầu

| # | Nguồn | Yêu cầu | Thay đổi | Test | Trạng thái |
|---|---|---|---|---|---|
| 1 | ĐK III | Nêu vai trò nền tảng kết nối, giá/hợp đồng/thanh toán xác nhận trực tiếp | Trang `/terms`, checkbox thứ 2 ở bước gửi yêu cầu | build | Done (nội dung là bản nháp) |
| 2 | ĐK | Checkbox không chọn sẵn; backend kiểm tra và lưu chấp thuận | `index.js` POST /bookings, `termsConsents` | deals.mjs (7 ca từ chối, log) | Pass |
| 3 | ĐK | Gửi yêu cầu ≠ đặt xe xác nhận | Nút "Gửi yêu cầu kết nối", toast, mục điều khoản | Chưa kiểm thử UI tự động | Done / UI not run |
| 4 | ĐK | Tách giá cơ bản, phụ phí, giảm giá, tổng, cọc; kilomet, nhiên liệu, hủy, hoàn cọc, hạn báo giá | `quote.conditions`, `PriceConditions`, trường `cancellationPolicy`/`depositRefundTerms` ở form đăng xe | smoke.mjs | Pass (API); thiếu dữ liệu hiển thị "chưa công bố" |
| 5 | ĐK Mẫu A | Đổi giá giữ lịch sử, xác nhận lại | `price-revisions`; chặn thanh toán/ký khi chờ | deals.mjs | Pass |
| 6 | ĐK Mẫu B | Bàn giao | Dùng evidence check-in/out hiện có | smoke.mjs | Reused |
| 7 | ĐK Mẫu C | Hoàn cọc | `deposit-refund` (chỉ ghi nhận) | deals.mjs | Pass |
| 8 | ĐK | Kênh phản ánh | `POST /reports`, `ReportForm`, admin | deals.mjs | Pass |
| 9 | ĐK | Đồng ý dữ liệu riêng | Không triển khai: chính sách dữ liệu chưa chốt | – | Blocked (quyết định) |
| 10 | Giá | Mốc 999.999/1.000.000/1.999.999/2.000.000; 2.100.000→63.000; 1.4M→56.000 | `policy.js` | deals.mjs | Pass |
| 11 | Giá | Không lũy tiến, không tính cọc/phụ phí, không thu người thuê | `policy.js`, quote pricing, commission ledger | deals.mjs / smoke.mjs | Pass |
| 12 | Giá | Lưu phiên bản chính sách, không tính lại, idempotent | `commissions` | deals.mjs | Pass |
| 13 | Thanh toán | QR hoa hồng chuyển đến tài khoản admin; admin xác nhận sau khi đối chiếu sao kê | `commissionPayments`, SePay QR | deals.mjs | Pass |
| 14 | – | Không giả lịch sử chấp thuận cho dữ liệu cũ | Booking cũ không có `consent`; vẫn hoạt động | deals.mjs (booking 9001) | Pass |
| 15 | – | Không thu thập CCCD theo mẫu | Không thêm trường | – | Done |

## 3. Kết quả kiểm thử thực chạy

- `npm test` (server): smoke.mjs **pass**, deals.mjs **pass**.
- `npm run build --prefix client`: **pass**.
- Chưa chạy: lint/typecheck (repo không cấu hình), CI (không có), kiểm thử giao diện mobile/desktop thủ công, E2E UI trên staging, smoke test production — **not run**.
- smoke.mjs chứa các chỉnh sửa chưa commit sẵn có của người khác; đã giữ nguyên.

## 4. Migration và cấu hình

- Không cần migration thủ công: `store.js` tự thêm `termsConsents`, `reports`, `commissions`, `commissionPayments` và tài khoản nhận hoa hồng khi đọc DB cũ.
- Booking cũ thiếu `consent`, `pricingSnapshot`, `priceRevisions`, `depositRefund` vẫn hoạt động.
- Phí 10% cũ từ báo giá người thuê được đặt về 0 khi khởi tạo store; báo giá cũ còn mang phí này sẽ bị yêu cầu tạo lại.
- Trial commission cũ (nếu có) vẫn không thu được và không tự chuyển thành công nợ.
- Admin phải cấu hình tài khoản nhận hoa hồng trong trung tâm quản trị trước khi chủ xe tạo QR.
- Client cũ đang mở không gửi `termsAccepted/roleAcknowledged/termsVersion` sẽ bị từ chối 422 đến khi tải lại trang — chủ ý.

## 5. Phát hành và rollback

- Render tự deploy khi push lên `main` (`render.yaml`). Trước khi push: sao lưu file DB trên persistent disk (`PACECAR_DB_FILE`), kiểm tra trên bản preview.
- Sau deploy: smoke test đăng nhập, tìm xe, chi tiết, báo giá, gửi yêu cầu có/không chấp thuận, `/terms`, health check.
- Rollback code: `git revert` commit tích hợp rồi push. Dữ liệu: các mảng mới vô hại với code cũ; khôi phục bản sao lưu DB nếu cần. Cờ tắt thì không có khoản thu nào.

## 6. Quyết định nghiệp vụ còn chặn phát hành

1. Pháp nhân vận hành, kênh liên hệ/khiếu nại chính thức, ngày hiệu lực điều khoản.
2. Chính sách bảo vệ dữ liệu cá nhân và có cần đồng ý xử lý dữ liệu riêng không.
3. Điều kiện hủy/hoàn tiền chuẩn của nền tảng.
4. Chính sách hoa hồng đã chốt theo mô hình chủ xe trả, người thuê không chịu phí nền tảng trong báo giá; tiêu chí phát sinh là booking mới chuyển sang `Completed`.
5. Cần quyết định xử lý điều chỉnh/hoàn hoa hồng trong trường hợp hoàn tiền hoặc tranh chấp phát sinh sau khi đã ghi nhận/đã thanh toán.
6. Thỏa thuận dịch vụ với đối tác nếu có thu phí.
7. URL production/staging và phạm vi deploy.
