from __future__ import annotations

import io
import unicodedata
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from lxml import etree
from openpyxl import load_workbook
from pptx import Presentation
from pptx.util import Inches, Pt


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "PACECAR_EXE201_PRODUCT_DECK_UPDATED.pptx"
OUTPUT = ROOT / "docs" / "PACECAR_EXE201_PRODUCT_DECK_EN.pptx"


T = {
    # Slide 1
    "Từ MVP đến nền tảng thuê xe\nminh bạch & an toàn hơn": "From MVP to a more transparent\nand safer car rental platform",
    "Overview dự án • Validation • Feedback → cải tiến • Sản phẩm 3 cấp độ": "Project overview • Validation • Feedback → improvements • 3 product levels",
    "BẢN TRÌNH BÀY SẢN PHẨM": "PRODUCT PRESENTATION",
    "05.11.2026": "05 NOV 2026",
    "Nguồn: Báo cáo kỹ thuật PaceCar (04.11.2026) và tài liệu góp ý mentor.": "Sources: PaceCar Technical Report (04 Nov 2026) and mentor feedback.",
    # Slide 2
    "Dự án trong 60 giây": "The project in 60 seconds",
    "Một nền tảng kết nối — không giữ tiền — nhưng giữ lại bằng chứng, quy trình và sự minh bạch.": "A marketplace that does not hold customer funds—but preserves evidence, process, and transparency.",
    "vai trò người dùng": "user roles",
    "nhóm tính năng hoạt động": "active feature groups",
    "xe mẫu phục vụ demo": "demo vehicles",
    "xe công khai trên website": "public vehicles",
    "BÀI TOÁN": "PROBLEM",
    "Thuê xe qua mạng xã hội thiếu minh bạch về giá, lịch trống và trách nhiệm.": "Social-media car rentals lack transparency in pricing, availability, and accountability.",
    "GIẢI PHÁP": "SOLUTION",
    "Tìm xe → báo giá → hợp đồng số → giao nhận có bằng chứng → tranh chấp.": "Search → quote → digital contract → evidence-based handover → dispute support.",
    "MÔ HÌNH": "MODEL",
    "Chủ xe trả hoa hồng 3–5% sau chuyến; người thuê không trả phí nền tảng.": "Owners pay a 3–5% commission after each trip; renters pay no platform fee.",
    "Phiên bản hiện tại được xem là sản phẩm hoàn thiện theo phạm vi demo/EXE201; các khoảng trống production được nêu ở cuối deck.": "The current version is complete within the EXE201/demo scope; production gaps are outlined at the end.",
    # Slide 3
    "Trust Score: công thức tính điểm tin cậy": "Trust Score: how reliability is calculated",
    "Mọi tài khoản bắt đầu ở 50 điểm; hành vi thật cộng hoặc trừ điểm, kết quả luôn nằm trong thang 0–100.": "Every account starts at 50 points. Real behavior adds or subtracts points, with the final score capped at 0–100.",
    "Điểm gốc": "Base score",
    "Xác thực hồ sơ": "Profile verification",
    "Lịch sử giao dịch": "Transaction history",
    "Đánh giá (Bayes)": "Reviews (Bayesian)",
    "Phạt": "Penalties",
    "Tranh chấp • hủy đơn": "Disputes • cancellations",
    "Ví dụ: một người thuê qua từng sự kiện": "Example: a renter's score across events",
    "Điểm thay đổi sau mỗi bước": "Score after each event",
    "Xác thực\nđủ hồ sơ": "Fully verified\nprofile",
    "Chuyến đầu\nhoàn tất": "First trip\ncompleted",
    "Đánh giá\n5 sao": "5-star\nreview",
    "Hủy đơn\nđã thanh toán": "Paid booking\ncancelled",
    "Tranh chấp\nlỗi vừa": "Medium-fault\ndispute",
    "Điểm cuối": "Final score",
    "MỨC RỦI RO TỰ ĐỘNG": "AUTOMATED RISK LEVEL",
    "Ví dụ: 58": "Example: 58",
    "LOW cần điểm ≥ 75 và đã xác thực • tranh chấp nghiêm trọng → HIGH ngay.": "LOW requires a score ≥75 and verified status • a severe dispute immediately sets HIGH.",
    "+ CỘNG ĐIỂM": "+ POINTS",
    "Chuyến đầu +5, sau đó +2\nĐặt cọc đúng hạn +1\nBiên bản giao nhận đủ +1\nTrả xe đúng giờ +1": "First trip +5, then +2\nOn-time deposit +1\nComplete handover record +1\nOn-time return +1",
    "− TRỪ ĐIỂM": "− POINTS",
    "Người thuê hủy −5 / −10\nChủ xe hủy −8 / −15\nTranh chấp nhẹ −10\nVừa −20 • Nặng −30": "Renter cancellation −5 / −10\nOwner cancellation −8 / −15\nMinor dispute −10\nMedium −20 • Severe −30",
    "Nguồn: server/src/trustScore.js. Ví dụ minh họa theo quy tắc hiện hành; hủy đơn tính theo hai mức: chưa / đã thanh toán.": "Source: server/src/trustScore.js. The example follows current rules; cancellations use two tiers: unpaid / paid.",
    # Slide 4
    "Chốt lại vai trò của PaceCar": "Defining PaceCar's role",
    "Quyết định cốt lõi sau feedback mentor": "The core decision after mentor feedback",
    "PACE CAR = NỀN TẢNG KẾT NỐI": "PACE CAR = A CONNECTION MARKETPLACE",
    "●  Hợp đồng ký trực tiếp: người thuê ↔ chủ xe": "●  Direct contract: renter ↔ vehicle owner",
    "●  Cọc và tiền thuê chuyển thẳng cho chủ xe": "●  Deposit and rental payment go directly to the owner",
    "●  PaceCar cung cấp báo giá, hợp đồng số và bằng chứng": "●  PaceCar provides quotes, digital contracts, and evidence",
    "●  PaceCar hỗ trợ đối chiếu tranh chấp, không sở hữu xe": "●  PaceCar supports dispute review and does not own vehicles",
    "KHÔNG GIỮ TIỀN": "NO FUND CUSTODY",
    "KHÔNG PHÍ ẨN": "NO HIDDEN FEES",
    "CÓ BẰNG CHỨNG": "EVIDENCE RECORDED",
    "DÒNG GIÁ TRỊ": "VALUE FLOW",
    "NGƯỜI THUÊ": "RENTER",
    "Tìm xe\nMinh bạch chi phí": "Find a vehicle\nTransparent costs",
    "Kết nối\nBảo vệ quy trình": "Connect\nProtect the process",
    "CHỦ XE": "VEHICLE OWNER",
    "Tăng tỷ lệ lấp đầy\nQuản lý giao dịch": "Increase utilization\nManage transactions",
    "Doanh thu: ": "Revenue: ",
    "hoa hồng 5% / 4% / 3%": "5% / 4% / 3% commission",
    " từ chủ xe sau khi chuyến hoàn tất.": " paid by owners after trip completion.",
    "Kết quả xử lý feedback lớn nhất: chuyển từ vai trò mơ hồ sang mô hình marketplace kết nối có quy trình bảo vệ.": "The most important feedback outcome: moving from an unclear role to a connection marketplace with a protected process.",
    # Slide 5
    "MVP ban đầu: đã chạy trọn vòng": "Initial MVP: a complete working flow",
    "Commit đầu tiên • 23/09/2026 • 30 tệp • khoảng 15.000 dòng mã": "First commit • 23 Sep 2026 • 30 files • approximately 15,000 lines of code",
    "PHẠM VI MVP": "MVP SCOPE",
    "●  Tìm / lọc / xem chi tiết xe": "●  Search / filter / view vehicle details",
    "●  Báo giá và đặt xe": "●  Quotes and booking",
    "●  3 vai trò với dashboard riêng": "●  Three roles with dedicated dashboards",
    "●  Hợp đồng điện tử + giao nhận": "●  Digital contract + vehicle handover",
    "●  Đánh giá + tranh chấp + Trust Score": "●  Reviews + disputes + Trust Score",
    "GIỚI HẠN BAN ĐẦU": "INITIAL LIMITATIONS",
    "Chưa thanh toán thật • chỉ có ngày, chưa có giờ • dữ liệu lưu trong 1 tệp • phí 10% đặt lên người thuê.": "No real payment • dates without times • data stored in one file • 10% fee charged to renters.",
    "Nguồn hình: giao diện MVP được chạy lại từ commit đầu tiên và chụp ngày 04/11/2026.": "Image source: the MVP was rerun from the first commit and captured on 04 Nov 2026.",
    # Slide 6
    "04 • KHẢO SÁT & BẰNG CHỨNG": "04 • VALIDATION & EVIDENCE",
    "Validation: nghe — đo — thử trọn hành trình": "Validation: listen — measure — test end to end",
    "Không suy diễn “khảo sát khách hàng” khi tài liệu chưa có bộ dữ liệu định lượng riêng.": "No customer-survey claims are inferred because no separate quantitative survey dataset was provided.",
    "3 lớp bằng chứng đã có": "Three available evidence layers",
    "nhóm vấn đề mentor": "mentor issue groups",
    "Business model → vận hành thực tế": "Business model → real operations",
    "tổ hợp QA giao diện": "UI QA combinations",
    "5 độ rộng màn hình": "5 viewport widths",
    "kịch bản end-to-end": "end-to-end scenario",
    "Hà Nội → Hải Phòng • 06:00–22:00": "Hanoi → Hai Phong • 06:00–22:00",
    "DỮ LIỆU HÀNH VI • 03–04/11": "BEHAVIOR DATA • 03–04 NOV",
    "lượt xem trang": "page views",
    "đăng ký mới": "new registrations",
    "đơn trong hệ thống": "bookings in system",
    "đơn hoàn tất": "completed bookings",
    "người active / 5 phút": "active users / 5 min",
    "xe công khai": "public vehicles",
    "Lưu ý: số đơn gồm dữ liệu mẫu và đơn thử; lượt xem chưa tách người dùng duy nhất. Đây là tín hiệu sớm, chưa phải conversion chính thức.": "Note: bookings include sample and test data; page views do not identify unique users. These are early signals, not an official conversion rate.",
    "Khoảng trống cần bổ sung: khảo sát nhu cầu có mẫu, phỏng vấn chủ xe thực tế, dữ liệu khách thật tách khỏi traffic nội bộ.": "Evidence gaps: structured demand survey, interviews with real rental operators, and real-user data separated from internal traffic.",
    # Slide 7
    "Quy trình phát triển sản phẩm trong 6 bước": "The six-step product development process",
    "Mỗi vòng feedback được biến thành quyết định sản phẩm, mã nguồn, kiểm thử và bản deploy tiếp theo.": "Every feedback cycle becomes a product decision, code change, test, and subsequent deployment.",
    "24 nhóm vấn đề\nmentor + QA": "24 issue groups\nmentor + QA",
    "Chốt mô hình\nkết nối": "Define the connection\nmarketplace model",
    "MVP trọn vòng\n23/09": "End-to-end MVP\n23 Sep",
    "Figma + chính sách\ngiá / giờ / cọc": "Figma + policies\nprice / time / deposit",
    "QA 90 tổ hợp\nE2E + Lighthouse": "90 QA combinations\nE2E + Lighthouse",
    "Deploy Render\nhoa hồng 3–5%": "Render deployment\n3–5% commission",
    "KẾT QUẢ": "OUTCOMES",
    "Mô hình kinh doanh rõ": "Clear business model",
    "UX tìm xe rõ hơn": "Clearer search UX",
    "Pricing minh bạch": "Transparent pricing",
    "Vận hành có bằng chứng": "Evidence-based operations",
    "Demo được deploy": "Deployed demo",
    "Màu vàng = giai đoạn đang chuyển từ demo sang kiểm chứng thương mại thực tế.": "Yellow = the transition from demo to real commercial validation.",
    # Slide 8
    "Feedback mentor → backlog → cải tiến": "Mentor feedback → backlog → improvements",
    "13 nhóm feedback rút gọn trong báo cáo kỹ thuật": "13 condensed feedback groups in the technical report",
    "đã xử lý": "resolved",
    "9 • Đã xử lý": "9 • Resolved",
    "1 • Một phần": "1 • Partially resolved",
    "3 • Chưa xử lý": "3 • Not resolved",
    "MASTER LIST 6 NHÓM": "SIX-GROUP MASTER LIST",
    "Chốt mô hình + hoa hồng": "Model + commission defined",
    "Hợp đồng số; hủy xe còn thiếu": "Digital contract; owner cancellation still missing",
    "Giờ, địa điểm, availability": "Time, location, availability",
    "Báo giá tách khoản, đầy–đầy": "Itemized quote, full-to-full fuel",
    "Giao nhận + tranh chấp; ảnh còn lỗi": "Handover + disputes; image issue remains",
    "Chưa làm với đơn vị thuê xe thật": "Not yet validated with a real rental operator",
    "Phân loại trạng thái được tổng hợp trực tiếp từ Bảng 2.1 của báo cáo kỹ thuật.": "Status classification is summarized directly from Table 2.1 of the technical report.",
    # Slide 9
    "Trước & sau: không chỉ đổi giao diện": "Before & after: more than a visual redesign",
    "Từ demo nhiều giả định → sản phẩm có chính sách, bằng chứng và vận hành rõ hơn.": "From an assumption-heavy demo → a product with clearer policies, evidence, and operations.",
    "TRƯỚC • MVP": "BEFORE • MVP",
    "SAU • 04/11": "AFTER • 04 NOV",
    "Ngày": "Dates",
    "Ngày + giờ": "Dates + times",
    "10 xe mẫu": "10 demo vehicles",
    "20 xe mẫu": "20 demo vehicles",
    "Phí 10% từ khách": "10% renter fee",
    "Hoa hồng 3–5% từ chủ xe": "3–5% owner commission",
    "Tệp máy chủ": "Server file",
    "Các thay đổi chính: search rõ nghĩa, giờ nhận/trả, pricing, QR, hợp đồng, giao nhận, tranh chấp, admin analytics.": "Key changes: clearer search, pickup/return times, pricing, QR payments, contracts, handover, disputes, and admin analytics.",
    # Slide 10
    "Customer Journey sau cải tiến": "Improved customer journey",
    "Một luồng thống nhất từ ý định thuê xe đến hoàn tất và đánh giá.": "One connected flow from rental intent to completion and review.",
    "TÌM": "SEARCH",
    "Khu vực • ngày giờ": "Area • date & time",
    "LỌC": "FILTER",
    "Xe còn trống": "Available vehicles",
    "BÁO GIÁ": "QUOTE",
    "Tách từng khoản": "Itemized costs",
    "YÊU CẦU": "REQUEST",
    "2 xác nhận": "2 confirmations",
    "CỌC": "DEPOSIT",
    "QR → chủ xe": "QR → owner",
    "KÝ": "SIGN",
    "Hợp đồng số": "Digital contract",
    "GIAO/TRẢ": "PICKUP/RETURN",
    "Ảnh • xăng • km": "Photos • fuel • mileage",
    "KẾT THÚC": "COMPLETE",
    "Đánh giá / tranh chấp": "Review / dispute",
    "Điểm khác biệt: dữ liệu giao dịch và bằng chứng luôn ở lại nền tảng — đây là lý do hai bên tiếp tục dùng PaceCar.": "Key differentiator: transaction data and evidence remain on the platform—giving both parties a reason to keep using PaceCar.",
    "Quy trình thực tế gồm 8 bước; các trạng thái được lưu vào dashboard của người thuê, chủ xe và quản trị viên.": "The operating flow has eight steps; statuses are recorded in renter, owner, and administrator dashboards.",
    # Slide 11
    "Sản phẩm hoàn thiện theo 3 cấp độ": "The completed product at three levels",
    "Không chỉ là website: sản phẩm gồm nhu cầu cốt lõi, trải nghiệm thực tế và lớp giá trị gia tăng.": "More than a website: the product combines a core need, the actual experience, and added value.",
    "Kết nối thuê xe minh bạch": "Transparent car rental connection",
    "Xe đúng lịch • tổng chi phí rõ": "Right schedule • clear total cost",
    "Website dùng được đa thiết bị": "A multi-device website",
    "Tìm / lọc / đặt • QR • hợp đồng": "Search / filter / book • QR • contract",
    "Yên tâm hơn ngoài việc thuê xe": "Confidence beyond the rental itself",
    "Trust Score • bằng chứng • tranh chấp": "Trust Score • evidence • disputes",
    "CÀNG LÊN CAO → CÀNG KHÓ BỊ THAY THẾ BỞI GIAO DỊCH NGOÀI NỀN TẢNG": "HIGHER VALUE → HARDER TO REPLACE WITH OFF-PLATFORM TRANSACTIONS",
    "Phân loại theo Core / Actual / Augmented Product từ Mục 3.2 của báo cáo kỹ thuật.": "Classification based on Core / Actual / Augmented Product in Section 3.2 of the technical report.",
    # Slide 12
    "Sản phẩm hiện tại: 16 nhóm tính năng": "Current product: 16 feature groups",
    "Bốn cụm năng lực tạo thành một vòng vận hành khép kín.": "Four capability clusters create a closed operating loop.",
    "Tìm xe theo lịch": "Schedule-based search",
    "Lọc & sắp xếp": "Filter & sort",
    "Chi tiết + Trust Score": "Details + Trust Score",
    "3 tính năng": "3 features",
    "Báo giá 15 phút": "15-minute quote",
    "Yêu cầu thuê": "Rental request",
    "QR cọc & tiền thuê": "Deposit & rental QR",
    "Hợp đồng điện tử": "Digital contract",
    "4 tính năng": "4 features",
    "Giao nhận có ảnh": "Photo-based handover",
    "Hoàn cọc & đánh giá": "Deposit refund & review",
    "Tranh chấp & phản ánh": "Disputes & reports",
    "Thông báo / nhật ký": "Notifications / activity log",
    "Quản lý xe": "Vehicle management",
    "Hoa hồng 3–5%": "3–5% commission",
    "Yêu thích": "Favorites",
    "3 vai trò xuyên suốt: NGƯỜI THUÊ  •  CHỦ XE  •  QUẢN TRỊ VIÊN": "THREE ROLES THROUGHOUT: RENTER  •  VEHICLE OWNER  •  ADMINISTRATOR",
    "Nguồn: Bảng 3.1 — Tính năng đang hoạt động.": "Source: Table 3.1 — Active features.",
    # Slide 13
    "Nền tảng kỹ thuật & cách phát hành": "Technical platform & delivery",
    "Một stack đủ gọn cho MVP, nhưng đã có đường nâng cấp cho dữ liệu và tự động hóa.": "A lean stack for the MVP, with a clear path to scalable data and automation.",
    "PostgreSQL • ảnh trong DB": "PostgreSQL • images in DB",
    "56 commit": "56 commits",
    "Bản MVP lưu dữ liệu trong tệp; bản sau đã hỗ trợ PostgreSQL và lưu ảnh bền vững hơn.": "The MVP stored data in a file; the later version supports PostgreSQL and more durable image storage.",
    # Slide 14
    "QA: chức năng ổn, mobile còn điểm nghẽn": "QA: solid functionality, mobile remains the bottleneck",
    "hạng mục đạt": "checks passed",
    "5,9 giây": "5.9 seconds",
    "DUNG LƯỢNG": "PAGE SIZE",
    "8,5 MB": "8.5 MB",
    "Nguyên nhân chính": "Main causes",
    "●  4 ảnh PNG lớn": "●  Four large PNG images",
    "●  Ảnh bằng chứng chưa hiển thị": "●  Evidence images not displayed",
    "●  Ảnh BMW 330i lỗi 404": "●  BMW 330i images return 404",
    "ƯU TIÊN: NÉN ẢNH": "PRIORITY: COMPRESS IMAGES",
    "Đợt test 04/11/2026: website thật (read-only), bản chạy thử end-to-end và 2/2 bộ test tự động.": "Test run on 04 Nov 2026: live website (read-only), end-to-end test environment, and 2/2 automated test suites.",
    # Slide 15
    "Sản phẩm đã vượt khỏi một website tìm xe": "The product has moved beyond a vehicle search website",
    "Các module mới biến trải nghiệm thành một hệ thống vận hành có kiểm soát.": "New modules turn the experience into a controlled operating system.",
    "QR CỌC": "DEPOSIT QR",
    "TRANH CHẤP": "DISPUTES",
    "QUẢN LÝ XE": "VEHICLE MANAGEMENT",
    "Báo giá minh bạch  •  QR trực tiếp  •  Hợp đồng số  •  Giao nhận  •  Tranh chấp  •  Analytics": "Transparent quotes  •  Direct QR  •  Digital contracts  •  Handover  •  Disputes  •  Analytics",
    "Ảnh chụp từ phiên bản hiện tại trong báo cáo kỹ thuật.": "Screenshots from the current version documented in the technical report.",
    # Slide 16
    "Hoàn thiện theo EXE201 — chưa phải production-ready": "Complete for EXE201—not yet production-ready",
    "Ưu tiên theo tác động đến niềm tin và khả năng vận hành với khách thật.": "Priorities ranked by impact on trust and real-customer operations.",
    "Bảo mật & dữ liệu": "Security & data",
    "Đổi tài khoản admin mẫu • sửa ảnh bằng chứng • backup DB": "Replace demo admin credentials • fix evidence images • back up DB",
    "Tốc độ & thanh toán": "Performance & payment",
    "Nén ảnh • webhook ngân hàng • bật xác minh email": "Compress images • bank webhook • enable email verification",
    "Vận hành thực tế": "Real-world operations",
    "Chủ xe hủy • xe thay thế • giao dịch ngoài nền tảng": "Owner cancellation • replacement vehicle • off-platform transactions",
    "Validation thị trường": "Market validation",
    "Phỏng vấn đơn vị thuê xe • pilot khách thật • đo conversion": "Interview rental operators • real-user pilot • measure conversion",
    "MỤC TIÊU VÒNG TIẾP THEO": "NEXT ITERATION GOAL",
    "Từ “demo chạy được”\nđến “dịch vụ đáng tin”": "From a “working demo”\nto a “trusted service”",
    "●  Có người dùng thật": "●  Real users",
    "●  Có đối tác chủ xe thật": "●  Real vehicle-owner partners",
    "●  Có dữ liệu conversion sạch": "●  Clean conversion data",
    "Kết luận có chủ đích: sản phẩm đã hoàn thiện theo scope học phần, nhưng còn 4 lớp việc trước khi mở rộng thương mại.": "Deliberate conclusion: the product is complete for the course scope, with four workstreams remaining before commercial expansion.",
    # Slide 17
    "Ví dụ trực quan cho 3 cấp độ sản phẩm": "Visual examples of the three product levels",
    "Mỗi cấp độ được minh họa bằng một màn hình đang có trong phiên bản hiện tại.": "Each level is illustrated with a screen from the current version.",
    "Báo giá minh bạch": "Transparent quote",
    "Khách biết giá thuê, phụ phí, giảm giá và tiền cọc trước khi gửi yêu cầu.": "Renters see the rental price, surcharges, discounts, and deposit before submitting a request.",
    "Trải nghiệm đa thiết bị": "Multi-device experience",
    "Tìm xe, lọc và đặt xe hoạt động trên cả màn hình máy tính và điện thoại.": "Search, filtering, and booking work on both desktop and mobile screens.",
    "Hỗ trợ tranh chấp": "Dispute support",
    "Quy trình tiếp nhận, đối chiếu bằng chứng và cập nhật quyết định ngay trong tài khoản.": "The process receives cases, reviews evidence, and updates decisions directly in the account.",
    "Nguồn ảnh: các ảnh chụp màn hình đã nhúng trong BAO_CAO_KY_THUAT_PACECAR.docx.": "Image source: screenshots embedded in BAO_CAO_KY_THUAT_PACECAR.docx.",
    # Slide 18
    "Feedback đã thay đổi sản phẩm như thế nào?": "How did feedback change the product?",
    "Ba ví dụ cùng màn hình, cùng ngữ cảnh — nhìn thấy rõ thay đổi thay vì chỉ đọc mô tả.": "Three like-for-like examples make the changes visible instead of merely describing them.",
    "TÌM XE": "SEARCH",
    "TRƯỚC": "BEFORE",
    "SAU": "AFTER",
    "Thêm điểm đến, ngày + giờ và thông báo lỗi rõ.": "Added destination, date + time, and clearer error feedback.",
    "Tách khoản phí, cọc và điều kiện thuê.": "Itemized fees, deposit, and rental conditions.",
    "GỬI YÊU CẦU": "SUBMIT REQUEST",
    "Hai xác nhận chủ động trước khi kết nối.": "Two explicit confirmations before connecting.",
    "Minh chứng trước–sau lấy từ các cặp ảnh ở Mục 2.4 của báo cáo kỹ thuật.": "Before-and-after evidence comes from the image pairs in Section 2.4 of the technical report.",
    # Slide 19
    "Một hành trình thuê xe qua 4 màn hình": "A rental journey across four screens",
    "Ảnh giao diện cho thấy các bước chính đã được nối thành một quy trình sử dụng được.": "The interface screens show that the key steps form a usable connected flow.",
    "Chọn khu vực, điểm đến, ngày và giờ": "Choose area, destination, date, and time",
    "XEM BÁO GIÁ": "VIEW QUOTE",
    "Giá thuê, phụ phí và tiền cọc": "Rental price, surcharges, and deposit",
    "CHUYỂN CỌC": "PAY DEPOSIT",
    "QR đúng số tiền và nội dung": "QR with the correct amount and reference",
    "GIAO / TRẢ XE": "PICKUP / RETURN",
    "Ảnh, nhiên liệu và số km": "Photos, fuel level, and mileage",
    "Luồng đầy đủ tiếp tục với ký hợp đồng, thanh toán tiền thuê, hoàn tất chuyến, hoa hồng và tranh chấp.": "The full flow continues with contract signing, rental payment, trip completion, commission, and dispute support.",
    # Slide 20
    "KẾT LUẬN": "CONCLUSION",
    "PACE CAR ĐÃ HOÀN THIỆN\nMỘT VÒNG GIÁ TRỊ": "PACE CAR COMPLETES\nA FULL VALUE CYCLE",
    "Từ tìm xe đến hợp đồng, thanh toán, giao nhận và xử lý tranh chấp — có bằng chứng, có vai trò và có business model rõ ràng.": "From search to contract, payment, handover, and dispute support—with evidence, clear roles, and a defined business model.",
    "Bước tiếp theo: ": "Next step: ",
    "pilot với khách & chủ xe thật": "pilot with real renters and owners",
    " để kiểm chứng khả năng thương mại.": " to validate commercial viability.",
    "CẢM ƠN": "THANK YOU",
    # Chart labels
    "Đã xử lý": "Resolved",
    "Một phần": "Partially resolved",
    "Chưa xử lý": "Not resolved",
    "Đạt": "Passed",
    "Không đạt": "Failed",
    "Hiệu suất": "Performance",
    "Tiếp cận": "Accessibility",
    "Best practice": "Best Practices",
}


def translate_xml(blob: bytes) -> bytes:
    root = etree.fromstring(blob)
    changed = False
    for node in root.iter():
        if node.text in T:
            node.text = T[node.text]
            changed = True
    if not changed:
        return blob
    return etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)


def translate_workbook(blob: bytes) -> bytes:
    source = io.BytesIO(blob)
    workbook = load_workbook(source)
    changed = False
    for sheet in workbook.worksheets:
        for row in sheet.iter_rows():
            for cell in row:
                if isinstance(cell.value, str) and cell.value in T:
                    cell.value = T[cell.value]
                    changed = True
    if not changed:
        return blob
    target = io.BytesIO()
    workbook.save(target)
    return target.getvalue()


def contains_vietnamese(text: str) -> bool:
    for char in text:
        if ord(char) <= 127:
            continue
        if "LATIN" in unicodedata.name(char, ""):
            return True
    return False


def adjust_layout(path: Path) -> None:
    presentation = Presentation(path)

    def named(slide, name: str):
        return next(shape for shape in slide.shapes if shape.name == name)

    # English labels are longer than their Vietnamese equivalents. These
    # targeted adjustments preserve the original visual hierarchy.
    slide3 = presentation.slides[2]
    named(slide3, "TextBox 87").height = Inches(0.36)

    slide4 = presentation.slides[3]
    for paragraph in named(slide4, "TextBox 10").text_frame.paragraphs:
        for run in paragraph.runs:
            run.font.size = Pt(18)

    slide6 = presentation.slides[5]
    named(slide6, "TextBox 10").width = Inches(4.25)

    slide16 = presentation.slides[15]
    named(slide16, "TextBox 31").height = Inches(1.17)

    presentation.save(path)


def main() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)
    untranslated: set[str] = set()
    with ZipFile(SOURCE, "r") as src, ZipFile(OUTPUT, "w", ZIP_DEFLATED) as dst:
        for item in src.infolist():
            blob = src.read(item.filename)
            if item.filename.startswith("ppt/slides/slide") and item.filename.endswith(".xml"):
                blob = translate_xml(blob)
                root = etree.fromstring(blob)
                for node in root.iter():
                    if node.text and contains_vietnamese(node.text):
                        untranslated.add(node.text)
            elif item.filename.startswith("ppt/charts/chart") and item.filename.endswith(".xml"):
                blob = translate_xml(blob)
            elif item.filename.startswith("ppt/embeddings/") and item.filename.endswith(".xlsx"):
                blob = translate_workbook(blob)
            dst.writestr(item, blob)
    if untranslated:
        print("Untranslated Vietnamese text nodes:")
        for text in sorted(untranslated):
            print(repr(text))
        raise SystemExit(2)
    adjust_layout(OUTPUT)
    print(f"Saved {OUTPUT}")


if __name__ == "__main__":
    main()
