# Checklist tích hợp và nghiệm thu

Các ô dưới là **việc target còn phải làm**, trừ khi có bằng chứng ghi rõ trong [VERIFICATION](VERIFICATION.md). Không tự đánh dấu xong từ mock hay SQL test. Owner theo [INTEGRATION_PLAN](INTEGRATION_PLAN.md).

## Repository và môi trường — chủ dự án / cả nhóm

- [x] Owner cấp GitHub URL thật, Git `main` đã khởi tạo; Phase 5 bổ sung source đã review theo [GITHUB_HANDOFF](GITHUB_HANDOFF.md).
- [ ] Nhóm tạo/chốt integration và workstream branches; owner cấu hình PR/branch protection trên GitHub.
- [ ] Cả nhóm clone được và cài chỉ công cụ theo vai trò; Backend/DB không cần Android Studio.
- [ ] Public templates tách .env thật; ADC/service accounts nằm ngoài repo; production không emulator/demo.
- [ ] Node/CLI/SDK versions pin và CI kiểm lockfile; emulator UI4401 không trùng Express4000.

## Firebase foundation — Database

- [ ] Project dev/prod, region/IAM, Firebase Auth Email/Password và email/action domains được cấu hình.
- [ ] Firestore collections/fields/nullable dates/provenance theo schema; không SQL password hash trong profiles.
- [ ] Rules chặn direct private reads/writes và votes/currentPlan; catalogue public chỉ có public fields.
- [ ] Composite indexes khớp query; payload lớn không index bừa; dev cloud index test ngoài emulator.
- [ ] Auth/Firestore emulator cùng project, JDK/CLI đúng; Rules tests + seed idempotent có logs.

## Backend — Backend Developer

- [ ] Port repository khỏi SQL, không rewrite pure AI/weather validators hoặc dựng backend thứ hai.
- [ ] Verify Firebase ID token/revocation; caller UID/role không lấy từ body. HTTP/socket token expiry/room revocation xử lý đúng.
- [ ] Current user/profile bootstrap idempotent; compatibility login/register giữ `{token,user}`; không phát custom token như ID token.
- [ ] Password reset/change handlers thật, generic reset response, current-password reauth và revoke sessions.
- [ ] City/place IDs, 80+40 visible catalogue và retired detail còn đủ; unknown info giữ null, không fake coordinates.
- [ ] Group create/join leader/member/prefs/invite expiry atomic; caller-specific Group.role đúng.
- [ ] expectedRevision giữ SQL overwrite audit, hoặc có PR đổi contract/CAS được Frontend duyệt; mode change clear currentPlanId đúng.
- [ ] Wishlist idempotent, comments XOR/target/author, personal notifications/read, activity đúng với event thực/target được thống nhất.
- [ ] Outbox post-commit/idempotent fanout, reconnect REST refetch; không hai authoritative transports.
- [ ] AI allowed ID/fact/time/budget/schema kiểm chặt; RULE_BASED thật có nhãn; không gọi paid LLM trong CI.
- [ ] Weather normalization/cache/source status/provenance, rolling budget, lease/dedupe, rain reports/verification/radar đúng semantics.
- [ ] Vote snapshot gồm ballot null; duplicate/change choice/counter/majority/base/constraints/deadline kiểm transaction; expired/stale status persist trước HTTP409.
- [ ] Hai phiếu đồng thời và hai competing winners chỉ apply một lần, approved plan cùng group, no client writes.

## Frontend — Frontend Developer

- [ ] Giữ Mock Mode độc lập và 40 routes; không hardcode API result trong screen.
- [ ] Auth SDK provider/persistence/refresh ở adapter; SDK signup/login không double-submit REST auth; refresh không reset navigation mỗi lần.
- [ ] API Mode dùng ID token mới cho HTTP/socket; protected failure không đổi sang mock; loading/error/empty/reconnect đúng.
- [ ] Hoàn thành journey API Mode với hai users thật trên dev/emulator; mock persona switching không tính multi-device.
- [ ] Forecast event invalidation, map/timeline/wishlist/notifications đồng bộ; giữ nguồn và nhãn demo/live/unknown.
- [ ] Test Android runtime với device/emulator nếu có: keyboard, GPS consent/error, native map key, navigation, offline/recovery. APK build chỉ là build evidence.

## Migration/cutover — Database + Backend + owner

- [ ] Backup/source freeze/export manifest/count/hash; tất cả 20 SQL tables có mapping, preserve IDs/FKs hoặc map explicit.
- [ ] User UID/email conflict review, reset/claim strategy; không import scrypt hash theo phỏng đoán.
- [ ] Timestamp/date/nullable states, ballot snapshot, plan status/base/current, retired catalogue, comment deleted/read/dedupe và AI/weather evidence được kiểm.
- [ ] Dry-run import/retry idempotent, publisher/worker tắt để không gửi thông báo lịch sử; Rules/API/DTO parity tests pass.
- [ ] Rollback đã rehearsal; sau Firebase writes có delta reconciliation, không trỏ về SQL stale.
- [ ] Owner quyết định cutover, logout legacy sessions, main release/tag có commit/evidence và known limits.

## Lệnh regression hiện có

```powershell
npm.cmd run typecheck
npm.cmd test -w @di-chung/mobile
npm.cmd test -w @di-chung/server
npm.cmd run test:integration
npm.cmd run test:llm
npm.cmd run build:web -w @di-chung/mobile
node scripts/team-audit.mjs
node scripts/validate-team-handoff.mjs
```

Frontend browser cần Expo đang chạy: `npm run test:ui -w @di-chung/mobile`; production export smoke: `node apps/mobile/tests/export-smoke.mjs`. Firebase test/seed scripts còn phải được implementation và CI job tương ứng trước khi thêm vào danh sách “đã chạy”.
