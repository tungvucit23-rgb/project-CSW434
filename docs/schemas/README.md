# Schema và ví dụ cho bộ lập lịch

- [planner-input.schema.json](planner-input.schema.json): hình dạng JSON do `buildInput` tạo cho INITIAL và RAIN_CHANGE. Input có `allOf/if/then` phục vụ tài liệu/validation thông thường; **không gửi schema input này vào Structured Outputs**.
- [planner-output.schema.json](planner-output.schema.json): hình dạng kết quả, phản ánh cả giới hạn Zod cuối như độ dài lý do và số fact refs. Schema gửi LLM trong `planner.ts` có cùng trường nhưng ít giới hạn độ dài hơn; không mặc định mọi từ khóa JSON Schema đều được nhà cung cấp hỗ trợ.
- [initial.input.example.json](initial.input.example.json) và [initial.output.example.json](initial.output.example.json): tạo lịch ban đầu.
- [rain-change.input.example.json](rain-change.input.example.json) và [rain-change.output.example.json](rain-change.output.example.json): giữ điểm đã bắt đầu, đổi phần sắp đi sang trong nhà; output **chỉ có phần mới**, backend ghép prefix cố định.

Các ID `demo_*`, giá, thời gian và mưa trong ví dụ là **giả lập trong tài liệu**, không phải seed địa điểm hoặc số liệu dự báo thật. Code chỉ chấp nhận ID được load từ database vào `allowedPlaces` của yêu cầu thực.

`preferences` hiện dùng `{categories?: string[]}`; không có sở thích thì `{}` hoặc mảng rỗng. Thành viên chọn category trong AISetup; `GET/PATCH /groups/:id/preferences` chỉ đọc/sửa sở thích của chính người đang đăng nhập. Wishlist là danh sách mong muốn chung. `trigger` là `null` hoặc `{placeId,weatherFactId,minutesAhead}` do code tạo.

`weatherReasonPolicy` chứa nguyên văn bốn câu mẫu của code: RAIN_INDOOR, UNKNOWN, NO_CONSENSUS và NEUTRAL. Câu nói về thời tiết trong reason phải chọn đúng mẫu theo facts của khoảng tham quan; summary không được nhận xét thời tiết. Các câu có fact ID tồn tại nhưng khẳng định mưa trái dữ liệu vẫn bị loại.

Schema chỉ kiểm hình dạng. Code phải kiểm thêm:

1. ID địa điểm thuộc whitelist, không trùng và không lặp prefix.
2. Fact ID tồn tại, thuộc địa điểm đang chọn; weather fact phải thuộc khoảng tham quan. Reason thời tiết phải khớp nguyên văn mẫu và điều kiện của mẫu.
3. Giờ mở cửa, đúng thời lượng, đủ di chuyển, không vượt giờ chuyến/ngân sách.
4. Số hiển thị lấy từ database/facts; summary/reason không tự đưa con số hoặc cam kết chắc chắn. Summary không nhận xét thời tiết.
5. Với đổi lịch, prefix bất biến và phần mới bắt đầu sau prefix/thời điểm lập lại.

Các JSONSchema này là tài liệu kiểm tra được, không tự động thay thế validator thực thi trong [planner.ts](../../apps/server/src/planner.ts). Khi sửa input/output của planner cần cập nhật đồng thời schema, ví dụ và tài liệu.
