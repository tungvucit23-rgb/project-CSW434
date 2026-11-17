# Đi Chung API

Backend Express 5 + Socket.io + TypeScript, sử dụng SQL PostgreSQL. Chạy độc lập hoặc từ workspace gốc:

```powershell
npm run server
# Chạy ổn định, không watch:
npm run start -w @di-chung/server
```

API mặc định `http://localhost:4000/api`. Sao chép `.env.example` thành `.env` tại thư mục này khi cần cấu hình. `GET /api/health` kiểm tra DB và trạng thái cấu hình LLM.

Không có `DATABASE_URL`, PGlite lưu PostgreSQL nhúng ở `.data/postgres`; khóa ký JWT phát triển nằm riêng tại `.data/.jwt-secret` để `initdb` có thư mục trống. Có `DATABASE_URL`, backend dùng `pg.Pool` và transaction trên connection riêng. Dùng `PGLITE_DATA_DIR` để đổi thư mục; `:memory:` dành cho kiểm thử. Migration và seed chạy khi khởi động, không cần Docker.

Các đường dẫn được tính theo thư mục làm việc. Lệnh npm workspace tự chạy tại `apps/server`. Tránh chạy nhiều tiến trình cùng mở một thư mục PGlite; dùng PostgreSQL nếu cần nhiều instance.

## Dữ liệu khởi đầu

- Hai thành phố `dalat`, `vungtau`; hiện listing có **80 điểm Đà Lạt** từ nguồn OSM và **40 điểm Vũng Tàu**. Record Đà Lạt cũ vẫn được giữ cho lịch sử, không suy ra tổng raw row từ số điểm hiển thị. Xem [catalogue và nguồn dữ liệu](../../docs/TRAVEL-MAP.md).
- Tọa độ Đà Lạt có nguồn OSM; tọa độ Vũng Tàu chưa được xác minh. Giá, giờ mở cửa và thời lượng chưa biết phải giữ nhãn/null đúng dữ liệu; ảnh chỉ minh họa. Mỗi API Place có `dataQuality`/provenance nêu hạn chế; không coi catalogue này là xác minh mọi thông tin du lịch.
- Nhóm `demo-group`, mã mời `DICHUNG`, ba tài khoản mẫu, tám địa điểm yêu thích và lịch mẫu đã chốt. Mã mẫu có hạn một năm kể từ lúc seed; mã nhóm mới có hạn 30 ngày.
- `POST /api/auth/demo` với `{"persona":"leader"}`, `"member"` hoặc `"third"` đăng nhập từng tài khoản để kiểm chứng đa số thật. Không tự tạo phiếu đồng ý.
- `ALLOW_DEMO=false` tắt đăng nhập và giả lập; trong production mặc định tắt. Production bắt buộc cấu hình `JWT_SECRET`.

## Các bảo đảm nghiệp vụ

Danh sách cử tri được chốt khi mở biểu quyết. Chỉ `floor(eligible/2)+1` phiếu YES mới áp dụng. Backend khóa dòng nhóm, kiểm tra `basePlanId` và snapshot ràng buộc (thành phố, ngày, giờ, ngân sách, chế độ), cập nhật con trỏ lịch và đóng phương án cũ trong cùng transaction. Snapshot được kiểm tra cả khi lưu kết quả LLM và khi áp dụng; so sánh theo trường, không phụ thuộc thứ tự key JSONB. Thay đổi ngân sách hoặc chế độ đóng phương án đang vote. Cử tri mới tham gia sau không có quyền vote trên ballot cũ. PGlite dùng mutex cho cả query và toàn bộ transaction để không xen kẽ `BEGIN`.

Bình luận có đúng một đích: điểm trong wishlist/lịch của nhóm hoặc một phương án của nhóm. Chỉ tác giả sửa/xóa. Room Socket.io cần JWT và kiểm tra thành viên phía server; trạng thái đang gõ cũng kiểm tra đích. Client phải tải trạng thái qua REST khi kết nối lại.

Thông tin nhóm cho phép người ghi sau thắng; `expectedRevision` dùng để ghi hoạt động đã ghi đè. Phương án đã mở vote không được sửa. Đổi giữa DEMO và LIVE xóa con trỏ lịch hiện hành và đóng phương án đang vote để tránh đổi nhãn lịch demo thành thật.

Ngoài hợp đồng API, có `GET/PATCH /api/groups/:id/preferences` trả/nhận `{"categories":["Văn hóa","Thiên nhiên"]}`. Mỗi người chỉ sửa sở thích của mình; loại địa điểm phải có trong thành phố của nhóm. Bộ quy tắc và LLM cùng dùng sở thích này.

## Thời tiết và AI

Open-Meteo dùng API thật không cần khóa. WeatherAPI và Tomorrow.io cần khóa riêng. Nguồn thiếu, lỗi hoặc cũ không được thay bằng số liệu giả và không được tham gia đồng thuận. Cache mặc định 15 phút, worker kiểm tra chuyến LIVE đang diễn ra mỗi 5 phút; có hạn mức dự phòng nội bộ cho từng provider. Hạn mức này không thay thế hạn mức thật của tài khoản. Worker và cache không làm tăng độ phân giải của nguồn dự báo.

Ngưỡng đồ án: `<0.2 mm/h` là NONE, `<2.5` LIGHT, `<7.6` MODERATE, còn lại HEAVY; đây không phải thang cảnh báo chính thức. Một nguồn báo nguy cơ khi `mm/h >= 0.2 AND probability >= 60%`. Cần ít nhất hai nguồn hợp lệ và quá nửa đồng thuận. Xác suất hiển thị là cao nhất trong các nguồn, lượng mưa là trung vị trên; tỷ lệ nguồn đồng thuận không được diễn giải thành xác suất mưa.

Open-Meteo cung cấp lượng mưa và xác suất cho giờ trước mốc `time`, đã dịch về đầu khoảng. Tomorrow.io trả cường độ tại mốc giờ, được dùng đại diện khoảng giờ và ghi rõ giới hạn. Dữ liệu giờ không đủ xác định phút bắt đầu/kết thúc mưa. Nguồn có thể dùng chung mô hình nền.

`OPENAI_API_KEY` bật gọi OpenAI Responses API thật, `text.format` dùng JSON Schema strict, tối đa hai lần gọi, mỗi lần timeout 30 giây. Có thể đặt `OPENAI_BASE_URL` để kiểm thử HTTP bằng máy chủ mock cục bộ. API key và lời nhắc chỉ nằm ở backend. Xem `src/planner.ts` để đọc system prompt và schema chính xác.

Validator kiểm tra schema, địa điểm cho phép, trùng điểm, ngân sách, thời lượng, mở cửa, khung chuyến, di chuyển, fact ID và khoảng thời tiết tương ứng. Ngoài trời không được đặt vào giờ có đồng thuận mưa. Lý do/tóm tắt bị loại khi có chữ số, từ số thông dụng hoặc khẳng định chắc chắn. Nếu nhắc thời tiết, lý do phải dùng nguyên văn câu được code cho phép trong `weatherReasonPolicy`, khớp trạng thái và fact của khoảng tham quan; tóm tắt không được đưa ra nhận xét thời tiết. Lý do về mở cửa, di chuyển và sở thích có thể viết tự do. Phần đã bắt đầu của lịch do code giữ nguyên. Nhận diện từ ngữ tự nhiên vẫn có giới hạn; không coi validator là bằng chứng mọi cách diễn đạt đều đúng.

Nếu thiếu khóa, API lỗi hoặc hai kết quả đều sai, thuật toán quy tắc tạo phương án có nhãn `RULE_BASED`. Không gọi đó là LLM. Muốn bảo vệ yêu cầu tích hợp LLM thật, cần cấp khóa và kiểm tra một lịch có `engine: "LLM"` trước khi demo.

`POST /api/groups/:id/demo/rain` chỉ trưởng nhóm DEMO sử dụng. Đồng hồ giả lập đặt trước một điểm ngoài trời, dữ liệu mang nhãn DEMO, phương án vẫn cần biểu quyết thật.

## Kiểm chứng và thông báo

Báo cáo tại chỗ cần thời gian quan sát trong năm phút gần nhất. Xác nhận nếu GPS sai số tối đa 100 m và tâm vị trí cách điểm trong wishlist tối đa 500 m; hoặc có hai tài khoản khác nhau cùng điều kiện trong vòng 10 phút, cách nhau tối đa 500 m và sai số mỗi báo cáo tối đa 200 m. Transaction khóa nhóm để xử lý cả hai báo cáo đến đồng thời. Tọa độ phía client có thể bị giả mạo; đây là xác nhận cộng đồng, không phải quan trắc chuyên dụng.

Mỗi lần kiểm tra có điểm đến tiếp theo, backend lưu mẫu dự báo cho mốc cộng 30 phút, đối chiếu báo cáo đã xác minh trong cửa sổ ±5 phút tại đúng khu vực. Kết quả chỉ chốt sau khi cửa sổ đóng và thêm năm phút nhận báo cáo, tức khoảng mốc cộng 40 phút hoặc chu kỳ worker kế tiếp. Thiếu hoặc mâu thuẫn bằng chứng được đóng với trạng thái UNKNOWN; không đọc lại mãi khiến mẫu mới bị bỏ đói. Thống kê chỉ tính mẫu thật, loại DEMO, và trả `accuracyPct:null` khi chưa có mẫu kiểm chứng. Không dùng dự báo khác làm thực tế.

Thông báo hiện được lưu database và phát Socket.io khi app kết nối. **Chưa tích hợp dịch vụ push hệ điều hành khi app đóng**; cần Expo Push/FCM/APNs cho giai đoạn triển khai tiếp theo. Backend worker phải đang chạy để kiểm tra định kỳ. RainViewer hiện dùng API radar quá khứ và coverage mask; chưa ngoại suy radar hay coi tile trong suốt là không mưa.

## Kiểm tra

```powershell
npm run typecheck -w @di-chung/server
npm run test -w @di-chung/server
```

Unit test kiểm tra ranh giới mưa, dữ liệu thiếu, quorum, lệch giờ Open-Meteo, validator LLM và câu thời tiết sai, prefix bất biến, thứ tự key JSONB, transaction/rollback, password scrypt và vòng đời kiểm chứng nhiều mẫu UNKNOWN. Các script smoke ở workspace gốc kiểm tra REST, room, vote và HTTP LLM bằng mock. Kiểm tra mock chứng minh contract; không thay thế lần gọi LLM có khóa thật.

Tài liệu nhà cung cấp: [Open-Meteo](https://open-meteo.com/en/docs), [WeatherAPI](https://www.weatherapi.com/docs/), [Tomorrow.io](https://docs.tomorrow.io/reference/weather-forecast), [RainViewer](https://www.rainviewer.com/api/weather-maps-api.html), [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).
