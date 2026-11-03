# Tích hợp QR SePay

## Tiền cọc

- Chủ xe cấu hình mã ngân hàng/VietQR, số tài khoản và tên chủ tài khoản trong **Hồ sơ cá nhân → Tài khoản nhận tiền cọc**.
- Khi booking được chấp nhận, người thuê có thể yêu cầu QR cho đúng số tiền cọc và mã chuyển khoản riêng của booking.
- Tiền được chuyển thẳng từ người thuê đến tài khoản chủ xe. PaceCar không nhận, giữ hoặc chuyển tiền.
- Yêu cầu QR chỉ đưa booking sang trạng thái **Đang chờ chủ xe xác nhận**. Chủ xe phải kiểm tra giao dịch trong tài khoản ngân hàng, đối chiếu số tiền và nội dung chuyển khoản, rồi mới xác nhận trên PaceCar.
- Nếu chưa nhận được tiền, chủ xe có thể hủy QR sau khi đã kiểm tra tài khoản. Không hủy nếu tiền đã chuyển; việc hoàn tiền ngoài quy trình này cần được hai bên xử lý trực tiếp.

Website tạo ảnh QR qua [SePay QR](https://qr.sepay.vn/) với ngân hàng, số tài khoản, số tiền và nội dung chuyển khoản lấy từ booking/tài khoản nhận tiền. QR chỉ tạo hướng dẫn chuyển khoản; nó không xác minh tiền đã vào tài khoản.

## Cấu hình và triển khai

1. Triển khai phiên bản có luồng QR SePay lên môi trường thử nghiệm.
2. Đăng nhập bằng tài khoản chủ xe thử nghiệm và lưu tài khoản nhận cọc tại trang hồ sơ. Không dùng số tài khoản minh họa hoặc tài khoản không thuộc quyền kiểm soát của chủ xe.
3. Tạo booking thử, chấp nhận booking và tạo QR. Kiểm tra ngân hàng, số tài khoản, số tiền và mã chuyển khoản trước khi thực hiện giao dịch nhỏ.
4. Kiểm tra trạng thái vẫn là chờ xác nhận sau khi tạo QR. Chỉ chủ xe sở hữu booking mới được xác nhận hoặc hủy QR.
5. Xác nhận đã nhận tiền chỉ sau khi đối chiếu sao kê/tài khoản ngân hàng. Sau xác nhận, kiểm tra việc phát hành/ký hợp đồng và nhật ký hoạt động.
6. Trước khi bật cho người dùng thật, xác minh tài khoản ngân hàng của từng chủ xe và hướng dẫn họ xử lý giao dịch không khớp, chuyển thiếu/thừa hoặc chuyển sai nội dung.

Luồng đã chọn là **chủ xe nhận trực tiếp và xác nhận thủ công**. Vì vậy không cần thêm API key, webhook secret hoặc biến môi trường SePay trên Render. Đây chưa phải xác thực thanh toán tự động: ứng dụng không nhận webhook và không tự đánh dấu đã thanh toán khi tiền vào ngân hàng.

Thông tin tài khoản cọc được lưu riêng theo chủ xe; chỉ chủ xe đó có thể xem/sửa trong hồ sơ, và chỉ được trả về cho người thuê đang tạo QR cho booking với chủ xe ấy. Không ghi số tài khoản vào audit log hoặc hồ sơ công khai.

Các bản ghi cũ có `paymentStatus: "Paid"` được giữ nguyên; ứng dụng không tự giả định các khoản đó đã được ngân hàng đối soát. Cần rà soát thủ công các giao dịch cũ trước khi sử dụng trạng thái đó cho hoạt động thật.

## Tiền thuê còn lại

- Sau khi hợp đồng có đủ chữ ký, người thuê tạo QR cho toàn bộ tổng phí thuê (`totalPrice`) tại trang hợp đồng hoặc biên bản giao nhận.
- Tiền cọc hoàn lại là khoản bảo đảm riêng, không được trừ khỏi tổng phí thuê. QR tiền thuê chuyển thẳng vào tài khoản nhận tiền của chủ xe; PaceCar không nhận hoặc giữ khoản này.
- Chủ xe đối chiếu sao kê rồi xác nhận hoặc hủy QR trong trang hợp đồng/đơn thuê. Không xác nhận dựa trên ảnh chụp. Chuyến không thể chuyển sang `Ongoing` cho đến khi chủ xe xác nhận đã nhận đủ tiền thuê.
- Booking tạo trước khi bật theo dõi khoản tiền thuê còn lại không tự bị đánh dấu chưa thanh toán, tránh thu lại khoản đã được hai bên thanh toán trực tiếp.
- QR không tự xác minh giao dịch. Admin không ghi nhận tiền thuê này là doanh thu PaceCar; doanh thu của admin chỉ phát sinh từ hoa hồng chủ xe đã được admin xác nhận ở bước tiếp theo.

## Hoa hồng chủ xe chuyển cho PaceCar

- Hoa hồng được ghi nhận khi booking **lần đầu chuyển sang `Completed`**. Các booking đã hoàn tất trước khi bật luồng này không bị tính hồi tố.
- Cơ sở tính là `pricingSnapshot.baseRental` (số ngày × giá thuê/ngày). Mức áp dụng cho toàn bộ cơ sở tính: dưới 1.000.000đ là 5%; từ 1.000.000đ đến dưới 2.000.000đ là 4%; từ 2.000.000đ là 3%. Làm tròn half-up đến đồng Việt Nam.
- Chủ xe không trả thêm hoa hồng qua báo giá thuê; khoản hoa hồng là một khoản riêng phát sinh sau chuyến.
- Admin đăng nhập **Trung tâm quản trị → Tài khoản nhận hoa hồng SePay** để cấu hình ngân hàng, số tài khoản và tên chủ tài khoản nhận tiền của PaceCar.
- Chủ xe mở **Đơn thuê xe → Hoa hồng nền tảng**, tạo QR và chuyển đúng số tiền cùng nội dung chuyển khoản hiển thị.
- Admin đối chiếu sao kê tài khoản nhận tiền theo đúng số tiền và mã chuyển khoản, sau đó chọn **Xác nhận đã nhận tiền**. Không xác nhận dựa trên ảnh chụp do chủ xe gửi.
- Doanh thu hoa hồng chỉ được tính sau khi admin xác nhận; các khoản chưa trả hoặc đang chờ đối soát được hiển thị riêng trong số liệu quản trị.

Luồng này dùng QR chuyển khoản SePay, chưa tích hợp webhook/API để tự đối soát. Trạng thái chỉ chuyển sang đã thanh toán sau khi admin xác nhận thủ công. Tài khoản nhận hoa hồng độc lập với tài khoản nhận tiền cọc của từng chủ xe.

## Nâng cấp xác thực tự động

Muốn xác nhận tự động qua webhook cần cấu hình webhook SePay, xác thực nguồn gọi, chống xử lý lặp và đối chiếu đúng tài khoản, số tiền, mã chuyển khoản; cần kiểm thử cả giao dịch sai lệch và hoàn tiền. Luồng hoa hồng hiện không tự động xác nhận.
