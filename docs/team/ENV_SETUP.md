# Thiết lập biến môi trường

## 1. Tách cấu hình đang chạy và thiết kế Firebase

- Hiện tại: [mobile .env.example](../../apps/mobile/.env.example), [server .env.example](../../apps/server/.env.example). Sao chép thành `.env` riêng tại workspace tương ứng; không commit file đã điền.
- Đề xuất Firebase: [mobile .env.firebase.example](../../apps/mobile/.env.firebase.example), [server .env.firebase.example](../../apps/server/.env.firebase.example). **Các biến Firebase chưa được code hiện tại đọc.** Chép chúng không làm backend SQL trở thành Firestore hoặc bật Auth refresh.
- Chỉ EXPO_PUBLIC_* đi vào bundle Expo, nên đều có thể bị đọc bởi người dùng. Firebase client config là public identifier, không phải Admin credential; Rules/IAM/backend authorization mới bảo vệ dữ liệu. LLM/weather/admin private key tuyệt đối không đặt vào biến EXPO_PUBLIC_*.

## 2. Frontend hiện tại

| Biến | Owner; cần? | Giá trị ví dụ / lấy ở đâu | Bảo mật và khi thiếu |
|---|---|---|---|
| EXPO_PUBLIC_DATA_SOURCE | Frontend; tùy chọn, default mock | `mock` hoặc `api`, do developer chọn | Public; default mock. UI có nhãn, không dùng API lỗi làm fallback mock |
| EXPO_PUBLIC_API_URL | Frontend; API Mode cần địa chỉ đúng | Web `http://localhost:4000`, Android emulator `http://10.0.2.2:4000`; Backend cấp HTTPS/LAN URL | Không chứa user/password/token. Facade tự thêm `/api`; default host theo platform nếu thiếu; thiếu server hiện error |
| GOOGLE_MAPS_API_KEY | Frontend/native build; optional | Restricted Maps SDK client key ở Google Cloud Console | Key client phải giới hạn app/signing certificate/API. app.config.ts đọc lúc prebuild/build; thiếu thì native map có fallback, không crash |
| ALLOW_HTTP_DEMO | Frontend/native build; optional | `true` chỉ APK LAN HTTP, bình thường `false` | Không secret; app.config.ts đặt usesCleartextTraffic; missing=false. Phải prebuild lại khi đổi native config |

Thay Expo public env cần restart/export lại. Development source override lưu local; production export ẩn công cụ đổi source. `.env.example` dùng localhost minh họa không phù hợp cho mọi thiết bị.

## 3. Backend hiện tại — đọc trong config.ts / index.ts

| Biến | Cần / ví dụ | Nguồn / owner | Khi thiếu và lưu ý |
|---|---|---|---|
| NODE_ENV | Optional local `development`; deployment `production` | Backend/deployment | Node runtime mặc định; production ảnh hưởng JWT/demo/error logging. Không coi undefined là production |
| PORT | Optional `4000` | Backend | Default 4000; tránh Emulator UI trùng cổng |
| HOST | Optional `127.0.0.1` local | Backend | Default code `0.0.0.0`; chỉ bind LAN khi chủ động test device |
| CORS_ORIGINS | API web cần danh sách đúng | `http://localhost:8081,http://127.0.0.1:8081` do Frontend/Backend thống nhất | Code có default hai origin trên; frontend port khác phải thêm chính xác, không dùng wildcard production |
| DATABASE_URL | Optional hiện tại | Connection string SQL riêng do Backend/DB cấp | Rỗng dùng PGlite. Có thể chứa credential, không đưa vào Git/log. Không dùng trong target Firestore sau cutover |
| PGLITE_DATA_DIR | Optional `.data` hoặc `:memory:` khi test | Backend | Resolve theo cwd apps/server; `.data/postgres` chứa local DB, `.data/.jwt-secret` là secret. Không export vào Git |
| JWT_SECRET | Bắt buộc production legacy; blank ở template | Backend tạo random secret qua secure channel | Dev có thể tạo/lưu local secret; production thiếu sẽ fail. Chỉ cho HS256 legacy, không dùng verify Firebase ID token |
| ALLOW_DEMO | Optional local `true`, production `false` | Backend | Dev bật trừ khi false; production chỉ bật nếu explicit true. Không được mở demo bypass auth trên cloud production |
| SEED_DEMO | Optional local `true` | Backend | Code default true; false chỉ chặn seeded demo group/users, **không dừng catalogue seed** vốn chạy trước đó. Target seed sẽ explicit |
| ENABLE_WORKER | Optional local `false` khi test | Backend | Default true, worker poll các LIVE trip; test isolated đặt false để không có network/background effects |
| WEATHER_CACHE_MINUTES | Optional `15` | Backend | Default15, code clamp >=10; internal cache policy, không phải quota provider |
| WEATHER_POLL_MINUTES | Optional `5` | Backend | Default5, clamp >=1; worker interval, không tự tăng tần suất vượt budget |
| OPENAI_API_KEY | Optional cho RULE_BASED, cần cho LLM | Key từ tài khoản OpenAI của nhóm; Backend | Secret chỉ server. Missing → explicit RULE_BASED, không output LLM giả; account/model/budget phải được kiểm |
| OPENAI_MODEL | Optional `gpt-4.1-mini` | Backend chốt model có quyền dùng | Default trong code, không khẳng định model/quota tài khoản thực đã được kiểm |
| OPENAI_BASE_URL | Optional `https://api.openai.com/v1` | Backend; override chỉ test endpoint tin cậy | Không gửi key production sang endpoint không tin cậy; code dùng fetch `/responses`. Không chứa credential/query |
| WEATHERAPI_KEY | Optional nguồn bổ sung | WeatherAPI dashboard; Backend | Secret; thiếu đánh MISSING, không biến thành mưa=0 |
| TOMORROW_API_KEY | Optional nguồn bổ sung | Tomorrow.io dashboard; Backend | Secret; thiếu MISSING, endpoint access tùy key/gói |

Open-Meteo endpoint public và RainViewer hiện không có biến key trong code; không tạo biến `OPEN_METEO_KEY`/`RAINVIEWER_KEY` giả. Không dùng `FIREBASE_DATABASE_URL` của Realtime Database để cấu hình Cloud Firestore.

## 4. Cấu hình Firebase — chưa triển khai, cần cho target

| Biến đề xuất/chuẩn SDK | Owner; cần ở đâu | Placeholder / lấy ở đâu | Khi thiếu / bảo mật |
|---|---|---|---|
| GOOGLE_CLOUD_PROJECT | Backend + Database; cần target | `demo-di-chung` local hoặc project ID thật từ Firebase Console | Admin bootstrap phải dùng project khớp Auth/emulator; thiếu thì fail config ở target, không fallback SQL |
| GOOGLE_APPLICATION_CREDENTIALS | Backend/DB local cloud; optional nếu có managed ADC | `C:/outside-repository/firebase-dev.json`, IAM/service account do owner cấp | **Đường dẫn**, không JSON private key. File ngoài repo; cloud dùng service identity/ADC. Emulator không cần key production |
| FIREBASE_AUTH_EMULATOR_HOST | Backend/DB chỉ local | `127.0.0.1:9099` | Chuẩn Admin SDK, **không http://**. Không set production; missing ở cloud nghĩa dùng Firebase thật, nên target phải chặn demo project cấu hình sai |
| FIRESTORE_EMULATOR_HOST | Backend/DB chỉ local | `127.0.0.1:8080` | Chuẩn Admin SDK, không scheme. Không nhầm với backend PORT hoặc UI4401 |
| FIREBASE_WEB_API_KEY | Backend; biến app mới cho compatibility Auth REST | `emulator-only-placeholder` local; public Web API key từ Project settings khi cloud | Chưa có reader hiện tại. Không phải private Admin key; cần project/API restriction, không log credential request. SDK client flow không cần route compatibility này cho một lần login |
| EXPO_PUBLIC_FIREBASE_API_KEY | Frontend; target Auth SDK | Public client config ở Firebase Project settings | Chưa đọc hiện tại. Không thay bằng service account. Emulator dùng dummy config đã test với SDK được pin |
| EXPO_PUBLIC_FIREBASE_PROJECT_ID | Frontend; target | `demo-di-chung` / project dev đúng | Phải khớp Admin/Auth project; public |
| EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN | Frontend; target | `demo-di-chung.firebaseapp.com` hoặc authDomain Console cấp | Public; mobile email/password vẫn cần SDK config theo phiên bản, không đoán custom domain |
| EXPO_PUBLIC_FIREBASE_APP_ID | Frontend; target | `public-app-id-placeholder` / App ID Console cấp | Public identifier, không phải Android application ID hay secret |
| EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_URL | Frontend; helper đề xuất cho SDK connectAuthEmulator | Web `http://127.0.0.1:9099`, Android `http://10.0.2.2:9099` | Có scheme, khác Admin HOST. Chưa được đọc; production phải bỏ. Real device cần host reachable, không tự dùng localhost của điện thoại |

Không đề xuất Firebase Storage/Messaging keys cho tính năng chưa dùng. Nếu thêm Storage để archive payload lớn hoặc push, phải có requirement/IAM/env riêng trong PR, không điền biến ngẫu nhiên vào mobile. [Admin setup/ADC](https://firebase.google.com/docs/admin/setup), [Auth emulator](https://firebase.google.com/docs/emulator-suite/connect_auth), [Firestore emulator](https://firebase.google.com/docs/emulator-suite/connect_firestore).

## 5. Test configuration, không phải app environment

`APP_URL` được `apps/mobile/tests/journey.mjs` đọc (default 8091); root browser scripts còn đọc `API_URL`, `APP_URL`. `SMOKE_PORT` được `scripts/smoke.mjs` đọc (default4100). Đây là địa chỉ/cổng test, không phải EXPO_PUBLIC_API_URL của bundle. `CI` là runtime flag của tooling. JAVA_HOME/ANDROID_HOME/ANDROID_USER_HOME/GRADLE_USER_HOME là tooling paths, không đưa credential vào đó. [Cài máy](TEAM_SETUP.md) có ví dụ.

## 6. Chống nhầm môi trường và secret

`.gitignore` được bổ sung bảo vệ `.env.*` trừ file mẫu, `.data`, credentials/service-account patterns, private key/keystore, emulator exports, Android cache/build/APK. Ignore không xóa secret đã bị track; khi có Git phải kiểm `git ls-files`, `git diff --cached` và rotate secret nếu từng lộ. `.env.firebase.example` chỉ chứa placeholder và nhãn PLANNED. Không đọc/copy `.env` thật vào docs, log hay test results. API keys, tokens và password không được ghi vào AI execution metadata hoặc activity.

Khi chạy emulator trên LAN để test device, phải cấu hình bind/network có kiểm soát; mẫu chỉ bind loopback và không hứa thiết bị thật truy cập ngay. Không mở emulator ra Internet.
