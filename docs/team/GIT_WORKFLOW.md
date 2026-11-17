# Workflow Git/GitHub của nhóm

## 1. Repository hiện tại và lịch sử

- Root là thư mục clone chứa `package.json`, `apps/`, `docs/` và `.git`.
- Remote đã được owner xác nhận: [tungvucit23-rgb/project-CSW434](https://github.com/tungvucit23-rgb/project-CSW434).
- Nhánh xuất bản là `main`, theo dõi `origin/main`. Commit đầu `cca1dee` chỉ chứa README vì chỉ chạy `git add README.md`; source còn lại không bị mất hoặc bị `.gitignore` chặn.
- Phase 5 thêm source hoàn chỉnh trong commit kế tiếp, giữ nguyên commit đầu. Chi tiết audit và kiểm chứng clone ở [GITHUB_HANDOFF](GITHUB_HANDOFF.md). Trạng thái “chưa có Git” trong báo cáo Phase 3/4 chỉ mô tả lúc kiểm tra trước đó.
- Không `git init` lại, không đổi origin, không sửa lịch sử, không force-push hoặc xóa nhánh.

## 2. Clone và kiểm tra source

```powershell
git clone https://github.com/tungvucit23-rgb/project-CSW434.git
cd project-CSW434
git rev-parse --show-toplevel
git status --short --branch
git remote -v
git ls-files apps/mobile apps/server docs/team
npm.cmd ci
npm.cmd run typecheck
node scripts/validate-source-publication.mjs --tracked
node scripts/validate-team-handoff.mjs
```

macOS/Linux dùng `npm` thay `npm.cmd`. Làm tiếp theo [TEAM_SETUP](TEAM_SETUP.md). Nếu clone/push cần đăng nhập: dùng Git Credential Manager hoặc `gh auth login` bằng tài khoản được cấp quyền; không gửi token cho đồng đội hoặc ghi token vào remote URL.

`.gitignore` không gỡ file đã track. Trước mỗi commit kiểm `git diff --cached --stat`, `git diff --cached --name-only`, `git diff --cached --check` và nội dung staged diff. Chạy `node scripts/validate-source-publication.mjs --staged` để kiểm chính Git index; chỉ stage file đúng task. Không dùng `git add -f` cho secrets, DB exports, dependencies hay APK. Keystore không nằm trong Git; tạo local debug signing theo [ANDROID](../ANDROID.md).

Nếu push bị từ chối do remote có commit mới: fetch, đọc graph rồi merge/PR phù hợp, không force-push. Không overwrite origin nếu URL khác mong đợi: xác minh với owner trước.

## 3. Chiến lược nhánh

| Nhánh | Vai trò |
|---|---|
| main | Chỉ release đã được review; branch protection, không push trực tiếp thường ngày |
| integration | Tích hợp thay đổi đã review của ba workstream; test Firebase/emulator + frontend |
| frontend | Công việc UI/adapters/Auth client của Frontend owner |
| backend | API/services/repositories/AI/weather/voting của Backend owner |
| database | Firebase config/Rules/indexes/seed/migration của Database owner |
| feat/backend-auth, feat/database-indexes, fix/frontend-auth-refresh | Nhánh ngắn hạn cho từng PR |

**Không tạo `backend/foo` nếu đã có nhánh `backend`**, tương tự frontend/database: Git ref file/directory sẽ xung đột. Dùng prefix `feat/`, `fix/`, `docs/`, không namespace dưới nhánh dài hạn cùng tên.

Chủ dự án tạo integration và các branch từ initial main đã publish:

```powershell
git switch -c integration
git push -u origin integration
git switch -c frontend
git push -u origin frontend
git switch integration
git switch -c backend
git push -u origin backend
git switch integration
git switch -c database
git push -u origin database
```

Các lệnh này chỉ dùng khi branch chưa tồn tại; nếu đã có, fetch và switch tracking branch, không ghi đè/xóa. Team có thể rút gọn còn main/integration + feature branches nếu long-lived branches gây nhiều merge; phải thống nhất trước, không đổi âm thầm.

## 4. Workflow hàng ngày và PR

```powershell
git fetch origin
git switch integration
git pull --ff-only
git switch -c feat/backend-auth
# Chỉ sửa scope của task; thêm tests/docs liên quan.
git status --short
git diff
git add apps/server/src/auth.ts apps/server/test/<actual-test-file> docs/team/<actual-doc-file>
git diff --cached
git commit -m "feat(backend): verify Firebase ID tokens"
git push -u origin feat/backend-auth
```

Tên file trong `<...>` là placeholder cần thay. PR vào workstream/integration theo milestone; [PR template](../../.github/PULL_REQUEST_TEMPLATE.md) yêu cầu ghi implementation/mock/planned, tests thực và contract impact. Commit convention: `feat(scope):`, `fix(scope):`, `docs(team):`, `test(scope):`, `chore(scope):`. Không đưa password, key hay dữ liệu thật vào commit message/screenshot.

Review bắt buộc bởi owner layer bị ảnh hưởng: schema/index/query có DB + Backend; auth DTO có Frontend + Backend; migration/cutover có cả ba. Merge integration → main chỉ sau checklist E2E. Root CI hiện chạy SQL/AI smoke; Phase 4 bổ sung frontend unit và docs validator, **chưa phải Firebase CI**.

## 5. Conflict và lockfile

- Commit/stash work có chủ đích trước khi merge; không reset --hard để “sửa conflict”. Dùng `git merge origin/integration`, đọc từng conflict theo source owner và giữ cả test có giá trị. Không chọn ours/theirs toàn bộ cho contract/schema.
- Khi package manifests đổi: thống nhất phiên bản, resolve manifest rồi để npm tạo lockfile đúng; không hand-edit khóa dependency hoặc xóa lock chỉ để CI xanh. Người thêm dependency commit manifest + lock trong một PR. Review lock diff để tránh upgrade ngoài scope.
- Không sửa migration cũ đã được team dùng như thể chưa tồn tại; tạo migration/version mapping mới. Rules/indexes thay đổi kèm tests; không giải conflict bằng mở read/write toàn bộ.
- Sau merge chạy typecheck/test/build/doc validation và API/Firebase tests khi đã tồn tại. Nếu cần abort merge, `git merge --abort` chỉ khi hiểu trạng thái, không xóa branch.

## 6. Release

Khi main đã đạt Definition of Done, owner tạo annotated tag (ví dụ `v0.4.0-handoff` chỉ là tên đề xuất, chưa có tag nào được tạo):

```powershell
git switch main
git pull --ff-only
git tag -a v0.4.0-handoff -m "Reviewed architecture and integration handoff"
git push origin v0.4.0-handoff
```

Release note ghi commit, API/data schema version, environment, tests, APK signing/runtime evidence và rollback. Không đính service account, `.env`, PGlite data, node_modules hay emulator export. Artifact test/build thuộc release/CI storage, không source commit.
