# Đi Chung

## Bàn giao nhóm — Phase 4 (17/11/2026)

Backend và Database developers bắt đầu từ [docs/team/README.md](docs/team/README.md): kiến trúc, API contract, kế hoạch Backend/Firebase, cài máy theo vai trò và workflow Git. Hiện backend vẫn dùng PostgreSQL/PGlite; Firebase trong Phase 4 là thiết kế và kế hoạch, chưa triển khai. Frontend chạy độc lập bằng Mock Mode theo [hướng dẫn frontend](apps/mobile/FRONTEND_HANDOFF.md).

Các lệnh chạy hệ thống hiện tại và tài liệu các phase trước được giữ bên dưới.

Đồ án React Native: lập lịch du lịch nhóm trong một ngày, cộng tác realtime và đề xuất đổi lịch theo nguy cơ mưa. Giao diện tiếng Việt; một nhóm đi Đà Lạt hoặc Vũng Tàu. **AI chỉ đề xuất; nhóm biểu quyết mới đổi lịch.**

## Chạy trên Windows

Yêu cầu Node.js 22 trở lên. Mở PowerShell tại thư mục dự án:

```powershell
npm.cmd install
npm.cmd run dev
```

Hoặc chạy `START-DEMO.cmd`. API ở <http://localhost:4000/api/health>, giao diện ở <http://localhost:8081>. Chọn tài khoản demo trên màn hình đăng nhập để dùng ngay. Ba danh tính demo là ba người độc lập: không có cơ chế tự bỏ phiếu thay người dùng.

**APK Phase 2 đã build:** [`artifacts/di-chung-phase2-arm64.apk`](artifacts/di-chung-phase2-arm64.apk), khoảng 27 MB, dành cho thiết bị Android arm64/API 24+. Cài APK rồi nhập địa chỉ IP LAN backend ở mục kết nối trên màn đăng nhập. Đây là bản ký demo, chưa có client key Maps nên dùng danh sách/web hoặc cấu hình key và build lại; xem [hướng dẫn Android](docs/ANDROID.md). Bản Phase 1 vẫn giữ tại `artifacts/di-chung-travel-map-arm64.apk`.

**Phase 2:** Find My Perfect Trip gợi ý độc lập theo sở thích, khung giờ, ngân sách và thời tiết; lưu wishlist hoặc chuyển sang planner nhóm. Lịch trình có marker đánh số, đường nét đứt và timeline đồng bộ. [Báo cáo triển khai tám phần](docs/PHASE-2-AI.md) ghi rõ API, tệp sửa, kiểm thử và giới hạn. Chưa có key OpenAI trong môi trường nghiệm thu: kết quả hiện chạy RULE_BASED, chưa xác minh model thật.

Không cần Docker hoặc API key để chạy demo. Backend dùng **PostgreSQL qua PGlite**, lưu xuống `apps/server/.data/`. Đây là chế độ phát triển một tiến trình; triển khai nhiều tiến trình dùng PostgreSQL riêng qua `DATABASE_URL`.

## Cấu trúc

```text
apps/mobile/      React Native + Expo, chạy Android/iOS và web
apps/server/      Express + Socket.io, SQL, worker thời tiết, LLM
docs/             Thiết kế tám phần, API, kế hoạch, kịch bản demo, nguồn dữ liệu
scripts/          Kiểm tra tích hợp và giao diện
docker-compose.yml PostgreSQL riêng, tùy chọn
```

## Chế độ demo và thật

- **DEMO**: thời tiết giả lập có nhãn; lịch dùng bộ xếp lịch bằng luật khi thiếu khóa LLM. Khám phá có **80 điểm khu vực Đà Lạt với tọa độ nguồn OSM**, giữ 40 điểm Vũng Tàu. Vé/giờ/thời lượng chưa biết được tách khỏi giả định lập lịch. Xem [bản đồ và chất lượng dữ liệu](docs/TRAVEL-MAP.md).
- **LIVE**: chỉ lấy dữ liệu thật từ API. Thiếu key, lỗi mạng hoặc hết phạm vi dự báo được hiển thị là thiếu dữ liệu; không chèn số liệu giả.
- OpenAI gọi qua backend bằng Responses API với JSON Schema. Kết quả phải vượt qua kiểm tra địa điểm, thời gian, ngân sách, dữ kiện và nội dung giải thích. Lỗi có số lần thử lại giới hạn; fallback ghi rõ `RULE_BASED`.
- Cần ít nhất hai nguồn dự báo hợp lệ cùng ghi nhận nguy cơ. Tỷ lệ nguồn đồng thuận không phải xác suất mưa tổng hợp. Radar hiển thị diễn biến gần đây; không ngoại suy mưa tương lai trong bản này.

## Cấu hình API thật

Sao chép `apps/server/.env.example` thành `apps/server/.env`, rồi điền những khóa cần dùng. Không đưa `.env` vào Git. Ba nguồn dự báo là Open-Meteo, WeatherAPI và Tomorrow.io; Open-Meteo không yêu cầu key cho endpoint miễn phí đang dùng. Model LLM có thể chọn bằng biến `OPENAI_MODEL` theo quyền truy cập tài khoản.

Để thử trên điện thoại cùng Wi-Fi, cấu hình `EXPO_PUBLIC_API_URL` trong `apps/mobile/.env` thành `http://<IP-LAN-máy-tính>:4000`, hoặc đổi địa chỉ API trong Cài đặt. Chạy:

```powershell
npm.cmd run start -w @di-chung/mobile
```

Quét QR bằng Expo Go tương thích SDK của dự án. API phải truy cập được từ thiết bị. HTTP phù hợp phát triển nội bộ; bản triển khai dùng HTTPS. Build native riêng cho Android cần cấu hình khóa Google Maps để hiển thị bản đồ nền.

## PostgreSQL riêng — tùy chọn

```powershell
docker compose up -d
```

Đặt `DATABASE_URL=postgresql://dichung:local-development-only@localhost:5432/dichung` trong `.env` backend. Nếu đổi mật khẩu Compose, sửa connection string tương ứng. Migrations và seed được chạy khi khởi động; tắt tài khoản demo và đặt `JWT_SECRET` riêng khi triển khai.

## Kiểm tra

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:llm
npm.cmd run test:discovery-contract
npm.cmd run test:integration
npm.cmd run test:phase2
npm.cmd run build:web
```

`test:integration` khởi động API riêng ở cổng 4100, database riêng dưới `artifacts/`; kiểm tra ba tài khoản, đa số, quyền nhóm, bình luận Socket.io và luồng giả lập mưa. `test:llm` dùng máy chủ HTTP giả lập chỉ trong kiểm thử để kiểm tra hợp đồng Responses, loại kết quả sai và thử lại; không chứng minh chất lượng của model thật. Các kiểm tra này không gọi LLM trả phí. `test:ui` kiểm tra giao diện khi API/app đang chạy; trình duyệt Edge được dùng nếu có trên Windows.

## Tài liệu đồ án

- [Thiết kế đủ tám phần](docs/THIET-KE.md)
- [Hợp đồng REST và Socket.io](docs/API-CONTRACT.md)
- [Kịch bản trình bày demo](docs/DEMO.md)
- [Kế hoạch năm giai đoạn](docs/KE-HOACH.md)
- [Nguồn dữ liệu, hạn mức và điều chưa chắc](docs/NGUON-DU-LIEU.md)
- [Bản đồ du lịch, dữ liệu OSM và cấu hình nền tảng](docs/TRAVEL-MAP.md)
- [Phase 2: discovery, planner, bản đồ lịch trình và trạng thái AI thật](docs/PHASE-2-AI.md)

Các kiểm tra đã thực hiện và giới hạn còn lại được ghi tại [báo cáo kiểm thử](docs/KIEM-THU.md). Chưa có API key thì chưa thể khẳng định đã gọi thành công LLM hoặc các nguồn cần khóa bằng tài khoản thực.

# project-CSW434
