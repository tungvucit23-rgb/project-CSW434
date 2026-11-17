# Kế hoạch phát triển Backend

Owner: **Backend Developer**. Đích: port backend đang chạy sang Firebase Admin/Firestore, giữ API mà frontend đang dùng. Không tạo Express app mới hoặc copy planner sang frontend. [Hợp đồng và coverage](API_CONTRACT.md), [schema/quyền DB](DATABASE_DEVELOPMENT_PLAN.md), [quyết định kiến trúc](PROJECT_ARCHITECTURE.md) là đầu vào bắt buộc.

## Nền đang có

`app.ts` đã có 38 operation; `auth.ts` kiểm JWT/membership; `db.ts` hỗ trợ SQL transaction; `services.ts` xử lý vote/weather/worker; `store.ts` serialize; `recommendations.ts`, `planner.ts`, `travel-facts.ts`, `llm.ts` đã xử lý AI. Giữ các validator/pure functions và tests. Hai password operation và toàn bộ Firebase integration là công việc mới. Firebase chưa được cài/deploy trong Phase 4.

Thứ tự thực hiện: **1 → 2 → 3 → 4 → 5 → 7 → 6 → 8 → 9**. Có thể giữ các pure AI tests từ đầu; chỉ tích hợp AI dùng Firestore sau khi catalogue và weather đủ dữ kiện. Database có thể làm schema/emulator song song từ stage 1.

## Stage 1 — Foundation

**Mục tiêu:** chạy Express hiện tại với cấu trúc dễ thay persistence, không thay payload.

**Việc làm:**

1. Đọc `config.ts`, `db.ts`, `auth.ts`, migration SQL và tests trước khi sửa. Tách dần `routes/`, `middleware/`, `services/`, `repositories/firestore/`, `serializers/`, `workers/`; không bắt buộc di chuyển tất cả file trong một PR.
2. Cài `firebase-admin` vào workspace server, pin phiên bản đã kiểm tra Node `engines` và commit lockfile trong PR implementation. Database owner cài/pin CLI/Rules testing riêng. Chưa có các package này trong repo hiện tại.
3. `config/firebase.ts` dùng Application Default Credentials ở cloud; local dùng file ngoài repo qua `GOOGLE_APPLICATION_CREDENTIALS`. Emulator dùng project `demo-di-chung` với hai host env chuẩn, không dùng key production.
4. Validate config lúc start; chặn emulator hosts/demo ở production; không âm thầm fallback SQL khi Firestore lỗi. Tách bootstrap SQL cũ khỏi Firebase startup và seed thành thao tác explicit.
5. Giữ CORS, Helmet, request-size limit, Zod, route wrapper/error mapping và Bearer parsing. Thêm request ID/timing, redact password/token/key; không log request body auth hoặc provider URL có key.
6. Giữ `GET /health` shape; `database` ở bản mới mô tả Firestore thật, không dùng mock success nếu DB lỗi. Lỗi readiness trả 5xx; không thêm envelope vào tất cả DTO.

**Endpoints:** `/health`, middleware `/api/*`. **Phụ thuộc:** Database chốt project/region/emulator/IAM; [ENV_SETUP](ENV_SETUP.md). **DoD:** server start fail rõ nếu cấu hình sai; health test thực đọc DB emulator; root/frontend contracts không thay đổi. **Deliverables:** bootstrap Firebase, repository interfaces, config validation, structured errors, tests; thứ tự config → repository seam → middleware → health.

## Stage 2 — Authentication

**Mục tiêu:** Firebase là nguồn danh tính duy nhất, backend chỉ tin ID token đã verify.

1. Thực hiện Auth provider và compatibility strategy trong [kiến trúc](PROJECT_ARCHITECTURE.md). Không gọi `createUser` của Admin như thể đó là password login.
2. Middleware `verifyIdToken(token, true)` → `uid`; lấy user profile và membership từ Firestore. Kiểm issuer/project, revoked/disabled account; không chấp nhận custom JWT cũ sau cutover. Phân biệt global account status với role của từng group.
3. Giữ POST `/auth/register`/`login` cho client cũ: gọi Firebase Auth REST bằng `FIREBASE_WEB_API_KEY` (biến **mới được đề xuất**), không persist/log password; trả `{token,user}` đúng DTO. Client SDK là luồng chính sau khi Frontend hoàn thành Auth provider; một lần login chỉ dùng một luồng.
4. Xử lý Auth-user/profile không thể commit chung một transaction: `ensureProfile(uid)` idempotent từ Auth record, không tin email/uid người dùng gửi. GET `/auth/me` có thể bootstrap profile thiếu của UID hợp lệ; PATCH upsert tên hợp lệ. Frontend SDK registration cập nhật displayName, gọi PATCH `/auth/me {name}` rồi nhận User; login dùng GET. Không xóa tài khoản Auth đã tồn tại chỉ vì một lần ghi profile lỗi; trả lỗi retry/re-login có thể phục hồi.
5. POST `/auth/forgot-password {email}`: đăng ký **trước** protected middleware vì là public route; response chung `{ok:true,message}` không tiết lộ account tồn tại; dùng Firebase email/action link + dịch vụ gửi email được cấu hình. Admin `generatePasswordResetLink` không tự gửi mail; nếu dùng Auth REST `sendOobCode`, kiểm domain/template và hành vi trong emulator. Database cấu hình provider/template, Backend sở hữu dispatch.
6. POST `/auth/change-password {currentPassword,newPassword}`: verify token, lấy email authoritative, reauthenticate bằng Firebase, so UID, đổi password, revoke refresh tokens; không gọi Admin updatePassword chỉ dựa trên `uid` client. Frontend sign-out/sign-in theo flow đã có. Không thêm refresh token vào AuthResult hiện tại.
7. Socket handshake/room join dùng cùng kiểm token; timer hết hạn disconnect, cập nhật token cần reconnect; cơ chế revoke quyền phải loại socket khỏi room. Không chỉ kiểm permission ở UI.

**Endpoints:** `/auth/demo`, `/auth/register`, `/auth/login`, GET/PATCH `/auth/me`, hai password endpoint. `/auth/demo` chỉ emulator/dev allowlisted persona, không tạo lối bỏ qua auth production.

**Phụ thuộc:** Database bật Email/Password, IAM; Frontend Auth persistence/refresh. **DoD:** token giả/sai project/hết hạn/revoked bị từ chối; profile bootstrap retry không nhân đôi; password reset không enumerate; không còn SQL hash path trong backend Firebase. **Deliverables:** middleware/auth service, compatibility handlers, password handlers, Auth emulator tests. Thứ tự verify → profile → login/register compatibility → password → socket auth.

## Stage 3 — Destinations

**Mục tiêu:** trả catalogue có nguồn và đủ dữ liệu cho map/AI mà giữ ID.

1. Dùng seed Database owner từ `dalat-catalog.ts`/`data/dalat-osm-sources.json` và export SQL có nguồn. Giữ 80 Đà Lạt hiển thị và 40 Vũng Tàu cũ; giữ record retired đang được lịch sử tham chiếu, không ép raw table phải có 80 row.
2. Viết city/place repositories và serializers. `geographyVerified` chỉ được true khi khớp dữ liệu có nguồn; không suy ra từ “lat/lon có giá trị”. Giữ unknown visitorInfo là null; các legacy `priceVnd/durationMin/openHour/closeHour` là giả định, không giá thực.
3. GET `/places`: giữ mảng đầy đủ theo city; repository đọc theo cursor nội bộ rồi ghép mảng. Cache catalogue nhỏ có TTL/invalidation. Không trả trang đầu hoặc đổi sang envelope mà adapter không biết.
4. Với q/filter, chọn lọc trên catalogue city nhỏ, normalize tên/category/city để hỗ trợ bỏ dấu. Firestore Standard không được xem là SQL ILIKE. Nếu cần search service/catalogue lớn, lập PR contract/adapter riêng trước; không cài thêm dịch vụ trả phí mặc định.
5. Kiểm latitude/longitude hữu hạn, range, source, cityId; chỉ vẽ/planning điểm có nguồn theo semantics hiện tại.

**Endpoints:** GET `/cities`, `/places`, `/places/:id`. **Phụ thuộc:** seeds/indexes/provenance từ Database. **DoD:** số ID/source coordinates đúng; lookup retired ID còn dùng được; search `ho xuan huong`, category, environment, không-result có test; không truncate. **Deliverables:** catalogue repository, serializer, cache, parity tests. Thứ tự cities → list/detail → filters/search → cache/page-internal.

## Stage 4 — Group Management

**Mục tiêu:** membership/permissions nhất quán và constraint snapshot được bảo toàn.

1. Create group transaction: group + leader membership + preferences mặc định + invite registry + activity/outbox. `role` trong response tính theo caller; không lưu leader view làm public group state.
2. Join bằng code chuẩn hóa uppercase; registry hash làm key uniqueness; kiểm expiry trong service, không dựa vào TTL xóa đúng giờ. Rejoin idempotent, không tăng memberCount lần hai hoặc tạo leader thứ hai.
3. GET group list dựa trên active membership query; group detail assemble members/wishlist/plans/currentPlan. Không thêm API members riêng nếu chưa cần.
4. GET/PATCH preferences chỉ của caller; category tên thực + environment/style enums; update prefs revision nội bộ để cache AI hết hiệu lực. Database owner định nghĩa index; Backend viết query và test.
5. PATCH group: leader, Zod và constraint checks; giữ SQL last-write-wins: expectedRevision lệch vẫn nhận và log overwrite, không tự thêm strict-CAS 409 theo mock. Rename tăng revision/log nhưng không stale. Constraint changes làm VOTING stale; đổi mode còn clear currentPlanId như SQL để không dùng plan DEMO cho LIVE. Các edit khác giữ pointer/lịch sử, không sửa plan đã duyệt.

**Endpoints:** GET/POST `/groups`, POST `/groups/join`, GET/PATCH `/groups/:id`, GET/PATCH `/groups/:id/preferences`.

**Phụ thuộc:** stage 2–3, schema groups/members/preferences/uniqueKeys. **DoD:** outsider/member sửa group bị chặn; simultaneous join không trùng; stale expectedRevision có overwrite audit đúng; budget/date/mode đổi làm stale đúng, mode clear pointer; currentPlanId phải cùng group. **Deliverables:** group repository/services, authorization matrix, tests transaction. Thứ tự create/read → join → preferences → updates.

## Stage 5 — Collaboration

**Mục tiêu:** chia sẻ wishlist/comments/activity/notifications và cập nhật lại client sau commit.

1. Wishlist natural key `(groupId,placeId)`, thêm idempotent, cùng city; bỏ khỏi wishlist không xóa lịch cũ.
2. Comment đúng một target; target place phải thuộc wishlist hoặc plan cùng group, plan phải thuộc group. Author + active member mới edit/delete; preserve soft-delete/timestamps. Serialize tên/avatar theo user hiện tại như SQL.
3. Notifications theo user, mark-read chỉ của owner; activity chỉ thành viên xem, backend ghi. Không trả UID/session/AI raw payload ngoài DTO.
4. Implement outbox commit cùng mutation, worker retry/idempotent fanout. Giữ room/event/ACK/typing contract. Personal notification emit sau khi notification document đã tồn tại. Client reconnect đọc lại REST; không coi event delivery exactly-once.
5. MVP một process. Nếu nhiều server: shared Socket adapter và lease/outbox worker bắt buộc trước scale; client không mở thêm Firestore listeners trùng.

**Endpoints:** wishlist GET/POST/DELETE; comments GET/POST/PATCH/DELETE; notifications GET/PATCH read; group activity GET. **Phụ thuộc:** stage 4, outbox và index collection-group Database. **DoD:** hai client thấy cùng state; không sửa comment người khác; disconnect/reconnect không mất state authoritative; event retry không tạo nhiều notification. **Deliverables:** repository/query, outbox publisher, socket lifecycle, realtime/auth tests. Thứ tự wishlist → comments → activity/notifs → transport/outbox.

## Stage 6 — AI Services

**Mục tiêu:** chuyển persistence của AI, giữ thuật toán/validator đã có.

1. Smart Discovery dùng cùng catalogue và group preferences, kiểm input constraint khớp group (409 `GROUP_CONSTRAINTS_CHANGED`) và preferred IDs (422). Discovery không tạo plan/wishlist.
2. Port repository calls khỏi `recommendations.ts`/`planner.ts`, giữ `travel-facts.ts`, Structured Outputs schema, whitelist fact IDs và semantic validation. Fact source/giờ/giá chưa biết vẫn unknown.
3. OpenAI call ở backend, bên ngoài transaction. Timeout call hiện 30 giây, discovery tối đa hai lần thử; giữ bounded retry/refusal/incomplete handling. Không tăng retry vô hạn hoặc log secret/prompt có PII không cần thiết.
4. Duy trì `LLM` khi model output vượt validator; lỗi/missing key trả phương án `RULE_BASED` có fallbackReason khi thuật toán thực tạo được. Không trả nội dung mock như AI thật. Nếu cả validator/fallback không hợp lệ thì trả lỗi, không bịa plan.
5. Planner snapshot constraints/basePlan trước generation; tại commit kiểm lại group/constraint, tạo version và electorate transaction. Lưu sanitized execution metadata cùng run/model/prompt version/validation result; discovery cá nhân có groupId null ở schema mới.
6. Giữ per-user rate limit, bound concurrency và cache có key input/prefs/catalogue/constraint/weather revision. Internal limits không phải provider quota. Shared limiter cần bổ sung trước multi-instance.

**Endpoints:** POST `/ai/recommendations`, POST `/groups/:id/plans/generate`, GET `/plans/:id`, GET `/groups/:id/plans`.

**Phụ thuộc:** stage 3–5 và 7; optional OpenAI key, không bắt buộc cho emulator tests. **DoD:** invalid JSON/foreign ID/fact/số liệu bịa bị chặn; missing weather không “suitable”; LLM HTTP contract/refusal/timeout/retry/fallback tests pass; không gọi paid model trong CI. **Deliverables:** AI repository ports, execution metadata, contract tests, retained schemas. Thứ tự facts/candidates → RULE_BASED parity → planner commit → LLM stub contract → explicit opt-in live verification.

## Stage 7 — Weather Services

**Mục tiêu:** cache/normalization/alerts chuyển Firestore mà không đổi nghĩa thời tiết.

1. Giữ Open-Meteo, WeatherAPI, Tomorrow.io connectors và khoảng thời gian normalization; không tự dùng metric thiếu thành zero. Provider missing key = MISSING; provider lỗi/stale giữ status có provenance.
2. Port weatherSnapshots/checks/check-sources/rainReports/verifications và internal quota reservation. Cache key provider + rounded location + live/demo isolation. Các giới hạn hour/day/rolling 31-day trong code là budget nội bộ; test boundary khi port, không đổi ngầm sang cửa sổ lịch.
3. Network I/O ngoài transaction, reserve budget atomically trước call. Worker lease/fencing, dedupe alert và request fan-in; retention/TTL không được xóa facts đang được plan/check tham chiếu mà chưa archive.
4. GET weather trả WeatherSummary (slots/providers/rainWindows); không tạo `/hourly` hoặc `/providers` khác. Check weather tạo alert/proposal đúng điều kiện nhưng không áp dụng lịch trước majority. Demo và live không lẫn trong cache/verification.
5. Radar chỉ metadata `radar.past`, host/path allowlist và attribution; API hiện maxZoom=7 là cấu hình code, không cam kết provider hiện tại. Nếu thiếu coverage/frame thì báo unavailable, không đổi thành “trời khô”.
6. Rain report cần GPS/observedAt/accuracy validation; verification chỉ dựa chứng cứ thật, demo không tính accuracy. Không hứa background push khi chưa có cấu hình.

**Endpoints:** GET weather; POST weather/check; POST demo/rain; GET alerts; GET radar; POST rain-reports; GET verification. **Phụ thuộc:** stage 4–5, schema/indexes, provider access optional. **DoD:** thiếu key/mạng/forecast không tạo dữ kiện giả; hai worker không phát alert trùng; weather change invalidate map cache qua event; historical radar != future forecast. **Deliverables:** repositories/cache/quota/worker/alerts, unit and emulator tests. Thứ tự normalization → snapshots/cache → quota → checks/reports → worker/radar.

## Stage 8 — Voting

**Mục tiêu:** đạt lại bảo đảm transaction SQL bằng Firestore transaction.

1. Ballot doc `plans/{pid}/votes/{uid}` được tạo với choice=null khi mở VOTING; nó xác định electorate. Người vào sau không được thêm ballot. Không tự vote giúp thành viên.
2. Trong transaction đọc group, plan, active member và ballot; kiểm trạng thái/deadline/basePlanId/constraints rồi update choice và counter theo delta. Unique doc key ngăn duplicate; đổi YES↔NO không tăng số cử tri.
3. `requiredYesVotes=floor(eligibleCount/2)+1`. Đủ YES → approve và cập nhật currentPlanId/revision cùng commit; NO vượt số còn có thể đạt majority → reject. Phương án cạnh tranh stale; currentPlanId luôn cùng group.
4. Callback có thể retry: không emit/gọi AI/notify bên trong. Muốn persist EXPIRED/STALE rồi trả 409 phải return outcome từ transaction và throw HTTP sau commit; không set status rồi throw ngay làm rollback.
5. Giữ deadline thực backend 30 phút, không dùng deadline 24h của mock. Không xóa electorate khi thành viên LEFT; quyền active vẫn kiểm và plan có thể hết hạn. Chi tiết trình tự đọc/ghi trong Database plan.

**Endpoints:** POST `/plans/:id/votes`, GET `/plans/:id`, GET group detail/history. **Phụ thuộc:** stage 4–7, schema ballots/counters/outbox và tests concurrency. **DoD:** hai phiếu đồng thời áp dụng đúng một lần; late voter bị 403; wrong base/constraint/deadline 409; zero/duplicate/switch vote và competing proposals có test; approved route không bị sửa client. **Deliverables:** transaction implementation + contention/security tests + parity với SQL. Thứ tự snapshot → vote delta → atomic apply → stale/expiry → event publish.

## Stage 9 — Integration & Testing

**Mục tiêu:** chứng minh backend Firestore thật hoạt động, không lấy mock tests làm bằng chứng.

1. Port 16 integration assertions hiện có sang Firestore emulator, giữ bản SQL để đối chiếu trước cutover. Thêm ID-token/revoked token, Rules client-denial, ownership, pagination completeness, outbox retry, replica/lease tests.
2. API DTO contract fixtures lấy từ [API_CONTRACT](API_CONTRACT.md), kiểm đúng enum/null/string-date/caller-specific fields. Đối chiếu [khác biệt đã audit](CONTRACT_CLARIFICATIONS.md); không “sửa” frontend để chấp nhận response sai hoặc áp quy tắc mock cho backend.
3. Database owner chạy Rules/index/seed tests riêng; Backend vẫn phải test auth cho Admin writes vì Rules không bảo vệ Admin.
4. Test hai client API Mode với Auth emulator/Firebase dev: create/join → wishlist/comments → recommendations → proposal → vote → notifications → reconnect → weather change. Chạy frontend mock regression độc lập.
5. Failure injection: unavailable Firebase, permission denied, network timeout, provider missing/refusal, auth refresh, stale data, rate-limit và retried transaction. Mock/stub providers trong CI; live provider/model test chỉ explicit opt-in có budget.
6. Chỉ đổi môi trường sang Firebase sau migration rehearsal/count+relationship validation/rollback; không dual-write production.

**Endpoints:** toàn bộ 40 operation, gồm hai password operation mới. **Phụ thuộc:** các stage trước và [INTEGRATION_PLAN](INTEGRATION_PLAN.md). **DoD:** API/emulator/auth/realtime/concurrency tests xanh, FE journey API Mode xanh, docs/status/known limits được cập nhật bằng log thật. **Deliverables:** scripts `test:firebase`, `test:api-contract` do Backend **sẽ tạo** (hiện chưa có), CI emulator job, deploy runbook và evidence. Thứ tự unit/pure → repository emulator → API → multi-client → staging rehearsal.
