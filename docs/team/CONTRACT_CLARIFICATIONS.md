# Khác biệt cần xử lý khi tích hợp

Các điểm dưới đây đọc từ DTO, Zod, mock và SQL; Phase 4 chỉ ghi nhận/quyết định thiết kế, không sửa feature runtime.

| Mã | Hiện trạng / rủi ro | Quyết định và người thực hiện |
|---|---|---|
| C01 | Mock dùng `mock:*`, API SQL dùng JWT HS256. Firebase chưa cài; 401 hiện sign-out, không refresh | Backend chuyển Firebase ID verification; Frontend làm SDK Auth provider/refresh; không chấp nhận mock/legacy token ở production sau cutover |
| C02 | `AuthResult` chỉ `{token,user}`, không có `refreshToken` | Giữ DTO. SDK client sở hữu refresh; compatibility REST dùng lại login khi hết hạn. Không phát custom token như ID token |
| C03 | `/auth/forgot-password`, `/auth/change-password` chỉ có mock; server không đăng ký handler. JWT middleware hiện có thể trả 401 trước khi unknown path tới 404 | Giữ tên/payload; Backend thêm forgot trước protected middleware, change sau middleware; DB cấu hình Auth/email, Frontend không tự gửi email. Không gọi đây là API đã chạy |
| C04 | `DiscoveryInput.categories` là `string[]` ở frontend nhưng Zod chỉ nhận NATURE/CULTURE/ENTERTAINMENT/FOOD_CAFES; preferences dùng tên category tiếng Việt | Contract chuẩn giữ enum Discovery và tên category preferences. Dùng `activityOptions`/`CATEGORY_CODES`; không gửi hai loại nhầm nhau |
| C05 | Mock recommendation chấp nhận limit tới 20, server tối đa 12; server kiểm half-hour/time/date/constraint và ID chặt hơn mock | Backend/Zod là chuẩn API; UI đang gửi 6 nên hợp lệ. Thêm parity test trước khi mở tùy chỉnh limit, không nới server theo mock |
| C06 | Mẫu Phase 3 `/places?...&environment=&category=` dễ bị dùng nguyên; server từ chối `environment=""` | Bỏ query enum khi không chọn. Generator Phase 4 dùng ví dụ hợp lệ, không đổi endpoint. Frontend hiện đã bỏ enum rỗng trong request thực tế |
| C07 | Mock/map search bỏ dấu; SQL Discover dùng `ILIKE`, không bảo đảm bỏ dấu | Đích chọn search bỏ dấu trên cache catalogue nhỏ để đồng nhất UI; ghi nhận thay đổi hành vi, thêm case `ho xuan huong`. Không giả định Firestore Standard hỗ trợ SQL ILIKE/full-text |
| C08 | GET `/places` trả `Place[]` toàn bộ, client không đọc cursor/header | Repo Firestore phân trang nội bộ và ghép đủ kết quả trước khi trả mảng; không âm thầm chỉ trả trang đầu. Catalogue lớn cần PR contract/adapter riêng, không đổi sang `{items,nextCursor}` ngay |
| C09 | API group detail chứa members/wishlist/plans/currentPlan; weather chứa slots/providers | Không thêm `/members`, `/approved`, `/hourly` hay `/sources` trùng lặp chỉ vì route UI riêng |
| C10 | SQL proposal deadline 30 phút; mock là 24 giờ; SQL PlanItem.position bắt đầu 0, mock bắt đầu 1 | Giữ SQL semantics cho production; FE đang hiển thị theo thứ tự array/index+1. Không lấy thời hạn/index mock làm tiêu chuẩn migration |
| C11 | SQL user password là `salt:hex` từ Node scrypt, không phải cấu hình Firebase SCRYPT | Không copy/import hash theo phỏng đoán. Provision UID và reset/claim tài khoản có xác minh; xem migration plan |
| C12 | Có record Đà Lạt cũ bị ẩn khỏi listing nhưng vẫn tồn tại/được plan tham chiếu | Giữ ID/quan hệ, thêm `catalogVisible` nội bộ ở đích; GET detail vẫn đọc record lịch sử. Không xóa để ép raw table có đúng 80 row |
| C13 | Mock chỉ 80 Đà Lạt, Vũng Tàu rỗng; API có 40 Vũng Tàu và 80 Đà Lạt hiển thị, tọa độ Vũng Tàu chưa xác minh | Seed chính thức từ dữ liệu có nguồn/SQL đã audit, không import state mock thành production. Giữ `geographyVerified=false` cho điểm chưa xác minh |
| C14 | Group.role/myVote phụ thuộc caller; catalogue Place view cũng enrich bằng source map | Serialize đúng DTO; không copy view của leader làm group document dùng chung; source/provenance phải được bảo toàn khi bỏ SQL |
| C15 | TypeScript không biểu diễn hết constraint Zod/SQL; code lỗi có thể vắng | Error `{error,code?,details?}`, không thêm envelope thành công. Preserve HTTP và các code thực tế (UNAUTHORIZED, LEADER_REQUIRED, STALE_BASE, NOT_ELIGIBLE...) |
| C16 | Comment target phải thuộc wishlist/lịch cùng nhóm, không chỉ cùng city; đúng một placeId/planId | Giữ `validateCommentTarget` khi port, owner kiểm author và active membership; mock dễ dãi hơn không phải chuẩn quyền |
| C17 | Mock PATCH từ chối stale expectedRevision, nhưng SQL **vẫn nhận edit đến sau, 200 và log overwrite**. Đổi tên tăng revision nhưng không stale plan | Đích giữ SQL last-write-wins có audit; expectedRevision là advisory, không tự thêm 409/CAS. Muốn strict CAS phải có PR contract/test và Frontend đồng ý. Vote vẫn kiểm basePlanId + constraints snapshot |
| C18 | Emulator UI mặc định 4000 trùng Express 4000 | Chọn Emulator UI 4401, Auth 9099, Firestore 8080; demo project thống nhất. Root mock không cần emulator |
| C19 | Worker `busy`/LLM active/cache và Socket rooms hiện cục bộ process | MVP một process; trước multi-instance cần lease/outbox/shared Socket transport. Không coi mutex RAM là khóa Firestore |
| C20 | `SEED_DEMO=false` chỉ ngăn phần demo; `seed()` hiện vẫn xử lý catalogue khi start | Target tách explicit seed command, không suy luận flag này dừng mọi ghi DB; không chạy startup SQL vào Firestore |
| C21 | SQL PATCH đổi mode còn đặt currentPlanId=null; mock không tái hiện đầy đủ | Giữ exception này khi port: mode change làm stale pending + clear official pointer để không lấy plan DEMO làm base LIVE. Không xóa lịch sử. Budget/date/hour change giữ pointer theo SQL hiện tại |
| C22 | Một số event trong manifest Phase 3 là mock/đích, không phải event SQL thực phát: create group không emit; wishlist không log activity; comment/rain report không phát activity | API Phase 4 tách producer event thực và event view cần subscribe. Nếu thêm activity/outbox là implementation đích, không báo chúng đã có trong SQL |
| C23 | Firebase account và Firestore profile không thể tạo trong cùng một transaction | Target ensureProfile idempotent, SDK registration PATCH name rồi GET profile. Không xóa Auth account có thể đã được dùng khi profile write retry lỗi |

Backend và Frontend cần ghi test parity cho C01–C10 trước mốc auth/catalogue. Database cần ký nhận C11–C14 trước migration. Chỗ nào làm khác quyết định trên phải sửa tài liệu + test trong cùng PR; không bắt từng người tự đoán từ màn hình.
