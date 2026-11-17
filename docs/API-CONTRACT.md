# Hợp đồng tích hợp Đi Chung

Mọi route bắt đầu `/api`. JSON trả thẳng đối tượng/mảng, lỗi `{error: string, code?: string}`. IDs là string. Header `Authorization: Bearer <token>`. Ngày ISO `YYYY-MM-DD`, giờ lịch là ISO 8601 có múi giờ. Giá VND theo đầu người. Không bọc `{data: ...}`.

## Kiểu dữ liệu frontend/backend

```ts
type User = {id:string; name:string; email:string; avatarColor:string};
type City = {id:string; name:string; latitude:number; longitude:number; imageUrl:string};
type Place = {id:string; cityId:string; name:string; category:string; environment:'INDOOR'|'OUTDOOR'; latitude:number; longitude:number; priceVnd:number; durationMin:number; openHour:number; closeHour:number; imageUrl:string; description:string; dataQuality?:string};
type Group = {id:string; name:string; cityId:string; cityName:string; tripDate:string; startHour:number; endHour:number; budgetPerPersonVnd:number; inviteCode:string; currentPlanId:string|null; memberCount:number; role:'LEADER'|'MEMBER'; mode:'DEMO'|'LIVE'; revision:number};
type Member = User & {role:'LEADER'|'MEMBER'};
type PlanItem = {id:string; placeId:string; place:Place; position:number; startTime:string; endTime:string; travelMin:number; costVnd:number; reason:string; factIds:string[]};
type Plan = {id:string; groupId:string; version:number; basePlanId:string|null; kind:'INITIAL'|'RAIN_CHANGE'|'MANUAL_CHANGE'; status:'DRAFT'|'VOTING'|'APPROVED'|'REJECTED'|'EXPIRED'|'STALE'; engine:'LLM'|'RULE_BASED'; demo:boolean; summary:string; items:PlanItem[]; totalCostVnd:number; yesVotes:number; noVotes:number; eligibleCount:number; requiredYesVotes:number; myVote:'YES'|'NO'|null; deadline:string; createdAt:string};
type Comment = {id:string; groupId:string; userId:string; userName:string; avatarColor:string; placeId:string|null; planId:string|null; content:string; createdAt:string; editedAt:string|null};
type ProviderStatus = {provider:string; status:'OK'|'MISSING'|'ERROR'|'STALE'; fetchedAt:string|null; message:string};
type WeatherSlot = {time:string; rainMmH:number|null; probabilityPct:number|null; level:'NONE'|'LIGHT'|'MODERATE'|'HEAVY'|'UNKNOWN'; rainVotes:number; validSources:number; providers:{provider:string; rainMmH:number|null; probabilityPct:number|null; risk:boolean; usable:boolean}[]};
type WeatherSummary = {demo:boolean; fetchedAt:string; providers:ProviderStatus[]; slots:WeatherSlot[]; rainWindows:{start:string; end:string; rainVotes:number}[]; confidenceText:string};
type Alert = {id:string; groupId:string; message:string; demo:boolean; planId:string|null; createdAt:string; status:string};
type Notification = {id:string; groupId:string|null; title:string; message:string; type:string; readAt:string|null; createdAt:string; planId:string|null};
```

## Bổ sung Phase 2

`POST /api/ai/recommendations` là API độc lập, yêu cầu đăng nhập, giới hạn 6 lượt/người/phút. Nhận city/date/budget/start/duration/categories/environment/styles/preferred IDs và tùy chọn groupId; không tạo lịch hoặc ghi wishlist. Response ghi engine/model/fallback, các điểm có rank/facts/giải thích, thời tiết và phương án trong nhà ngoài bộ lọc có nhãn riêng. Body đầy đủ, enum và lỗi được ghi tại [Phase 2, mục API](PHASE-2-AI.md#3-api-mới-và-sửa-đổi).

Plan thêm `tripContext,totalDurationMin,totalTravelMin,unknownCostCount,route`; route là STRAIGHT_LINE, chưa phải đường lái xe. WeatherSlot thêm `temperatureC:number|null,windKmh:number|null`.

## Routes

Place API bổ sung `geographyVerified`, `sourceUrl`, `coordinateKind`, `sourceTimestamp`, `visitorInfo` (vé/giờ/thời lượng có nguồn hoặc null) và `planningAssumptions` (`verified: false`). Các trường số cũ giữ tương thích bộ lập lịch, không phải dữ kiện du lịch đã xác minh. Seed mới trả 80 điểm khu vực Đà Lạt, 40 điểm Vũng Tàu; 15 hàng Đà Lạt cũ chưa đủ nguồn vẫn giữ trong DB và truy cập được qua ID nhưng rút khỏi khám phá. Xem [bản đồ và dữ liệu](TRAVEL-MAP.md).

- `GET /health` -> `{status, database, llmConfigured, demoEnabled}`
- `POST /auth/demo` body `{persona?: 'leader'|'member'|'third'}` -> `{token,user}` (chỉ khi ALLOW_DEMO=true).
- `POST /auth/login` `{email,password}` -> `{token,user}`; `POST /auth/register` `{name,email,password}` -> `{token,user}`.
- `GET /auth/me` -> User; `PATCH /auth/me` `{name,avatarColor?}` -> User.
- `GET /cities` -> City[]; `GET /places?cityId=&q=&environment=&category=` -> Place[]; `GET /places/:id` -> Place.
- `GET /groups` -> Group[]; `POST /groups` `{name,cityId,tripDate,startHour,endHour,budgetPerPersonVnd,mode?:'DEMO'|'LIVE'}` -> Group.
- `POST /groups/join` `{code}` -> Group; `GET /groups/:id` -> `{group,members,wishlist:Place[],plans:Plan[],currentPlan:Plan|null}`.
- `PATCH /groups/:id` `{name?,budgetPerPersonVnd?,mode?,tripDate?,startHour?,endHour?,expectedRevision?}` -> Group (leader; kiểm tra khung giờ kết hợp, stale đề xuất khi ràng buộc đổi, giữ lịch chính thức; activity event).
- `GET /groups/:id/preferences` -> `{categories:string[],environmentPreference:'ANY'|'INDOOR'|'OUTDOOR',travelStyles:string[]}`; `PATCH /groups/:id/preferences` nhận categories và hai trường mới tùy chọn, merge JSONB (thành viên chỉ sửa sở thích của mình).
- `GET /groups/:id/wishlist` -> Place[]; `POST /groups/:id/wishlist` `{placeId}` -> Place[]; `DELETE /groups/:id/wishlist/:placeId` -> Place[].
- `GET /groups/:id/plans` -> Plan[]; `GET /plans/:id` -> Plan.
- `POST /groups/:id/plans/generate` `{mode:'demo'|'live',task?:'INITIAL'|'RAIN_CHANGE',placeIds?:string[]}` -> Plan. placeIds có 1–20 ID duy nhất, cùng thành phố và có tọa độ nguồn; bỏ trường này dùng wishlist như trước. Lịch được mở VOTING, chốt danh sách cử tri; chỉ leader tạo. Rule fallback được ghi engine RULE_BASED, không giả là LLM.
- `POST /plans/:id/votes` `{choice:'YES'|'NO'}` -> Plan. Chỉ áp dụng khi đủ quá nửa cử tri snapshot; kiểm tra basePlanId trong transaction.
- `GET /groups/:id/comments?placeId=...` hoặc `?planId=...` -> Comment[]. `POST /groups/:id/comments` `{placeId?,planId?,content}` -> Comment. Đúng một đích.
- `PATCH /comments/:id` `{content}` -> Comment; `DELETE /comments/:id` -> `{ok:true}` (tác giả).
- `GET /groups/:id/weather?mode=demo|live` -> WeatherSummary; `POST /groups/:id/weather/check` `{mode}` -> `{weather,alert:Alert|null,proposal:Plan|null}`.
- `POST /groups/:id/demo/rain` -> `{weather,alert,proposal}`; leader only, group mode DEMO, không tự đổi currentPlanId.
- `POST /groups/:id/rain-reports` `{latitude,longitude,accuracyM,condition:'RAIN'|'DRY',observedAt?}` -> `{id,verified:boolean,message}`.
- `GET /groups/:id/alerts` -> Alert[].
- `GET /groups/:id/verification` -> `{verified:number,correct:number,incorrect:number,unknown:number,accuracyPct:number|null,note:string}`.
- `GET /notifications` -> Notification[]; `PATCH /notifications/:id/read` -> Notification.
- `GET /groups/:id/activity` -> `{id,action,message,createdAt}[]`.
- `GET /radar` -> `{host,frames:{time:number,path:string}[],maxZoom:7,attribution:string,coverageUrl:string}`; client render attribution and no-coverage state.

## Socket.io

Handshake `auth:{token}`. Client emits `group:join` `{groupId}` with ack `{ok,error?}`; `group:leave` `{groupId}`. Server validates membership. Client `comment:typing` `{groupId,placeId?,planId?,typing:boolean}`; server broadcasts it with userId/userName after validating target. Server `group:updated`, `wishlist:updated`, `comment:created`, `comment:updated`, `comment:deleted`, `plan:created`, `plan:updated`, `plan:applied`, `weather:updated`, `alert:created`, `notification:created`, `activity:created`. Payload always includes groupId (notification may be personal). On reconnect fetch current group state through REST; never assume every event delivered.

## Seed / tích hợp

App tên **Đi Chung**. Hai thành phố lập lịch `dalat`, `vungtau`. Khám phá có 80 điểm khu vực Đà Lạt có nguồn OSM và giữ 40 điểm Vũng Tàu cũ; dữ kiện du lịch chưa biết tách khỏi các giả định của bộ lập lịch. Seed demo group cùng 3 người, 8 wishlist places, 1 lịch APPROVED và currentPlanId trỏ lịch đó. `/auth/demo` personas tương ứng 3 cử tri để demo đa số thật. Không tự tạo phiếu đồng ý thay user. Mọi màn demo có nhãn. Backend port4000, Expo web8081. Khởi động không cần khóa API (rule planner có nhãn); live mode chỉ dùng API thật, thiếu khóa không lấp bằng dữ liệu giả. OpenAI Responses `text.format` JSON schema strict, timeout/retry hữu hạn, kiểm tra fact IDs + lý do không chứa số không được chứng minh. Secrets server only.
