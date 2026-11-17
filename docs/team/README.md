# Bàn giao kỹ thuật Đi Chung — Phase 4

Ngày kiểm tra: **17/11/2026**, múi giờ `Asia/Ho_Chi_Minh`. Bộ này mô tả mã nguồn đang có và thiết kế bước tiếp theo; **chưa triển khai Firebase, chưa di chuyển dữ liệu**. Phase 5 bổ sung [bàn giao GitHub và kiểm chứng clone](GITHUB_HANDOFF.md); kết quả Phase 3/4 được giữ như bằng chứng lịch sử.

## Đọc theo vai trò

| Người nhận | Đọc trước | Sản phẩm cần bàn giao tiếp |
|---|---|---|
| Backend | [Kiến trúc](PROJECT_ARCHITECTURE.md), [Hợp đồng API](API_CONTRACT.md), [Kế hoạch Backend](BACKEND_DEVELOPMENT_PLAN.md) | Express dùng Firebase Admin, repository Firestore, xác thực/phân quyền, giao dịch vote, AI/weather và kiểm thử |
| Database | [Kế hoạch Database và schema](DATABASE_DEVELOPMENT_PLAN.md), [Môi trường](ENV_SETUP.md), [Tích hợp](INTEGRATION_PLAN.md) | Firebase Auth/Firestore, IAM, Rules/indexes, seed emulator và quy trình migration có rollback |
| Frontend / chủ dự án | [Kiểm chứng](VERIFICATION.md), [Điểm cần thống nhất](CONTRACT_CLARIFICATIONS.md), [Checklist](INTEGRATION_CHECKLIST.md) | Giữ Mock Mode; bổ sung Firebase Auth provider/refresh bên trong adapter khi tích hợp, không viết lại màn hình |
| Cả nhóm | [Cài máy](TEAM_SETUP.md), [Tech stack](TECH_STACK.md), [Git workflow](GIT_WORKFLOW.md) | Cài đúng công cụ theo vai trò, tạo repository chung và làm PR theo phạm vi |

## Những gì đã xác nhận

- `apps/mobile`: 40 route, chung `request<T>` và `DataAdapter`; frontend độc lập trong Mock Mode. Không phải 40 file màn hình riêng.
- `apps/server`: **đã có 38 REST operation**, JWT riêng, Socket.io, planner/recommendations, weather worker và giao dịch SQL. Không bắt đầu backend từ số không.
- CSDL hiện tại: PostgreSQL nếu có `DATABASE_URL`, PGlite nếu không; 20 bảng trong một migration idempotent `001_initial.sql`.
- Đích thống nhất: **Firestore là nguồn dữ liệu vận hành duy nhất**, Firebase Authentication là nguồn danh tính; Express kiểm quyền và ghi Admin SDK. Socket.io chỉ truyền invalidation/typing, REST đọc lại dữ liệu Firestore. Không bật song song listener Firestore trong màn hình.
- Firebase SDK/Admin/CLI/Rules tests **chưa có trong manifest/lockfile**. Hai password endpoint chỉ có mock/UI, chưa có handler thật.
- Git đã được khởi tạo trên `main`, remote thật là [project-CSW434](https://github.com/tungvucit23-rgb/project-CSW434). Commit đầu `cca1dee` chỉ chứa README do chỉ stage README. Phase 5 đưa source và tài liệu vào commit tiếp theo, giữ nguyên lịch sử; trạng thái mới xem [GitHub handoff](GITHUB_HANDOFF.md).

Kết quả chạy lại và giới hạn bằng chứng nằm trong [VERIFICATION.md](VERIFICATION.md). Các con số Phase 3 là lịch sử cho đến khi được kiểm tra lại; APK ngày 11/11 không được coi là kiểm thử thiết bị ngày 17/11.

## Tài liệu chính

1. [PROJECT_ARCHITECTURE.md](PROJECT_ARCHITECTURE.md)
2. [BACKEND_DEVELOPMENT_PLAN.md](BACKEND_DEVELOPMENT_PLAN.md)
3. [DATABASE_DEVELOPMENT_PLAN.md](DATABASE_DEVELOPMENT_PLAN.md)
4. [API_CONTRACT.md](API_CONTRACT.md)
5. [TECH_STACK.md](TECH_STACK.md)
6. [ENV_SETUP.md](ENV_SETUP.md)
7. [TEAM_SETUP.md](TEAM_SETUP.md)
8. [INTEGRATION_PLAN.md](INTEGRATION_PLAN.md)
9. [GIT_WORKFLOW.md](GIT_WORKFLOW.md)
10. [INTEGRATION_CHECKLIST.md](INTEGRATION_CHECKLIST.md)

Tham chiếu giữ nguyên: [handoff frontend Phase 3](../../apps/mobile/FRONTEND_HANDOFF.md), [inventory 40 route](../../apps/mobile/SCREEN_INVENTORY.md), [mock scenarios](../../apps/mobile/MOCK_SCENARIOS.md), [API cũ](../API-CONTRACT.md), [AI Phase 2](../PHASE-2-AI.md), [bản đồ](../TRAVEL-MAP.md). Nếu khác nhau: handler/Zod và DTO đang chạy quyết định hiện trạng; tài liệu Phase 4 xác định đích migration và nêu rõ chỗ cần thay đổi. Không sửa lịch sử Phase 3 để làm như Firebase đã tồn tại.

## Việc đầu tiên

- Frontend: giữ các test mock; thống nhất Auth provider, token refresh và mốc đổi sang API với Backend.
- Backend: chạy backend SQL hiện tại và test; tách repository mà giữ nguyên DTO, rồi làm Auth + catalogue Firestore trên emulator.
- Database: tạo dự án dev/prod riêng, emulator `demo-di-chung`, triển khai schema/Rules/indexes và seed đã thống nhất; không import password hash SQL.

Các tệp dưới [examples](examples/firebase.json.example) và các `.env.firebase.example` là **mẫu thiết kế chưa được ứng dụng hiện tại đọc**. Không deploy mẫu như hệ thống đã hoàn chỉnh.
