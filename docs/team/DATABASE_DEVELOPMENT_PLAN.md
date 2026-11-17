# Kế hoạch Firebase và Cloud Firestore

Owner: **Database Developer**. Phần dưới là **thiết kế đích**, không phải CSDL đã tạo. Firestore Standard/native mode là primary operational database; PostgreSQL/PGlite chỉ giữ để đối chiếu/rollback đến khi nghiệm thu cutover. Backend owner viết repository/transaction; Database owner chốt model, IAM, Rules, indexes, seed, migration và kiểm thử DB.

## 1. Thiết lập theo thứ tự

1. Tạo hai Firebase project dev/prod bằng tài khoản của nhóm; ID thật do owner cấp, không lấy `demo-di-chung` làm cloud project. Chọn Firestore region trước khi có dữ liệu theo người dùng/backend deployment và xác nhận với nhóm.
2. Bật Email/Password trong Firebase Authentication; cấu hình authorized domains, action URL/password-reset template. Không provision demo personas trong production.
3. Phân quyền IAM theo vai trò: owner quản lý project, DB developer quản lý DB/Rules/indexes, Backend service identity chỉ đủ dùng Firestore/Auth cần thiết; không chia sẻ owner password/service-account JSON qua Git. Admin bypass Rules nên backend authorization vẫn phải test riêng.
4. Local dùng Emulator Suite với project `demo-di-chung`: Auth 9099, Firestore 8080, UI **4401** để tránh Express 4000. Dùng [firebase.json.example](examples/firebase.json.example) sau khi cài/pin CLI và tạo Rules/indexes thật. Không có root firebase.json hiện tại.
5. Backend/DB dùng JDK **21+ cho emulator mới**; máy audit hiện có JDK 17 dùng Android build, không coi đã kiểm thử Firebase emulator. Hướng dẫn chung còn ghi mức Java cũ trong khi trang Firestore nêu chuyển sang Java 21; nhóm pin CLI/emulator tương thích và ghi phiên bản thực. [Thông báo Java của Firestore Emulator](https://firebase.google.com/docs/emulator-suite/connect_firestore).
6. Viết seed emulator idempotent, test Rules/indexes, rồi rehearsal migration trong dev; production không auto-seed khi server start.

**Deliverables nền:** project access list (không chứa credentials), cấu hình emulator đã pin, schema bên dưới, Rules/indexes được test, seed + verification script. Firebase SDK/CLI/Rules test dependencies chưa được cài trong Phase 4.

## 2. Quy ước model và serializer

- Document ID giữ nguyên ID cũ khi hợp lệ; không dùng email làm ID. Firebase UID là `users/{uid}`; profile không chứa password/hash/token. Khi UID buộc đổi, mọi FK dùng cùng mapping trong một migration manifest.
- Các mảng API hiện có (`Place[]`, `Plan[]`...) giữ nguyên. Firestore Timestamp được Backend chuyển thành ISO strings; `tripDate` là ngày Việt Nam dạng `YYYY-MM-DD`, không chuyển qua midnight UTC gây lệch ngày.
- `role`, `cityName`, `memberCount`, `myVote` là view theo caller/quan hệ; không lưu `Group` DTO của một leader làm group document authoritative.
- `schemaVersion=1` là field nội bộ của thiết kế mới. JSON ví dụ biểu diễn Timestamp bằng ISO cho dễ đọc; seed phải chuyển thành Timestamp, không lưu lẫn string và Timestamp cho cùng field. expectedRevision hiện chỉ giúp log overwrite, không phải strict CAS; port phải giữ last-write-wins trừ khi có thay đổi contract được duyệt.
- Preferences chỉ lưu ở `groups/{gid}/preferences/{uid}`, không giữ thêm bản có thể sửa trong member doc. Wishlist dùng doc ID placeId, ballot dùng doc ID uid; legacy row ID được giữ trong metadata/mapping khi chuyển sang natural key.
- Plan items giữ core fields + placeId, serializer hydrate Place hiện hành như SQL đang làm; `constraints` và facts đầu vào AI giữ snapshot riêng. Không vô tình đổi semantics lịch sử bằng cách freeze toàn bộ Place DTO mà không thống nhất.
- Phân biệt `visitorInfo` có nguồn/null và các số legacy dùng giả định lập lịch. Không nâng tọa độ Vũng Tàu/record retired thành verified. Chỉ catalogue visible có 80 Đà Lạt; raw export có thể nhiều hơn vì lịch sử tham chiếu.
- Document có giới hạn kích thước; giữ payload/index không phình theo history. Raw provider/AI payload lớn phải archive có checksum và ACL, không nhét tùy ý vào plan. [Giới hạn Firestore](https://firebase.google.com/docs/firestore/quotas).

## 3. Quyền truy cập và Security Rules

MVP chọn **REST cho mọi protected read/write**, Socket chỉ invalidation/typing. Không có direct Firestore listener trong frontend. Rules vì vậy chặn direct client read/write dữ liệu riêng, kể cả user tự ghi profile/preferences/vote. Express Admin SDK là bên thực hiện ghi sau khi kiểm quyền. Catalogue `cities`/`places` có thể public read nếu chỉ chứa public fields; write luôn backend/seed identity. Đây không phải hai nguồn dữ liệu: tất cả vẫn cùng Firestore.

| Dữ liệu | Quyền qua REST/Admin phải kiểm | Direct mobile/web Rules của MVP |
|---|---|---|
| users | Own profile; email/UID từ Auth, field name/avatar theo whitelist | Deny read/write trực tiếp |
| groups, members, preferences | Active membership; create/join theo service; leader sửa constraints; preference chỉ caller | Deny read/write trực tiếp |
| wishlist | Member, cùng city, add idempotent | Deny write/read trực tiếp |
| comments | Member đọc; author + member edit/delete; đúng một target hợp lệ | Deny write/read trực tiếp |
| plans, votes, approved/current plan | Member đọc; leader mở proposal; snapshot voter vote; backend transaction duyệt | Deny mọi direct write/read |
| notifications | Chỉ owner đọc/mark read | Deny direct client access |
| activity, alerts, weather, AI metadata, outbox, quota/lease/keys | Services ghi; DTO công khai theo endpoint/membership; metadata thô chỉ trusted service | Deny direct client access |
| cities, places | REST hiện vẫn yêu cầu token; tài liệu catalogue bản thân là public | Có thể allow read; deny client write |

Rules skeleton để DB developer hiện thực/test, **không phải file đang deploy**:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /cities/{id} { allow read: if true; allow write: if false; }
    match /places/{id} { allow read: if true; allow write: if false; }
    match /{document=**} { allow read, write: if false; }
  }
}
```

Đọc public chỉ bật sau khi review fields/provenance không chứa private data. Nếu sau này muốn own-profile hoặc group listener qua SDK, phải có ADR transport, Rules membership/field validation và tests trước khi bật; không tự mở `allow write: if request.auth != null`. Admin không bị Rules chặn; test API outsider/author/leader vẫn bắt buộc. [Admin/IAM và Rules](https://firebase.google.com/docs/firestore/security/rules-conditions).

## 4. Index và query

Danh sách field/index chi tiết trong từng collection ở phần schema. Các index ưu tiên:

| Mã | Scope | Query cần phục vụ |
|---|---|---|
| I1 | collection group `members` | userId ASC, status ASC, joinedAt ASC → GET groups của caller |
| I2 | `places` | cityId ASC, catalogVisible ASC, name ASC → catalogue, backend page-internal |
| I3 | `plans` | groupId ASC, version DESC → history/group detail |
| I4 | `plans` | status ASC, deadline ASC → worker expiry |
| I5 | `plans` | groupId ASC, status ASC → competing VOTING proposals |
| I6a/I6b | `comments` | groupId ASC, placeId hoặc planId ASC, deletedAt ASC, createdAt ASC |
| I7 | subcollection `notifications` | readAt ASC, createdAt DESC khi lọc unread; default order createdAt có automatic index |
| I8 | `weatherSnapshots` | provider ASC, locationKey ASC, demoRunId ASC, fetchedAt DESC |
| I9 | `weatherChecks` | groupId ASC, checkedAt DESC |
| I10 | `rainReports` | groupId ASC, reportedAt DESC |
| I11 | `forecastVerifications` | outcome ASC, dueAt ASC |
| I12 | `providerRequestLog` | provider ASC, requestedAt ASC |
| I13 | `outbox` | status ASC, availableAt ASC |
| I14 | `aiExecutions` | groupId ASC, createdAt DESC (nếu query theo group) |

Không tạo mọi tổ hợp category/environment: catalogue city nhỏ được lọc trên backend cache. Disable indexing cho raw payload, core plan items, facts, before/after maps và text lớn không query. DB developer chuyển bảng này thành `firestore.indexes.json`, commit cùng query tests; không có file index production được giả là đã triển khai. Index availability và quyền cần xác nhận trên dev thật, emulator không thay thế hoàn toàn bài kiểm tra đó. [Indexes](https://firebase.google.com/docs/firestore/query-data/index-overview).

## 5. Transactions và tính nhất quán

Firestore retry callback khi dữ liệu đọc thay đổi; **đọc trước khi ghi**, không gọi HTTP/AI/emit trong callback. [Transactions](https://firebase.google.com/docs/firestore/manage-data/transactions).

### Group create / invite / join

- Chuẩn bị ID/code ngẫu nhiên trước callback. Read unique key và city; sau đó create group, leader member, preferences, invite key, activity và outbox cùng commit. Invariant: một active leader; leaderId trên group khớp leader member.
- Invite registry có ID hash normalized code, target group và expiresAt; uniqueness nhờ document key. Group giữ inviteCode ở protected doc để UI mời bạn vẫn hiển thị được. Query không scan toàn bộ groups để tìm code.
- Join read invite + group + member; kiểm expiry/role/status. Nếu đã ACTIVE thì không tăng count; nếu mới/rejoin thì write member, count và `membershipRevision` trong cùng commit. Không thay electorate của plan đang VOTING.
- Preferences chỉ caller được ghi, tăng `preferencesRevision` nội bộ; không copy preference sang profile/member.

### Mở proposal và chốt cử tri

Network generation ở ngoài transaction. Read lại group/constraints/base plan, query active members và kiểm membership revision; tạo version bằng `nextPlanVersion`, tạo plan VOTING, ballot null cho từng người, activity/outbox cùng commit. Ballot docs chính là snapshot; không lấy danh sách thành viên hiện tại làm eligibleCount mỗi lần vote. Không truncate snapshot khi vượt giới hạn ghi/kích thước: trả lỗi rõ hoặc triển khai preparation DRAFT có kiểm version trong một PR được test riêng. Data môn học ba người nằm trong phạm vi đơn giản này.

### Vote / majority / current itinerary

1. Đọc plan, group, member và ballot trước mọi write (có thể pre-read ID rồi re-read authoritative trong transaction). Member phải ACTIVE và ballot tồn tại; người join muộn bị `NOT_ELIGIBLE`.
2. Kiểm VOTING, deadline 30 phút, basePlanId bằng currentPlanId và constraints khớp `planConstraints`. `expectedRevision` của PATCH là advisory theo SQL, không có nghĩa mọi rename cũng phải stale plan. Riêng PATCH đổi mode clear currentPlanId và stale pending như backend hiện tại.
3. Tính delta từ choice cũ; same choice không tăng counter; YES→NO giảm YES và tăng NO. EligibleCount/requiredYesVotes cố định. Kiểm `yes+no <= eligible` và số không âm.
4. Trước write, query các competing VOTING plans nếu cần stale cùng commit. YES đủ majority → APPROVED + group.currentPlanId/revision + competing STALE + alert resolved + activity/outbox. NO khiến không thể đạt majority → REJECTED, currentPlanId không đổi.
5. Muốn persist EXPIRED/STALE rồi trả 409: transaction trả error outcome sau khi write; handler throw HTTP **sau commit**. Throw trong callback sau write sẽ hủy status update.
6. Group doc là điểm contention có chủ đích: hai winner tranh cùng currentPlan phải retry; chỉ một lần apply. Outbox publisher thực hiện sau, fanout idempotent; không tăng count lần hai do callback retry.

Với nhiều proposal/member lớn, thiết kế bounded queries và transaction preparation trước khi scale; không đổi sang bộ đếm approximate cho vote. Worker kiểm expiry; read/vote vẫn tự kiểm deadline, không dựa worker chạy đúng giờ.

### Quota, lease và dedupe

Port rolling hour/day/31-day reservation từ SQL. MVP transaction đọc `quotaLocks/{provider}` cùng query reservations trong cửa sổ, tính budget rồi tạo reservation và tăng lock revision. Khóa riêng provider serialize cả khi query không trả record; không chỉ đếm ngoài transaction. Bảo vệ workload lớn bằng error/monitoring, không truncate query rồi coi còn quota. Policy này là budget nội bộ, không cam kết quota gói API.

Worker dùng lease document có fencingToken, owner và expiresAt; trước ghi quan trọng kiểm lease/token trong transaction. Alert/verification uniqueness dùng `uniqueKeys`, outbox/notification IDs đảm bảo idempotence. TTL chỉ dọn dữ liệu, không thay logic expiry/permission.

## 6. Migration SQL/PGlite → Firestore

**Không chạy migration trong Phase 4.** Một SQL migration hiện tại khai báo 20 bảng; không bỏ các bảng weather/AI chỉ vì frontend không đọc trực tiếp.

| SQL | Đích / ghi chú |
|---|---|
| users | Auth UID + users/{uid}; không import password_hash; giữ legacy ID hoặc manifest mapping |
| cities, places | cities, places; preserve IDs/provenance; retired records giữ catalogVisible=false |
| groups | groups; preserve current_plan_id/base links, constraints, revision/date/mode |
| group_members | members + tách preferences; giữ ACTIVE/LEFT/role/joinedAt |
| wishlist_items | group wishlist/{placeId}; giữ row ID trong legacyId và manifest; note/addedBy/time không mất |
| plans, plan_items | plans và core items có nguyên item ID/position/time/cost/reason/fact refs |
| plan_ballots | votes/{uid}; **kể cả choice NULL**, giữ electorate và votedAt |
| comments | comments; preserve author/target XOR, deletedAt/editedAt |
| notifications, activity_logs, alerts | user notifications, group activity/alerts; preserve readAt, references, dedupe |
| weather_snapshots | weatherSnapshots; normalized facts + raw payload/archive checksum, demoRunId giữ nguyên |
| weather_checks + weather_check_sources | weatherChecks, sources map theo provider; preserve fact IDs/snapshot references |
| rain_reports | rainReports; GPS/accuracy/evidence validation status không nâng thành VERIFIED |
| forecast_verifications | forecastVerifications natural key/check-provider; legacyId+manifest giữ row ID và outcome UNKNOWN |
| llm_runs | aiExecutions; giữ input/output/status/attempt/model/prompt version có kiểm kích thước/ACL |
| provider_request_log | providerRequestLog; bảng không PK nên export ordinal + manifest hash làm ID idempotent; giữ requestedAt |

### Quy trình thực hiện và kiểm chứng

1. **Khảo sát và backup:** chốt instance SQL/PGlite đúng; backup PostgreSQL hoặc dừng ghi rồi snapshot directory PGlite bằng công cụ được owner duyệt. Không copy DB directory đang ghi như backup nhất quán. Export có schema version, counts, SHA-256 và thời điểm freeze; file backup/export/PII ở ngoài Git.
2. **Dry-run transform:** mapping snake_case→camelCase/Timestamp; lưu id map/version/checksum; từ chối orphan/duplicate/invalid date trước write. Không tự sửa foreign key bằng cách bỏ record.
3. **Users:** ưu tiên Firebase UID = legacy user ID nếu hợp lệ. Provision account qua Admin theo quy trình kiểm email; không đoán `salt:hex` tương thích Firebase SCRYPT. Dùng reset/claim tài khoản, có thể provision credential ngẫu nhiên không lưu/log rồi bắt reset. Nếu UID đã có hoặc xung đột email: dừng/đối soát, không merge hay đổi chủ tự động. Demo chỉ emulator/dev.
4. **Import dev theo dependencies:** Auth/profile → cities/places → groups/members/prefs → wishlist → AI/weather snapshots/checks → plans/items/ballots → comments/alerts/notifications/activity/verifications → unique keys. Cyclic links (group currentPlan ↔ plan) ghi hai pass rồi validation; app không đọc dataset giữa các pass.
5. **Idempotence:** document IDs deterministic/mapped; mỗi batch có journal/checksum, retry không tạo version/vote/notification mới. Không chạy import với production worker/publisher; migration tạo outbox historical DONE hoặc tắt dispatch để tránh spam thông báo cũ.
6. **Verification:** so counts từng bảng và target mapping; relationship integrity toàn bộ, electorate count kể cả NULL ballot, approved plan cùng group và majority snapshot, source coordinate equality, sum cost/duration, timestamp/date, comment XOR, deleted/read status, demo isolation. So DTO JSON cho cùng caller trước/sau, không chỉ so row count.
7. **Rehearsal:** chạy Rules/API/concurrency/emulator tests, rồi sample dev cloud index/IAM; test rollback với bản copy. Thống nhất maintenance window: freeze SQL writes, final export/import/delta đã được kiểm; không dual-write production.
8. **Cutover:** đổi deploy Firebase backend và Frontend API/Auth provider, revoke custom sessions, yêu cầu login lại; giữ SQL backup/read-only. Ghi mapping version, thời gian và người quyết định.

### Rollback

Trước khi mở write Firebase, rollback là đổi endpoint về bản SQL với snapshot nhất quán và thu hồi session mới. **Sau khi Firebase đã có write**, không chỉ trỏ về SQL cũ: freeze Firebase, export/reconcile các write mới về SQL theo manifest hoặc chấp nhận recovery-point do owner phê duyệt, kiểm lại quan hệ rồi mới mở lại. Giữ Auth UID mapping và audit journal; password mới không thể “rollback hash” bằng phép copy. Không xóa Firebase project/collections hay backup SQL để hoàn tất thử nghiệm.

## 7. Kiểm thử và Definition of Done của Database

- [ ] Emulator Auth/Firestore dùng cùng demo project, production env không trỏ nhầm emulator.
- [ ] Rules tests: unauth, member, leader, author và owner đều không được direct-write operational data; public catalogue không có private fields. API/Admin authorization được Backend kiểm riêng.
- [ ] Queries/index manifest khớp API matrix; chạy thử index trên dev thật; large fields không index bừa.
- [ ] Seed ba người có pending/approved/rejected, weather missing/demo, ballot NULL và retired catalogue records; rerun seed không ghi đè data operator.
- [ ] Join/create, vote concurrent, group overwrite audit theo expectedRevision, plan stale constraints và currentPlan same-group có tests transaction.
- [ ] Tất cả 20 bảng có migration mapping; không password hash import; checksum/count/FK/DTO checks và rollback rehearsal có log.
- [ ] Backend nhận collection/query contract và IAM; Frontend chỉ nhận public config và ID token flow. Không gửi service-account key cho Frontend.

Lệnh emulator/Rules testing trong [TEAM_SETUP](TEAM_SETUP.md) chỉ có thể chạy sau khi Database developer tạo các file/script thật; Phase 4 không báo các kiểm thử đó đã pass.

<!-- GENERATED_FIRESTORE_SCHEMA -->

## 8. Schema chi tiết — thiết kế, chưa deploy

R = bắt buộc; O = tùy chọn. Nullable được ghi ngay trong type; `undefined` không được lưu vào Firestore. Document ID nằm trong path và serializer thêm `id`; không cần lặp field `id`. Ví dụ là JSON shape độc lập từng document, không phải một seed hoàn chỉnh; Timestamp viết bằng ISO để đọc được. Field con trong map phải tuân cùng required/validation; PlanItemCore và SourceFact được giải thích tại entry tương ứng.

### 1. users/{uid}

Profile; ID document bằng Firebase UID, không phải nơi lưu credential.

Quan hệ: Firebase Authentication, members, comments, notifications.

Quyền: REST own-profile; Admin provision; direct SDK deny.

Query/index: Document get; uniqueness email thuộc Firebase Auth.

| Field | Type DB | R/O | Validation |
|---|---|---|---|
| `name` | string | R | 2–80 ký tự, trim; API PATCH vẫn yêu cầu name. |
| `email` | string | R | Email canonical từ Firebase Auth, không tự sửa bằng client payload. |
| `avatarColor` | string | R | Hex #RRGGBB. |
| `status` | enum(ACTIVE,PENDING_RESET,DISABLED) | R | Backend/Admin quyết định, không thay group role. |
| `legacyUserId` | string | O | ID cũ khi cần mapping; không thay uid một phía. |
| `createdAt` | Timestamp | R | Preserve lúc import. |
| `updatedAt` | Timestamp | R | Trusted server time. |
| `schemaVersion` | integer | R | Giá trị 1 ở schema đích; không gửi vào DTO nếu contract không có. |

```json
{
  "name": "Minh Anh",
  "email": "leader@dichung.demo",
  "avatarColor": "#397A68",
  "status": "ACTIVE",
  "legacyUserId": "demo-leader",
  "createdAt": "2026-11-17T00:00:00.000Z",
  "updatedAt": "2026-11-17T00:00:00.000Z",
  "schemaVersion": 1
}
```

### 2. cities/{cityId}

Catalogue thành phố; ID dalat/vungtau giữ nguyên.

Quan hệ: places, groups.

Quyền: Public catalogue read được phép sau review; chỉ Admin/seed write.

Query/index: Automatic name; API có auth theo contract cũ.

| Field | Type DB | R/O | Validation |
|---|---|---|---|
| `name` | string | R | Tên có nguồn. |
| `latitude` | number | R | Hữu hạn, -90..90. |
| `longitude` | number | R | Hữu hạn, -180..180. |
| `timezone` | string | R | Asia/Ho_Chi_Minh với hai city hiện tại. |
| `imageUrl` | string | R | URL công khai hoặc rỗng, không token. |
| `createdAt` | Timestamp | R | Trusted/import timestamp. |
| `updatedAt` | Timestamp | R | Trusted/import timestamp. |
| `schemaVersion` | integer | R | Giá trị 1 ở schema đích; không gửi vào DTO nếu contract không có. |

```json
{
  "name": "Đà Lạt",
  "latitude": 11.9404,
  "longitude": 108.4583,
  "timezone": "Asia/Ho_Chi_Minh",
  "imageUrl": "",
  "createdAt": "2026-11-17T00:00:00.000Z",
  "updatedAt": "2026-11-17T00:00:00.000Z",
  "schemaVersion": 1
}
```

### 3. places/{placeId}

Một record catalogue, gồm record retired để giữ foreign references.

Quan hệ: cities, wishlist, plans.items.

Quyền: Public-read fields only; write Admin/curated seed, không user sửa coordinates.

Query/index: I2; exempt description/visitorInfo/raw text không query.

| Field | Type DB | R/O | Validation |
|---|---|---|---|
| `cityId` | string | R | City tồn tại, giữ ID cũ. |
| `name` | string | R | Tên nguồn, không instruction AI. |
| `category` | string | R | Tên category catalogue; không dùng enum Discovery thay tên. |
| `environment` | enum(INDOOR,OUTDOOR) | R | Ước tính nếu chưa xác minh, thể hiện trong visitorInfo. |
| `latitude` | number | R | Hữu hạn/range; không tạo tọa độ mới cho record chưa xác minh. |
| `longitude` | number | R | Hữu hạn/range. |
| `priceVnd` | integer | R | >=0, legacy planning assumption; 0 không có nghĩa vé miễn phí. |
| `durationMin` | integer | R | >0, giả định nếu visitorInfo không có duration. |
| `openHour` | number | R | Legacy planning assumption, 0..23. |
| `closeHour` | number | R | >openHour, <=24. |
| `imageUrl` | string | R | Ảnh có nguồn hoặc minh họa/rỗng. |
| `description` | string | R | Preserve mô tả/provenance. |
| `dataQuality` | string | R | Phân biệt OSM và tham khảo cũ. |
| `geographyVerified` | boolean | R | True chỉ sau đối chiếu source, không chỉ finite coordinates. |
| `sourceUrl` | string or null | R | Nguồn OSM/public được giữ khi có. |
| `sourceId` | string | O | ID node/relation OSM gốc. |
| `coordinateKind` | string | O | OSM_NODE hoặc OSM_BOUNDING_BOX_CENTER; center không phải cổng vào. |
| `sourceTimestamp` | Timestamp or null | R | Ngày snapshot source, không giả làm ngày kiểm thực địa. |
| `catalogVisible` | boolean | R | Ẩn record retired trong listing; detail/history vẫn giữ. |
| `visitorInfo` | map | R | Bốn trường nullable và environmentEstimated bên dưới. |
| `visitorInfo.entranceFeeVnd` | integer or null | R | null=unknown, >=0 nếu có nguồn. |
| `visitorInfo.openingHours` | string or null | R | Giờ có nguồn; null nếu thiếu. |
| `visitorInfo.visitDurationMin` | integer or null | R | >0 hoặc null. |
| `visitorInfo.environmentEstimated` | boolean | R | Không đánh đồng phân loại ước tính với xác minh. |
| `visitorInfo.verifiedAt` | Timestamp or null | R | null nếu chưa xác minh thông tin khách tham quan. |
| `updatedAt` | Timestamp | R | Ngày cập nhật record, độc lập source timestamp. |
| `schemaVersion` | integer | R | Giá trị 1 ở schema đích; không gửi vào DTO nếu contract không có. |

```json
{
  "cityId": "dalat",
  "name": "Hồ Xuân Hương",
  "category": "Thiên nhiên",
  "environment": "OUTDOOR",
  "latitude": 11.9450109,
  "longitude": 108.445363,
  "priceVnd": 0,
  "durationMin": 60,
  "openHour": 8,
  "closeHour": 20,
  "imageUrl": "",
  "description": "Tâm hình học đối tượng OSM; chưa xác minh cổng vào.",
  "dataQuality": "OSM",
  "geographyVerified": true,
  "sourceUrl": "https://www.openstreetmap.org/relation/2390139",
  "sourceId": "relation/2390139",
  "coordinateKind": "OSM_BOUNDING_BOX_CENTER",
  "sourceTimestamp": "2026-11-10T05:57:04Z",
  "catalogVisible": true,
  "visitorInfo": {
    "entranceFeeVnd": null,
    "openingHours": null,
    "visitDurationMin": null,
    "environmentEstimated": true,
    "verifiedAt": null
  },
  "updatedAt": "2026-11-17T00:00:00.000Z",
  "schemaVersion": 1
}
```

### 4. groups/{gid}

Group authoritative; role của caller được tính ở serializer.

Quan hệ: members, preferences, plans, uniqueKeys.

Quyền: Active member đọc; leader update constraints; service create/join/apply; direct SDK deny.

Query/index: GET groups đi qua I1 rồi get group, không query role field trên group.

| Field | Type DB | R/O | Validation |
|---|---|---|---|
| `name` | string | R | 2–100 ký tự theo Zod hiện tại. |
| `cityId` | string | R | City tồn tại; API create hiện chỉ dalat/vungtau. |
| `tripDate` | string YYYY-MM-DD | R | Ngày VN, không Timestamp. |
| `startHour` | integer | R | 0<=start<end, <=23 theo group Zod hiện tại. |
| `endHour` | integer | R | 1..24. |
| `budgetPerPersonVnd` | integer | R | 0..100000000 theo API hiện tại; UI có thể kiểm dương. |
| `inviteCode` | string | R | Code normalized, chỉ thành viên qua REST được xem. |
| `inviteExpiresAt` | Timestamp | R | Kiểm expiry server, không trông chờ TTL. |
| `currentPlanId` | string or null | R | Plan cùng group và đã được duyệt; mode change clear pointer như SQL. |
| `mode` | enum(DEMO,LIVE) | R | Không lẫn cache/verification. |
| `revision` | integer | R | >=1, group update/apply tăng; expectedRevision hiện advisory overwrite, không strict CAS. |
| `leaderId` | string | R | Khớp đúng một ACTIVE LEADER member. |
| `memberCount` | integer | R | Counter transaction; serializer có thể kiểm lại active count. |
| `membershipRevision` | integer | R | >=0; thay đổi membership, dùng chốt electorate. |
| `preferencesRevision` | integer | R | >=0; invalidate generation/cache. |
| `nextPlanVersion` | integer | R | >=1; cấp version duy nhất trong transaction. |
| `createdAt` | Timestamp | R | Preserve import. |
| `updatedAt` | Timestamp | R | Trusted server time. |
| `schemaVersion` | integer | R | Giá trị 1 ở schema đích; không gửi vào DTO nếu contract không có. |

```json
{
  "name": "Một ngày Đà Lạt",
  "cityId": "dalat",
  "tripDate": "2026-11-17",
  "startHour": 8,
  "endHour": 20,
  "budgetPerPersonVnd": 600000,
  "inviteCode": "DICHUNG",
  "inviteExpiresAt": "2026-12-17T00:00:00Z",
  "currentPlanId": null,
  "mode": "DEMO",
  "revision": 1,
  "leaderId": "demo-leader",
  "memberCount": 3,
  "membershipRevision": 1,
  "preferencesRevision": 0,
  "nextPlanVersion": 2,
  "createdAt": "2026-11-17T00:00:00.000Z",
  "updatedAt": "2026-11-17T00:00:00.000Z",
  "schemaVersion": 1
}
```

### 5. groups/{gid}/members/{uid}

Active/left membership; uid là natural key, không nhân đôi.

Quan hệ: users, groups, votes.

Quyền: REST member view; Admin group service write; direct SDK deny.

Query/index: I1 collection-group members; direct get uid để authorize.

| Field | Type DB | R/O | Validation |
|---|---|---|---|
| `groupId` | string | R | Khớp path gid. |
| `userId` | string | R | Khớp path uid và users/Auth. |
| `role` | enum(LEADER,MEMBER) | R | Chỉ group service thay đổi, một active leader. |
| `status` | enum(ACTIVE,LEFT) | R | Không tự xóa ballot snapshot khi LEFT. |
| `joinedAt` | Timestamp | R | Giữ semantics rejoin/import. |
| `updatedAt` | Timestamp | R | Server time. |
| `schemaVersion` | integer | R | Giá trị 1 ở schema đích; không gửi vào DTO nếu contract không có. |

```json
{
  "groupId": "demo-group",
  "userId": "demo-leader",
  "role": "LEADER",
  "status": "ACTIVE",
  "joinedAt": "2026-11-17T00:00:00.000Z",
  "updatedAt": "2026-11-17T00:00:00.000Z",
  "schemaVersion": 1
}
```

### 6. groups/{gid}/preferences/{uid}

Sở thích duy nhất của một thành viên trong nhóm.

Quan hệ: groups, members, AI candidates.

Quyền: Caller đọc/sửa qua REST; Backend aggregate; direct SDK deny.

Query/index: Direct doc get; group subcollection scan bounded cho AI.

| Field | Type DB | R/O | Validation |
|---|---|---|---|
| `userId` | string | R | Khớp path/caller, membership active. |
| `categories` | array<string> | R | Tên category thực của city, unique, max 10. |
| `environmentPreference` | enum(ANY,INDOOR,OUTDOOR) | R | Default ANY. |
| `travelStyles` | array<string> | R | Enum TRAVEL_STYLES, unique max 7. |
| `updatedAt` | Timestamp | R | Server/import time. |
| `schemaVersion` | integer | R | Giá trị 1 ở schema đích; không gửi vào DTO nếu contract không có. |

```json
{
  "userId": "demo-leader",
  "categories": [
    "Thiên nhiên"
  ],
  "environmentPreference": "ANY",
  "travelStyles": [
    "RELAXATION"
  ],
  "updatedAt": "2026-11-17T00:00:00.000Z",
  "schemaVersion": 1
}
```

### 7. groups/{gid}/wishlist/{placeId}

Natural key ngăn add trùng; API trả Place[], không metadata này.

Quan hệ: groups, places, users.

Quyền: Member REST add/remove; direct SDK deny.

Query/index: Automatic createdAt, direct place key.

| Field | Type DB | R/O | Validation |
|---|---|---|---|
| `placeId` | string | R | Khớp doc ID, place cùng city group. |
| `addedBy` | string | R | UID active member lúc add. |
| `note` | string | R | Preserve SQL note, default rỗng. |
| `legacyId` | string | O | UUID row SQL để không mất ID trong manifest. |
| `createdAt` | Timestamp | R | Preserve thứ tự thêm. |
| `schemaVersion` | integer | R | Giá trị 1 ở schema đích; không gửi vào DTO nếu contract không có. |

```json
{
  "placeId": "dalat-01",
  "addedBy": "demo-leader",
  "note": "",
  "legacyId": "<legacy-wishlist-id>",
  "createdAt": "2026-11-17T00:00:00.000Z",
  "schemaVersion": 1
}
```

### 8. plans/{pid}

Proposal/lịch; DTO tổng hợp thêm Place, totals và myVote theo caller.

Quan hệ: groups, votes, places, weatherChecks, aiExecutions.

Quyền: Member REST read; leader propose; service vote/apply; direct client read/write deny.

Query/index: I3/I4/I5; exempt items/constraints text không query.

| Field | Type DB | R/O | Validation |
|---|---|---|---|
| `groupId` | string | R | Group tồn tại; không đổi sau tạo. |
| `version` | integer | R | Unique theo group qua nextPlanVersion. |
| `basePlanId` | string or null | R | Base cùng group, khớp lúc apply. |
| `kind` | enum(INITIAL,RAIN_CHANGE,MANUAL_CHANGE) | R | Giữ kind cũ; chưa có API generate MANUAL_CHANGE. |
| `status` | enum(DRAFT,VOTING,APPROVED,REJECTED,EXPIRED,STALE) | R | Chỉ transaction/service điều khiển. |
| `engine` | enum(LLM,RULE_BASED) | R | DEMO là flag khác. |
| `demo` | boolean | R | Giữ provenance. |
| `summary` | string | R | Validated explanation. |
| `constraints` | map | R | Snapshot cityId/tripDate/startHour/endHour/budgetPerPersonVnd/mode. |
| `items` | array<PlanItemCore> | R | Giữ item id/placeId/position/startTime/endTime/travelMin/costVnd/reason/factIds; thời gian DB là Timestamp; place DTO hydrate riêng. |
| `eligibleCount` | integer | R | Ballot snapshot count, gồm choice=null. |
| `requiredYesVotes` | integer | R | floor(eligibleCount/2)+1. |
| `yesVotes` | integer | R | >=0, vote delta transaction. |
| `noVotes` | integer | R | >=0, yes+no<=eligible. |
| `createdBy` | string | R | UID leader/authorized service. |
| `llmRunId` | string or null | R | Tham chiếu aiExecutions nếu có. |
| `weatherCheckId` | string or null | R | Tham chiếu weatherChecks nếu có. |
| `demoRunId` | string or null | R | Preserve SQL demo grouping. |
| `deadline` | Timestamp | R | 30 phút ở backend hiện tại, preserve import deadline. |
| `createdAt` | Timestamp | R | Server/import time. |
| `updatedAt` | Timestamp | R | Server time. |
| `schemaVersion` | integer | R | Giá trị 1 ở schema đích; không gửi vào DTO nếu contract không có. |

```json
{
  "groupId": "demo-group",
  "version": 1,
  "basePlanId": null,
  "kind": "INITIAL",
  "status": "VOTING",
  "engine": "RULE_BASED",
  "demo": true,
  "summary": "Ví dụ shape; không phải output AI thật.",
  "constraints": {
    "cityId": "dalat",
    "tripDate": "2026-11-17",
    "startHour": 8,
    "endHour": 20,
    "budgetPerPersonVnd": 600000,
    "mode": "DEMO"
  },
  "items": [
    {
      "id": "<plan-item-id>",
      "placeId": "dalat-01",
      "position": 0,
      "startTime": "2026-11-17T01:00:00Z",
      "endTime": "2026-11-17T02:00:00Z",
      "travelMin": 0,
      "costVnd": 0,
      "reason": "Chi phí nguồn chưa biết.",
      "factIds": []
    }
  ],
  "eligibleCount": 3,
  "requiredYesVotes": 2,
  "yesVotes": 0,
  "noVotes": 0,
  "createdBy": "demo-leader",
  "llmRunId": null,
  "weatherCheckId": null,
  "demoRunId": "example-only",
  "deadline": "2026-11-17T00:30:00Z",
  "createdAt": "2026-11-17T00:00:00.000Z",
  "updatedAt": "2026-11-17T00:00:00.000Z",
  "schemaVersion": 1
}
```

### 9. plans/{pid}/votes/{uid}

Một ballot cho một snapshot voter, kể cả chưa vote.

Quan hệ: plans, members, users.

Quyền: Snapshot creation/service only; caller REST vote bản thân và còn ACTIVE; direct SDK deny.

Query/index: Direct doc; không query membership mới để tính eligibleCount.

| Field | Type DB | R/O | Validation |
|---|---|---|---|
| `groupId` | string | R | Khớp plan group. |
| `userId` | string | R | Khớp uid; phải có lúc chốt electorate. |
| `choice` | enum(YES,NO) or null | R | null là chưa trả lời, không tự YES. |
| `votedAt` | Timestamp or null | R | null trước vote. |
| `eligibleAt` | Timestamp | R | Thời điểm chốt snapshot. |
| `schemaVersion` | integer | R | Giá trị 1 ở schema đích; không gửi vào DTO nếu contract không có. |

```json
{
  "groupId": "demo-group",
  "userId": "demo-leader",
  "choice": null,
  "votedAt": null,
  "eligibleAt": "2026-11-17T00:00:00.000Z",
  "schemaVersion": 1
}
```

### 10. comments/{cid}

Bình luận theo đúng một target; global ID phục vụ PATCH/DELETE.

Quan hệ: groups, users, places, plans.

Quyền: Member read via REST; author+member edit/delete; userName/avatar hydrate từ users. Direct SDK deny.

Query/index: I6a/I6b; content exempt.

| Field | Type DB | R/O | Validation |
|---|---|---|---|
| `groupId` | string | R | Nhóm của target. |
| `userId` | string | R | Author UID. |
| `placeId` | string or null | R | XOR với planId; place phải trong wishlist/lịch cùng nhóm. |
| `planId` | string or null | R | XOR placeId; plan cùng group. |
| `content` | string | R | Trim, 1–2000 ký tự theo validator API. |
| `createdAt` | Timestamp | R | Preserve order. |
| `editedAt` | Timestamp or null | R | null nếu chưa edit. |
| `deletedAt` | Timestamp or null | R | Soft delete; default null phải hiện diện để query. |
| `schemaVersion` | integer | R | Giá trị 1 ở schema đích; không gửi vào DTO nếu contract không có. |

```json
{
  "groupId": "demo-group",
  "userId": "demo-leader",
  "placeId": "dalat-01",
  "planId": null,
  "content": "Hẹn nhau ở hồ.",
  "createdAt": "2026-11-17T00:00:00.000Z",
  "editedAt": null,
  "deletedAt": null,
  "schemaVersion": 1
}
```

### 11. users/{uid}/notifications/{nid}

Thông báo riêng; readAt chỉ owner cập nhật qua service.

Quan hệ: users, groups, plans, alerts, outbox.

Quyền: Owner REST read/read-mark; worker/backend create, direct SDK deny.

Query/index: I7 nếu unread query; default createdAt DESC automatic.

| Field | Type DB | R/O | Validation |
|---|---|---|---|
| `userId` | string | R | Khớp path uid. |
| `groupId` | string or null | R | Group liên quan nếu có. |
| `title` | string | R | Sanitized display text. |
| `message` | string | R | Không secret/raw private provider payload. |
| `type` | string | R | Giữ notification type hiện có. |
| `planId` | string or null | R | Plan liên quan nếu có. |
| `alertId` | string or null | R | Alert liên quan nếu có. |
| `payload` | map | R | Metadata nhỏ, default {}. |
| `readAt` | Timestamp or null | R | Mark-read idempotent. |
| `createdAt` | Timestamp | R | Preserve/import time. |
| `eventId` | string | O | Outbox event để fanout idempotent. |
| `schemaVersion` | integer | R | Giá trị 1 ở schema đích; không gửi vào DTO nếu contract không có. |

```json
{
  "userId": "demo-leader",
  "groupId": "demo-group",
  "title": "Có phương án mới",
  "message": "Ví dụ thông báo.",
  "type": "PLAN_VOTE",
  "planId": "<plan-id>",
  "alertId": null,
  "payload": {},
  "readAt": null,
  "createdAt": "2026-11-17T00:00:00.000Z",
  "eventId": "<event-id>",
  "schemaVersion": 1
}
```

### 12. groups/{gid}/alerts/{aid}

Cảnh báo có nguồn/dedupe; không tự áp dụng lịch.

Quan hệ: weatherChecks, plans, uniqueKeys.

Quyền: Member REST read; trusted weather/vote service write; direct SDK deny.

Query/index: Automatic createdAt DESC, uniqueKeys direct.

| Field | Type DB | R/O | Validation |
|---|---|---|---|
| `groupId` | string | R | Khớp path. |
| `weatherCheckId` | string | R | Check làm căn cứ. |
| `planId` | string or null | R | Proposal nếu tạo được. |
| `dedupeKey` | string | R | Unique registry; giữ SQL key. |
| `status` | string | R | OPEN/RESOLVED hoặc trạng thái cũ cần bảo toàn. |
| `message` | string | R | Source-backed, có demo flag từ demoRunId. |
| `demoRunId` | string or null | R | Không gộp demo vào accuracy. |
| `createdAt` | Timestamp | R | Preserve time. |
| `schemaVersion` | integer | R | Giá trị 1 ở schema đích; không gửi vào DTO nếu contract không có. |

```json
{
  "groupId": "demo-group",
  "weatherCheckId": "<check-id>",
  "planId": null,
  "dedupeKey": "<dedupe-key>",
  "status": "OPEN",
  "message": "Ví dụ cảnh báo, chưa có dữ kiện thật.",
  "demoRunId": "example-only",
  "createdAt": "2026-11-17T00:00:00.000Z",
  "schemaVersion": 1
}
```

### 13. weatherSnapshots/{sid}

Snapshot theo provider/location/mode; không phải current observation mặc định.

Quan hệ: weatherChecks.sources, cities.

Quyền: Chỉ services; API serialize summary có auth/membership; no direct client access.

Query/index: I8; exempt rawPayload/normalizedForecast.

| Field | Type DB | R/O | Validation |
|---|---|---|---|
| `provider` | string | R | Open-Meteo/WeatherAPI/Tomorrow.io. |
| `modelName` | string or null | R | Không đoán model nguồn. |
| `latitude` | number | R | City/rounded fetch coordinate, không ghi key API. |
| `longitude` | number | R | Range hợp lệ. |
| `locationKey` | string | R | Canonical round-key giống cache. |
| `fetchedAt` | Timestamp | R | Thời điểm lấy, không phải giờ forecast. |
| `issuedAt` | Timestamp or null | R | Giờ phát hành nguồn nếu biết. |
| `normalizedForecast` | array<map> | R | Giữ time/rain/probability/temp/wind null và validity. |
| `rawPayload` | map | O | Chỉ payload nhỏ, redacted và trong size budget. |
| `rawArchiveRef` | string | O | Bắt buộc nếu raw gốc không fit; storage trusted, không public URL chứa token. |
| `payloadSha256` | string | O | Kiểm chứng raw/archive. |
| `demoRunId` | string or null | R | Live=null; demo cô lập. |
| `schemaVersion` | integer | R | Giá trị 1 ở schema đích; không gửi vào DTO nếu contract không có. |

```json
{
  "provider": "Open-Meteo",
  "modelName": null,
  "latitude": 11.9404,
  "longitude": 108.4583,
  "locationKey": "11.9404:108.4583",
  "fetchedAt": "2026-11-17T00:00:00.000Z",
  "issuedAt": null,
  "normalizedForecast": [],
  "rawPayload": {},
  "demoRunId": null,
  "schemaVersion": 1
}
```

### 14. weatherChecks/{checkId}

Căn cứ quyết định mưa; gộp check_sources vào map.

Quan hệ: plans.items, weatherSnapshots, alerts, forecastVerifications.

Quyền: Trusted service write; selected DTO only qua REST; direct SDK deny.

Query/index: I9; sources map exempt; provider có dấu chấm không dùng dotted-path update tùy ý.

| Field | Type DB | R/O | Validation |
|---|---|---|---|
| `groupId` | string | R | Group hợp lệ. |
| `planItemId` | string or null | R | ID item lịch đang xét nếu có. |
| `targetFrom` | Timestamp | R | Bắt đầu cửa sổ forecast. |
| `targetTo` | Timestamp | R | >targetFrom. |
| `checkedAt` | Timestamp | R | Thời điểm đánh giá. |
| `ruleVersion` | string | R | Giữ policy đã áp dụng. |
| `decision` | string | R | Preserve decision SQL, không đổi thành xác suất. |
| `sources` | map<provider,SourceFact> | R | Mỗi entry snapshotId nullable, selectedFacts, isUsable, isRainRisk, unusableReason nullable; preserve mọi row check_sources. |
| `demoRunId` | string or null | R | Cô lập demo. |
| `schemaVersion` | integer | R | Giá trị 1 ở schema đích; không gửi vào DTO nếu contract không có. |

```json
{
  "groupId": "demo-group",
  "planItemId": null,
  "targetFrom": "2026-11-17T01:00:00Z",
  "targetTo": "2026-11-17T02:00:00Z",
  "checkedAt": "2026-11-17T00:00:00.000Z",
  "ruleVersion": "<preserve-rule-version>",
  "decision": "<preserve-decision>",
  "sources": {
    "Open-Meteo": {
      "snapshotId": null,
      "selectedFacts": {},
      "isUsable": false,
      "isRainRisk": false,
      "unusableReason": "MISSING"
    }
  },
  "demoRunId": null,
  "schemaVersion": 1
}
```

### 15. rainReports/{rid}

Quan sát có vị trí và trạng thái xác minh, không tự coi là thực tế đúng.

Quan hệ: groups, users, forecastVerifications.

Quyền: Member submit via REST; server validates; no direct client write/read.

Query/index: I10; nếu thêm status query tạo index tương ứng trong PR.

| Field | Type DB | R/O | Validation |
|---|---|---|---|
| `groupId` | string | R | Membership check. |
| `userId` | string | R | UID báo cáo. |
| `latitude` | number | R | Range hợp lệ. |
| `longitude` | number | R | Range hợp lệ. |
| `accuracyM` | number | R | >=0 và threshold service giữ từ rainReport. |
| `reportedAt` | Timestamp | R | Giữ observed/reported time, validation chống future/stale. |
| `condition` | enum(RAIN,DRY) | R | Không invent khác. |
| `validationStatus` | enum(PENDING,VERIFIED,REJECTED) | R | Chỉ backend xác minh. |
| `verificationMethod` | string or null | R | Evidence method nếu có. |
| `demoRunId` | string or null | R | Giữ provenance. |
| `createdAt` | Timestamp | R | Preserve server receipt time. |
| `schemaVersion` | integer | R | Giá trị 1 ở schema đích; không gửi vào DTO nếu contract không có. |

```json
{
  "groupId": "demo-group",
  "userId": "demo-leader",
  "latitude": 11.9404,
  "longitude": 108.4583,
  "accuracyM": 20,
  "reportedAt": "2026-11-17T00:00:00.000Z",
  "condition": "RAIN",
  "validationStatus": "PENDING",
  "verificationMethod": null,
  "demoRunId": "example-only",
  "createdAt": "2026-11-17T00:00:00.000Z",
  "schemaVersion": 1
}
```

### 16. forecastVerifications/{checkId_providerKey}

Unique check/provider; giữ row ID cũ trong legacyId.

Quan hệ: weatherChecks, weatherSnapshots, rainReports.

Quyền: Worker/admin only; aggregate verification DTO qua REST; SDK deny.

Query/index: I11; large evidence maps exempt.

| Field | Type DB | R/O | Validation |
|---|---|---|---|
| `legacyId` | string | O | SQL UUID nguyên gốc và migration mapping. |
| `checkId` | string | R | Weather check tồn tại. |
| `provider` | string | R | Khớp key mapping. |
| `targetFrom` | Timestamp | R | Preserve interval. |
| `targetTo` | Timestamp | R | >from. |
| `dueAt` | Timestamp | R | Chỉ kiểm khi có evidence. |
| `verifiedAt` | Timestamp or null | R | null khi UNKNOWN. |
| `predictedRain` | boolean or null | R | null không phải false. |
| `observedRain` | boolean or null | R | null khi thiếu evidence. |
| `evidence` | map | R | Provenance/refs, không đưa GPS cá nhân ra public. |
| `outcome` | enum(TP,FP,TN,FN,UNKNOWN) | R | Không tự gán accuracy cho demo/missing. |
| `demoRunId` | string or null | R | Loại demo khỏi real stats. |
| `schemaVersion` | integer | R | Giá trị 1 ở schema đích; không gửi vào DTO nếu contract không có. |

```json
{
  "legacyId": "<legacy-verification-id>",
  "checkId": "<check-id>",
  "provider": "Open-Meteo",
  "targetFrom": "2026-11-17T01:00:00Z",
  "targetTo": "2026-11-17T02:00:00Z",
  "dueAt": "2026-11-17T02:30:00Z",
  "verifiedAt": null,
  "predictedRain": null,
  "observedRain": null,
  "evidence": {},
  "outcome": "UNKNOWN",
  "demoRunId": null,
  "schemaVersion": 1
}
```

### 17. groups/{gid}/activity/{aid}

Audit/activity log; không chứa credential.

Quan hệ: groups, users, plans.

Quyền: Member REST read; service writes; SDK deny.

Query/index: Automatic createdAt DESC; exempt beforeData/afterData.

| Field | Type DB | R/O | Validation |
|---|---|---|---|
| `actorId` | string or null | R | null cho worker/system. |
| `action` | string | R | Giữ action code hiện có. |
| `message` | string | R | Display text được sanitize. |
| `entityType` | string or null | R | Preserve SQL metadata. |
| `entityId` | string or null | R | Preserve reference. |
| `beforeData` | map or null | R | Redact sensitive fields. |
| `afterData` | map or null | R | Preserve meaning, redact credentials. |
| `createdAt` | Timestamp | R | Preserve time. |
| `schemaVersion` | integer | R | Giá trị 1 ở schema đích; không gửi vào DTO nếu contract không có. |

```json
{
  "actorId": "demo-leader",
  "action": "PLAN_VOTE",
  "message": "Một thành viên biểu quyết.",
  "entityType": "plan",
  "entityId": "<plan-id>",
  "beforeData": null,
  "afterData": {
    "choice": "YES"
  },
  "createdAt": "2026-11-17T00:00:00.000Z",
  "schemaVersion": 1
}
```

### 18. aiExecutions/{runId}

Audit execution, không đưa raw AI/provider credential tới frontend.

Quan hệ: groups, plans, weatherSnapshots.

Quyền: Admin/service audit only; no direct client read/write.

Query/index: I14; exempt facts/output/errors.

| Field | Type DB | R/O | Validation |
|---|---|---|---|
| `groupId` | string or null | R | Null cho discovery cá nhân; giữ SQL group link khi import. |
| `userId` | string or null | R | Caller nếu đã lưu, không suy đoán actor khi SQL không có. |
| `task` | string | R | INITIAL/RAIN_CHANGE/DISCOVERY hoặc preserve legacy task. |
| `model` | string or null | R | Model được dùng, null cho purely rule result nếu không có. |
| `promptVersion` | string | R | Version validator/prompt. |
| `inputFacts` | map | R | Sanitized facts/constraints; có archiveRef nếu lớn. |
| `output` | map or null | R | Output validated hoặc raw archive có ACL, không overwrite evidence. |
| `validationErrors` | array | R | Redacted reason codes. |
| `attemptNo` | integer | R | >=1; retry bounded. |
| `status` | string | R | Giữ status legacy; enum mới phải có migration mapping explicit. |
| `engine` | enum(LLM,RULE_BASED) | R | Output provenance, không DEMO engine. |
| `demoRunId` | string or null | R | Demo isolation. |
| `archiveRef` | string | O | Có checksum/ACL nếu payload ngoài doc. |
| `createdAt` | Timestamp | R | Preserve time. |
| `schemaVersion` | integer | R | Giá trị 1 ở schema đích; không gửi vào DTO nếu contract không có. |

```json
{
  "groupId": "demo-group",
  "userId": null,
  "task": "INITIAL",
  "model": null,
  "promptVersion": "<preserve-version>",
  "inputFacts": {},
  "output": null,
  "validationErrors": [],
  "attemptNo": 1,
  "status": "<preserve-status>",
  "engine": "RULE_BASED",
  "demoRunId": "example-only",
  "createdAt": "2026-11-17T00:00:00.000Z",
  "schemaVersion": 1
}
```

### 19. providerRequestLog/{reservationId}

Mỗi reservation budget provider; không chứa URL/key.

Quan hệ: quotaLocks, weatherSnapshots.

Quyền: Server-only read/write.

Query/index: I12; không xoá trước sliding-window hết hiệu lực.

| Field | Type DB | R/O | Validation |
|---|---|---|---|
| `provider` | string | R | Khớp connector. |
| `requestedAt` | Timestamp | R | Nguồn tính sliding windows. |
| `expiresAt` | Timestamp | O | Retention sau window/reference needs, TTL chỉ dọn rác. |
| `legacyExportOrdinal` | integer | O | Dùng với export hash để tạo ID vì SQL không PK. |
| `schemaVersion` | integer | R | Giá trị 1 ở schema đích; không gửi vào DTO nếu contract không có. |

```json
{
  "provider": "Open-Meteo",
  "requestedAt": "2026-11-17T00:00:00.000Z",
  "expiresAt": "2027-01-01T00:00:00Z",
  "legacyExportOrdinal": 1,
  "schemaVersion": 1
}
```

### 20. quotaLocks/{providerKey}

Mutex/version document cho reservation concurrent.

Quan hệ: providerRequestLog.

Quyền: Server-only.

Query/index: Direct document; không coi revision là provider quota.

| Field | Type DB | R/O | Validation |
|---|---|---|---|
| `provider` | string | R | Canonical provider. |
| `revision` | integer | R | Tăng mỗi reservation để conflict/retry serialize. |
| `updatedAt` | Timestamp | R | Server time. |
| `schemaVersion` | integer | R | Giá trị 1 ở schema đích; không gửi vào DTO nếu contract không có. |

```json
{
  "provider": "Open-Meteo",
  "revision": 1,
  "updatedAt": "2026-11-17T00:00:00.000Z",
  "schemaVersion": 1
}
```

### 21. uniqueKeys/{kind_sha256}

Registry uniqueness thay SQL UNIQUE khi không có natural-key doc.

Quan hệ: groups, alerts, forecastVerifications.

Quyền: Server-only; không expose hash registry như API lookup public.

Query/index: Direct document key, không scan string invite.

| Field | Type DB | R/O | Validation |
|---|---|---|---|
| `kind` | enum(INVITE,ALERT_DEDUPE,VERIFICATION) | R | Domain của key, hash canonical có namespace. |
| `targetPath` | string | R | Document tồn tại/được tạo cùng transaction. |
| `groupId` | string or null | R | Group scope nếu cần. |
| `expiresAt` | Timestamp or null | R | Invite expiry; null cho lịch sử vẫn cần unique. |
| `createdAt` | Timestamp | R | Server/import time. |
| `schemaVersion` | integer | R | Giá trị 1 ở schema đích; không gửi vào DTO nếu contract không có. |

```json
{
  "kind": "INVITE",
  "targetPath": "groups/demo-group",
  "groupId": "demo-group",
  "expiresAt": "2026-12-17T00:00:00Z",
  "createdAt": "2026-11-17T00:00:00.000Z",
  "schemaVersion": 1
}
```

### 22. outbox/{eventId}

Intent event bền vững cùng transaction, publisher không phải DB thứ hai.

Quan hệ: groups, plans, notifications, workerLeases.

Quyền: Server/worker only; emit after commit; direct SDK deny.

Query/index: I13; exempt payload/recipient list không query.

| Field | Type DB | R/O | Validation |
|---|---|---|---|
| `eventName` | string | R | Một event contract hiện có. |
| `groupId` | string or null | R | Scope room nếu có. |
| `userId` | string or null | R | Personal scope nếu có. |
| `entityId` | string or null | R | ID refetch, không nhét raw secret. |
| `recipientUids` | array<string> | O | Snapshot recipients cho notification intent; bounded/ACL checked. |
| `payload` | map | R | Metadata nhỏ, đúng contract. |
| `status` | enum(PENDING,PROCESSING,DONE,DEAD) | R | Worker kiểm và retry idempotent. |
| `attempts` | integer | R | >=0, capped policy. |
| `availableAt` | Timestamp | R | Backoff scheduling. |
| `leaseOwner` | string or null | R | Worker giữ lease. |
| `leaseUntil` | Timestamp or null | R | Retry khi worker chết. |
| `lastError` | string or null | R | Redacted code only. |
| `createdAt` | Timestamp | R | Domain commit timestamp. |
| `updatedAt` | Timestamp | R | Worker timestamp. |
| `schemaVersion` | integer | R | Giá trị 1 ở schema đích; không gửi vào DTO nếu contract không có. |

```json
{
  "eventName": "plan:updated",
  "groupId": "demo-group",
  "userId": null,
  "entityId": "<plan-id>",
  "payload": {
    "planId": "<plan-id>"
  },
  "status": "PENDING",
  "attempts": 0,
  "availableAt": "2026-11-17T00:00:00.000Z",
  "leaseOwner": null,
  "leaseUntil": null,
  "lastError": null,
  "createdAt": "2026-11-17T00:00:00.000Z",
  "updatedAt": "2026-11-17T00:00:00.000Z",
  "schemaVersion": 1
}
```

### 23. workerLeases/{jobKey}

Lease/fencing khi nhiều worker hoặc restart.

Quan hệ: outbox, weatherChecks.

Quyền: Server-only.

Query/index: Direct doc by logical job key.

| Field | Type DB | R/O | Validation |
|---|---|---|---|
| `owner` | string | R | Instance ID, không credential. |
| `fencingToken` | integer | R | Tăng khi cấp lease; stale owner không ghi domain state. |
| `expiresAt` | Timestamp | R | Backend clock synchronized; check transaction. |
| `heartbeatAt` | Timestamp | R | Renew lease. |
| `updatedAt` | Timestamp | R | Server time. |
| `schemaVersion` | integer | R | Giá trị 1 ở schema đích; không gửi vào DTO nếu contract không có. |

```json
{
  "owner": "<instance-id>",
  "fencingToken": 1,
  "expiresAt": "2026-11-17T00:01:00Z",
  "heartbeatAt": "2026-11-17T00:00:00.000Z",
  "updatedAt": "2026-11-17T00:00:00.000Z",
  "schemaVersion": 1
}
```

## 9. Field con dùng chung trong schema

Các field con sau không phải collection mới. Ví dụ PlanItemCore nằm trong entry plans, SourceFact trong entry weatherChecks; constraints trong plans. `HourForecast.time` là ngoại lệ có chủ đích giữ ISO trong normalized payload như source hiện tại, không ép mọi field tên time thành Timestamp.

### PlanItemCore (plans.items[])

| Field | Type DB | R/O | Validation |
|---|---|---|---|
| id | string | R | ID item cũ hoặc server cấp; unique trong plan. |
| placeId | string | R | Tham chiếu catalogue; retired items lịch sử vẫn giữ. |
| position | integer | R | API SQL 0-based; giữ thứ tự/unique position khi import. |
| startTime | Timestamp | R | Serialize ISO trong PlanItem DTO. |
| endTime | Timestamp | R | >startTime. |
| travelMin | integer | R | >=0, estimate không phải live traffic. |
| costVnd | integer | R | >=0, có thể assumption; source unknown không gọi là miễn phí. |
| reason | string | R | Validated explanation. |
| factIds | array<string> | R | Giữ fact refs có nguồn, không sinh ID bịa. |

### Constraints snapshot (plans.constraints)

| Field | Type DB | R/O | Validation |
|---|---|---|---|
| cityId | string | R | City group khi mở proposal. |
| tripDate | string YYYY-MM-DD | R | Ngày Việt Nam, không Timestamp. |
| startHour | integer | R | Giữ group window lúc generation. |
| endHour | integer | R | >start, <=24. |
| budgetPerPersonVnd | integer | R | Giữ budget snapshot. |
| mode | enum(DEMO,LIVE) | R | Phải khớp lúc commit/vote; không dùng nhầm DEMO làm LIVE. |

### SourceFact (weatherChecks.sources[provider])

| Field | Type DB | R/O | Validation |
|---|---|---|---|
| snapshotId | string or null | R | Tham chiếu weatherSnapshots; null nếu missing. |
| selectedFacts | map | R | Facts source đã chọn; không thêm provider key. |
| isUsable | boolean | R | False nếu thiếu/cũ/không hợp lệ. |
| isRainRisk | boolean | R | Rule decision; false cùng isUsable=false không phải clear weather. |
| unusableReason | string or null | R | Reason code/explanation khi không dùng được. |

### HourForecast (weatherSnapshots.normalizedForecast[])

| Field | Type DB | R/O | Validation |
|---|---|---|---|
| time | string ISO | R | Giữ kiểu normalized HourForecast hiện tại, không đổi timestamp semantics trong array khi import. |
| rainMmH | number or null | R | Unknown=null, không tự 0. |
| probabilityPct | number or null | R | 0..100 nếu có, không average phiếu nguồn. |
| temperatureC | number or null | O | Nguồn chưa có có thể null/absent; không lưu undefined. |
| windKmh | number or null | O | >=0 nếu có; không lưu undefined. |

