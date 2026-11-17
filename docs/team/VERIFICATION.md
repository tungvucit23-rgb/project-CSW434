# Bằng chứng kiểm tra Phase 4

Ngày chạy: **17/11/2026**, múi giờ `Asia/Ho_Chi_Minh`. Mục đích là xác minh bàn giao và tránh coi báo cáo cũ như bằng chứng implementation Firebase mới.

> Đây là snapshot kiểm chứng **Phase 4**, trước lúc khởi tạo Git. Sau đó đã push README `cca1dee`, build/cài/mở app Mock Mode trên Pixel 9; Phase 5 xuất bản source. Trạng thái hiện tại và kiểm chứng clone ở [GITHUB_HANDOFF](GITHUB_HANDOFF.md). Các đường dẫn artifacts bên dưới là bằng chứng local không được commit.

## 1. Repository và source audit

- Root dự án `.`: npm workspace mobile/server; 40 route lấy từ `titles` trong App.tsx, 38 handler lấy từ Express app.ts, 20 bảng trong SQL migration.
- Firebase JS SDK/Admin/CLI/Rules testing chưa khai báo trong manifests/lock; không có cloud project/config/Rules/indexes hoạt động được tạo trong Phase 4.
- Không có `.git`/remote trong project; branch, commit hash, remote URL không khả dụng, không commit/push. `git diff` không thể chạy ở folder chưa là repository. Đối chiếu SHA-256 before/after thay cho kết luận diff giả.
- Snapshot `artifacts/phase4/source-baseline.json` được tạo trước thay đổi; validator với `--verify-runtime-baseline` so lại runtime frontend/server/migrations/tests và package manifests/lock. Kết quả máy đọc được ở `artifacts/phase4/source-integrity.json`. Flag này chỉ phục vụ kiểm chứng Phase 4; CI/default không cấm Backend sửa source hợp lệ ở phase triển khai sau.

**Các chỉnh sửa có chủ đích:** docs/team, link bàn giao trong root README, generators/validator/audit scripts, .gitignore, PR template, CI bổ sung frontend tests/docs check, comment trong server `.env.example` và hai template `.env.firebase.example`. Không implementation Firebase, không thay frontend screens/adapters/services/SQL schema hay business logic. SHA-256 đối chiếu **65 file** runtime/migrations/tests/manifests/lock: không thay đổi.

## 2. Kiểm thử thực đã chạy lại

| Kiểm tra | Kết quả | Bằng chứng local |
|---|---|---|
| `npm run typecheck` | PASS cả mobile và server, không lỗi TS | `artifacts/phase4/typecheck.log` |
| `npm test -w @di-chung/mobile` | **66 pass, 0 fail** | `artifacts/phase4/mobile-tests.log` |
| `APP_URL=http://127.0.0.1:8095 npm run test:ui -w @di-chung/mobile` | **18 recorded checks pass, 0 backend requests, 0 browser errors** | `artifacts/phase4/mobile-browser.log`, `frontend-browser-results.json` |
| Frontend journey | Login, Home, Discover, map Đà Lạt 80 điểm/clusters/search, detail/wishlist, AI setup/results/planner/route, group proposal/vote/notifs, weather/source/radar missing, comments/passwords/back | Cùng browser results; đủ 40 route được sweep (37 authenticated + 3 public flows) |
| `npm run test:integration` | **16 pass** trên backend SQL/PGlite isolated | `artifacts/phase4/legacy-api-integration.log`, `legacy-api-results.json` |
| `npm test -w @di-chung/server` | **35 pass, 0 fail** | `artifacts/phase4/server-tests.log` |
| `npm run test:llm` | **4 pass**, local HTTP model stub, không paid API | `artifacts/phase4/llm-contract.log` |
| Backend integration scope | Catalogue 80+40, retired details, group join/permissions, comments realtime, two concurrent votes/STALE, weather demo, reports, verification, preferences, overwrite audit | Không phải Firestore integration; không live-call paid model |
| `npm run build:web -w @di-chung/mobile` | PASS | `artifacts/phase4/web-build.log`, output apps/mobile/dist |
| Production export smoke | Kết quả thực trong `production-export-results.json`; 360×800, auth/Home/80-place map, dev controls ẩn | Chạy sau web export; không dùng ảnh mock làm bằng chứng |
| Docs/contract/config/ignore/secret checks | Xem summary JSON PASS và số link/check thực | `artifacts/phase4/document-validation.json` |

Log unit/contract và browser không chứng minh API Firebase đã triển khai. Backend smoke dùng service hiện có trên PGlite test riêng, không đụng `.data` của người dùng. Provider/LLM tests dùng fixtures/stubs hoặc DEMO; không tuyên bố model/key/gói tài khoản thật đã được kiểm.

## 3. Những claim Phase 3 được kiểm tra thế nào

| Claim | Kết luận audit |
|---|---|
| 40 route / 35 cải thiện + 5 thêm | Xác nhận 40 route hiện có; source/tài liệu lịch sử xác định năm route thêm, không có Git history để dựng diff Phase 2→3 độc lập |
| 66 automated tests và 18 browser checks | Đã chạy lại đúng hai bộ, giữ kết quả thực; không chỉ đọc log ngày 11/11 |
| Shared adapters / mock runnable | Đọc DataAdapter/facade/implementations và browser kiểm 0 backend request; giữ nguyên source |
| Web export hoàn tất | Đã build lại Phase 4, không dựa dist cũ |
| Android APK build Phase 3 | Có artifact/metadata ngày 11/11: arm64, min24/target36, debug/demo signing. Kiểm hash nếu artifact tồn tại, không gọi đó là build/runtime mới ngày 17/11 |
| Firebase readiness | Chỉ ranh giới adapter và tài liệu, **chưa có Firebase implementation**; còn Auth provider/refresh, Admin/repositories, Rules/indexes/migration |

## 4. Contract review

[API_CONTRACT](API_CONTRACT.md) phân biệt handler hiện có, sample mock và đích Firestore. Coverage nối 40 route → request facade → 40 operation → module/collection. TypeScript snapshot sinh từ source, không sửa kiểu để che mismatch.

Các phát hiện quan trọng ở [CONTRACT_CLARIFICATIONS](CONTRACT_CLARIFICATIONS.md): auth legacy vs Firebase, hai password route thiếu, Discovery enums/limits, empty enum query, search/pagination array, deadline/index khác mock, preserve retired IDs, comment target, **expectedRevision advisory overwrite thay vì CAS**, **mode change clear currentPlanId**, event thực không trùng mọi mock event. Firestore plan chọn semantics SQL làm baseline và ghi rõ phần mới.

## 5. Giới hạn và blocker còn lại

- Chưa có remote được cấp, nên chưa clone/PR/push được; không thử workaround credentials hoặc giả URL.
- Không cài Firebase packages/CLI, không tạo/deploy Firebase project/Rules/indexes, không chạy emulator tests mới hoặc migration. Đây là nhiệm vụ kế tiếp của Backend/Database, không thiếu implementation bị giấu dưới chữ “planning”.
- Client Firebase Auth provider/persistence/token refresh chưa có; password endpoints thật chưa có. Copy env template không bật tính năng.
- Không kiểm live paid OpenAI/weather plans/quota/key; không đảm bảo radar coverage. Giá/quota bên ngoài không được bịa.
- Phase 4 không rebuild APK hay test thiết bị Android; artifact build cũ và browser viewport không thay thế physical-device/runtime evidence.

## 6. Tái tạo audit tài liệu

```powershell
node scripts/team-audit.mjs
node scripts/generate-team-schema.mjs
npx.cmd tsx scripts/generate-team-contract.mts
node scripts/validate-team-handoff.mjs
# Riêng kiểm chứng before/after Phase 4 trên máy có snapshot:
node scripts/validate-team-handoff.mjs --verify-runtime-baseline
```

Các generator chỉ ghi docs/examples và artifacts audit, không chạy production services/migration. Sau thay đổi contract/source cần review lại trạng thái API và giữ test logs mới; đừng regenerate rồi mặc định mọi endpoint đều “verified”. `.gitignore` được kiểm bằng repository tạm trong thư mục temp, không `git init` vào project người dùng.
