# Screen inventory

40 navigable routes (35 reused/improved; 5 added). Recommendation setup and results share the existing studio modal; itinerary comparison reuses version history and proposal screens. These are functional frontend routes, not 40 separate new component files.

All routes use the same adapter. In API mode, server-dependent actions require the documented services. Password recovery/change are new contract proposals and are not implemented by the existing backend. Radar has a deliberate empty observation state in mock mode; native map rendering needs a restricted Maps key.

| Route | Purpose | Phase 3 status | Data / endpoints | Realtime dependencies |
|---|---|---|---|---|
| login (public) | Chào bạn, người đồng hành! | Reused / improved; functional mock | POST /auth/login; POST /auth/demo | No dedicated subscription |
| register (public) | Bắt đầu hành trình | Reused / improved; functional mock | POST /auth/register | No dedicated subscription |
| forgotPassword (public) | Tìm lại tài khoản của bạn | Added; functional mock; API endpoint pending | POST /auth/forgot-password | No dedicated subscription |
| changePassword | Đổi mật khẩu | Added; functional mock; API endpoint pending | POST /auth/change-password | No dedicated subscription |
| groupPreferences | Sở thích của nhóm | Added; functional mock | GET /groups/:id/preferences; PATCH /groups/:id/preferences | group:updated, activity:created |
| alerts | Cảnh báo thời tiết | Added; functional mock | GET /groups/:id/alerts | alert:created |
| notificationDetail | Chi tiết thông báo | Added; functional mock | GET /notifications; PATCH /notifications/:id/read | notification:created |
| home | Một chuyến đi, nhiều niềm vui. | Reused / improved; functional mock | GET /auth/me; GET /cities; GET /groups; GET /groups/:id/weather?mode=demo\|live; GET /notifications | group:updated, weather:updated, notification:created |
| groups | Những chuyến đi của bạn | Reused / improved; functional mock | GET /groups | group:updated |
| createGroup | Tạo chuyến đi mới | Reused / improved; functional mock | GET /cities; POST /groups | group:updated, activity:created |
| joinGroup | Tham gia chuyến đi | Reused / improved; functional mock | POST /groups/join | group:updated, activity:created |
| dashboard | Chuyến đi của chúng mình | Reused / improved; functional mock | GET /groups/:id; POST /groups/:id/demo/rain | group:updated, wishlist:updated, plan:updated, plan:applied, weather:updated, alert:created, plan:created, notification:created |
| members | Những người đồng hành | Reused / improved; functional mock | GET /groups/:id | group:updated, wishlist:updated, plan:updated, plan:applied |
| invite | Rủ nhau đi thôi | Reused / improved; functional mock | GET /groups/:id | group:updated, wishlist:updated, plan:updated, plan:applied |
| discover | Đi đâu cũng có điều hay | Reused / improved; functional mock | GET /cities; GET /places?cityId=dalat&q=&environment=&category=; POST /groups/:id/wishlist | wishlist:updated, activity:created |
| map | Khám phá trên bản đồ | Reused / improved; functional mock | GET /cities; GET /places?cityId=dalat&q=&environment=&category=; GET /places/:id; GET /groups/:id/wishlist; POST /groups/:id/wishlist; POST /ai/recommendations; GET /groups/:id/weather?mode=demo\|live; GET /radar | wishlist:updated, activity:created, weather:updated |
| recommendations | Gợi ý chuyến đi phù hợp | Reused / improved; functional mock | GET /cities; GET /places?cityId=dalat&q=&environment=&category=; POST /groups/:id/wishlist; POST /ai/recommendations | wishlist:updated, activity:created |
| itineraryMap | Lịch trình trên bản đồ | Reused / improved; functional mock | POST /groups/:id/plans/generate; GET /plans/:id; GET /groups/:id/weather?mode=demo\|live | plan:created, notification:created, activity:created, plan:updated, plan:applied, weather:updated |
| filters | Tìm điểm đến phù hợp | Reused / improved; functional mock | GET /places?cityId=dalat&q=&environment=&category= | No dedicated subscription |
| placeDetail | Một điểm dừng đáng nhớ | Reused / improved; functional mock | GET /places/:id; POST /groups/:id/wishlist; GET /groups/:id/comments?placeId=:placeId; POST /groups/:id/comments; PATCH /comments/:id; DELETE /comments/:id | wishlist:updated, activity:created, comment:created, comment:updated, comment:deleted |
| wishlist | Danh sách muốn đi | Reused / improved; functional mock | GET /groups/:id; GET /groups/:id/wishlist; DELETE /groups/:id/wishlist/:placeId | group:updated, wishlist:updated, plan:updated, plan:applied, activity:created |
| timeline | Lịch trình chung | Reused / improved; functional mock | GET /groups/:id | group:updated, wishlist:updated, plan:updated, plan:applied |
| planItem | Chi tiết điểm dừng | Reused / improved; functional mock | GET /places/:id; GET /groups/:id/comments?placeId=:placeId | comment:created, comment:updated, comment:deleted |
| proposal | Phương án cho cả nhóm | Reused / improved; functional mock | GET /groups/:id/plans; GET /plans/:id; GET /groups/:id/comments?placeId=:placeId; POST /groups/:id/comments; PATCH /comments/:id; DELETE /comments/:id | plan:created, plan:updated, plan:applied, comment:created, comment:updated, comment:deleted, activity:created |
| vote | Cùng nhau quyết định | Reused / improved; functional mock | GET /plans/:id; POST /plans/:id/votes; GET /groups/:id/comments?placeId=:placeId; POST /groups/:id/comments; PATCH /comments/:id; DELETE /comments/:id | plan:updated, plan:applied, notification:created, activity:created, comment:created, comment:updated, comment:deleted |
| history | Các phiên bản lịch trình | Reused / improved; functional mock | GET /groups/:id; GET /groups/:id/plans | group:updated, wishlist:updated, plan:updated, plan:applied, plan:created |
| weather | Đi theo nhịp thời tiết | Reused / improved; functional mock | GET /groups/:id/weather?mode=demo\|live; POST /groups/:id/weather/check; POST /groups/:id/demo/rain; GET /groups/:id/alerts | weather:updated, alert:created, plan:created, notification:created |
| hourly | Thời tiết từng giờ | Reused / improved; functional mock | GET /groups/:id/weather?mode=demo\|live | weather:updated |
| providers | Dữ liệu đến từ đâu? | Reused / improved; functional mock | GET /groups/:id/weather?mode=demo\|live | weather:updated |
| radar | Theo dõi những cơn mưa | Reused / improved; functional mock | GET /radar | No dedicated subscription |
| rainReport | Thời tiết ở chỗ bạn | Reused / improved; functional mock | POST /groups/:id/rain-reports | activity:created |
| verification | Kiểm chứng dự báo | Reused / improved; functional mock | GET /groups/:id/verification | No dedicated subscription |
| notifications | Có tin mới cho bạn | Reused / improved; functional mock | GET /notifications; PATCH /notifications/:id/read | notification:created |
| budget | Ngân sách chuyến đi | Reused / improved; functional mock | GET /groups/:id; PATCH /groups/:id | group:updated, wishlist:updated, plan:updated, plan:applied, activity:created |
| activity | Nhật ký nhóm | Reused / improved; functional mock | GET /groups/:id/activity | activity:created |
| aiSetup | Trợ lý lập lịch | Reused / improved; functional mock | GET /places?cityId=dalat&q=&environment=&category=; GET /groups/:id; PATCH /groups/:id; GET /groups/:id/preferences; PATCH /groups/:id/preferences; GET /groups/:id/wishlist; POST /groups/:id/plans/generate | group:updated, wishlist:updated, plan:updated, plan:applied, activity:created, plan:created, notification:created |
| profile | Góc của bạn | Reused / improved; functional mock | GET /auth/me | No dedicated subscription |
| editProfile | Chỉnh sửa hồ sơ | Reused / improved; functional mock | PATCH /auth/me | No dedicated subscription |
| settings | Cài đặt ứng dụng | Reused / improved; functional mock | GET /health; POST /auth/demo | No dedicated subscription |
| help | Đi Chung cùng bạn | Reused / improved; functional mock | Static frontend guidance | No dedicated subscription |

Every route is covered by the browser route sweep, with direct interaction assertions for the main journey. Group-dependent routes show loading, retry, or create/join guidance if no group is selected. Deep-linking an invalid ID shows a useful empty/error state.
