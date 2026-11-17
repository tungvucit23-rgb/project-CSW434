# Backend and Firebase integration checklist

The frontend is independently runnable. Keep the existing REST names in [API_CONTRACT_HANDOFF.md](API_CONTRACT_HANDOFF.md); no database migration was performed in this phase.

## 1. Agree on one authoritative architecture

- [ ] Select Express REST backed by Firestore plus an authorized realtime transport (the current ApiDataAdapter expects Socket.io), or explicitly scope authorized direct Firestore listeners for appropriate collections.
- [ ] Keep privileged recommendation/planning, voter eligibility, voting, revisions and plan approval behind backend authorization. Do not compute official consensus in React Native or trust client role labels.
- [ ] If adopting direct Firestore listeners, implement them inside an adapter/auth provider and retire overlapping Socket.io subscriptions for those collections. A UI record must not have two competing sources of truth.
- [ ] Document the collection schema, stable IDs, required composite indexes and membership/author security rules in the database team's workspace. Do not add database assumptions to screen components.

## 2. Authentication lifecycle

- [ ] Implement/retain register, login, GET/PATCH /auth/me and the agreed `{token,user}` response.
- [ ] Choose either Firebase ID-token Bearer verification with a login/token exchange bridge, or a verified backend session. Publish the token audience, expiry and refresh/revocation behavior. A mock token must never be accepted by production.
- [ ] Add a frontend auth-service integration for Firebase token refresh before rollout if using Firebase ID tokens. The present session facade stores the issued token and signs out on protected HTTP 401; it does not include an automatic Firebase refresh implementation.
- [ ] Verify Firebase ID tokens/server sessions on every protected request and Socket.io connection. Revalidate room membership when joining/reconnecting.
- [ ] Implement proposed POST /auth/forgot-password and POST /auth/change-password, with rate limiting, generic reset messages and current-credential reauthentication. Frontend UI exists; the existing backend does not supply them.
- [ ] Agree whether password change immediately revokes other sessions; clear the current client session when the user continues to sign in again. Do not return secret provider credentials.
- [ ] Ensure sign-out removes native SecureStore/web session storage and disconnects subscriptions. Confirm that a 401 never changes the data source to mock.

## 3. Data contracts

- [ ] Serve cities and the original 80 Da Lat attraction IDs with unchanged source coordinates; preserve the existing Vung Tau catalogue. Supply `geographyVerified`, source URLs and nullable visitor facts.
- [ ] Confirm city/destination filtering query names, domain casing (INDOOR/OUTDOOR, etc.), timestamps with offsets and Vietnamese local trip dates.
- [ ] Return bare domain JSON values; do not introduce an envelope without adapting the shared client once. Preserve `Plan.engine` and `demo` provenance independently.
- [ ] Keep membership, wishlist, members, currentPlan and plan history in GET /groups/:id. Return `myVote` for the authenticated user, not another user's ballot.
- [ ] Enforce per-user group preferences; aggregate them server-side for recommendations. Categories in DiscoveryInput use the existing NATURE/CULTURE/ENTERTAINMENT/FOOD_CAFES enum; saved member categories use catalogue category names.
- [ ] Enforce one group/city for wishlist and plan locations, and exactly one valid target for comments. Enforce comment ownership on update/delete.
- [ ] Make additions idempotent and protect group updates with `expectedRevision`; return 409 on conflicts instead of hiding them.
- [ ] Validate recommendation/planner output before returning it. Never label rule fallback as LLM or simulated facts as live weather. Source all privileged AI/provider work from the backend.

## 4. Voting and realtime

- [ ] Persist the eligible voter snapshot, unique `(planId,userId)` ballot, deadline, basePlanId, required majority and proposal status.
- [ ] Atomically apply a plan only when it has the required YES majority and its base revision/current plan is still valid. Reject expired/stale votes and unauthorized voters. Make competing proposals stale when the official plan changes.
- [ ] Emit the existing group/wishlist/comment/plan/weather/alert/notification/activity event names listed in the contract. Filter events and personal notifications by authenticated membership/identity.
- [ ] Implement `group:join` acknowledgement and `group:leave`; ensure token or membership changes cannot leave an unauthorized listener active.
- [ ] Test disconnect/reconnect and rejoin. REST refetch is required after reconnect; missed events are not replayed by assumption.
- [ ] Keep ephemeral typing events separate from persisted comments. The frontend expires them and removes listeners/timers on disposal.

## 5. Weather and maps

- [ ] Supply WeatherSummary `slots`, provider status, provenance, timestamps and nullable metrics; distinguish current observations from future forecasts. The existing UI displays forecast context rather than claiming local current observations.
- [ ] Do not convert missing sources to zero rain or average source votes into a calibrated probability. Provide per-source probabilities and suitability explanations.
- [ ] Supply historical radar frames, safe RainViewer host/path metadata, attribution and coverage information. Missing radar must remain a clear unavailable state.
- [ ] Store GPS rain reports only with user consent and backend validation. Do not include simulated reports/alerts in real accuracy statistics.
- [ ] Provide weather alerts and indoor change proposals without silently editing approved plans. Confirm source/coverage constraints for Vietnam.
- [ ] Configure a restricted native Google Maps key during prebuild/build and test a keyed Android runtime. No key is needed for the bundled Leaflet frontend; OSM basemap tiles require network access.

## 6. Verification and handover

- [ ] Run frontend typecheck, unit/adapter tests and the zero-backend mock browser journey.
- [ ] Set EXPO_PUBLIC_DATA_SOURCE=api and EXPO_PUBLIC_API_URL, restart Expo and log in using real integration credentials.
- [ ] Run the documented complete journey against the real API and Firebase project. Verify error, no-data, expired-session, permission-denied, stale-revision and provider-failure states.
- [ ] Open two users on separate devices and verify actual group changes, notifications, voting and reconnect recovery. A local mock persona switch is not multi-device testing.
- [ ] Build a fresh Android APK from the final source, inspect signing and transport configuration, install on a connected device/emulator and test navigation, keyboard, safe areas, permissions, Maps credentials and offline recovery. Record physical-device testing separately.
- [ ] Review light-theme layouts on narrow Android sizes; check source imagery licensing and real visitor information. Optional dark theme and push notifications are separate enhancements.
- [ ] Update PHASE3_REPORT.md with real API/runtime results; retain any unresolved backend/provider limitations explicitly.
