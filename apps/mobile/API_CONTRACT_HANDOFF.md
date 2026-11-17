# API contract handoff

Base URL: EXPO_PUBLIC_API_URL; client appends /api. Existing names/payloads are preserved from ../../docs/API-CONTRACT.md and the current API implementation, inspected read-only. 40 operations are specified below; only the two password operations are new proposals. No backend or database code was changed.

Public routes have no Bearer header. All other routes use Authorization: Bearer <session-token>. Group reads require membership; mutations additionally require leader/author checks as indicated. The server is authoritative for every permission, electorate, revision, vote, approval and verified weather fact. Client role checks are presentation only.

Successful responses are bare JSON domain values, not an added {data:...} envelope. Existing errors are {error:string}; optional code:string is supported by the client. The status lists below describe required error behavior, not a claim that the old backend implements every named code. Shared errors: 400 VALIDATION, 401 SESSION_EXPIRED / INVALID_CREDENTIALS, 403 FORBIDDEN, 404 NOT_FOUND, 409 REVISION_CONFLICT / PLAN_CLOSED, 429 RATE_LIMITED, 500 INTERNAL, 501 NOT_IMPLEMENTED (new integrations), 502 INVALID_UPSTREAM, 503 UNAVAILABLE. Transport failures expose NETWORK, TIMEOUT, INVALID_RESPONSE and CANCELLED locally. Example error: {"error":"Group membership required","code":"FORBIDDEN"}. Do not convert failures into successful demo responses.

Examples below are explicit fixture/shape examples; some list arrays are abbreviated for readability, so aggregate counts remain illustrative. Full populated recommendation and group/plan examples are in docs/examples. Unknown amounts stay null; an assumed cost of 0 is never a verified free admission.

Engine stays LLM or RULE_BASED under the existing contract. DEMO is a separate demo:true provenance flag, not a replacement engine. In local mock mode fallbackReason is MOCK_FIXTURE, with visible simulation labels. API mode renders actual backend provenance; no client LLM calls.

## Existing aggregate interfaces

Members, the approved itinerary and version history are already returned by GET /groups/:id (members, currentPlan, plans); no duplicate /members or /approved endpoint is invented. Hourly forecasts and provider status are slots and providers in GET /groups/:id/weather. The preferences endpoint is each caller's own preferences; do not expose a fabricated group-wide profile. The backend aggregates members' preferences for recommendations/planning.

## Realtime

Current integration: Socket.io handshake auth:{token}; emit group:join {groupId} and wait for {ok:boolean,error?:string}; group:leave on cleanup. Events listed per endpoint invalidate REST state. Personal notifications are filtered to the authenticated user. On every reconnect, rejoin the authorized room and refetch authoritative REST state. Events must include groupId except personal notifications. comment:typing carries one target and typing:boolean and is ephemeral, with 4-second expiry. Remove handlers and disconnect on group change/logout/unmount. No mock multi-device synchronization is claimed.

## Endpoint details

### GET /health

- Status: **Existing agreed interface**
- Authorization: public. 
- Request type: `none`
- Response type: `{status:string;database:string;llmConfigured:boolean;demoEnabled:boolean}`
- Errors: 500, 503 (shared meanings above).
- Related routes: settings
- Mock fixture: MockDataAdapter /health
- Realtime: No required event; caller updates/refetches response state.

Request example: no JSON body (path/query as shown).

Response example:

```json
{
  "status": "LOCAL_MOCK",
  "database": "in-memory",
  "llmConfigured": false,
  "demoEnabled": true
}
```

### POST /auth/register

- Status: **Existing agreed interface**
- Authorization: public. 
- Request type: `AuthInput & {name:string}`
- Response type: `AuthResult`
- Errors: 400, 409, 429, 500 (shared meanings above).
- Related routes: register
- Mock fixture: state.users
- Realtime: No required event; caller updates/refetches response state.

Request example:

```json
{
  "name": "Traveler",
  "email": "traveler@example.test",
  "password": "ExampleOnly123!"
}
```

Response example:

```json
{
  "token": "<session-token>",
  "user": {
    "id": "mock-leader",
    "name": "Minh Anh",
    "email": "leader@dichung.demo",
    "avatarColor": "#18735C"
  }
}
```

### POST /auth/login

- Status: **Existing agreed interface**
- Authorization: public. 
- Request type: `AuthInput`
- Response type: `AuthResult`
- Errors: 400, 401, 429, 500 (shared meanings above).
- Related routes: login
- Mock fixture: demoUsers / state.passwords
- Realtime: No required event; caller updates/refetches response state.

Request example:

```json
{
  "email": "leader@dichung.demo",
  "password": "Demo1234!"
}
```

Response example:

```json
{
  "token": "<session-token>",
  "user": {
    "id": "mock-leader",
    "name": "Minh Anh",
    "email": "leader@dichung.demo",
    "avatarColor": "#18735C"
  }
}
```

### POST /auth/demo

- Status: **Existing agreed interface**
- Authorization: public. 
- Request type: `{persona?:'leader'|'member'|'third'}`
- Response type: `AuthResult`
- Errors: 400, 403, 404, 429, 500 (shared meanings above).
- Related routes: login, settings
- Mock fixture: demoUsers
- Realtime: No required event; caller updates/refetches response state.

Request example:

```json
{
  "persona": "leader"
}
```

Response example:

```json
{
  "token": "mock:mock-leader",
  "user": {
    "id": "mock-leader",
    "name": "Minh Anh",
    "email": "leader@dichung.demo",
    "avatarColor": "#18735C"
  }
}
```

### GET /auth/me

- Status: **Existing agreed interface**
- Authorization: user. 
- Request type: `none`
- Response type: `User`
- Errors: 400, 401, 403, 404, 429, 500 (shared meanings above).
- Related routes: profile, home
- Mock fixture: state.users
- Realtime: No required event; caller updates/refetches response state.

Request example: no JSON body (path/query as shown).

Response example:

```json
{
  "id": "mock-leader",
  "name": "Minh Anh",
  "email": "leader@dichung.demo",
  "avatarColor": "#18735C"
}
```

### PATCH /auth/me

- Status: **Existing agreed interface**
- Authorization: user. 
- Request type: `{name:string;avatarColor?:string}`
- Response type: `User`
- Errors: 400, 401, 403, 404, 429, 500 (shared meanings above).
- Related routes: editProfile
- Mock fixture: state.users
- Realtime: No required event; caller updates/refetches response state.

Request example:

```json
{
  "name": "Minh Anh",
  "avatarColor": "#18735C"
}
```

Response example:

```json
{
  "id": "mock-leader",
  "name": "Minh Anh",
  "email": "leader@dichung.demo",
  "avatarColor": "#18735C"
}
```

### POST /auth/forgot-password

- Status: **PROPOSED — backend implementation required**
- Authorization: public. 
- Request type: `PasswordResetInput`
- Response type: `ActionResult`
- Errors: 400, 429, 501, 503 (shared meanings above).
- Related routes: forgotPassword
- Mock fixture: MockDataAdapter public action; sends no email
- Realtime: No required event; caller updates/refetches response state.

Request example:

```json
{
  "email": "traveler@example.test"
}
```

Response example:

```json
{
  "ok": true,
  "message": "If an account exists, recovery instructions will be sent."
}
```

### POST /auth/change-password

- Status: **PROPOSED — backend implementation required**
- Authorization: user. 
- Request type: `ChangePasswordInput`
- Response type: `ActionResult`
- Errors: 400, 401, 429, 501, 503 (shared meanings above).
- Related routes: changePassword
- Mock fixture: state.passwords (memory only)
- Realtime: No required event; caller updates/refetches response state.

Request example:

```json
{
  "currentPassword": "<current-password>",
  "newPassword": "<new-password>"
}
```

Response example:

```json
{
  "ok": true,
  "message": "Password changed. Sign in again."
}
```

### GET /cities

- Status: **Existing agreed interface**
- Authorization: user. 
- Request type: `none`
- Response type: `City[]`
- Errors: 400, 401, 403, 404, 429, 500 (shared meanings above).
- Related routes: home, discover, map, recommendations, createGroup
- Mock fixture: cities
- Realtime: No required event; caller updates/refetches response state.

Request example: no JSON body (path/query as shown).

Response example:

```json
[
  {
    "id": "dalat",
    "name": "Đà Lạt",
    "latitude": 11.9404,
    "longitude": 108.4583,
    "imageUrl": "https://images.unsplash.com/photo-1570366583862-f91883984fde?auto=format&fit=crop&w=960&q=80"
  },
  {
    "id": "vungtau",
    "name": "Vũng Tàu",
    "latitude": 10.346,
    "longitude": 107.0843,
    "imageUrl": "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=960&q=80"
  }
]
```

### GET /places?cityId=dalat&q=&environment=&category=

- Status: **Existing agreed interface**
- Authorization: user. 
- Request type: `query: {cityId?:string;q?:string;environment?:"INDOOR"|"OUTDOOR";category?:string}`
- Response type: `Place[]`
- Errors: 400, 401, 403, 404, 429, 500 (shared meanings above).
- Related routes: discover, filters, map, recommendations, aiSetup
- Mock fixture: places (80 OSM records)
- Realtime: No required event; caller updates/refetches response state.

Request example: no JSON body (path/query as shown).

Response example:

```json
[
  {
    "id": "dalat-01",
    "cityId": "dalat",
    "name": "Hồ Xuân Hương",
    "category": "Thiên nhiên",
    "environment": "OUTDOOR",
    "latitude": 11.9450109,
    "longitude": 108.445363,
    "sourceUrl": "https://www.openstreetmap.org/relation/2390139",
    "sourceId": "relation/2390139",
    "coordinateKind": "OSM_BOUNDING_BOX_CENTER",
    "sourceTimestamp": "2026-11-10T05:57:04Z",
    "description": "Hồ Xuân Hương — không gian mặt hồ và cảnh quan. Marker đặt tại tâm hình học đối tượng, chưa xác minh cổng vào. Kiểm tra thông tin tiếp cận và hoạt động trước khi đến.",
    "visitorInfo": {
      "entranceFeeVnd": null,
      "openingHours": null,
      "visitDurationMin": null,
      "environmentEstimated": true,
      "verifiedAt": null
    },
    "geographyVerified": true,
    "dataQuality": "OSM_SOURCE_WITH_UNKNOWN_VISITOR_INFO",
    "priceVnd": 0,
    "durationMin": 60,
    "openHour": 8,
    "closeHour": 20,
    "imageUrl": "https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=640&q=75"
  }
]
```

### GET /places/:id

- Status: **Existing agreed interface**
- Authorization: user. 
- Request type: `path id: string`
- Response type: `Place`
- Errors: 400, 401, 403, 404, 429, 500 (shared meanings above).
- Related routes: placeDetail, map, planItem
- Mock fixture: places[0]
- Realtime: No required event; caller updates/refetches response state.

Request example: no JSON body (path/query as shown).

Response example:

```json
{
  "id": "dalat-01",
  "cityId": "dalat",
  "name": "Hồ Xuân Hương",
  "category": "Thiên nhiên",
  "environment": "OUTDOOR",
  "latitude": 11.9450109,
  "longitude": 108.445363,
  "sourceUrl": "https://www.openstreetmap.org/relation/2390139",
  "sourceId": "relation/2390139",
  "coordinateKind": "OSM_BOUNDING_BOX_CENTER",
  "sourceTimestamp": "2026-11-10T05:57:04Z",
  "description": "Hồ Xuân Hương — không gian mặt hồ và cảnh quan. Marker đặt tại tâm hình học đối tượng, chưa xác minh cổng vào. Kiểm tra thông tin tiếp cận và hoạt động trước khi đến.",
  "visitorInfo": {
    "entranceFeeVnd": null,
    "openingHours": null,
    "visitDurationMin": null,
    "environmentEstimated": true,
    "verifiedAt": null
  },
  "geographyVerified": true,
  "dataQuality": "OSM_SOURCE_WITH_UNKNOWN_VISITOR_INFO",
  "priceVnd": 0,
  "durationMin": 60,
  "openHour": 8,
  "closeHour": 20,
  "imageUrl": "https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=640&q=75"
}
```

### GET /groups

- Status: **Existing agreed interface**
- Authorization: user. 
- Request type: `none`
- Response type: `Group[]`
- Errors: 400, 401, 403, 404, 429, 500 (shared meanings above).
- Related routes: home, groups
- Mock fixture: state.groups
- Realtime: group:updated

Request example: no JSON body (path/query as shown).

Response example:

```json
[
  {
    "id": "mock-dalat",
    "name": "Đà Lạt cùng những người bạn",
    "cityId": "dalat",
    "cityName": "Đà Lạt",
    "tripDate": "2026-11-11",
    "startHour": 8,
    "endHour": 20,
    "budgetPerPersonVnd": 500000,
    "inviteCode": "DICHUNG",
    "currentPlanId": "mock-approved",
    "memberCount": 3,
    "role": "LEADER",
    "mode": "DEMO",
    "revision": 1
  }
]
```

### POST /groups

- Status: **Existing agreed interface**
- Authorization: user. 
- Request type: `{name:string;cityId:string;tripDate:string;startHour:number;endHour:number;budgetPerPersonVnd:number;mode?:'DEMO'|'LIVE'}`
- Response type: `Group`
- Errors: 400, 401, 403, 404, 429, 500 (shared meanings above).
- Related routes: createGroup
- Mock fixture: state.groups
- Realtime: group:updated, activity:created

Request example:

```json
{
  "name": "Weekend",
  "cityId": "dalat",
  "tripDate": "2026-11-11",
  "startHour": 8,
  "endHour": 20,
  "budgetPerPersonVnd": 500000,
  "mode": "DEMO"
}
```

Response example:

```json
{
  "id": "mock-dalat",
  "name": "Đà Lạt cùng những người bạn",
  "cityId": "dalat",
  "cityName": "Đà Lạt",
  "tripDate": "2026-11-11",
  "startHour": 8,
  "endHour": 20,
  "budgetPerPersonVnd": 500000,
  "inviteCode": "DICHUNG",
  "currentPlanId": "mock-approved",
  "memberCount": 3,
  "role": "LEADER",
  "mode": "DEMO",
  "revision": 1
}
```

### POST /groups/join

- Status: **Existing agreed interface**
- Authorization: user. 
- Request type: `{code:string}`
- Response type: `Group`
- Errors: 400, 401, 403, 404, 429, 500 (shared meanings above).
- Related routes: joinGroup
- Mock fixture: state.groups / DICHUNG
- Realtime: group:updated, activity:created

Request example:

```json
{
  "code": "DICHUNG"
}
```

Response example:

```json
{
  "id": "mock-dalat",
  "name": "Đà Lạt cùng những người bạn",
  "cityId": "dalat",
  "cityName": "Đà Lạt",
  "tripDate": "2026-11-11",
  "startHour": 8,
  "endHour": 20,
  "budgetPerPersonVnd": 500000,
  "inviteCode": "DICHUNG",
  "currentPlanId": "mock-approved",
  "memberCount": 3,
  "role": "MEMBER",
  "mode": "DEMO",
  "revision": 1
}
```

### GET /groups/:id

- Status: **Existing agreed interface**
- Authorization: member. 
- Request type: `path id: string`
- Response type: `GroupDetail`
- Errors: 400, 401, 403, 404, 429, 500 (shared meanings above).
- Related routes: dashboard, members, invite, wishlist, timeline, history, budget, aiSetup
- Mock fixture: state.groups[0]
- Realtime: group:updated, wishlist:updated, plan:updated, plan:applied

Request example: no JSON body (path/query as shown).

Response example:

```json
{
  "group": {
    "id": "mock-dalat",
    "name": "Đà Lạt cùng những người bạn",
    "cityId": "dalat",
    "cityName": "Đà Lạt",
    "tripDate": "2026-11-11",
    "startHour": 8,
    "endHour": 20,
    "budgetPerPersonVnd": 500000,
    "inviteCode": "DICHUNG",
    "currentPlanId": "mock-approved",
    "memberCount": 3,
    "role": "LEADER",
    "mode": "DEMO",
    "revision": 1
  },
  "members": [
    {
      "id": "mock-leader",
      "name": "Minh Anh",
      "email": "leader@dichung.demo",
      "avatarColor": "#18735C",
      "role": "LEADER"
    },
    {
      "id": "mock-member",
      "name": "Hoàng Nam",
      "email": "member@dichung.demo",
      "avatarColor": "#597BA1",
      "role": "MEMBER"
    },
    {
      "id": "mock-third",
      "name": "Thu Hà",
      "email": "third@dichung.demo",
      "avatarColor": "#9A6893",
      "role": "MEMBER"
    }
  ],
  "wishlist": [
    {
      "id": "dalat-01",
      "cityId": "dalat",
      "name": "Hồ Xuân Hương",
      "category": "Thiên nhiên",
      "environment": "OUTDOOR",
      "latitude": 11.9450109,
      "longitude": 108.445363,
      "sourceUrl": "https://www.openstreetmap.org/relation/2390139",
      "sourceId": "relation/2390139",
      "coordinateKind": "OSM_BOUNDING_BOX_CENTER",
      "sourceTimestamp": "2026-11-10T05:57:04Z",
      "description": "Hồ Xuân Hương — không gian mặt hồ và cảnh quan. Marker đặt tại tâm hình học đối tượng, chưa xác minh cổng vào. Kiểm tra thông tin tiếp cận và hoạt động trước khi đến.",
      "visitorInfo": {
        "entranceFeeVnd": null,
        "openingHours": null,
        "visitDurationMin": null,
        "environmentEstimated": true,
        "verifiedAt": null
      },
      "geographyVerified": true,
      "dataQuality": "OSM_SOURCE_WITH_UNKNOWN_VISITOR_INFO",
      "priceVnd": 0,
      "durationMin": 60,
      "openHour": 8,
      "closeHour": 20,
      "imageUrl": "https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=640&q=75"
    }
  ],
  "plans": [
    {
      "id": "mock-pending",
      "groupId": "mock-dalat",
      "tripContext": {
        "cityId": "dalat",
        "tripDate": "2026-11-11",
        "startHour": 8,
        "endHour": 20,
        "budgetPerPersonVnd": 500000
      },
      "version": 3,
      "basePlanId": "mock-approved",
      "kind": "INITIAL",
      "status": "VOTING",
      "engine": "RULE_BASED",
      "demo": true,
      "summary": "DEMO · Phương án mẫu để kiểm tra timeline, bản đồ và biểu quyết. Không phải đầu ra AI thật.",
      "items": [
        {
          "id": "mock-pending-stop-1",
          "placeId": "dalat-03",
          "place": {
            "id": "dalat-03",
            "cityId": "dalat",
            "name": "Bảo tàng Lâm Đồng",
            "category": "Văn hóa",
            "environment": "INDOOR",
            "latitude": 11.9405756,
            "longitude": 108.4599038,
            "sourceUrl": "https://www.openstreetmap.org/node/1152350875",
            "sourceId": "node/1152350875",
            "coordinateKind": "OSM_NODE",
            "sourceTimestamp": "2026-11-10T05:57:04Z",
            "description": "Bảo tàng Lâm Đồng — không gian bảo tàng để tìm hiểu văn hóa và lịch sử địa phương. Marker sử dụng tọa độ điểm do cộng đồng OSM ghi nhận. Kiểm tra thông tin tiếp cận và hoạt động trước khi đến.",
            "visitorInfo": {
              "entranceFeeVnd": null,
              "openingHours": "Mo-Su 07:15-11:30, 13:30-17:00",
              "visitDurationMin": null,
              "environmentEstimated": true,
              "verifiedAt": null
            },
            "geographyVerified": true,
            "dataQuality": "OSM_SOURCE_WITH_UNKNOWN_VISITOR_INFO",
            "priceVnd": 0,
            "durationMin": 60,
            "openHour": 8,
            "closeHour": 20,
            "imageUrl": "https://images.unsplash.com/photo-1564399579883-451a5d44ec08?auto=format&fit=crop&w=640&q=75"
          },
          "position": 1,
          "startTime": "2026-11-11T01:00:00.000Z",
          "endTime": "2026-11-11T02:00:00.000Z",
          "travelMin": 0,
          "costVnd": 0,
          "reason": "DEMO · Điểm dừng trong kịch bản thử giao diện. Thời lượng và di chuyển là giả định; giá vé chưa biết.",
          "factIds": [
            "https://www.openstreetmap.org/node/1152350875"
          ]
        }
      ],
      "totalCostVnd": 0,
      "totalDurationMin": 285,
      "totalTravelMin": 45,
      "unknownCostCount": 4,
      "yesVotes": 1,
      "noVotes": 0,
      "eligibleCount": 3,
      "requiredYesVotes": 2,
      "myVote": null,
      "deadline": "2026-11-12T08:00:00.000Z",
      "createdAt": "2026-11-11T08:00:00.000Z"
    }
  ],
  "currentPlan": {
    "id": "mock-approved",
    "groupId": "mock-dalat",
    "tripContext": {
      "cityId": "dalat",
      "tripDate": "2026-11-11",
      "startHour": 8,
      "endHour": 20,
      "budgetPerPersonVnd": 500000
    },
    "version": 3,
    "basePlanId": "mock-approved",
    "kind": "INITIAL",
    "status": "APPROVED",
    "engine": "RULE_BASED",
    "demo": true,
    "summary": "DEMO · Phương án mẫu để kiểm tra timeline, bản đồ và biểu quyết. Không phải đầu ra AI thật.",
    "items": [
      {
        "id": "mock-pending-stop-1",
        "placeId": "dalat-03",
        "place": {
          "id": "dalat-03",
          "cityId": "dalat",
          "name": "Bảo tàng Lâm Đồng",
          "category": "Văn hóa",
          "environment": "INDOOR",
          "latitude": 11.9405756,
          "longitude": 108.4599038,
          "sourceUrl": "https://www.openstreetmap.org/node/1152350875",
          "sourceId": "node/1152350875",
          "coordinateKind": "OSM_NODE",
          "sourceTimestamp": "2026-11-10T05:57:04Z",
          "description": "Bảo tàng Lâm Đồng — không gian bảo tàng để tìm hiểu văn hóa và lịch sử địa phương. Marker sử dụng tọa độ điểm do cộng đồng OSM ghi nhận. Kiểm tra thông tin tiếp cận và hoạt động trước khi đến.",
          "visitorInfo": {
            "entranceFeeVnd": null,
            "openingHours": "Mo-Su 07:15-11:30, 13:30-17:00",
            "visitDurationMin": null,
            "environmentEstimated": true,
            "verifiedAt": null
          },
          "geographyVerified": true,
          "dataQuality": "OSM_SOURCE_WITH_UNKNOWN_VISITOR_INFO",
          "priceVnd": 0,
          "durationMin": 60,
          "openHour": 8,
          "closeHour": 20,
          "imageUrl": "https://images.unsplash.com/photo-1564399579883-451a5d44ec08?auto=format&fit=crop&w=640&q=75"
        },
        "position": 1,
        "startTime": "2026-11-11T01:00:00.000Z",
        "endTime": "2026-11-11T02:00:00.000Z",
        "travelMin": 0,
        "costVnd": 0,
        "reason": "DEMO · Điểm dừng trong kịch bản thử giao diện. Thời lượng và di chuyển là giả định; giá vé chưa biết.",
        "factIds": [
          "https://www.openstreetmap.org/node/1152350875"
        ]
      }
    ],
    "totalCostVnd": 0,
    "totalDurationMin": 285,
    "totalTravelMin": 45,
    "unknownCostCount": 4,
    "yesVotes": 1,
    "noVotes": 0,
    "eligibleCount": 3,
    "requiredYesVotes": 2,
    "myVote": null,
    "deadline": "2026-11-12T08:00:00.000Z",
    "createdAt": "2026-11-11T08:00:00.000Z"
  }
}
```

### PATCH /groups/:id

- Status: **Existing agreed interface**
- Authorization: leader. Server must check leader role.
- Request type: `Partial<Pick<Group,'name'|'tripDate'|'startHour'|'endHour'|'budgetPerPersonVnd'|'mode'>> & {expectedRevision?:number}`
- Response type: `Group`
- Errors: 400, 401, 403, 404, 409, 429, 500 (shared meanings above).
- Related routes: budget, aiSetup
- Mock fixture: state.groups[0].group
- Realtime: group:updated, plan:updated, activity:created

Request example:

```json
{
  "budgetPerPersonVnd": 600000,
  "expectedRevision": 1
}
```

Response example:

```json
{
  "id": "mock-dalat",
  "name": "Đà Lạt cùng những người bạn",
  "cityId": "dalat",
  "cityName": "Đà Lạt",
  "tripDate": "2026-11-11",
  "startHour": 8,
  "endHour": 20,
  "budgetPerPersonVnd": 600000,
  "inviteCode": "DICHUNG",
  "currentPlanId": "mock-approved",
  "memberCount": 3,
  "role": "LEADER",
  "mode": "DEMO",
  "revision": 2
}
```

### GET /groups/:id/preferences

- Status: **Existing agreed interface**
- Authorization: member. 
- Request type: `path id: string`
- Response type: `Preferences (current user)`
- Errors: 400, 401, 403, 404, 429, 500 (shared meanings above).
- Related routes: groupPreferences, aiSetup
- Mock fixture: state.preferences[groupId:userId]
- Realtime: group:updated

Request example: no JSON body (path/query as shown).

Response example:

```json
{
  "categories": [
    "Thiên nhiên",
    "Văn hóa"
  ],
  "environmentPreference": "ANY",
  "travelStyles": [
    "RELAXATION"
  ]
}
```

### PATCH /groups/:id/preferences

- Status: **Existing agreed interface**
- Authorization: member. 
- Request type: `Pick<Preferences,"categories"> & Partial<Omit<Preferences,"categories">>`
- Response type: `Preferences`
- Errors: 400, 401, 403, 404, 429, 500 (shared meanings above).
- Related routes: groupPreferences, aiSetup
- Mock fixture: state.preferences[groupId:userId]
- Realtime: group:updated, activity:created

Request example:

```json
{
  "categories": [
    "Thiên nhiên",
    "Văn hóa"
  ],
  "environmentPreference": "ANY",
  "travelStyles": [
    "RELAXATION"
  ]
}
```

Response example:

```json
{
  "categories": [
    "Thiên nhiên",
    "Văn hóa"
  ],
  "environmentPreference": "ANY",
  "travelStyles": [
    "RELAXATION"
  ]
}
```

### GET /groups/:id/wishlist

- Status: **Existing agreed interface**
- Authorization: member. 
- Request type: `path id: string`
- Response type: `Place[]`
- Errors: 400, 401, 403, 404, 429, 500 (shared meanings above).
- Related routes: wishlist, map, aiSetup
- Mock fixture: state.groups[0].wishlist
- Realtime: wishlist:updated

Request example: no JSON body (path/query as shown).

Response example:

```json
[
  {
    "id": "dalat-01",
    "cityId": "dalat",
    "name": "Hồ Xuân Hương",
    "category": "Thiên nhiên",
    "environment": "OUTDOOR",
    "latitude": 11.9450109,
    "longitude": 108.445363,
    "sourceUrl": "https://www.openstreetmap.org/relation/2390139",
    "sourceId": "relation/2390139",
    "coordinateKind": "OSM_BOUNDING_BOX_CENTER",
    "sourceTimestamp": "2026-11-10T05:57:04Z",
    "description": "Hồ Xuân Hương — không gian mặt hồ và cảnh quan. Marker đặt tại tâm hình học đối tượng, chưa xác minh cổng vào. Kiểm tra thông tin tiếp cận và hoạt động trước khi đến.",
    "visitorInfo": {
      "entranceFeeVnd": null,
      "openingHours": null,
      "visitDurationMin": null,
      "environmentEstimated": true,
      "verifiedAt": null
    },
    "geographyVerified": true,
    "dataQuality": "OSM_SOURCE_WITH_UNKNOWN_VISITOR_INFO",
    "priceVnd": 0,
    "durationMin": 60,
    "openHour": 8,
    "closeHour": 20,
    "imageUrl": "https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=640&q=75"
  }
]
```

### POST /groups/:id/wishlist

- Status: **Existing agreed interface**
- Authorization: member. 
- Request type: `{placeId:string}`
- Response type: `Place[]`
- Errors: 400, 401, 403, 404, 429, 500 (shared meanings above).
- Related routes: discover, placeDetail, map, recommendations
- Mock fixture: state.groups[0].wishlist
- Realtime: wishlist:updated, activity:created

Request example:

```json
{
  "placeId": "dalat-01"
}
```

Response example:

```json
[
  {
    "id": "dalat-01",
    "cityId": "dalat",
    "name": "Hồ Xuân Hương",
    "category": "Thiên nhiên",
    "environment": "OUTDOOR",
    "latitude": 11.9450109,
    "longitude": 108.445363,
    "sourceUrl": "https://www.openstreetmap.org/relation/2390139",
    "sourceId": "relation/2390139",
    "coordinateKind": "OSM_BOUNDING_BOX_CENTER",
    "sourceTimestamp": "2026-11-10T05:57:04Z",
    "description": "Hồ Xuân Hương — không gian mặt hồ và cảnh quan. Marker đặt tại tâm hình học đối tượng, chưa xác minh cổng vào. Kiểm tra thông tin tiếp cận và hoạt động trước khi đến.",
    "visitorInfo": {
      "entranceFeeVnd": null,
      "openingHours": null,
      "visitDurationMin": null,
      "environmentEstimated": true,
      "verifiedAt": null
    },
    "geographyVerified": true,
    "dataQuality": "OSM_SOURCE_WITH_UNKNOWN_VISITOR_INFO",
    "priceVnd": 0,
    "durationMin": 60,
    "openHour": 8,
    "closeHour": 20,
    "imageUrl": "https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=640&q=75"
  }
]
```

### DELETE /groups/:id/wishlist/:placeId

- Status: **Existing agreed interface**
- Authorization: member. 
- Request type: `path id,placeId: string`
- Response type: `Place[]`
- Errors: 400, 401, 403, 404, 429, 500 (shared meanings above).
- Related routes: wishlist
- Mock fixture: state.groups[0].wishlist
- Realtime: wishlist:updated, activity:created

Request example: no JSON body (path/query as shown).

Response example:

```json
[]
```

### POST /ai/recommendations

- Status: **Existing agreed interface**
- Authorization: user. 
- Request type: `DiscoveryInput`
- Response type: `RecommendationResult`
- Errors: 400, 401, 403, 404, 429, 502, 503 (shared meanings above).
- Related routes: recommendations, map
- Mock fixture: MockDataAdapter.recommend; full example in docs/examples
- Realtime: No required event; caller updates/refetches response state.

Request example:

```json
{
  "cityId": "dalat",
  "tripDate": "2026-11-11",
  "budgetPerPersonVnd": 500000,
  "categories": [
    "CULTURE"
  ],
  "environmentPreference": "ANY",
  "travelStyles": [
    "RELAXATION"
  ],
  "durationHours": 8,
  "startHour": 8,
  "preferredPlaceIds": [
    "dalat-01"
  ],
  "groupId": "mock-dalat",
  "mode": "demo",
  "limit": 6
}
```

Response example:

```json
{
  "requestId": "example",
  "engine": "RULE_BASED",
  "demo": true,
  "model": null,
  "fallbackReason": "MOCK_FIXTURE",
  "cityId": "dalat",
  "groupId": "mock-dalat",
  "input": {
    "cityId": "dalat",
    "tripDate": "2026-11-11",
    "budgetPerPersonVnd": 500000,
    "categories": [
      "CULTURE"
    ],
    "environmentPreference": "ANY",
    "travelStyles": [
      "RELAXATION"
    ],
    "durationHours": 8,
    "startHour": 8,
    "preferredPlaceIds": [
      "dalat-01"
    ],
    "groupId": "mock-dalat",
    "mode": "demo",
    "limit": 6
  },
  "recommendations": [],
  "candidateCount": 0,
  "groupPreferenceCount": 3,
  "weather": {
    "demo": true,
    "fetchedAt": "2026-11-11T08:00:00.000Z",
    "confidenceText": "DEMO · Các con số là kịch bản giao diện, không phải thời tiết trực tiếp.",
    "providers": [
      {
        "provider": "Open-Meteo",
        "status": "OK",
        "fetchedAt": "2026-11-11T08:00:00.000Z",
        "message": "DEMO · Nguồn mô phỏng, không gọi nhà cung cấp."
      },
      {
        "provider": "WeatherAPI",
        "status": "OK",
        "fetchedAt": "2026-11-11T08:00:00.000Z",
        "message": "DEMO · Nguồn mô phỏng, không gọi nhà cung cấp."
      },
      {
        "provider": "Tomorrow.io",
        "status": "OK",
        "fetchedAt": "2026-11-11T08:00:00.000Z",
        "message": "DEMO · Nguồn mô phỏng, không gọi nhà cung cấp."
      }
    ],
    "slots": [
      {
        "time": "2026-11-10T23:00:00.000Z",
        "rainMmH": 0,
        "probabilityPct": 15,
        "temperatureC": 18,
        "windKmh": 9,
        "level": "NONE",
        "rainVotes": 0,
        "validSources": 3,
        "providers": [
          {
            "provider": "Open-Meteo",
            "rainMmH": 0,
            "probabilityPct": 15,
            "risk": false,
            "usable": true
          },
          {
            "provider": "WeatherAPI",
            "rainMmH": 0,
            "probabilityPct": 15,
            "risk": false,
            "usable": true
          },
          {
            "provider": "Tomorrow.io",
            "rainMmH": 0,
            "probabilityPct": 15,
            "risk": false,
            "usable": true
          }
        ]
      }
    ],
    "rainWindows": []
  },
  "generatedAt": "2026-11-11T08:00:00.000Z",
  "cached": false,
  "warnings": [
    "Simulated empty example; see generated recommendation-result.json for full populated payload."
  ]
}
```

### GET /groups/:id/plans

- Status: **Existing agreed interface**
- Authorization: member. 
- Request type: `path id: string`
- Response type: `Plan[]`
- Errors: 400, 401, 403, 404, 429, 500 (shared meanings above).
- Related routes: history, proposal
- Mock fixture: state.groups[0].plans
- Realtime: plan:created, plan:updated, plan:applied

Request example: no JSON body (path/query as shown).

Response example:

```json
[
  {
    "id": "mock-pending",
    "groupId": "mock-dalat",
    "tripContext": {
      "cityId": "dalat",
      "tripDate": "2026-11-11",
      "startHour": 8,
      "endHour": 20,
      "budgetPerPersonVnd": 500000
    },
    "version": 3,
    "basePlanId": "mock-approved",
    "kind": "INITIAL",
    "status": "VOTING",
    "engine": "RULE_BASED",
    "demo": true,
    "summary": "DEMO · Phương án mẫu để kiểm tra timeline, bản đồ và biểu quyết. Không phải đầu ra AI thật.",
    "items": [
      {
        "id": "mock-pending-stop-1",
        "placeId": "dalat-03",
        "place": {
          "id": "dalat-03",
          "cityId": "dalat",
          "name": "Bảo tàng Lâm Đồng",
          "category": "Văn hóa",
          "environment": "INDOOR",
          "latitude": 11.9405756,
          "longitude": 108.4599038,
          "sourceUrl": "https://www.openstreetmap.org/node/1152350875",
          "sourceId": "node/1152350875",
          "coordinateKind": "OSM_NODE",
          "sourceTimestamp": "2026-11-10T05:57:04Z",
          "description": "Bảo tàng Lâm Đồng — không gian bảo tàng để tìm hiểu văn hóa và lịch sử địa phương. Marker sử dụng tọa độ điểm do cộng đồng OSM ghi nhận. Kiểm tra thông tin tiếp cận và hoạt động trước khi đến.",
          "visitorInfo": {
            "entranceFeeVnd": null,
            "openingHours": "Mo-Su 07:15-11:30, 13:30-17:00",
            "visitDurationMin": null,
            "environmentEstimated": true,
            "verifiedAt": null
          },
          "geographyVerified": true,
          "dataQuality": "OSM_SOURCE_WITH_UNKNOWN_VISITOR_INFO",
          "priceVnd": 0,
          "durationMin": 60,
          "openHour": 8,
          "closeHour": 20,
          "imageUrl": "https://images.unsplash.com/photo-1564399579883-451a5d44ec08?auto=format&fit=crop&w=640&q=75"
        },
        "position": 1,
        "startTime": "2026-11-11T01:00:00.000Z",
        "endTime": "2026-11-11T02:00:00.000Z",
        "travelMin": 0,
        "costVnd": 0,
        "reason": "DEMO · Điểm dừng trong kịch bản thử giao diện. Thời lượng và di chuyển là giả định; giá vé chưa biết.",
        "factIds": [
          "https://www.openstreetmap.org/node/1152350875"
        ]
      }
    ],
    "totalCostVnd": 0,
    "totalDurationMin": 285,
    "totalTravelMin": 45,
    "unknownCostCount": 4,
    "yesVotes": 1,
    "noVotes": 0,
    "eligibleCount": 3,
    "requiredYesVotes": 2,
    "myVote": null,
    "deadline": "2026-11-12T08:00:00.000Z",
    "createdAt": "2026-11-11T08:00:00.000Z"
  }
]
```

### POST /groups/:id/plans/generate

- Status: **Existing agreed interface**
- Authorization: leader. Server must check leader role.
- Request type: `{mode:'demo'|'live';task?:'INITIAL'|'RAIN_CHANGE';placeIds?:string[]}`
- Response type: `Plan`
- Errors: 400, 401, 403, 404, 409, 429, 502, 503 (shared meanings above).
- Related routes: aiSetup, itineraryMap
- Mock fixture: planFixture; state.groups[0].plans
- Realtime: plan:created, notification:created, activity:created

Request example:

```json
{
  "mode": "demo",
  "task": "INITIAL",
  "placeIds": [
    "dalat-01",
    "dalat-03",
    "dalat-04"
  ]
}
```

Response example:

```json
{
  "id": "mock-pending",
  "groupId": "mock-dalat",
  "tripContext": {
    "cityId": "dalat",
    "tripDate": "2026-11-11",
    "startHour": 8,
    "endHour": 20,
    "budgetPerPersonVnd": 500000
  },
  "version": 3,
  "basePlanId": "mock-approved",
  "kind": "INITIAL",
  "status": "VOTING",
  "engine": "RULE_BASED",
  "demo": true,
  "summary": "DEMO · Phương án mẫu để kiểm tra timeline, bản đồ và biểu quyết. Không phải đầu ra AI thật.",
  "items": [
    {
      "id": "mock-pending-stop-1",
      "placeId": "dalat-03",
      "place": {
        "id": "dalat-03",
        "cityId": "dalat",
        "name": "Bảo tàng Lâm Đồng",
        "category": "Văn hóa",
        "environment": "INDOOR",
        "latitude": 11.9405756,
        "longitude": 108.4599038,
        "sourceUrl": "https://www.openstreetmap.org/node/1152350875",
        "sourceId": "node/1152350875",
        "coordinateKind": "OSM_NODE",
        "sourceTimestamp": "2026-11-10T05:57:04Z",
        "description": "Bảo tàng Lâm Đồng — không gian bảo tàng để tìm hiểu văn hóa và lịch sử địa phương. Marker sử dụng tọa độ điểm do cộng đồng OSM ghi nhận. Kiểm tra thông tin tiếp cận và hoạt động trước khi đến.",
        "visitorInfo": {
          "entranceFeeVnd": null,
          "openingHours": "Mo-Su 07:15-11:30, 13:30-17:00",
          "visitDurationMin": null,
          "environmentEstimated": true,
          "verifiedAt": null
        },
        "geographyVerified": true,
        "dataQuality": "OSM_SOURCE_WITH_UNKNOWN_VISITOR_INFO",
        "priceVnd": 0,
        "durationMin": 60,
        "openHour": 8,
        "closeHour": 20,
        "imageUrl": "https://images.unsplash.com/photo-1564399579883-451a5d44ec08?auto=format&fit=crop&w=640&q=75"
      },
      "position": 1,
      "startTime": "2026-11-11T01:00:00.000Z",
      "endTime": "2026-11-11T02:00:00.000Z",
      "travelMin": 0,
      "costVnd": 0,
      "reason": "DEMO · Điểm dừng trong kịch bản thử giao diện. Thời lượng và di chuyển là giả định; giá vé chưa biết.",
      "factIds": [
        "https://www.openstreetmap.org/node/1152350875"
      ]
    }
  ],
  "totalCostVnd": 0,
  "totalDurationMin": 285,
  "totalTravelMin": 45,
  "unknownCostCount": 4,
  "yesVotes": 1,
  "noVotes": 0,
  "eligibleCount": 3,
  "requiredYesVotes": 2,
  "myVote": null,
  "deadline": "2026-11-12T08:00:00.000Z",
  "createdAt": "2026-11-11T08:00:00.000Z"
}
```

### GET /plans/:id

- Status: **Existing agreed interface**
- Authorization: member. 
- Request type: `path id: string`
- Response type: `Plan`
- Errors: 400, 401, 403, 404, 429, 500 (shared meanings above).
- Related routes: proposal, vote, itineraryMap
- Mock fixture: state.groups[0].plans; per-user myVote
- Realtime: plan:updated, plan:applied

Request example: no JSON body (path/query as shown).

Response example:

```json
{
  "id": "mock-pending",
  "groupId": "mock-dalat",
  "tripContext": {
    "cityId": "dalat",
    "tripDate": "2026-11-11",
    "startHour": 8,
    "endHour": 20,
    "budgetPerPersonVnd": 500000
  },
  "version": 3,
  "basePlanId": "mock-approved",
  "kind": "INITIAL",
  "status": "VOTING",
  "engine": "RULE_BASED",
  "demo": true,
  "summary": "DEMO · Phương án mẫu để kiểm tra timeline, bản đồ và biểu quyết. Không phải đầu ra AI thật.",
  "items": [
    {
      "id": "mock-pending-stop-1",
      "placeId": "dalat-03",
      "place": {
        "id": "dalat-03",
        "cityId": "dalat",
        "name": "Bảo tàng Lâm Đồng",
        "category": "Văn hóa",
        "environment": "INDOOR",
        "latitude": 11.9405756,
        "longitude": 108.4599038,
        "sourceUrl": "https://www.openstreetmap.org/node/1152350875",
        "sourceId": "node/1152350875",
        "coordinateKind": "OSM_NODE",
        "sourceTimestamp": "2026-11-10T05:57:04Z",
        "description": "Bảo tàng Lâm Đồng — không gian bảo tàng để tìm hiểu văn hóa và lịch sử địa phương. Marker sử dụng tọa độ điểm do cộng đồng OSM ghi nhận. Kiểm tra thông tin tiếp cận và hoạt động trước khi đến.",
        "visitorInfo": {
          "entranceFeeVnd": null,
          "openingHours": "Mo-Su 07:15-11:30, 13:30-17:00",
          "visitDurationMin": null,
          "environmentEstimated": true,
          "verifiedAt": null
        },
        "geographyVerified": true,
        "dataQuality": "OSM_SOURCE_WITH_UNKNOWN_VISITOR_INFO",
        "priceVnd": 0,
        "durationMin": 60,
        "openHour": 8,
        "closeHour": 20,
        "imageUrl": "https://images.unsplash.com/photo-1564399579883-451a5d44ec08?auto=format&fit=crop&w=640&q=75"
      },
      "position": 1,
      "startTime": "2026-11-11T01:00:00.000Z",
      "endTime": "2026-11-11T02:00:00.000Z",
      "travelMin": 0,
      "costVnd": 0,
      "reason": "DEMO · Điểm dừng trong kịch bản thử giao diện. Thời lượng và di chuyển là giả định; giá vé chưa biết.",
      "factIds": [
        "https://www.openstreetmap.org/node/1152350875"
      ]
    }
  ],
  "totalCostVnd": 0,
  "totalDurationMin": 285,
  "totalTravelMin": 45,
  "unknownCostCount": 4,
  "yesVotes": 1,
  "noVotes": 0,
  "eligibleCount": 3,
  "requiredYesVotes": 2,
  "myVote": null,
  "deadline": "2026-11-12T08:00:00.000Z",
  "createdAt": "2026-11-11T08:00:00.000Z"
}
```

### POST /plans/:id/votes

- Status: **Existing agreed interface**
- Authorization: member. 
- Request type: `{choice:'YES'|'NO'}`
- Response type: `Plan`
- Errors: 400, 401, 403, 404, 409, 429, 500 (shared meanings above).
- Related routes: vote
- Mock fixture: state.votes / electorates
- Realtime: plan:updated, plan:applied, notification:created, activity:created

Request example:

```json
{
  "choice": "YES"
}
```

Response example:

```json
{
  "id": "mock-pending",
  "groupId": "mock-dalat",
  "tripContext": {
    "cityId": "dalat",
    "tripDate": "2026-11-11",
    "startHour": 8,
    "endHour": 20,
    "budgetPerPersonVnd": 500000
  },
  "version": 3,
  "basePlanId": "mock-approved",
  "kind": "INITIAL",
  "status": "APPROVED",
  "engine": "RULE_BASED",
  "demo": true,
  "summary": "DEMO · Phương án mẫu để kiểm tra timeline, bản đồ và biểu quyết. Không phải đầu ra AI thật.",
  "items": [
    {
      "id": "mock-pending-stop-1",
      "placeId": "dalat-03",
      "place": {
        "id": "dalat-03",
        "cityId": "dalat",
        "name": "Bảo tàng Lâm Đồng",
        "category": "Văn hóa",
        "environment": "INDOOR",
        "latitude": 11.9405756,
        "longitude": 108.4599038,
        "sourceUrl": "https://www.openstreetmap.org/node/1152350875",
        "sourceId": "node/1152350875",
        "coordinateKind": "OSM_NODE",
        "sourceTimestamp": "2026-11-10T05:57:04Z",
        "description": "Bảo tàng Lâm Đồng — không gian bảo tàng để tìm hiểu văn hóa và lịch sử địa phương. Marker sử dụng tọa độ điểm do cộng đồng OSM ghi nhận. Kiểm tra thông tin tiếp cận và hoạt động trước khi đến.",
        "visitorInfo": {
          "entranceFeeVnd": null,
          "openingHours": "Mo-Su 07:15-11:30, 13:30-17:00",
          "visitDurationMin": null,
          "environmentEstimated": true,
          "verifiedAt": null
        },
        "geographyVerified": true,
        "dataQuality": "OSM_SOURCE_WITH_UNKNOWN_VISITOR_INFO",
        "priceVnd": 0,
        "durationMin": 60,
        "openHour": 8,
        "closeHour": 20,
        "imageUrl": "https://images.unsplash.com/photo-1564399579883-451a5d44ec08?auto=format&fit=crop&w=640&q=75"
      },
      "position": 1,
      "startTime": "2026-11-11T01:00:00.000Z",
      "endTime": "2026-11-11T02:00:00.000Z",
      "travelMin": 0,
      "costVnd": 0,
      "reason": "DEMO · Điểm dừng trong kịch bản thử giao diện. Thời lượng và di chuyển là giả định; giá vé chưa biết.",
      "factIds": [
        "https://www.openstreetmap.org/node/1152350875"
      ]
    }
  ],
  "totalCostVnd": 0,
  "totalDurationMin": 285,
  "totalTravelMin": 45,
  "unknownCostCount": 4,
  "yesVotes": 2,
  "noVotes": 0,
  "eligibleCount": 3,
  "requiredYesVotes": 2,
  "myVote": "YES",
  "deadline": "2026-11-12T08:00:00.000Z",
  "createdAt": "2026-11-11T08:00:00.000Z"
}
```

### GET /groups/:id/weather?mode=demo|live

- Status: **Existing agreed interface**
- Authorization: member. 
- Request type: `query: {mode:'demo'|'live'}`
- Response type: `WeatherSummary`
- Errors: 400, 401, 403, 404, 429, 502, 503 (shared meanings above).
- Related routes: weather, hourly, providers, home, map, itineraryMap
- Mock fixture: weatherFixture
- Realtime: weather:updated

Request example: no JSON body (path/query as shown).

Response example:

```json
{
  "demo": true,
  "fetchedAt": "2026-11-11T08:00:00.000Z",
  "confidenceText": "DEMO · Các con số là kịch bản giao diện, không phải thời tiết trực tiếp.",
  "providers": [
    {
      "provider": "Open-Meteo",
      "status": "OK",
      "fetchedAt": "2026-11-11T08:00:00.000Z",
      "message": "DEMO · Nguồn mô phỏng, không gọi nhà cung cấp."
    },
    {
      "provider": "WeatherAPI",
      "status": "OK",
      "fetchedAt": "2026-11-11T08:00:00.000Z",
      "message": "DEMO · Nguồn mô phỏng, không gọi nhà cung cấp."
    },
    {
      "provider": "Tomorrow.io",
      "status": "OK",
      "fetchedAt": "2026-11-11T08:00:00.000Z",
      "message": "DEMO · Nguồn mô phỏng, không gọi nhà cung cấp."
    }
  ],
  "slots": [
    {
      "time": "2026-11-10T23:00:00.000Z",
      "rainMmH": 0,
      "probabilityPct": 15,
      "temperatureC": 18,
      "windKmh": 9,
      "level": "NONE",
      "rainVotes": 0,
      "validSources": 3,
      "providers": [
        {
          "provider": "Open-Meteo",
          "rainMmH": 0,
          "probabilityPct": 15,
          "risk": false,
          "usable": true
        },
        {
          "provider": "WeatherAPI",
          "rainMmH": 0,
          "probabilityPct": 15,
          "risk": false,
          "usable": true
        },
        {
          "provider": "Tomorrow.io",
          "rainMmH": 0,
          "probabilityPct": 15,
          "risk": false,
          "usable": true
        }
      ]
    }
  ],
  "rainWindows": []
}
```

### POST /groups/:id/weather/check

- Status: **Existing agreed interface**
- Authorization: member. 
- Request type: `{mode:'demo'|'live'}`
- Response type: `{weather:WeatherSummary;alert:Alert|null;proposal:Plan|null}`
- Errors: 400, 401, 403, 404, 409, 429, 502, 503 (shared meanings above).
- Related routes: weather
- Mock fixture: weatherFixture + state.alerts
- Realtime: weather:updated, alert:created, plan:created

Request example:

```json
{
  "mode": "demo"
}
```

Response example:

```json
{
  "weather": {
    "demo": true,
    "fetchedAt": "2026-11-11T08:00:00.000Z",
    "confidenceText": "DEMO · Các con số là kịch bản giao diện, không phải thời tiết trực tiếp.",
    "providers": [
      {
        "provider": "Open-Meteo",
        "status": "OK",
        "fetchedAt": "2026-11-11T08:00:00.000Z",
        "message": "DEMO · Nguồn mô phỏng, không gọi nhà cung cấp."
      },
      {
        "provider": "WeatherAPI",
        "status": "OK",
        "fetchedAt": "2026-11-11T08:00:00.000Z",
        "message": "DEMO · Nguồn mô phỏng, không gọi nhà cung cấp."
      },
      {
        "provider": "Tomorrow.io",
        "status": "OK",
        "fetchedAt": "2026-11-11T08:00:00.000Z",
        "message": "DEMO · Nguồn mô phỏng, không gọi nhà cung cấp."
      }
    ],
    "slots": [
      {
        "time": "2026-11-10T23:00:00.000Z",
        "rainMmH": 0,
        "probabilityPct": 15,
        "temperatureC": 18,
        "windKmh": 9,
        "level": "NONE",
        "rainVotes": 0,
        "validSources": 3,
        "providers": [
          {
            "provider": "Open-Meteo",
            "rainMmH": 0,
            "probabilityPct": 15,
            "risk": false,
            "usable": true
          },
          {
            "provider": "WeatherAPI",
            "rainMmH": 0,
            "probabilityPct": 15,
            "risk": false,
            "usable": true
          },
          {
            "provider": "Tomorrow.io",
            "rainMmH": 0,
            "probabilityPct": 15,
            "risk": false,
            "usable": true
          }
        ]
      }
    ],
    "rainWindows": []
  },
  "alert": null,
  "proposal": null
}
```

### POST /groups/:id/demo/rain

- Status: **Existing agreed interface**
- Authorization: leader. Server must check leader role.
- Request type: `none`
- Response type: `{weather:WeatherSummary;alert:Alert;proposal:Plan}`
- Errors: 400, 401, 403, 404, 409, 429, 500 (shared meanings above).
- Related routes: dashboard, weather
- Mock fixture: MockDataAdapter.rain
- Realtime: weather:updated, alert:created, plan:created, notification:created

Request example: no JSON body (path/query as shown).

Response example:

```json
{
  "weather": {
    "demo": true,
    "fetchedAt": "2026-11-11T08:00:00.000Z",
    "confidenceText": "DEMO · Các con số là kịch bản giao diện, không phải thời tiết trực tiếp.",
    "providers": [
      {
        "provider": "Open-Meteo",
        "status": "OK",
        "fetchedAt": "2026-11-11T08:00:00.000Z",
        "message": "DEMO · Nguồn mô phỏng, không gọi nhà cung cấp."
      },
      {
        "provider": "WeatherAPI",
        "status": "OK",
        "fetchedAt": "2026-11-11T08:00:00.000Z",
        "message": "DEMO · Nguồn mô phỏng, không gọi nhà cung cấp."
      },
      {
        "provider": "Tomorrow.io",
        "status": "OK",
        "fetchedAt": "2026-11-11T08:00:00.000Z",
        "message": "DEMO · Nguồn mô phỏng, không gọi nhà cung cấp."
      }
    ],
    "slots": [
      {
        "time": "2026-11-10T23:00:00.000Z",
        "rainMmH": 0,
        "probabilityPct": 15,
        "temperatureC": 18,
        "windKmh": 9,
        "level": "NONE",
        "rainVotes": 0,
        "validSources": 3,
        "providers": [
          {
            "provider": "Open-Meteo",
            "rainMmH": 0,
            "probabilityPct": 15,
            "risk": false,
            "usable": true
          },
          {
            "provider": "WeatherAPI",
            "rainMmH": 0,
            "probabilityPct": 15,
            "risk": false,
            "usable": true
          },
          {
            "provider": "Tomorrow.io",
            "rainMmH": 0,
            "probabilityPct": 15,
            "risk": false,
            "usable": true
          }
        ]
      }
    ],
    "rainWindows": []
  },
  "alert": {
    "id": "alert",
    "groupId": "mock-dalat",
    "message": "DEMO rain scenario",
    "demo": true,
    "planId": "mock-pending",
    "createdAt": "2026-11-11T08:00:00.000Z",
    "status": "OPEN"
  },
  "proposal": {
    "id": "mock-pending",
    "groupId": "mock-dalat",
    "tripContext": {
      "cityId": "dalat",
      "tripDate": "2026-11-11",
      "startHour": 8,
      "endHour": 20,
      "budgetPerPersonVnd": 500000
    },
    "version": 3,
    "basePlanId": "mock-approved",
    "kind": "RAIN_CHANGE",
    "status": "VOTING",
    "engine": "RULE_BASED",
    "demo": true,
    "summary": "DEMO · Phương án mẫu để kiểm tra timeline, bản đồ và biểu quyết. Không phải đầu ra AI thật.",
    "items": [
      {
        "id": "mock-pending-stop-1",
        "placeId": "dalat-03",
        "place": {
          "id": "dalat-03",
          "cityId": "dalat",
          "name": "Bảo tàng Lâm Đồng",
          "category": "Văn hóa",
          "environment": "INDOOR",
          "latitude": 11.9405756,
          "longitude": 108.4599038,
          "sourceUrl": "https://www.openstreetmap.org/node/1152350875",
          "sourceId": "node/1152350875",
          "coordinateKind": "OSM_NODE",
          "sourceTimestamp": "2026-11-10T05:57:04Z",
          "description": "Bảo tàng Lâm Đồng — không gian bảo tàng để tìm hiểu văn hóa và lịch sử địa phương. Marker sử dụng tọa độ điểm do cộng đồng OSM ghi nhận. Kiểm tra thông tin tiếp cận và hoạt động trước khi đến.",
          "visitorInfo": {
            "entranceFeeVnd": null,
            "openingHours": "Mo-Su 07:15-11:30, 13:30-17:00",
            "visitDurationMin": null,
            "environmentEstimated": true,
            "verifiedAt": null
          },
          "geographyVerified": true,
          "dataQuality": "OSM_SOURCE_WITH_UNKNOWN_VISITOR_INFO",
          "priceVnd": 0,
          "durationMin": 60,
          "openHour": 8,
          "closeHour": 20,
          "imageUrl": "https://images.unsplash.com/photo-1564399579883-451a5d44ec08?auto=format&fit=crop&w=640&q=75"
        },
        "position": 1,
        "startTime": "2026-11-11T01:00:00.000Z",
        "endTime": "2026-11-11T02:00:00.000Z",
        "travelMin": 0,
        "costVnd": 0,
        "reason": "DEMO · Điểm dừng trong kịch bản thử giao diện. Thời lượng và di chuyển là giả định; giá vé chưa biết.",
        "factIds": [
          "https://www.openstreetmap.org/node/1152350875"
        ]
      }
    ],
    "totalCostVnd": 0,
    "totalDurationMin": 285,
    "totalTravelMin": 45,
    "unknownCostCount": 4,
    "yesVotes": 1,
    "noVotes": 0,
    "eligibleCount": 3,
    "requiredYesVotes": 2,
    "myVote": null,
    "deadline": "2026-11-12T08:00:00.000Z",
    "createdAt": "2026-11-11T08:00:00.000Z"
  }
}
```

### GET /groups/:id/alerts

- Status: **Existing agreed interface**
- Authorization: member. 
- Request type: `path id: string`
- Response type: `Alert[]`
- Errors: 400, 401, 403, 404, 429, 500 (shared meanings above).
- Related routes: alerts, weather
- Mock fixture: state.alerts
- Realtime: alert:created

Request example: no JSON body (path/query as shown).

Response example:

```json
[
  {
    "id": "alert",
    "groupId": "mock-dalat",
    "message": "DEMO rain change",
    "demo": true,
    "planId": "mock-pending",
    "createdAt": "2026-11-11T08:00:00.000Z",
    "status": "OPEN"
  }
]
```

### GET /radar

- Status: **Existing agreed interface**
- Authorization: user. 
- Request type: `none`
- Response type: `RadarData`
- Errors: 401, 429, 502, 503 (shared meanings above).
- Related routes: radar, map
- Mock fixture: explicit no-observation fixture
- Realtime: No required event; caller updates/refetches response state.

Request example: no JSON body (path/query as shown).

Response example:

```json
{
  "host": "https://tilecache.rainviewer.com",
  "frames": [],
  "maxZoom": 7,
  "attribution": "© RainViewer",
  "coverageUrl": "https://www.rainviewer.com/coverage.html"
}
```

### POST /groups/:id/rain-reports

- Status: **Existing agreed interface**
- Authorization: member. 
- Request type: `{latitude:number;longitude:number;accuracyM:number;condition:'RAIN'|'DRY';observedAt?:string}`
- Response type: `{id:string;verified:boolean;message:string}`
- Errors: 400, 401, 403, 404, 429, 500 (shared meanings above).
- Related routes: rainReport
- Mock fixture: MockDataAdapter rain-reports
- Realtime: activity:created

Request example:

```json
{
  "latitude": 11.9404,
  "longitude": 108.4583,
  "accuracyM": 20,
  "condition": "RAIN",
  "observedAt": "2026-11-11T08:00:00.000Z"
}
```

Response example:

```json
{
  "id": "report",
  "verified": false,
  "message": "DEMO; not actual verification"
}
```

### GET /groups/:id/verification

- Status: **Existing agreed interface**
- Authorization: member. 
- Request type: `path id: string`
- Response type: `Verification`
- Errors: 400, 401, 403, 404, 429, 500 (shared meanings above).
- Related routes: verification
- Mock fixture: explicit no-verification fixture
- Realtime: No required event; caller updates/refetches response state.

Request example: no JSON body (path/query as shown).

Response example:

```json
{
  "verified": 0,
  "correct": 0,
  "incorrect": 0,
  "unknown": 0,
  "accuracyPct": null,
  "note": "No actual verification in mock mode."
}
```

### GET /groups/:id/comments?placeId=:placeId

- Status: **Existing agreed interface**
- Authorization: member. 
- Request type: `query: {placeId:string} XOR {planId:string}`
- Response type: `Comment[]`
- Errors: 400, 401, 403, 404, 429, 500 (shared meanings above).
- Related routes: placeDetail, planItem, proposal, vote
- Mock fixture: state.comments
- Realtime: comment:created, comment:updated, comment:deleted

Request example: no JSON body (path/query as shown).

Response example:

```json
[
  {
    "id": "mock-comment",
    "groupId": "mock-dalat",
    "userId": "mock-member",
    "userName": "Hoàng Nam",
    "avatarColor": "#597BA1",
    "placeId": "dalat-01",
    "planId": null,
    "content": "DEMO · Mình muốn ghé hồ vào buổi sáng!",
    "createdAt": "2026-11-11T08:00:00.000Z",
    "editedAt": null
  }
]
```

### POST /groups/:id/comments

- Status: **Existing agreed interface**
- Authorization: member. 
- Request type: `{content:string} & ({placeId:string} | {planId:string}) [exactly one target]`
- Response type: `Comment`
- Errors: 400, 401, 403, 404, 429, 500 (shared meanings above).
- Related routes: placeDetail, proposal, vote
- Mock fixture: state.comments
- Realtime: comment:created, activity:created

Request example:

```json
{
  "content": "Meet at 8?",
  "placeId": "dalat-01"
}
```

Response example:

```json
{
  "id": "mock-comment",
  "groupId": "mock-dalat",
  "userId": "mock-member",
  "userName": "Hoàng Nam",
  "avatarColor": "#597BA1",
  "placeId": "dalat-01",
  "planId": null,
  "content": "DEMO · Mình muốn ghé hồ vào buổi sáng!",
  "createdAt": "2026-11-11T08:00:00.000Z",
  "editedAt": null
}
```

### PATCH /comments/:id

- Status: **Existing agreed interface**
- Authorization: author. Server must check ownership and group membership.
- Request type: `{content:string}`
- Response type: `Comment`
- Errors: 400, 401, 403, 404, 429, 500 (shared meanings above).
- Related routes: placeDetail, proposal, vote
- Mock fixture: state.comments
- Realtime: comment:updated

Request example:

```json
{
  "content": "Meet at 9?"
}
```

Response example:

```json
{
  "id": "mock-comment",
  "groupId": "mock-dalat",
  "userId": "mock-member",
  "userName": "Hoàng Nam",
  "avatarColor": "#597BA1",
  "placeId": "dalat-01",
  "planId": null,
  "content": "Meet at 9?",
  "createdAt": "2026-11-11T08:00:00.000Z",
  "editedAt": "2026-11-11T08:00:00.000Z"
}
```

### DELETE /comments/:id

- Status: **Existing agreed interface**
- Authorization: author. Server must check ownership and group membership.
- Request type: `path id: string`
- Response type: `{ok:true}`
- Errors: 400, 401, 403, 404, 429, 500 (shared meanings above).
- Related routes: placeDetail, proposal, vote
- Mock fixture: state.comments
- Realtime: comment:deleted

Request example: no JSON body (path/query as shown).

Response example:

```json
{
  "ok": true
}
```

### GET /notifications

- Status: **Existing agreed interface**
- Authorization: user. 
- Request type: `none`
- Response type: `Notification[]`
- Errors: 400, 401, 403, 404, 429, 500 (shared meanings above).
- Related routes: notifications, notificationDetail, home
- Mock fixture: state.notifications filtered by userId
- Realtime: notification:created

Request example: no JSON body (path/query as shown).

Response example:

```json
[
  {
    "id": "mock-notice-mock-leader",
    "groupId": "mock-dalat",
    "title": "Nhóm đang chờ ý kiến của bạn",
    "message": "DEMO · Một phương án đang chờ biểu quyết.",
    "type": "PLAN",
    "readAt": null,
    "createdAt": "2026-11-11T08:00:00.000Z",
    "planId": "mock-pending"
  }
]
```

### PATCH /notifications/:id/read

- Status: **Existing agreed interface**
- Authorization: user. 
- Request type: `path id: string`
- Response type: `Notification`
- Errors: 400, 401, 403, 404, 429, 500 (shared meanings above).
- Related routes: notifications, notificationDetail
- Mock fixture: state.notifications current user only
- Realtime: No required event; caller updates/refetches response state.

Request example: no JSON body (path/query as shown).

Response example:

```json
{
  "id": "mock-notice-mock-leader",
  "groupId": "mock-dalat",
  "title": "Nhóm đang chờ ý kiến của bạn",
  "message": "DEMO · Một phương án đang chờ biểu quyết.",
  "type": "PLAN",
  "readAt": "2026-11-11T08:00:00.000Z",
  "createdAt": "2026-11-11T08:00:00.000Z",
  "planId": "mock-pending"
}
```

### GET /groups/:id/activity

- Status: **Existing agreed interface**
- Authorization: member. 
- Request type: `path id: string`
- Response type: `Activity[]`
- Errors: 400, 401, 403, 404, 429, 500 (shared meanings above).
- Related routes: activity
- Mock fixture: state.activity[groupId]
- Realtime: activity:created

Request example: no JSON body (path/query as shown).

Response example:

```json
[
  {
    "id": "mock-activity",
    "action": "GROUP_CREATED",
    "message": "DEMO · Nhóm ba thành viên và các phương án mẫu đã sẵn sàng.",
    "createdAt": "2026-11-11T08:00:00.000Z"
  }
]
```

## Domain TypeScript

Source of truth: src/types.ts and src/api/contracts/adapter.ts. The transport seam accepts existing endpoint paths so Phase 1/2 screens do not need replacement. Endpoint metadata is executable in src/api/contracts/endpoints.ts.

```ts
export type User = {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
};
export type City = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  imageUrl: string;
};
export type Place = {
  id: string;
  cityId: string;
  name: string;
  category: string;
  environment: "INDOOR" | "OUTDOOR";
  latitude: number;
  longitude: number;
  priceVnd: number;
  durationMin: number;
  openHour: number;
  closeHour: number;
  imageUrl: string;
  description: string;
  dataQuality?: string;
  geographyVerified?: boolean;
  sourceUrl?: string;
  visitorInfo?: {
    entranceFeeVnd: number | null;
    openingHours: string | null;
    visitDurationMin: number | null;
    environmentEstimated: boolean;
    verifiedAt: string | null;
  };
};
export type Group = {
  id: string;
  name: string;
  cityId: string;
  cityName: string;
  tripDate: string;
  startHour: number;
  endHour: number;
  budgetPerPersonVnd: number;
  inviteCode: string;
  currentPlanId: string | null;
  memberCount: number;
  role: "LEADER" | "MEMBER";
  mode: "DEMO" | "LIVE";
  revision: number;
};
export type Member = User & { role: "LEADER" | "MEMBER" };
export type PlanItem = {
  id: string;
  placeId: string;
  place: Place;
  position: number;
  startTime: string;
  endTime: string;
  travelMin: number;
  costVnd: number;
  reason: string;
  factIds: string[];
};
export type Plan = {
  id: string;
  groupId: string;
  tripContext?: { cityId: string; tripDate: string; startHour: number; endHour: number; budgetPerPersonVnd: number };
  totalDurationMin?: number;
  totalTravelMin?: number;
  unknownCostCount?: number;
  route?: { kind: 'STRAIGHT_LINE'; straightLineKm: number; unmappedPlaceIds: string[]; travelTimePolicy: string };
  version: number;
  basePlanId: string | null;
  kind: "INITIAL" | "RAIN_CHANGE" | "MANUAL_CHANGE";
  status: "DRAFT" | "VOTING" | "APPROVED" | "REJECTED" | "EXPIRED" | "STALE";
  engine: "LLM" | "RULE_BASED";
  demo: boolean;
  summary: string;
  items: PlanItem[];
  totalCostVnd: number;
  yesVotes: number;
  noVotes: number;
  eligibleCount: number;
  requiredYesVotes: number;
  myVote: "YES" | "NO" | null;
  deadline: string;
  createdAt: string;
};
export type GroupDetail = {
  group: Group;
  members: Member[];
  wishlist: Place[];
  plans: Plan[];
  currentPlan: Plan | null;
};
export type Comment = {
  id: string;
  groupId: string;
  userId: string;
  userName: string;
  avatarColor: string;
  placeId: string | null;
  planId: string | null;
  content: string;
  createdAt: string;
  editedAt: string | null;
};
export type ProviderStatus = {
  provider: string;
  status: "OK" | "MISSING" | "ERROR" | "STALE";
  fetchedAt: string | null;
  message: string;
};
export type WeatherSlot = {
  time: string;
  rainMmH: number | null;
  probabilityPct: number | null;
  temperatureC?: number | null;
  windKmh?: number | null;
  level: "NONE" | "LIGHT" | "MODERATE" | "HEAVY" | "UNKNOWN";
  rainVotes: number;
  validSources: number;
  providers: {
    provider: string;
    rainMmH: number | null;
    probabilityPct: number | null;
    risk: boolean;
    usable: boolean;
  }[];
};
export type WeatherSummary = {
  demo: boolean;
  fetchedAt: string;
  providers: ProviderStatus[];
  slots: WeatherSlot[];
  rainWindows: { start: string; end: string; rainVotes: number }[];
  confidenceText: string;
};
export type Alert = {
  id: string;
  groupId: string;
  message: string;
  demo: boolean;
  planId: string | null;
  createdAt: string;
  status: string;
};
export type Notification = {
  id: string;
  groupId: string | null;
  title: string;
  message: string;
  type: string;
  readAt: string | null;
  createdAt: string;
  planId: string | null;
};
export type Verification = {
  verified: number;
  correct: number;
  incorrect: number;
  unknown: number;
  accuracyPct: number | null;
  note: string;
};
export type Activity = {
  id: string;
  action: string;
  message: string;
  createdAt: string;
};
export type RadarData = {
  host: string;
  frames: { time: number; path: string }[];
  maxZoom: number;
  attribution: string;
  coverageUrl: string;
};
export type RouteName =
  | "login"
  | "register"
  | "forgotPassword"
  | "changePassword"
  | "groupPreferences"
  | "alerts"
  | "notificationDetail"
  | "home"
  | "groups"
  | "createGroup"
  | "joinGroup"
  | "dashboard"
  | "members"
  | "invite"
  | "discover"
  | "map"
  | "recommendations"
  | "itineraryMap"
  | "filters"
  | "placeDetail"
  | "wishlist"
  | "timeline"
  | "planItem"
  | "proposal"
  | "vote"
  | "history"
  | "weather"
  | "hourly"
  | "providers"
  | "radar"
  | "rainReport"
  | "verification"
  | "notifications"
  | "budget"
  | "activity"
  | "aiSetup"
  | "profile"
  | "editProfile"
  | "settings"
  | "help";
export type Route = { name: RouteName; id?: string };
export type DiscoveryInput = {
  cityId: string; tripDate: string; budgetPerPersonVnd: number; categories: string[];
  environmentPreference: 'ANY' | 'INDOOR' | 'OUTDOOR'; travelStyles: string[];
  durationHours: number; startHour: number; preferredPlaceIds: string[]; groupId: string | null;
  mode: 'live' | 'demo'; limit: number;
};
export type Recommendation = {
  placeId: string; rank: number; reason: string; preferenceReasons: string[]; weatherExplanation: string;
  weather: { status: 'RISK' | 'UNKNOWN' | 'SUITABLE'; explanation: string; adverse: boolean; missing: boolean; temperatureAvailable: boolean; windAvailable: boolean; fetchedAt: string; demo: boolean; slots: { time: string; rainMmH: number | null; probabilityPct: number | null; validSources: number; rainVotes: number; temperatureC: number | null; windKmh: number | null }[] };
  budgetStatus: 'SOURCE_RECORDED' | 'UNKNOWN'; missingInformation: string[];
  visit: { startMinute: number; endMinute: number; durationMin: number; travelFromCityMin: number; estimated: boolean };
  distanceFromCityKm: number; factIds: string[]; facts: Record<string, unknown>; place: Place; alternativePlaceIds: string[];
};
export type RecommendationResult = {
  requestId: string; engine: 'LLM' | 'RULE_BASED'; demo: boolean; model: string | null; fallbackReason: string | null;
  cityId: string; groupId: string | null; input: DiscoveryInput; recommendations: Recommendation[]; candidateCount: number;
  groupPreferenceCount: number; weather: WeatherSummary; generatedAt: string; cached: boolean; warnings: string[];
  weatherAlternatives?: { engine: 'RULE_BASED'; outsideFilters: boolean; recommendations: Recommendation[] };
};

/** The transport seam shared by existing Phase 1/2 screens and new screens. */
export type DataSource = 'mock' | 'api';
export type MockScenario = 'normal' | 'empty' | 'offline' | 'expired' | 'missing-weather' | 'rain-change' | 'slow';
export type ConnectionState = 'local' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
export type DataEvent = { name: string; groupId?: string; payload?: unknown };
export type SubscriptionOptions = {
  token: string;
  groupId: string | null;
  onEvent: (event: DataEvent) => void;
  onStatus: (state: ConnectionState) => void;
};
export type DataSubscription = {
  close: () => void;
  typing: (target: { placeId?: string; planId?: string; typing: boolean }) => void;
};
export interface DataAdapter {
  readonly source: DataSource;
  request<T>(path: string, token: string | null, method?: string, body?: unknown, timeoutMs?: number, signal?: AbortSignal): Promise<T>;
  subscribe(options: SubscriptionOptions): DataSubscription;
}
export type Preferences = { categories: string[]; environmentPreference: 'ANY' | 'INDOOR' | 'OUTDOOR'; travelStyles: string[] };
export type AuthResult = { token: string; user: import('../../types').User };
export type AuthInput = { name?: string; email: string; password: string };
export type PasswordResetInput = { email: string };
export type ChangePasswordInput = { currentPassword: string; newPassword: string };
export type ActionResult = { ok: true; message: string };
export class DataError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) { super(message); this.name = 'DataError'; }
}

```

## New authentication integrations

Implement the proposed recovery/change endpoints using Firebase Admin/backend authorization, rate limiting, generic reset responses, and revocation policy. Never ship Admin credentials to the app. Recovery must not leak whether an email exists. Change password verifies the current credential (or requires reauthentication), updates the credential and responds with ActionResult; the frontend provides a sign-in-again action. Firebase token exchange/refresh must be integrated in the auth service before launch; the current frontend stores the supplied session and signs out on protected HTTP 401. It does not silently refresh an expired session.
