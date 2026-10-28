# PaceCar — Trust-based Car Rental Marketplace

PaceCar là demo full-stack của một marketplace thuê xe mang nhận diện riêng, tập trung vào tìm xe thuận tiện, báo giá minh bạch và kiểm soát rủi ro bằng Trust Score. Trải nghiệm khám phá xe được hoàn thiện theo chuẩn một marketplace thực tế; điểm khác biệt cốt lõi của PaceCar vẫn là xác thực, hợp đồng số và bằng chứng giao nhận.

## Mô hình hoạt động của bản demo

- PaceCar là nền tảng công nghệ kết nối; hợp đồng thuê xe được ký trực tiếp giữa người thuê và chủ xe.
- Chủ xe quyết định giá thuê và tiền cọc. Người thuê trả phí nền tảng 10% trên tiền thuê sau điều chỉnh; phí này được tách dòng trong báo giá trước khi đặt.
- PaceCar cung cấp báo giá, hợp đồng số, nhật ký, bằng chứng giao nhận và quy trình hỗ trợ tranh chấp; PaceCar không phải chủ sở hữu hoặc bên trực tiếp cho thuê xe.
- Giao dịch thực hiện ngoài nền tảng không được áp dụng báo giá, hợp đồng số, bằng chứng và quy trình hỗ trợ của PaceCar.
- Đây là mô hình demo. Đơn vị vận hành phải rà soát pháp lý, thanh toán, hoàn tiền và trách nhiệm các bên trước khi cung cấp dịch vụ thật.

Ứng dụng dùng React, Vite, Tailwind CSS, Express và cơ sở dữ liệu JSON cục bộ.

## Chạy dự án

Yêu cầu: Node.js 20 trở lên.

Nếu nhận dự án dưới dạng ZIP để kiểm thử trên máy khác, xem [HUONG_DAN_TEST.md](./docs/HUONG_DAN_TEST.md).

```powershell
cd D:\LAB3\pacecar_demo
npm run install-all
npm run dev
```

Sau đó mở:

- Website: http://localhost:5173
- REST API: http://localhost:4000/api
- Kiểm tra API: http://localhost:4000/api/health

Nếu đã cài dependencies, các lần sau chỉ cần:

```powershell
cd D:\LAB3\pacecar_demo
npm run dev
```

Lệnh trên chạy đồng thời Vite ở cổng `5173` và Express ở cổng `4000`. Frontend gọi API qua `/api`; Vite proxy request sang backend trong môi trường development.

## Tài khoản demo

| Vai trò    | Email             | Mật khẩu |
| ---------- | ----------------- | -------- |
| Người thuê | renter@pacecar.vn | 123456   |
| Chủ xe     | owner@pacecar.vn  | 123456   |
| Quản trị   | admin@pacecar.vn  | 123456   |

Các tài khoản trên là dữ liệu seed dành cho demo. Khi đăng nhập, backend phát session token ngẫu nhiên có thời hạn; trình duyệt chỉ lưu token và hồ sơ public trong `localStorage`. Không sử dụng các tài khoản/mật khẩu seed này khi deploy thật.

## Tính năng

- Landing page PaceCar với tìm kiếm theo địa điểm nhận xe, điểm đến dự kiến, ngày và giờ nhận/trả
- Marketplace chỉ trả về xe `Published` và còn trống trong thời gian đã chọn
- Bộ lọc theo loại xe, hộp số, nhiên liệu, số chỗ, khoảng giá, tự lái/có tài xế, giao tận nơi và đặt xe nhanh
- Sắp xếp theo đề xuất, giá hoặc đánh giá; bộ lọc được giữ trên URL để có thể tải lại/chia sẻ
- Trang chi tiết xe có gallery, tiện nghi, quy định, hồ sơ chủ xe, đánh giá và khối báo giá cố định
- Danh sách yêu thích được lưu theo tài khoản qua backend
- Chương trình ưu đãi và mã giảm giá được kiểm tra phía server
- Báo giá có thời hạn, có phiên bản chính sách và breakdown đầy đủ do backend tính
- Hỗ trợ thuê trong ngày; khoảng 06:00–22:00 được hiển thị là 16 giờ và tính tối thiểu 1 ngày
- Bàn giao được hỗ trợ từ 06:00–22:00; khung tiêu chuẩn 08:00–20:00, ngoài khung tiêu chuẩn thu 100.000đ cho mỗi lượt nhận hoặc trả
- Tạo booking an toàn từ `quoteId`, kiểm tra lại lịch trống và chống tạo trùng bằng `Idempotency-Key`
- Thanh toán tiền cọc mô phỏng có trạng thái, thời điểm, thông báo và audit log để kiểm thử trọn luồng
- Consent được lưu cùng phiên bản chính sách; timestamp chấp thuận do backend tạo
- Giao xe tận nơi với mức phí do chủ xe cấu hình
- Hình thức có tài xế có line item phí riêng trong báo giá
- Đặt xe nhanh chỉ tự động chấp nhận khi xe bật tính năng và người thuê đã xác thực, có mức rủi ro thấp
- Đăng nhập theo ba vai trò
- Tự đăng ký tài khoản người thuê hoặc chủ xe; tài khoản được đăng nhập sau khi tạo thành công, admin không thể tự đăng ký
- Biểu mẫu đăng ký kiểm tra email, số điện thoại, mật khẩu, xác nhận mật khẩu và chấp thuận điều khoản; có trạng thái lỗi/loading và nút hiện mật khẩu
- Nội dung demo về điều khoản và quyền riêng tư tại `/terms` và `/privacy`; cần được đơn vị vận hành rà soát trước khi mở dịch vụ production
- Dashboard người thuê, chủ xe và admin
- Dashboard sidebar theo vai trò, skeleton/error/empty states
- Booking stepper 3 bước với validation lịch thuê và giấy tờ demo
- Notification center với thông báo được backend lưu sau các thao tác booking
- Audit log ghi nhận việc tạo booking và đổi trạng thái
- Trust Score breakdown giải thích từng thành phần điểm
- Modal xác nhận trước khi chủ xe chấp nhận/từ chối
- Chủ xe chấp nhận/từ chối yêu cầu và thêm xe
- Hợp đồng số do chủ xe phát hành từ template server và chỉ hoàn tất khi đủ chữ ký hai bên
- Biên bản check-in/check-out upload ảnh riêng tư, ghi audit log và điều khiển booking lifecycle
- Quy trình hỗ trợ tranh chấp 24–72 giờ
- Rule-based Trust Score và Risk Level (MVP, không phải AI)
- REST API CRUD cho xe, booking, hợp đồng, bằng chứng và tranh chấp
- API notification, audit log và kiểm tra booking lifecycle
- AuthContext độc lập, route guard theo vai trò và Error Boundary chống màn hình trắng
- Kiểm tra trùng lịch xe, bảo vệ chuyển trạng thái và loại password khỏi API response
- Trang quản lý đơn thuê có lọc theo vai trò/trạng thái và hành động lifecycle
- Hồ sơ người dùng có thể cập nhật qua API
- Availability calendar, booking timeline, reviews và risk alerts có API riêng
- Dashboard trả về thống kê, doanh thu theo tháng, utilization và calendar

## Khám phá và tìm xe

Trang `/cars` sử dụng API `GET /api/search/cars`. Các tiêu chí đang được hỗ trợ:

| Nhóm       | Tiêu chí                                      |
| ---------- | --------------------------------------------- |
| Hành trình | Địa điểm nhận xe, ngày nhận, ngày trả         |
| Xe         | Loại xe, hộp số, nhiên liệu, số chỗ           |
| Giá        | Giá tối thiểu, giá tối đa                     |
| Dịch vụ    | Tự lái, có tài xế, giao tận nơi, đặt xe nhanh |
| Hiển thị   | Đề xuất, giá tăng/giảm, đánh giá; phân trang  |

Khi có đủ ngày nhận/trả, backend loại các xe đang có booking hoạt động bị trùng lịch. Kết quả kèm giá tạm tính theo số ngày, thông tin uy tín chủ xe và trạng thái yêu thích của người đang đăng nhập.

Các đường dẫn demo:

- Tìm xe: `http://localhost:5173/cars`
- Xe yêu thích: `http://localhost:5173/favorites`
- Đơn thuê: `http://localhost:5173/bookings`

## Ưu đãi, báo giá và booking

Luồng đặt xe không nhận giá do frontend gửi lên:

```text
Chọn xe và lịch trống
→ POST /api/quotes
→ nhận quoteId + breakdown + thời hạn
→ đăng nhập tài khoản người thuê
→ POST /api/bookings với quoteId + Idempotency-Key
→ backend kiểm tra quote, quyền, trạng thái tin và lịch trống lần cuối
→ Pending hoặc Accepted nếu đủ điều kiện đặt xe nhanh
```

Breakdown báo giá hiện gồm giá thuê theo ngày, phụ thu cuối tuần, giảm giá thuê dài ngày, phí tài xế khi có, phí nền tảng, bảo hiểm, giao xe, phụ phí bàn giao ngoài giờ, ưu đãi, tổng thanh toán và tiền cọc. Quote mặc định có hiệu lực 15 phút và lưu `policyVersion` cùng pricing snapshot vào booking để tránh frontend/backend tự tính khác nhau.

Nhiên liệu không nằm trong giá thuê. Chính sách mặc định là giao đầy – trả đầy; mức nhiên liệu thực tế, ODO và ảnh trước/sau được lưu trong biên bản giao nhận để đối chiếu.

Sau khi chủ xe chấp nhận yêu cầu, hợp đồng được phát hành từ điều khoản cố định của server. Người thuê và chủ xe ký độc lập; booking chỉ chuyển sang `Contract Signed` khi đủ hai chữ ký. Check-in/check-out yêu cầu ảnh riêng tư, mức nhiên liệu và ODO hợp lệ trước khi backend chuyển trạng thái tiếp theo.

Mã ưu đãi seed:

| Mã           | Điều kiện demo                                     |
| ------------ | -------------------------------------------------- |
| `PACECAR10`  | Giảm 10%, tối đa 300.000đ, tiền thuê từ 1.000.000đ |
| `WEEKEND200` | Giảm 200.000đ cho hành trình từ 3 ngày             |

Mã được kiểm tra điều kiện và hạn sử dụng ở backend. `Idempotency-Key` giúp việc người dùng bấm lại hoặc client retry không tạo thêm booking giống nhau cho cùng tài khoản.

### Điều khoản, xác nhận giá và hoa hồng thử nghiệm

Chi tiết tích hợp, bảng yêu cầu, quyết định còn mở và rollback: [docs/TICH_HOP_TAI_LIEU.md](docs/TICH_HOP_TAI_LIEU.md).

- `POST /api/bookings` yêu cầu `consent.termsAccepted` và `consent.roleAcknowledged` đều `true` cùng `termsVersion` hiện hành; backend lưu vào `termsConsents` (người dùng, phiên bản, thời điểm, mã booking/quote).
- Chủ xe đề xuất đổi giá qua `price-revisions`, người thuê xác nhận; thanh toán/ký hợp đồng bị chặn khi còn đề xuất chờ xác nhận.
- Biên bản hoàn cọc chỉ là bản ghi thỏa thuận; PaceCar không giữ hay chuyển tiền cọc.
- Phản ánh: `POST /api/reports`; admin xem tại trung tâm quản trị.
- Hoa hồng 5%/4%/3% (một mức cho toàn bộ cơ sở) là **phương án đề xuất**, chỉ chạy khi `COMMISSION_TRIAL_ENABLED=true`, chỉ do admin ghi nhận thử, không tạo công nợ, không đổi tổng tiền của người thuê.

## Luồng đăng xe cho thuê

Đăng nhập bằng tài khoản chủ xe rồi mở **Đăng xe cho thuê** trên navbar hoặc sidebar.

1. Khai báo nhận diện xe, biển số và địa điểm.
2. Chọn thông số, hình thức thuê và tiện nghi.
3. Thiết lập giá, tiền cọc, thời hạn và quy định.
4. Upload 3–10 ảnh xe cùng đăng ký và bảo hiểm.
5. Lưu nháp hoặc gửi PaceCar kiểm duyệt.

Lifecycle tin đăng:

```text
Draft → Pending Review → Published
                    └──→ Rejected → chỉnh sửa → Pending Review
Published ⇄ Paused
Draft/Rejected → Archived
```

- Quản lý xe: `http://localhost:5173/owner/cars`
- Đăng xe: `http://localhost:5173/owner/cars/new`
- Admin duyệt xe: `http://localhost:5173/admin/car-approvals`
- Tin nháp/chờ duyệt/bị từ chối không xuất hiện trong API công khai.
- Giấy tờ xe nằm trong kho private; chỉ chủ sở hữu và admin được truy cập.
- Booking chỉ được tạo cho xe `Published`; owner, giá, phí và tiền cọc do server xác định.
- Chủ xe có thể bật giao tận nơi và đặt mức phí cố định cho mỗi booking; bản demo chưa tính quãng đường thực tế bằng bản đồ.
- Chủ xe có thể bật đặt xe nhanh. Backend vẫn áp dụng điều kiện người thuê đã xác thực và `riskLevel` là `Low`; trường hợp khác tiếp tục ở trạng thái `Pending`.

## Bảo mật và cấu hình deploy

- Login phát session token ngẫu nhiên có hạn 7 ngày; backend chỉ lưu SHA-256 token hash.
- Password seed được migrate sang `scrypt` hash sau lần đăng nhập đầu tiên.
- API mutation kiểm tra role và quyền sở hữu, không tin `ownerId` từ client.
- Helmet, CORS allowlist, rate limit login/upload và giới hạn payload đã được bật.
- Copy `.env.example` thành `.env` hoặc cấu hình `PORT`, `CLIENT_ORIGIN` trên host.
- JSON database được ghi bằng atomic rename, phù hợp demo/single instance. Khi chạy nhiều instance thực tế, cần thay bằng PostgreSQL và chuyển upload sang S3/R2 hoặc object storage tương đương.

## Cấu trúc

```text
pacecar_demo/
├── client/             # React + Vite + Tailwind
│   └── src/
│       ├── components/
│       ├── services/
│       ├── App.jsx
│       └── pages.jsx
├── server/             # Express REST API
│   └── src/
│       ├── data/       # Seed và db.json được tạo tự động
│       └── index.js
├── docs/               # Tài liệu thiết kế, kiểm thử và báo cáo
├── package.json
└── README.md
```

## Dữ liệu cục bộ

Trong lần khởi động API đầu tiên, seed được ghi vào `server/src/data/db.json`. Các thao tác tạo booking, cập nhật trạng thái, thêm xe và tạo tranh chấp sẽ được lưu tại đây. Xóa `db.json` rồi khởi động lại server để phục hồi seed ban đầu.

## Build production frontend

```bash
npm run build
```

Build được tạo tại `client/dist`. Frontend gọi API bằng đường dẫn tương đối `/api`; khi deploy cần cấu hình reverse proxy cùng origin hoặc thay bằng cấu hình API endpoint phù hợp. Ảnh seed lấy từ Unsplash nên cần kết nối mạng để hiển thị.

## Deploy lên Render

Repository có sẵn Blueprint [`render.yaml`](./render.yaml) để build frontend và chạy toàn bộ ứng dụng bằng một Render Web Service. Express phục vụ cả REST API tại `/api` và bản build React tại cùng domain.

1. Đăng nhập Render, chọn **New > Blueprint**.
2. Kết nối repository GitHub này và chọn nhánh `main`.
3. Xác nhận Blueprint. Render sẽ tạo service `pacecar` ở region Singapore, build bằng `npm run render-build`, chạy bằng `npm start` và kiểm tra `/api/health`.
4. Khi deploy hoàn tất, mở URL `https://pacecar-....onrender.com`. Mỗi lần push tiếp theo vào `main` sẽ tự động deploy lại.

Blueprint mặc định dùng gói `free`. Filesystem của gói này là tạm thời, vì vậy booking, session và ảnh upload có thể trở về dữ liệu seed sau khi service restart/redeploy. Nếu cần lưu lại dữ liệu demo:

- Đổi service sang gói trả phí và gắn persistent disk tại `/var/data`.
- Đặt `PACECAR_DB_FILE=/var/data/pacecar-db.json`.
- Đặt `PACECAR_UPLOAD_DIR=/var/data/uploads`.
- Giữ service ở một instance; với production thực tế nên chuyển sang PostgreSQL và object storage.

Backend production cũng có thể chạy riêng bằng:

```powershell
npm start
```

Lệnh `npm start` chỉ khởi động Express API, không tự phục vụ `client/dist`.

## Kiểm thử backend

```powershell
npm test
```

Smoke test khởi động API trên database tạm, kiểm tra đăng ký renter/owner, validation, email trùng, session và logout cùng authorization, quote, booking/idempotency, hợp đồng hai chữ ký và chống lách kiểm duyệt. Database sử dụng hằng ngày không bị chỉnh sửa.

## Hệ thống thiết kế

Màu sắc, typography, spacing, trạng thái tương tác, minh họa hero và nguyên tắc accessibility/responsive được ghi tại [`DESIGN_SYSTEM.md`](./docs/DESIGN_SYSTEM.md).

## Giới hạn của bản demo

- Bước thanh toán hiện chỉ là mô phỏng để kiểm thử hành trình; chưa tích hợp cổng thanh toán, webhook ngân hàng hay quy trình hoàn tiền thật.
- Tìm kiếm địa điểm là so khớp chuỗi; chưa dùng geocoding, bản đồ hoặc khoảng cách GPS thực tế.
- Phí giao tận nơi là mức cố định do chủ xe nhập, chưa tính theo số km.
- JSON database và thư mục upload cục bộ chỉ phù hợp một instance demo.
- Khi deploy đa instance cần PostgreSQL, object storage, transaction/locking cho availability và secret/session store dùng chung.
