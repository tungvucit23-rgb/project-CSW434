# Bàn giao GitHub — Phase 5

Repository: [tungvucit23-rgb/project-CSW434](https://github.com/tungvucit23-rgb/project-CSW434), nhánh `main`. Root là thư mục clone chứa `package.json` và hai workspace `apps/mobile`, `apps/server`. Dùng `git rev-parse --show-toplevel`, `git log -1 --oneline`, `git ls-files` để đọc root, commit và danh sách file thực tế trên máy của bạn.

## Phạm vi xuất bản

Commit đầu `cca1dee` chỉ có README do lệnh staging ban đầu là `git add README.md`. Commit source **`24ab1dd9b244749dcde950373bb8655d38f298ea`** đã được push bình thường lên `origin/main` và kiểm chứng bằng `git ls-remote`; không reset/amend commit đầu, không đổi remote hoặc force-push. Commit tài liệu kế tiếp ghi kết quả clone, giữ nguyên source đã kiểm. Không tạo lại repository, không phát triển feature hoặc chuyển Firebase trong phase này.

Source commit có **186 tệp tracked** (source, configs, tests và docs), khoảng **2,75 MB** Git blobs; file lớn nhất là lockfile, dưới 0,4 MB. Không có file vượt ngưỡng audit 10 MiB.

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

Đã kiểm ngày **17/11/2026** trên Windows, Node **24.18.0**, npm **11.16.0**. Clone HTTPS trực tiếp từ GitHub vào thư mục tạm mới **ngoài workspace gốc**, ở commit source `24ab1dd`. Trước cài không có node_modules hoặc `.env`; không copy chúng từ máy owner. Npm có dùng cache tải package bình thường. Một lần cài trên local Git clone đã chạy trước lúc xác thực push, nhưng kết quả bảng dưới là từ **clone GitHub riêng** sau khi xuất bản.

| Hạng mục / lệnh thực | Kết quả trên clone GitHub |
|---|---|
| `git clone --branch main https://github.com/tungvucit23-rgb/project-CSW434.git` | PASS; HEAD trùng commit source đã push |
| `npm.cmd ci --no-fund --no-audit` | PASS; cài 733 packages từ lockfile, exit 0 |
| `npm.cmd run typecheck` | PASS mobile + server |
| `npm.cmd test -w @di-chung/mobile` | 66 pass, 0 fail |
| `npm.cmd test -w @di-chung/server` | 35 pass, 0 fail |
| `npm.cmd run test:llm` | 4 pass; local HTTP model stub, không gọi paid model |
| `npm.cmd run test:integration` | 16 pass; Express/Socket.io với PGlite isolated, không dùng DB làm việc |
| `npm.cmd run web -w @di-chung/mobile -- --port 8097` | PASS với CI=1, BROWSER=none, EXPO_PUBLIC_DATA_SOURCE=mock; không cần backend/Firebase/secrets |
| `APP_URL=http://127.0.0.1:8097 npm run test:ui -w @di-chung/mobile` | 18 recorded checks pass, đủ 40 route (37 authenticated + 3 public), 0 backend requests, 0 page errors |
| `npm.cmd run build:web -w @di-chung/mobile` | PASS, tạo static export từ source clone |
| `node apps/mobile/tests/export-smoke.mjs` | PASS: auth/Home, map 80 điểm, production controls, 0 backend requests/errors |
| `node scripts/team-audit.mjs` | 40 route, 38 Express handlers, 20 SQL tables; manifest/lock không lệch |
| `node scripts/validate-team-handoff.mjs` | PASS: đủ 11 docs bắt buộc, 143 internal links trong bộ team |
| `node scripts/validate-source-publication.mjs --tracked` | PASS: 186 file, 199 internal Markdown links toàn source, không thiếu target/source |
| `git status --short --branch` sau tests | Working tree sạch; generated files chỉ nằm trong các thư mục ignored |

Source commit cũng có [GitHub Actions Check project thành công](https://github.com/tungvucit23-rgb/project-CSW434/actions/runs/44034747111), theo workflow Ubuntu/Node22 trong repo: npm ci, typecheck, server/mobile tests, audit/docs, LLM stub, SQL integration và web export. Đây là kiểm chứng CI thực, không phải suy đoán từ file YAML.

Log/JSON đã gom về `artifacts/phase5/` tại máy kiểm chứng (ignored): `github-install.log`, `typecheck.log`, `mobile-tests.log`, `server-tests.log`, `api-integration.log`, `llm-contract.log`, `browser-journey.log`, `github-browser-results.json`, `web-build.log`, `production-export.log`, `github-source-audit.json` và `github-document-validation.json`. Source repo có scripts/tests để mỗi thành viên chạy lại; không cần tải artifacts của owner.

Cài đặt có cảnh báo deprecation từ dependency gián tiếp và npm allow-scripts cho esbuild trên máy kiểm chứng; tests thực tế vẫn pass. Expo CLI cũng đề xuất patch Expo/location mới hơn và dùng DevTools fallback khi tải thất bại. Phase 5 giữ nguyên lockfile, không tự upgrade dependencies. Audit phase này kiểm source/secrets, **không phải chứng nhận không có dependency vulnerabilities**; lệnh install phía trên tắt npm registry audit để tách riêng phạm vi kiểm chứng cài đặt.

Không còn blocker xuất bản/clone sau khi owner hoàn tất đăng nhập Git Credential Manager. GitHub CLI chưa đăng nhập không chặn Git HTTPS đã xác thực. Quyền push từng thành viên và branch protection vẫn là việc owner cấu hình; Firebase/runtime integration là công việc kế tiếp.

Không coi test SQL/PGlite hoặc mock là test Firebase. Chưa có SDK/Admin/Rules/indexes/migration Firebase hoạt động. Native full journey, paid AI/weather integration và production release không nằm trong Phase 5.

## Bắt đầu theo vai trò

1. **Frontend:** làm theo [TEAM_SETUP](TEAM_SETUP.md), giữ UI và Mock/API adapters; chuẩn bị Firebase Auth provider/persistence/token refresh sau khi thống nhất contract với Backend.
2. **Backend:** chạy baseline Express SQL/PGlite và tests trước; port repositories sang Firestore bằng Admin SDK, giữ [API contract](API_CONTRACT.md) và xử lý [các khác biệt đã audit](CONTRACT_CLARIFICATIONS.md).
3. **Database:** cấu hình Firebase Auth/Firestore/Emulator, IAM, Rules/indexes, seed và migration có verify/rollback theo [DATABASE_DEVELOPMENT_PLAN](DATABASE_DEVELOPMENT_PLAN.md). Không copy password hash SQL vào Firebase theo phỏng đoán.

Owner còn cần cấp quyền GitHub cho từng thành viên và cấu hình branch protection/required checks theo chính sách nhóm. Phase 5 không tự tạo workstream branches hoặc đổi settings tài khoản/repository.
