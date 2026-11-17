# Kế hoạch triển khai năm bước

Đi theo thứ tự bên dưới. Mỗi bước có một bản chạy được và tiêu chí nghiệm thu; không để toàn bộ sản phẩm phụ thuộc bước cảnh báo nền cuối cùng.

| Bước | Việc cần hoàn thành | Điều kiện được chuyển bước |
| --- | --- | --- |
| **1. Giao diện, dữ liệu giả** | App React Native/Expo, điều hướng tối thiểu 25 màn; hai thành phố, danh mục địa điểm, wishlist, lịch ngày, dự báo và radar; trạng thái loading/rỗng/lỗi. | Đi hết luồng bằng dữ liệu mẫu, mọi dữ liệu mô phỏng có nhãn DEMO; ứng dụng không cần khóa API để mở. |
| **2. Nhóm và bình luận realtime** | Đăng ký/đăng nhập; tạo nhóm, mã mời, leader/member; bình luận theo địa điểm/đề xuất; Socket room xác thực thành viên, typing; REST tải lại khi reconnect. | Hai tài khoản khác nhau thấy cùng thay đổi; người ngoài nhóm không đọc/ghi được; tác giả mới sửa/xóa bình luận. |
| **3. Lịch chung và biểu quyết** | Phiên bản lịch, lịch hiện hành, snapshot cử tri, YES/NO, kiểm tra đa số trong transaction; lịch sử hoạt động và thông báo sửa sau. | Ba người: một YES chưa đổi lịch, hai YES mới áp dụng; gửi phiếu trùng không tăng tổng; đề xuất dựa trên lịch cũ không ghi đè lịch mới. |
| **4. Thời tiết và LLM — mốc sản phẩm hoàn chỉnh** | Adapter ba nguồn, cache, trạng thái thiếu dữ liệu; chuẩn hóa dự báo và facts bằng code; gọi LLM thật qua backend; JSON schema và kiểm tra ràng buộc; fallback có nhãn; radar tham khảo. | Tạo lịch từ wishlist, mở vote, áp dụng lịch và bình luận xuyên suốt. Với khóa hợp lệ phải quan sát được `engine: LLM`; không lấy fallback làm bằng chứng đã chạy LLM. Ngắt một nguồn không phát sinh số liệu giả. |
| **5. Cảnh báo mưa** | Worker kiểm tra định kỳ, cảnh báo điểm ngoài trời sắp tới; tạo đề xuất đổi phần chưa đi; vote lại; báo mưa/khô tại chỗ, đối chiếu dự đoán mốc +30 phút sau khi cửa sổ bằng chứng đóng và chờ thêm 5 phút nhận báo cáo; chống cảnh báo lặp; demo mưa. | Mưa mô phỏng tạo cảnh báo/đề xuất có nhãn nhưng chưa đổi lịch; chỉ đủ đa số mới áp dụng. Dữ liệu demo không vào tỷ lệ dự báo thật. |

## Nếu hết thời gian ở bước 4

Bản nộp vẫn có nhóm realtime, ít nhất 25 màn, danh mục 80 địa điểm mẫu, wishlist chung, tạo lịch có LLM, lý do có căn cứ, biểu quyết, lịch sử phiên bản, dashboard dự báo và radar. Thời tiết cập nhật khi mở màn hoặc bấm làm mới; chưa tự động cảnh báo theo thời gian nền thì ghi rõ giới hạn đó trong báo cáo.

Đóng gói bản này cùng tài liệu, seed, cách khởi động và kịch bản demo. Chức năng cảnh báo chưa xong phải được ẩn hoặc ghi “chưa triển khai”; không để nút tác vụ chính treo giữa chừng. Các màn danh sách cảnh báo/thông báo có thể ở trạng thái rỗng có giải thích.

## Việc để sau

- Ghim địa điểm tự do, dữ liệu giờ mở cửa theo lịch tuần/ngày lễ, chỉ đường có giao thông.
- Ngoại suy chuyển động radar; không gọi ảnh radar quá khứ là dự báo tương lai.
- Push notification thật khi app đóng, worker nhiều tiến trình và hàng đợi bền vững nếu chưa có trong bản nộp.
- Trạng thái đã xem bình luận và hồ sơ sở thích nâng cao; bản mẫu chỉ chọn category trong AISetup. Typing không thay thế read receipt.

## Kiểm thử cần ưu tiên

Kiểm tra quyền nhóm; đa số và phiếu trùng; hai đề xuất đồng thời; chặn plan/place/fact ID lạ; lịch quá giờ/đóng cửa/vượt ngân sách; thiếu nguồn và nguồn bất đồng; không trộn DEMO/LIVE; mất Socket rồi nối lại. Chỉ mở rộng kiểm thử khi sửa lỗi hoặc có rủi ro mới; ưu tiên một lượt demo ba tài khoản hoàn chỉnh hơn các kiểm tra chỉ phản chiếu giao diện.
