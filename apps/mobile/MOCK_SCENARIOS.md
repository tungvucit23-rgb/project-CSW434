# Mock scenarios

Mock is the default source: `EXPO_PUBLIC_DATA_SOURCE=mock`. No API calls, Firebase project or private credentials are required. Fixtures and mutations are owned by `src/api/mocks/fixtures.ts` and `src/api/adapters/MockDataAdapter.ts`, never duplicated in screens.

| Persona | Login email | Password | Group role |
|---|---|---|---|
| Minh Anh | leader@dichung.demo | Demo1234! | Leader |
| Hoàng Nam | member@dichung.demo | Demo1234! | Member |
| Thu Hà | third@dichung.demo | Demo1234! | Member |

Settings also provides persona buttons. Each button authenticates that persona; it does not cast a ballot. A newly registered local user starts without groups and can join with `DICHUNG`, or create their own group. The in-memory password simulator is only for UI tests, not a secure credential store. Never use real passwords in mock mode.

## Seed state

- One Da Lat group, three members, invitation `DICHUNG`, 500,000 VND/person and an 08:00–20:00 trip window on the captured Vietnamese local date.
- 80 Da Lat points use the supplied OSM coordinates unchanged, including sources and unknown visitor information. Generic outdoor/indoor illustrations are explicitly not location verification. Vung Tau is a city option with an empty local attraction list; its backend catalogue is untouched.
- Eight wishlist items; an approved plan (`mock-approved`) is the current itinerary; one rejected plan and one pending plan (`mock-pending`). The pending plan has one YES from the second member, leaving the leader free to vote. No member vote is fabricated in response to someone else's action.
- Sample comment, activity entry, a generic welcome notification, and a pending-plan notification for each persona. Notification reads are private to each persona.
- Weather fixtures include hourly temperature, rainfall, source probabilities, wind and source status. Every value is simulated and visibly labeled DEMO. Radar observations are absent. Verification accuracy is null and no simulated report counts as real verification.

Fixtures are reproducible given the same captured clock; there is no random location, weather, vote or network failure. Tests inject `2026-11-11T08:00:00Z`. Runtime fixtures use a captured clock for the initial date and explicit timestamps for later interactions.

## Developer scenario controls

In a development Expo session, open Login or Settings → **Công cụ phát triển**. Production exports hide these controls. Scenario changes refresh screens and invalidate their cache namespace. They do not change the API mode into a mock fallback.

| Scenario | UI control | Effect |
|---|---|---|
| normal | Đầy đủ dữ liệu | Full source-backed catalogue and sample collaboration state; optional 160 ms request delay. |
| empty | Danh sách trống | Empty group, destination and notification lists; cities stay available. Existing fixture details remain available by ID for testing. |
| offline | Mất mạng | Protected reads/mutations fail with NETWORK. Auth and health stay available so controls remain recoverable. |
| expired | Phiên hết hạn | Protected reads fail with HTTP 401; shared session handler returns to Login. Reset the scenario there before signing in again. |
| missing-weather | Thiếu thời tiết | Providers MISSING, metrics null, UNKNOWN slots, zero usable sources; no false clear-weather assertion. |
| rain-change | Thay đổi do mưa | Creates an explicit simulated alert and indoor proposal, preserves the approved itinerary until majority approval. |
| slow | Tải chậm (1,2 giây) | 1,200 ms requests to inspect skeletons and cancellation. |

“Đặt lại dữ liệu mẫu” resets state and scenario to normal. Reloading JavaScript also resets all mutations and registered mock users. Only the selected source and session token may survive reload through platform storage; they do not make mock data persistent. Reauthentication is required if a saved mock user no longer exists.

## Mutation checks

1. Remove a wishlist point, find it on the map, add it again; wishlist count and previews update.
2. Add a comment to a wishlist destination, edit it, delete it; a different persona cannot edit it.
3. Generate a proposal from selected locations; review timeline and dashed route. Check the official plan is unchanged.
4. Vote YES as one persona. Switch to another persona, reopen the same proposal and vote YES. Only now should a three-voter plan be approved. Two NO votes reject a plan. Changing an open ballot replaces that user's vote, without adding another ballot.
5. A user joining after voting opened is not in that plan's electorate. Changing group constraints makes old open proposals stale. Other proposals become stale after a new official plan is approved.
6. Check notifications and activity history after group, wishlist, comments or voting changes. Marking one persona's notification read leaves the others unread.
7. In Dashboard choose “Giả lập mưa”, or select the rain-change scenario. Open Alerts, compare the indoor proposal, and confirm it has not silently replaced the official route.

This is one-runtime local event delivery. It does not synchronize separate browser tabs, devices, JavaScript reloads or installed APKs. Production authorization, consensus, scheduling and weather logic remain backend responsibilities.
