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
