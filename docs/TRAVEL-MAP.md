# Bản đồ du lịch Đi Chung

Cập nhật 10/11/2026. Nâng cấp trực tiếp ứng dụng Expo SDK 55 hiện có; giữ Express, Socket.io, quyền thành viên, biểu quyết và bộ lập lịch. Không thêm dependency hoặc migration cơ sở dữ liệu.

## Sử dụng

1. Đăng nhập, vào Khám phá và chọn thẻ Đà Lạt.
2. Bản đồ mở toàn màn hình, fit các điểm có tọa độ nguồn. Thu nhỏ để xem cụm; phóng to để tách marker. Chạm marker hoặc kết quả tìm kiếm để mở preview.
3. Tìm tên, loại hoặc thành phố, có hỗ trợ tên không dấu. Các chip lọc cùng dùng một danh sách với marker và bộ đếm. Thay bộ lọc giữ camera; Toàn cảnh bỏ lựa chọn và fit lại.
4. Xem chi tiết rồi chọn Xem trên bản đồ để trở lại đúng thành phố, tập dữ liệu đầy đủ và điểm đã chọn. Không lấy thành phố của nhóm để thay thế thành phố của địa điểm.
5. Muốn đi gọi wishlist API hiện có, kiểm tra nhóm cùng thành phố, cập nhật UI và đồng bộ Socket.io. Bình luận dùng panel realtime hiện có sau khi điểm thuộc wishlist/lịch nhóm.

Home, Dashboard, Wishlist và Timeline có lối vào bản đồ. Chi tiết có bản đồ tương tác nhỏ, thông tin thời tiết và dữ kiện du lịch riêng. Danh mục phân trang ở giao diện; bản đồ luôn tải cả tập thành phố. Tìm kiếm debounce 250 ms; catalogue cache 5 phút và gộp request đang chạy.

## Dữ liệu thực tế được tích hợp

- `GET /api/places?cityId=dalat` trên seed chuẩn trả **80 địa điểm riêng biệt**, tương ứng 80 đối tượng, tên và tọa độ OSM khác nhau. Bao gồm cảnh quan, văn hóa, tham quan và cafe/thư giãn.
- **25 ID cũ** được đối chiếu và giữ nguyên; **55 điểm mới** dùng ID ổn định `dalat-osm-{type}-{id}`.
- **15 bản ghi Đà Lạt cũ chưa có đối chiếu đủ chắc chắn** vẫn nằm trong DB để không xóa wishlist/lịch/bình luận đã có, nhưng không xuất hiện trong danh mục khám phá mặc định nếu còn nhãn seed `THAM KHẢO:`. `/places/:id` vẫn truy cập được, `geographyVerified: false`, không vẽ marker.
- Chi tiết bản ghi chưa có tọa độ nguồn vô hiệu hóa nút định vị; deep link cũ hiện lý do và tên điểm, cho phép chủ động khám phá thành phố thay vì âm thầm bỏ lựa chọn.
- DB seed chuẩn vì vậy có **95 hàng Đà Lạt**, trong đó 80 phục vụ khám phá, và vẫn giữ **40 hàng Vũng Tàu**. Tọa độ Vũng Tàu cũ chưa xác minh nên chưa vẽ chúng lên bản đồ. Danh sách vẫn dùng được.
- Đây là **khu vực du lịch Đà Lạt**, theo phạm vi chuyến đi đã có của ứng dụng; có điểm lân cận như Langbiang/Làng Cù Lần. Chưa xác minh 80 điểm đều nằm trong một ranh giới hành chính hiện hành. Không coi ID thành phố lập lịch là chứng nhận địa giới.
- `geographyVerified` nghĩa là tọa độ lưu trong DB khớp đối tượng nguồn OSM và city ID catalogue, **không phải kiểm chứng thực địa, cổng vào, tình trạng mở cửa hoặc khả năng tiếp cận**. Với way/relation, marker là bounding-box center do Overpass trả về; hồ có thể có marker giữa mặt nước. Không có tọa độ ngẫu nhiên để đạt số lượng.

Nguồn: [OpenStreetMap contributors, ODbL](https://www.openstreetmap.org/copyright). Snapshot gốc của 80 đối tượng cùng tags, truy vấn và thời điểm cơ sở dữ liệu nằm trong `apps/server/data/dalat-osm-sources.json`. Mỗi điểm có liên kết node/way/relation trực tiếp trong API và preview.

Giá vé, thời lượng chưa có nguồn là `null` trong `visitorInfo`. Giờ mở cửa chỉ dùng `opening_hours` nếu OSM có ghi, chưa xác minh với đơn vị vận hành. Phân loại trong/ngoài trời là ước tính, một địa điểm có thể hỗn hợp. Không thêm rating. Chưa có ảnh riêng có giấy phép được đối chiếu cho các điểm mới: dùng cover theo loại địa điểm, ghi rõ ảnh chưa có; ảnh thành phố hiện có được gắn nhãn minh họa.

### Tương thích API/bộ lập lịch

Các trường số cũ `priceVnd`, `durationMin`, `openHour`, `closeHour` vẫn giữ để không phá bộ lập lịch và hợp đồng hiện có. **Chúng là giả định kỹ thuật, không phải giá vé, thời lượng hoặc giờ hoạt động đã xác minh.** Record mới có giả định 0 VND/60 phút/08–20h; record cũ giữ giả định trước đó. API bổ sung `planningAssumptions.verified: false` và `visitorInfo` tách biệt. Frontend khám phá/chi tiết/wishlist dùng `visitorInfo`, không hiển thị 0 giả định thành miễn phí. Màn AI cảnh báo giới hạn này. Lịch trình và dự toán hiện vẫn cần xác minh trước khi dùng cho chuyến đi thực tế.

Seed cập nhật có điều kiện và chạy lại an toàn: chỉ sửa bản ghi do seed sở hữu (`THAM KHẢO:` hoặc `OSM:`). Không ghi đè record có nhãn người vận hành. Không xóa foreign key hoặc thay đổi ID lịch sử. Nếu DB có dữ liệu riêng, số lượng và số marker được xác minh có thể khác seed chuẩn.

## Kiến trúc và nền tảng

| Tệp | Trách nhiệm |
| --- | --- |
| `apps/mobile/src/map/MapExplorer.tsx` | Thành phố, lựa chọn, tìm kiếm, bộ lọc, danh sách, thời tiết/radar |
| `TravelMap.tsx` | react-native-maps 1.27.2, camera, marker memo, grid clustering native |
| `TravelMap.web.tsx` | Leaflet 1.9.4 + leaflet.markercluster 1.5.3, iframe sandbox, cập nhật marker theo ID |
| `model.ts` | Tìm không dấu, phân loại, clustering, tọa độ hợp lệ, giới hạn khung giờ chuyến đi, đánh giá thời tiết |
| `DestinationSheet.tsx` | Preview có animation, kéo mở rộng/thu gọn trên mobile |
| `PlaceFacts.tsx`, `WeatherInsight.tsx` | Dữ kiện riêng biệt, cover thiếu ảnh và giải thích dự báo |
| `useCatalog.ts` | Cache và gộp request địa điểm |
| `apps/server/src/dalat-catalog.ts` | Catalogue có nguồn phía backend, không đưa mảng địa điểm vào bundle frontend |
| `seed.ts`, `store.ts`, `app.ts` | Seed có điều kiện, provenance API, retirement seed cũ, tìm tên/loại/thành phố |

Iframe chỉ nhận tin nhắn từ parent; parent kiểm tra source iframe và ID có trong dữ liệu. Tên điểm đưa vào tooltip bằng textContent. Chọn một marker không dựng lại iframe/bản đồ hoặc các marker khác. Tile và thư viện lỗi có thông báo/thử lại, danh sách và wishlist vẫn hoạt động.

Web dùng URL chuẩn `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, attribution hiển thị, cache trình duyệt mặc định, không prefetch/offline. Thư viện cần truy cập `unpkg.com`. Xem [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/); khi triển khai lớn cần nhà cung cấp tile phù hợp tải sử dụng. Native dùng bản đồ nền của SDK theo nền tảng.

## Thời tiết và radar

- Đọc endpoint weather theo nhóm, mode, ngày và giờ chuyến đi. Forecast tại **tâm thành phố**, không gọi 80 dự báo cho 80 marker.
- Thiếu dữ liệu, khoảng giờ thiếu nguồn, chuyến đã qua hoặc cache quá 60 phút cho trạng thái chưa đánh giá; cho phép tải lại. Không suy ra thời tiết khô từ nguồn thiếu.
- Ngoài trời: có nguồn đạt ngưỡng risk của engine hoặc mưa vừa/nặng thì cảnh báo mưa; còn lại chỉ ghi có thể cân nhắc hoạt động ngoài trời. Trong nhà là gợi ý, không đảm bảo an toàn đường đi/khuôn viên.
- Forecast DEMO được gắn nhãn giả lập. Không gọi LLM để tính thời tiết hoặc tạo phần trăm phù hợp.
- Radar dùng `/api/radar`, chỉ các frame quá khứ, sắp theo thời gian, từ chối timestamp tương lai và host/path không hợp lệ. Có nút trước/sau, timestamp Việt Nam và attribution RainViewer. Tile được overzoom từ zoom 7. Không có nowcast tương lai; độ phủ từng điểm chưa được xác minh và UI nói rõ tile trống không có nghĩa trời khô.

Nguồn hợp đồng radar: [RainViewer Weather Maps API](https://www.rainviewer.com/api/weather-maps-api.html).

## Chạy và cấu hình

```powershell
# Tại thư mục PROJECT
npm.cmd run dev
# Hoặc tách hai terminal
npm.cmd run server
npm.cmd run web
```

Web: `http://localhost:8081`. API: `http://localhost:4000`. Seed áp dụng lúc backend khởi động. Không cần key cho web map.

Android/Expo Go: `npm.cmd run start -w @di-chung/mobile`; dùng Expo Go tương thích SDK 55. Thiết bị thật cần `EXPO_PUBLIC_API_URL=http://<IP-LAN>:4000` hoặc sửa URL trong Cài đặt. Emulator mặc định `10.0.2.2:4000`.

Android APK riêng:

```powershell
cd apps/mobile
$env:GOOGLE_MAPS_API_KEY='<client key của bạn>'
# Chỉ cho demo HTTP nội bộ; production dùng HTTPS và bỏ biến này
$env:ALLOW_HTTP_DEMO='true'
npx.cmd expo prebuild --platform android --no-install
cd android
$env:JAVA_HOME='C:\Program Files\Java\jdk-21'
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:GRADLE_USER_HOME="$env:USERPROFILE\.gradle"
.\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon --max-workers=2
```

`GOOGLE_MAPS_API_KEY` phải có tại **cả prebuild và build**, bật Maps SDK for Android, giới hạn Android application theo package `vn.dichung.travel` và SHA-1 chứng chỉ ký. Build demo dùng debug certificate; bản store dùng chứng chỉ phân phối tương ứng. Thiếu key, standalone không khởi tạo MapView và hướng dẫn dùng danh sách/web. Không có key được hardcode hoặc đưa key thời tiết/LLM vào mobile.

Các biến backend hiện có vẫn giữ: `DATABASE_URL`/`PGLITE_DATA_DIR`, `JWT_SECRET`, `ALLOW_DEMO`, `SEED_DEMO`, `WEATHERAPI_KEY`, `TOMORROW_API_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`. Chỉ bản đồ native cần thêm client key đã có trong app.config.ts. Xem `apps/mobile/.env.example` và `docs/ANDROID.md`.

## Tái tạo dữ liệu và kiểm thử

Catalogue có thể tái tạo offline từ snapshot 80 đối tượng đã lưu:

```powershell
node scripts/curate-dalat.mjs
```

Muốn đối chiếu snapshot Overpass mới, lần lượt chạy `node scripts/fetch-dalat-osm.mjs raw`, `extra`, `natural` rồi curate. Không chạy các bước này khi khởi động app hoặc cho mỗi người dùng; đây là công cụ bảo trì dữ liệu. Truy vấn lỗi/không đầy đủ phải thất bại, không ghi tọa độ thay thế. Các ID được chọn rõ ràng trong curate script; không tự lấy N đối tượng bất kỳ để đủ số lượng.

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:integration
npm.cmd run build:web
# Dùng terminal riêng để QA không chạm database người dùng
npm.cmd run preview:ui
# Sau khi preview sẵn sàng, chạy tuần tự; không export đè dist khi đang test
npm.cmd run test:ui
npm.cmd run test:map
```

Preview QA dùng PGlite trong bộ nhớ, chỉ bind loopback 4000/8081 và xóa trạng thái khi dừng. Cần đóng dev server cùng cổng trước khi dùng. Kết quả/screenshot nằm trong `artifacts/ui/`, `artifacts/map/`; log Android tại `artifacts/android-map-build.log`.

Chưa có kiểm thử thao tác Google Maps trên thiết bị Android có key hợp lệ, kiểm chứng hiện trạng 80 cơ sở tại thực địa, hay kiểm chứng khí tượng vi mô từng điểm. Build APK và kiểm thử mobile web không thay thế các kiểm chứng đó. Các màn quản lý nhóm, thời tiết, hồ sơ và biểu quyết được giữ trên hệ UI hiện có; đợt này tập trung đổi trải nghiệm khám phá, chi tiết và kết nối bản đồ, không viết lại mọi màn hình.
