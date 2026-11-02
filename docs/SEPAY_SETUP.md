# Tích hợp QR SePay cho tiền cọc

## Luồng hiện tại

- Chủ xe cấu hình mã ngân hàng/VietQR, số tài khoản và tên chủ tài khoản trong **Hồ sơ cá nhân → Tài khoản nhận tiền cọc**.
- Khi booking được chấp nhận, người thuê có thể yêu cầu QR cho đúng số tiền cọc và mã chuyển khoản riêng của booking.
- Tiền được chuyển thẳng từ người thuê đến tài khoản chủ xe. PaceCar không nhận, giữ hoặc chuyển tiền.
- Yêu cầu QR chỉ đưa booking sang trạng thái **Đang chờ chủ xe xác nhận**. Chủ xe phải kiểm tra giao dịch trong tài khoản ngân hàng, đối chiếu số tiền và nội dung chuyển khoản, rồi mới xác nhận trên PaceCar.
- Nếu chưa nhận được tiền, chủ xe có thể hủy QR sau khi đã kiểm tra tài khoản. Không hủy nếu tiền đã chuyển; việc hoàn tiền ngoài quy trình này cần được hai bên xử lý trực tiếp.

Website dùng quick link tạo ảnh QR được mô tả trên [trang QR của SePay](https://qr.sepay.vn/), với ngân hàng, số tài khoản, số tiền và nội dung chuyển khoản lấy từ booking/tài khoản chủ xe. SePay/VietQR nhận các tham số này để trả ảnh QR.

## Cấu hình và triển khai

1. Triển khai phiên bản có luồng QR SePay lên môi trường thử nghiệm.
2. Đăng nhập bằng tài khoản chủ xe thử nghiệm và lưu tài khoản nhận cọc tại trang hồ sơ. Không dùng số tài khoản minh họa hoặc tài khoản không thuộc quyền kiểm soát của chủ xe.
3. Tạo booking thử, chấp nhận booking và tạo QR. Kiểm tra ngân hàng, số tài khoản, số tiền và mã chuyển khoản trước khi thực hiện giao dịch nhỏ.
4. Kiểm tra trạng thái vẫn là chờ xác nhận sau khi tạo QR. Chỉ chủ xe sở hữu booking mới được xác nhận hoặc hủy QR.
5. Xác nhận đã nhận tiền chỉ sau khi đối chiếu sao kê/tài khoản ngân hàng. Sau xác nhận, kiểm tra việc phát hành/ký hợp đồng và nhật ký hoạt động.
6. Trước khi bật cho người dùng thật, xác minh tài khoản ngân hàng của từng chủ xe và hướng dẫn họ xử lý giao dịch không khớp, chuyển thiếu/thừa hoặc chuyển sai nội dung.

Luồng đã chọn là **chủ xe nhận trực tiếp và xác nhận thủ công**. Vì vậy không cần thêm API key, webhook secret hoặc biến môi trường SePay trên Render. Đây chưa phải xác thực thanh toán tự động: ứng dụng không nhận webhook và không tự đánh dấu đã thanh toán khi tiền vào ngân hàng.

Thông tin tài khoản được lưu riêng theo chủ xe; chỉ chủ xe đó có thể xem/sửa trong hồ sơ, và chỉ được trả về cho người thuê đang tạo QR cho booking với chủ xe ấy. Không ghi số tài khoản vào audit log hoặc hồ sơ công khai. URL tạo ảnh QR gửi thông tin tài khoản, số tiền và mã chuyển khoản đến dịch vụ QR của SePay/VietQR.

Các bản ghi cũ có `paymentStatus: "Paid"` được giữ nguyên; ứng dụng không tự giả định các khoản đó đã được ngân hàng đối soát. Cần rà soát thủ công các giao dịch cũ trước khi sử dụng trạng thái đó cho hoạt động thật.

## Nâng cấp xác thực tự động

Muốn xác nhận tự động qua webhook cần một quyết định và thiết kế onboarding riêng cho tài khoản nhận tiền của từng chủ xe, kèm cơ chế xác thực webhook, chống xử lý lặp, đối chiếu đúng tài khoản/số tiền/mã chuyển khoản và xử lý giao dịch sai lệch. Không cấu hình webhook trên một tài khoản PaceCar chung nếu chưa thay đổi và phê duyệt lại điều khoản về bên nhận/giữ tiền.
