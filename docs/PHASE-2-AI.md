# Phase 2 — AI discovery và lịch trình trên bản đồ

Cập nhật 10/11/2026. Triển khai trên ứng dụng hiện có; không tạo ứng dụng, catalogue hay cơ chế biểu quyết thay thế. Bản này hoạt động bằng RULE_BASED khi thiếu key. Tích hợp OpenAI đã qua kiểm tra hợp đồng HTTP, **chưa được xác minh với model thật**.

## 1. Tính năng đã triển khai

- **Find My Perfect Trip** hoạt động độc lập với planner. Người dùng chọn thành phố, ngày, giờ bắt đầu, thời lượng, ngân sách, hoạt động, bảy phong cách, trong/ngoài trời, điểm ưu tiên và sở thích nhóm. Việc tạo gợi ý không tạo lịch hoặc tự ghi wishlist.
- Gợi ý chỉ dùng địa điểm cùng thành phố có tọa độ đối chiếu với nguồn Phase 1. Backend lọc ngày giờ, giá vé có nguồn, môi trường và thời tiết trước khi gửi shortlist tối đa 18 điểm cho model. Đầu ra tối đa 12 điểm.
- Kết quả có thứ hạng, giải thích theo dữ kiện, khoảng tham quan, thông tin còn thiếu, thời điểm tạo và nhãn engine/DEMO. Không hiển thị điểm số hay xác suất phù hợp giả. Có thể định vị từng điểm, xem marker đánh số, đổi giữa toàn bộ catalogue và các gợi ý, lưu vào wishlist nhóm.
- Khi thời tiết bất lợi, có thể có tối đa ba phương án trong nhà riêng. Các phương án này ghi rõ RULE_BASED và nằm ngoài bộ lọc hoạt động/môi trường ban đầu; không âm thầm thay yêu cầu người dùng.
- Gợi ý chuyển các ID được chọn sang planner hiện có. Leader có thể chỉnh ngày, giờ, ngân sách nhóm và chọn tối đa 20 điểm trước khi tạo phương án. Vẫn dùng API planner và quy trình biểu quyết cũ; không tự áp dụng lịch.
- Planner kiểm tra khoảng mở cửa có nguồn, kể cả nghỉ giữa ngày; ngân sách, thời lượng, thời gian di chuyển, trùng điểm, dữ kiện thời tiết và phần lịch đã bắt đầu. LIVE bỏ qua thời gian đã trôi qua, làm tròn lên 5 phút và thêm đệm 5 phút; DEMO mô phỏng khung ngày đã chọn.
- Bản đồ lịch trình có marker thứ tự, đường nét đứt, chọn marker/timeline hai chiều, tự cuộn, focus và nút toàn tuyến. Timeline kéo hoặc bấm để mở rộng, có giờ, thời lượng, dự toán và thời tiết từng điểm. Điểm thiếu tọa độ không được ghim; đường không nối bắc qua khoảng thiếu dữ liệu.
- Giữ nguyên wishlist realtime, phân quyền, snapshot cử tri, phiếu không trùng, đa số, phương án STALE và reconnect Socket.io. Đổi ngày/giờ/ngân sách/chế độ làm stale phương án đang chờ, không thay lịch chính thức.

## 2. Tệp thay đổi

| Nhóm | Tệp |
| --- | --- |
| Module server mới | `apps/server/src/recommendations.ts`, `llm.ts`, `travel-facts.ts`, `places.ts` |
| Server nâng cấp | `apps/server/src/app.ts`, `planner.ts`, `services.ts`, `store.ts`, `weather.ts` |
| UI mới | `apps/mobile/src/ai/RecommendationStudio.tsx`, `Explanation.tsx`, `ItineraryExplorer.tsx`, `itineraryModel.ts`, `options.ts` |
| UI/map tích hợp | `apps/mobile/App.tsx`, `src/api.ts`, `src/types.ts`, `src/map/MapExplorer.tsx`, `TravelMap.tsx`, `TravelMap.web.tsx`, `model.ts`, `WeatherInsight.tsx`; mới `useForecast.ts` |
| Kiểm thử | `apps/server/test/discovery.test.ts`, các kiểm tra domain thời tiết/planner; `scripts/recommendation-contract.mts`, `phase2-smoke.mjs`, `phase2-ui.mjs`; lệnh trong `package.json` |
| Tài liệu/bằng chứng | Tệp này, README, `API-CONTRACT.md`, `KIEM-THU.md`, log/JSON/ảnh và APK dưới `artifacts/` |

Không thêm dependency hoặc migration database. Sở thích mới lưu vào JSONB hiện có. Provenance địa điểm được tách thành module dùng chung, không tạo catalogue AI riêng.

## 3. API mới và sửa đổi

`POST /api/ai/recommendations` yêu cầu đăng nhập, giới hạn 6 yêu cầu/người/phút. Body:

```json
{
  "cityId": "dalat",
  "tripDate": "2026-11-11",
  "budgetPerPersonVnd": 600000,
  "startHour": 8,
  "durationHours": 10,
  "categories": ["NATURE"],
  "environmentPreference": "ANY",
  "travelStyles": ["PHOTOGRAPHY"],
  "preferredPlaceIds": [],
  "groupId": null,
  "mode": "live",
  "limit": 6
}
```

Category: `NATURE|CULTURE|ENTERTAINMENT|FOOD_CAFES`. Style: `ADVENTURE|RELAXATION|NATURE|PHOTOGRAPHY|CULTURE|FOOD_CAFES|FAMILY`. Giờ/thời lượng theo bước 0,5 giờ; thời lượng 0,5–16 giờ và không vượt ngày. `mode` là `live|demo`; demo chỉ khi server cho phép.

Nếu có groupId, phải là thành viên và city/date/budget/start/duration/mode phải trùng nhóm; lệch trả 409 `GROUP_CONSTRAINTS_CHANGED`. ID ưu tiên ngoài thành phố hoặc chưa có nguồn trả 422 `INVALID_PREFERRED_PLACE`. Zod chặn trường lạ và giá trị ngoài miền. Không có ứng viên trả danh sách rỗng kèm cảnh báo.

Response gồm `requestId, engine, model, fallbackReason, demo, input, recommendations, weatherAlternatives, weather, candidateCount, groupPreferenceCount, cached, generatedAt, warnings`. Mỗi recommendation có `placeId, rank, place, reason, preferenceReasons, weatherExplanation, weather, visit, budgetStatus, missingInformation, factIds, facts, alternativePlaceIds`. Không trả priority nội bộ.

- `GET/PATCH /groups/:id/preferences`: thêm `environmentPreference` và `travelStyles`. PATCH merge JSONB; client cũ chỉ gửi categories không xóa hai trường mới. Chỉ sửa sở thích của chính mình.
- `PATCH /groups/:id`: thêm `tripDate,startHour,endHour`; kiểm tra khung giờ kết hợp trong transaction và stale đề xuất dùng ràng buộc cũ. Quyền leader và expectedRevision giữ nguyên.
- `POST /groups/:id/plans/generate`: thêm tùy chọn `placeIds` 1–20 ID duy nhất, cùng thành phố, có tọa độ nguồn. Không gửi trường này vẫn dùng wishlist như trước.
- Plan view thêm `tripContext` từ snapshot, `totalDurationMin,totalTravelMin,unknownCostCount,route`. `route.kind=STRAIGHT_LINE`, khoảng cách hình học và danh sách ID không thể vẽ. Snapshot giữ đúng bối cảnh phương án cũ khi nhóm thay ngày.
- Weather slots thêm `temperatureC,windKmh` nullable. Không xóa hay đổi nghĩa các trường mưa cũ.

## 4. Model và trạng thái thực tế

Model cấu hình mặc định hiện có là `gpt-4.1-mini`; đổi bằng `OPENAI_MODEL`. Chỉ backend đọc `OPENAI_API_KEY`. Transport chung gọi Responses API với JSON Schema strict, `store:false`, tối đa hai request đồng thời, timeout 30 giây/lần và tối đa hai lần thử ở mỗi caller. Frontend cho phép tối đa 90 giây ở hai thao tác AI.

Discovery chỉ cho model trả ID hợp lệ, rank liên tiếp, reasonCodes và factIds của đúng ứng viên. Backend kiểm định rồi dựng câu giải thích bằng mẫu đã duyệt; model không được tạo tên điểm, thời tiết, giá hoặc văn xuôi tùy ý. Planner dùng validator hiện có, mở rộng với cửa sổ giờ nguồn và dữ kiện mới. Refusal, incomplete, HTTP lỗi, JSON sai hoặc kết quả vi phạm đều dẫn tới fallback có nhãn.

**Môi trường này không có OPENAI_API_KEY hoặc tệp .env chứa key. Không thực hiện cuộc gọi OpenAI thật.** Kết quả kiểm tra giao diện là RULE_BASED với `fallbackReason=NO_API_KEY` và `model=null`. Các kiểm tra HTTP mock chứng minh giao thức/validator/retry, không chứng minh chất lượng, độ trễ hay quyền truy cập model thật.

Tham chiếu giao thức: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). Để nghiệm thu model thật: cấu hình key backend, chạy riêng LIVE ở ngày trong phạm vi dự báo, xác nhận engine=LLM, kiểm tra ID/facts/chi phí/giờ và lưu response đã loại bí mật. Không đổi nhãn fallback để vượt tiêu chí nghiệm thu.

## 5. Màn hình và hiệu năng

Home, Discover, bản đồ, chi tiết điểm, wishlist và dashboard có lối vào discovery/planner. RecommendationStudio tái sử dụng cho setup/results thay vì hai bộ navigation. AISetup cũ được mở rộng; Proposal/Timeline có nút mở bản đồ lịch trình. PreferencesPanel lưu phong cách và môi trường. Các route map/recommendations/itineraryMap dùng toàn màn hình.

Giữ clustering, tìm không dấu/debounce và cache catalogue Phase 1. Marker đánh số tách khỏi cluster; registry web cập nhật marker hiện có, geometry mới mới vẽ lại route. Gợi ý có cache theo user/input/preferences/revision trong ba phút, tối đa 30 entry; request trùng đang chạy được gộp. Kiểm tra membership trước cache. Forecast hook cache/gộp request 60 giây, tối đa 20 entry; đổi user/city/date tách scope. Payload model là shortlist dữ kiện gọn, không gửi ảnh hoặc bình luận. Danh sách catalogue vẫn có giới hạn hiển thị/tải thêm; gợi ý và điểm planner có giới hạn rõ ràng.

## 6. Kiểm thử và artifact

Kết quả chạy trên mã Phase 2:

| Kiểm tra | Kết quả |
| --- | --- |
| TypeScript mobile/server | PASS |
| Unit/domain | 35/35 PASS |
| Hợp đồng planner HTTP | 4/4 PASS; mock |
| Hợp đồng recommendation HTTP | 8/8 PASS; mock |
| REST/Socket hồi quy | 16/16 PASS |
| REST/Socket Phase 2 | 9/9 PASS |
| Desktop/mobile web Phase 2 | 10/10 PASS |
| UI hồi quy | 39/39 PASS |
| Map hồi quy | 7/7 PASS |
| Web export | PASS |
| Android arm64 release build | BUILD SUCCESSFUL; `artifacts/android-phase2-build.log`; chữ ký v2 được xác minh |

Kiểm tra mới bao phủ giờ đã trôi qua, vé chưa biết không phải miễn phí, giá nguồn, nghỉ trưa, thời tiết thiếu/cũ/một nguồn, gió/nhiệt độ, ID/fact/reason sai, quyền nhóm, không tự ghi khi discovery, đề xuất từ selected IDs, đa số/phiếu trùng, đổi ngày/giờ, reconnect và chọn marker/timeline hai chiều.

Ảnh và JSON: `artifacts/phase2-ui/`, `phase2-integration-results.json`, `recommendation-contract-results.json`, `llm-contract-results.json`. APK: `artifacts/di-chung-phase2-arm64.apk`. `phase2-verification.json` ghi hash và tổng hợp nghiệm thu. UI dùng database QA riêng; một HTTP 502 được chủ động chèn để thử retry, không thay kết quả gợi ý thành công bằng dữ liệu giả.

## 7. Giới hạn còn lại

- 80 điểm là khu vực Đà Lạt theo snapshot OSM, chưa xác minh thực địa/lối vào/địa giới/hiện trạng. Vũng Tàu chưa có tọa độ đủ nguồn để discovery mới nhận làm ứng viên. Dữ liệu số cũ chưa có nguồn vẫn là giả định, không bảo đảm tổng tiền thực tế.
- Parser giờ chỉ hỗ trợ tập con đơn giản: 24/7, ngày/chuỗi ngày, nhiều khoảng trong ngày và off/closed. Ngày lễ, điều kiện phức tạp, qua đêm chưa hỗ trợ, hiển thị chưa biết và dùng giả định có nhãn.
- Thời tiết là tại tâm thành phố. Mưa dùng cơ chế ít nhất hai nguồn hợp lệ và quá nửa đồng thuận hiện có. Nhiệt độ/gió là dữ liệu tùy nguồn; thiếu vẫn null. Nhiệt độ gộp trung vị trên, gió lấy lớn nhất từ nguồn OK. Ngưỡng 40 km/h, ≤5°C hoặc ≥35°C là quy tắc thận trọng của đồ án, không phải thang cảnh báo khí tượng chính thức. DEMO không bịa nhiệt độ/gió.
- Open-Meteo được căn interval mưa về giờ bắt đầu; nhiệt/gió lấy cùng mốc. Tomorrow metric windSpeed đổi m/s sang km/h; WeatherAPI dùng wind_kph. Tham chiếu: [Open-Meteo](https://open-meteo.com/en/docs), [Tomorrow.io Core](https://docs.tomorrow.io/reference/data-layers-core), [WeatherAPI](https://www.weatherapi.com/docs/).
- Đường thẳng và thời gian di chuyển theo công thức, chưa có định tuyến đường bộ/giao thông. Chưa tính chặng từ vị trí thật của người dùng tới điểm đầu. Dữ kiện sở thích/phong cách/trong nhà là heuristic, không xác nhận khả năng tiếp cận hoặc độ phù hợp riêng cho trẻ em.
- Tile bản đồ phụ thuộc mạng; trong lượt chụp QA có lúc tile lỗi và UI hiện retry. Marker/route vẫn kiểm tra được. Không coi ảnh nền trống là bản đồ offline.
- Chưa có Maps key để nghiệm thu native tương tác trên thiết bị thật; build APK không thay thế kiểm thử Android/iOS. Chưa nghiệm thu OpenAI/WeatherAPI/Tomorrow.io thật bằng tài khoản có key, PostgreSQL mạng, push nền hoặc tải nhiều tiến trình. Cache/limiter/concurrency hiện theo tiến trình.

## 8. Milestone tiếp theo

Nghiệm thu bằng key và thiết bị thật: chạy cùng bộ dữ kiện qua OpenAI thật, lưu bằng chứng engine/facts và đo thời gian/chi phí; kiểm tra nguồn thời tiết và native Maps trên Android. Sau đó bổ sung giá/giờ/lối vào có nguồn, dịch vụ route đường bộ và cache/limiter phân tán trước khi mở cho nhiều người dùng.
