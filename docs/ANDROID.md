# Chạy ứng dụng Android

## Source clone và bản chạy gần nhất

Native source và Gradle wrapper nằm trong `apps/mobile/android/`. APK, SDK local path và signing keys không được commit. Ngày 17/11/2026 đã build bản x86_64, cài và mở màn Tổng quan ở Mock Mode trên Pixel 9/Android 15; đây chưa phải kiểm thử toàn bộ hành trình native. Pixel 9 cũ lỗi Settings nên phiên kiểm chứng dùng ảnh userdata riêng, giữ dữ liệu gốc.

Sau `npm.cmd ci` ở root, tạo **debug key local dùng thử** nếu clone chưa có key. Chạy tại `apps/mobile/android/`, với JDK trong PATH:

```powershell
# Chỉ chạy khi app/debug.keystore chưa tồn tại; không ghi đè key đang có.
if (-not (Test-Path -LiteralPath 'app/debug.keystore')) {
  keytool -genkeypair -keystore app/debug.keystore -storepass android -alias androiddebugkey -keypass android -dname "CN=Android Debug,O=Android,C=US" -keyalg RSA -keysize 2048 -validity 10000
}
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:EXPO_PUBLIC_DATA_SOURCE='mock'
$env:NODE_ENV='production'
.\gradlew.bat :app:assembleRelease -PreactNativeArchitectures=x86_64 --no-daemon --max-workers=2 --console=plain
```

Mật khẩu `android` là mặc định công khai của key debug tạo mới, không phải credential production. Key và APK bị ignore. Dùng `arm64-v8a` cho điện thoại ARM64. Linux/macOS dùng `./gradlew` và đường dẫn SDK của máy. Build mới cần tải toolchain/Gradle/Maven; phần kiểm chứng clone Phase 5 không yêu cầu Backend/Database tải Android SDK.

Không cần chạy prebuild để thử native source đã có. Chỉ prebuild khi muốn đồng bộ plugin/config và review native diff; prebuild có thể tái sinh file nên không coi đó là thao tác cài dependencies vô hại.

## APK demo có sẵn

Artifact lịch sử chỉ có ở máy build: `artifacts/di-chung-travel-map-arm64.apk`, khoảng 27 MB, build ngày 10/11/2026. Source clone không chứa thư mục artifacts; dùng hướng dẫn build ở trên. Application id `vn.dichung.travel`, version 1.0.0, min SDK 24, target SDK 36, ABI arm64-v8a. Chữ ký là chứng chỉ debug/demo, không phải bản phát hành cửa hàng. Chưa có Maps key trong APK này; màn khám phá vẫn tìm kiếm/dùng danh sách và hướng dẫn cấu hình bản đồ. Chi tiết tính năng và giới hạn dữ liệu tại [TRAVEL-MAP.md](TRAVEL-MAP.md).

1. Chạy backend bằng `npm.cmd run server` trên máy tính.
2. Kết nối điện thoại và máy tính vào cùng mạng Wi-Fi.
3. Cài APK. Ở màn đăng nhập, mở **Kết nối máy chủ / chạy trên điện thoại**.
4. Nhập `http://<IP-LAN-máy-tính>:4000`, lưu rồi chọn **Khám phá chuyến đi mẫu**.
5. Muốn thử biểu quyết với nhiều người, mở thêm web hoặc thiết bị khác và chọn tài khoản demo khác trong Cài đặt.

Địa chỉ mặc định Android là `http://10.0.2.2:4000` dành cho emulator. Trên điện thoại thật cần đổi sang IP LAN. Backend phải truy cập được từ thiết bị; nếu chưa kết nối được, kiểm tra địa chỉ và quyền mạng của tiến trình Node.

Bản đồ native Android cần `GOOGLE_MAPS_API_KEY` khi build riêng. Khi chưa có khóa, app hiện trạng thái thiếu cấu hình và không khởi tạo MapView gây lỗi. Màn radar web vẫn dùng Leaflet/OpenStreetMap và RainViewer.

## Tự build lại

Cần JDK 17+, Android SDK và các công cụ Android tương thích. Trong PowerShell:

```powershell
npm.cmd install
cd apps/mobile
$env:ALLOW_HTTP_DEMO='true'
# Nếu có khóa Maps: $env:GOOGLE_MAPS_API_KEY='...'
npx.cmd expo prebuild --platform android --no-install
cd android
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
.\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon --max-workers=2
```

APK ở `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`. Cấu hình hiện tại ký bản release thử nghiệm bằng debug keystore của template. Muốn phân phối thật cần cấu hình ký riêng; dùng HTTPS và tắt `ALLOW_HTTP_DEMO` rồi prebuild lại.

Không sao chép khóa LLM hoặc khóa thời tiết vào app. Chỉ khóa bản đồ dành cho client được cấu hình ở native, với giới hạn ứng dụng phù hợp tại nhà cung cấp.

## Expo Go

```powershell
npm.cmd run start -w @di-chung/mobile
```

Dự án dùng Expo SDK 55. Expo Go trên thiết bị phải tương thích SDK này; bản Expo Go mới trên cửa hàng không nhất thiết hỗ trợ mọi SDK cũ. Có thể dùng APK đã build thay thế. iOS cần máy/macOS và quy trình ký riêng; chưa tạo IPA trong đồ án này.
