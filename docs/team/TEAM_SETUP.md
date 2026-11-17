# Cài máy và bắt đầu công việc

## 1. Cài theo vai trò

| Công cụ | Frontend | Backend | Database |
|---|---|---|---|
| Git, Node >=22, npm, VS Code/editor | Cần | Cần | Cần |
| Android Studio + SDK + emulator | Cần nếu build/test Android; web không cần | Không cần mặc định | Không cần mặc định |
| JDK | Android dùng JDK17 đã build được ở máy audit; Firebase emulator nên JDK21+ riêng | JDK21+ nếu chạy Firestore emulator | JDK21+ cho emulator mới |
| Firebase CLI + Auth/Firestore Emulator | Tùy chọn trước Auth/API integration | Cần cho target/test repositories | Cần |
| Firebase Admin SDK | Không cài vào mobile | Sẽ cài/pin ở server khi implementation | Chỉ công cụ seed/migrate trusted |
| Firebase JS SDK | Sẽ cài ở mobile cho Auth provider | Test client nếu cần | Rules/Auth test client |
| PostgreSQL/Docker | Không cần cho mock | Optional, PGlite đã chạy không cần daemon SQL | Chỉ khi audit/migrate source PostgreSQL |
| Playwright browser | Cần chạy UI tests | Optional integration runner | Optional, không dùng cho Rules tests |

Phiên bản package thật và phần chưa cài ở [TECH_STACK.md](TECH_STACK.md). Không yêu cầu Backend/Database cài Android Studio để làm task của họ. Firebase CLI/emulator chưa được cài trong repo lúc bàn giao.

## 2. Checkout và dependencies đang có

Repository chính thức là [project-CSW434](https://github.com/tungvucit23-rgb/project-CSW434). Clone bằng URL thật dưới đây, rồi mở terminal ở root chứa package.json. Xem [GITHUB_HANDOFF](GITHUB_HANDOFF.md) để biết commit/phạm vi đã được kiểm chứng; [GIT_WORKFLOW](GIT_WORKFLOW.md) mô tả PR và phân nhánh.

```powershell
git clone https://github.com/tungvucit23-rgb/project-CSW434.git
cd project-CSW434
```

Full workspace cho Frontend/CI:

```powershell
npm.cmd ci
npm.cmd run typecheck
```

Backend chỉ cần Node dependencies server, không cần Expo/native toolchain:

```powershell
npm.cmd ci --workspace @di-chung/server --include-workspace-root=false
npm.cmd run typecheck -w @di-chung/server
npm.cmd test -w @di-chung/server
```

`npm.cmd`/`npx.cmd` là cho Windows PowerShell tránh execution policy; macOS/Linux dùng `npm`/`npx`. `npm ci` đọc lockfile hiện có; khi thêm package, người sở hữu PR dùng `npm install ... --save-exact` rồi commit manifest+lock, không sửa lock bằng tay. Chỉ installation theo workspace cần thiết; root integration scripts dùng dependencies của nhiều workspace nên runner tích hợp cần full install.

## 3. Frontend: chạy không cần Backend/Firebase

```powershell
Copy-Item apps/mobile/.env.example apps/mobile/.env
npm.cmd run web -w @di-chung/mobile
```

Default mock. Chọn “Khám phá chuyến đi mẫu”, hoặc tài khoản mẫu ở [MOCK_SCENARIOS](../../apps/mobile/MOCK_SCENARIOS.md). State local reset khi reload; không phải production credentials. Weather/AI có nhãn DEMO; radar không có frame giả; OSM tiles/images vẫn cần mạng nhưng dữ liệu và marker không cần backend.

```powershell
npm.cmd run typecheck -w @di-chung/mobile
npm.cmd test -w @di-chung/mobile
npm.cmd run web -w @di-chung/mobile -- --port 8091
# Terminal thứ hai:
npm.cmd run test:ui -w @di-chung/mobile
npm.cmd run build:web -w @di-chung/mobile
node apps/mobile/tests/export-smoke.mjs
```

Nếu không có Edge/Chromium Playwright, dùng `npx.cmd playwright install chromium` sau full install (Linux CI cần dependencies hệ thống tương ứng). Tests có thể dùng APP_URL nếu frontend chạy cổng khác. Không nhầm `npm test` root (server) với 66 tests mobile.

## 4. Backend hiện tại: baseline SQL/PGlite

```powershell
Copy-Item apps/server/.env.example apps/server/.env
# Trong .env local: ENABLE_WORKER=false khi chỉ kiểm tra API/dev.
npm.cmd run server
```

Backend tại 4000, local PGlite trong apps/server/.data; chưa phải Firestore. Không cần PostgreSQL/Docker nếu DATABASE_URL rỗng. Startup hiện chạy migrate/seed; không dùng flag SEED_DEMO=false như bảo đảm không ghi catalogue. Đăng nhập API demo qua POST /api/auth/demo khi ALLOW_DEMO=true; không dùng password mock mobile để login account demo SQL.

Full-install integration runner:

```powershell
npm.cmd run test:integration
npm.cmd run test:llm
```

Smoke tạo PGlite test riêng trong artifacts, không dùng DB đang làm việc; không live-call paid model. Chưa có script `test:firebase` hay `seed:firebase`; Backend/Database phải tạo trong implementation PR, không báo chúng đã chạy.

## 5. Database + Backend: chuẩn bị emulator target

1. Cài JDK21+ và kiểm `java -version`. Có thể giữ JDK17 cho Android bằng JAVA_HOME riêng từng terminal; không đổi JAVA_HOME toàn máy khi teammate đang build.
2. Cài Firebase CLI theo [hướng dẫn chính thức](https://firebase.google.com/docs/cli); ghi `firebase --version`, chốt phiên bản với nhóm, pin tool dependency trong PR database/tooling. Không có số version giả trong handoff. Có thể cài CLI global để bắt đầu, nhưng PR/CI phải pin phiên bản sau khi kiểm tra tương thích.
3. Database owner tạo root `firebase.json` từ mẫu dưới đây, **viết Rules/indexes thật từ model và test**, không chỉ copy JSON rồi chạy với rules mở mặc định.

```powershell
Copy-Item docs/team/examples/firebase.json.example firebase.json
# Tạo/review firestore.rules và firestore.indexes.json trước khi chạy.
firebase emulators:start --project demo-di-chung --only auth,firestore
```

Auth 9099, Firestore 8080, UI4401. Project ID phải giống ở CLI, Admin và client. Emulator cần tải binary lần đầu; Internet chỉ để tải tool, không cần key production. Mẫu dùng loopback; điện thoại thật cần cấu hình LAN riêng được review. [Kết nối emulator](https://firebase.google.com/docs/emulator-suite/connect_firestore).

Terminal Backend **sau khi Firebase bootstrap/repositories được implementation**:

```powershell
$env:GOOGLE_CLOUD_PROJECT='demo-di-chung'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
$env:ENABLE_WORKER='false'
npm.cmd run server
```

**Code hiện tại bỏ qua các biến Firebase và vẫn chạy SQL.** Không dùng lệnh này làm bằng chứng đã kết nối emulator trước khi Backend đổi bootstrap. Khi cloud: bỏ emulator hosts, dùng project dev thật/ADC/IAM, không service account trong Git. Rules tests dùng @firebase/rules-unit-testing và JS SDK do Database owner cài; Admin tests không thay thế Rules tests.

Seed workflow phải được Database owner hiện thực: tạo Auth personas emulator → profiles/cities/places → groups/members/prefs → proposals/ballots/wishlist/comments → weather/alerts/notifs/activity; chạy lại không duplicate và không override operator data. Sau đó tạo CLI script seed/test rõ tên và thêm vào CI; Phase 4 chỉ thiết kế đầu vào/schema/test cases.

## 6. Frontend: API Mode và Android

Hiện tại đặt `EXPO_PUBLIC_DATA_SOURCE=api`, API URL đúng rồi restart Expo để dùng backend legacy. Target Firebase còn cần Frontend làm Auth provider/refresh; chép `.env.firebase.example` không đủ.

- Web gọi máy backend localhost:4000; CORS_ORIGINS phải có đúng Expo origin.
- Android emulator dùng 10.0.2.2:4000; điện thoại dùng LAN/HTTPS và network binding thích hợp. Localhost trên điện thoại không phải máy phát triển.
- Native build cần Android SDK/Build Tools/NDK/CMake theo Expo/Gradle, JDK và signing. Đọc [Android hiện tại](../ANDROID.md). Google Maps key restricted lúc prebuild; thiếu key vẫn có configuration fallback.
- Native source `apps/mobile/android/` và Gradle wrapper có trong Git; `.gitignore` chặn keystore/APK/local.properties. Để giữ native source hiện tại, tạo local debug signing riêng theo [ANDROID](../ANDROID.md). Chỉ chạy `npx.cmd expo prebuild --platform android --no-install` khi chủ ý tái sinh native project và đã review thay đổi. Không commit signing key của ai vào repo. Không thay đổi bản release signing production bằng key demo.
- Build thành công không đồng nghĩa đã test trên emulator/thiết bị. Khi có device: `adb devices -l`, install và test flow/permissions/keyboard/keyed maps; ghi evidence riêng.

## 7. Dung lượng nên dự trữ — chỉ là ước lượng

Phụ thuộc hệ điều hành, package cache, số image/ABI và số lần build. Đây là **khoảng dự trù**, không phải yêu cầu chính xác của nhà cung cấp.

| Thành phần | Khoảng dự trù | Vai trò cần |
|---|---|---|
| Git/Node/npm/editor và Node caches | 1–3 GB cộng extensions tùy máy | Cả nhóm |
| node_modules server hoặc Firebase tooling/test riêng | 0.5–2.5 GB | Backend/Database; full workspace có thể lớn hơn |
| node_modules đầy đủ Expo/mobile + caches | 2–5 GB | Frontend/CI integration |
| Firebase CLI/emulator binaries + Java/cache/test data nhỏ | 0.5–2 GB; dữ liệu export cộng thêm | Backend/DB; JDK tính riêng nếu chưa cài |
| Android Studio + SDK/build tools/platforms/NDK/Gradle caches | 10–25 GB hoặc hơn khi nhiều version | Chỉ Frontend native |
| Một Android emulator system image/AVD userdata | 3–8 GB mỗi AVD, tăng theo snapshot | Frontend; thiết bị thật tiết kiệm phần AVD |
| Source riêng, không node_modules/native caches/exports | Khoảng 0.1–0.5 GB cho quy mô hiện tại | Cả nhóm; không tính backup DB thật |
| Build outputs/APK/web/test screenshots/logs | 1–5 GB khi tích lũy nhiều lần/ABI | Frontend/CI; có thể dọn artifacts do mình tạo |

Backend/DB nên dự trữ khoảng 5–10 GB trống cho Node+Java/emulator/cache ban đầu; Frontend native nên có 25–50 GB trống, tăng nếu nhiều AVD/NDK. Không tải emulator image để làm backend nếu không cần test mobile. Không commit dependencies, DB exports, APK hay caches để người clone phải tải chúng.
