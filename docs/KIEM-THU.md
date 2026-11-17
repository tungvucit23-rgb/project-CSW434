# Báo cáo kiểm thử — cập nhật 10/11/2026

## Phase 2 — discovery và itinerary map

| Kiểm tra | Kết quả | Bằng chứng/phạm vi |
| --- | --- | --- |
| TypeScript | PASS | Mobile + server |
| Unit/domain | 35/35 PASS | Thêm discovery, giờ đã trôi qua trong LIVE, budget nguồn/unknown, giờ nghỉ trưa, dữ kiện gió/nhiệt độ, fact/reason validator và route có khoảng thiếu tọa độ |
| Hợp đồng planner HTTP | 4/4 PASS | Responses strict, retry và validator; local mock |
| Hợp đồng discovery HTTP | 8/8 PASS | ID/reason/fact sai, refusal, incomplete, disconnect, retry/cache/no candidates; local mock |
| API/Socket cũ | 16/16 PASS | Chạy lại trên server/database riêng |
| API/Socket Phase 2 | 9/9 PASS | `artifacts/phase2-integration-results.json`; quyền, discovery độc lập, prefs, selected IDs, budget/time, đa số, stale ngày/giờ và reconnect wishlist |
| UI Phase 2 | 10/10 PASS | `artifacts/phase2-ui/results.json`; desktop + 390px, marker/timeline hai chiều, wishlist, đề xuất/đa số, API error/retry, đổi thành phố |
| UI hồi quy | 39/39 PASS | Chạy lại riêng hoàn tất; `artifacts/ui/results.json`, sáu màn mobile không tràn ngang |
| Map hồi quy | 7/7 PASS | Chạy lại sau Phase 2; `artifacts/map/results.json` |
| Web export | PASS | `apps/mobile/dist` |
| Android arm64 | BUILD SUCCESSFUL | `artifacts/android-phase2-build.log`, `artifacts/di-chung-phase2-arm64.apk` |

Tổng 128 kiểm tra tự động qua. UI hồi quy đã chạy lại riêng hoàn tất sau khi lượt đầu dừng ở khôi phục phiên mobile cuối bộ kiểm tra. Các lần full reload mobile được giãn giống desktop để không dồn request; không đổi quota của ứng dụng. APK qua `apksigner verify`, chữ ký v2 hợp lệ. Hash và trạng thái build nằm trong `artifacts/phase2-verification.json`.

Không có OPENAI_API_KEY trong môi trường hoặc tệp .env; chưa gọi OpenAI thật. Cấu hình model mặc định `gpt-4.1-mini`; UI kiểm thử hiện RULE_BASED/NO_API_KEY. Mock không chứng minh chất lượng model thật. Các kiểm tra UI chạy trên React Native Web, chưa xác minh native Maps/gesture trên thiết bị. Có tile mạng lỗi trong ảnh chụp: UI hiện cảnh báo/retry; không tuyên bố bản đồ nền offline. [Báo cáo triển khai đủ tám phần](PHASE-2-AI.md) và `artifacts/phase2-verification.json` ghi trạng thái nghiệm thu.

Chạy bổ sung:

```powershell
npm.cmd run test:discovery-contract
npm.cmd run test:phase2
# preview QA ở 4000/8081; chạy các bộ UI tuần tự:
npm.cmd run test:phase2-ui
npm.cmd run test:ui
npm.cmd run test:map
```

## Nâng cấp bản đồ du lịch

| Kiểm tra chạy lại | Kết quả | Bằng chứng/phạm vi |
| --- | --- | --- |
| TypeScript | PASS | Mobile và server |
| Unit/domain | 22/22 PASS | 14 bài cũ + 8 bài catalogue, đối chiếu snapshot OSM, provenance, clustering, tìm kiếm, thời tiết, radar, seed chạy lại và dữ liệu người vận hành |
| API/Socket.io | 16/16 PASS | Có kiểm tra chính xác 80 điểm khám phá có nguồn OSM, 40 điểm Vũng Tàu, API điểm cũ, quyền nhóm, wishlist và realtime |
| Giao diện hồi quy | 39/39 PASS | `artifacts/ui/results.json`; không lỗi JavaScript, sáu màn mobile không tràn ngang |
| Bản đồ web/mobile web | 7/7 PASS | `artifacts/map/results.json`; thành phố, 80 marker, cụm, tìm không dấu, focus từ detail, bộ lọc giữ camera, wishlist API, preview mobile, HTTP 404 tile có retry và deep link bản ghi cũ thiếu tọa độ |
| Hợp đồng LLM HTTP | 4/4 PASS | Mock HTTP nội bộ, không gọi model trả phí |
| Web export | PASS | `apps/mobile/dist` |
| RainViewer metadata trực tiếp | PASS | 13 khung, timestamp đều quá khứ và tăng dần, host tilecache.rainviewer.com, attribution hiện có; chưa xác minh coverage từng điểm |
| Android APK arm64 | BUILD SUCCESSFUL | JDK 21, SDK 36; `artifacts/android-map-build.log`; APK mới `artifacts/di-chung-travel-map-arm64.apk` |

Các kiểm tra UI dùng server QA database trong bộ nhớ. Chạy bộ hồi quy và bản đồ tuần tự để không dùng chung quota 12 yêu cầu/phút của endpoint dự báo. Không export đè dist trong lúc kiểm thử. Khi chẩn đoán đã đối chiếu tile OSM thực trả HTTP 200; ảnh chụp sớm có thể chưa tải xong toàn bộ tile.

Chưa kiểm tra thao tác Google Maps trên Android có key hợp lệ hoặc thiết bị thật. Chưa kiểm chứng thực địa/địa giới hành chính của 80 điểm, ảnh riêng từng điểm, giá vé hoặc thời lượng hiện hành. Chưa kiểm chứng ba nguồn thời tiết thật bằng tài khoản có key trong đợt này. [TRAVEL-MAP.md](TRAVEL-MAP.md) mô tả chính xác nguồn, các bản ghi cũ được giữ lại và giả định bộ lập lịch.

## Kết quả lịch sử ngày 17/10/2026

## Kết quả đã kiểm chứng

| Hạng mục | Kết quả | Phạm vi |
|---|---|---|
| TypeScript | PASS | App và backend |
| Unit/domain | 14/14 PASS | Phân loại mưa, thiếu nguồn, múi giờ, validator AI, transaction, mật khẩu, ràng buộc lịch, đối chiếu UNKNOWN |
| REST + Socket tích hợp | 16/16 PASS | Database riêng, ba cử tri, đa số, quyền nhóm, phiếu đồng thời, phương án cũ, bình luận realtime, sở thích, báo mưa, demo |
| Hợp đồng LLM HTTP | 4/4 PASS | Gửi Responses schema strict, thử lại kết quả sai, chặn số viết bằng chữ, lưu lịch sử kiểm định; dùng HTTP mock nội bộ |
| Giao diện | 39/39 PASS | Đủ 32 màn hình, đăng nhập demo, thao tác vote, sáu màn ở kích thước 390×844; không lỗi JavaScript |
| Web export | PASS | Bundle sản phẩm trong `apps/mobile/dist` |
| Android Hermes export | PASS | Bundle native Android |
| APK Android | BUILD SUCCESSFUL | arm64-v8a, Android API 24+, app id `vn.dichung.travel`, version 1.0.0; đã kiểm tra chữ ký demo |
| Tài liệu/schema | PASS | Bốn ví dụ đúng JSONSchema; hai output qua validator planner thật |
| API thời tiết thật | PASS một nguồn | Open-Meteo trả 24 khoảng giờ; WeatherAPI/Tomorrow.io báo MISSING khi chưa có key |
| Radar thật | PASS metadata và web | RainViewer trả 13 khung quá khứ; trình duyệt hiển thị tile và kiểm tra coverage tại tâm bản đồ |

File bằng chứng nằm trong `artifacts/`: `smoke-results.json`, `llm-contract-results.json`, `live-probe.json`, `ui/results.json`, ảnh giao diện và log build Android. Thời gian trong các JSON là UTC; ngày báo cáo theo Asia/Saigon.

## Những trường hợp quan trọng

- Một phiếu YES trong nhóm ba người không đổi lịch. Hai phiếu YES mới áp dụng; gửi lại cùng phiếu không tăng số phiếu.
- Hai người gửi phiếu cùng lúc chỉ áp dụng một lần. Phương án cạnh tranh dựa trên lịch cũ bị đánh dấu STALE.
- Người vào nhóm sau khi mở vote không được thêm vào danh sách cử tri đã chốt.
- Đổi ngân sách hoặc chế độ làm vô hiệu hóa đề xuất dùng ràng buộc cũ; so sánh JSONB không phụ thuộc thứ tự khóa.
- Người ngoài bị chặn ở REST và Socket room; bình luận có đúng một đích và chỉ tác giả được sửa/xóa.
- Cảnh báo giả lập không tự cập nhật lịch. Cùng một người báo mưa nhiều lần không được tính thành hai người xác nhận.
- LLM bịa ID địa điểm, số liệu, câu mưa không được dữ kiện hỗ trợ, giờ không hợp lệ hoặc điểm ngoài trời vào khung mưa đồng thuận đều bị loại.
- Mẫu thiếu bằng chứng giữ UNKNOWN và được đóng lượt đối chiếu để không làm nghẽn mẫu mới. Chờ cửa sổ quan sát và thời gian nhận báo cáo kết thúc trước khi chấm.

## Giới hạn kiểm thử

- **Chưa có khóa OpenAI, WeatherAPI và Tomorrow.io** nên chưa gọi thành công ba dịch vụ này bằng tài khoản thật. HTTP mock kiểm tra tích hợp và kiểm định, không chứng minh chất lượng model. Muốn nghiệm thu yêu cầu LLM thật, cần cấu hình khóa rồi xác nhận phương án có `engine=LLM`.
- PostgreSQL riêng qua mạng chưa được chạy end-to-end trên máy này. PGlite dùng engine PostgreSQL đã vượt qua kiểm tra SQL, lưu bền, transaction và rollback; parser DATE của driver `pg` có kiểm tra riêng.
- APK đã build và xác minh chữ ký; tình trạng chạy trên thiết bị sẽ được ghi bổ sung nếu thực hiện được. Bộ UI tự động ở trên chạy React Native Web, không thay thế kiểm thử Android/iOS thực tế.
- Push khi app đóng chưa tích hợp dịch vụ gửi. Hiện có danh sách thông báo trong database và Socket.io khi kết nối; không cam kết cảnh báo nền.
- Radar web hiển thị được vùng mưa ở Việt Nam. Một lần kiểm tra coverage mask không chứng minh độ phủ liên tục, độ mới hoặc độ chính xác tại mọi điểm ở Đà Lạt/Vũng Tàu. Native Maps cần khóa Google Maps riêng.
- Địa điểm, giá, giờ và tọa độ seed là dữ liệu tham khảo có nhãn. Chưa dùng định tuyến đường bộ; thời gian di chuyển là ước tính có công thức được ghi lại.
- APK ký bằng chứng chỉ demo, bật HTTP cho LAN. Bản phát hành cần chứng chỉ riêng và HTTPS.

Không ngoại suy radar, không ghim địa điểm tự do, không chat nhóm riêng. Trạng thái đã xem bình luận để giai đoạn bổ sung.

## Chạy lại

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:llm
npm.cmd run test:integration
npm.cmd run build:web
# API 4000 và app 8081 đang chạy:
npm.cmd run test:ui
node scripts/probe-live.mjs
```

UI test chạy chậm có chủ ý để việc tải lại phiên đăng nhập không vượt hạn mức API theo IP. Các lượt kiểm tra nghiệp vụ dùng database riêng, không sửa dữ liệu nhóm thật của người dùng.
