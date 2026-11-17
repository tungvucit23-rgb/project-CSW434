# Technology stack thực tế và dự kiến

Ngày đọc source/lock/installed: 17/11/2026. “Range” là package.json; “lock” là phiên bản npm ci dùng; không xem range như phiên bản chính xác. Audit hiện không phát hiện drift declaration của lockfile. Không dùng phiên bản đang cài trên một máy để ghi đè lock của nhóm.

## Package audit

| Package | Khai báo trong manifest | Lockfile | node_modules lúc audit |
|---|---|---|---|
| typescript | apps/mobile/package.json: ~5.9.2; apps/server/package.json: ^5.9.3 | 5.9.3 | 5.9.3 |
| express | apps/server/package.json: ^5.1.0 | 5.3.0 | 5.3.0 |
| firebase | Chưa khai báo | Chưa có | Chưa cài |
| firebase-admin | Chưa khai báo | Chưa có | Chưa cài |
| firebase-tools | Chưa khai báo | Chưa có | Chưa cài |
| @firebase/rules-unit-testing | Chưa khai báo | Chưa có | Chưa cài |
| @electric-sql/pglite | apps/server/package.json: ^0.3.14 | 0.3.16 | 0.3.16 |
| pg | apps/server/package.json: ^8.16.3 | 8.23.1 | 8.23.1 |
| zod | apps/server/package.json: ^4.1.12 | 4.6.7 | 4.6.7 |
| socket.io | apps/server/package.json: ^4.8.1 | 4.8.4 | 4.8.4 |
| socket.io-client | apps/mobile/package.json: ^4.8.1 | 4.8.4 | 4.8.4 |
| @playwright/test | package.json: ^1.56.0 | 1.64.1 | 1.64.1 |
| tsx | apps/server/package.json: ^4.20.6 | 4.23.15 | 4.23.15 |
| expo | apps/mobile/package.json: 55.0.31 | 55.0.31 | 55.0.31 |
| react-native | apps/mobile/package.json: 0.83.10 | 0.83.10 | 0.83.10 |
| react | apps/mobile/package.json: 19.2.0 | 19.2.0 | 19.2.0 |
| jsonwebtoken | apps/server/package.json: ^9.0.2 | 9.0.3 | 9.0.3 |
| expo-secure-store | apps/mobile/package.json: ~55.0.18 | 55.0.18 | 55.0.18 |

## Công nghệ / vai trò / cấu hình

| Công nghệ | Mục đích, hiện trạng | Ai cài / cấu hình / compatibility |
|---|---|---|
| Node.js, npm | Root yêu cầu >=22; CI dùng Node 22. Máy audit Node v24.18.0, npm 11.16.0 | Cả nhóm; dùng Node 22 phù hợp CI hoặc phiên bản >=22 đã kiểm. Không hứa Node cũ chạy Firebase Admin mới; kiểm engines khi pin package. |
| Git | Máy audit 2.53.0.windows.2; folder chưa là repo | Cả nhóm; không có remote/branch/commit để suy đoán. |
| TypeScript/tsx | Compiler/transpiler đã có, server ESM | Backend/Frontend; dùng npm scripts và lockfile, không cần TS global. |
| React/React Native/Expo | Mobile đã có: Expo 55.0.31, RN 0.83.10, React 19.2.0 | Frontend; giữ bộ phiên bản của Expo, không tự nâng một native package lẻ. Backend/DB không cần Android Studio. |
| Navigation/state | App.tsx router + React context, browser/native back | Đã có, không có React Navigation/Redux để bắt teammate cài. |
| Maps | react-native-maps 1.27.2; Leaflet 1.9.4 + markercluster 1.5.3 vendor | Native cần GOOGLE_MAPS_API_KEY khi prebuild; web không dùng Google key. BSD-2-Clause/MIT license đã đi kèm; OSM tiles cần mạng/attribution. |
| Android SDK/Gradle/JDK | App ID vn.dichung.travel; existing APK min24/target36; wrapper Gradle 9.0.0; Hermes/new architecture bật | Frontend; audit Java 17.0.19.10-hotspot/Microsoft, APK build lịch sử 11/11. Android SDK platforms/build-tools/NDK theo Expo/Gradle, không gán version NDK chưa đọc. Emulator Firebase nên JDK21+ riêng. |
| Express/Zod/Helmet/CORS/rate limit | API hiện có, phiên bản package trong bảng | Backend; server config.ts và .env.example. |
| PostgreSQL/PGlite | Persistence hiện có, schema 20 bảng | Backend dùng để đối chiếu; PGlite không cần PostgreSQL server. Database port sang Firestore; Docker PostgreSQL là tùy chọn hiện tại. |
| jsonwebtoken + Node crypto.scrypt | Auth/password hiện tại; không phải Firebase Auth | Backend giữ cho legacy trước cutover, rồi ngừng accept custom JWT. Không copy SQL hashes vào Firebase theo suy đoán. |
| Firebase JS SDK | **Chưa cài**, đích cho Auth client/persistence/refresh và Rules tests | Frontend owner cài firebase tại mobile khi làm Auth provider; DB dùng SDK test. Chưa chọn phiên bản nên không ghi version giả. Không dùng Firestore listeners trong màn hình MVP. |
| Firebase Admin SDK | **Chưa cài**, đích verify ID token + repository Firestore | Backend cài/pin firebase-admin, ADC/IAM; không đưa Admin SDK hoặc key vào Expo. |
| Firebase CLI / Emulator Suite | **Chưa cài/config**, đích Auth + Firestore local | DB/Backend cài, ghi CLI/emulator version thực vào lock/runbook. UI port4401; Java21+ theo khuyến cáo Firestore; không nhầm Java17 Android với emulator đã test. |
| Rules unit testing | **Chưa cài**, @firebase/rules-unit-testing dự kiến | DB owner tạo suite/config/index files thật và phối hợp Backend test Admin auth riêng. |
| Socket.io | Server/client đã có, không phải Firebase DB | Backend kiểm rooms/auth, Frontend lifecycle; giữ domain invalidations + ephemeral typing. Một process MVP; scale cần adapter/lease khác được review riêng. |
| OpenAI API | fetch Responses + text.format json_schema strict, không cài OpenAI SDK | Backend; OPENAI_API_KEY optional. Model mặc định config là gpt-4.1-mini, phải kiểm quyền model thực; thiếu key dùng RULE_BASED có nhãn, không coi là LLM. |
| Weather APIs/RainViewer | Connector code đã có | Backend quản keys/cache/facts, Frontend chỉ hiển thị DTO/tiles; không gọi paid AI trực tiếp từ app. |
| Playwright + node:test | Frontend journey, production export smoke; server pure/domain/smoke tests | CI/Frontend; Backend unit không cần browser; CI integration runner đầy đủ workspace deps. |

## External services — không suy đoán giá/quota

| Dịch vụ | Bắt buộc / tùy chọn | Credentials / điều kiện thiếu | Nguồn kiểm tra |
|---|---|---|---|
| Firebase Auth/Firestore | Bắt buộc cho kiến trúc đích; mock và backend legacy chưa cần | Project/IAM/config thật; local emulator có demo project. Gói miễn phí/billing tùy sản phẩm, điều kiện và usage; nhóm kiểm trước deploy, không có giá/quota được hứa ở đây. | [Firebase pricing](https://firebase.google.com/pricing) |
| OpenAI | Tùy chọn cho LLM, không bắt buộc cho RULE_BASED demo | Key/account/model access và ngân sách; thiếu key không làm giả output LLM. Không khẳng định có free quota. | [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) |
| Open-Meteo | Một nguồn weather đã tích hợp; không cần key ở endpoint public hiện dùng | Free cho sử dụng phi thương mại đủ điều kiện theo điều khoản; không suy ra production có SLA/quota miễn phí vô hạn. | [Open-Meteo terms](https://open-meteo.com/en/terms) |
| WeatherAPI | Nguồn bổ sung, optional khi thiếu key | Cần WEATHERAPI_KEY; có lựa chọn free plan theo điều kiện tài khoản, phạm vi forecast tùy gói; MISSING khi không có key. | [WeatherAPI plans](https://www.weatherapi.com/pricing) |
| Tomorrow.io | Nguồn bổ sung optional | Cần TOMORROW_API_KEY; quyền endpoint phụ thuộc gói/key; không coi internal budget trong code là quota gói hiện tại. | [Access keys](https://docs.tomorrow.io/reference/api-authentication), [plans](https://support.tomorrow.io/hc/en-us/articles/23554984091156-Tomorrow-io-Pricing-Overview) |
| RainViewer | Radar quan sát optional, mock không tạo frame | Endpoint public trong code, coverage/terms có thể thay đổi; thiếu dữ liệu => unavailable, không phải trời khô. | [Weather Maps API](https://www.rainviewer.com/api/weather-maps-api.html) |
| Google Maps SDK | Chỉ cần cho map native đầy đủ | Restricted client key, project/API/billing theo cấu hình Google; thiếu key có fallback. Không mặc định dịch vụ miễn phí. | [Android Maps setup](https://developers.google.com/maps/documentation/android-sdk/get-api-key) |
| OpenStreetMap/Leaflet | Web map hiện có | Library vendor không cần key; tiles/attribution và usage policy riêng, không bulk-prefetch cho offline. | [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/) |

Các link kiểm tra phục vụ quy định/cấu hình tại thời điểm audit; không thay việc xem tài khoản/gói thật. Không live-call provider trả phí trong Phase 4. Cài đặt theo vai trò ở [TEAM_SETUP](TEAM_SETUP.md), env hiện tại và đề xuất ở [ENV_SETUP](ENV_SETUP.md).
