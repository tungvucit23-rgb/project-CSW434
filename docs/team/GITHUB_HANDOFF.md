# Bàn giao GitHub — Phase 5

Repository: [tungvucit23-rgb/project-CSW434](https://github.com/tungvucit23-rgb/project-CSW434), nhánh `main`. Root là thư mục clone chứa `package.json` và hai workspace `apps/mobile`, `apps/server`. Dùng `git rev-parse --show-toplevel`, `git log -1 --oneline`, `git ls-files` để đọc root, commit và danh sách file thực tế trên máy của bạn.

## Phạm vi xuất bản

Commit đầu `cca1dee` chỉ có README do lệnh staging ban đầu là `git add README.md`. Source hiện có được thêm bằng commit mới, không reset/amend commit đầu, không đổi remote hoặc force-push. Không tạo lại repository, không phát triển feature hoặc chuyển Firebase trong phase này.

Các thành phần cần có khi clone:

- Frontend Expo/React Native/TypeScript: 40 route, Mock/API adapters, types, map vendor assets và licenses, tests, Expo/TS config; native Android source và Gradle wrapper.
- Backend Express/Socket.io/TypeScript: source, SQL migration, seed/catalogue và tests. Hiện dùng PostgreSQL/PGlite, chưa phải Firestore.
- Root/workspace manifests và package-lock, Docker Compose tùy chọn, scripts kiểm thử/audit, CI và PR template.
- `.env.example`, `.env.firebase.example` đã review; Firebase templates ghi rõ PLANNED ONLY, chưa được code hiện tại đọc.
- Toàn bộ tài liệu `docs/`, bao gồm [11 tài liệu bàn giao chính](README.md), [API contract](API_CONTRACT.md) và [schema/migration Firebase](DATABASE_DEVELOPMENT_PLAN.md).

Không xuất bản `node_modules`, `.env` thật, local PGlite/JWT secret, service-account/private keys, keystore, emulator userdata, Gradle/CMake caches, dist, APK/AAB hoặc test artifacts. Bằng chứng Phase 3/4 được nhắc bằng đường dẫn văn bản local; file artifact không phải yêu cầu để clone chạy source.

## Audit trước commit

- Root/branch/remote đối chiếu Git thực; không có nested Git repository trong cây source của dự án. Dependency/build/artifact directories được bỏ qua khi tìm nested repos vì không thuộc source bàn giao.
- Không cấu hình `core.excludesfile` hoặc global ignore mặc định trên máy audit; `.git/info/exclude` chỉ có comment. `.gitignore` local không chặn các source/config/templates cần bàn giao.
- Kiểm tất cả publication candidates và chính staged blobs: private-key blocks, OpenAI/GitHub/Google/AWS token patterns, JWT literals, service-account keys, credential URLs, binary/file size và đường dẫn nhạy cảm.
- Rà soát thủ công các giá trị password/secret còn thấy trong fixtures/tests/docs: mật khẩu persona mock, signing debug mặc định `android`, test-only JWT/model keys, placeholder và Docker default `local-development-only`. Chúng chỉ phục vụ mock hoặc isolated local tests; không phải credentials cá nhân/production, không dùng cho triển khai thật. Server phát triển tự tạo JWT secret trong `.data` bị ignore; production yêu cầu secret riêng.
- Secret scan theo pattern cùng review thủ công là kiểm tra phạm vi source đã xuất bản, không phải bảo đảm không thể có mọi dạng secret. Log scan không in giá trị nhạy cảm.
- Tất cả Markdown links nội bộ phải trỏ tới file/thư mục có trong Git, không dựa file chỉ có trên máy owner. Không dùng đường dẫn riêng của máy owner trong hướng dẫn clone.
- `git diff --cached --check` ở lần import source đầu phát hiện trailing spaces/blank EOF có sẵn trong source/tài liệu sinh. Đã review: đây là định dạng cũ, không phải secret hay lỗi compile. Giữ nguyên runtime frontend/backend và SQL thay vì format lại ngoài scope. Typecheck/unit tests và source/contract validators là các gate trước commit.

Lệnh tái tạo:

```powershell
node scripts/team-audit.mjs
node scripts/validate-team-handoff.mjs
node scripts/validate-source-publication.mjs --tracked
# Trước commit: audit chính Git index sau khi stage đúng file.
node scripts/validate-source-publication.mjs --staged
git diff --cached --check
git diff --cached --stat
```

Report máy đọc được nằm trong `artifacts/phase5/source-publication-audit.json` (ignored). Các ảnh PNG/WebP native và Gradle wrapper JAR là binary source/tooling cần thiết, không phải APK hoặc build cache.

## Kiểm chứng clean clone

Phase 5 thực hiện kiểm chứng clone từ remote sau commit source. Kết quả sẽ được ghi bằng commit tài liệu tiếp theo sau khi các lệnh thật kết thúc; không lấy node_modules trên máy owner làm bằng chứng `npm ci` ở clone.

| Hạng mục | Trạng thái trước lần push source |
|---|---|
| Clone GitHub vào thư mục trống, không copy node_modules/.env | Chờ xuất bản source và kiểm tra |
| `npm.cmd ci` với lockfile | Chờ kiểm tra trên clone |
| Typecheck mobile + server, tests được ghi ở TEAM_SETUP | Chờ kiểm tra trên clone |
| Frontend Mock Mode, 40 route và backend source | Chờ kiểm tra trên clone |
| Links/API contract/Firebase plan | Có validator; sẽ chạy lại ở clone |

Không coi test SQL/PGlite hoặc mock là test Firebase. Chưa có SDK/Admin/Rules/indexes/migration Firebase hoạt động. Native full journey, paid AI/weather integration và production release không nằm trong Phase 5.

## Bắt đầu theo vai trò

1. **Frontend:** làm theo [TEAM_SETUP](TEAM_SETUP.md), giữ UI và Mock/API adapters; chuẩn bị Firebase Auth provider/persistence/token refresh sau khi thống nhất contract với Backend.
2. **Backend:** chạy baseline Express SQL/PGlite và tests trước; port repositories sang Firestore bằng Admin SDK, giữ [API contract](API_CONTRACT.md) và xử lý [các khác biệt đã audit](CONTRACT_CLARIFICATIONS.md).
3. **Database:** cấu hình Firebase Auth/Firestore/Emulator, IAM, Rules/indexes, seed và migration có verify/rollback theo [DATABASE_DEVELOPMENT_PLAN](DATABASE_DEVELOPMENT_PLAN.md). Không copy password hash SQL vào Firebase theo phỏng đoán.

Owner còn cần cấp quyền GitHub cho từng thành viên và cấu hình branch protection/required checks theo chính sách nhóm. Phase 5 không tự tạo workstream branches hoặc đổi settings tài khoản/repository.
