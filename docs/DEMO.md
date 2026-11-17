# Kịch bản trình diễn Đi Chung

Khởi động theo [README](../README.md). API mặc định tại `http://localhost:4000/api`, Expo web tại `http://localhost:8081`. Địa chỉ chạy thực tế theo README nếu cổng được thay đổi.

## Chuẩn bị

- Dùng **ba phiên đăng nhập độc lập**: ba trình duyệt/profile hoặc ba thiết bị; các tab cùng profile thường dùng chung phiên. Chọn ba vai demo `leader`, `member`, `third`, tương ứng ba người thật trong nhóm seed.
- Seed có một nhóm DEMO, 8 điểm wishlist và một lịch hiện hành đã được duyệt để trình diễn đổi lịch ngay. Lịch seed là trạng thái chuẩn bị mẫu, không phải bằng chứng đã có ba phiếu do người dùng bấm.
- Bật `ALLOW_DEMO` theo cấu hình README. Không dùng endpoint đăng nhập demo khi triển khai cho người dùng thật.
- Kiểm tra nhãn DEMO và nguồn bộ lập lịch. Khi chưa có khóa LLM, `RULE_BASED` là kết quả quy tắc để thử sản phẩm; phải có một lượt `LLM` thật riêng để chứng minh tích hợp AI.

## 1. Nhóm và bình luận đồng bộ

| Phiên | Thao tác | Kết quả cần quan sát |
| --- | --- | --- |
| Leader | Mở nhóm, thành viên và mã mời. | Có ba thành viên, vai trò rõ ràng. |
| Member | Thêm một địa điểm cùng thành phố vào wishlist. | Leader thấy danh sách đổi qua Socket. |
| Leader | Mở chi tiết địa điểm và gửi bình luận. | Member thấy bình luận đúng địa điểm; không có phòng chat riêng. |
| Member | Gõ bình luận, sau đó gửi. | Typing chỉ xuất hiện ở luồng bình luận tương ứng; tin được lưu qua REST. |
| Third | Mất mạng/ngắt kết nối rồi vào lại nhóm. | App tải snapshot REST, không mất thay đổi đã lưu. |

Nếu trình bày tạo nhóm từ đầu, leader tạo nhóm rồi hai người nhập cùng mã mời; dùng ngày trong chân trời dự báo miễn phí khi chạy LIVE. Không cần tạo nhóm mới cho lượt minh họa đổi lịch bằng seed.

## 2. Tạo lịch và đa số thật

1. Mỗi người có thể vào Trợ lý lập lịch (AISetup), chọn category yêu thích và lưu sở thích của mình; leader tạo đề xuất lịch từ wishlist. Kết quả có giờ, giá, lý do, nguồn `LLM` hoặc `RULE_BASED` và trạng thái đang biểu quyết.
2. Leader bấm **Đồng ý**. Với ba cử tri, một YES chưa đổi lịch hiện hành.
3. Member bấm **Từ chối**. Một YES, một NO vẫn chưa đủ đa số.
4. Third bấm **Đồng ý**. Hai YES trên ba cử tri: lịch mới được áp dụng và cả ba phiên nhận cập nhật.
5. Tải lại app: lịch hiện hành vẫn là lịch vừa áp dụng; kiểm tra lịch sử phiên bản và thông báo.

Đừng bấm YES thay tất cả người dùng trong cùng một phiên rồi mô tả đó là vote realtime. Không tự tạo phiếu đồng ý ở backend. Danh sách cử tri được chốt khi mở đề xuất; người vào nhóm muộn không tự tăng mẫu số của đề xuất đó.

## 3. Giả lập mưa và đổi lịch

1. Leader mở bảng điều khiển demo và bật mưa mô phỏng. Tác vụ tương ứng `POST /groups/:id/demo/rain`, chỉ dành cho trưởng nhóm của nhóm DEMO.
2. Quan sát dashboard: dữ liệu ghi rõ mô phỏng; cửa sổ mưa và số nguồn đồng thuận được code tính. Câu chữ là “có khả năng”, không khẳng định chắc chắn.
3. Cảnh báo dẫn đến đề xuất `RAIN_CHANGE`, có phương án ưu tiên trong nhà. Lịch hiện hành **chưa đổi** chỉ vì AI trả lời.
4. Lặp quy trình ba phiếu ở mục 2. Hai YES mới áp dụng; nếu không đủ hoặc hết hạn, giữ lịch hiện hành.
5. So sánh lịch trước/sau, bình luận gắn với đề xuất và lịch sử hoạt động. Phần lịch đã đi không được dịch chuyển để giải quyết mưa tương lai.

Nếu worker không đang hoạt động, có thể bấm kiểm tra thời tiết để kích hoạt cùng luồng; nói rõ đây là kiểm tra thủ công. Không gọi kiểm tra thủ công là đã chứng minh chạy nền khi app tắt.

## 4. Chứng minh LLM thật

1. Đặt khóa và model hợp lệ **ở server** theo README; không đưa khóa vào app, ảnh chụp hoặc repository.
2. Tạo lại lịch; kiểm tra phản hồi plan là `engine: LLM`. `llmConfigured: true` ở health chỉ chứng minh có cấu hình, chưa chứng minh cuộc gọi thành công.
3. Mở lý do từng điểm và facts liên quan; kiểm tra địa điểm đều có trong database, tổng giá và thời gian khớp phép tính backend. Reason nói về thời tiết phải thuộc `weatherReasonPolicy` và khớp fact; summary không nhận xét thời tiết.
4. Tắt khóa hoặc gây timeout: sản phẩm vẫn báo lỗi có ích hoặc dùng `RULE_BASED` có nhãn. Không âm thầm dán nhãn AI cho lịch quy tắc.

Dùng thời tiết DEMO cùng LLM thật là một cách trình diễn có thể lặp lại: phải giữ nhãn mô phỏng thời tiết và nhãn nguồn bộ lập lịch riêng biệt.

## 5. Nguồn dự báo, báo mưa và radar

- Ở LIVE, kiểm tra ba trạng thái nguồn. Khi thiếu một khóa, UI phải hiện thiếu nguồn; hai nguồn còn dữ liệu phải cùng báo mưa mới đạt ngưỡng hai nguồn. Một nguồn báo mưa, một nguồn báo khô, một nguồn thiếu không đủ điều kiện cảnh báo đồng thuận.
- Gửi báo cáo RAIN/DRY tại chỗ bằng vị trí được cấp quyền; quan sát kết quả xác nhận. Nếu chỉ có một báo cáo xa điểm đến thì chưa được coi là thực tế đã xác nhận. Không sử dụng tọa độ giả của demo để công bố độ chính xác thực tế.
- Trang thống kê ban đầu có thể chưa có mẫu đủ điều kiện. Dự đoán lấy mốc sau 30 phút, cửa sổ bằng chứng ±5 phút; chỉ hoàn tất sau khi cửa sổ đóng và chờ thêm 5 phút nhận báo cáo, tức không sớm hơn khoảng 40 phút từ lần kiểm tra. Thiếu/mâu thuẫn bằng chứng vẫn chốt `unknown` với `verified_at`. Không cố tạo tỷ lệ 100% bằng cách tự coi dự báo lần sau là sự thật.
- Mở radar: xem thời điểm frame, ghi công và vùng không có dữ liệu. Đây là radar quá khứ; không trình diễn như radar tương lai. Nếu public API không phủ vị trí đang xem, báo đúng giới hạn và dùng liên kết tham khảo website.

## Chốt buổi trình diễn

Nêu ba giới hạn: giờ/giá seed chưa xác minh, thời gian di chuyển là ước tính và dự báo mưa mang tính xác suất. Chỉ báo cáo chức năng đã quan sát được; push khi app đóng và tự ngoại suy radar không được mặc nhiên coi là đã có.
