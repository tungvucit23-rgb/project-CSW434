# Nguồn dữ liệu và giới hạn sử dụng

Đối chiếu tài liệu chính thức ngày **17/10/2026**, múi giờ Việt Nam. Đây là điều kiện công bố tại thời điểm kiểm tra, không phải cam kết hạn mức của tài khoản chưa được cấp khóa. Kiểm tra lại dashboard và điều khoản trước khi trình diễn hoặc triển khai công khai.

## Dự báo có cấu trúc

| Nguồn | Điều kiện công bố đã đối chiếu | Cách dùng trong đồ án |
| --- | --- | --- |
| Open-Meteo | Open-Access dành cho phi thương mại; bảng giá nêu 600 cuộc gọi/phút, 5.000/giờ, 10.000/ngày và 300.000/tháng; không bảo đảm uptime. | Nguồn dự báo không cần khóa cho bản học tập. Chỉ lấy các biến cần thiết và cache. Không suy rằng miễn phí cho mọi mô hình kinh doanh. |
| WeatherAPI.com | Free công bố 100.000 cuộc gọi/tháng, dự báo theo giờ tối đa 3 ngày. FAQ nêu dự báo cập nhật khoảng 4–6 giờ; gọi lại thường xuyên không tạo ra bản dự báo mới. | Nguồn thứ hai, khóa chỉ đặt ở backend. Chuyến nằm ngoài chân trời gói miễn phí phải hiện thiếu dữ liệu. |
| Tomorrow.io | Tài liệu hỗ trợ Free nêu 500 yêu cầu/ngày, 25/giờ, 3/giây. Tài liệu endpoint Forecast nêu dự báo giờ tối đa 120 giờ, ngày tối đa 5 ngày; minutely được mô tả dành cho premium. | Nguồn thứ ba; cần xác nhận quyền field/endpoint bằng khóa của tài khoản thật. Không hứa dự báo từng phút tại Việt Nam. |

Nguồn: [Open-Meteo pricing](https://open-meteo.com/en/pricing), [WeatherAPI pricing và FAQ](https://www.weatherapi.com/pricing.aspx), [Tomorrow.io Free limits](https://support.tomorrow.io/hc/en-us/articles/20273728362644-Free-API-Plan-Rate-Limits), [Tomorrow.io Forecast](https://docs.tomorrow.io/reference/weather-forecast).

### Những điều chưa được chứng minh tại Việt Nam

- Có thể gửi tọa độ Việt Nam tới dịch vụ toàn cầu; điều đó **không chứng minh** dự báo đúng cho từng điểm du lịch, đặc biệt mưa cục bộ và địa hình Đà Lạt. Chưa có bộ quan trắc độc lập tại hai thành phố để công bố độ chính xác.
- Open-Meteo ghi rõ dữ liệu 15 phút ngoài Bắc Mỹ và Trung Âu được nội suy từ giờ. Tại Việt Nam không quảng bá nó như dự báo mưa địa phương cập nhật mới mỗi 15 phút. Trường lượng mưa theo giờ và xác suất của Open-Meteo áp dụng cho giờ trước mốc timestamp; adapter phải chuyển về khoảng hiệu lực thống nhất. [Định nghĩa biến và dữ liệu 15 phút](https://open-meteo.com/en/docs).
- Ba nhà cung cấp có thể sử dụng chung mô hình khí tượng nền. “Hai trong ba nguồn cùng báo mưa” là mức đồng thuận, **không phải xác suất 67%**, cũng không chứng minh ba sai số độc lập.
- Chưa dùng khóa thật để xác minh mọi trường trả về và hạn mức tài khoản WeatherAPI/Tomorrow.io. Thiếu khóa, HTTP 429, lỗi hoặc dữ liệu hết hạn phải trả `MISSING/ERROR/STALE`, không thay bằng dữ liệu giả trong LIVE.

### Ngân sách gọi API cho sinh viên

Nếu một vị trí dùng chung cache, kiểm tra mỗi 5 phút tương đương **12 yêu cầu/giờ, 288/ngày cho mỗi nguồn** khi chạy suốt ngày. Đây là phép tính của dự án, chưa tính retry, nhiều vị trí, nhiều tiến trình hoặc tile bản đồ. Một nhóm hoạt động một thành phố phù hợp để kiểm soát quota; không gọi riêng cho từng thành viên.

Không mở rộng thành 40 điểm × 3 nguồn × nhiều nhóm mà vẫn giữ chu kỳ 5 phút. Cache theo nguồn + vị trí + ngày, giới hạn đồng thời, backoff khi 429 và chỉ chạy cho chuyến hoạt động. Cache một tọa độ đại diện thành phố là giới hạn của bản mẫu, phải nói rõ chưa theo dõi vi khí hậu từng điểm đến.

## Radar RainViewer

Sau thay đổi **01/01/2026**, public API còn radar quá khứ khoảng 2 giờ, các frame cách nhau 10 phút; bỏ nowcast tương lai và satellite IR, giới hạn zoom 7, 100 yêu cầu/IP/phút. Không xây chức năng dự báo 30–60 phút bằng public radar này. [Thông báo chuyển đổi API](https://www.rainviewer.com/api/transition-faq.html).

Lấy danh sách frame từ `https://api.rainviewer.com/public/weather-maps.json`, dùng `host` và `path` trong phản hồi để dựng tile; không hardcode timestamp. Có coverage mask và cần hiển thị ghi công. [Weather Maps API](https://www.rainviewer.com/api/weather-maps-api.html).

Ảnh website do người dùng cung cấp chứng minh có lớp mưa hiển thị tại một số khu vực Việt Nam lúc chụp. Nó không chứng minh coverage đầy đủ tại Đà Lạt/Vũng Tàu hoặc website dùng đúng dữ liệu mà public API cung cấp. Kiểm tra coverage mask, frame timestamp và tile tại tọa độ thực trước khi nhận xét.

**Tile trong suốt không đồng nghĩa trời không mưa**: có thể ngoài vùng phủ, lỗi tải hoặc không có tín hiệu mưa. UI cần trạng thái không có dữ liệu, thông tin thời điểm frame và liên kết tham khảo website. Radar phục vụ quan sát; không được tính như lá phiếu thứ ba trong hợp nhất dự báo.

## LLM

Backend tích hợp OpenAI Responses với `text.format` kiểu `json_schema`, `strict: true`; vẫn phải xử lý refusal, phản hồi thiếu, timeout và kiểm tra nghiệp vụ. Schema đúng không bảo đảm số liệu hoặc lịch trình đúng. [OpenAI official Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

LLM có thể phát sinh phí, không hứa có gói miễn phí. Model và hạn mức phụ thuộc cấu hình/tài khoản; không cần khóa để xem bản demo dùng bộ lập lịch quy tắc, nhưng lần trình diễn yêu cầu “tích hợp LLM thật” phải dùng khóa hợp lệ và kiểm tra `engine: LLM`. `RULE_BASED` luôn được ghi rõ.

## Danh mục địa điểm

Cập nhật 10/11/2026: danh mục khám phá có **80 điểm khu vực Đà Lạt với tọa độ có nguồn OpenStreetMap**, giữ 25 ID cũ và thêm 55 điểm. 15 hàng Đà Lạt chưa đủ nguồn vẫn giữ trong DB để bảo toàn liên kết nhưng rút khỏi khám phá; 40 điểm Vũng Tàu vẫn giữ nguyên và chưa vẽ marker mô phỏng. Giá vé/thời lượng chưa biết là null trong visitorInfo; giờ mở cửa chỉ có khi tags OSM ghi. Các trường số API cũ chỉ là giả định của bộ lập lịch. Xem [nguồn, phạm vi địa lý và giới hạn](TRAVEL-MAP.md).

Trước khi cho nhóm đi thật: đối chiếu trang chính thức của từng địa điểm, lưu nguồn/ngày xác minh, sửa tọa độ cổng vào, giờ nghỉ/đóng cửa và các phần ngoài trời của địa điểm hỗn hợp. Trong phạm vi hiện tại mỗi địa điểm có một khoảng mở cửa đơn giản; lịch mở cửa theo thứ/ngày lễ là mở rộng.

Thời gian di chuyển tính từ khoảng cách tọa độ và hệ số vận tốc là **ước tính của code**, không phải chỉ đường hoặc dữ liệu giao thông trực tiếp. Không dùng LLM để bịa thời gian đi đường, giá hoặc giờ mở cửa.
