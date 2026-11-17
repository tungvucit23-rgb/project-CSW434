import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  BackHandler,
  ImageBackground,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  SafeAreaView,
  Share,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Switch,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import type { ConnectionState, DataSubscription } from './src/api/contracts/adapter';
import type { ActionResult, MockScenario } from './src/api/contracts/adapter';
import { scenarioOptions } from './src/api/mocks/fixtures';
import { Skeleton } from './src/components/common/Skeleton';
import { WeatherChart } from './src/components/weather/WeatherChart';
import { resolveRoute } from './src/navigation/routeModel';
import { validTripDate } from './src/utils/validation';
import {
  apiUrl,
  DEFAULT_API_URL,
  request,
  setApiUrl,
  storage,
  dataSource,
  developmentControls,
  mockScenario,
  setDataSource,
  setMockScenario,
  subscribeData,
  onSessionExpired,
} from "./src/api";
import {
  Activity,
  Alert,
  City,
  Comment,
  Group,
  GroupDetail,
  Notification,
  Plan,
  Place,
  RadarData,
  Route,
  RouteName,
  User,
  Verification,
  WeatherSummary,
} from "./src/types";
import {
  Avatar,
  Button,
  C,
  Card,
  date,
  Empty,
  hour,
  Icon,
  Input,
  MenuRow,
  money,
  Notice,
  Photo,
  Pill,
  Row,
  Section,
  Txt,
  U,
} from "./src/ui";
import RadarMap from "./src/RadarMap";
import MapExplorer from "./src/map/MapExplorer";
import TravelMap from "./src/map/TravelMap";
import { PlaceCover, PlaceFacts, feeText } from "./src/map/PlaceFacts";
import { WeatherInsight } from "./src/map/WeatherInsight";
import { mappable, weatherForTrip } from "./src/map/model";
import ItineraryExplorer from './src/ai/ItineraryExplorer';
import { useCatalog } from './src/map/useCatalog';
import { useForecast } from './src/map/useForecast';
import { environmentOptions, styleOptions } from './src/ai/options';

const heroImage =
  "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1600&q=85";
const titles: Record<RouteName, string> = {
  login: "Chào bạn, người đồng hành!",
  register: "Bắt đầu hành trình",
  forgotPassword: "Tìm lại tài khoản của bạn",
  changePassword: "Đổi mật khẩu",
  groupPreferences: "Sở thích của nhóm",
  alerts: "Cảnh báo thời tiết",
  notificationDetail: "Chi tiết thông báo",
  home: "Một chuyến đi, nhiều niềm vui.",
  groups: "Những chuyến đi của bạn",
  createGroup: "Tạo chuyến đi mới",
  joinGroup: "Tham gia chuyến đi",
  dashboard: "Chuyến đi của chúng mình",
  members: "Những người đồng hành",
  invite: "Rủ nhau đi thôi",
  discover: "Đi đâu cũng có điều hay",
  map: "Khám phá trên bản đồ",
  recommendations: "Gợi ý chuyến đi phù hợp",
  itineraryMap: "Lịch trình trên bản đồ",
  filters: "Tìm điểm đến phù hợp",
  placeDetail: "Một điểm dừng đáng nhớ",
  wishlist: "Danh sách muốn đi",
  timeline: "Lịch trình chung",
  planItem: "Chi tiết điểm dừng",
  proposal: "Phương án cho cả nhóm",
  vote: "Cùng nhau quyết định",
  history: "Các phiên bản lịch trình",
  weather: "Đi theo nhịp thời tiết",
  hourly: "Thời tiết từng giờ",
  providers: "Dữ liệu đến từ đâu?",
  radar: "Theo dõi những cơn mưa",
  rainReport: "Thời tiết ở chỗ bạn",
  verification: "Kiểm chứng dự báo",
  notifications: "Có tin mới cho bạn",
  budget: "Ngân sách chuyến đi",
  activity: "Nhật ký nhóm",
  aiSetup: "Trợ lý lập lịch",
  profile: "Góc của bạn",
  editProfile: "Chỉnh sửa hồ sơ",
  settings: "Cài đặt ứng dụng",
  help: "Đi Chung cùng bạn",
};
const routeNames = Object.keys(titles) as RouteName[];
const fullMapRoute = (name: RouteName) => ['map', 'recommendations', 'itineraryMap'].includes(name);
type TypingUser = {
  userId: string;
  userName: string;
  placeId?: string;
  planId?: string;
  expiresAt: number;
};
type ContextValue = {
  token: string | null;
  user: User | null;
  route: Route;
  go: (name: RouteName, id?: string) => void;
  back: () => void;
  groups: Group[];
  cities: City[];
  detail: GroupDetail | null;
  selectedId: string | null;
  selectGroup: (id: string) => void;
  refresh: () => void;
  revision: number;
  loading: boolean;
  error: string;
  busy: string | null;
  connected: boolean;
  run: (key: string, fn: () => Promise<void>) => Promise<void>;
  notify: (text: string) => void;
  authenticate: (result: { token: string; user: User }) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (u: User) => void;
  socket: DataSubscription | null;
  typing: TypingUser[];
  notifications: Notification[];
};
const AppContext = createContext<ContextValue>(null as unknown as ContextValue);
const useApp = () => useContext(AppContext);
function useResource<T>(path: string | null) {
  const { token, revision } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!!path && !!token);
  const previousPath = useRef<string | null>(null);
  useEffect(() => {
    if (!path || !token) {
      setData(null);
      return;
    }
    if (previousPath.current !== path) {
      setData(null);
      previousPath.current = path;
    }
    let active = true;
    setLoading(true);
    setError("");
    const controller = new AbortController();
    request<T>(path, token, 'GET', undefined, 45000, controller.signal)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [path, token, revision]);
  return { data, error, loading };
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [route, setRoute] = useState<Route>({ name: "login" });
  const [history, setHistory] = useState<Route[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [revision, setRevision] = useState(0);
  const [booting, setBooting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const busyLock = useRef(false);
  const [toast, setToast] = useState("");
  const [connected, setConnected] = useState(false);
  const [socket, setSocket] = useState<DataSubscription | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [typing, setTyping] = useState<TypingUser[]>([]);
  const scroll = useRef<ScrollView>(null);
  const { width } = useWindowDimensions();
  const desktop = width >= 1050;
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  const go = useCallback(
    (name: RouteName, id?: string) => {
      setHistory((h) => [...h, route]);
      setRoute({ name, id });
      if (Platform.OS === "web")
        window.history.pushState(
          { diChungHistory: [...history, route] },
          "",
          `#/${name}${id ? `/${encodeURIComponent(id)}` : ""}`,
        );
      scroll.current?.scrollTo({ y: 0, animated: false });
    },
    [route, history],
  );
  const back = () => {
    const previous = history[history.length - 1];
    if (Platform.OS === 'web' && previous) { window.history.back(); return; }
    if (previous) {
      setRoute(previous);
      setHistory((h) => h.slice(0, -1));
      if (Platform.OS === "web")
        window.history.replaceState(
          null,
          "",
          `#/${previous.name}${previous.id ? `/${encodeURIComponent(previous.id)}` : ""}`,
        );
    } else go(token ? "home" : "login");
  };
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const restore = () => {
      setRoute(resolveRoute(window.location.hash, !!token, routeNames));
      const trail = window.history.state?.diChungHistory;
      setHistory(Array.isArray(trail) ? trail.filter((r: Route) => routeNames.includes(r.name)) : []);
    };
    window.addEventListener('popstate', restore); window.addEventListener('hashchange', restore);
    return () => { window.removeEventListener('popstate', restore); window.removeEventListener('hashchange', restore); };
  }, [token]);
  useEffect(() => {
    if (Platform.OS === "web") return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!history.length && ["home", "login"].includes(route.name))
        return false;
      back();
      return true;
    });
    return () => listener.remove();
  }, [history, route, token]);
  const notify = (text: string) => {
    setToast(text);
  };
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 6500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const run = async (key: string, fn: () => Promise<void>) => {
    if (busyLock.current) { notify('Một thao tác đang xử lý. Vui lòng chờ hoàn tất.'); return; }
    busyLock.current = true;
    setBusy(key);
    setError("");
    try {
      await fn();
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "Có lỗi xảy ra. Vui lòng thử lại.",
      );
    } finally {
      busyLock.current = false;
      setBusy(null);
    }
  };
  const authenticate = async (result: { token: string; user: User }) => {
    await storage.set("di-chung-token", result.token);
    setToken(result.token);
    setUser(result.user);
    setGroups([]);
    setSelectedId(null);
    setNotifications([]);
    setCities([]);
    setError('');
    setDetail(null);
    setRoute({ name: "home" });
    if (Platform.OS === "web") window.history.replaceState(null, "", "#/home");
    setHistory([]);
    refresh();
  };
  const logout = async () => {
    await storage.remove("di-chung-token");
    setToken(null);
    setUser(null);
    setDetail(null);
    setGroups([]);
    setSelectedId(null);
    setNotifications([]);
    setCities([]);
    setError('');
    setRoute({ name: "login" });
    if (Platform.OS === "web") window.history.replaceState(null, "", "#/login");
    setHistory([]);
  };
  useEffect(() => {
    (async () => {
      try {
      const savedSource = developmentControls ? await storage.get('di-chung-source') : null;
      if (savedSource === 'mock' || savedSource === 'api') setDataSource(savedSource);
      const savedUrl = await storage.get("di-chung-api");
      if (savedUrl) { try { setApiUrl(savedUrl); } catch { await storage.remove('di-chung-api'); } }
      const saved = await storage.get("di-chung-token");
      if (!saved && Platform.OS === 'web') setRoute(resolveRoute(window.location.hash, false, routeNames));
      if (saved) {
        try {
          const u = await request<User>("/auth/me", saved);
          setToken(saved);
          setUser(u);
          setRoute(Platform.OS === 'web' ? resolveRoute(window.location.hash, true, routeNames) : { name: 'home' });
        } catch (e) {
          setToast(
            e instanceof Error ? e.message : "Không thể khôi phục phiên.",
          );
        }
      }
      } finally { setBooting(false); }
    })();
  }, []);
  useEffect(() => onSessionExpired(() => { void logout(); notify('Phiên đã hết hạn. Vui lòng đăng nhập lại.'); }), []);
  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoading(true);
    Promise.all([
      request<Group[]>("/groups", token),
      request<City[]>("/cities", token),
      request<Notification[]>("/notifications", token),
    ])
      .then(([g, c, n]) => {
        if (!active) return;
        setGroups(g);
        setCities(c);
        setNotifications(n);
        setSelectedId((id) =>
          id && g.some((x) => x.id === id) ? id : g[0]?.id || null,
        );
        setError("");
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, revision]);
  useEffect(() => {
    if (!token || !selectedId) {
      setDetail(null);
      return;
    }
    let active = true;
    request<GroupDetail>(`/groups/${selectedId}`, token)
      .then((result) => {
        if (active) setDetail(result);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [token, selectedId, revision]);
  useEffect(() => {
    if (!token) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const client = subscribeData({ token, groupId: selectedId,
      onStatus: state => { setConnectionState(state); setConnected(state === 'connected' || state === 'local'); },
      onEvent: event => {
        if (event.name === 'comment:typing') {
          const e = event.payload as TypingUser & { typing: boolean };
          if (!e || e.userId === user?.id) return;
          setTyping(list => {
            const remaining = list.filter(x => !(x.userId === e.userId && x.placeId === e.placeId && x.planId === e.planId));
            return e.typing ? [...remaining, { ...e, expiresAt: Date.now() + 4000 }] : remaining;
          });
          return;
        }
        if (timer) clearTimeout(timer);
        timer = setTimeout(refresh, 180);
      },
    });
    setSocket(client);
    const typingExpiry = setInterval(() => setTyping(list => {
      const active = list.filter(x => x.expiresAt > Date.now());
      return active.length === list.length ? list : active;
    }), 1000);
    return () => { if (timer) clearTimeout(timer); clearInterval(typingExpiry); client.close(); setSocket(null); setTyping([]); setConnected(false); };
  }, [token, selectedId, refresh]);
  const ctx: ContextValue = {
    token,
    user,
    route,
    go,
    back,
    groups,
    cities,
    detail,
    selectedId,
    selectGroup: (id) => {
      setDetail(null);
      setSelectedId(id);
    },
    refresh,
    revision,
    loading,
    error,
    busy,
    connected,
    run,
    notify,
    authenticate,
    logout,
    updateUser: setUser,
    socket,
    typing,
    notifications,
  };
  if (booting)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: C.bg,
          alignItems: "center",
          justifyContent: "center",
          gap: 15,
        }}
      >
        <Brand />
        <ActivityIndicator color={C.green} />
        <Txt color={C.muted}>Chuẩn bị hành trình của bạn…</Txt>
      </View>
    );
  return (
    <AppContext.Provider value={ctx}>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, flexDirection: "row", paddingTop: Platform.OS === "android" ? NativeStatusBar.currentHeight || 24 : 0, paddingBottom: Platform.OS === "android" ? 18 : 0 }}>
        {token && desktop && !fullMapRoute(route.name) && <Sidebar />}
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, minWidth: 0 }}>
          {token && !fullMapRoute(route.name) && (
            <View style={[S.topbar, { paddingHorizontal: desktop ? 36 : 20 }]}>
              {!desktop ? (
                <Brand compact />
              ) : (
                <Row>
                  <Txt color={C.muted} size={12}>
                    Không cần đi thật xa.
                  </Txt>
                  <Txt color={C.green} size={12} bold>
                    Chỉ cần đi cùng nhau.
                  </Txt>
                </Row>
              )}
              <Row>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Thông báo"
                  onPress={() => go("notifications")}
                  style={{ padding: 5 }}
                >
                  <Icon name="notifications-outline" size={21} />
                  {notifications.some((n) => !n.readAt) && (
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 4,
                        backgroundColor: "#E7A358",
                        position: "absolute",
                        right: 5,
                        top: 4,
                      }}
                    />
                  )}
                </Pressable>
                <Pressable
                  onPress={() => go("profile")}
                  accessibilityRole="button"
                  accessibilityLabel="Hồ sơ"
                >
                  <Avatar
                    name={user?.name || "Bạn"}
                    color={user?.avatarColor}
                  />
                </Pressable>
                {desktop && (
                  <Txt size={12} bold>
                    {user?.name}
                  </Txt>
                )}
              </Row>
            </View>
          )}
          {dataSource === 'mock' && <View accessibilityRole="text" style={{ paddingHorizontal: 16, paddingVertical: 7, backgroundColor: C.yellow }}><Txt size={11} color={C.amber}>DEMO · Dữ liệu mô phỏng · Chỉ lưu trong phiên này, không đồng bộ nhiều thiết bị</Txt></View>}
          {token && fullMapRoute(route.name) ? <Screen /> : <ScrollView
            ref={scroll}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={
              token
                ? {
                    padding: desktop ? 34 : 20,
                    paddingBottom: desktop ? 45 : 105,
                    maxWidth: 1300,
                    width: "100%",
                    alignSelf: "center",
                  }
                : { flexGrow: 1 }
            }
            refreshControl={
              token ? (
                <RefreshControl
                  refreshing={loading}
                  onRefresh={refresh}
                  tintColor={C.green}
                />
              ) : undefined
            }
          >
            {token && (
              <>
                <Row
                  style={{ marginBottom: 20, justifyContent: "space-between" }}
                >
                  <View style={{ flex: 1 }}>
                    <Row style={{ marginBottom: 4 }}>
                      {!["home", "groups"].includes(route.name) && (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Quay lại"
                          onPress={back}
                          style={{ marginRight: 3 }}
                        >
                          <Icon name="arrow-back" size={20} />
                        </Pressable>
                      )}
                      <Txt size={11} color={C.muted}>
                        ĐI CHUNG /{" "}
                        {route.name === "home"
                          ? "TỔNG QUAN"
                          : titles[route.name].toLocaleUpperCase("vi-VN")}
                      </Txt>
                    </Row>
                    <Txt size={width < 600 ? 24 : 29} bold color={C.ink}>
                      {titles[route.name]}
                    </Txt>
                  </View>
                  {detail?.group.mode === "DEMO" && (
                    <Pill tone="amber">DEMO</Pill>
                  )}
                </Row>
                {!connected && dataSource === "api" && (
                  <View style={{ marginBottom: 14 }}>
                    <Notice warning>
                      {connectionState === 'reconnecting' ? 'Đang kết nối lại với nhóm. Dữ liệu sẽ tải lại khi kết nối phục hồi.' : 'Đang kết nối realtime. Kéo để tải lại.'}
                    </Notice>
                  </View>
                )}
                {error && (
                  <View style={{ marginBottom: 14 }}>
                    <Notice warning>{error}</Notice>
                    <Button
                      variant="ghost"
                      label="Thử kết nối lại"
                      onPress={refresh}
                    />
                  </View>
                )}
              </>
            )}
            <Screen />
          </ScrollView>}
          {token && !desktop && !fullMapRoute(route.name) && <BottomNav />}
          {toast !== "" && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng thông báo"
              onPress={() => setToast("")}
              style={{
                position: "absolute",
                bottom: token && !desktop ? 88 : 24,
                left: 18,
                right: 18,
                maxWidth: 720,
                alignSelf: "center",
                backgroundColor: C.ink,
                borderRadius: 13,
                padding: 16,
                zIndex: 50,
              }}
            >
              <Txt color="white" size={13}>
                {toast}
              </Txt>
            </Pressable>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </AppContext.Provider>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Row style={{ gap: 8 }}>
      <View
        style={{
          width: compact ? 30 : 39,
          height: compact ? 30 : 39,
          borderRadius: 12,
          backgroundColor: C.green,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon
          name="trail-sign-outline"
          color="white"
          size={compact ? 18 : 24}
        />
      </View>
      <Txt size={compact ? 20 : 26} color={C.ink} bold>
        đi chung
        <Txt color={C.green} bold size={25}>
          .
        </Txt>
      </Txt>
    </Row>
  );
}
const nav: {
  name: RouteName;
  title: string;
  icon: React.ComponentProps<typeof Icon>["name"];
}[] = [
  { name: "home", title: "Tổng quan", icon: "grid-outline" },
  { name: "groups", title: "Chuyến đi của tôi", icon: "people-outline" },
  { name: "discover", title: "Khám phá địa điểm", icon: "compass-outline" },
  { name: "timeline", title: "Lịch trình chung", icon: "calendar-outline" },
  { name: "weather", title: "Thời tiết & radar", icon: "partly-sunny-outline" },
];
function Sidebar() {
  const { route, go, user, connected, selectedId, groups } = useApp();
  return (
    <View style={S.sidebar}>
      <Brand />
      <View style={{ marginTop: 45, gap: 7 }}>
        <Txt
          size={10}
          bold
          color={C.muted}
          style={{ marginBottom: 9, paddingLeft: 13, letterSpacing: 1.5 }}
        >
          CHUYẾN ĐI CỦA BẠN
        </Txt>
        {nav.map((item) => (
          <Pressable
            key={item.name}
            accessibilityRole="button"
            onPress={() => go(item.name)}
            style={[
              S.navItem,
              route.name === item.name && { backgroundColor: C.pale },
            ]}
          >
            <Icon
              name={item.icon}
              size={20}
              color={route.name === item.name ? C.green : C.muted}
            />
            <Txt
              bold={route.name === item.name}
              color={route.name === item.name ? C.green : C.muted}
              size={13}
            >
              {item.title}
            </Txt>
          </Pressable>
        ))}
      </View>
      <View
        style={{
          marginTop: 30,
          padding: 15,
          borderRadius: 14,
          backgroundColor: "#F2F5EB",
          gap: 9,
        }}
      >
        <Row>
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: connected ? "#64A982" : "#D8AA59",
            }}
          />
          <Txt size={11} color={C.muted}>
            {connected ? "Đồng bộ realtime" : "Đang kết nối"}
          </Txt>
        </Row>
        <Txt size={13} bold>
          {groups.find((g) => g.id === selectedId)?.name ||
            "Chưa chọn chuyến đi"}
        </Txt>
        <Pressable onPress={() => go("members")}>
          <Txt size={11} color={C.green}>
            Xem nhóm đồng hành →
          </Txt>
        </Pressable>
      </View>
      <View style={{ flex: 1, minHeight: 30 }} />
      <Card
        style={{
          padding: 15,
          backgroundColor: "#E8F0E2",
          borderWidth: 0,
          gap: 9,
        }}
      >
        <Icon name="sparkles-outline" />
        <Txt size={13} bold>
          Một chút linh hoạt,{"\n"}nhiều hơn trải nghiệm.
        </Txt>
        <Txt size={11} color={C.muted}>
          Lên lịch cùng trợ lý và để cả nhóm quyết định.
        </Txt>
        <Pressable onPress={() => go("aiSetup")}>
          <Txt size={11} bold color={C.green}>
            Khám phá trợ lý ↗
          </Txt>
        </Pressable>
      </Card>
      <View style={{ marginTop: 18 }}>
        <MenuRow
          title="Cài đặt"
          icon="settings-outline"
          onPress={() => go("settings")}
        />
        <MenuRow
          title="Trợ giúp"
          icon="help-circle-outline"
          onPress={() => go("help")}
        />
      </View>
      <Row style={{ marginTop: 20 }}>
        <Avatar
          name={user?.name || "Bạn"}
          color={user?.avatarColor}
          size={31}
        />
        <Txt size={11} color={C.muted}>
          Chúc bạn một chuyến đi vui.
        </Txt>
      </Row>
    </View>
  );
}
function BottomNav() {
  const { route, go } = useApp();
  return (
    <View style={S.bottom}>
      {nav.map((n) => (
        <Pressable
          key={n.name}
          onPress={() => go(n.name)}
          accessibilityRole="button"
          accessibilityLabel={n.title}
          style={{ flex: 1, alignItems: "center", gap: 4 }}
        >
          <Icon
            name={n.icon}
            color={route.name === n.name ? C.green : C.muted}
            size={22}
          />
          <Txt size={9} color={route.name === n.name ? C.green : C.muted}>
            {
              (
                {
                  home: "Tổng quan",
                  groups: "Chuyến đi",
                  discover: "Khám phá",
                  timeline: "Lịch trình",
                  weather: "Thời tiết",
                } as Record<string, string>
              )[n.name]
            }
          </Txt>
        </Pressable>
      ))}
    </View>
  );
}
function NeedGroup({ children }: { children: React.ReactNode }) {
  const { detail, selectedId, go, loading } = useApp();
  if (!detail)
    return selectedId ? (
      <View style={{ padding: 30, alignItems: "center", gap: 15 }}>
        <ActivityIndicator color={C.green} />
        <Txt color={C.muted}>Đang tải chuyến đi…</Txt>
      </View>
    ) : (
      <Empty
        title="Chuyến đi đang đợi bạn"
        text="Tạo nhóm hoặc nhập mã mời để cùng lên lịch, bình luận và biểu quyết."
        action="Tạo chuyến đi"
        onAction={() => go("createGroup")}
        icon="people-outline"
      />
    );
  return <>{children}</>;
}
function ResourceState({
  loading,
  error,
}: {
  loading: boolean;
  error: string;
}) {
  const { refresh } = useApp();
  return error ? (
    <View style={U.stack}>
      <Notice warning>{error}</Notice>
      <Button label="Thử lại" onPress={refresh} variant="secondary" />
    </View>
  ) : loading ? (
    <Skeleton />
  ) : null;
}
function Screen() {
  const { route } = useApp();
  switch (route.name) {
    case "login":
    case "register":
      return <AuthScreen />;
    case "forgotPassword":
    case "changePassword":
      return <PasswordScreen />;
    case "groupPreferences":
      return <NeedGroup><PreferencesPanel /></NeedGroup>;
    case "alerts":
      return <NeedGroup><AlertsScreen /></NeedGroup>;
    case "notificationDetail":
      return <NotificationDetailScreen />;
    case "home":
      return <HomeScreen />;
    case "groups":
      return <GroupsScreen />;
    case "createGroup":
    case "joinGroup":
      return <GroupFormScreen />;
    case "dashboard":
      return (
        <NeedGroup>
          <DashboardScreen />
        </NeedGroup>
      );
    case "members":
    case "invite":
      return (
        <NeedGroup>
          <MembersScreen />
        </NeedGroup>
      );
    case "discover":
    case "filters":
      return <DiscoverScreen />;
    case "map":
    case "recommendations":
      return <TravelScreen />;
    case "itineraryMap":
      return <ItineraryScreen />;
    case "placeDetail":
      return <PlaceScreen />;
    case "wishlist":
      return (
        <NeedGroup>
          <WishlistScreen />
        </NeedGroup>
      );
    case "timeline":
    case "history":
    case "planItem":
      return (
        <NeedGroup>
          <TimelineScreen />
        </NeedGroup>
      );
    case "proposal":
    case "vote":
      return (
        <NeedGroup>
          <ProposalScreen />
        </NeedGroup>
      );
    case "weather":
    case "hourly":
    case "providers":
      return (
        <NeedGroup>
          <WeatherScreen />
        </NeedGroup>
      );
    case "radar":
      return <RadarScreen />;
    case "rainReport":
      return (
        <NeedGroup>
          <RainReportScreen />
        </NeedGroup>
      );
    case "verification":
      return (
        <NeedGroup>
          <VerificationScreen />
        </NeedGroup>
      );
    case "notifications":
      return <NotificationsScreen />;
    case "budget":
      return (
        <NeedGroup>
          <BudgetScreen />
        </NeedGroup>
      );
    case "activity":
      return (
        <NeedGroup>
          <ActivityScreen />
        </NeedGroup>
      );
    case "aiSetup":
      return (
        <NeedGroup>
          <AISetupScreen />
        </NeedGroup>
      );
    case "profile":
    case "editProfile":
      return <ProfileScreen />;
    case "settings":
      return <SettingsScreen />;
    case "help":
      return <HelpScreen />;
  }
}

function AuthScreen() {
  const { route, go, run, busy, authenticate } = useApp();
  const register = route.name === "register";
  const { width } = useWindowDimensions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [url, setUrl] = useState(apiUrl);
  const [showApi, setShowApi] = useState(false);
  const submit = () =>
    run("auth", async () => {
      if (
        !email.includes("@") ||
        password.length < 8 ||
        (register && name.trim().length < 2)
      )
        throw new Error(
          "Nhập email hợp lệ, mật khẩu ít nhất 8 ký tự và tên ít nhất 2 ký tự.",
        );
      await authenticate(
        await request(
          "/auth/" + (register ? "register" : "login"),
          null,
          "POST",
          { email, password, name },
        ),
      );
    });
  return (
    <View
      style={{
        flex: 1,
        flexDirection: width > 900 ? "row" : "column",
        minHeight: width > 900 ? 850 : undefined,
      }}
    >
      <View
        style={{
          flex: 1,
          padding: width > 900 ? 55 : 25,
          justifyContent: "center",
          maxWidth: 640,
          alignSelf: "center",
          width: "100%",
        }}
      >
        <Brand />
        <View style={{ height: 44 }} />
        <Pill>CÙNG NHAU ĐI, CÙNG NHAU CHỌN</Pill>
        <Txt size={36} bold color={C.ink} style={{ marginTop: 17 }}>
          {register
            ? "Chuyến đi đẹp nhất\nlà chuyến đi cùng nhau."
            : "Những hành trình vui,\nbắt đầu từ đây."}
        </Txt>
        <Txt color={C.muted} style={{ marginVertical: 18 }}>
          Lên lịch du lịch nhóm, theo dõi thời tiết và dành nhiều thời gian hơn
          cho những điều bạn yêu.
        </Txt>
        <View style={U.stack}>
          {register && (
            <Input
              label="Tên của bạn"
              value={name}
              onChange={setName}
              placeholder="Bạn muốn mọi người gọi là gì?"
            />
          )}
          <Input
            label="Email"
            value={email}
            onChange={setEmail}
            placeholder="ban@email.com"
          />
          <Input
            label="Mật khẩu"
            value={password}
            onChange={setPassword}
            secure
            placeholder="Ít nhất 8 ký tự"
          />
          <Button
            label={register ? "Tạo tài khoản" : "Đăng nhập"}
            icon="arrow-forward"
            onPress={submit}
            loading={busy === "auth"}
          />
          {!register && <Button label="Quên mật khẩu?" variant="ghost" onPress={() => go('forgotPassword')} />}
          {developmentControls && <DeveloperDataControls onChanged={() => go('login')} />}
          <Pressable onPress={() => go(register ? "login" : "register")}>
            <Txt size={13} style={{ textAlign: "center" }} color={C.green}>
              {register
                ? "Đã có tài khoản? Đăng nhập"
                : "Chưa có tài khoản? Đăng ký"}
            </Txt>
          </Pressable>
          <View
            style={{ height: 1, backgroundColor: C.line, marginVertical: 7 }}
          />
          <Row>
            <Pill tone="amber">DEMO</Pill>
            <Txt size={12} color={C.muted}>
              Trải nghiệm ngay, không cần đăng ký
            </Txt>
          </Row>
          <Button
            label="Khám phá chuyến đi mẫu"
            icon="sparkles-outline"
            variant="secondary"
            onPress={() =>
              run("demo", async () =>
                authenticate(
                  await request("/auth/demo", null, "POST", {
                    persona: "leader",
                  }),
                ),
              )
            }
            loading={busy === "demo"}
          />
          <Txt size={11} color={C.muted}>
            Dữ liệu thời tiết mẫu được gắn nhãn DEMO. Bộ lập lịch theo quy tắc
            hoạt động khi chưa có khóa LLM.
          </Txt>
          <Pressable onPress={() => setShowApi((v) => !v)}>
            <Txt size={11} color={C.muted}>
              ⚙ Kết nối máy chủ / chạy trên điện thoại
            </Txt>
          </Pressable>
          {showApi && (
            <Card style={U.stack}>
              <Input
                label="Địa chỉ backend (IP LAN nếu dùng điện thoại)"
                value={url}
                onChange={setUrl}
                placeholder="http://192.168.1.10:4000"
              />
              <Button
                label="Lưu địa chỉ API"
                onPress={() =>
                  run("url", async () => {
                    if (!/^https?:\/\//.test(url))
                      throw new Error(
                        "Địa chỉ phải bắt đầu bằng http:// hoặc https://",
                      );
                    setApiUrl(url);
                    await storage.set("di-chung-api", apiUrl);
                  })
                }
                variant="secondary"
              />
            </Card>
          )}
        </View>
      </View>
      {width > 900 && (
        <ImageBackground
          source={{ uri: heroImage }}
          style={{
            flex: 1,
            margin: 18,
            borderRadius: 26,
            overflow: "hidden",
            backgroundColor: C.green,
            justifyContent: "flex-end",
            minHeight: 800,
          }}
        >
          <View style={{ backgroundColor: "#102D2590", padding: 45, gap: 15 }}>
            <Pill tone="amber">ĐI CHẬM MỘT CHÚT, VUI NHIỀU MỘT CHÚT</Pill>
            <Txt color="white" size={40} bold>
              {"Đón nắng cùng nhau.\nTrú mưa cũng cùng nhau."}
            </Txt>
            <Txt color="#E6ECE2" size={15}>
              Lịch trình linh hoạt theo thời tiết. Mỗi thay đổi đều có tiếng nói
              của cả nhóm.
            </Txt>
            <Row>
              <Icon name="location-outline" color="white" size={18} />
              <Txt color="white" size={12}>
                Đà Lạt · Vũng Tàu · Và những kỷ niệm mới
              </Txt>
            </Row>
          </View>
        </ImageBackground>
      )}
    </View>
  );
}

function HomeScreen() {
  const { user, detail, go, groups, selectGroup, connected } = useApp();
  const { width } = useWindowDimensions();
  const { data: weather } = useResource<WeatherSummary>(
    detail
      ? `/groups/${detail.group.id}/weather?mode=${detail.group.mode.toLowerCase()}`
      : null,
  );
  const pending = detail?.plans.filter((p) => p.status === "VOTING") || [];
  return (
    <View style={U.stack}>
      <Row style={{ justifyContent: "space-between" }}>
        <Txt color={C.muted}>
          Chào {user?.name.split(" ").slice(-1)[0]}, sẵn sàng cho một ngày thật
          vui?
        </Txt>
        {width > 700 && (
          <Button
            label="Tạo chuyến đi"
            icon="add"
            variant="secondary"
            onPress={() => go("createGroup")}
          />
        )}
      </Row>
      <ImageBackground
        source={{ uri: heroImage }}
        style={{
          borderRadius: 22,
          overflow: "hidden",
          backgroundColor: "#425F3F",
          minHeight: width < 650 ? 260 : 295,
        }}
        resizeMode="cover"
      >
        <View
          style={{
            padding: width < 650 ? 25 : 34,
            backgroundColor: "#153A2D65",
            flex: 1,
            justifyContent: "center",
            alignItems: "flex-start",
            gap: 11,
          }}
        >
          <Pill tone="amber">
            MANG THEO NIỀM VUI, ĐỂ LỊCH TRÌNH CHO ĐI CHUNG
          </Pill>
          <Txt color="white" size={width < 650 ? 30 : 38} bold>
            {"Đi cùng nhau,\nngày nào cũng đẹp."}
          </Txt>
          <Txt color="#EDF4E9" size={13} style={{ maxWidth: 390 }}>
            Một lịch trình chung. Những điểm đến yêu thích. Và một chút linh
            hoạt khi trời trở mưa.
          </Txt>
          <Button
            label={detail ? "Mở chuyến đi của nhóm" : "Bắt đầu lên lịch"}
            icon="arrow-forward"
            onPress={() => go(detail ? "dashboard" : "createGroup")}
            style={{ backgroundColor: "white", marginTop: 5 }}
            variant="secondary"
          />
        </View>
      </ImageBackground>
      <Card style={{ gap: 10, backgroundColor: C.pale }}>
        <Row><Icon name="compass-outline" size={27} /><View style={{ flex: 1 }}><Txt size={19} bold>Điểm đến ở ngay trên bản đồ</Txt><Txt size={12} color={C.muted}>Chạm vào một điểm, tìm hiểu thời tiết và lưu cùng nhóm.</Txt></View></Row>
        <Button label="Khám phá điểm đến trên bản đồ" icon="map-outline" onPress={() => go("map", `city:${detail?.group.cityId || "dalat"}`)} />
        <Row style={{ flexWrap: 'wrap' }}><Button label="Tìm điểm phù hợp với bạn" icon="sparkles-outline" variant="secondary" onPress={() => go('recommendations', `city:${detail?.group.cityId || 'dalat'}`)} /><Button label="Lập lịch thông minh" icon="calendar-outline" variant="secondary" onPress={() => go('aiSetup')} /></Row>
      </Card>
      <View style={U.grid}>
        {[
          {
            icon: "people-outline",
            value: `${groups.length}`,
            label: "chuyến đi của bạn",
            route: "groups",
          },
          {
            icon: "heart-outline",
            value: `${detail?.wishlist.length || 0}`,
            label: "địa điểm muốn đi",
            route: "wishlist",
          },
          {
            icon: "calendar-outline",
            value: `${detail?.currentPlan?.items.length || 0}`,
            label: "điểm trong lịch trình",
            route: "timeline",
          },
          {
            icon: "hand-left-outline",
            value: `${pending.length}`,
            label: "đề xuất đang chờ vote",
            route: "history",
          },
        ].map((stat) => (
          <Card
            key={stat.label}
            style={{ minWidth: 140, flex: 1, padding: 18 }}
            onPress={() => go(stat.route as RouteName)}
          >
            <Row>
              <View style={U.iconCircle}>
                <Icon
                  name={stat.icon as React.ComponentProps<typeof Icon>["name"]}
                />
              </View>
              <Txt bold size={26}>
                {stat.value}
              </Txt>
            </Row>
            <Txt size={11} color={C.muted} style={{ marginTop: 10 }}>
              {stat.label}
            </Txt>
          </Card>
        ))}
      </View>
      <View style={[U.grid, { alignItems: "flex-start" }]}>
        <View style={{ flex: 1.6, minWidth: Math.min(width - 40, 310) }}>
          <Section
            title="Chuyến đi sắp tới"
            action="Tất cả"
            onAction={() => go("groups")}
          />
          {groups.length ? (
            groups.slice(0, 2).map((g) => (
              <GroupCard
                key={g.id}
                group={g}
                onPress={() => {
                  selectGroup(g.id);
                  go("dashboard");
                }}
              />
            ))
          ) : (
            <Empty
              title="Lên đường cùng nhau nhé?"
              text="Tạo chuyến đi đầu tiên hoặc tham gia bằng mã mời."
              action="Tạo nhóm mới"
              onAction={() => go("createGroup")}
            />
          )}
        </View>
        <View style={{ flex: 1, minWidth: Math.min(width - 40, 270) }}>
          <Section
            title="Dự báo theo chuyến đi"
            action="Chi tiết"
            onAction={() => go("weather")}
          />
          <Card style={{ gap: 14, backgroundColor: "#EDF3E8" }}>
            <Row style={{ justifyContent: "space-between" }}>
              <View>
                <Txt bold>{detail?.group.cityName || "Chọn chuyến đi"}</Txt>
                <Txt color={C.muted} size={11}>
                  {detail
                    ? date(detail.group.tripDate)
                    : "Thời tiết theo thành phố"}
                </Txt>
              </View>
              <Icon name="partly-sunny-outline" size={39} color="#B9994D" />
            </Row>
            {weather ? (
              <>
                <Txt size={14} bold>
                  {weather.rainWindows.length
                    ? "Có khung giờ có nguy cơ mưa"
                    : "Chưa ghi nhận khung mưa đồng thuận"}
                </Txt>
                <Txt size={12} color={C.muted}>
                  {weather.confidenceText}
                </Txt>
                <Row>
                  {weather.demo && <Pill tone="amber">DEMO</Pill>}
                  <Pill>
                    {weather.providers.filter((p) => p.status === "OK").length}/
                    {weather.providers.length} nguồn khả dụng
                  </Pill>
                </Row>
              </>
            ) : (
              <Txt size={12} color={C.muted}>
                Chọn một chuyến đi để xem dự báo và các nguồn dữ liệu.
              </Txt>
            )}
            <Button
              label="Xem bản đồ radar"
              icon="map-outline"
              variant="ghost"
              onPress={() => go("radar")}
            />
          </Card>
        </View>
      </View>
      {pending.length > 0 && (
        <Card style={{ backgroundColor: "#FFF8E9", borderColor: "#F1DFB5" }}>
          <Row>
            <Icon name="sparkles-outline" color={C.amber} />
            <View style={{ flex: 1 }}>
              <Txt bold>Nhóm đang đợi ý kiến của bạn</Txt>
              <Txt color={C.muted} size={12}>
                {pending[0].summary}
              </Txt>
            </View>
            <Button
              label="Xem đề xuất"
              variant="secondary"
              onPress={() => go("proposal", pending[0].id)}
            />
          </Row>
        </Card>
      )}
      <Notice>
        {dataSource === 'mock' ? 'DEMO · Thay đổi chỉ áp dụng trong phiên mẫu này; không có đồng bộ nhiều thiết bị.' : connected
          ? "Mọi thay đổi lịch trình, bình luận và phiếu bầu được đồng bộ đến nhóm."
          : "Đang thiết lập kết nối realtime với nhóm."}{" "}
        Thay đổi lịch luôn cần biểu quyết.
      </Notice>
    </View>
  );
}
function GroupCard({ group, onPress }: { group: Group; onPress: () => void }) {
  return (
    <Card style={{ marginBottom: 12, padding: 15 }} onPress={onPress}>
      <Row style={{ alignItems: "stretch" }}>
        <Photo
          uri={
            group.cityId === "dalat"
              ? "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=350&q=75"
              : "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=350&q=75"
          }
          height={103}
          style={{ width: 110 }}
        />
        <View style={{ flex: 1, paddingVertical: 2, gap: 7 }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Pill>{group.cityName}</Pill>
            {group.mode === "DEMO" && <Pill tone="amber">DEMO</Pill>}
          </Row>
          <Txt bold size={16}>
            {group.name}
          </Txt>
          <Row>
            <Icon name="calendar-outline" size={13} color={C.muted} />
            <Txt size={11} color={C.muted}>
              {date(group.tripDate)} · {group.memberCount} người
            </Txt>
          </Row>
          <Txt size={11} color={C.green}>
            {group.currentPlanId
              ? "Đã có lịch trình chung"
              : "Cùng nhau lên lịch"}{" "}
            →
          </Txt>
        </View>
      </Row>
    </Card>
  );
}
function GroupsScreen() {
  const { groups, go, selectGroup, loading } = useApp();
  return (
    <View style={U.stack}>
      <Row>
        <Button
          label="Tạo chuyến đi"
          icon="add"
          onPress={() => go("createGroup")}
        />
        <Button
          label="Nhập mã mời"
          icon="key-outline"
          variant="secondary"
          onPress={() => go("joinGroup")}
        />
      </Row>
      {!groups.length && !loading && (
        <Empty
          title="Chưa có chuyến đi nào"
          text="Rủ bạn bè cùng khám phá Đà Lạt hoặc Vũng Tàu trong một ngày."
        />
      )}
      {groups.map((g) => (
        <GroupCard
          key={g.id}
          group={g}
          onPress={() => {
            selectGroup(g.id);
            go("dashboard");
          }}
        />
      ))}
    </View>
  );
}
function GroupFormScreen() {
  const { route, token, cities, run, busy, refresh, selectGroup, go } =
    useApp();
  const [name, setName] = useState("");
  const [cityId, setCityId] = useState("dalat");
  const [tripDate, setTripDate] = useState(
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }),
  );
  const [budget, setBudget] = useState("500000");
  const [start, setStart] = useState("8");
  const [end, setEnd] = useState("20");
  const [code, setCode] = useState("");
  const [demo, setDemo] = useState(true);
  const submit = () =>
    run("group-form", async () => {
      if (
        route.name === "createGroup" &&
        (!name.trim() ||
          !validTripDate(tripDate) ||
          !Number.isFinite(+budget) ||
          +budget <= 0 ||
          +start >= +end ||
          +start < 0 ||
          +end > 24)
      )
        throw new Error(
          "Kiểm tra tên nhóm, ngày YYYY-MM-DD, ngân sách dương và giờ bắt đầu/kết thúc.",
        );
      const group = await request<Group>(
        route.name === "joinGroup" ? "/groups/join" : "/groups",
        token,
        "POST",
        route.name === "joinGroup"
          ? { code: code.trim().toUpperCase() }
          : {
              name,
              cityId,
              tripDate,
              startHour: +start,
              endHour: +end,
              budgetPerPersonVnd: +budget,
              mode: demo ? "DEMO" : "LIVE",
            },
      );
      refresh();
      selectGroup(group.id);
      go("dashboard");
    });
  return (
    <Card style={[U.stack, { maxWidth: 650 }]}>
      {route.name === "joinGroup" ? (
        <>
          <Icon name="ticket-outline" size={40} />
          <Txt size={21} bold>
            Một mã mời, cả nhóm bên nhau.
          </Txt>
          <Input
            label="Mã mời của nhóm"
            value={code}
            onChange={setCode}
            placeholder="Ví dụ: DICHUNG"
          />
          <Button
            label="Tham gia nhóm"
            onPress={submit}
            loading={busy === "group-form"}
          />
        </>
      ) : (
        <>
          <Input
            label="Tên chuyến đi"
            value={name}
            onChange={setName}
            placeholder="Một ngày trốn phố cùng nhau"
          />
          <Txt bold size={12}>
            Thành phố
          </Txt>
          <Row>
            {cities.map((c) => (
              <Button
                key={c.id}
                label={c.name}
                onPress={() => setCityId(c.id)}
                variant={cityId === c.id ? "primary" : "secondary"}
              />
            ))}
          </Row>
          <Input
            label="Ngày đi (YYYY-MM-DD)"
            value={tripDate}
            onChange={setTripDate}
            placeholder="2026-10-18"
          />
          <Row>
            <Input
              label="Bắt đầu (giờ)"
              value={start}
              onChange={setStart}
              numeric
            />
            <Input
              label="Kết thúc (giờ)"
              value={end}
              onChange={setEnd}
              numeric
            />
          </Row>
          <Input
            label="Ngân sách mỗi người (VND)"
            value={budget}
            onChange={setBudget}
            numeric
          />
          <Row style={{ justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Txt bold>Dùng thời tiết DEMO</Txt>
              <Txt size={11} color={C.muted}>
                Dữ liệu giả lập được ghi rõ và tách thống kê thật.
              </Txt>
            </View>
            <Switch
              value={demo}
              onValueChange={setDemo}
              trackColor={{ true: C.green }}
            />
          </Row>
          <Notice>
            Chế độ LIVE chỉ dùng dữ liệu API thật. Nguồn chưa cấu hình sẽ hiện
            thiếu dữ liệu.
          </Notice>
          <Button
            label="Tạo chuyến đi"
            icon="arrow-forward"
            onPress={submit}
            loading={busy === "group-form"}
          />
        </>
      )}
    </Card>
  );
}

function DashboardScreen() {
  const { detail, go, token, run, busy, refresh } = useApp();
  if (!detail) return null;
  const { group, members, wishlist, currentPlan, plans } = detail;
  const pending = plans.find((p) => p.status === "VOTING");
  return (
    <View style={U.stack}>
      <Card style={{ backgroundColor: "#EAF1E5", gap: 15 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Pill>{group.cityName}</Pill>
          <Pill tone="muted">
            {group.role === "LEADER" ? "TRƯỞNG NHÓM" : "THÀNH VIÊN"}
          </Pill>
        </Row>
        <Txt size={27} bold>
          {group.name}
        </Txt>
        <Row style={{ flexWrap: "wrap" }}>
          <Icon name="calendar-outline" size={17} />
          <Txt>
            {date(group.tripDate)} · {group.startHour}:00–{group.endHour}:00
          </Txt>
          <Txt color={C.muted}>|</Txt>
          <Txt>{money(group.budgetPerPersonVnd)}/người</Txt>
        </Row>
        <Row>
          {members.slice(0, 6).map((m) => (
            <Avatar key={m.id} name={m.name} color={m.avatarColor} />
          ))}
          <Txt color={C.muted} size={12}>
            {members.length} người đồng hành
          </Txt>
        </Row>
        <Row style={{ flexWrap: "wrap" }}>
          <Button
            label="Xem lịch trình"
            icon="calendar-outline"
            onPress={() => go("timeline")}
          />
          <Button
            label="Mời bạn bè"
            icon="person-add-outline"
            variant="secondary"
            onPress={() => go("invite")}
          />
          <Button label="Bản đồ chuyến đi" icon="map-outline" variant="secondary" onPress={() => go("map", `city:${group.cityId}`)} />
          <Button label="Tạo lịch thông minh" icon="sparkles-outline" variant="secondary" onPress={() => go('aiSetup')} />
        </Row>
      </Card>
      {pending && (
        <Card style={{ backgroundColor: "#FFF8E9", gap: 10 }}>
          <Row>
            <Icon name="hand-left-outline" color={C.amber} />
            <Txt bold>Đề xuất đang chờ nhóm biểu quyết</Txt>
          </Row>
          <Txt size={13}>{pending.summary}</Txt>
          <Txt color={C.muted} size={12}>
            {pending.yesVotes}/{pending.requiredYesVotes} phiếu đồng ý cần thiết
          </Txt>
          <Button
            label="Xem và biểu quyết"
            onPress={() => go("proposal", pending.id)}
            variant="secondary"
          />
        </Card>
      )}
      <Section title="Mọi thứ cho chuyến đi" />
      <Card>
        <MenuRow
          title="Những người đồng hành"
          text={`${members.length} thành viên · phân quyền trưởng nhóm/thành viên`}
          icon="people-outline"
          onPress={() => go("members")}
        />
        <MenuRow title="Sở thích của nhóm" text="Lưu hoạt động, phong cách và không gian bạn thích" icon="options-outline" onPress={() => go('groupPreferences')} />
        <MenuRow
          title="Danh sách muốn đi"
          text={`${wishlist.length} điểm đến được cả nhóm góp ý`}
          icon="heart-outline"
          onPress={() => go("wishlist")}
        />
        <MenuRow
          title="Ngân sách chung"
          text={`${currentPlan ? money(currentPlan.totalCostVnd) : "Chưa có lịch"} / người trong lịch hiện tại`}
          icon="wallet-outline"
          onPress={() => go("budget")}
        />
        <MenuRow
          title="Theo dõi thời tiết"
          text="Dự báo nhiều nguồn, radar và phản hồi tại chỗ"
          icon="partly-sunny-outline"
          onPress={() => go("weather")}
        />
        <MenuRow
          title="Nhật ký thay đổi"
          text="Ai đã thêm điểm, sửa nhóm hoặc biểu quyết?"
          icon="time-outline"
          onPress={() => go("activity")}
        />
        <MenuRow
          title="Trợ lý lập lịch"
          text="Đề xuất lịch mới từ danh sách của nhóm"
          icon="sparkles-outline"
          onPress={() => go("aiSetup")}
        />
      </Card>
      {group.mode === "DEMO" && group.role === "LEADER" && (
        <Card style={U.stack}>
          <Row>
            <Pill tone="amber">DEMO</Pill>
            <Txt bold>Thử tình huống sắp mưa</Txt>
          </Row>
          <Txt size={12} color={C.muted}>
            Tạo cảnh báo và phương án để nhóm bỏ phiếu. Lịch chính thức chưa
            thay đổi cho đến khi đủ đa số.
          </Txt>
          <Button
            label="Giả lập mưa"
            icon="rainy-outline"
            variant="secondary"
            loading={busy === "demo-rain"}
            onPress={() =>
              run("demo-rain", async () => {
                const result = await request<{ proposal: Plan | null }>(
                  `/groups/${group.id}/demo/rain`,
                  token,
                  "POST",
                );
                refresh();
                if (result.proposal) go("proposal", result.proposal.id);
              })
            }
          />
        </Card>
      )}
    </View>
  );
}

function MembersScreen() {
  const { detail, route, go, notify } = useApp();
  if (!detail) return null;
  return (
    <View style={U.stack}>
      {route.name === "invite" ? (
        <Card
          style={{
            paddingVertical: 35,
            alignItems: "center",
            gap: 17,
            maxWidth: 650,
          }}
        >
          <Icon name="ticket-outline" size={45} />
          <Txt size={22} bold>
            Chuyến đi vui hơn khi có bạn.
          </Txt>
          <Txt color={C.muted} size={13} style={{ textAlign: "center" }}>
            Gửi mã này cho bạn bè. Trong ứng dụng, chọn Chuyến đi → Nhập mã mời.
          </Txt>
          <View
            style={{
              paddingHorizontal: 30,
              paddingVertical: 17,
              backgroundColor: C.pale,
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: "#98B39A",
              borderRadius: 13,
            }}
          >
            <Txt selectable size={30} bold color={C.green} style={{ letterSpacing: 4 }}>
              {detail.group.inviteCode}
            </Txt>
          </View>
          <Button
            label={Platform.OS === 'web' ? 'Sao chép mã mời' : 'Chia sẻ mã mời'}
            icon="copy-outline"
            onPress={() => {
              if (Platform.OS === "web" && window.navigator.clipboard)
                window.navigator.clipboard
                  .writeText(detail.group.inviteCode)
                  .then(() => notify("Đã sao chép mã mời."))
                  .catch(() => notify(`Mã mời: ${detail.group.inviteCode}`));
              else if (Platform.OS !== 'web') void Share.share({ message: `Cùng tham gia ${detail.group.name} trên Đi Chung. Mã mời: ${detail.group.inviteCode}` }).catch(() => notify('Chưa chia sẻ được. Bạn có thể nhấn giữ mã để sao chép.'));
              else notify(`Mã mời: ${detail.group.inviteCode} — nhấn giữ để sao chép.`);
            }}
          />
          <Notice>
            Mã mời cấp quyền thành viên. Chỉ chia sẻ với người bạn muốn tham gia
            nhóm.
          </Notice>
        </Card>
      ) : (
        <>
          <Row style={{ justifyContent: "space-between" }}>
            <Txt color={C.muted}>
              {detail.members.length} người trong chuyến đi
            </Txt>
            <Button
              label="Mời thành viên"
              icon="person-add-outline"
              onPress={() => go("invite")}
            />
          </Row>
          {detail.members.map((m) => (
            <Card key={m.id}>
              <Row>
                <Avatar name={m.name} color={m.avatarColor} size={47} />
                <View style={{ flex: 1 }}>
                  <Txt bold>{m.name}</Txt>
                  <Txt size={12} color={C.muted}>
                    {m.email}
                  </Txt>
                </View>
                <Pill tone={m.role === "LEADER" ? "green" : "muted"}>
                  {m.role === "LEADER" ? "Trưởng nhóm" : "Thành viên"}
                </Pill>
              </Row>
            </Card>
          ))}
          <Notice>
            Mọi thành viên có thể thêm địa điểm, bình luận và bỏ phiếu. Trưởng
            nhóm tạo phương án và quản lý thông tin chuyến đi.
          </Notice>
        </>
      )}
    </View>
  );
}

function TravelScreen() {
  const { token, cities, route, detail, go, back, run, busy, refresh, notify, revision, error: appError } = useApp();
  const cityRoute = route.id?.startsWith("city:") ? route.id.slice(5) : undefined;
  const focus = useResource<Place>(!cityRoute && route.id ? `/places/${encodeURIComponent(route.id)}` : null);
  const cityId = cityRoute || focus.data?.cityId;
  const city = cities.find(c => c.id === cityId);
  if (!cities.length && appError) return <View style={{ padding: 24, gap: 12 }}><Notice warning>{appError}</Notice><Button label="Tải lại thành phố" onPress={refresh} /><Button label="Quay lại" variant="secondary" onPress={back} /></View>;
  if ((!cityRoute && !focus.data && focus.loading) || (!cities.length && !focus.error)) return <View style={{ padding: 32 }}><ActivityIndicator color={C.green} /><Button label="Quay lại" onPress={back} variant="ghost" /></View>;
  if (!city) return <View style={{ padding: 24, gap: 12 }}><Notice warning>{focus.error || "Không tìm thấy thành phố của điểm đến. Hãy chọn lại từ Khám phá."}</Notice><Button label="Thử lại" onPress={refresh} /><Button label="Quay lại khám phá" onPress={() => go("discover")} variant="secondary" /></View>;
  if (!cityRoute && focus.data && !mappable(focus.data)) return <View style={{ padding: 24, gap: 12 }}><Empty title="Chưa thể định vị điểm này" text={`${focus.data.name} chưa có tọa độ được đối chiếu. Đi Chung giữ thông tin cũ để bảo toàn lịch trình; chưa thể chọn marker cho điểm này.`} action="Khám phá thành phố" onAction={() => go("map", `city:${city.id}`)} /><Button label="Quay lại" onPress={back} variant="secondary" /></View>;
  return <MapExplorer key={city.id} city={city} cities={cities} token={token} detail={detail} focus={focus.data} onRefresh={refresh} openRecommendations={route.name === 'recommendations'} onCity={id => go('recommendations', `city:${id}`)} onPlanner={ids => {
    if (detail && detail.group.cityId !== city.id) { notify('Chọn hoặc tạo nhóm cùng thành phố trước khi lập lịch từ các điểm này.'); go('groups'); return; }
    go('aiSetup', ids.length ? ids.join(',') : undefined);
  }} onBack={back} onDetails={id => go("placeDetail", id)} busy={busy} revision={revision} onAdd={p => run(`map-wish-${p.id}`, async () => {
    if (!detail) throw new Error("Tạo hoặc chọn nhóm trước khi thêm điểm đến.");
    if (detail.group.cityId !== p.cityId) throw new Error("Hãy chọn nhóm có cùng thành phố với điểm đến.");
    await request(`/groups/${detail.group.id}/wishlist`, token, "POST", { placeId: p.id });
    refresh(); notify("Đã thêm điểm đến vào danh sách của cả nhóm.");
  })} />;
}

function ItineraryScreen() {
  const { route, token, cities, selectedId, selectGroup, back, go, refresh } = useApp();
  const resource = useResource<Plan>(route.id ? `/plans/${encodeURIComponent(route.id)}` : null);
  const plan = resource.data;
  useEffect(() => { if (plan && selectedId !== plan.groupId) selectGroup(plan.groupId); }, [plan?.groupId, selectedId]);
  const forecast = useForecast(plan ? `/groups/${plan.groupId}/weather?mode=${plan.demo ? 'demo' : 'live'}` : null, token, plan?.tripContext?.tripDate || '');
  if (!plan) return <View style={{ padding: 24, gap: 12 }}><ResourceState loading={resource.loading} error={resource.error} /><Button label="Quay lại" onPress={back} variant="secondary" /></View>;
  const city = cities.find(c => c.id === plan.tripContext?.cityId);
  if (!city) return <View style={{ padding: 24, gap: 12 }}><Notice warning>Chưa tải được thành phố của phiên bản lịch trình.</Notice><Button label="Tải lại" onPress={refresh} /><Button label="Quay lại" onPress={back} variant="secondary" /></View>;
  return <ItineraryExplorer key={plan.id} plan={plan} city={city} weather={forecast.data} weatherError={forecast.error} onBack={back} onDetails={id => go('placeDetail', id)} onReview={() => go('proposal', plan.id)} onRetryWeather={forecast.retry} />;
}

function DiscoverScreen() {
  const { token, cities, detail, route, go, run, busy, refresh, notify } =
    useApp();
  const [cityId, setCityId] = useState(detail?.group.cityId || "dalat");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(12);
  useEffect(() => { const timer = setTimeout(() => setDebouncedQuery(query), 250); return () => clearTimeout(timer); }, [query]);
  const [environment, setEnvironment] = useState("");
  const [category, setCategory] = useState("");
  useEffect(() => setVisibleCount(12), [cityId, debouncedQuery, environment, category]);
  const { width } = useWindowDimensions();
  const {
    data: places,
    loading,
    error,
  } = useResource<Place[]>(
    `/places?cityId=${cityId}&q=${encodeURIComponent(debouncedQuery)}${environment ? `&environment=${environment}` : ""}${category ? `&category=${encodeURIComponent(category)}` : ""}`,
  );
  const wishIds = new Set(detail?.wishlist.map((p) => p.id));
  const add = (place: Place) =>
    run(`wish-${place.id}`, async () => {
      if (!detail)
        throw new Error("Tạo hoặc tham gia nhóm trước khi thêm địa điểm.");
      if (detail.group.cityId !== place.cityId)
        throw new Error("Điểm đến phải cùng thành phố với chuyến đi của nhóm.");
      await request(`/groups/${detail.group.id}/wishlist`, token, "POST", {
        placeId: place.id,
      });
      refresh();
      notify("Đã thêm vào danh sách muốn đi của nhóm.");
    });
  if (route.name === "filters")
    return (
      <Card style={[U.stack, { maxWidth: 700 }]}>
        <Txt bold>Không gian tham quan</Txt>
        <Row style={{ flexWrap: "wrap" }}>
          {[
            ["", "Tất cả"],
            ["INDOOR", "Trong nhà"],
            ["OUTDOOR", "Ngoài trời"],
          ].map(([v, text]) => (
            <Button
              key={v}
              label={text}
              variant={environment === v ? "primary" : "secondary"}
              onPress={() => setEnvironment(v)}
            />
          ))}
        </Row>
        <Input
          label="Loại địa điểm"
          value={category}
          onChange={setCategory}
          placeholder="Nhập loại, ví dụ: cafe"
        />
        <Notice>
          Bộ lọc được áp dụng trực tiếp vào danh sách kết quả dưới đây. Chạm vào
          một điểm để xem chi tiết.
        </Notice>
        <Txt bold>{places?.length || 0} điểm phù hợp</Txt>
        <ResourceState loading={loading} error={error} />
        {places?.slice(0, 12).map((p) => (
          <MenuRow
            key={p.id}
            title={p.name}
            text={`${p.environment === "INDOOR" ? "Trong nhà" : "Ngoài trời"} · Vé: ${feeText(p)}`}
            icon="location-outline"
            onPress={() => go("placeDetail", p.id)}
          />
        ))}
      </Card>
    );
  return (
    <View style={U.stack}>
      <Section title="Chọn thành phố, mở hành trình" subtitle="Khám phá điểm đến trên bản đồ và lưu cùng nhóm của bạn." />
      <Row style={{ flexWrap: 'wrap' }}><Button label="Find My Perfect Trip" icon="sparkles-outline" onPress={() => go('recommendations', `city:${cityId}`)} /><Button label="Mở trợ lý lập lịch" variant="secondary" onPress={() => go('aiSetup')} /></Row>
      <View style={U.grid}>{cities.map(c => <View key={c.id} style={{ flex: 1, minWidth: 260 }}><Card onPress={() => go("map", `city:${c.id}`)} style={{ padding: 12, gap: 12 }}><Photo uri={c.imageUrl} height={155} /><Row style={{ justifyContent: "space-between" }}><View><Txt size={22} bold>{c.name}</Txt><Txt size={12} color={C.muted}>Ảnh minh họa · Mở bản đồ tương tác</Txt></View><Icon name="arrow-forward" /></Row><Button label={`Khám phá ${c.name} trên bản đồ`} icon="map-outline" onPress={() => go("map", `city:${c.id}`)} /></Card></View>)}</View>
      <Row style={{ flexWrap: "wrap" }}>
        {cities.map((c) => (
          <Button
            key={c.id}
            label={c.name}
            onPress={() => setCityId(c.id)}
            variant={cityId === c.id ? "primary" : "secondary"}
          />
        ))}
      </Row>
      <Row>
        <View style={{ flex: 1 }}>
          <Input
            label="Tìm nơi bạn muốn đến"
            value={query}
            onChange={setQuery}
            placeholder="Tên điểm đến, quán cà phê…"
          />
        </View>
        <Button
          label="Bộ lọc"
          icon="options-outline"
          variant="secondary"
          onPress={() => go("filters")}
          style={{ marginTop: 24 }}
        />
      </Row>
      <Row style={{ flexWrap: "wrap" }}>
        {[
          ["", "Tất cả"],
          ["OUTDOOR", "Ngoài trời"],
          ["INDOOR", "Trong nhà"],
        ].map(([v, text]) => (
          <Button
            key={v}
            label={text}
            onPress={() => setEnvironment(v)}
            variant={environment === v ? "primary" : "ghost"}
          />
        ))}
        <Txt size={12} color={C.muted}>
          {places?.length || 0} điểm đến
        </Txt>
      </Row>
      <Notice warning>
        Chỉ các điểm có tọa độ được đối chiếu mới xuất hiện trên bản đồ. Giá vé, giờ mở cửa chưa có nguồn sẽ hiển thị chưa có thông tin; phân loại trong/ngoài trời là ước tính.
      </Notice>
      <ResourceState loading={loading} error={error} />
      <View style={U.grid}>
        {places?.slice(0, visibleCount).map((p) => (
          <View
            key={p.id}
            style={{
              width: width >= 1300 ? "31.8%" : width >= 720 ? "47.5%" : "100%",
              flexGrow: 1,
              maxWidth: width >= 720 ? 450 : undefined,
            }}
          >
            <Card style={{ padding: 12, gap: 12 }}>
              <Pressable
                accessibilityRole="button"
                onPress={() => go("placeDetail", p.id)}
              >
                <PlaceCover place={p} height={150} />
              </Pressable>
              <Row style={{ justifyContent: "space-between" }}>
                <Pill tone={p.environment === "INDOOR" ? "blue" : "green"}>
                  {p.environment === "INDOOR" ? "Trong nhà" : "Ngoài trời"}
                </Pill>
                <Txt size={11} color={C.muted}>
                  {p.category}
                </Txt>
              </Row>
              <Pressable onPress={() => go("placeDetail", p.id)}>
                <Txt size={16} bold>
                  {p.name}
                </Txt>
              </Pressable>
              <Row style={{ justifyContent: "space-between" }}>
                <Txt size={12} color={C.muted}>
                  {p.visitorInfo?.openingHours || "Giờ mở cửa chưa có thông tin"}
                </Txt>
                <Txt bold size={13}>
                  {feeText(p)}
                </Txt>
              </Row>
              <Button
                label={
                  wishIds.has(p.id) ? "Đã trong danh sách" : "Thêm vào muốn đi"
                }
                icon={wishIds.has(p.id) ? "checkmark" : "add"}
                variant="secondary"
                disabled={wishIds.has(p.id)}
                loading={busy === `wish-${p.id}`}
                onPress={() => add(p)}
              />
            </Card>
          </View>
        ))}
      </View>
      {!!places && places.length > visibleCount && <Button label="Xem thêm điểm đến" variant="secondary" onPress={() => setVisibleCount(n => n + 12)} />}
      {places?.length === 0 && (
        <Empty
          title="Chưa tìm thấy điểm phù hợp"
          text="Thử một tên khác hoặc bỏ bộ lọc không gian."
        />
      )}
    </View>
  );
}

function PlaceScreen() {
  const { route, token, detail, cities, go, run, busy, refresh, notify } = useApp();
  const {
    data: place,
    loading,
    error,
  } = useResource<Place>(route.id ? `/places/${route.id}` : null);
  const weather = useResource<WeatherSummary>(detail && place && detail.group.cityId === place.cityId ? `/groups/${detail.group.id}/weather?mode=${detail.group.mode.toLowerCase()}` : null);
  if (!place) return <ResourceState loading={loading} error={error} />;
  const inWishlist = detail?.wishlist.some((p) => p.id === place.id);
  return (
    <View style={U.stack}>
      <PlaceCover place={place} height={260} />
      <Row style={{ justifyContent: "space-between" }}>
        <View>
          <Txt bold size={26}>
            {place.name}
          </Txt>
          <Txt size={13} color={C.muted}>
            {cities.find(c => c.id === place.cityId)?.name} · {place.category}
          </Txt>
        </View>
        <Pill>
          {place.environment === "INDOOR" ? "Trong nhà" : "Ngoài trời"}
        </Pill>
      </Row>
      <Txt>{place.description}</Txt>
      <PlaceFacts place={place} />
      <Section title="Thời tiết cho điểm dừng" subtitle="Dữ liệu theo ngày chuyến đi, tại tâm thành phố." />
      <WeatherInsight place={place} weather={weatherForTrip(weather.data, detail?.group)} />
      <ResourceState loading={weather.loading} error={weather.error} />
      {cities.find(c => c.id === place.cityId) && mappable(place) && <View style={{ height: 270, borderRadius: 20, overflow: "hidden" }}><TravelMap city={cities.find(c => c.id === place.cityId)!} places={[place]} selectedId={place.id} onSelect={() => go("map", place.id)} /></View>}
      <Button label={mappable(place) ? "Xem trên bản đồ" : "Tọa độ chưa được đối chiếu"} disabled={!mappable(place)} icon="map-outline" onPress={() => go("map", place.id)} />
      <Button label="Lập lịch với điểm này" icon="sparkles-outline" variant="secondary" disabled={!mappable(place)} onPress={() => { if (detail && detail.group.cityId !== place.cityId) { notify('Hãy chọn nhóm cùng thành phố để lập lịch với điểm đến này.'); go('groups'); return; } go('aiSetup', place.id); }} />
      <Notice warning>
        {place.dataQuality ||
          "Giờ mở cửa, giá và tọa độ là dữ liệu tham khảo chưa xác minh. Ảnh minh họa, kiểm tra lại trước khi đến."}
      </Notice>
      <Button
        label={
          inWishlist
            ? "Đã thêm vào danh sách muốn đi"
            : "Thêm vào danh sách của nhóm"
        }
        icon={inWishlist ? "checkmark" : "heart-outline"}
        disabled={inWishlist}
        loading={busy === "add-place"}
        onPress={() =>
          run("add-place", async () => {
            if (!detail)
              throw new Error("Hãy chọn hoặc tạo một chuyến đi trước.");
            if (detail.group.cityId !== place.cityId)
              throw new Error("Điểm đến phải cùng thành phố với nhóm được chọn.");
            await request(
              `/groups/${detail.group.id}/wishlist`,
              token,
              "POST",
              { placeId: place.id },
            );
            refresh();
            notify("Cả nhóm đã thấy điểm đến bạn vừa thêm.");
          })
        }
      />
      {detail && (inWishlist || detail.plans.some(plan => plan.items.some(item => item.placeId === place.id))) ? <CommentsPanel placeId={place.id} /> : <Notice>Thêm điểm đến vào wishlist của nhóm để bắt đầu thảo luận cùng những người đồng hành.</Notice>}
    </View>
  );
}

function WishlistScreen() {
  const { detail, token, go, run, busy, refresh } = useApp();
  if (!detail) return null;
  return (
    <View style={U.stack}>
      <Button label="Khám phá wishlist trên bản đồ" icon="map-outline" variant="secondary" onPress={() => go("map", `city:${detail.group.cityId}`)} />
      <Row style={{ justifyContent: "space-between" }}>
        <Txt color={C.muted}>
          {detail.wishlist.length} địa điểm · Cùng góp ý cho hành trình
        </Txt>
        <Button label="Thêm điểm" icon="add" onPress={() => go("discover")} />
      </Row>
      {detail.wishlist.length === 0 && (
        <Empty
          title="Nhóm muốn đi đâu?"
          text="Mỗi người thêm vài địa điểm yêu thích. Trợ lý sẽ sắp xếp từ danh sách này."
          action="Khám phá địa điểm"
          onAction={() => go("discover")}
        />
      )}
      {detail.wishlist.map((p) => (
        <Card key={p.id} style={{ padding: 14 }}>
          <Row>
            <Pressable onPress={() => go("placeDetail", p.id)}>
              <Photo uri={p.imageUrl} height={83} style={{ width: 92 }} />
            </Pressable>
            <Pressable
              onPress={() => go("placeDetail", p.id)}
              style={{ flex: 1 }}
            >
              <Txt bold>{p.name}</Txt>
              <Txt size={12} color={C.muted}>
                {p.environment === "INDOOR" ? "Trong nhà" : "Ngoài trời"} ·{" "}
                {p.category}
              </Txt>
              <Txt size={12} color={C.green}>
                Vé: {feeText(p)} · Bình luận →
              </Txt>
            </Pressable>
            <Button
              label="Bỏ"
              accessibilityLabel={`Bỏ ${p.name} khỏi danh sách`}
              variant="ghost"
              loading={busy === `remove-${p.id}`}
              onPress={() =>
                run(`remove-${p.id}`, async () => {
                  await request(
                    `/groups/${detail.group.id}/wishlist/${p.id}`,
                    token,
                    "DELETE",
                  );
                  refresh();
                })
              }
            />
          </Row>
        </Card>
      ))}
      {detail.wishlist.length > 0 && (
        <Button
          label="Sắp xếp thành lịch trình"
          icon="sparkles-outline"
          onPress={() => go("aiSetup")}
        />
      )}
    </View>
  );
}

function CommentsPanel({
  placeId,
  planId,
}: {
  placeId?: string;
  planId?: string;
}) {
  const { detail, user, token, run, busy, refresh, socket, typing } = useApp();
  const [content, setContent] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const query = placeId ? `placeId=${placeId}` : `planId=${planId}`;
  const { data, loading, error } = useResource<Comment[]>(
    detail ? `/groups/${detail.group.id}/comments?${query}` : null,
  );
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendTyping = (v: string) => {
    setContent(v);
    if (!detail) return;
    socket?.typing({
      placeId,
      planId,
      typing: !!v,
    });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(
      () =>
        socket?.typing({
          placeId,
          planId,
          typing: false,
        }),
      1500,
    );
  };
  const send = () =>
    run("comment", async () => {
      if (!detail || !content.trim())
        throw new Error("Bạn chưa nhập nội dung bình luận.");
      await request(
        editing
          ? `/comments/${editing}`
          : `/groups/${detail.group.id}/comments`,
        token,
        editing ? "PATCH" : "POST",
        editing
          ? { content: content.trim() }
          : { placeId, planId, content: content.trim() },
      );
      setContent("");
      setEditing(null);
      socket?.typing({
        placeId,
        planId,
        typing: false,
      });
      refresh();
    });
  useEffect(
    () => () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
    },
    [],
  );
  return (
    <View style={U.stack}>
      <Section
        title="Cùng nhóm bàn một chút"
        subtitle={dataSource === 'mock' ? 'DEMO · Bình luận trong phiên mẫu' : 'Bình luận theo điểm đến / đề xuất · đồng bộ realtime'}
      />
      <Card style={U.stack}>
        <ResourceState loading={loading && !data} error={error} />
        {!data?.length && !loading && (
          <Txt color={C.muted} size={13}>
            Chưa có bình luận. Bạn mở đầu câu chuyện nhé?
          </Txt>
        )}
        {data?.map((c) => (
          <View
            key={c.id}
            style={{
              borderBottomWidth: 1,
              borderBottomColor: C.line,
              paddingBottom: 15,
            }}
          >
            <Row style={{ alignItems: "flex-start" }}>
              <Avatar name={c.userName} color={c.avatarColor} size={32} />
              <View style={{ flex: 1 }}>
                <Row>
                  <Txt bold size={12}>
                    {c.userName}
                  </Txt>
                  <Txt size={10} color={C.muted}>
                    {hour(c.createdAt)}
                    {c.editedAt ? " · đã sửa" : ""}
                  </Txt>
                </Row>
                <Txt size={13}>{c.content}</Txt>
                {c.userId === user?.id && (
                  <Row style={{ marginTop: 5 }}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy === 'comment'}
                      onPress={() => {
                        setEditing(c.id);
                        setContent(c.content);
                      }}
                    >
                      <Txt size={10} color={C.green}>
                        Sửa
                      </Txt>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy === 'comment'}
                      onPress={() =>
                        run(`delete-${c.id}`, async () => {
                          await request(`/comments/${c.id}`, token, "DELETE");
                          refresh();
                        })
                      }
                    >
                      <Txt size={10} color={C.red}>
                        Xóa
                      </Txt>
                    </Pressable>
                  </Row>
                )}
              </View>
            </Row>
          </View>
        ))}
        {typing.some((t) => t.placeId === placeId && t.planId === planId) && (
          <Txt size={11} color={C.muted}>
            {typing
              .filter((t) => t.placeId === placeId && t.planId === planId)
              .map((t) => t.userName)
              .join(", ")}{" "}
            đang gõ…
          </Txt>
        )}
        <Input
          label={editing ? "Chỉnh sửa bình luận của bạn" : "Bình luận của bạn"}
          value={content}
          onChange={sendTyping}
          placeholder="Chia sẻ điều bạn nghĩ về điểm dừng này…"
          multiline
        />
        <Row>
          <Button
            label={editing ? "Lưu chỉnh sửa" : "Gửi bình luận"}
            icon="send-outline"
            onPress={send}
            loading={busy === "comment"}
            disabled={!content.trim()}
          />
          {editing && (
            <Button
              label="Hủy"
              variant="ghost"
              onPress={() => {
                setEditing(null);
                setContent("");
              }}
            />
          )}
        </Row>
      </Card>
    </View>
  );
}

function PlanLabel({ plan }: { plan: Plan }) {
  return (
    <Row style={{ flexWrap: "wrap" }}>
      {plan.demo && <Pill tone="amber">DEMO</Pill>}
      <Pill tone={plan.engine === "LLM" ? "green" : "muted"}>
        {plan.engine === "LLM"
          ? "LLM · Đã kiểm định"
          : "RULE_BASED · Theo quy tắc"}
      </Pill>
      <Pill
        tone={
          plan.status === "APPROVED"
            ? "green"
            : plan.status === "VOTING"
              ? "amber"
              : "muted"
        }
      >
        {
          (
            {
              APPROVED: "Đã thông qua",
              VOTING: "Đang biểu quyết",
              DRAFT: "Bản nháp",
              REJECTED: "Đã từ chối",
              EXPIRED: "Hết hạn",
              STALE: "Lịch gốc đã đổi",
            } as Record<string, string>
          )[plan.status]
        }
      </Pill>
    </Row>
  );
}
function TimelineScreen() {
  const { detail, route, go } = useApp();
  const [comparison, setComparison] = useState<string[]>([]);
  if (!detail) return null;
  const plan = detail.currentPlan;
  if (route.name === "history")
    return (
      <View style={U.stack}>
        <Notice>
          Lịch cũ được giữ lại. Đề xuất đang biểu quyết chưa phải lịch chính
          thức.
        </Notice>
        {detail.plans.length > 1 && <Card style={U.stack}><Txt bold size={18}>So sánh hai phương án</Txt><Txt size={12} color={C.muted}>Chọn tối đa hai phiên bản để so sánh thời gian, dự toán và các điểm dừng.</Txt><Row style={{ flexWrap: 'wrap' }}>{detail.plans.map(p => <Button key={p.id} label={`So sánh #${p.version}`} variant={comparison.includes(p.id) ? 'primary' : 'secondary'} disabled={!comparison.includes(p.id) && comparison.length === 2} onPress={() => setComparison(ids => ids.includes(p.id) ? ids.filter(id => id !== p.id) : [...ids, p.id])} />)}</Row>{comparison.length === 2 && <View style={U.grid}>{detail.plans.filter(p => comparison.includes(p.id)).map(p => <Card key={p.id} style={{ flex: 1, minWidth: 130, gap: 8, backgroundColor: C.bg }}><Txt bold>Phương án #{p.version}</Txt><PlanLabel plan={p} /><Txt size={12}>{p.items.length} điểm · {p.totalDurationMin ?? 0} phút</Txt><Txt size={12}>{money(p.totalCostVnd)}/người (dự toán)</Txt><Txt size={11} color={C.muted}>{p.unknownCostCount ?? p.items.length} điểm chưa có giá nguồn</Txt><Txt size={12}>{p.items.map(i => i.place.name).join(' → ')}</Txt><Button label={`Mở phương án #${p.version}`} variant="secondary" onPress={() => go('proposal', p.id)} /></Card>)}</View>}</Card>}
        {detail.plans.map((p) => (
          <Card key={p.id} style={U.stack} onPress={() => go("proposal", p.id)}>
            <Row style={{ justifyContent: "space-between" }}>
              <Txt bold size={18}>
                Phiên bản {p.version}
              </Txt>
              {p.id === detail.group.currentPlanId && <Pill>ĐANG ÁP DỤNG</Pill>}
            </Row>
            <PlanLabel plan={p} />
            <Txt size={13}>{p.summary}</Txt>
            <Txt size={12} color={C.muted}>
              {p.items.length} điểm · {money(p.totalCostVnd)}/người ·{" "}
              {p.yesVotes}/{p.eligibleCount} đồng ý
            </Txt>
          </Card>
        ))}
        {!detail.plans.length && (
          <Empty
            title="Chưa có phiên bản lịch"
            text="Thêm địa điểm vào muốn đi rồi dùng trợ lý để tạo phương án."
            action="Mở trợ lý"
            onAction={() => go("aiSetup")}
          />
        )}
      </View>
    );
  if (!plan)
    return (
      <Empty
        title="Cùng viết nên lịch trình đầu tiên"
        text="Chọn điểm muốn đi, tạo đề xuất và cùng nhau biểu quyết để chốt lịch."
        action="Tạo phương án"
        onAction={() => go("aiSetup")}
        icon="calendar-outline"
      />
    );
  if (route.name === "planItem") {
    const item = plan.items.find((x) => x.id === route.id);
    if (!item)
      return (
        <Empty
          title="Điểm dừng không còn trong lịch hiện tại"
          text="Nhóm có thể đã áp dụng phiên bản mới. Mở lại lịch để xem điểm dừng đang dùng."
          action="Xem lịch hiện tại"
          onAction={() => go("timeline")}
        />
      );
    return (
      <View style={U.stack}>
        <Photo uri={item.place.imageUrl} height={260} />
        <PlanLabel plan={plan} />
        <Txt size={26} bold>
          {item.place.name}
        </Txt>
        <Card style={U.stack}>
          <Row>
            <Icon name="time-outline" />
            <Txt bold>
              {hour(item.startTime)}–{hour(item.endTime)}
            </Txt>
            <Pill>
              {item.place.environment === "INDOOR" ? "Trong nhà" : "Ngoài trời"}
            </Pill>
          </Row>
          <Txt>{item.reason}</Txt>
          <Txt size={12} color={C.muted}>
            {item.travelMin} phút di chuyển ước tính từ điểm trước ·{" "}
            {money(item.costVnd)}/người
          </Txt>
          <Txt size={11} color={C.muted}>
            Dữ kiện tham chiếu:{" "}
            {item.factIds.length
              ? item.factIds.join(", ")
              : "Chưa có mã dữ kiện"}
          </Txt>
        </Card>
        <Button
          label="Xem thông tin địa điểm"
          icon="location-outline"
          variant="secondary"
          onPress={() => go("placeDetail", item.placeId)}
        />
        <Button label="Định vị điểm dừng trên bản đồ" icon="map-outline" variant="secondary" onPress={() => go("map", item.placeId)} />
        <CommentsPanel placeId={item.placeId} />
      </View>
    );
  }
  return (
    <View style={U.stack}>
      <Row style={{ flexWrap: "wrap", justifyContent: "space-between" }}>
        <View>
          <Txt bold size={19}>
            {detail.group.name}
          </Txt>
          <Txt size={12} color={C.muted}>
            {date(detail.group.tripDate)} · {plan.items.length} điểm dừng ·{" "}
            {money(plan.totalCostVnd)}/người
          </Txt>
        </View>
        <Button
          label="Các phiên bản"
          icon="layers-outline"
          variant="secondary"
          onPress={() => go("history")}
        />
      </Row>
      <PlanLabel plan={plan} />
      <Button label="Mở bản đồ thành phố" icon="map-outline" variant="secondary" onPress={() => go("map", `city:${detail.group.cityId}`)} />
      <Button label="Xem tuyến lịch trình trên bản đồ" icon="navigate-outline" onPress={() => go('itineraryMap', plan.id)} />
      <Notice>
        {plan.summary} Thời gian di chuyển là ước tính, không gồm giao thông
        thực tế.
      </Notice>
      {plan.items.map((item, index) => (
        <View key={item.id} style={{ flexDirection: "row", gap: 15 }}>
          <View style={{ width: 47, alignItems: "center" }}>
            <Txt size={12} bold>
              {hour(item.startTime)}
            </Txt>
            <View
              style={{
                width: 12,
                height: 12,
                backgroundColor: C.green,
                borderWidth: 3,
                borderColor: C.mint,
                borderRadius: 7,
                marginTop: 10,
              }}
            />
            <View
              style={{
                width: 2,
                flex: 1,
                backgroundColor: C.line,
                marginTop: 6,
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Card
              onPress={() => go("planItem", item.id)}
              style={{ padding: 15 }}
            >
              <Row>
                <Photo
                  uri={item.place.imageUrl}
                  height={88}
                  style={{ width: 90 }}
                />
                <View style={{ flex: 1, gap: 5 }}>
                  <Pill
                    tone={
                      item.place.environment === "OUTDOOR" ? "green" : "blue"
                    }
                  >
                    {item.place.environment === "OUTDOOR"
                      ? "Ngoài trời"
                      : "Trong nhà"}
                  </Pill>
                  <Txt bold size={16}>
                    {item.place.name}
                  </Txt>
                  <Txt size={11} color={C.muted}>
                    {hour(item.startTime)}–{hour(item.endTime)} ·{" "}
                    {money(item.costVnd)}
                  </Txt>
                </View>
                <Icon name="chevron-forward" size={16} />
              </Row>
              <Txt size={12} color={C.muted} style={{ marginTop: 11 }}>
                {item.reason}
              </Txt>
            </Card>
            {index < plan.items.length - 1 && (
              <Row style={{ paddingVertical: 10, paddingLeft: 12 }}>
                <Icon name="walk-outline" size={14} color={C.muted} />
                <Txt size={10} color={C.muted}>
                  Di chuyển đến điểm tiếp theo: khoảng{" "}
                  {plan.items[index + 1].travelMin} phút
                </Txt>
              </Row>
            )}
          </View>
        </View>
      ))}
      <Button
        label="Đề xuất lịch mới"
        icon="sparkles-outline"
        variant="secondary"
        onPress={() => go("aiSetup")}
      />
    </View>
  );
}

function ProposalScreen() {
  const { detail, route, token, run, busy, refresh, go, notify } = useApp();
  const {
    data: fetched,
    loading,
    error,
  } = useResource<Plan>(route.id ? `/plans/${route.id}` : null);
  const plan =
    fetched ||
    detail?.plans.find((p) => p.id === route.id) ||
    detail?.plans.find((p) => p.status === "VOTING");
  if (!plan)
    return loading ? (
      <ResourceState loading={loading} error={error} />
    ) : (
      <Empty
        title="Chưa có đề xuất để biểu quyết"
        text="Trưởng nhóm tạo một phương án từ danh sách muốn đi."
        action="Mở trợ lý"
        onAction={() => go("aiSetup")}
      />
    );
  const vote = (choice: "YES" | "NO") =>
    run("vote", async () => {
      const result = await request<Plan>(
        `/plans/${plan.id}/votes`,
        token,
        "POST",
        { choice },
      );
      refresh();
      notify(
        result.status === "APPROVED"
          ? "Nhóm đã đủ đa số. Lịch mới đã được áp dụng."
          : `Đã ghi nhận phiếu ${choice === "YES" ? "đồng ý" : "từ chối"} của bạn.`,
      );
    });
  return (
    <View style={U.stack}>
      <PlanLabel plan={plan} />
      <Button label="Xem phương án trên bản đồ" icon="navigate-outline" onPress={() => go('itineraryMap', plan.id)} />
      <Card style={U.stack}>
        <Txt size={23} bold>
          Phương án #{plan.version}
          {plan.kind === "RAIN_CHANGE"
            ? " · Điều chỉnh khi có nguy cơ mưa"
            : ""}
        </Txt>
        <Txt>{plan.summary}</Txt>
        <Row style={{ flexWrap: "wrap" }}>
          <Pill>{plan.items.length} điểm dừng</Pill>
          <Pill tone="muted">{money(plan.totalCostVnd)}/người</Pill>
          <Pill tone="muted">
            Cần {plan.requiredYesVotes}/{plan.eligibleCount} phiếu đồng ý
          </Pill>
        </Row>
      </Card>
      {route.name === "vote" ? (
        <Card style={U.stack}>
          <Txt bold size={20}>
            Bạn chọn phương án này chứ?
          </Txt>
          <Txt color={C.muted} size={13}>
            Đa số được tính trên toàn bộ {plan.eligibleCount} cử tri đã chốt khi
            mở biểu quyết. Không trả lời không được tính là đồng ý.
          </Txt>
          <Row>
            <View
              style={{
                flex: 1,
                backgroundColor: C.pale,
                padding: 20,
                borderRadius: 12,
              }}
            >
              <Txt size={29} bold color={C.green}>
                {plan.yesVotes}
              </Txt>
              <Txt size={12}>Đồng ý</Txt>
            </View>
            <View
              style={{
                flex: 1,
                backgroundColor: "#F7EDE6",
                padding: 20,
                borderRadius: 12,
              }}
            >
              <Txt size={29} bold color={C.red}>
                {plan.noVotes}
              </Txt>
              <Txt size={12}>Từ chối</Txt>
            </View>
          </Row>
          <View
            style={{
              height: 8,
              borderRadius: 6,
              backgroundColor: C.line,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${Math.min(100, (plan.yesVotes / Math.max(1, plan.requiredYesVotes)) * 100)}%`,
                height: "100%",
                backgroundColor: C.green,
              }}
            />
          </View>
          <Txt size={12} color={C.muted}>
            Hạn biểu quyết: {date(plan.deadline)} {hour(plan.deadline)}
          </Txt>
          {plan.myVote && (
            <Notice>
              Bạn đã chọn: {plan.myVote === "YES" ? "Đồng ý" : "Từ chối"}.
            </Notice>
          )}
          {plan.status === "VOTING" ? (
            <Row>
              <Button
                label="Đồng ý"
                icon="checkmark"
                onPress={() => vote("YES")}
                loading={busy === "vote"}
                style={{ flex: 1 }}
              />
              <Button
                label="Từ chối"
                icon="close"
                variant="secondary"
                onPress={() => vote("NO")}
                disabled={!!busy}
                style={{ flex: 1 }}
              />
            </Row>
          ) : (
            <Notice>
              Biểu quyết đã đóng: {plan.status}. Mở lịch chung để xem phiên bản
              đang áp dụng.
            </Notice>
          )}
          <Button
            label="Xem lịch đang áp dụng"
            variant="ghost"
            onPress={() => go("timeline")}
          />
        </Card>
      ) : (
        <>
          <Notice>
            Đây là phương án đề xuất. Lịch chính thức chỉ đổi sau khi đủ phiếu
            và phiên bản gốc vẫn còn hiệu lực.
          </Notice>
          {plan.items.map((i) => (
            <Card key={i.id} style={{ padding: 15 }}>
              <Row>
                <View style={{ width: 51 }}>
                  <Txt bold size={12}>
                    {hour(i.startTime)}
                  </Txt>
                  <Txt color={C.muted} size={10}>
                    {hour(i.endTime)}
                  </Txt>
                </View>
                <View style={{ flex: 1 }}>
                  <Txt bold>{i.place.name}</Txt>
                  <Txt color={C.muted} size={12}>
                    {i.reason}
                  </Txt>
                </View>
                <Pill
                  tone={i.place.environment === "INDOOR" ? "blue" : "green"}
                >
                  {i.place.environment === "INDOOR"
                    ? "Trong nhà"
                    : "Ngoài trời"}
                </Pill>
              </Row>
            </Card>
          ))}
          <Button
            label={
              plan.status === "VOTING"
                ? "Xem phiếu và biểu quyết"
                : "Xem kết quả biểu quyết"
            }
            icon="hand-left-outline"
            onPress={() => go("vote", plan.id)}
          />
        </>
      )}
      <CommentsPanel planId={plan.id} />
    </View>
  );
}

function WeatherScreen() {
  const { detail, route, token, go, run, busy, refresh, notify } = useApp();
  const group = detail!.group;
  const path = `/groups/${group.id}/weather?mode=${group.mode.toLowerCase()}`;
  const { data: weather, loading, error } = useResource<WeatherSummary>(path);
  const { data: alerts } = useResource<Alert[]>(`/groups/${group.id}/alerts`);
  if (!weather) return <ResourceState loading={loading} error={error} />;
  if (route.name === "providers")
    return (
      <View style={U.stack}>
        <Notice>
          Các nguồn có thể sử dụng chung dữ liệu nền. Số nguồn đồng thuận không
          phải xác suất mưa và không bảo đảm các dự báo độc lập.
        </Notice>
        {weather.demo && (
          <Pill tone="amber">DEMO · TOÀN BỘ SỐ LIỆU DƯỚI ĐÂY LÀ GIẢ LẬP</Pill>
        )}
        {weather.providers.map((p) => (
          <Card key={p.provider} style={U.stack}>
            <Row style={{ justifyContent: "space-between" }}>
              <Txt bold size={19}>
                {p.provider}
              </Txt>
              <Pill tone={p.status === "OK" ? "green" : "amber"}>
                {p.status}
              </Pill>
            </Row>
            <Txt size={13}>{p.message}</Txt>
            <Txt size={11} color={C.muted}>
              {p.fetchedAt
                ? `Lấy lúc ${hour(p.fetchedAt)} ${date(p.fetchedAt)}`
                : "Chưa nhận được dữ liệu"}
            </Txt>
          </Card>
        ))}
        <Notice warning>
          Chất lượng dự báo và độ phủ tại Việt Nam chưa được kiểm chứng thực
          nghiệm trong đồ án. Nguồn thiếu dữ liệu không được quy thành không
          mưa.
        </Notice>
      </View>
    );
  if (route.name === "hourly")
    return (
      <View style={U.stack}>
        {weather.demo && <Pill tone="amber">DỰ BÁO DEMO</Pill>}
        <Notice>
          Hiển thị từng xác suất theo nguồn. Không lấy trung bình thành một xác
          suất chung khi chưa hiệu chỉnh.
        </Notice>
        {weather.slots.map((s) => (
          <Card key={s.time} style={U.stack}>
            <Row style={{ justifyContent: "space-between" }}>
              <Txt bold size={18}>
                {hour(s.time)} · {date(s.time)}
              </Txt>
              <Pill tone={s.rainVotes >= 2 ? "amber" : "green"}>
                {s.rainVotes}/{s.validSources} nguồn báo nguy cơ
              </Pill>
            </Row>
            {s.providers.map((p) => (
              <Row
                key={p.provider}
                style={{ justifyContent: "space-between", flexWrap: "wrap" }}
              >
                <Txt size={12}>{p.provider}</Txt>
                <Txt size={12} color={p.usable ? C.text : C.muted}>
                  {p.usable
                    ? `${p.rainMmH === null ? "—" : p.rainMmH} mm/h · ${p.probabilityPct === null ? "—" : p.probabilityPct + "%"} · ${p.risk ? "Có nguy cơ" : "Chưa đạt ngưỡng"}`
                    : "Thiếu / không hợp lệ"}
                </Txt>
              </Row>
            ))}
            <Txt size={12} color={C.muted}>Nhiệt độ: {s.temperatureC == null ? 'Chưa có dữ liệu' : `${s.temperatureC}°C`} · Gió: {s.windKmh == null ? 'Chưa có dữ liệu' : `${s.windKmh} km/h`}</Txt>
          </Card>
        ))}
      </View>
    );
  const first = weather.slots[0];
  return (
    <View style={U.stack}>
      <Card style={{ backgroundColor: "#E8F0E2", gap: 16 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <View>
            <Txt size={24} bold>
              {group.cityName}
            </Txt>
            <Txt size={12} color={C.muted}>
              Cập nhật {hour(weather.fetchedAt)} · {date(weather.fetchedAt)}
            </Txt>
          </View>
          <Icon
            name={
              weather.rainWindows.length
                ? "rainy-outline"
                : "partly-sunny-outline"
            }
            size={60}
            color={weather.rainWindows.length ? C.blue : "#BAA05A"}
          />
        </Row>
        <Txt bold size={18}>
          {weather.rainWindows.length
            ? "Có khoảng thời gian có nguy cơ mưa"
            : "Chưa có khung mưa đủ đồng thuận"}
        </Txt>
        <Txt>{weather.confidenceText}</Txt>
        {weather.demo && <Pill tone="amber">DEMO · THỜI TIẾT GIẢ LẬP</Pill>}
        <Row style={{ flexWrap: "wrap" }}>
          {weather.providers.map((p) => (
            <Pill key={p.provider} tone={p.status === "OK" ? "green" : "amber"}>
              {p.provider} · {p.status}
            </Pill>
          ))}
        </Row>
      </Card>
      <Notice>Đây là dự báo theo giờ cho ngày chuyến đi, không phải quan sát thời tiết tại vị trí hiện tại của bạn. Nguồn thiếu được hiển thị là chưa biết.</Notice>
      <WeatherChart weather={weather} />
      <View style={U.grid}>{[
        [first?.temperatureC == null ? 'Chưa có dữ liệu' : `${first.temperatureC}°C`, 'Nhiệt độ · khung dự báo đầu'],
        [first?.windKmh == null ? 'Chưa có dữ liệu' : `${first.windKmh} km/h`, 'Gió · khung dự báo đầu'],
      ].map(([value, label]) => <Card key={label} style={{ flex: 1, minWidth: 140, gap: 6 }}><Txt size={12} color={C.muted}>{label}</Txt><Txt bold size={20}>{value}</Txt></Card>)}</View>
      <Section
        title="Nhịp thời tiết trong ngày"
        action="Từng nguồn, từng giờ"
        onAction={() => go("hourly")}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Row style={{ alignItems: "stretch", paddingBottom: 5 }}>
          {weather.slots.slice(0, 16).map((s) => (
            <Card
              key={s.time}
              style={{
                width: 105,
                alignItems: "center",
                gap: 11,
                padding: 13,
                backgroundColor: s.rainVotes >= 2 ? "#EEF4F6" : C.white,
              }}
            >
              <Txt size={12} bold>
                {hour(s.time)}
              </Txt>
              <Icon
                name={
                  s.rainVotes >= 2
                    ? "rainy-outline"
                    : s.validSources
                      ? "partly-sunny-outline"
                      : "help-circle-outline"
                }
                size={27}
                color={s.rainVotes >= 2 ? C.blue : "#BAA05A"}
              />
              <Txt size={12} bold>
                {s.rainMmH === null ? "—" : `${s.rainMmH} mm/h`}
              </Txt>
              <Txt size={10} color={C.muted}>
                {s.rainVotes}/{s.validSources} nguồn
              </Txt>
            </Card>
          ))}
        </Row>
      </ScrollView>
      <Notice>
        Giá trị tổng hợp phục vụ quy tắc cảnh báo; xem từng nguồn để biết số
        liệu gốc. Chỉ báo nguy cơ khi đủ nguồn đồng thuận, không hứa trời chắc
        chắn mưa hay khô.
      </Notice>
      {weather.rainWindows.length > 0 && (
        <Card style={U.stack}>
          <Txt bold>Khoảng mưa được code nhận diện</Txt>
          {weather.rainWindows.map((w, i) => (
            <Row key={i}>
              <Icon name="rainy-outline" color={C.blue} size={18} />
              <Txt size={13}>
                {hour(w.start)}–{hour(w.end)} · {w.rainVotes} nguồn đồng thuận
              </Txt>
            </Row>
          ))}
        </Card>
      )}
      <Card>
        <MenuRow
          title="Bản đồ radar mưa"
          text="Diễn biến radar quá khứ, không phải dự báo tương lai"
          icon="map-outline"
          onPress={() => go("radar")}
        />
        <MenuRow
          title="Các nguồn dự báo"
          text="Nguồn khả dụng, thiếu dữ liệu và thời điểm cập nhật"
          icon="layers-outline"
          onPress={() => go("providers")}
        />
        <MenuRow title="Cảnh báo thời tiết" text={`${alerts?.length || 0} cảnh báo · phương án trong nhà`} icon="warning-outline" onPress={() => go('alerts')} />
        <MenuRow
          title="Đang mưa ở chỗ mình"
          text="Gửi quan sát có vị trí và độ chính xác GPS"
          icon="location-outline"
          onPress={() => go("rainReport")}
        />
        <MenuRow
          title="Đối chiếu với thực tế"
          text="Thống kê đúng / sai và các mẫu chưa kiểm chứng"
          icon="analytics-outline"
          onPress={() => go("verification")}
        />
      </Card>
      <Button
        label="Kiểm tra nguy cơ điểm sắp đến"
        icon="refresh-outline"
        variant="secondary"
        loading={busy === "weather-check"}
        onPress={() =>
          run("weather-check", async () => {
            const result = await request<{
              alert: Alert | null;
              proposal: Plan | null;
            }>(`/groups/${group.id}/weather/check`, token, "POST", {
              mode: group.mode.toLowerCase(),
            });
            refresh();
            if (result.proposal) go("proposal", result.proposal.id);
            else
              notify(
                result.alert?.message ||
                  "Đã kiểm tra. Chưa có cảnh báo mới đủ điều kiện.",
              );
          })
        }
      />
      {!!alerts?.length && (
        <>
          <Section title="Cảnh báo của nhóm" />
          {alerts.slice(0, 5).map((a) => (
            <Card key={a.id} style={U.stack}>
              <Row>
                {a.demo && <Pill tone="amber">DEMO</Pill>}
                <Txt size={11} color={C.muted}>
                  {hour(a.createdAt)}
                </Txt>
              </Row>
              <Txt size={13}>{a.message}</Txt>
              {a.planId && (
                <Button
                  label="Xem phương án"
                  variant="secondary"
                  onPress={() => go("proposal", a.planId!)}
                />
              )}
            </Card>
          ))}
        </>
      )}
    </View>
  );
}

function RadarScreen() {
  const { detail, cities } = useApp();
  const { data, loading, error } = useResource<RadarData>("/radar");
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (data?.frames.length) setIndex(data.frames.length - 1);
  }, [data?.frames.length]);
  useEffect(() => {
    if (!playing || !data?.frames.length) return;
    const timer = setInterval(
      () => setIndex((i) => (i + 1) % data.frames.length),
      900,
    );
    return () => clearInterval(timer);
  }, [playing, data?.frames.length]);
  const city = cities.find((c) => c.id === detail?.group.cityId) || cities[0];
  const idx = data ? Math.max(0, Math.min(index, data.frames.length - 1)) : 0;
  return (
    <View style={U.stack}>
      <Notice>
        {dataSource === 'mock' ? 'DEMO · Không có ảnh radar trong bộ mẫu. Chuyển sang API để xem radar quan sát do backend cung cấp.' : 'Radar quan sát từ RainViewer do backend cung cấp. Đây là ảnh quá khứ; không phải dự báo mưa tương lai.'}
      </Notice>
      <ResourceState loading={loading} error={error} />
      {data && !!data.frames.length && (
        <>
          <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <Txt bold>{city?.name || "Đà Lạt"} · Radar mưa</Txt>
            <Pill tone="blue">
              {date(new Date(data.frames[idx].time * 1000).toISOString())}{" "}
              {hour(new Date(data.frames[idx].time * 1000).toISOString())}
            </Pill>
          </Row>
          <RadarMap
            radar={data}
            latitude={city?.latitude || 11.9404}
            longitude={city?.longitude || 108.4583}
            frameIndex={idx}
          />
          <Row style={{ justifyContent: "center", flexWrap: "wrap" }}>
            <Button
              label="Trước"
              icon="play-skip-back-outline"
              variant="secondary"
              onPress={() => {
                setPlaying(false);
                setIndex(Math.max(0, idx - 1));
              }}
            />
            <Button
              label={playing ? "Tạm dừng" : "Phát diễn biến"}
              icon={playing ? "pause-outline" : "play-outline"}
              onPress={() => setPlaying((p) => !p)}
            />
            <Button
              label="Sau"
              icon="play-skip-forward-outline"
              variant="secondary"
              onPress={() => {
                setPlaying(false);
                setIndex(Math.min(data.frames.length - 1, idx + 1));
              }}
            />
          </Row>
          <ScrollView horizontal>
            <Row>
              {data.frames.map((f, i) => (
                <Button
                  key={f.time}
                  label={hour(new Date(f.time * 1000).toISOString())}
                  variant={idx === i ? "primary" : "ghost"}
                  onPress={() => {
                    setPlaying(false);
                    setIndex(i);
                  }}
                />
              ))}
            </Row>
          </ScrollView>
          <Txt size={11} color={C.muted}>
            {data.attribution} · © OpenStreetMap contributors
          </Txt>
          <Notice warning>
            Radar có thể trễ hoặc thiếu độ phủ. Vùng trống không chứng minh trời
            khô. Dữ liệu radar của website và API công khai có thể khác nhau.
          </Notice>
        </>
      )}
      {data && !data.frames.length && (
        <Empty
          title="Chưa có khung radar"
          text={dataSource === 'mock' ? 'Bộ mẫu không tạo ảnh radar giả. Dự báo mô phỏng vẫn xem được ở mục Thời tiết.' : 'RainViewer chưa trả dữ liệu. Dự báo theo nguồn vẫn xem được ở mục Thời tiết.'}
          icon="cloud-offline-outline"
        />
      )}
    </View>
  );
}

function RainReportScreen() {
  const { detail, token, run, busy, notify, refresh } = useApp();
  const [condition, setCondition] = useState<"RAIN" | "DRY">("RAIN");
  const [location, setLocation] = useState<Location.LocationObject | null>(
    null,
  );
  const [result, setResult] = useState<{
    verified: boolean;
    message: string;
  } | null>(null);
  const locate = () =>
    run("locate", async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted")
        throw new Error(
          "Cần cho phép truy cập vị trí để xác minh báo cáo. Bạn có thể bật quyền trong cài đặt thiết bị.",
        );
      setLocation(
        await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        }),
      );
    });
  return (
    <Card style={[U.stack, { maxWidth: 720 }]}>
      <Icon name="rainy-outline" size={43} />
      <Txt size={22} bold>
        Bầu trời chỗ bạn thế nào?
      </Txt>
      <Txt color={C.muted}>
        Quan sát của bạn giúp nhóm đối chiếu dự báo. Vị trí chỉ được lấy khi bạn
        bấm nút.
      </Txt>
      <Row>
        <Button
          label="Đang mưa"
          icon="rainy-outline"
          variant={condition === "RAIN" ? "primary" : "secondary"}
          onPress={() => setCondition("RAIN")}
        />
        <Button
          label="Không mưa"
          icon="sunny-outline"
          variant={condition === "DRY" ? "primary" : "secondary"}
          onPress={() => setCondition("DRY")}
        />
      </Row>
      <Button
        label={location ? "Lấy lại vị trí hiện tại" : "Cho phép lấy vị trí"}
        icon="locate-outline"
        variant="secondary"
        onPress={locate}
        loading={busy === "locate"}
      />
      {location && (
        <Notice>
          Vĩ độ {location.coords.latitude.toFixed(5)}, kinh độ{" "}
          {location.coords.longitude.toFixed(5)} · sai số khoảng{" "}
          {Math.round(location.coords.accuracy || 0)}m · lấy lúc{" "}
          {hour(new Date(location.timestamp).toISOString())}
        </Notice>
      )}
      <Notice warning>
        Báo cáo cần hai người khác nhau xác nhận cùng khu vực/thời gian, hoặc vị
        trí đủ gần điểm cần kiểm chứng với GPS hợp lệ. Một báo cáo chưa xác minh
        chưa được tính là sự thật.
      </Notice>
      <Button
        label="Gửi quan sát"
        icon="send-outline"
        disabled={!location}
        loading={busy === "report"}
        onPress={() =>
          run("report", async () => {
            if (!location || !detail) return;
            const res = await request<{ verified: boolean; message: string }>(
              `/groups/${detail.group.id}/rain-reports`,
              token,
              "POST",
              {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                accuracyM: location.coords.accuracy || 9999,
                condition,
                observedAt: new Date(location.timestamp).toISOString(),
              },
            );
            setResult(res);
            refresh();
            notify(res.message);
          })
        }
      />
      {result && <Notice warning={!result.verified}>{result.message}</Notice>}
    </Card>
  );
}

function VerificationScreen() {
  const { detail } = useApp();
  const { data, loading, error } = useResource<Verification>(
    `/groups/${detail!.group.id}/verification`,
  );
  return (
    <View style={U.stack}>
      <ResourceState loading={loading} error={error} />
      {data && (
        <>
          <Notice>{data.note}</Notice>
          <View style={U.grid}>
            {[
              [data.verified, "Mẫu đã kiểm chứng"],
              [data.correct, "Đúng"],
              [data.incorrect, "Sai"],
              [data.unknown, "Chưa kiểm chứng"],
            ].map(([v, text]) => (
              <Card key={text} style={{ flex: 1, minWidth: 145 }}>
                <Txt size={32} bold>
                  {v}
                </Txt>
                <Txt size={12} color={C.muted}>
                  {text}
                </Txt>
              </Card>
            ))}
          </View>
          <Card style={U.stack}>
            <Txt bold>Tỷ lệ đúng trên mẫu đã kiểm chứng</Txt>
            <Txt size={42} bold color={C.green}>
              {data.accuracyPct === null
                ? "Chưa đủ dữ liệu"
                : `${data.accuracyPct}%`}
            </Txt>
            <Txt size={13} color={C.muted}>
              Đây là thống kê của các mẫu đã được xác minh, không đại diện cho
              độ chính xác toàn thành phố. Cần xem cả số mẫu và dữ liệu thiếu.
            </Txt>
          </Card>
          <Notice warning>
            Mẫu DEMO được loại khỏi thống kê thật. Không có báo cáo không đồng
            nghĩa không mưa; các mẫu thiếu bằng chứng giữ trạng thái chưa kiểm
            chứng.
          </Notice>
        </>
      )}
    </View>
  );
}

function NotificationsScreen() {
  const { notifications, token, run, refresh, go, selectGroup } = useApp();
  return (
    <View style={U.stack}>
      <Txt size={13} color={C.muted}>
        {dataSource === 'mock' ? 'DEMO · Thông báo được lưu trong phiên này. Chạm để đọc chi tiết.' : 'Thông báo được lưu trên máy chủ. Chạm để đánh dấu đã đọc và xem nội dung liên quan.'}
      </Txt>
      {!notifications.length && (
        <Empty
          title="Một chút yên tĩnh"
          text="Thông báo về lời mời, lịch trình và cảnh báo sẽ xuất hiện ở đây."
          icon="notifications-outline"
        />
      )}
      {notifications.map((n) => (
        <Card
          key={n.id}
          onPress={() =>
            run(`read-${n.id}`, async () => {
              await request(`/notifications/${n.id}/read`, token, "PATCH");
              refresh();
              if (n.groupId) selectGroup(n.groupId);
              if (n.planId) go("proposal", n.planId);
              else if (n.groupId) go("dashboard");
              else go('notificationDetail', n.id);
            })
          }
          style={{ backgroundColor: n.readAt ? C.white : "#EDF3E7" }}
        >
          <Row>
            <View style={U.iconCircle}>
              <Icon
                name={
                  n.type.includes("RAIN") || n.type.includes("ALERT")
                    ? "rainy-outline"
                    : "notifications-outline"
                }
              />
            </View>
            <View style={{ flex: 1 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Txt bold>{n.title}</Txt>
                {!n.readAt && <Pill>Mới</Pill>}
              </Row>
              <Txt size={13} color={C.muted}>
                {n.message}
              </Txt>
              <Txt size={10} color={C.muted}>
                {date(n.createdAt)} · {hour(n.createdAt)}
              </Txt>
            </View>
          </Row>
        </Card>
      ))}
    </View>
  );
}
function BudgetScreen() {
  const { detail, token, run, busy, refresh, notify } = useApp();
  const [budget, setBudget] = useState(
    String(detail!.group.budgetPerPersonVnd),
  );
  const [name, setName] = useState(detail!.group.name);
  const group = detail!.group;
  const plan = detail!.currentPlan;
  const spent = plan?.totalCostVnd || 0;
  const remaining = group.budgetPerPersonVnd - spent;
  return (
    <View style={U.stack}>
      <Notice>
        Ngân sách và chi phí tính theo đầu người. Chỉ gồm giá vé/chi phí điểm
        đến trong dữ liệu; chưa bao gồm toàn bộ ăn uống, lưu trú và phương tiện.
      </Notice>
      <View style={U.grid}>
        {[
          [money(group.budgetPerPersonVnd), "Ngân sách / người"],
          [money(spent), "Tạm tính trong lịch"],
          [money(remaining), "Còn lại dự kiến"],
        ].map(([v, text]) => (
          <Card key={text} style={{ flex: 1, minWidth: 170 }}>
            <Txt size={24} bold>
              {v}
            </Txt>
            <Txt color={C.muted} size={12}>
              {text}
            </Txt>
          </Card>
        ))}
      </View>
      <Card style={U.stack}>
        <Txt bold>Các điểm trong lịch chính thức</Txt>
        {plan?.items.map((i) => (
          <Row key={i.id} style={{ justifyContent: "space-between" }}>
            <Txt size={13} style={{ flex: 1 }}>
              {i.place.name}
            </Txt>
            <Txt bold size={13}>
              {money(i.costVnd)}
            </Txt>
          </Row>
        ))}
        {!plan && <Txt color={C.muted}>Chưa có lịch đã chốt.</Txt>}
        <View
          style={{
            height: 7,
            backgroundColor: C.line,
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              height: "100%",
              backgroundColor: remaining < 0 ? C.red : C.green,
              width: `${Math.min(100, (spent / Math.max(1, group.budgetPerPersonVnd)) * 100)}%`,
            }}
          />
        </View>
      </Card>
      {group.role === "LEADER" && (
        <Card style={U.stack}>
          <Txt bold>Chỉnh sửa thông tin nhóm</Txt>
          <Input label="Tên chuyến đi" value={name} onChange={setName} />
          <Input
            label="Ngân sách / người (VND)"
            value={budget}
            onChange={setBudget}
            numeric
          />
          <Notice>
            Người sửa sau được áp dụng theo thứ tự máy chủ tiếp nhận. Nhóm nhận
            thông báo và nhật ký thay đổi; lịch đã biểu quyết không bị sửa âm
            thầm.
          </Notice>
          <Button
            label="Lưu thông tin nhóm"
            loading={busy === "budget"}
            onPress={() =>
              run("budget", async () => {
                if (!name.trim() || !Number.isFinite(+budget) || +budget <= 0)
                  throw new Error("Nhập tên nhóm và ngân sách dương hợp lệ.");
                await request(`/groups/${group.id}`, token, "PATCH", {
                  name,
                  budgetPerPersonVnd: +budget,
                  expectedRevision: group.revision,
                });
                refresh();
                notify("Đã lưu và đồng bộ thông tin nhóm.");
              })
            }
          />
        </Card>
      )}
    </View>
  );
}
function ActivityScreen() {
  const { detail } = useApp();
  const { data, loading, error } = useResource<Activity[]>(
    `/groups/${detail!.group.id}/activity`,
  );
  return (
    <View style={U.stack}>
      <ResourceState loading={loading} error={error} />
      {!data?.length && !loading && (
        <Empty
          title="Chuyến đi mới bắt đầu"
          text="Mọi thay đổi quan trọng sẽ được ghi lại tại đây."
          icon="time-outline"
        />
      )}
      {data?.map((a) => (
        <Card key={a.id}>
          <Row>
            <View style={U.iconCircle}>
              <Icon name="git-commit-outline" />
            </View>
            <View style={{ flex: 1 }}>
              <Txt size={13}>{a.message}</Txt>
              <Txt color={C.muted} size={10}>
                {date(a.createdAt)} · {hour(a.createdAt)} · {a.action}
              </Txt>
            </View>
          </Row>
        </Card>
      ))}
    </View>
  );
}
function AISetupScreen() {
  const { detail, token, route, run, busy, refresh, go, notify } = useApp();
  const catalogue = useCatalog(detail?.group.cityId || 'dalat', token);
  const [selectedPlaces, setSelectedPlaces] = useState<string[]>(route.id?.split(',').filter(Boolean) || []);
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeLimit, setPlaceLimit] = useState(12);
  const [tripDate, setTripDate] = useState(detail?.group.tripDate || '');
  const [startHour, setStartHour] = useState(String(detail?.group.startHour ?? 8));
  const [endHour, setEndHour] = useState(String(detail?.group.endHour ?? 20));
  const [planBudget, setPlanBudget] = useState(String(detail?.group.budgetPerPersonVnd ?? 500000));
  useEffect(() => { setSelectedPlaces(route.id?.split(',').filter(Boolean) || []); }, [route.id, detail?.group.id]);
  const { data: health } = useResource<{
    llmConfigured: boolean;
    demoEnabled: boolean;
  }>("/health");
  const [rain, setRain] = useState(false);
  if (!detail) return null;
  const group = detail.group;
  const dirty = tripDate !== group.tripDate || Number(startHour) !== group.startHour || Number(endHour) !== group.endHour || Number(planBudget) !== group.budgetPerPersonVnd;
  return (
    <View style={U.stack}>
      <Card style={{ backgroundColor: "#E8F0E2", gap: 15 }}>
        <Icon name="sparkles-outline" size={35} />
        <Txt size={25} bold>
          Chọn điểm đến, để trợ lý xếp lịch.
        </Txt>
        <Txt>
          Đưa điểm ngoài trời vào giờ ít nguy cơ mưa, ưu tiên điểm trong nhà khi
          có nguy cơ, đồng thời kiểm tra giờ mở cửa, di chuyển và ngân sách.
        </Txt>
        <Notice warning>Vé, giờ mở cửa và thời lượng chưa có nguồn được giữ là chưa có thông tin trong danh mục. Bộ lập lịch hiện dùng các giả định kỹ thuật của API cũ; cần xác minh trước khi dùng lịch cho chuyến đi thực tế.</Notice>
        <Pill tone={health?.llmConfigured ? "green" : "muted"}>
          {health?.llmConfigured
            ? "LLM ĐÃ CẤU HÌNH · CÓ KIỂM ĐỊNH ĐẦU RA"
            : "RULE_BASED · CHƯA CẤU HÌNH LLM"}
        </Pill>
        {!health?.llmConfigured && (
          <Txt color={C.muted} size={12}>
            {dataSource === 'mock' ? 'DEMO · Lịch trình là kịch bản mẫu để bạn thử các bước lập kế hoạch, xem bản đồ và biểu quyết. Không gọi AI thật.' : 'Dịch vụ đang dùng phương án dự phòng theo quy tắc. Kết quả được ghi rõ nguồn và cần cả nhóm biểu quyết.'}
          </Txt>
        )}
      </Card>
      <Card style={U.stack}>
        <Txt bold size={18}>Thiết lập khung chuyến đi</Txt>
        {group.role === 'LEADER' ? <><Input label="Ngày cho lịch trình" value={tripDate} onChange={setTripDate} placeholder="YYYY-MM-DD" /><Row><View style={{ flex: 1 }}><Input label="Giờ bắt đầu lịch" value={startHour} onChange={setStartHour} numeric /></View><View style={{ flex: 1 }}><Input label="Giờ kết thúc lịch" value={endHour} onChange={setEndHour} numeric /></View></Row><Input label="Ngân sách lập lịch (VND/người)" value={planBudget} onChange={setPlanBudget} numeric /><Button label="Lưu thiết lập chuyến đi" variant="secondary" disabled={!dirty} loading={busy === 'planner-settings'} onPress={() => run('planner-settings', async () => { await request(`/groups/${group.id}`, token, 'PATCH', { tripDate, startHour: Number(startHour), endHour: Number(endHour), budgetPerPersonVnd: Number(planBudget), expectedRevision: group.revision }); refresh(); notify('Đã lưu thiết lập. Các phương án đang biểu quyết dùng ràng buộc cũ sẽ hết hiệu lực.'); })} />{dirty && <Notice warning>Lưu thiết lập trước khi tạo phương án. Chỉ trưởng nhóm sửa thông tin chuyến đi; AI không tự thay đổi thiết lập.</Notice>}</> : <Txt>{group.tripDate} · {group.startHour}:00–{group.endHour}:00 · {money(group.budgetPerPersonVnd)}/người. Chỉ trưởng nhóm được sửa.</Txt>}
      </Card>
      <Card style={U.stack}>
        <Txt bold size={18}>Chọn điểm cho phương án</Txt>
        <Txt size={12} color={C.muted}>{selectedPlaces.length ? `${selectedPlaces.length} điểm nguồn được chọn riêng cho lần tạo này.` : 'Đang dùng wishlist của nhóm. Bạn có thể chọn tập điểm riêng, độc lập với việc thêm wishlist.'} Mỗi phương án tối đa hai mươi ứng viên; thuật toán kiểm tra thời gian và thứ tự.</Txt>
        <Row style={{ flexWrap: 'wrap' }}><Button label="Dùng wishlist nhóm" variant="secondary" onPress={() => setSelectedPlaces([])} /><Button label="Chọn điểm wishlist có tọa độ" variant="secondary" onPress={() => setSelectedPlaces(detail.wishlist.filter(mappable).slice(0, 20).map(p => p.id))} /><Button label="Tìm gợi ý điểm đến" icon="sparkles-outline" variant="secondary" onPress={() => go('recommendations', `city:${group.cityId}`)} /></Row>
        <Input label="Tìm điểm cho lịch trình" value={placeQuery} onChange={value => { setPlaceQuery(value); setPlaceLimit(12); }} placeholder="Tên điểm đến trong thành phố của nhóm…" />
        <ResourceState loading={catalogue.loading} error={catalogue.error} />
        {catalogue.places.filter(p => mappable(p) && p.name.toLocaleLowerCase('vi').includes(placeQuery.toLocaleLowerCase('vi'))).slice(0, placeLimit).map(p => <Button key={p.id} label={`${selectedPlaces.includes(p.id) ? '✓ ' : '+ '}${p.name}`} variant={selectedPlaces.includes(p.id) ? 'primary' : 'ghost'} disabled={selectedPlaces.length >= 20 && !selectedPlaces.includes(p.id)} onPress={() => setSelectedPlaces(list => list.includes(p.id) ? list.filter(id => id !== p.id) : [...list, p.id])} />)}
        {catalogue.places.length > placeLimit && <Button label="Xem thêm ứng viên" variant="ghost" onPress={() => setPlaceLimit(n => n + 12)} />}
      </Card>
      <Card style={U.stack}>
        <Txt bold>Dữ kiện từ chuyến đi của bạn</Txt>
        <MenuRow
          title={`${detail.wishlist.length} điểm trong danh sách muốn đi`}
          text="Chỉ chọn từ danh mục database"
          icon="heart-outline"
          onPress={() => go("wishlist")}
        />
        <MenuRow
          title={`${money(group.budgetPerPersonVnd)} / người`}
          text={`${group.startHour}:00–${group.endHour}:00 · ${date(group.tripDate)}`}
          icon="wallet-outline"
          onPress={() => go("budget")}
        />
        <MenuRow
          title={`Thời tiết ${group.mode}`}
          text="Số liệu, khoảng mưa và mức đồng thuận do code xử lý"
          icon="partly-sunny-outline"
          onPress={() => go("weather")}
        />
        {detail.currentPlan && (
          <Row style={{ justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Txt bold>Đề xuất điều chỉnh vì mưa</Txt>
              <Txt size={12} color={C.muted}>
                Tạo phương án dựa trên lịch hiện tại.
              </Txt>
            </View>
            <Switch
              value={rain}
              onValueChange={setRain}
              trackColor={{ true: C.green }}
            />
          </Row>
        )}
      </Card>
      <PreferencesPanel />
      <Notice>
        LLM chỉ dùng số liệu được cung cấp, không tự dự báo hoặc thêm địa điểm.
        JSON phải qua kiểm tra ràng buộc và số liệu. Sai thì thử lại hữu hạn;
        phương án chưa hợp lệ không được đưa ra vote.
      </Notice>
      <Notice warning>
        Mọi phương án đều cần nhóm biểu quyết. Không tự động thay đổi lịch.
      </Notice>
      {group.role === "LEADER" ? (
        <Button
          label="Tạo phương án để nhóm biểu quyết"
          icon="sparkles-outline"
          loading={busy === "generate"}
          disabled={dirty || (detail.wishlist.length === 0 && selectedPlaces.length === 0)}
          onPress={() =>
            run("generate", async () => {
              const plan = await request<Plan>(
                `/groups/${group.id}/plans/generate`,
                token,
                "POST",
                {
                  mode: group.mode.toLowerCase(),
                  task: rain ? "RAIN_CHANGE" : "INITIAL",
                  ...(selectedPlaces.length ? { placeIds: selectedPlaces } : {}),
                },
                90000,
              );
              refresh();
              go("itineraryMap", plan.id);
            })
          }
        />
      ) : (
        <Notice>
          Chỉ trưởng nhóm tạo phương án. Bạn có thể thêm điểm đến, góp ý và biểu
          quyết.
        </Notice>
      )}
    </View>
  );
}
function ProfileScreen() {
  const {
    user,
    token,
    route,
    updateUser,
    go,
    run,
    busy,
    notify,
    logout,
    groups,
  } = useApp();
  const [name, setName] = useState(user?.name || "");
  const [color, setColor] = useState(user?.avatarColor || C.green);
  if (!user) return null;
  if (route.name === "editProfile")
    return (
      <Card style={[U.stack, { maxWidth: 650 }]}>
        <Avatar name={name || user.name} color={color} size={80} />
        <Input label="Tên hiển thị" value={name} onChange={setName} />
        <Txt size={12} bold>
          Màu đại diện
        </Txt>
        <Row>
          {["#18735C", "#B47A55", "#597BA1", "#9A6893", "#BE9B4B"].map((c) => (
            <Pressable
              key={c}
              accessibilityRole="button"
              accessibilityLabel={`Chọn màu ${c}`}
              onPress={() => setColor(c)}
              style={{
                height: 35,
                width: 35,
                borderRadius: 20,
                backgroundColor: c,
                borderColor: color === c ? C.ink : "transparent",
                borderWidth: 3,
              }}
            />
          ))}
        </Row>
        <Txt size={12} color={C.muted}>
          Email: {user.email}
        </Txt>
        <Button
          label="Lưu hồ sơ"
          loading={busy === "profile"}
          onPress={() =>
            run("profile", async () => {
              if (name.trim().length < 2)
                throw new Error("Tên hiển thị cần ít nhất 2 ký tự.");
              updateUser(
                await request<User>("/auth/me", token, "PATCH", {
                  name: name.trim(),
                  avatarColor: color,
                }),
              );
              notify("Đã cập nhật hồ sơ.");
              go("profile");
            })
          }
        />
      </Card>
    );
  return (
    <View style={U.stack}>
      <Card style={{ alignItems: "center", gap: 10, paddingVertical: 30 }}>
        <Avatar name={user.name} color={user.avatarColor} size={82} />
        <Txt size={23} bold>
          {user.name}
        </Txt>
        <Txt color={C.muted}>{user.email}</Txt>
        <Pill>{groups.length} chuyến đi · Những kỷ niệm đang chờ</Pill>
        <Button
          label="Chỉnh sửa hồ sơ"
          variant="secondary"
          icon="create-outline"
          onPress={() => go("editProfile")}
        />
      </Card>
      <Card>
        <MenuRow
          title="Những chuyến đi của tôi"
          icon="people-outline"
          onPress={() => go("groups")}
        />
        <MenuRow
          title="Thông báo"
          icon="notifications-outline"
          onPress={() => go("notifications")}
        />
        <MenuRow title="Đổi mật khẩu" icon="lock-closed-outline" onPress={() => go('changePassword')} />
        <MenuRow
          title="Cài đặt & tài khoản demo"
          text="Đổi người dùng để biểu quyết bằng ba tài khoản riêng"
          icon="settings-outline"
          onPress={() => go("settings")}
        />
        <MenuRow
          title="Trợ giúp & nguyên tắc AI"
          icon="help-circle-outline"
          onPress={() => go("help")}
        />
      </Card>
      <Button
        label="Đăng xuất"
        icon="log-out-outline"
        variant="ghost"
        onPress={() => run("logout", logout)}
      />
    </View>
  );
}
function PreferencesPanel() {
  const { detail, token, run, busy, refresh, notify } = useApp();
  const { data: places } = useResource<Place[]>(
    detail ? `/places?cityId=${detail.group.cityId}` : null,
  );
  const {
    data: preferences,
    loading,
    error,
  } = useResource<{ categories: string[]; environmentPreference: string; travelStyles: string[] }>(
    detail ? `/groups/${detail.group.id}/preferences` : null,
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [preferredEnvironment, setPreferredEnvironment] = useState('ANY');
  const [travelStyles, setTravelStyles] = useState<string[]>([]);
  useEffect(() => {
    if (preferences) { setSelected(preferences.categories); setPreferredEnvironment(preferences.environmentPreference || 'ANY'); setTravelStyles(preferences.travelStyles || []); }
  }, [preferences]);
  const categories = [...new Set(places?.map((p) => p.category) || [])];
  return (
    <Card style={U.stack}>
      <Txt bold size={18}>
        Bạn thích trải nghiệm nào?
      </Txt>
      <Txt color={C.muted} size={12}>
        Sở thích của riêng bạn trong nhóm này. Bộ lập lịch tổng hợp sở thích đã
        lưu từ các thành viên để ưu tiên điểm đến.
      </Txt>
      <ResourceState loading={loading} error={error} />
      <Row style={{ flexWrap: "wrap" }}>
        {categories.map((category) => (
          <Button
            key={category}
            label={category}
            variant={selected.includes(category) ? "primary" : "secondary"}
            onPress={() =>
              setSelected((list) =>
                list.includes(category)
                  ? list.filter((x) => x !== category)
                  : [...list, category],
              )
            }
          />
        ))}
      </Row>
      <Txt bold size={13}>Phong cách cá nhân</Txt><Row style={{ flexWrap: 'wrap' }}>{styleOptions.map(([value, label]) => <Button key={value} label={label} variant={travelStyles.includes(value) ? 'primary' : 'secondary'} onPress={() => setTravelStyles(list => list.includes(value) ? list.filter(v => v !== value) : [...list, value])} />)}</Row>
      <Txt bold size={13}>Không gian ưu tiên</Txt><Row style={{ flexWrap: 'wrap' }}>{environmentOptions.map(([value, label]) => <Button key={value} label={label} variant={preferredEnvironment === value ? 'primary' : 'secondary'} onPress={() => setPreferredEnvironment(value)} />)}</Row>
      <Button
        label="Lưu sở thích của tôi"
        variant="secondary"
        icon="heart-outline"
        loading={busy === "preferences"}
        onPress={() =>
          run("preferences", async () => {
            if (!detail) return;
            await request(
              `/groups/${detail.group.id}/preferences`,
              token,
              "PATCH",
              { categories: selected, environmentPreference: preferredEnvironment, travelStyles },
            );
            refresh();
            notify("Đã lưu sở thích để nhóm cùng lên lịch.");
          })
        }
      />
    </Card>
  );
}
function PasswordScreen() {
  const { route, token, run, busy, go, logout } = useApp();
  const changing = route.name === 'changePassword';
  const [email, setEmail] = useState('');
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  return <View style={{ padding: changing ? 0 : 24, width: '100%', maxWidth: 650, alignSelf: 'center', gap: 20 }}>
    {!changing && <><Brand /><Txt bold size={26}>Quên mật khẩu?</Txt><Txt color={C.muted}>Nhập email bạn đã dùng để đăng ký.</Txt></>}
    <Card style={U.stack}>{changing ? <><Input label="Mật khẩu hiện tại" value={current} onChange={setCurrent} secure /><Input label="Mật khẩu mới" value={password} onChange={setPassword} secure /><Input label="Nhập lại mật khẩu mới" value={confirm} onChange={setConfirm} secure /></> : <Input label="Email khôi phục" value={email} onChange={setEmail} placeholder="ban@email.com" />}
      {message ? <Notice>{message}</Notice> : <Button label={changing ? 'Lưu mật khẩu mới' : 'Gửi hướng dẫn đặt lại'} loading={busy === 'password'} onPress={() => run('password', async () => {
        if (changing && (password.length < 8 || password !== confirm || password === current)) throw new Error('Mật khẩu mới cần ít nhất 8 ký tự, khớp xác nhận và khác mật khẩu cũ.');
        if (!changing && !/^\S+@\S+\.\S+$/.test(email.trim())) throw new Error('Nhập email hợp lệ.');
        const result = await request<ActionResult>(changing ? '/auth/change-password' : '/auth/forgot-password', changing ? token : null, 'POST', changing ? { currentPassword: current, newPassword: password } : { email: email.trim() });
        setMessage(result.message);
        setCurrent(''); setPassword(''); setConfirm('');
      })} />}
      <Button label={changing && message ? 'Đăng nhập lại' : 'Quay lại'} variant="secondary" onPress={() => changing && message ? run('logout', logout) : go(changing ? 'profile' : 'login')} />
    </Card>
  </View>;
}

function AlertsScreen() {
  const { detail, go } = useApp();
  const { data, loading, error } = useResource<Alert[]>(detail ? `/groups/${detail.group.id}/alerts` : null);
  return <View style={U.stack}><ResourceState loading={loading} error={error} />
    {!loading && !error && !data?.length && <Empty title="Chưa có cảnh báo" text="Cảnh báo từ dịch vụ thời tiết và phương án điều chỉnh sẽ xuất hiện ở đây. Đây không phải xác nhận thời tiết an toàn." icon="shield-checkmark-outline" />}
    {data?.map(alert => <Card key={alert.id} style={U.stack}><Row><Icon name="rainy-outline" />{alert.demo && <Pill tone="amber">DEMO · Cảnh báo mô phỏng</Pill>}<Pill tone="muted">{alert.status}</Pill></Row><Txt bold>{alert.message}</Txt><Txt size={11} color={C.muted}>{date(alert.createdAt)} · {hour(alert.createdAt)}</Txt>{alert.planId && <Button label="Xem phương án trong nhà" onPress={() => go('proposal', alert.planId!)} />}</Card>)}
    <Button label="Tìm điểm trong nhà trên bản đồ" icon="map-outline" variant="secondary" onPress={() => go('map', `city:${detail!.group.cityId}`)} />
  </View>;
}

function NotificationDetailScreen() {
  const { notifications, route, go } = useApp();
  const n = notifications.find(n => n.id === route.id);
  return n ? <Card style={U.stack}><Icon name="notifications-outline" size={32} /><Txt bold size={24}>{n.title}</Txt><Txt>{n.message}</Txt><Txt size={11} color={C.muted}>{date(n.createdAt)} · {hour(n.createdAt)}</Txt><Button label="Về thông báo" variant="secondary" onPress={() => go('notifications')} /></Card> : <Empty title="Thông báo không còn khả dụng" text="Mở lại danh sách để tải thông báo mới nhất." action="Về thông báo" onAction={() => go('notifications')} />;
}

function DeveloperDataControls({ onChanged }: { onChanged: () => void }) {
  const { logout, run, refresh, notify } = useApp();
  const [open, setOpen] = useState(false);
  if (!developmentControls) return null;
  return <Card style={U.stack}><Button label="Công cụ phát triển" variant="ghost" icon="code-slash-outline" onPress={() => setOpen(v => !v)} />{open && <>
    <Txt bold>Nguồn dữ liệu: {dataSource === 'mock' ? 'MOCK · cục bộ' : 'API · máy chủ'}</Txt><Notice warning>Chuyển nguồn sẽ đăng xuất để không dùng nhầm token. Dữ liệu mẫu chỉ tồn tại trong phiên JavaScript này.</Notice>
    <Row><Button label="Dùng Mock" variant={dataSource === 'mock' ? 'primary' : 'secondary'} onPress={() => run('source', async () => { await logout(); setDataSource('mock'); await storage.set('di-chung-source', 'mock'); onChanged(); refresh(); })} /><Button label="Dùng API" variant={dataSource === 'api' ? 'primary' : 'secondary'} onPress={() => run('source', async () => { await logout(); setDataSource('api'); await storage.set('di-chung-source', 'api'); onChanged(); refresh(); })} /></Row>
    {dataSource === 'mock' && <><Txt size={12}>Kịch bản hiện tại: {mockScenario()}</Txt><Row style={{ flexWrap: 'wrap' }}>{scenarioOptions.map(([id, label]) => <Button key={id} label={label} variant={mockScenario() === id ? 'primary' : 'secondary'} onPress={() => { setMockScenario(id as MockScenario); refresh(); onChanged(); }} />)}</Row><Button label="Đặt lại dữ liệu mẫu" variant="ghost" onPress={() => { setMockScenario('normal', true); refresh(); onChanged(); notify('Đã đặt lại nhóm và dữ liệu mẫu. Tài khoản đăng ký trong phiên đã xóa.'); }} /></>}
  </>}</Card>;
}

function SettingsScreen() {
  const {
    token,
    detail,
    user,
    run,
    busy,
    authenticate,
    logout,
    notify,
    refresh,
  } = useApp();
  const [url, setUrl] = useState(apiUrl);
  const { data: health } = useResource<{
    status: string;
    database: string;
    llmConfigured: boolean;
    demoEnabled: boolean;
  }>("/health");
  return (
    <View style={U.stack}>
      <DeveloperDataControls onChanged={refresh} />
      <Card style={U.stack}>
        <Txt bold size={18}>
          Kết nối máy chủ
        </Txt>
        <Input
          label="Địa chỉ API"
          value={url}
          onChange={setUrl}
          placeholder="http://192.168.1.10:4000"
        />
        <Txt size={12} color={C.muted}>
          Web thường dùng localhost:4000. Android emulator dùng 10.0.2.2:4000.
          Điện thoại thật dùng IP LAN của máy chạy backend và cùng mạng Wi-Fi.
        </Txt>
        <Button
          label="Lưu kết nối và đăng nhập lại"
          variant="secondary"
          onPress={() =>
            run("server-url", async () => {
              if (!/^https?:\/\//.test(url))
                throw new Error(
                  "Địa chỉ phải bắt đầu bằng http:// hoặc https://",
                );
              setApiUrl(url);
              await storage.set("di-chung-api", apiUrl);
              await logout();
              notify(
                "Đã lưu địa chỉ API. Bạn có thể đăng nhập vào máy chủ mới.",
              );
            })
          }
        />
        <Txt size={12} color={C.muted}>
          Máy chủ: {health?.status || "đang kiểm tra"} · Database:{" "}
          {health?.database || "—"}
        </Txt>
      </Card>
      <Card style={U.stack}>
        <Row>
          <Pill tone="amber">DEMO</Pill>
          <Txt bold size={18}>
            Đổi người biểu quyết
          </Txt>
        </Row>
        <Txt size={13} color={C.muted}>
          Mỗi nút đăng nhập một tài khoản riêng trong nhóm mẫu. App không bầu
          thay người dùng. Bạn cần mở đề xuất và bấm Đồng ý/Từ chối ở từng tài
          khoản.
        </Txt>
        <Txt size={12}>
          Hiện tại: {user?.name} ({user?.email})
        </Txt>
        {[
          { id: "leader", name: "Đăng nhập trưởng nhóm" },
          { id: "member", name: "Đăng nhập thành viên thứ hai" },
          { id: "third", name: "Đăng nhập thành viên thứ ba" },
        ].map((p) => (
          <Button
            key={p.id}
            label={p.name}
            icon="person-circle-outline"
            variant="secondary"
            disabled={health?.demoEnabled === false}
            loading={busy === p.id}
            onPress={() =>
              run(p.id, async () =>
                authenticate(
                  await request("/auth/demo", null, "POST", { persona: p.id }),
                ),
              )
            }
          />
        ))}
        {health?.demoEnabled === false && (
          <Notice warning>Máy chủ đã tắt chế độ DEMO.</Notice>
        )}
      </Card>
      <Card style={U.stack}>
        <Txt bold>Quyền riêng tư và dữ liệu</Txt>
        <Txt size={13} color={C.muted}>
          Token được lưu bằng SecureStore trên native và localStorage trên web.
          Chỉ lấy vị trí khi gửi quan sát thời tiết. Khóa nhà cung cấp và LLM
          nằm ở backend.
        </Txt>
        <Txt size={13} color={C.muted}>
          Thông báo hiện có trong ứng dụng qua realtime; dịch vụ thông báo đẩy
          khi đóng app cần cấu hình riêng trước khi triển khai.
        </Txt>
      </Card>
    </View>
  );
}
function HelpScreen() {
  const { go } = useApp();
  return (
    <View style={U.stack}>
      <Card style={U.stack}>
        <Brand />
        <Txt size={22} bold>
          Có nhau, chuyến đi nhẹ nhàng hơn.
        </Txt>
        <Txt>
          Đi Chung giúp một nhóm lên lịch một ngày tại Đà Lạt hoặc Vũng Tàu,
          cùng chọn địa điểm, bàn luận và biểu quyết.
        </Txt>
      </Card>
      {[
        [
          "1. Tạo hoặc tham gia nhóm",
          "Chọn thành phố, ngày và ngân sách theo đầu người. Mời bạn bè bằng mã; mỗi thành viên đăng nhập bằng tài khoản riêng.",
        ],
        [
          "2. Chọn những điểm muốn đi",
          "Danh mục Đà Lạt có tọa độ đối chiếu nguồn OSM, chưa xác minh cổng vào. Giá và giờ mở cửa chưa biết được ghi rõ. Bình luận nằm trên điểm đến hoặc phương án.",
        ],
        [
          "3. Để trợ lý đề xuất",
          "Code tính các dữ kiện thời tiết và kiểm tra ràng buộc. LLM chỉ dùng JSON được cung cấp. Khi chưa có khóa, bộ lập lịch ghi rõ RULE_BASED.",
        ],
        [
          "4. Cả nhóm cùng quyết định",
          "Cần quá nửa toàn bộ cử tri đã chốt khi mở vote. Không tự áp dụng đề xuất, không tự bỏ phiếu cho thành viên khác.",
        ],
        [
          "5. Đọc thời tiết có trách nhiệm",
          "Đồng thuận 2/3 nguồn không có nghĩa xác suất 67%. Nguồn thiếu không phải không mưa. Radar là dữ liệu quá khứ, độ phủ có thể hạn chế.",
        ],
        [
          "6. Demo rõ ràng",
          "Chế độ DEMO sử dụng thời tiết giả lập có nhãn. Cảnh báo giả lập không nằm trong thống kê kiểm chứng thật.",
        ],
      ].map(([title, text]) => (
        <Card key={title} style={{ gap: 8 }}>
          <Txt bold size={16}>
            {title}
          </Txt>
          <Txt color={C.muted} size={13}>
            {text}
          </Txt>
        </Card>
      ))}
      <Row style={{ flexWrap: "wrap" }}>
        <Button
          label="Mở cài đặt demo"
          variant="secondary"
          onPress={() => go("settings")}
        />
        <Button label="Tạo chuyến đi" onPress={() => go("createGroup")} />
      </Row>
      <Txt size={11} color={C.muted}>
        Đồ án sinh viên · React Native / Expo · Tích hợp dữ liệu qua adapter.
        Không cam kết dự báo chính xác tuyệt đối.
      </Txt>
    </View>
  );
}

const S = StyleSheet.create({
  sidebar: {
    width: 246,
    backgroundColor: "#FDFEF9",
    borderRightWidth: 1,
    borderRightColor: C.line,
    paddingHorizontal: 22,
    paddingTop: 31,
    paddingBottom: 24,
  },
  topbar: {
    height: 76,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FBFCF7",
  },
  navItem: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 11,
  },
  bottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    backgroundColor: "#FDFFF9",
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 13,
    paddingBottom: 20,
  },
});
