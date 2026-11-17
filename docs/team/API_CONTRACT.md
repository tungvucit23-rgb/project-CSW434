# Hợp đồng API và ma trận phụ thuộc frontend

Ngày audit 17/11/2026. Nguồn: [DataAdapter](../../apps/mobile/src/api/contracts/adapter.ts), [endpoint manifest](../../apps/mobile/src/api/contracts/endpoints.ts), [handler/Zod](../../apps/server/src/app.ts), [DTO](../../apps/mobile/src/types.ts), [API Phase 3](../../apps/mobile/API_CONTRACT_HANDOFF.md). Đọc [khác biệt contract](CONTRACT_CLARIFICATIONS.md) trước khi code.

## Quy ước chung

Base URL = EXPO_PUBLIC_API_URL; client thêm /api. Bảng path bên dưới tương đối với /api. Thành công trả JSON domain trực tiếp, **không thêm {data:...}**. GET không có JSON body. Bearer token hiện tại là JWT riêng; đích là Firebase ID token được Admin verify. Public chỉ GET /health và POST /auth/demo, /auth/login, /auth/register; password reset sẽ public khi được thêm.

Error hiện tại: {error:string,code?:string,details?:{path:string,message:string}[]}. Zod lỗi 400 VALIDATION_ERROR; không có route → 404; JWT lỗi 401 UNAUTHORIZED; leader-required 403 LEADER_REQUIRED; conflict unique SQL 409 có thể thiếu code; lỗi 500 INTERNAL_ERROR. Rate limit trả 429; invalid JSON 400. Missing membership có thể 404 thay vì 403. 422 được dùng cho preferred/planner ID sai và không có điểm để lập lịch. Code trong fixture mock như PLAN_CLOSED/SESSION_EXPIRED không thay tên code production. Error transport NETWORK/TIMEOUT/CANCELLED/INVALID_RESPONSE là client-local.

Ví dụ lỗi thật theo shape: {"error":"Dữ liệu chưa hợp lệ.","code":"VALIDATION_ERROR","details":[{"path":"environment","message":"Invalid option"}]}. Message có thể thay đổi; client phải dùng status/code khi có. Không trả lỗi thành công bằng data mock.

Status ở từng endpoint là bằng chứng **hiện tại**, cột target vẫn yêu cầu migration Firestore. “Existing and verified” chỉ dùng khi đường dẫn nằm trong smoke test thực đã chạy, không có nghĩa mọi nhánh/provider/Firebase được test. “Existing but requires migration” có source handler nhưng chưa có bằng chứng HTTP riêng trong lần audit này. Hai password là “Mock-only / Missing backend”. Các mẫu JSON dưới đây lấy từ fixture/shape đã có, **không phải phản hồi API production vừa gọi**; arrays có thể rút gọn.

## Ràng buộc phải giữ

- Group detail trả members/wishlist/plans/currentPlan; WeatherSummary trả slots/providers. Không tạo endpoint trùng cho route members/hourly/source/approved.
- Date ngày đi là YYYY-MM-DD VN, response thời điểm là ISO; DB Timestamp serialize riêng.
- Discovery categories = NATURE/CULTURE/ENTERTAINMENT/FOOD_CAFES; travelStyles theo TRAVEL_STYLES; limit 1..12; giờ/thời lượng bước 0.5, duration 0.5..16 và không vượt ngày. Preferences categories dùng tên catalogue, không enum Discovery.
- POST generate placeIds tùy chọn 1..20, unique, cùng city và có source; không gửi thì dùng wishlist. Output PlanItem.position của API SQL là 0-based, UI hiển thị theo array order.
- Comment GET dùng đúng một placeId hoặc planId; POST đúng một target; target place thuộc wishlist/lịch cùng group.
- PATCH preferences luôn có categories; env/style optional, merge để không xóa giá trị client cũ. PATCH profile luôn có name.
- GET places không gửi environment rỗng. Không tự đổi mảng thành paged envelope: repository phân trang nội bộ rồi ghép đủ; search bỏ dấu đích cần parity tests.
- engine=LLM hoặc RULE_BASED; demo độc lập; null/missing weather không phải không mưa. Proposal chỉ áp dụng sau majority; deadline SQL 30 phút.

## Ma trận 40 route → adapter → API → backend → Firestore

Mọi method adapter thực tế là request<T>(path,token,method,body), không có getGroups/getWeather được bịa ra. subscribe là lifecycle riêng.

| Route / mục đích | Data adapter method hiện tại | API cần dùng | Module đích | Collection đích |
|---|---|---|---|---|
| login — Chào bạn, người đồng hành! | request<T>; subscribeData khi có group event | POST /auth/login; POST /auth/demo | auth + users | Firebase Authentication; users/{uid} |
| register — Bắt đầu hành trình | request<T>; subscribeData khi có group event | POST /auth/register | auth + users | Firebase Authentication; users/{uid} |
| forgotPassword — Tìm lại tài khoản của bạn | request<T>; subscribeData khi có group event | POST /auth/forgot-password | auth + users | Firebase Authentication; users/{uid} |
| changePassword — Đổi mật khẩu | request<T>; subscribeData khi có group event | POST /auth/change-password | auth + users | Firebase Authentication; users/{uid} |
| groupPreferences — Sở thích của nhóm | request<T>; subscribeData khi có group event | GET /groups/:id/preferences; PATCH /groups/:id/preferences | groups/preferences | groups/{gid}/preferences/{uid}; groups/members |
| alerts — Cảnh báo thời tiết | request<T>; subscribeData khi có group event | GET /groups/:id/alerts | weather/alerts | groups/{gid}/alerts/{aid}; uniqueKeys |
| notificationDetail — Chi tiết thông báo | request<T>; subscribeData khi có group event | GET /notifications; PATCH /notifications/:id/read | collaboration/notifications | users/{uid}/notifications/{nid} |
| home — Một chuyến đi, nhiều niềm vui. | request<T>; subscribeData khi có group event | GET /auth/me; GET /cities; GET /groups; GET /groups/:id/weather; GET /notifications | auth + users; catalogue/cities; groups/membership; weather/checks + workers; collaboration/notifications | Firebase Authentication; users/{uid}; cities/{cityId}; groups/{gid}; groups/{gid}/members/{uid}; preferences; uniqueKeys; weatherSnapshots; weatherChecks; groups/alerts; plans; outbox; users/{uid}/notifications/{nid} |
| groups — Những chuyến đi của bạn | request<T>; subscribeData khi có group event | GET /groups | groups/membership | groups/{gid}; groups/{gid}/members/{uid}; preferences; uniqueKeys |
| createGroup — Tạo chuyến đi mới | request<T>; subscribeData khi có group event | GET /cities; POST /groups | catalogue/cities; groups/membership | cities/{cityId}; groups/{gid}; groups/{gid}/members/{uid}; preferences; uniqueKeys |
| joinGroup — Tham gia chuyến đi | request<T>; subscribeData khi có group event | POST /groups/join | groups/membership | groups/{gid}; groups/{gid}/members/{uid}; preferences; uniqueKeys |
| dashboard — Chuyến đi của chúng mình | request<T>; subscribeData khi có group event | GET /groups/:id; POST /groups/:id/demo/rain | groups/membership; weather/checks + workers | groups/{gid}; groups/{gid}/members/{uid}; preferences; uniqueKeys; weatherSnapshots; weatherChecks; groups/alerts; plans; outbox |
| members — Những người đồng hành | request<T>; subscribeData khi có group event | GET /groups/:id | groups/membership | groups/{gid}; groups/{gid}/members/{uid}; preferences; uniqueKeys |
| invite — Rủ nhau đi thôi | request<T>; subscribeData khi có group event | GET /groups/:id | groups/membership | groups/{gid}; groups/{gid}/members/{uid}; preferences; uniqueKeys |
| discover — Đi đâu cũng có điều hay | request<T>; subscribeData khi có group event | GET /cities; GET /places; POST /groups/:id/wishlist | catalogue/cities; catalogue/places; collaboration/wishlist | cities/{cityId}; places/{placeId}; groups/{gid}/wishlist/{placeId}; places |
| map — Khám phá trên bản đồ | request<T>; subscribeData khi có group event | GET /cities; GET /places; GET /places/:id; GET /groups/:id/wishlist; POST /groups/:id/wishlist; POST /ai/recommendations; GET /groups/:id/weather; GET /radar | catalogue/cities; catalogue/places; collaboration/wishlist; ai/discovery + facts; weather/checks + workers; weather/radar | cities/{cityId}; places/{placeId}; groups/{gid}/wishlist/{placeId}; places; places; groups/preferences; weatherSnapshots; aiExecutions; weatherSnapshots; weatherChecks; groups/alerts; plans; outbox; Provider metadata/cache; không có fake radar collection |
| recommendations — Gợi ý chuyến đi phù hợp | request<T>; subscribeData khi có group event | GET /cities; GET /places; POST /groups/:id/wishlist; POST /ai/recommendations | catalogue/cities; catalogue/places; collaboration/wishlist; ai/discovery + facts | cities/{cityId}; places/{placeId}; groups/{gid}/wishlist/{placeId}; places; places; groups/preferences; weatherSnapshots; aiExecutions |
| itineraryMap — Lịch trình trên bản đồ | request<T>; subscribeData khi có group event | POST /groups/:id/plans/generate; GET /plans/:id; GET /groups/:id/weather | ai/planner + plans; plans/read; weather/checks + workers | plans; votes; aiExecutions; groups; weatherSnapshots; plans/{pid}; votes; places; weatherSnapshots; weatherChecks; groups/alerts; plans; outbox |
| filters — Tìm điểm đến phù hợp | request<T>; subscribeData khi có group event | GET /places | catalogue/places | places/{placeId} |
| placeDetail — Một điểm dừng đáng nhớ | request<T>; subscribeData khi có group event | GET /places/:id; POST /groups/:id/wishlist; GET /groups/:id/comments; POST /groups/:id/comments; PATCH /comments/:id; DELETE /comments/:id | catalogue/places; collaboration/wishlist; collaboration/comments | places/{placeId}; groups/{gid}/wishlist/{placeId}; places; comments; groups/members; wishlist/plans; comments/{cid}; groups/members |
| wishlist — Danh sách muốn đi | request<T>; subscribeData khi có group event | GET /groups/:id; GET /groups/:id/wishlist; DELETE /groups/:id/wishlist/:placeId | groups/membership; collaboration/wishlist | groups/{gid}; groups/{gid}/members/{uid}; preferences; uniqueKeys; groups/{gid}/wishlist/{placeId}; places |
| timeline — Lịch trình chung | request<T>; subscribeData khi có group event | GET /groups/:id | groups/membership | groups/{gid}; groups/{gid}/members/{uid}; preferences; uniqueKeys |
| planItem — Chi tiết điểm dừng | request<T>; subscribeData khi có group event | GET /groups/:id | groups/membership | groups/{gid}; groups/{gid}/members/{uid}; preferences; uniqueKeys |
| proposal — Phương án cho cả nhóm | request<T>; subscribeData khi có group event | GET /groups/:id/plans; GET /plans/:id; GET /groups/:id/comments; POST /groups/:id/comments; PATCH /comments/:id; DELETE /comments/:id | plans/history; plans/read; collaboration/comments | plans where groupId; places; votes; plans/{pid}; votes; places; comments; groups/members; wishlist/plans; comments/{cid}; groups/members |
| vote — Cùng nhau quyết định | request<T>; subscribeData khi có group event | GET /plans/:id; POST /plans/:id/votes; GET /groups/:id/comments; POST /groups/:id/comments; PATCH /comments/:id; DELETE /comments/:id | plans/read; plans/voting; collaboration/comments | plans/{pid}; votes; places; plans/{pid}; plans/{pid}/votes/{uid}; groups; outbox; comments; groups/members; wishlist/plans; comments/{cid}; groups/members |
| history — Các phiên bản lịch trình | request<T>; subscribeData khi có group event | GET /groups/:id; GET /groups/:id/plans | groups/membership; plans/history | groups/{gid}; groups/{gid}/members/{uid}; preferences; uniqueKeys; plans where groupId; places; votes |
| weather — Đi theo nhịp thời tiết | request<T>; subscribeData khi có group event | GET /groups/:id/weather; POST /groups/:id/weather/check; POST /groups/:id/demo/rain; GET /groups/:id/alerts | weather/checks + workers; weather/alerts | weatherSnapshots; weatherChecks; groups/alerts; plans; outbox; groups/{gid}/alerts/{aid}; uniqueKeys |
| hourly — Thời tiết từng giờ | request<T>; subscribeData khi có group event | GET /groups/:id/weather | weather/checks + workers | weatherSnapshots; weatherChecks; groups/alerts; plans; outbox |
| providers — Dữ liệu đến từ đâu? | request<T>; subscribeData khi có group event | GET /groups/:id/weather | weather/checks + workers | weatherSnapshots; weatherChecks; groups/alerts; plans; outbox |
| radar — Theo dõi những cơn mưa | request<T>; subscribeData khi có group event | GET /radar | weather/radar | Provider metadata/cache; không có fake radar collection |
| rainReport — Thời tiết ở chỗ bạn | request<T>; subscribeData khi có group event | POST /groups/:id/rain-reports | weather/reports | rainReports; weatherChecks |
| verification — Kiểm chứng dự báo | request<T>; subscribeData khi có group event | GET /groups/:id/verification | weather/verification | forecastVerifications; rainReports; weatherChecks |
| notifications — Có tin mới cho bạn | request<T>; subscribeData khi có group event | GET /notifications; PATCH /notifications/:id/read | collaboration/notifications | users/{uid}/notifications/{nid} |
| budget — Ngân sách chuyến đi | request<T>; subscribeData khi có group event | GET /groups/:id; PATCH /groups/:id | groups/membership | groups/{gid}; groups/{gid}/members/{uid}; preferences; uniqueKeys |
| activity — Nhật ký nhóm | request<T>; subscribeData khi có group event | GET /groups/:id/activity | collaboration/activity | groups/{gid}/activity/{aid} |
| aiSetup — Trợ lý lập lịch | request<T>; subscribeData khi có group event | GET /places; GET /groups/:id; PATCH /groups/:id; GET /groups/:id/preferences; PATCH /groups/:id/preferences; GET /groups/:id/wishlist; POST /groups/:id/plans/generate | catalogue/places; groups/membership; groups/preferences; collaboration/wishlist; ai/planner + plans | places/{placeId}; groups/{gid}; groups/{gid}/members/{uid}; preferences; uniqueKeys; groups/{gid}/preferences/{uid}; groups/members; groups/{gid}/wishlist/{placeId}; places; plans; votes; aiExecutions; groups; weatherSnapshots |
| profile — Góc của bạn | request<T>; subscribeData khi có group event | GET /auth/me | auth + users | Firebase Authentication; users/{uid} |
| editProfile — Chỉnh sửa hồ sơ | request<T>; subscribeData khi có group event | PATCH /auth/me | auth + users | Firebase Authentication; users/{uid} |
| settings — Cài đặt ứng dụng | request<T>; subscribeData khi có group event | GET /health; POST /auth/demo | foundation/health; auth + users | Firestore readiness; Firebase Authentication; users/{uid} |
| help — Đi Chung cùng bạn | Không request; nội dung tĩnh | — | frontend | — |

Recommendation setup/results là hai state của recommendations/MapExplorer, không route thứ 41. Filters dùng Discover state; budget/profile/history reuse đúng DTO. Riêng realtime phụ thuộc các event ở từng endpoint và reconnect refetch.

Unknown protected paths có thể bị JWT middleware trả 401 trước khi tới 404; password recovery hiện không phải một public handler thật. Các HTTP error status dưới đây lấy theo handler/middleware hiện tại, không lấy từ danh sách lỗi mock.

## Chi tiết 40 operation

### GET /health

- **Mục đích / route:** settings.
- **Status hiện tại:** Existing and verified. Có handler [app.ts:86](../../apps/server/src/app.ts#L86); target cần port foundation/health.
- **Auth/authorization:** Không cần phiên; vẫn rate-limit/validate. 
- **Adapter:** request<{status:string;database:string;llmConfigured:boolean;demoEnabled:boolean}>(path,token,'GET',body).
- **Module → Firestore:** foundation/health → Firestore readiness.
- **Request params/query:** /health; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `none`.
- **Response:** `{status:string;database:string;llmConfigured:boolean;demoEnabled:boolean}` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. Các lỗi chung; không giả định luôn có code.
- **Event thực do mutation phát:** Không có (GET không emit; caller tự refresh nếu mutation không phát event).. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** Không có event bắt buộc; update/refetch theo response. 
- **Mock fixture:** MockDataAdapter /health.

**HTTP lỗi theo source operation này:** 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Kiểm tra khả năng phục vụ, DB và capability flags.

Request body: không có.

Response shape minh họa (fixture):

```json
{
  "status": "ok",
  "database": "pglite",
  "llmConfigured": false,
  "demoEnabled": true
}
```

### POST /auth/register

- **Mục đích / route:** register.
- **Status hiện tại:** Existing and verified. Có handler [app.ts:112](../../apps/server/src/app.ts#L112); target cần port auth + users.
- **Auth/authorization:** Không cần phiên; vẫn rate-limit/validate. 
- **Adapter:** request<AuthResult>(path,token,'POST',body).
- **Module → Firestore:** auth + users → Firebase Authentication; users/{uid}.
- **Request params/query:** /auth/register; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `AuthInput & {name:string}`.
- **Response:** `AuthResult` (interfaces bên dưới); HTTP 201 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. UNAUTHORIZED (401); handler có thể không có code với bad credential; hai password code chưa có.
- **Event thực do mutation phát:** Không có (GET không emit; caller tự refresh nếu mutation không phát event).. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** Không có event bắt buộc; update/refetch theo response. Danh sách từ frontend/mock có thể rộng hơn producer SQL; phần bổ sung là target cần implementation, xem C22.
- **Mock fixture:** state.users.

**HTTP lỗi theo source operation này:** 400, 409, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Tạo tài khoản và trả phiên cùng profile.

Request body minh họa:

```json
{
  "name": "Traveler",
  "email": "traveler@example.test",
  "password": "<password-at-least-8-characters>"
}
```

Response shape minh họa (fixture):

```json
{
  "token": "<session-token>",
  "user": {
    "id": "<uid>",
    "name": "Traveler",
    "email": "traveler@example.test",
    "avatarColor": "#437A68"
  }
}
```

### POST /auth/login

- **Mục đích / route:** login.
- **Status hiện tại:** Existing but requires migration. Có handler [app.ts:139](../../apps/server/src/app.ts#L139); target cần port auth + users.
- **Auth/authorization:** Không cần phiên; vẫn rate-limit/validate. 
- **Adapter:** request<AuthResult>(path,token,'POST',body).
- **Module → Firestore:** auth + users → Firebase Authentication; users/{uid}.
- **Request params/query:** /auth/login; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `AuthInput`.
- **Response:** `AuthResult` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. UNAUTHORIZED (401); handler có thể không có code với bad credential; hai password code chưa có.
- **Event thực do mutation phát:** Không có (GET không emit; caller tự refresh nếu mutation không phát event).. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** Không có event bắt buộc; update/refetch theo response. Danh sách từ frontend/mock có thể rộng hơn producer SQL; phần bổ sung là target cần implementation, xem C22.
- **Mock fixture:** demoUsers / state.passwords.

**HTTP lỗi theo source operation này:** 400, 401, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Đăng nhập tài khoản thường; API SQL không cho login account demo bằng password.

Request body minh họa:

```json
{
  "email": "traveler@example.test",
  "password": "<password-at-least-8-characters>"
}
```

Response shape minh họa (fixture):

```json
{
  "token": "<session-token>",
  "user": {
    "id": "<uid>",
    "name": "Traveler",
    "email": "traveler@example.test",
    "avatarColor": "#437A68"
  }
}
```

### POST /auth/demo

- **Mục đích / route:** login, settings.
- **Status hiện tại:** Existing and verified. Có handler [app.ts:98](../../apps/server/src/app.ts#L98); target cần port auth + users.
- **Auth/authorization:** Không cần phiên; vẫn rate-limit/validate. Chỉ ALLOW_DEMO + seeded account, production phải tắt.
- **Adapter:** request<AuthResult>(path,token,'POST',body).
- **Module → Firestore:** auth + users → Firebase Authentication; users/{uid}.
- **Request params/query:** /auth/demo; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `{persona?:'leader'|'member'|'third'}`.
- **Response:** `AuthResult` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. UNAUTHORIZED (401); handler có thể không có code với bad credential; hai password code chưa có.
- **Event thực do mutation phát:** Không có (GET không emit; caller tự refresh nếu mutation không phát event).. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** Không có event bắt buộc; update/refetch theo response. Danh sách từ frontend/mock có thể rộng hơn producer SQL; phần bổ sung là target cần implementation, xem C22.
- **Mock fixture:** demoUsers.

**HTTP lỗi theo source operation này:** 400, 403, 404, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Đăng nhập persona demo đã seed khi được phép.

Request body minh họa:

```json
{
  "persona": "leader"
}
```

Response shape minh họa (fixture):

```json
{
  "token": "<legacy-jwt>",
  "user": {
    "id": "demo-leader",
    "name": "Minh Anh",
    "email": "leader@dichung.demo",
    "avatarColor": "#397A68"
  }
}
```

### GET /auth/me

- **Mục đích / route:** profile, home.
- **Status hiện tại:** Existing but requires migration. Có handler [app.ts:158](../../apps/server/src/app.ts#L158); target cần port auth + users.
- **Auth/authorization:** Chính user đã xác thực; notifications chỉ owner. 
- **Adapter:** request<User>(path,token,'GET',body).
- **Module → Firestore:** auth + users → Firebase Authentication; users/{uid}.
- **Request params/query:** /auth/me; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `none`.
- **Response:** `User` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. UNAUTHORIZED (401); handler có thể không có code với bad credential; hai password code chưa có.
- **Event thực do mutation phát:** Không có (GET không emit; caller tự refresh nếu mutation không phát event).. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** Không có event bắt buộc; update/refetch theo response. 
- **Mock fixture:** state.users.

**HTTP lỗi theo source operation này:** 401, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Đọc profile chính caller.

Request body: không có.

Response shape minh họa (fixture):

```json
{
  "id": "mock-leader",
  "name": "Minh Anh",
  "email": "leader@dichung.demo",
  "avatarColor": "#18735C"
}
```

### PATCH /auth/me

- **Mục đích / route:** editProfile.
- **Status hiện tại:** Existing but requires migration. Có handler [app.ts:166](../../apps/server/src/app.ts#L166); target cần port auth + users.
- **Auth/authorization:** Chính user đã xác thực; notifications chỉ owner. 
- **Adapter:** request<User>(path,token,'PATCH',body).
- **Module → Firestore:** auth + users → Firebase Authentication; users/{uid}.
- **Request params/query:** /auth/me; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `{name:string;avatarColor?:string}`.
- **Response:** `User` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. UNAUTHORIZED (401); handler có thể không có code với bad credential; hai password code chưa có.
- **Event thực do mutation phát:** Không có (GET không emit; caller tự refresh nếu mutation không phát event).. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** Không có event bắt buộc; update/refetch theo response. Danh sách từ frontend/mock có thể rộng hơn producer SQL; phần bổ sung là target cần implementation, xem C22.
- **Mock fixture:** state.users.

**HTTP lỗi theo source operation này:** 400, 401, 404, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Sửa tên/màu profile của caller.

Request body minh họa:

```json
{
  "name": "Minh Anh",
  "avatarColor": "#18735C"
}
```

Response shape minh họa (fixture):

```json
{
  "id": "mock-leader",
  "name": "Minh Anh",
  "email": "leader@dichung.demo",
  "avatarColor": "#18735C"
}
```

### POST /auth/forgot-password

- **Mục đích / route:** forgotPassword.
- **Status hiện tại:** Mock-only / Missing backend. Không có handler server; chỉ MockDataAdapter và UI. Không gọi đây là API đã triển khai.
- **Auth/authorization:** Không cần phiên; vẫn rate-limit/validate. 
- **Adapter:** request<ActionResult>(path,token,'POST',body).
- **Module → Firestore:** auth + users → Firebase Authentication; users/{uid}.
- **Request params/query:** /auth/forgot-password; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `PasswordResetInput`.
- **Response:** `ActionResult` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** Đề xuất 400/401/429/503 và 501 nếu chưa hỗ trợ; chưa có nhánh Firebase để xác minh
- **Event thực do mutation phát:** Không có (GET không emit; caller tự refresh nếu mutation không phát event).. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** Không có event bắt buộc; update/refetch theo response. Danh sách từ frontend/mock có thể rộng hơn producer SQL; phần bổ sung là target cần implementation, xem C22.
- **Mock fixture:** MockDataAdapter public action; sends no email.

**Chức năng:** Yêu cầu khôi phục password qua email, chưa có handler thật.

Request body minh họa:

```json
{
  "email": "traveler@example.test"
}
```

Response shape minh họa (fixture):

```json
{
  "ok": true,
  "message": "If an account exists, recovery instructions will be sent."
}
```

### POST /auth/change-password

- **Mục đích / route:** changePassword.
- **Status hiện tại:** Mock-only / Missing backend. Không có handler server; chỉ MockDataAdapter và UI. Không gọi đây là API đã triển khai.
- **Auth/authorization:** Chính user đã xác thực; notifications chỉ owner. 
- **Adapter:** request<ActionResult>(path,token,'POST',body).
- **Module → Firestore:** auth + users → Firebase Authentication; users/{uid}.
- **Request params/query:** /auth/change-password; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `ChangePasswordInput`.
- **Response:** `ActionResult` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** Đề xuất 400/401/429/503 và 501 nếu chưa hỗ trợ; chưa có nhánh Firebase để xác minh
- **Event thực do mutation phát:** Không có (GET không emit; caller tự refresh nếu mutation không phát event).. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** Không có event bắt buộc; update/refetch theo response. Danh sách từ frontend/mock có thể rộng hơn producer SQL; phần bổ sung là target cần implementation, xem C22.
- **Mock fixture:** state.passwords (memory only).

**Chức năng:** Reauthenticate và đổi password, chưa có handler thật.

Request body minh họa:

```json
{
  "currentPassword": "<current-password>",
  "newPassword": "<new-password>"
}
```

Response shape minh họa (fixture):

```json
{
  "ok": true,
  "message": "Password changed. Sign in again."
}
```

### GET /cities

- **Mục đích / route:** home, discover, map, recommendations, createGroup.
- **Status hiện tại:** Existing and verified. Có handler [app.ts:188](../../apps/server/src/app.ts#L188); target cần port catalogue/cities.
- **Auth/authorization:** Chính user đã xác thực; notifications chỉ owner. 
- **Adapter:** request<City[]>(path,token,'GET',body).
- **Module → Firestore:** catalogue/cities → cities/{cityId}.
- **Request params/query:** /cities; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `none`.
- **Response:** `City[]` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. Các lỗi chung; không giả định luôn có code.
- **Event thực do mutation phát:** Không có (GET không emit; caller tự refresh nếu mutation không phát event).. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** Không có event bắt buộc; update/refetch theo response. 
- **Mock fixture:** cities.

**HTTP lỗi theo source operation này:** 401, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Liệt kê thành phố hỗ trợ.

Request body: không có.

Response shape minh họa (fixture):

```json
[
  {
    "id": "dalat",
    "name": "Đà Lạt",
    "latitude": 11.9404,
    "longitude": 108.4583,
    "imageUrl": "https://images.unsplash.com/photo-1570366583862-f91883984fde?auto=format&fit=crop&w=960&q=80"
  },
  {
    "id": "vungtau",
    "name": "Vũng Tàu",
    "latitude": 10.346,
    "longitude": 107.0843,
    "imageUrl": "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=960&q=80"
  }
]
```

### GET /places

- **Mục đích / route:** discover, filters, map, recommendations, aiSetup.
- **Status hiện tại:** Existing and verified. Có handler [app.ts:196](../../apps/server/src/app.ts#L196); target cần port catalogue/places.
- **Auth/authorization:** Chính user đã xác thực; notifications chỉ owner. 
- **Adapter:** request<Place[]>(path,token,'GET',body).
- **Module → Firestore:** catalogue/places → places/{placeId}.
- **Request params/query:** /places?cityId=dalat&q=H%E1%BB%93&environment=OUTDOOR; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `query: {cityId?:string;q?:string;environment?:"INDOOR"|"OUTDOOR";category?:string}`.
- **Response:** `Place[]` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. Các lỗi chung; không giả định luôn có code.
- **Event thực do mutation phát:** Không có (GET không emit; caller tự refresh nếu mutation không phát event).. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** Không có event bắt buộc; update/refetch theo response. 
- **Mock fixture:** places (80 OSM records).

**HTTP lỗi theo source operation này:** 400, 401, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Tìm/lọc toàn bộ catalogue phù hợp.

Request body: không có.

Response shape minh họa (fixture):

```json
[
  {
    "id": "dalat-01",
    "cityId": "dalat",
    "name": "Hồ Xuân Hương",
    "category": "Thiên nhiên",
    "environment": "OUTDOOR",
    "latitude": 11.9450109,
    "longitude": 108.445363,
    "sourceUrl": "https://www.openstreetmap.org/relation/2390139",
    "sourceId": "relation/2390139",
    "coordinateKind": "OSM_BOUNDING_BOX_CENTER",
    "sourceTimestamp": "2026-11-10T05:57:04Z",
    "description": "Hồ Xuân Hương — không gian mặt hồ và cảnh quan. Marker đặt tại tâm hình học đối tượng, chưa xác minh cổng vào. Kiểm tra thông tin tiếp cận và hoạt động trước khi đến.",
    "visitorInfo": {
      "entranceFeeVnd": null,
      "openingHours": null,
      "visitDurationMin": null,
      "environmentEstimated": true,
      "verifiedAt": null
    },
    "geographyVerified": true,
    "dataQuality": "OSM_SOURCE_WITH_UNKNOWN_VISITOR_INFO",
    "priceVnd": 0,
    "durationMin": 60,
    "openHour": 8,
    "closeHour": 20,
    "imageUrl": "https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=640&q=75"
  }
]
```

### GET /places/:id

- **Mục đích / route:** placeDetail, map, planItem.
- **Status hiện tại:** Existing and verified. Có handler [app.ts:223](../../apps/server/src/app.ts#L223); target cần port catalogue/places.
- **Auth/authorization:** Chính user đã xác thực; notifications chỉ owner. 
- **Adapter:** request<Place>(path,token,'GET',body).
- **Module → Firestore:** catalogue/places → places/{placeId}.
- **Request params/query:** /places/:id; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `path id: string`.
- **Response:** `Place` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. Các lỗi chung; không giả định luôn có code.
- **Event thực do mutation phát:** Không có (GET không emit; caller tự refresh nếu mutation không phát event).. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** Không có event bắt buộc; update/refetch theo response. 
- **Mock fixture:** places[0].

**HTTP lỗi theo source operation này:** 401, 404, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Đọc chi tiết một place, kể cả record lịch sử không hiện listing.

Request body: không có.

Response shape minh họa (fixture):

```json
{
  "id": "dalat-01",
  "cityId": "dalat",
  "name": "Hồ Xuân Hương",
  "category": "Thiên nhiên",
  "environment": "OUTDOOR",
  "latitude": 11.9450109,
  "longitude": 108.445363,
  "sourceUrl": "https://www.openstreetmap.org/relation/2390139",
  "sourceId": "relation/2390139",
  "coordinateKind": "OSM_BOUNDING_BOX_CENTER",
  "sourceTimestamp": "2026-11-10T05:57:04Z",
  "description": "Hồ Xuân Hương — không gian mặt hồ và cảnh quan. Marker đặt tại tâm hình học đối tượng, chưa xác minh cổng vào. Kiểm tra thông tin tiếp cận và hoạt động trước khi đến.",
  "visitorInfo": {
    "entranceFeeVnd": null,
    "openingHours": null,
    "visitDurationMin": null,
    "environmentEstimated": true,
    "verifiedAt": null
  },
  "geographyVerified": true,
  "dataQuality": "OSM_SOURCE_WITH_UNKNOWN_VISITOR_INFO",
  "priceVnd": 0,
  "durationMin": 60,
  "openHour": 8,
  "closeHour": 20,
  "imageUrl": "https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=640&q=75"
}
```

### GET /groups

- **Mục đích / route:** home, groups.
- **Status hiện tại:** Existing and verified. Có handler [app.ts:233](../../apps/server/src/app.ts#L233); target cần port groups/membership.
- **Auth/authorization:** Chính user đã xác thực; notifications chỉ owner. 
- **Adapter:** request<Group[]>(path,token,'GET',body).
- **Module → Firestore:** groups/membership → groups/{gid}; groups/{gid}/members/{uid}; preferences; uniqueKeys.
- **Request params/query:** /groups; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `none`.
- **Response:** `Group[]` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. LEADER_REQUIRED (403) ở leader action; lỗi membership thường 404 để không lộ group.
- **Event thực do mutation phát:** Không có (GET không emit; caller tự refresh nếu mutation không phát event).. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** group:updated 
- **Mock fixture:** state.groups.

**HTTP lỗi theo source operation này:** 401, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Liệt kê group caller là active member.

Request body: không có.

Response shape minh họa (fixture):

```json
[
  {
    "id": "mock-dalat",
    "name": "Đà Lạt cùng những người bạn",
    "cityId": "dalat",
    "cityName": "Đà Lạt",
    "tripDate": "2026-11-11",
    "startHour": 8,
    "endHour": 20,
    "budgetPerPersonVnd": 500000,
    "inviteCode": "DICHUNG",
    "currentPlanId": "mock-approved",
    "memberCount": 3,
    "role": "LEADER",
    "mode": "DEMO",
    "revision": 1
  }
]
```

### POST /groups

- **Mục đích / route:** createGroup.
- **Status hiện tại:** Existing and verified. Có handler [app.ts:254](../../apps/server/src/app.ts#L254); target cần port groups/membership.
- **Auth/authorization:** Chính user đã xác thực; notifications chỉ owner. 
- **Adapter:** request<Group>(path,token,'POST',body).
- **Module → Firestore:** groups/membership → groups/{gid}; groups/{gid}/members/{uid}; preferences; uniqueKeys.
- **Request params/query:** /groups; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `{name:string;cityId:string;tripDate:string;startHour:number;endHour:number;budgetPerPersonVnd:number;mode?:'DEMO'|'LIVE'}`.
- **Response:** `Group` (interfaces bên dưới); HTTP 201 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. LEADER_REQUIRED (403) ở leader action; lỗi membership thường 404 để không lộ group.
- **Event thực do mutation phát:** Không có (GET không emit; caller tự refresh nếu mutation không phát event).. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** group:updated, activity:created Danh sách từ frontend/mock có thể rộng hơn producer SQL; phần bổ sung là target cần implementation, xem C22.
- **Mock fixture:** state.groups.

**HTTP lỗi theo source operation này:** 400, 401, 403, 409, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Tạo group cùng membership leader.

Request body minh họa:

```json
{
  "name": "Weekend",
  "cityId": "dalat",
  "tripDate": "2026-11-11",
  "startHour": 8,
  "endHour": 20,
  "budgetPerPersonVnd": 500000,
  "mode": "DEMO"
}
```

Response shape minh họa (fixture):

```json
{
  "id": "<group-id>",
  "name": "Weekend",
  "cityId": "dalat",
  "cityName": "Đà Lạt",
  "tripDate": "2026-11-11",
  "startHour": 8,
  "endHour": 20,
  "budgetPerPersonVnd": 500000,
  "inviteCode": "DICHUNG",
  "currentPlanId": null,
  "memberCount": 1,
  "role": "LEADER",
  "mode": "DEMO",
  "revision": 1
}
```

### POST /groups/join

- **Mục đích / route:** joinGroup.
- **Status hiện tại:** Existing and verified. Có handler [app.ts:301](../../apps/server/src/app.ts#L301); target cần port groups/membership.
- **Auth/authorization:** Chính user đã xác thực; notifications chỉ owner. 
- **Adapter:** request<Group>(path,token,'POST',body).
- **Module → Firestore:** groups/membership → groups/{gid}; groups/{gid}/members/{uid}; preferences; uniqueKeys.
- **Request params/query:** /groups/join; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `{code:string}`.
- **Response:** `Group` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. LEADER_REQUIRED (403) ở leader action; lỗi membership thường 404 để không lộ group.
- **Event thực do mutation phát:** group:updated, activity:created. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** group:updated, activity:created Danh sách từ frontend/mock có thể rộng hơn producer SQL; phần bổ sung là target cần implementation, xem C22.
- **Mock fixture:** state.groups / DICHUNG.

**HTTP lỗi theo source operation này:** 400, 401, 404, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Tham gia/rejoin qua invitation code còn hạn.

Request body minh họa:

```json
{
  "code": "DICHUNG"
}
```

Response shape minh họa (fixture):

```json
{
  "id": "mock-dalat",
  "name": "Đà Lạt cùng những người bạn",
  "cityId": "dalat",
  "cityName": "Đà Lạt",
  "tripDate": "2026-11-11",
  "startHour": 8,
  "endHour": 20,
  "budgetPerPersonVnd": 500000,
  "inviteCode": "DICHUNG",
  "currentPlanId": "mock-approved",
  "memberCount": 3,
  "role": "MEMBER",
  "mode": "DEMO",
  "revision": 1
}
```

### GET /groups/:id

- **Mục đích / route:** dashboard, members, invite, wishlist, timeline, history, budget, aiSetup.
- **Status hiện tại:** Existing and verified. Có handler [app.ts:333](../../apps/server/src/app.ts#L333); target cần port groups/membership.
- **Auth/authorization:** UID hợp lệ + ACTIVE membership; votes còn cần ballot snapshot. 
- **Adapter:** request<GroupDetail>(path,token,'GET',body).
- **Module → Firestore:** groups/membership → groups/{gid}; groups/{gid}/members/{uid}; preferences; uniqueKeys.
- **Request params/query:** /groups/:id; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `path id: string`.
- **Response:** `GroupDetail` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. LEADER_REQUIRED (403) ở leader action; lỗi membership thường 404 để không lộ group.
- **Event thực do mutation phát:** Không có (GET không emit; caller tự refresh nếu mutation không phát event).. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** group:updated, wishlist:updated, plan:updated, plan:applied 
- **Mock fixture:** state.groups[0].

**HTTP lỗi theo source operation này:** 401, 404, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Đọc aggregate group, members, wishlist, plans và currentPlan.

Request body: không có.

Response shape minh họa (fixture):

```json
{
  "group": {
    "id": "mock-dalat",
    "name": "Đà Lạt cùng những người bạn",
    "cityId": "dalat",
    "cityName": "Đà Lạt",
    "tripDate": "2026-11-11",
    "startHour": 8,
    "endHour": 20,
    "budgetPerPersonVnd": 500000,
    "inviteCode": "DICHUNG",
    "currentPlanId": "mock-approved",
    "memberCount": 3,
    "role": "LEADER",
    "mode": "DEMO",
    "revision": 1
  },
  "members": [
    {
      "id": "mock-leader",
      "name": "Minh Anh",
      "email": "leader@dichung.demo",
      "avatarColor": "#18735C",
      "role": "LEADER"
    },
    {
      "id": "mock-member",
      "name": "Hoàng Nam",
      "email": "member@dichung.demo",
      "avatarColor": "#597BA1",
      "role": "MEMBER"
    },
    {
      "id": "mock-third",
      "name": "Thu Hà",
      "email": "third@dichung.demo",
      "avatarColor": "#9A6893",
      "role": "MEMBER"
    }
  ],
  "wishlist": [
    {
      "id": "dalat-01",
      "cityId": "dalat",
      "name": "Hồ Xuân Hương",
      "category": "Thiên nhiên",
      "environment": "OUTDOOR",
      "latitude": 11.9450109,
      "longitude": 108.445363,
      "sourceUrl": "https://www.openstreetmap.org/relation/2390139",
      "sourceId": "relation/2390139",
      "coordinateKind": "OSM_BOUNDING_BOX_CENTER",
      "sourceTimestamp": "2026-11-10T05:57:04Z",
      "description": "Hồ Xuân Hương — không gian mặt hồ và cảnh quan. Marker đặt tại tâm hình học đối tượng, chưa xác minh cổng vào. Kiểm tra thông tin tiếp cận và hoạt động trước khi đến.",
      "visitorInfo": {
        "entranceFeeVnd": null,
        "openingHours": null,
        "visitDurationMin": null,
        "environmentEstimated": true,
        "verifiedAt": null
      },
      "geographyVerified": true,
      "dataQuality": "OSM_SOURCE_WITH_UNKNOWN_VISITOR_INFO",
      "priceVnd": 0,
      "durationMin": 60,
      "openHour": 8,
      "closeHour": 20,
      "imageUrl": "https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=640&q=75"
    }
  ],
  "plans": [
    {
      "id": "mock-pending",
      "groupId": "mock-dalat",
      "tripContext": {
        "cityId": "dalat",
        "tripDate": "2026-11-11",
        "startHour": 8,
        "endHour": 20,
        "budgetPerPersonVnd": 500000
      },
      "version": 3,
      "basePlanId": "mock-approved",
      "kind": "INITIAL",
      "status": "VOTING",
      "engine": "RULE_BASED",
      "demo": true,
      "summary": "DEMO · Phương án mẫu để kiểm tra timeline, bản đồ và biểu quyết. Không phải đầu ra AI thật.",
      "items": [
        {
          "id": "mock-pending-stop-1",
          "placeId": "dalat-03",
          "place": {
            "id": "dalat-03",
            "cityId": "dalat",
            "name": "Bảo tàng Lâm Đồng",
            "category": "Văn hóa",
            "environment": "INDOOR",
            "latitude": 11.9405756,
            "longitude": 108.4599038,
            "sourceUrl": "https://www.openstreetmap.org/node/1152350875",
            "sourceId": "node/1152350875",
            "coordinateKind": "OSM_NODE",
            "sourceTimestamp": "2026-11-10T05:57:04Z",
            "description": "Bảo tàng Lâm Đồng — không gian bảo tàng để tìm hiểu văn hóa và lịch sử địa phương. Marker sử dụng tọa độ điểm do cộng đồng OSM ghi nhận. Kiểm tra thông tin tiếp cận và hoạt động trước khi đến.",
            "visitorInfo": {
              "entranceFeeVnd": null,
              "openingHours": "Mo-Su 07:15-11:30, 13:30-17:00",
              "visitDurationMin": null,
              "environmentEstimated": true,
              "verifiedAt": null
            },
            "geographyVerified": true,
            "dataQuality": "OSM_SOURCE_WITH_UNKNOWN_VISITOR_INFO",
            "priceVnd": 0,
            "durationMin": 60,
            "openHour": 8,
            "closeHour": 20,
            "imageUrl": "https://images.unsplash.com/photo-1564399579883-451a5d44ec08?auto=format&fit=crop&w=640&q=75"
          },
          "position": 0,
          "startTime": "2026-11-11T01:00:00.000Z",
          "endTime": "2026-11-11T02:00:00.000Z",
          "travelMin": 0,
          "costVnd": 0,
          "reason": "DEMO · Điểm dừng trong kịch bản thử giao diện. Thời lượng và di chuyển là giả định; giá vé chưa biết.",
          "factIds": [
            "https://www.openstreetmap.org/node/1152350875"
          ]
        }
      ],
      "totalCostVnd": 0,
      "totalDurationMin": 60,
      "totalTravelMin": 0,
      "unknownCostCount": 1,
      "yesVotes": 1,
      "noVotes": 0,
      "eligibleCount": 3,
      "requiredYesVotes": 2,
      "myVote": null,
      "deadline": "2026-11-11T08:30:00.000Z",
      "createdAt": "2026-11-11T08:00:00.000Z"
    }
  ],
  "currentPlan": {
    "id": "mock-approved",
    "groupId": "mock-dalat",
    "tripContext": {
      "cityId": "dalat",
      "tripDate": "2026-11-11",
      "startHour": 8,
      "endHour": 20,
      "budgetPerPersonVnd": 500000
    },
    "version": 3,
    "basePlanId": "mock-approved",
    "kind": "INITIAL",
    "status": "APPROVED",
    "engine": "RULE_BASED",
    "demo": true,
    "summary": "DEMO · Phương án mẫu để kiểm tra timeline, bản đồ và biểu quyết. Không phải đầu ra AI thật.",
    "items": [
      {
        "id": "mock-pending-stop-1",
        "placeId": "dalat-03",
        "place": {
          "id": "dalat-03",
          "cityId": "dalat",
          "name": "Bảo tàng Lâm Đồng",
          "category": "Văn hóa",
          "environment": "INDOOR",
          "latitude": 11.9405756,
          "longitude": 108.4599038,
          "sourceUrl": "https://www.openstreetmap.org/node/1152350875",
          "sourceId": "node/1152350875",
          "coordinateKind": "OSM_NODE",
          "sourceTimestamp": "2026-11-10T05:57:04Z",
          "description": "Bảo tàng Lâm Đồng — không gian bảo tàng để tìm hiểu văn hóa và lịch sử địa phương. Marker sử dụng tọa độ điểm do cộng đồng OSM ghi nhận. Kiểm tra thông tin tiếp cận và hoạt động trước khi đến.",
          "visitorInfo": {
            "entranceFeeVnd": null,
            "openingHours": "Mo-Su 07:15-11:30, 13:30-17:00",
            "visitDurationMin": null,
            "environmentEstimated": true,
            "verifiedAt": null
          },
          "geographyVerified": true,
          "dataQuality": "OSM_SOURCE_WITH_UNKNOWN_VISITOR_INFO",
          "priceVnd": 0,
          "durationMin": 60,
          "openHour": 8,
          "closeHour": 20,
          "imageUrl": "https://images.unsplash.com/photo-1564399579883-451a5d44ec08?auto=format&fit=crop&w=640&q=75"
        },
        "position": 0,
        "startTime": "2026-11-11T01:00:00.000Z",
        "endTime": "2026-11-11T02:00:00.000Z",
        "travelMin": 0,
        "costVnd": 0,
        "reason": "DEMO · Điểm dừng trong kịch bản thử giao diện. Thời lượng và di chuyển là giả định; giá vé chưa biết.",
        "factIds": [
          "https://www.openstreetmap.org/node/1152350875"
        ]
      }
    ],
    "totalCostVnd": 0,
    "totalDurationMin": 60,
    "totalTravelMin": 0,
    "unknownCostCount": 1,
    "yesVotes": 2,
    "noVotes": 0,
    "eligibleCount": 3,
    "requiredYesVotes": 2,
    "myVote": null,
    "deadline": "2026-11-11T08:30:00.000Z",
    "createdAt": "2026-11-11T08:00:00.000Z"
  }
}
```

### PATCH /groups/:id

- **Mục đích / route:** budget, aiSetup.
- **Status hiện tại:** Requires contract clarification (C17/C21; SQL behavior verified). Có handler [app.ts:350](../../apps/server/src/app.ts#L350); target cần port groups/membership.
- **Auth/authorization:** Firebase UID/JWT hợp lệ + ACTIVE LEADER trong group. 
- **Adapter:** request<Group>(path,token,'PATCH',body).
- **Module → Firestore:** groups/membership → groups/{gid}; groups/{gid}/members/{uid}; preferences; uniqueKeys.
- **Request params/query:** /groups/:id; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `Partial<Pick<Group,'name'|'tripDate'|'startHour'|'endHour'|'budgetPerPersonVnd'|'mode'>> & {expectedRevision?:number}`.
- **Response:** `Group` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. LEADER_REQUIRED (403) ở leader action; lỗi membership thường 404 để không lộ group.
- **Event thực do mutation phát:** group:updated, activity:created. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** group:updated, plan:updated, activity:created Danh sách từ frontend/mock có thể rộng hơn producer SQL; phần bổ sung là target cần implementation, xem C22.
- **Mock fixture:** state.groups[0].group.

**Lưu ý C17/C21:** expectedRevision lệch vẫn nhận edit và log overwrite, không phải CAS 409; mode change clear currentPlanId, còn constraint edits khác giữ pointer nhưng stale pending. Mẫu mock từ chối revision khác không phải semantics backend.

**HTTP lỗi theo source operation này:** 400, 401, 403, 404, 422, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Leader cập nhật group; SQL nhận edit đến sau và audit overwrite.

Request body minh họa:

```json
{
  "budgetPerPersonVnd": 600000,
  "expectedRevision": 1
}
```

Response shape minh họa (fixture):

```json
{
  "id": "mock-dalat",
  "name": "Đà Lạt cùng những người bạn",
  "cityId": "dalat",
  "cityName": "Đà Lạt",
  "tripDate": "2026-11-11",
  "startHour": 8,
  "endHour": 20,
  "budgetPerPersonVnd": 600000,
  "inviteCode": "DICHUNG",
  "currentPlanId": "mock-approved",
  "memberCount": 3,
  "role": "LEADER",
  "mode": "DEMO",
  "revision": 2
}
```

### GET /groups/:id/preferences

- **Mục đích / route:** groupPreferences, aiSetup.
- **Status hiện tại:** Existing and verified. Có handler [app.ts:448](../../apps/server/src/app.ts#L448); target cần port groups/preferences.
- **Auth/authorization:** UID hợp lệ + ACTIVE membership; votes còn cần ballot snapshot. 
- **Adapter:** request<Preferences (current user)>(path,token,'GET',body).
- **Module → Firestore:** groups/preferences → groups/{gid}/preferences/{uid}; groups/members.
- **Request params/query:** /groups/:id/preferences; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `path id: string`.
- **Response:** `Preferences (current user)` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. LEADER_REQUIRED (403) ở leader action; lỗi membership thường 404 để không lộ group.
- **Event thực do mutation phát:** Không có (GET không emit; caller tự refresh nếu mutation không phát event).. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** group:updated 
- **Mock fixture:** state.preferences[groupId:userId].

**HTTP lỗi theo source operation này:** 401, 404, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Đọc sở thích riêng caller trong group.

Request body: không có.

Response shape minh họa (fixture):

```json
{
  "categories": [
    "Thiên nhiên",
    "Văn hóa"
  ],
  "environmentPreference": "ANY",
  "travelStyles": [
    "RELAXATION"
  ]
}
```

### PATCH /groups/:id/preferences

- **Mục đích / route:** groupPreferences, aiSetup.
- **Status hiện tại:** Existing and verified. Có handler [app.ts:466](../../apps/server/src/app.ts#L466); target cần port groups/preferences.
- **Auth/authorization:** UID hợp lệ + ACTIVE membership; votes còn cần ballot snapshot. 
- **Adapter:** request<Preferences>(path,token,'PATCH',body).
- **Module → Firestore:** groups/preferences → groups/{gid}/preferences/{uid}; groups/members.
- **Request params/query:** /groups/:id/preferences; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `Pick<Preferences,"categories"> & Partial<Omit<Preferences,"categories">>`.
- **Response:** `Preferences` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. LEADER_REQUIRED (403) ở leader action; lỗi membership thường 404 để không lộ group.
- **Event thực do mutation phát:** group:updated, activity:created. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** group:updated, activity:created Danh sách từ frontend/mock có thể rộng hơn producer SQL; phần bổ sung là target cần implementation, xem C22.
- **Mock fixture:** state.preferences[groupId:userId].

**HTTP lỗi theo source operation này:** 400, 401, 404, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Merge preferences riêng caller.

Request body minh họa:

```json
{
  "categories": [
    "Thiên nhiên",
    "Văn hóa"
  ],
  "environmentPreference": "ANY",
  "travelStyles": [
    "RELAXATION"
  ]
}
```

Response shape minh họa (fixture):

```json
{
  "categories": [
    "Thiên nhiên",
    "Văn hóa"
  ],
  "environmentPreference": "ANY",
  "travelStyles": [
    "RELAXATION"
  ]
}
```

### GET /groups/:id/wishlist

- **Mục đích / route:** wishlist, map, aiSetup.
- **Status hiện tại:** Existing but requires migration. Có handler [app.ts:440](../../apps/server/src/app.ts#L440); target cần port collaboration/wishlist.
- **Auth/authorization:** UID hợp lệ + ACTIVE membership; votes còn cần ballot snapshot. 
- **Adapter:** request<Place[]>(path,token,'GET',body).
- **Module → Firestore:** collaboration/wishlist → groups/{gid}/wishlist/{placeId}; places.
- **Request params/query:** /groups/:id/wishlist; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `path id: string`.
- **Response:** `Place[]` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. LEADER_REQUIRED (403) ở leader action; lỗi membership thường 404 để không lộ group.
- **Event thực do mutation phát:** Không có (GET không emit; caller tự refresh nếu mutation không phát event).. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** wishlist:updated 
- **Mock fixture:** state.groups[0].wishlist.

**HTTP lỗi theo source operation này:** 401, 404, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Đọc places trong wishlist chung.

Request body: không có.

Response shape minh họa (fixture):

```json
[
  {
    "id": "dalat-01",
    "cityId": "dalat",
    "name": "Hồ Xuân Hương",
    "category": "Thiên nhiên",
    "environment": "OUTDOOR",
    "latitude": 11.9450109,
    "longitude": 108.445363,
    "sourceUrl": "https://www.openstreetmap.org/relation/2390139",
    "sourceId": "relation/2390139",
    "coordinateKind": "OSM_BOUNDING_BOX_CENTER",
    "sourceTimestamp": "2026-11-10T05:57:04Z",
    "description": "Hồ Xuân Hương — không gian mặt hồ và cảnh quan. Marker đặt tại tâm hình học đối tượng, chưa xác minh cổng vào. Kiểm tra thông tin tiếp cận và hoạt động trước khi đến.",
    "visitorInfo": {
      "entranceFeeVnd": null,
      "openingHours": null,
      "visitDurationMin": null,
      "environmentEstimated": true,
      "verifiedAt": null
    },
    "geographyVerified": true,
    "dataQuality": "OSM_SOURCE_WITH_UNKNOWN_VISITOR_INFO",
    "priceVnd": 0,
    "durationMin": 60,
    "openHour": 8,
    "closeHour": 20,
    "imageUrl": "https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=640&q=75"
  }
]
```

### POST /groups/:id/wishlist

- **Mục đích / route:** discover, placeDetail, map, recommendations.
- **Status hiện tại:** Existing and verified. Có handler [app.ts:500](../../apps/server/src/app.ts#L500); target cần port collaboration/wishlist.
- **Auth/authorization:** UID hợp lệ + ACTIVE membership; votes còn cần ballot snapshot. 
- **Adapter:** request<Place[]>(path,token,'POST',body).
- **Module → Firestore:** collaboration/wishlist → groups/{gid}/wishlist/{placeId}; places.
- **Request params/query:** /groups/:id/wishlist; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `{placeId:string}`.
- **Response:** `Place[]` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. LEADER_REQUIRED (403) ở leader action; lỗi membership thường 404 để không lộ group.
- **Event thực do mutation phát:** wishlist:updated. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** wishlist:updated, activity:created Danh sách từ frontend/mock có thể rộng hơn producer SQL; phần bổ sung là target cần implementation, xem C22.
- **Mock fixture:** state.groups[0].wishlist.

**HTTP lỗi theo source operation này:** 400, 401, 404, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Thêm place cùng city, idempotent.

Request body minh họa:

```json
{
  "placeId": "dalat-01"
}
```

Response shape minh họa (fixture):

```json
[
  {
    "id": "dalat-01",
    "cityId": "dalat",
    "name": "Hồ Xuân Hương",
    "category": "Thiên nhiên",
    "environment": "OUTDOOR",
    "latitude": 11.9450109,
    "longitude": 108.445363,
    "sourceUrl": "https://www.openstreetmap.org/relation/2390139",
    "sourceId": "relation/2390139",
    "coordinateKind": "OSM_BOUNDING_BOX_CENTER",
    "sourceTimestamp": "2026-11-10T05:57:04Z",
    "description": "Hồ Xuân Hương — không gian mặt hồ và cảnh quan. Marker đặt tại tâm hình học đối tượng, chưa xác minh cổng vào. Kiểm tra thông tin tiếp cận và hoạt động trước khi đến.",
    "visitorInfo": {
      "entranceFeeVnd": null,
      "openingHours": null,
      "visitDurationMin": null,
      "environmentEstimated": true,
      "verifiedAt": null
    },
    "geographyVerified": true,
    "dataQuality": "OSM_SOURCE_WITH_UNKNOWN_VISITOR_INFO",
    "priceVnd": 0,
    "durationMin": 60,
    "openHour": 8,
    "closeHour": 20,
    "imageUrl": "https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=640&q=75"
  }
]
```

### DELETE /groups/:id/wishlist/:placeId

- **Mục đích / route:** wishlist.
- **Status hiện tại:** Existing but requires migration. Có handler [app.ts:521](../../apps/server/src/app.ts#L521); target cần port collaboration/wishlist.
- **Auth/authorization:** UID hợp lệ + ACTIVE membership; votes còn cần ballot snapshot. 
- **Adapter:** request<Place[]>(path,token,'DELETE',body).
- **Module → Firestore:** collaboration/wishlist → groups/{gid}/wishlist/{placeId}; places.
- **Request params/query:** /groups/:id/wishlist/:placeId; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `path id,placeId: string`.
- **Response:** `Place[]` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. LEADER_REQUIRED (403) ở leader action; lỗi membership thường 404 để không lộ group.
- **Event thực do mutation phát:** wishlist:updated. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** wishlist:updated, activity:created Danh sách từ frontend/mock có thể rộng hơn producer SQL; phần bổ sung là target cần implementation, xem C22.
- **Mock fixture:** state.groups[0].wishlist.

**HTTP lỗi theo source operation này:** 401, 404, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Bỏ place khỏi wishlist, không xóa lịch sử plan.

Request body: không có.

Response shape minh họa (fixture):

```json
[]
```

### POST /ai/recommendations

- **Mục đích / route:** recommendations, map.
- **Status hiện tại:** Existing but requires migration. Có handler [app.ts:563](../../apps/server/src/app.ts#L563); target cần port ai/discovery + facts.
- **Auth/authorization:** Chính user đã xác thực; notifications chỉ owner. 
- **Adapter:** request<RecommendationResult>(path,token,'POST',body).
- **Module → Firestore:** ai/discovery + facts → places; groups/preferences; weatherSnapshots; aiExecutions.
- **Request params/query:** /ai/recommendations; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `DiscoveryInput`.
- **Response:** `RecommendationResult` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. GROUP_CONSTRAINTS_CHANGED (409), INVALID_PREFERRED_PLACE (422), DISCOVERY_RATE_LIMIT (429).
- **Event thực do mutation phát:** Không có (GET không emit; caller tự refresh nếu mutation không phát event).. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** Không có event bắt buộc; update/refetch theo response. Danh sách từ frontend/mock có thể rộng hơn producer SQL; phần bổ sung là target cần implementation, xem C22.
- **Mock fixture:** MockDataAdapter.recommend; full example in docs/examples.

**HTTP lỗi theo source operation này:** 400, 401, 403, 404, 409, 422, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Smart Discovery; không tạo plan hoặc wishlist.

Request body minh họa:

```json
{
  "cityId": "dalat",
  "tripDate": "2026-11-11",
  "budgetPerPersonVnd": 500000,
  "categories": [
    "CULTURE"
  ],
  "environmentPreference": "ANY",
  "travelStyles": [
    "RELAXATION"
  ],
  "durationHours": 8,
  "startHour": 8,
  "preferredPlaceIds": [
    "dalat-01"
  ],
  "groupId": "mock-dalat",
  "mode": "demo",
  "limit": 6
}
```

Response shape minh họa (fixture):

```json
{
  "requestId": "example",
  "engine": "RULE_BASED",
  "demo": true,
  "model": null,
  "fallbackReason": "MOCK_FIXTURE",
  "cityId": "dalat",
  "groupId": "mock-dalat",
  "input": {
    "cityId": "dalat",
    "tripDate": "2026-11-11",
    "budgetPerPersonVnd": 500000,
    "categories": [
      "CULTURE"
    ],
    "environmentPreference": "ANY",
    "travelStyles": [
      "RELAXATION"
    ],
    "durationHours": 8,
    "startHour": 8,
    "preferredPlaceIds": [
      "dalat-01"
    ],
    "groupId": "mock-dalat",
    "mode": "demo",
    "limit": 6
  },
  "recommendations": [],
  "candidateCount": 0,
  "groupPreferenceCount": 3,
  "weather": {
    "demo": true,
    "fetchedAt": "2026-11-11T08:00:00.000Z",
    "confidenceText": "DEMO · Các con số là kịch bản giao diện, không phải thời tiết trực tiếp.",
    "providers": [
      {
        "provider": "Open-Meteo",
        "status": "OK",
        "fetchedAt": "2026-11-11T08:00:00.000Z",
        "message": "DEMO · Nguồn mô phỏng, không gọi nhà cung cấp."
      },
      {
        "provider": "WeatherAPI",
        "status": "OK",
        "fetchedAt": "2026-11-11T08:00:00.000Z",
        "message": "DEMO · Nguồn mô phỏng, không gọi nhà cung cấp."
      },
      {
        "provider": "Tomorrow.io",
        "status": "OK",
        "fetchedAt": "2026-11-11T08:00:00.000Z",
        "message": "DEMO · Nguồn mô phỏng, không gọi nhà cung cấp."
      }
    ],
    "slots": [
      {
        "time": "2026-11-10T23:00:00.000Z",
        "rainMmH": 0,
        "probabilityPct": 15,
        "temperatureC": 18,
        "windKmh": 9,
        "level": "NONE",
        "rainVotes": 0,
        "validSources": 3,
        "providers": [
          {
            "provider": "Open-Meteo",
            "rainMmH": 0,
            "probabilityPct": 15,
            "risk": false,
            "usable": true
          },
          {
            "provider": "WeatherAPI",
            "rainMmH": 0,
            "probabilityPct": 15,
            "risk": false,
            "usable": true
          },
          {
            "provider": "Tomorrow.io",
            "rainMmH": 0,
            "probabilityPct": 15,
            "risk": false,
            "usable": true
          }
        ]
      }
    ],
    "rainWindows": []
  },
  "generatedAt": "2026-11-11T08:00:00.000Z",
  "cached": false,
  "warnings": [
    "Simulated empty example; see generated recommendation-result.json for full populated payload."
  ]
}
```

### GET /groups/:id/plans

- **Mục đích / route:** history, proposal.
- **Status hiện tại:** Existing but requires migration. Có handler [app.ts:535](../../apps/server/src/app.ts#L535); target cần port plans/history.
- **Auth/authorization:** UID hợp lệ + ACTIVE membership; votes còn cần ballot snapshot. 
- **Adapter:** request<Plan[]>(path,token,'GET',body).
- **Module → Firestore:** plans/history → plans where groupId; places; votes.
- **Request params/query:** /groups/:id/plans; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `path id: string`.
- **Response:** `Plan[]` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. LEADER_REQUIRED (403) ở leader action; lỗi membership thường 404 để không lộ group.
- **Event thực do mutation phát:** Không có (GET không emit; caller tự refresh nếu mutation không phát event).. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** plan:created, plan:updated, plan:applied 
- **Mock fixture:** state.groups[0].plans.

**HTTP lỗi theo source operation này:** 401, 404, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Đọc lịch sử proposals theo version.

Request body: không có.

Response shape minh họa (fixture):

```json
[
  {
    "id": "mock-pending",
    "groupId": "mock-dalat",
    "tripContext": {
      "cityId": "dalat",
      "tripDate": "2026-11-11",
      "startHour": 8,
      "endHour": 20,
      "budgetPerPersonVnd": 500000
    },
    "version": 3,
    "basePlanId": "mock-approved",
    "kind": "INITIAL",
    "status": "VOTING",
    "engine": "RULE_BASED",
    "demo": true,
    "summary": "DEMO · Phương án mẫu để kiểm tra timeline, bản đồ và biểu quyết. Không phải đầu ra AI thật.",
    "items": [
      {
        "id": "mock-pending-stop-1",
        "placeId": "dalat-03",
        "place": {
          "id": "dalat-03",
          "cityId": "dalat",
          "name": "Bảo tàng Lâm Đồng",
          "category": "Văn hóa",
          "environment": "INDOOR",
          "latitude": 11.9405756,
          "longitude": 108.4599038,
          "sourceUrl": "https://www.openstreetmap.org/node/1152350875",
          "sourceId": "node/1152350875",
          "coordinateKind": "OSM_NODE",
          "sourceTimestamp": "2026-11-10T05:57:04Z",
          "description": "Bảo tàng Lâm Đồng — không gian bảo tàng để tìm hiểu văn hóa và lịch sử địa phương. Marker sử dụng tọa độ điểm do cộng đồng OSM ghi nhận. Kiểm tra thông tin tiếp cận và hoạt động trước khi đến.",
          "visitorInfo": {
            "entranceFeeVnd": null,
            "openingHours": "Mo-Su 07:15-11:30, 13:30-17:00",
            "visitDurationMin": null,
            "environmentEstimated": true,
            "verifiedAt": null
          },
          "geographyVerified": true,
          "dataQuality": "OSM_SOURCE_WITH_UNKNOWN_VISITOR_INFO",
          "priceVnd": 0,
          "durationMin": 60,
          "openHour": 8,
          "closeHour": 20,
          "imageUrl": "https://images.unsplash.com/photo-1564399579883-451a5d44ec08?auto=format&fit=crop&w=640&q=75"
        },
        "position": 0,
        "startTime": "2026-11-11T01:00:00.000Z",
        "endTime": "2026-11-11T02:00:00.000Z",
        "travelMin": 0,
        "costVnd": 0,
        "reason": "DEMO · Điểm dừng trong kịch bản thử giao diện. Thời lượng và di chuyển là giả định; giá vé chưa biết.",
        "factIds": [
          "https://www.openstreetmap.org/node/1152350875"
        ]
      }
    ],
    "totalCostVnd": 0,
    "totalDurationMin": 60,
    "totalTravelMin": 0,
    "unknownCostCount": 1,
    "yesVotes": 1,
    "noVotes": 0,
    "eligibleCount": 3,
    "requiredYesVotes": 2,
    "myVote": null,
    "deadline": "2026-11-11T08:30:00.000Z",
    "createdAt": "2026-11-11T08:00:00.000Z"
  }
]
```

### POST /groups/:id/plans/generate

- **Mục đích / route:** aiSetup, itineraryMap.
- **Status hiện tại:** Existing and verified. Có handler [app.ts:564](../../apps/server/src/app.ts#L564); target cần port ai/planner + plans.
- **Auth/authorization:** Firebase UID/JWT hợp lệ + ACTIVE LEADER trong group. 
- **Adapter:** request<Plan>(path,token,'POST',body).
- **Module → Firestore:** ai/planner + plans → plans; votes; aiExecutions; groups; weatherSnapshots.
- **Request params/query:** /groups/:id/plans/generate; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `{mode:'demo'|'live';task?:'INITIAL'|'RAIN_CHANGE';placeIds?:string[]}`.
- **Response:** `Plan` (interfaces bên dưới); HTTP 201 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. MODE_MISMATCH, STALE_BASE, CONSTRAINTS_CHANGED (409), INVALID_PLANNER_PLACES (422).
- **Event thực do mutation phát:** plan:created, activity:created, notification:created. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** plan:created, notification:created, activity:created Danh sách từ frontend/mock có thể rộng hơn producer SQL; phần bổ sung là target cần implementation, xem C22.
- **Mock fixture:** planFixture; state.groups[0].plans.

**HTTP lỗi theo source operation này:** 400, 401, 403, 404, 409, 422, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Leader tạo proposal có constraints và voter snapshot.

Request body minh họa:

```json
{
  "mode": "demo",
  "task": "INITIAL",
  "placeIds": [
    "dalat-01",
    "dalat-03",
    "dalat-04"
  ]
}
```

Response shape minh họa (fixture):

```json
{
  "id": "mock-pending",
  "groupId": "mock-dalat",
  "tripContext": {
    "cityId": "dalat",
    "tripDate": "2026-11-11",
    "startHour": 8,
    "endHour": 20,
    "budgetPerPersonVnd": 500000
  },
  "version": 3,
  "basePlanId": "mock-approved",
  "kind": "INITIAL",
  "status": "VOTING",
  "engine": "RULE_BASED",
  "demo": true,
  "summary": "DEMO · Phương án mẫu để kiểm tra timeline, bản đồ và biểu quyết. Không phải đầu ra AI thật.",
  "items": [
    {
      "id": "mock-pending-stop-1",
      "placeId": "dalat-03",
      "place": {
        "id": "dalat-03",
        "cityId": "dalat",
        "name": "Bảo tàng Lâm Đồng",
        "category": "Văn hóa",
        "environment": "INDOOR",
        "latitude": 11.9405756,
        "longitude": 108.4599038,
        "sourceUrl": "https://www.openstreetmap.org/node/1152350875",
        "sourceId": "node/1152350875",
        "coordinateKind": "OSM_NODE",
        "sourceTimestamp": "2026-11-10T05:57:04Z",
        "description": "Bảo tàng Lâm Đồng — không gian bảo tàng để tìm hiểu văn hóa và lịch sử địa phương. Marker sử dụng tọa độ điểm do cộng đồng OSM ghi nhận. Kiểm tra thông tin tiếp cận và hoạt động trước khi đến.",
        "visitorInfo": {
          "entranceFeeVnd": null,
          "openingHours": "Mo-Su 07:15-11:30, 13:30-17:00",
          "visitDurationMin": null,
          "environmentEstimated": true,
          "verifiedAt": null
        },
        "geographyVerified": true,
        "dataQuality": "OSM_SOURCE_WITH_UNKNOWN_VISITOR_INFO",
        "priceVnd": 0,
        "durationMin": 60,
        "openHour": 8,
        "closeHour": 20,
        "imageUrl": "https://images.unsplash.com/photo-1564399579883-451a5d44ec08?auto=format&fit=crop&w=640&q=75"
      },
      "position": 0,
      "startTime": "2026-11-11T01:00:00.000Z",
      "endTime": "2026-11-11T02:00:00.000Z",
      "travelMin": 0,
      "costVnd": 0,
      "reason": "DEMO · Điểm dừng trong kịch bản thử giao diện. Thời lượng và di chuyển là giả định; giá vé chưa biết.",
      "factIds": [
        "https://www.openstreetmap.org/node/1152350875"
      ]
    }
  ],
  "totalCostVnd": 0,
  "totalDurationMin": 60,
  "totalTravelMin": 0,
  "unknownCostCount": 1,
  "yesVotes": 1,
  "noVotes": 0,
  "eligibleCount": 3,
  "requiredYesVotes": 2,
  "myVote": null,
  "deadline": "2026-11-11T08:30:00.000Z",
  "createdAt": "2026-11-11T08:00:00.000Z"
}
```

### GET /plans/:id

- **Mục đích / route:** proposal, vote, itineraryMap.
- **Status hiện tại:** Existing and verified. Có handler [app.ts:543](../../apps/server/src/app.ts#L543); target cần port plans/read.
- **Auth/authorization:** UID hợp lệ + ACTIVE membership; votes còn cần ballot snapshot. 
- **Adapter:** request<Plan>(path,token,'GET',body).
- **Module → Firestore:** plans/read → plans/{pid}; votes; places.
- **Request params/query:** /plans/:id; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `path id: string`.
- **Response:** `Plan` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. Các lỗi chung; không giả định luôn có code.
- **Event thực do mutation phát:** Không có (GET không emit; caller tự refresh nếu mutation không phát event).. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** plan:updated, plan:applied 
- **Mock fixture:** state.groups[0].plans; per-user myVote.

**HTTP lỗi theo source operation này:** 401, 404, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Đọc proposal/plan cùng myVote của caller.

Request body: không có.

Response shape minh họa (fixture):

```json
{
  "id": "mock-pending",
  "groupId": "mock-dalat",
  "tripContext": {
    "cityId": "dalat",
    "tripDate": "2026-11-11",
    "startHour": 8,
    "endHour": 20,
    "budgetPerPersonVnd": 500000
  },
  "version": 3,
  "basePlanId": "mock-approved",
  "kind": "INITIAL",
  "status": "VOTING",
  "engine": "RULE_BASED",
  "demo": true,
  "summary": "DEMO · Phương án mẫu để kiểm tra timeline, bản đồ và biểu quyết. Không phải đầu ra AI thật.",
  "items": [
    {
      "id": "mock-pending-stop-1",
      "placeId": "dalat-03",
      "place": {
        "id": "dalat-03",
        "cityId": "dalat",
        "name": "Bảo tàng Lâm Đồng",
        "category": "Văn hóa",
        "environment": "INDOOR",
        "latitude": 11.9405756,
        "longitude": 108.4599038,
        "sourceUrl": "https://www.openstreetmap.org/node/1152350875",
        "sourceId": "node/1152350875",
        "coordinateKind": "OSM_NODE",
        "sourceTimestamp": "2026-11-10T05:57:04Z",
        "description": "Bảo tàng Lâm Đồng — không gian bảo tàng để tìm hiểu văn hóa và lịch sử địa phương. Marker sử dụng tọa độ điểm do cộng đồng OSM ghi nhận. Kiểm tra thông tin tiếp cận và hoạt động trước khi đến.",
        "visitorInfo": {
          "entranceFeeVnd": null,
          "openingHours": "Mo-Su 07:15-11:30, 13:30-17:00",
          "visitDurationMin": null,
          "environmentEstimated": true,
          "verifiedAt": null
        },
        "geographyVerified": true,
        "dataQuality": "OSM_SOURCE_WITH_UNKNOWN_VISITOR_INFO",
        "priceVnd": 0,
        "durationMin": 60,
        "openHour": 8,
        "closeHour": 20,
        "imageUrl": "https://images.unsplash.com/photo-1564399579883-451a5d44ec08?auto=format&fit=crop&w=640&q=75"
      },
      "position": 0,
      "startTime": "2026-11-11T01:00:00.000Z",
      "endTime": "2026-11-11T02:00:00.000Z",
      "travelMin": 0,
      "costVnd": 0,
      "reason": "DEMO · Điểm dừng trong kịch bản thử giao diện. Thời lượng và di chuyển là giả định; giá vé chưa biết.",
      "factIds": [
        "https://www.openstreetmap.org/node/1152350875"
      ]
    }
  ],
  "totalCostVnd": 0,
  "totalDurationMin": 60,
  "totalTravelMin": 0,
  "unknownCostCount": 1,
  "yesVotes": 1,
  "noVotes": 0,
  "eligibleCount": 3,
  "requiredYesVotes": 2,
  "myVote": null,
  "deadline": "2026-11-11T08:30:00.000Z",
  "createdAt": "2026-11-11T08:00:00.000Z"
}
```

### POST /plans/:id/votes

- **Mục đích / route:** vote.
- **Status hiện tại:** Existing and verified. Có handler [app.ts:585](../../apps/server/src/app.ts#L585); target cần port plans/voting.
- **Auth/authorization:** UID hợp lệ + ACTIVE membership; votes còn cần ballot snapshot. 
- **Adapter:** request<Plan>(path,token,'POST',body).
- **Module → Firestore:** plans/voting → plans/{pid}; plans/{pid}/votes/{uid}; groups; outbox.
- **Request params/query:** /plans/:id/votes; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `{choice:'YES'|'NO'}`.
- **Response:** `Plan` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. VOTE_CLOSED, VOTE_EXPIRED, NOT_ELIGIBLE, STALE_BASE, CONSTRAINTS_CHANGED.
- **Event thực do mutation phát:** plan:updated, activity:created, plan:applied, group:updated, notification:created. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** plan:updated, plan:applied, notification:created, activity:created Danh sách từ frontend/mock có thể rộng hơn producer SQL; phần bổ sung là target cần implementation, xem C22.
- **Mock fixture:** state.votes / electorates.

**HTTP lỗi theo source operation này:** 400, 401, 403, 404, 409, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Ghi hoặc đổi một ballot, atomic majority/currentPlan.

Request body minh họa:

```json
{
  "choice": "YES"
}
```

Response shape minh họa (fixture):

```json
{
  "id": "mock-pending",
  "groupId": "mock-dalat",
  "tripContext": {
    "cityId": "dalat",
    "tripDate": "2026-11-11",
    "startHour": 8,
    "endHour": 20,
    "budgetPerPersonVnd": 500000
  },
  "version": 3,
  "basePlanId": "mock-approved",
  "kind": "INITIAL",
  "status": "APPROVED",
  "engine": "RULE_BASED",
  "demo": true,
  "summary": "DEMO · Phương án mẫu để kiểm tra timeline, bản đồ và biểu quyết. Không phải đầu ra AI thật.",
  "items": [
    {
      "id": "mock-pending-stop-1",
      "placeId": "dalat-03",
      "place": {
        "id": "dalat-03",
        "cityId": "dalat",
        "name": "Bảo tàng Lâm Đồng",
        "category": "Văn hóa",
        "environment": "INDOOR",
        "latitude": 11.9405756,
        "longitude": 108.4599038,
        "sourceUrl": "https://www.openstreetmap.org/node/1152350875",
        "sourceId": "node/1152350875",
        "coordinateKind": "OSM_NODE",
        "sourceTimestamp": "2026-11-10T05:57:04Z",
        "description": "Bảo tàng Lâm Đồng — không gian bảo tàng để tìm hiểu văn hóa và lịch sử địa phương. Marker sử dụng tọa độ điểm do cộng đồng OSM ghi nhận. Kiểm tra thông tin tiếp cận và hoạt động trước khi đến.",
        "visitorInfo": {
          "entranceFeeVnd": null,
          "openingHours": "Mo-Su 07:15-11:30, 13:30-17:00",
          "visitDurationMin": null,
          "environmentEstimated": true,
          "verifiedAt": null
        },
        "geographyVerified": true,
        "dataQuality": "OSM_SOURCE_WITH_UNKNOWN_VISITOR_INFO",
        "priceVnd": 0,
        "durationMin": 60,
        "openHour": 8,
        "closeHour": 20,
        "imageUrl": "https://images.unsplash.com/photo-1564399579883-451a5d44ec08?auto=format&fit=crop&w=640&q=75"
      },
      "position": 0,
      "startTime": "2026-11-11T01:00:00.000Z",
      "endTime": "2026-11-11T02:00:00.000Z",
      "travelMin": 0,
      "costVnd": 0,
      "reason": "DEMO · Điểm dừng trong kịch bản thử giao diện. Thời lượng và di chuyển là giả định; giá vé chưa biết.",
      "factIds": [
        "https://www.openstreetmap.org/node/1152350875"
      ]
    }
  ],
  "totalCostVnd": 0,
  "totalDurationMin": 60,
  "totalTravelMin": 0,
  "unknownCostCount": 1,
  "yesVotes": 2,
  "noVotes": 0,
  "eligibleCount": 3,
  "requiredYesVotes": 2,
  "myVote": "YES",
  "deadline": "2026-11-11T08:30:00.000Z",
  "createdAt": "2026-11-11T08:00:00.000Z"
}
```

### GET /groups/:id/weather

- **Mục đích / route:** weather, hourly, providers, home, map, itineraryMap.
- **Status hiện tại:** Existing but requires migration. Có handler [app.ts:709](../../apps/server/src/app.ts#L709); target cần port weather/checks + workers.
- **Auth/authorization:** UID hợp lệ + ACTIVE membership; votes còn cần ballot snapshot. 
- **Adapter:** request<WeatherSummary>(path,token,'GET',body).
- **Module → Firestore:** weather/checks + workers → weatherSnapshots; weatherChecks; groups/alerts; plans; outbox.
- **Request params/query:** /groups/:id/weather?mode=demo; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `query: {mode:'demo'|'live'}`.
- **Response:** `WeatherSummary` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. LEADER_REQUIRED (403) ở leader action; lỗi membership thường 404 để không lộ group.
- **Event thực do mutation phát:** Không có (GET không emit; caller tự refresh nếu mutation không phát event).. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** weather:updated 
- **Mock fixture:** weatherFixture.

**HTTP lỗi theo source operation này:** 400, 401, 403, 404, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Đọc WeatherSummary gồm hourly/source status.

Request body: không có.

Response shape minh họa (fixture):

```json
{
  "demo": true,
  "fetchedAt": "2026-11-11T08:00:00.000Z",
  "confidenceText": "DEMO · Các con số là kịch bản giao diện, không phải thời tiết trực tiếp.",
  "providers": [
    {
      "provider": "Open-Meteo",
      "status": "OK",
      "fetchedAt": "2026-11-11T08:00:00.000Z",
      "message": "DEMO · Nguồn mô phỏng, không gọi nhà cung cấp."
    },
    {
      "provider": "WeatherAPI",
      "status": "OK",
      "fetchedAt": "2026-11-11T08:00:00.000Z",
      "message": "DEMO · Nguồn mô phỏng, không gọi nhà cung cấp."
    },
    {
      "provider": "Tomorrow.io",
      "status": "OK",
      "fetchedAt": "2026-11-11T08:00:00.000Z",
      "message": "DEMO · Nguồn mô phỏng, không gọi nhà cung cấp."
    }
  ],
  "slots": [
    {
      "time": "2026-11-10T23:00:00.000Z",
      "rainMmH": 0,
      "probabilityPct": 15,
      "temperatureC": 18,
      "windKmh": 9,
      "level": "NONE",
      "rainVotes": 0,
      "validSources": 3,
      "providers": [
        {
          "provider": "Open-Meteo",
          "rainMmH": 0,
          "probabilityPct": 15,
          "risk": false,
          "usable": true
        },
        {
          "provider": "WeatherAPI",
          "rainMmH": 0,
          "probabilityPct": 15,
          "risk": false,
          "usable": true
        },
        {
          "provider": "Tomorrow.io",
          "rainMmH": 0,
          "probabilityPct": 15,
          "risk": false,
          "usable": true
        }
      ]
    }
  ],
  "rainWindows": []
}
```

### POST /groups/:id/weather/check

- **Mục đích / route:** weather.
- **Status hiện tại:** Existing but requires migration. Có handler [app.ts:719](../../apps/server/src/app.ts#L719); target cần port weather/checks + workers.
- **Auth/authorization:** UID hợp lệ + ACTIVE membership; votes còn cần ballot snapshot. 
- **Adapter:** request<{weather:WeatherSummary;alert:Alert|null;proposal:Plan|null}>(path,token,'POST',body).
- **Module → Firestore:** weather/checks + workers → weatherSnapshots; weatherChecks; groups/alerts; plans; outbox.
- **Request params/query:** /groups/:id/weather/check; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `{mode:'demo'|'live'}`.
- **Response:** `{weather:WeatherSummary;alert:Alert|null;proposal:Plan|null}` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. LEADER_REQUIRED (403) ở leader action; lỗi membership thường 404 để không lộ group.
- **Event thực do mutation phát:** weather:updated, alert:created, plan:created, activity:created, notification:created. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** weather:updated, alert:created, plan:created Danh sách từ frontend/mock có thể rộng hơn producer SQL; phần bổ sung là target cần implementation, xem C22.
- **Mock fixture:** weatherFixture + state.alerts.

**HTTP lỗi theo source operation này:** 400, 401, 403, 404, 409, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Member yêu cầu kiểm tra mưa; service có thể tạo proposal thay actual leader.

Request body minh họa:

```json
{
  "mode": "demo"
}
```

Response shape minh họa (fixture):

```json
{
  "weather": {
    "demo": true,
    "fetchedAt": "2026-11-11T08:00:00.000Z",
    "confidenceText": "DEMO · Các con số là kịch bản giao diện, không phải thời tiết trực tiếp.",
    "providers": [
      {
        "provider": "Open-Meteo",
        "status": "OK",
        "fetchedAt": "2026-11-11T08:00:00.000Z",
        "message": "DEMO · Nguồn mô phỏng, không gọi nhà cung cấp."
      },
      {
        "provider": "WeatherAPI",
        "status": "OK",
        "fetchedAt": "2026-11-11T08:00:00.000Z",
        "message": "DEMO · Nguồn mô phỏng, không gọi nhà cung cấp."
      },
      {
        "provider": "Tomorrow.io",
        "status": "OK",
        "fetchedAt": "2026-11-11T08:00:00.000Z",
        "message": "DEMO · Nguồn mô phỏng, không gọi nhà cung cấp."
      }
    ],
    "slots": [
      {
        "time": "2026-11-10T23:00:00.000Z",
        "rainMmH": 0,
        "probabilityPct": 15,
        "temperatureC": 18,
        "windKmh": 9,
        "level": "NONE",
        "rainVotes": 0,
        "validSources": 3,
        "providers": [
          {
            "provider": "Open-Meteo",
            "rainMmH": 0,
            "probabilityPct": 15,
            "risk": false,
            "usable": true
          },
          {
            "provider": "WeatherAPI",
            "rainMmH": 0,
            "probabilityPct": 15,
            "risk": false,
            "usable": true
          },
          {
            "provider": "Tomorrow.io",
            "rainMmH": 0,
            "probabilityPct": 15,
            "risk": false,
            "usable": true
          }
        ]
      }
    ],
    "rainWindows": []
  },
  "alert": null,
  "proposal": null
}
```

### POST /groups/:id/demo/rain

- **Mục đích / route:** dashboard, weather.
- **Status hiện tại:** Existing and verified. Có handler [app.ts:727](../../apps/server/src/app.ts#L727); target cần port weather/checks + workers.
- **Auth/authorization:** Firebase UID/JWT hợp lệ + ACTIVE LEADER trong group. 
- **Adapter:** request<{weather:WeatherSummary;alert:Alert;proposal:Plan}>(path,token,'POST',body).
- **Module → Firestore:** weather/checks + workers → weatherSnapshots; weatherChecks; groups/alerts; plans; outbox.
- **Request params/query:** /groups/:id/demo/rain; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `none`.
- **Response:** `{weather:WeatherSummary;alert:Alert;proposal:Plan}` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. LEADER_REQUIRED (403) ở leader action; lỗi membership thường 404 để không lộ group.
- **Event thực do mutation phát:** weather:updated, alert:created, plan:created, activity:created, notification:created. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** weather:updated, alert:created, plan:created, notification:created Danh sách từ frontend/mock có thể rộng hơn producer SQL; phần bổ sung là target cần implementation, xem C22.
- **Mock fixture:** MockDataAdapter.rain.

**HTTP lỗi theo source operation này:** 400, 401, 403, 404, 409, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Leader giả lập mưa trong DEMO; không tự apply.

Request body: không có.

Response shape minh họa (fixture):

```json
{
  "weather": {
    "demo": true,
    "fetchedAt": "2026-11-11T08:00:00.000Z",
    "confidenceText": "DEMO · Các con số là kịch bản giao diện, không phải thời tiết trực tiếp.",
    "providers": [
      {
        "provider": "Open-Meteo",
        "status": "OK",
        "fetchedAt": "2026-11-11T08:00:00.000Z",
        "message": "DEMO · Nguồn mô phỏng, không gọi nhà cung cấp."
      },
      {
        "provider": "WeatherAPI",
        "status": "OK",
        "fetchedAt": "2026-11-11T08:00:00.000Z",
        "message": "DEMO · Nguồn mô phỏng, không gọi nhà cung cấp."
      },
      {
        "provider": "Tomorrow.io",
        "status": "OK",
        "fetchedAt": "2026-11-11T08:00:00.000Z",
        "message": "DEMO · Nguồn mô phỏng, không gọi nhà cung cấp."
      }
    ],
    "slots": [
      {
        "time": "2026-11-10T23:00:00.000Z",
        "rainMmH": 0,
        "probabilityPct": 15,
        "temperatureC": 18,
        "windKmh": 9,
        "level": "NONE",
        "rainVotes": 0,
        "validSources": 3,
        "providers": [
          {
            "provider": "Open-Meteo",
            "rainMmH": 0,
            "probabilityPct": 15,
            "risk": false,
            "usable": true
          },
          {
            "provider": "WeatherAPI",
            "rainMmH": 0,
            "probabilityPct": 15,
            "risk": false,
            "usable": true
          },
          {
            "provider": "Tomorrow.io",
            "rainMmH": 0,
            "probabilityPct": 15,
            "risk": false,
            "usable": true
          }
        ]
      }
    ],
    "rainWindows": []
  },
  "alert": {
    "id": "alert",
    "groupId": "mock-dalat",
    "message": "DEMO rain scenario",
    "demo": true,
    "planId": "mock-pending",
    "createdAt": "2026-11-11T08:00:00.000Z",
    "status": "OPEN"
  },
  "proposal": {
    "id": "mock-pending",
    "groupId": "mock-dalat",
    "tripContext": {
      "cityId": "dalat",
      "tripDate": "2026-11-11",
      "startHour": 8,
      "endHour": 20,
      "budgetPerPersonVnd": 500000
    },
    "version": 3,
    "basePlanId": "mock-approved",
    "kind": "RAIN_CHANGE",
    "status": "VOTING",
    "engine": "RULE_BASED",
    "demo": true,
    "summary": "DEMO · Phương án mẫu để kiểm tra timeline, bản đồ và biểu quyết. Không phải đầu ra AI thật.",
    "items": [
      {
        "id": "mock-pending-stop-1",
        "placeId": "dalat-03",
        "place": {
          "id": "dalat-03",
          "cityId": "dalat",
          "name": "Bảo tàng Lâm Đồng",
          "category": "Văn hóa",
          "environment": "INDOOR",
          "latitude": 11.9405756,
          "longitude": 108.4599038,
          "sourceUrl": "https://www.openstreetmap.org/node/1152350875",
          "sourceId": "node/1152350875",
          "coordinateKind": "OSM_NODE",
          "sourceTimestamp": "2026-11-10T05:57:04Z",
          "description": "Bảo tàng Lâm Đồng — không gian bảo tàng để tìm hiểu văn hóa và lịch sử địa phương. Marker sử dụng tọa độ điểm do cộng đồng OSM ghi nhận. Kiểm tra thông tin tiếp cận và hoạt động trước khi đến.",
          "visitorInfo": {
            "entranceFeeVnd": null,
            "openingHours": "Mo-Su 07:15-11:30, 13:30-17:00",
            "visitDurationMin": null,
            "environmentEstimated": true,
            "verifiedAt": null
          },
          "geographyVerified": true,
          "dataQuality": "OSM_SOURCE_WITH_UNKNOWN_VISITOR_INFO",
          "priceVnd": 0,
          "durationMin": 60,
          "openHour": 8,
          "closeHour": 20,
          "imageUrl": "https://images.unsplash.com/photo-1564399579883-451a5d44ec08?auto=format&fit=crop&w=640&q=75"
        },
        "position": 0,
        "startTime": "2026-11-11T01:00:00.000Z",
        "endTime": "2026-11-11T02:00:00.000Z",
        "travelMin": 0,
        "costVnd": 0,
        "reason": "DEMO · Điểm dừng trong kịch bản thử giao diện. Thời lượng và di chuyển là giả định; giá vé chưa biết.",
        "factIds": [
          "https://www.openstreetmap.org/node/1152350875"
        ]
      }
    ],
    "totalCostVnd": 0,
    "totalDurationMin": 60,
    "totalTravelMin": 0,
    "unknownCostCount": 1,
    "yesVotes": 1,
    "noVotes": 0,
    "eligibleCount": 3,
    "requiredYesVotes": 2,
    "myVote": null,
    "deadline": "2026-11-11T08:30:00.000Z",
    "createdAt": "2026-11-11T08:00:00.000Z"
  }
}
```

### GET /groups/:id/alerts

- **Mục đích / route:** alerts, weather.
- **Status hiện tại:** Existing but requires migration. Có handler [app.ts:751](../../apps/server/src/app.ts#L751); target cần port weather/alerts.
- **Auth/authorization:** UID hợp lệ + ACTIVE membership; votes còn cần ballot snapshot. 
- **Adapter:** request<Alert[]>(path,token,'GET',body).
- **Module → Firestore:** weather/alerts → groups/{gid}/alerts/{aid}; uniqueKeys.
- **Request params/query:** /groups/:id/alerts; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `path id: string`.
- **Response:** `Alert[]` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. LEADER_REQUIRED (403) ở leader action; lỗi membership thường 404 để không lộ group.
- **Event thực do mutation phát:** Không có (GET không emit; caller tự refresh nếu mutation không phát event).. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** alert:created 
- **Mock fixture:** state.alerts.

**HTTP lỗi theo source operation này:** 401, 404, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Đọc alerts của group.

Request body: không có.

Response shape minh họa (fixture):

```json
[
  {
    "id": "alert",
    "groupId": "mock-dalat",
    "message": "DEMO rain change",
    "demo": true,
    "planId": "mock-pending",
    "createdAt": "2026-11-11T08:00:00.000Z",
    "status": "OPEN"
  }
]
```

### GET /radar

- **Mục đích / route:** radar, map.
- **Status hiện tại:** Existing but requires migration. Có handler [app.ts:821](../../apps/server/src/app.ts#L821); target cần port weather/radar.
- **Auth/authorization:** Chính user đã xác thực; notifications chỉ owner. 
- **Adapter:** request<RadarData>(path,token,'GET',body).
- **Module → Firestore:** weather/radar → Provider metadata/cache; không có fake radar collection.
- **Request params/query:** /radar; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `none`.
- **Response:** `RadarData` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. RADAR_UNAVAILABLE (502).
- **Event thực do mutation phát:** Không có (GET không emit; caller tự refresh nếu mutation không phát event).. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** Không có event bắt buộc; update/refetch theo response. 
- **Mock fixture:** explicit no-observation fixture.

**HTTP lỗi theo source operation này:** 401, 429, 500, 502. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Lấy metadata radar quá khứ có allowlist, không dự báo.

Request body: không có.

Response shape minh họa (fixture):

```json
{
  "host": "https://tilecache.rainviewer.com",
  "frames": [],
  "maxZoom": 7,
  "attribution": "© RainViewer",
  "coverageUrl": "https://www.rainviewer.com/coverage.html"
}
```

### POST /groups/:id/rain-reports

- **Mục đích / route:** rainReport.
- **Status hiện tại:** Existing and verified. Có handler [app.ts:734](../../apps/server/src/app.ts#L734); target cần port weather/reports.
- **Auth/authorization:** UID hợp lệ + ACTIVE membership; votes còn cần ballot snapshot. 
- **Adapter:** request<{id:string;verified:boolean;message:string}>(path,token,'POST',body).
- **Module → Firestore:** weather/reports → rainReports; weatherChecks.
- **Request params/query:** /groups/:id/rain-reports; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `{latitude:number;longitude:number;accuracyM:number;condition:'RAIN'|'DRY';observedAt?:string}`.
- **Response:** `{id:string;verified:boolean;message:string}` (interfaces bên dưới); HTTP 201 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. LEADER_REQUIRED (403) ở leader action; lỗi membership thường 404 để không lộ group.
- **Event thực do mutation phát:** weather:updated. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** activity:created Danh sách từ frontend/mock có thể rộng hơn producer SQL; phần bổ sung là target cần implementation, xem C22.
- **Mock fixture:** MockDataAdapter rain-reports.

**HTTP lỗi theo source operation này:** 400, 401, 404, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Gửi quan sát vị trí có kiểm GPS/time/membership.

Request body minh họa:

```json
{
  "latitude": 11.9404,
  "longitude": 108.4583,
  "accuracyM": 20,
  "condition": "RAIN",
  "observedAt": "2026-11-11T08:00:00.000Z"
}
```

Response shape minh họa (fixture):

```json
{
  "id": "report",
  "verified": false,
  "message": "DEMO; not actual verification"
}
```

### GET /groups/:id/verification

- **Mục đích / route:** verification.
- **Status hiện tại:** Existing and verified. Có handler [app.ts:766](../../apps/server/src/app.ts#L766); target cần port weather/verification.
- **Auth/authorization:** UID hợp lệ + ACTIVE membership; votes còn cần ballot snapshot. 
- **Adapter:** request<Verification>(path,token,'GET',body).
- **Module → Firestore:** weather/verification → forecastVerifications; rainReports; weatherChecks.
- **Request params/query:** /groups/:id/verification; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `path id: string`.
- **Response:** `Verification` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. LEADER_REQUIRED (403) ở leader action; lỗi membership thường 404 để không lộ group.
- **Event thực do mutation phát:** Không có (GET không emit; caller tự refresh nếu mutation không phát event).. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** Không có event bắt buộc; update/refetch theo response. 
- **Mock fixture:** explicit no-verification fixture.

**HTTP lỗi theo source operation này:** 401, 404, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Đọc thống kê kiểm chứng thật; chưa có evidence thì accuracy null.

Request body: không có.

Response shape minh họa (fixture):

```json
{
  "verified": 0,
  "correct": 0,
  "incorrect": 0,
  "unknown": 0,
  "accuracyPct": null,
  "note": "No actual verification in mock mode."
}
```

### GET /groups/:id/comments

- **Mục đích / route:** placeDetail, planItem, proposal, vote.
- **Status hiện tại:** Existing and verified. Có handler [app.ts:629](../../apps/server/src/app.ts#L629); target cần port collaboration/comments.
- **Auth/authorization:** UID hợp lệ + ACTIVE membership; votes còn cần ballot snapshot. 
- **Adapter:** request<Comment[]>(path,token,'GET',body).
- **Module → Firestore:** collaboration/comments → comments; groups/members; wishlist/plans.
- **Request params/query:** /groups/:id/comments?placeId=:placeId; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `query: {placeId:string} XOR {planId:string}`.
- **Response:** `Comment[]` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. LEADER_REQUIRED (403) ở leader action; lỗi membership thường 404 để không lộ group.
- **Event thực do mutation phát:** Không có (GET không emit; caller tự refresh nếu mutation không phát event).. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** comment:created, comment:updated, comment:deleted 
- **Mock fixture:** state.comments.

**HTTP lỗi theo source operation này:** 400, 401, 404, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Đọc comments chưa bị xóa của đúng một target.

Request body: không có.

Response shape minh họa (fixture):

```json
[
  {
    "id": "mock-comment",
    "groupId": "mock-dalat",
    "userId": "mock-member",
    "userName": "Hoàng Nam",
    "avatarColor": "#597BA1",
    "placeId": "dalat-01",
    "planId": null,
    "content": "DEMO · Mình muốn ghé hồ vào buổi sáng!",
    "createdAt": "2026-11-11T08:00:00.000Z",
    "editedAt": null
  }
]
```

### POST /groups/:id/comments

- **Mục đích / route:** placeDetail, proposal, vote.
- **Status hiện tại:** Existing and verified. Có handler [app.ts:645](../../apps/server/src/app.ts#L645); target cần port collaboration/comments.
- **Auth/authorization:** UID hợp lệ + ACTIVE membership; votes còn cần ballot snapshot. 
- **Adapter:** request<Comment>(path,token,'POST',body).
- **Module → Firestore:** collaboration/comments → comments; groups/members; wishlist/plans.
- **Request params/query:** /groups/:id/comments; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `{content:string} & ({placeId:string} | {planId:string}) [exactly one target]`.
- **Response:** `Comment` (interfaces bên dưới); HTTP 201 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. LEADER_REQUIRED (403) ở leader action; lỗi membership thường 404 để không lộ group.
- **Event thực do mutation phát:** comment:created. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** comment:created, activity:created Danh sách từ frontend/mock có thể rộng hơn producer SQL; phần bổ sung là target cần implementation, xem C22.
- **Mock fixture:** state.comments.

**HTTP lỗi theo source operation này:** 400, 401, 404, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Thêm comment tới target hợp lệ.

Request body minh họa:

```json
{
  "content": "Meet at 8?",
  "placeId": "dalat-01"
}
```

Response shape minh họa (fixture):

```json
{
  "id": "mock-comment",
  "groupId": "mock-dalat",
  "userId": "mock-member",
  "userName": "Hoàng Nam",
  "avatarColor": "#597BA1",
  "placeId": "dalat-01",
  "planId": null,
  "content": "DEMO · Mình muốn ghé hồ vào buổi sáng!",
  "createdAt": "2026-11-11T08:00:00.000Z",
  "editedAt": null
}
```

### PATCH /comments/:id

- **Mục đích / route:** placeDetail, proposal, vote.
- **Status hiện tại:** Existing but requires migration. Có handler [app.ts:670](../../apps/server/src/app.ts#L670); target cần port collaboration/comments.
- **Auth/authorization:** ACTIVE membership + author của comment. 
- **Adapter:** request<Comment>(path,token,'PATCH',body).
- **Module → Firestore:** collaboration/comments → comments/{cid}; groups/members.
- **Request params/query:** /comments/:id; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `{content:string}`.
- **Response:** `Comment` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. Các lỗi chung; không giả định luôn có code.
- **Event thực do mutation phát:** comment:updated. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** comment:updated Danh sách từ frontend/mock có thể rộng hơn producer SQL; phần bổ sung là target cần implementation, xem C22.
- **Mock fixture:** state.comments.

**HTTP lỗi theo source operation này:** 400, 401, 403, 404, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Author đang là member sửa comment.

Request body minh họa:

```json
{
  "content": "Meet at 9?"
}
```

Response shape minh họa (fixture):

```json
{
  "id": "mock-comment",
  "groupId": "mock-dalat",
  "userId": "mock-member",
  "userName": "Hoàng Nam",
  "avatarColor": "#597BA1",
  "placeId": "dalat-01",
  "planId": null,
  "content": "Meet at 9?",
  "createdAt": "2026-11-11T08:00:00.000Z",
  "editedAt": "2026-11-11T08:00:00.000Z"
}
```

### DELETE /comments/:id

- **Mục đích / route:** placeDetail, proposal, vote.
- **Status hiện tại:** Existing but requires migration. Có handler [app.ts:693](../../apps/server/src/app.ts#L693); target cần port collaboration/comments.
- **Auth/authorization:** ACTIVE membership + author của comment. 
- **Adapter:** request<{ok:true}>(path,token,'DELETE',body).
- **Module → Firestore:** collaboration/comments → comments/{cid}; groups/members.
- **Request params/query:** /comments/:id; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `path id: string`.
- **Response:** `{ok:true}` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. Các lỗi chung; không giả định luôn có code.
- **Event thực do mutation phát:** comment:deleted. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** comment:deleted Danh sách từ frontend/mock có thể rộng hơn producer SQL; phần bổ sung là target cần implementation, xem C22.
- **Mock fixture:** state.comments.

**HTTP lỗi theo source operation này:** 401, 403, 404, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Author soft-delete comment.

Request body: không có.

Response shape minh họa (fixture):

```json
{
  "ok": true
}
```

### GET /notifications

- **Mục đích / route:** notifications, notificationDetail, home.
- **Status hiện tại:** Existing but requires migration. Có handler [app.ts:794](../../apps/server/src/app.ts#L794); target cần port collaboration/notifications.
- **Auth/authorization:** Chính user đã xác thực; notifications chỉ owner. 
- **Adapter:** request<Notification[]>(path,token,'GET',body).
- **Module → Firestore:** collaboration/notifications → users/{uid}/notifications/{nid}.
- **Request params/query:** /notifications; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `none`.
- **Response:** `Notification[]` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. Các lỗi chung; không giả định luôn có code.
- **Event thực do mutation phát:** Không có (GET không emit; caller tự refresh nếu mutation không phát event).. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** notification:created 
- **Mock fixture:** state.notifications filtered by userId.

**HTTP lỗi theo source operation này:** 401, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Đọc thông báo riêng caller.

Request body: không có.

Response shape minh họa (fixture):

```json
[
  {
    "id": "mock-notice-mock-leader",
    "groupId": "mock-dalat",
    "title": "Nhóm đang chờ ý kiến của bạn",
    "message": "DEMO · Một phương án đang chờ biểu quyết.",
    "type": "PLAN",
    "readAt": null,
    "createdAt": "2026-11-11T08:00:00.000Z",
    "planId": "mock-pending"
  }
]
```

### PATCH /notifications/:id/read

- **Mục đích / route:** notifications, notificationDetail.
- **Status hiện tại:** Existing but requires migration. Có handler [app.ts:807](../../apps/server/src/app.ts#L807); target cần port collaboration/notifications.
- **Auth/authorization:** Chính user đã xác thực; notifications chỉ owner. 
- **Adapter:** request<Notification>(path,token,'PATCH',body).
- **Module → Firestore:** collaboration/notifications → users/{uid}/notifications/{nid}.
- **Request params/query:** /notifications/:id/read; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `path id: string`.
- **Response:** `Notification` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. Các lỗi chung; không giả định luôn có code.
- **Event thực do mutation phát:** Không có (GET không emit; caller tự refresh nếu mutation không phát event).. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** Không có event bắt buộc; update/refetch theo response. Danh sách từ frontend/mock có thể rộng hơn producer SQL; phần bổ sung là target cần implementation, xem C22.
- **Mock fixture:** state.notifications current user only.

**HTTP lỗi theo source operation này:** 401, 404, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Owner đánh dấu read idempotent.

Request body: không có.

Response shape minh họa (fixture):

```json
{
  "id": "mock-notice-mock-leader",
  "groupId": "mock-dalat",
  "title": "Nhóm đang chờ ý kiến của bạn",
  "message": "DEMO · Một phương án đang chờ biểu quyết.",
  "type": "PLAN",
  "readAt": "2026-11-11T08:00:00.000Z",
  "createdAt": "2026-11-11T08:00:00.000Z",
  "planId": "mock-pending"
}
```

### GET /groups/:id/activity

- **Mục đích / route:** activity.
- **Status hiện tại:** Existing and verified. Có handler [app.ts:774](../../apps/server/src/app.ts#L774); target cần port collaboration/activity.
- **Auth/authorization:** UID hợp lệ + ACTIVE membership; votes còn cần ballot snapshot. 
- **Adapter:** request<Activity[]>(path,token,'GET',body).
- **Module → Firestore:** collaboration/activity → groups/{gid}/activity/{aid}.
- **Request params/query:** /groups/:id/activity; :id/:placeId là ID được kiểm quyền; không nhận userId/role để tin làm authority.
- **Request type:** `path id: string`.
- **Response:** `Activity[]` (interfaces bên dưới); HTTP 200 cho thao tác thành công hiện tại, xem handler nếu là operation mới.
- **Errors:** 400/401/403/404/409/429/500 tùy validation/quyền; không phải mọi code đều dùng ở operation này. LEADER_REQUIRED (403) ở leader action; lỗi membership thường 404 để không lộ group.
- **Event thực do mutation phát:** Không có (GET không emit; caller tự refresh nếu mutation không phát event).. Các event có điều kiện tùy kết quả; đây không phải lời hứa mọi request đều phát mọi event.
- **View/target cần subscribe hoặc invalidate:** activity:created 
- **Mock fixture:** state.activity[groupId].

**HTTP lỗi theo source operation này:** 401, 404, 429, 500. Error code cụ thể xem nhánh service và quy ước chung; không hứa mọi message có code.

**Chức năng:** Đọc activity history được backend lưu.

Request body: không có.

Response shape minh họa (fixture):

```json
[
  {
    "id": "mock-activity",
    "action": "GROUP_CREATED",
    "message": "DEMO · Nhóm ba thành viên và các phương án mẫu đã sẵn sàng.",
    "createdAt": "2026-11-11T08:00:00.000Z"
  }
]
```

## TypeScript đúng với frontend hiện tại

Đây là snapshot tự sinh từ source, không phải bộ type viết lại cho Firestore. Khi thay type phải cập nhật source/contract và regenerate cùng PR. Firestore DB model ở Database plan khác wire DTO ở chỗ Timestamp và references.

```ts
export type User = {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
};
export type City = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  imageUrl: string;
};
export type Place = {
  id: string;
  cityId: string;
  name: string;
  category: string;
  environment: "INDOOR" | "OUTDOOR";
  latitude: number;
  longitude: number;
  priceVnd: number;
  durationMin: number;
  openHour: number;
  closeHour: number;
  imageUrl: string;
  description: string;
  dataQuality?: string;
  geographyVerified?: boolean;
  sourceUrl?: string;
  visitorInfo?: {
    entranceFeeVnd: number | null;
    openingHours: string | null;
    visitDurationMin: number | null;
    environmentEstimated: boolean;
    verifiedAt: string | null;
  };
};
export type Group = {
  id: string;
  name: string;
  cityId: string;
  cityName: string;
  tripDate: string;
  startHour: number;
  endHour: number;
  budgetPerPersonVnd: number;
  inviteCode: string;
  currentPlanId: string | null;
  memberCount: number;
  role: "LEADER" | "MEMBER";
  mode: "DEMO" | "LIVE";
  revision: number;
};
export type Member = User & { role: "LEADER" | "MEMBER" };
export type PlanItem = {
  id: string;
  placeId: string;
  place: Place;
  position: number;
  startTime: string;
  endTime: string;
  travelMin: number;
  costVnd: number;
  reason: string;
  factIds: string[];
};
export type Plan = {
  id: string;
  groupId: string;
  tripContext?: { cityId: string; tripDate: string; startHour: number; endHour: number; budgetPerPersonVnd: number };
  totalDurationMin?: number;
  totalTravelMin?: number;
  unknownCostCount?: number;
  route?: { kind: 'STRAIGHT_LINE'; straightLineKm: number; unmappedPlaceIds: string[]; travelTimePolicy: string };
  version: number;
  basePlanId: string | null;
  kind: "INITIAL" | "RAIN_CHANGE" | "MANUAL_CHANGE";
  status: "DRAFT" | "VOTING" | "APPROVED" | "REJECTED" | "EXPIRED" | "STALE";
  engine: "LLM" | "RULE_BASED";
  demo: boolean;
  summary: string;
  items: PlanItem[];
  totalCostVnd: number;
  yesVotes: number;
  noVotes: number;
  eligibleCount: number;
  requiredYesVotes: number;
  myVote: "YES" | "NO" | null;
  deadline: string;
  createdAt: string;
};
export type GroupDetail = {
  group: Group;
  members: Member[];
  wishlist: Place[];
  plans: Plan[];
  currentPlan: Plan | null;
};
export type Comment = {
  id: string;
  groupId: string;
  userId: string;
  userName: string;
  avatarColor: string;
  placeId: string | null;
  planId: string | null;
  content: string;
  createdAt: string;
  editedAt: string | null;
};
export type ProviderStatus = {
  provider: string;
  status: "OK" | "MISSING" | "ERROR" | "STALE";
  fetchedAt: string | null;
  message: string;
};
export type WeatherSlot = {
  time: string;
  rainMmH: number | null;
  probabilityPct: number | null;
  temperatureC?: number | null;
  windKmh?: number | null;
  level: "NONE" | "LIGHT" | "MODERATE" | "HEAVY" | "UNKNOWN";
  rainVotes: number;
  validSources: number;
  providers: {
    provider: string;
    rainMmH: number | null;
    probabilityPct: number | null;
    risk: boolean;
    usable: boolean;
  }[];
};
export type WeatherSummary = {
  demo: boolean;
  fetchedAt: string;
  providers: ProviderStatus[];
  slots: WeatherSlot[];
  rainWindows: { start: string; end: string; rainVotes: number }[];
  confidenceText: string;
};
export type Alert = {
  id: string;
  groupId: string;
  message: string;
  demo: boolean;
  planId: string | null;
  createdAt: string;
  status: string;
};
export type Notification = {
  id: string;
  groupId: string | null;
  title: string;
  message: string;
  type: string;
  readAt: string | null;
  createdAt: string;
  planId: string | null;
};
export type Verification = {
  verified: number;
  correct: number;
  incorrect: number;
  unknown: number;
  accuracyPct: number | null;
  note: string;
};
export type Activity = {
  id: string;
  action: string;
  message: string;
  createdAt: string;
};
export type RadarData = {
  host: string;
  frames: { time: number; path: string }[];
  maxZoom: number;
  attribution: string;
  coverageUrl: string;
};
export type RouteName =
  | "login"
  | "register"
  | "forgotPassword"
  | "changePassword"
  | "groupPreferences"
  | "alerts"
  | "notificationDetail"
  | "home"
  | "groups"
  | "createGroup"
  | "joinGroup"
  | "dashboard"
  | "members"
  | "invite"
  | "discover"
  | "map"
  | "recommendations"
  | "itineraryMap"
  | "filters"
  | "placeDetail"
  | "wishlist"
  | "timeline"
  | "planItem"
  | "proposal"
  | "vote"
  | "history"
  | "weather"
  | "hourly"
  | "providers"
  | "radar"
  | "rainReport"
  | "verification"
  | "notifications"
  | "budget"
  | "activity"
  | "aiSetup"
  | "profile"
  | "editProfile"
  | "settings"
  | "help";
export type Route = { name: RouteName; id?: string };
export type DiscoveryInput = {
  cityId: string; tripDate: string; budgetPerPersonVnd: number; categories: string[];
  environmentPreference: 'ANY' | 'INDOOR' | 'OUTDOOR'; travelStyles: string[];
  durationHours: number; startHour: number; preferredPlaceIds: string[]; groupId: string | null;
  mode: 'live' | 'demo'; limit: number;
};
export type Recommendation = {
  placeId: string; rank: number; reason: string; preferenceReasons: string[]; weatherExplanation: string;
  weather: { status: 'RISK' | 'UNKNOWN' | 'SUITABLE'; explanation: string; adverse: boolean; missing: boolean; temperatureAvailable: boolean; windAvailable: boolean; fetchedAt: string; demo: boolean; slots: { time: string; rainMmH: number | null; probabilityPct: number | null; validSources: number; rainVotes: number; temperatureC: number | null; windKmh: number | null }[] };
  budgetStatus: 'SOURCE_RECORDED' | 'UNKNOWN'; missingInformation: string[];
  visit: { startMinute: number; endMinute: number; durationMin: number; travelFromCityMin: number; estimated: boolean };
  distanceFromCityKm: number; factIds: string[]; facts: Record<string, unknown>; place: Place; alternativePlaceIds: string[];
};
export type RecommendationResult = {
  requestId: string; engine: 'LLM' | 'RULE_BASED'; demo: boolean; model: string | null; fallbackReason: string | null;
  cityId: string; groupId: string | null; input: DiscoveryInput; recommendations: Recommendation[]; candidateCount: number;
  groupPreferenceCount: number; weather: WeatherSummary; generatedAt: string; cached: boolean; warnings: string[];
  weatherAlternatives?: { engine: 'RULE_BASED'; outsideFilters: boolean; recommendations: Recommendation[] };
};

/** The transport seam shared by existing Phase 1/2 screens and new screens. */
export type DataSource = 'mock' | 'api';
export type MockScenario = 'normal' | 'empty' | 'offline' | 'expired' | 'missing-weather' | 'rain-change' | 'slow';
export type ConnectionState = 'local' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
export type DataEvent = { name: string; groupId?: string; payload?: unknown };
export type SubscriptionOptions = {
  token: string;
  groupId: string | null;
  onEvent: (event: DataEvent) => void;
  onStatus: (state: ConnectionState) => void;
};
export type DataSubscription = {
  close: () => void;
  typing: (target: { placeId?: string; planId?: string; typing: boolean }) => void;
};
export interface DataAdapter {
  readonly source: DataSource;
  request<T>(path: string, token: string | null, method?: string, body?: unknown, timeoutMs?: number, signal?: AbortSignal): Promise<T>;
  subscribe(options: SubscriptionOptions): DataSubscription;
}
export type Preferences = { categories: string[]; environmentPreference: 'ANY' | 'INDOOR' | 'OUTDOOR'; travelStyles: string[] };
export type AuthResult = { token: string; user: import('../../types').User };
export type AuthInput = { name?: string; email: string; password: string };
export type PasswordResetInput = { email: string };
export type ChangePasswordInput = { currentPassword: string; newPassword: string };
export type ActionResult = { ok: true; message: string };
export class DataError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) { super(message); this.name = 'DataError'; }
}

```

## Socket contract

Handshake auth:{token}; group:join {groupId} → ACK {ok:boolean,error?:string}; group:leave {groupId}. Payload domain event chứa groupId (personal notification có thể không có). comment:typing chỉ một target, có typing:boolean; server thêm userId/userName, client expire sau 4 giây. Server kiểm membership/target/token; frontend reconnect join lại rồi refetch, không giả định đã nhận mọi event. Target outbox commit + publish không đổi tên event.

## Phạm vi xác minh

Các endpoint migration chưa chạy Firebase. LIVE OpenAI/weather và radar provider không được coi đã xác minh chỉ vì có fixture. Bằng chứng test thực, missing integrations và hạn chế nằm trong [VERIFICATION](VERIFICATION.md), [CONTRACT_CLARIFICATIONS](CONTRACT_CLARIFICATIONS.md).
