# Đi Chung — frontend handoff

Phase 3 delivery: 11 November 2026, Asia/Ho_Chi_Minh. Work is confined to this mobile workspace and its documentation. The existing backend, PostgreSQL schema and database deployment are unchanged. Firebase implementation belongs to the backend/database teammates.

## Run the frontend independently

From the repository root, install the existing npm workspaces with `npm install` (or `npm ci` for the supplied lockfile). Use Node 22+ and the installed Expo SDK 55 dependencies. In PowerShell use `npm.cmd` / `npx.cmd` if script execution policy blocks npm.ps1.

```powershell
Copy-Item apps/mobile/.env.example apps/mobile/.env
npm.cmd run web -w @di-chung/mobile
# Or run on a compatible Expo Go / development build:
npm.cmd run start -w @di-chung/mobile
```

The default source is **mock**. No backend, Firebase project, LLM key or weather key is required. Choose “Khám phá chuyến đi mẫu”, or sign in with `leader@dichung.demo` / `Demo1234!`. Mock users are demonstrative accounts only. Sample group invitation: `DICHUNG`. All weather and AI interfaces visibly label the simulation.

Mock mutations share one in-memory state for the current JavaScript runtime. Switching persona in Settings keeps the shared sample state so different users can cast their own votes. Reloading the app resets fixtures; it does not preserve registered mock accounts, comments, votes or password changes. Native session tokens use SecureStore; web sessions use localStorage. Developer source selection persists only in development. Scenario selection resets on reload.

## Configuration and API mode

```dotenv
EXPO_PUBLIC_DATA_SOURCE=mock
EXPO_PUBLIC_API_URL=http://localhost:4000
```

For real integration set `EXPO_PUBLIC_DATA_SOURCE=api`, set the backend base URL **without** `/api`, then restart Expo/export again. Do not mix the two modes in one session. Development-only controls in Login and Settings can switch the adapter, sign out, and choose failure scenarios. Production exports hide those controls and use the environment source. API errors remain errors; the app never falls back to successful mock responses.

Android emulator reaches the host through `http://10.0.2.2:4000`; physical devices use a reachable LAN IP or HTTPS hostname. Browser CORS and native transport permissions are owned by the backend/deployment configuration. Public Expo variables are embedded in the bundle and must contain no secrets. `GOOGLE_MAPS_API_KEY` is an optional restricted **client** Maps credential supplied during prebuild. It is not a secret LLM key. `ALLOW_HTTP_DEMO=true` is only for rebuilding a local HTTP demo APK; use HTTPS and false for deployment.

## Architecture and reuse

- `App.tsx`: existing screen components, shared app context, authenticated navigation and group selection. Five missing route views were added here to avoid moving all working Phase 1/2 screens. Browser history, hardware back and protected URL resolution are handled explicitly.
- `src/navigation/routeModel.ts`: safe deep-link decoding and auth route guards.
- `src/ui.tsx`, `src/theme/tokens.ts`: the consolidated light travel palette, typography, spacing and radius tokens; existing reusable buttons, fields, cards, images, notices and empty states. Controls have comfortable touch targets, visible disabled/busy states and accessible labels. Light theme is supported; dark theme remains optional future work.
- `src/api.ts`: platform storage, environment/source selection and one `request<T>` facade. Every screen, recommendation flow, map hook and weather hook uses this facade.
- `src/api/contracts/adapter.ts`: replaceable data and subscription interface plus common auth/preferences/error types. `src/types.ts` preserves the domain contract. `contracts/endpoints.ts` describes all 40 operations and produces the handoff documentation.
- `src/api/adapters/MockDataAdapter.ts`: deterministic UI simulator, local mutation consistency, scoped event subscriptions, explicit failure states. It is not a backend or production authorization service.
- `src/api/adapters/ApiDataAdapter.ts`, `client/http.ts`: REST client and Socket.io subscription lifecycle. HTTP cancellation, deadlines, JSON/error handling and protected-session expiry are shared. No direct database reads or privileged business decisions occur in screens.
- `src/api/mocks`: users, cities, plans, comments, alerts, notification and activity fixtures. The supplied 80-point OSM Da Lat catalogue is copied with unchanged coordinates/provenance. Prices/opening hours remain unknown; planning time and zero costs are marked as assumptions.
- `src/map`: existing native and sandboxed Leaflet maps, clustering, debounced search, category filtering, previews, selected-marker camera focus and itinerary geometry. Web Leaflet/markercluster libraries are now bundled locally with their licenses; OSM tiles still need network access. Native maps show a helpful setup state if the Maps key is missing.
- `src/ai`: existing recommendation setup/results studio, explanations and itinerary explorer. Results retain backend engine/demo distinctions. Timeline/marker selection works both ways. History provides an explicit two-version comparison. Dashed straight-line routes are clearly distinguished from road navigation.
- `src/components/common`: error boundary and lightweight loading skeleton. `src/components/weather`: accessible rainfall bars with missing-value handling.

No Firebase SDK or database schema assumptions were added. For Firebase integration, retain the API authority described in the checklist, or deliberately supply a new authorized adapter for approved client collections. Never let two transports maintain competing copies of votes or approved plans.

## Navigation and behavior

See [SCREEN_INVENTORY.md](SCREEN_INVENTORY.md) for all 40 routes (35 reused/improved, five added). Recommendation setup/results are two states within the existing studio, not duplicate routes. Destination filters reuse Discover state. Group members and invitation views share a component. Hourly/source views reuse WeatherSummary fields. The new screens are forgot password, change password, group preferences, weather alerts and generic notification details.

The implemented journey is: login → home → city → tourism map → destination details → shared wishlist → recommendation setup/results → planner → proposal route map → group review/voting → notifications. Mock votes are attributed to the signed-in persona. A distinct second account must cast the second YES; there is no automatic voting for other members. Comments support create/edit/delete with ownership checks in mock mode. Approved plans, pending/rejected history and weather-change proposals coexist without silently replacing the current itinerary.

## Performance and lifecycle

The catalogue/forecast hooks cache bounded results, use accent-insensitive/debounced map filtering, memoize geometry/clusters, and ignore stale responses after disposal. Resource and recommendation requests have AbortSignals; shared cache requests may finish to serve other subscribers. Destination lists paginate 12/15 records instead of loading every image. Native markers are memoized. Forecast cache TTL is one minute; catalogue TTL five minutes. Weather events/checks and reconnection invalidate forecast snapshots; source/scenario changes use separate cache identities. Recommendation results retain their creation timestamp, while destination previews show the separately refreshed forecast. Images use modest 640-pixel fixture URLs and native/browser HTTP caches with visual fallbacks. Safe-area spacing, keyboard avoidance and a root error boundary cover mobile flows. Socket listeners, typing timers and map message listeners are cleaned up on disposal.

## Tests and builds

```powershell
npm.cmd run typecheck -w @di-chung/mobile
npm.cmd test -w @di-chung/mobile
npm.cmd run web -w @di-chung/mobile -- --port 8091
# In another terminal, with no backend running:
npm.cmd run test:ui -w @di-chung/mobile
npm.cmd run build:web -w @di-chung/mobile
# Verify the exported production bundle at a 360px viewport:
node apps/mobile/tests/export-smoke.mjs
npm.cmd run build:android:bundle -w @di-chung/mobile
npm.cmd run handoff:generate -w @di-chung/mobile
```

`APP_URL` can point the browser test to another running frontend. Browser tests use headless Edge on Windows when installed, otherwise an installed Playwright Chromium. Tests include real rendered components, complete navigation, bidirectional map/timeline selection, AI setup/results, voting with persona changes, comments, notifications, weather states and all routes. They assert zero backend requests during the mock journey. The tests are browser component/integration tests, not React Native device tests. `tests/*.test.ts` covers adapters, transport, geometry, route guards, weather and contract fixtures. Artifacts/results are written under `artifacts/phase3` within this workspace.

For a native APK, use the existing Android project and installed JDK 17+/Android SDK:

```powershell
$env:EXPO_PUBLIC_DATA_SOURCE='mock'
cd apps/mobile/android
.\gradlew.bat :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon --max-workers=2 --console=plain
```

Output: `android/app/build/outputs/apk/release/app-release.apk`. The existing project signs a demo release with its debug key; this is not a store-signed release. See [PHASE3_REPORT.md](PHASE3_REPORT.md) for actual verification and [../../docs/ANDROID.md](../../docs/ANDROID.md) for the existing prebuild instructions. Do not confuse an Android bundle export, an APK compilation, browser tests or previous APKs with physical-device verification.

## Remaining integration dependencies and limits

- The API adapter is implemented against the agreed contract, with injected-fetch contract tests. End-to-end API/Firebase testing awaits the backend and database teammates.
- Password recovery/change are functional in mock mode; the two proposed endpoints require backend implementation. No email is sent by the frontend. Firebase token verification, refresh and revocation still require an agreed backend auth integration; protected 401 responses currently sign out.
- Socket.io is the prepared realtime transport; no genuine cross-device sync is available in mock mode. Push notifications outside the running app are not configured.
- Mock radar intentionally has no historical observation frames. It never invents a radar image. API radar depends on provider availability and coverage.
- Mock mode includes the full 80-point Da Lat catalogue. Vung Tau remains selectable with an honest empty state locally; the pre-existing backend catalogue is preserved and becomes available through API mode. No fabricated coordinates were added for it.
- Photos are illustrative Unsplash images, not verified photographs of every attraction. Visitor prices, admission hours, entry coordinates and visit times need source verification before real trip use. Straight-line map segments and mock travel times are not navigable road routes.
- Dark theme and multi-day trip scheduling were not introduced; the existing single-day itinerary contract is preserved.
