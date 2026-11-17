import { db, one } from "./db.js";
import { config } from "./config.js";
import { atHour, dateOnly, id, iso, json } from "./utils.js";

export const PROVIDERS = ["Open-Meteo", "WeatherAPI", "Tomorrow.io"] as const;
export type Provider = (typeof PROVIDERS)[number];
export type RainLevel = "NONE" | "LIGHT" | "MODERATE" | "HEAVY" | "UNKNOWN";
export type HourForecast = {
  time: string;
  rainMmH: number | null;
  probabilityPct: number | null;
  temperatureC?: number | null;
  windKmh?: number | null;
};
export type ProviderResult = {
  provider: Provider;
  status: "OK" | "MISSING" | "ERROR" | "STALE";
  fetchedAt: string | null;
  message: string;
  hours: HourForecast[];
  snapshotId: string | null;
};
export type WeatherSlot = HourForecast & {
  level: RainLevel;
  rainVotes: number;
  validSources: number;
  providers: {
    provider: string;
    rainMmH: number | null;
    probabilityPct: number | null;
    risk: boolean;
    usable: boolean;
    temperatureC?: number | null;
    windKmh?: number | null;
  }[];
};
export type WeatherSummary = {
  demo: boolean;
  fetchedAt: string;
  providers: Omit<ProviderResult, "hours" | "snapshotId">[];
  slots: WeatherSlot[];
  rainWindows: { start: string; end: string; rainVotes: number }[];
  confidenceText: string;
};
export type WeatherBundle = {
  summary: WeatherSummary;
  sources: ProviderResult[];
};
export const RULE_VERSION =
  "rain-v1:amount>=0.2mm/h AND probability>=60%;min2sources;demo-separated";
export function classifyRain(mm: number | null): RainLevel {
  if (mm === null || !Number.isFinite(mm) || mm < 0) return "UNKNOWN";
  if (mm < 0.2) return "NONE";
  if (mm < 2.5) return "LIGHT";
  if (mm < 7.6) return "MODERATE";
  return "HEAVY";
}
// Project-specific warning threshold, NOT an official meteorological severity scale.
export const rainRisk = (mm: number | null, probability: number | null) =>
  mm !== null && probability !== null && mm >= 0.2 && probability >= 60;
export const hasConsensus = (slot: WeatherSlot) =>
  slot.validSources >= 2 && slot.rainVotes > slot.validSources / 2;
const sane = (value: unknown, max = Infinity): number | null =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= max
    ? value
    : null;
const hourKey = (time: string) =>
  new Date(
    Math.floor(new Date(time).getTime() / 3600000) * 3600000,
  ).toISOString();
const temperature = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= -90 && v <= 60 ? v : null;
async function fetchJson(url: URL | string) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(12000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<any>;
}
async function reserveQuota(provider: Provider) {
  return db.transaction(async (tx) => {
    // Serialize quota reservations across workers using a row lock on the city record.
    await tx.query("SELECT id FROM cities WHERE id=$1 FOR UPDATE", ["dalat"]);
    const limits =
      provider === "Tomorrow.io"
        ? { hour: 20, day: 450, month: 12000 }
        : provider === "WeatherAPI"
          ? { hour: 500, day: 3000, month: 90000 }
          : { hour: 800, day: 9500, month: 280000 };
    const row = await one<any>(
      `SELECT count(*) FILTER(WHERE requested_at>now()-interval '1 hour') AS hour,
      count(*) FILTER(WHERE requested_at>now()-interval '1 day') AS day,count(*) AS month
      FROM provider_request_log WHERE provider=$1 AND requested_at>now()-interval '31 days'`,
      [provider],
      tx,
    );
    if (
      Number(row.hour) >= limits.hour ||
      Number(row.day) >= limits.day ||
      Number(row.month) >= limits.month
    )
      return false;
    await tx.query("INSERT INTO provider_request_log(provider) VALUES($1)", [
      provider,
    ]);
    return true;
  });
}
export function normalizeOpenMeteo(raw: any): HourForecast[] {
  const h = raw?.hourly;
  if (!Array.isArray(h?.time)) return [];
  // Open-Meteo precipitation/probability denote the PRECEDING hour, so shift to interval start.
  return h.time.map((time: number, i: number) => ({
    time: new Date((time - 3600) * 1000).toISOString(),
    rainMmH: sane(h.precipitation?.[i]),
    probabilityPct: sane(h.precipitation_probability?.[i], 100),
    // Instantaneous fields use the timestamp at the start of the preceding rain interval.
    temperatureC: temperature(h.temperature_2m?.[i - 1]),
    windKmh: sane(h.wind_speed_10m?.[i - 1], 500),
  }));
}
export function normalizeWeatherApi(raw: any): HourForecast[] {
  const days = raw?.forecast?.forecastday;
  if (!Array.isArray(days)) return [];
  return days.flatMap((d: any) =>
    (d.hour || [])
      .filter((h: any) => Number.isFinite(h.time_epoch))
      .map((h: any) => ({
        time: new Date(h.time_epoch * 1000).toISOString(),
        rainMmH: sane(h.precip_mm),
        probabilityPct: sane(
          typeof h.chance_of_rain === "string"
            ? Number(h.chance_of_rain)
            : h.chance_of_rain,
          100,
        ),
        temperatureC: temperature(h.temp_c),
        windKmh: sane(h.wind_kph, 500),
      })),
  );
}
export function normalizeTomorrow(raw: any): HourForecast[] {
  const hours = raw?.timelines?.hourly;
  if (!Array.isArray(hours)) return [];
  return hours
    .filter((h: any) => !Number.isNaN(Date.parse(h.time)))
    .map((h: any) => ({
      time: hourKey(h.time),
      rainMmH: sane(
        h.values?.rainIntensity ?? h.values?.precipitationIntensity,
      ),
      probabilityPct: sane(h.values?.precipitationProbability, 100),
      temperatureC: temperature(h.values?.temperature),
      windKmh: sane(h.values?.windSpeed, 140) === null ? null : h.values.windSpeed * 3.6,
    }));
}
const inflight = new Map<string, Promise<ProviderResult>>();
async function source(
  provider: Provider,
  latitude: number,
  longitude: number,
  date: string,
): Promise<ProviderResult> {
  // Reuse cache between groups only at the same rounded location. Never fabricate a provider.
  const lat = Math.round(latitude * 1000) / 1000,
    lon = Math.round(longitude * 1000) / 1000;
  const key = `${provider}:${lat}:${lon}`;
  const existing = inflight.get(key);
  if (existing) return existing;
  const pending = (async () => {
    if (
      (provider === "WeatherAPI" && !config.weatherApiKey) ||
      (provider === "Tomorrow.io" && !config.tomorrowKey)
    )
      return {
        provider,
        status: "MISSING",
        fetchedAt: null,
        hours: [],
        snapshotId: null,
        message: "Chưa cấu hình API key; không có dữ liệu thay thế.",
      } as ProviderResult;
    const cached = await one<any>(
      "SELECT * FROM weather_snapshots WHERE provider=$1 AND latitude=$2 AND longitude=$3 AND demo_run_id IS NULL ORDER BY fetched_at DESC LIMIT 1",
      [provider, lat, lon],
    );
    if (
      cached &&
      Date.now() - new Date(cached.fetched_at).getTime() <
        config.cacheMinutes * 60000
    )
      return {
        provider,
        status: "OK",
        fetchedAt: iso(cached.fetched_at),
        hours: cached.normalized_forecast,
        snapshotId: cached.id,
        message: "Dữ liệu cache từ API thật; không suy diễn thêm độ phân giải.",
      } as ProviderResult;
    try {
      if (!(await reserveQuota(provider)))
        throw new Error("Đã chạm hạn mức dự phòng của ứng dụng");
      let raw: any, hours: HourForecast[];
      if (provider === "Open-Meteo") {
        const url = new URL("https://api.open-meteo.com/v1/forecast");
        url.search = new URLSearchParams({
          latitude: String(lat),
          longitude: String(lon),
          hourly: "precipitation,precipitation_probability,temperature_2m,wind_speed_10m",
          wind_speed_unit: "kmh",
          temperature_unit: "celsius",
          timezone: "GMT",
          timeformat: "unixtime",
          forecast_days: "7",
        }).toString();
        raw = await fetchJson(url);
        hours = normalizeOpenMeteo(raw);
      } else if (provider === "WeatherAPI") {
        const url = new URL("https://api.weatherapi.com/v1/forecast.json");
        url.search = new URLSearchParams({
          key: config.weatherApiKey!,
          q: `${lat},${lon}`,
          days: "3",
          aqi: "no",
          alerts: "no",
        }).toString();
        raw = await fetchJson(url);
        hours = normalizeWeatherApi(raw);
      } else {
        const url = new URL("https://api.tomorrow.io/v4/weather/forecast");
        url.search = new URLSearchParams({
          apikey: config.tomorrowKey!,
          location: `${lat},${lon}`,
          timesteps: "1h",
          units: "metric",
        }).toString();
        raw = await fetchJson(url);
        hours = normalizeTomorrow(raw);
      }
      if (!hours.length)
        throw new Error("API không trả chuỗi dự báo theo giờ hợp lệ");
      const snapshotId = id(),
        fetchedAt = new Date().toISOString();
      await db.query(
        `INSERT INTO weather_snapshots(id,provider,model_name,latitude,longitude,fetched_at,raw_payload,normalized_forecast)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`,
        [
          snapshotId,
          provider,
          provider === "Open-Meteo"
            ? "best_match;model provenance unspecified by response"
            : "provider-unspecified",
          lat,
          lon,
          fetchedAt,
          json(raw),
          json(hours),
        ],
      );
      const covers = hours.some(
        (h) =>
          dateOnly(new Date(new Date(h.time).getTime() + 7 * 3600000)) === date,
      );
      const resolution =
        provider === "Open-Meteo"
          ? "Tổng mưa của giờ trước đã căn về đầu khoảng."
          : provider === "Tomorrow.io"
            ? "Cường độ dự báo tại mốc giờ, dùng đại diện khoảng giờ; không phải quan trắc."
            : "Lượng mưa dự báo theo giờ, chuẩn hóa trên khoảng giờ.";
      return {
        provider,
        status: "OK",
        fetchedAt,
        hours,
        snapshotId,
        message: covers
          ? `API thật. ${resolution}`
          : "API thật nhưng chưa có dữ liệu cho ngày chuyến đi.",
      } as ProviderResult;
    } catch (error) {
      // Only the sanitized local reason is surfaced, never request URLs containing API keys.
      const message =
        error instanceof Error &&
        /^(HTTP \d+|Đã chạm|API không)/.test(error.message)
          ? error.message
          : "Không tải được API (mạng hoặc hết thời gian).";
      return {
        provider,
        status: cached ? "STALE" : "ERROR",
        fetchedAt: cached ? iso(cached.fetched_at) : null,
        hours: cached?.normalized_forecast || [],
        snapshotId: cached?.id || null,
        message: `${message} Dữ liệu cũ không tham gia đồng thuận.`,
      } as ProviderResult;
    }
  })();
  inflight.set(key, pending);
  try {
    return await pending;
  } finally {
    inflight.delete(key);
  }
}
export function aggregateWeather(
  date: string,
  sources: ProviderResult[],
  demo = false,
): WeatherSummary {
  const maps = sources.map(
    (s) => new Map(s.hours.map((h) => [hourKey(h.time), h])),
  );
  const slots: WeatherSlot[] = Array.from({ length: 24 }, (_, hour) => {
    const time = atHour(date, hour);
    const providers = sources.map((s, i) => {
      const h = maps[i].get(time);
      const usable =
        s.status === "OK" &&
        h?.rainMmH !== null &&
        h?.rainMmH !== undefined &&
        h?.probabilityPct !== null &&
        h?.probabilityPct !== undefined;
      return {
        provider: s.provider,
        rainMmH: h?.rainMmH ?? null,
        probabilityPct: h?.probabilityPct ?? null,
        risk: !!(usable && rainRisk(h!.rainMmH, h!.probabilityPct)),
        usable,
        temperatureC: s.status === 'OK' ? h?.temperatureC ?? null : null,
        windKmh: s.status === 'OK' ? h?.windKmh ?? null : null,
      };
    });
    const valid = providers.filter((p) => p.usable),
      amounts = valid.map((p) => p.rainMmH!).sort((a, b) => a - b);
    const mm = amounts.length ? amounts[Math.floor(amounts.length / 2)] : null;
    const probability = valid.length
      ? Math.max(...valid.map((p) => p.probabilityPct!))
      : null;
    const temperatures = providers.map(p => p.temperatureC).filter((v): v is number => v != null).sort((a, b) => a - b);
    const winds = providers.map(p => p.windKmh).filter((v): v is number => v != null);
    return {
      time,
      rainMmH: mm,
      probabilityPct: probability,
      temperatureC: temperatures.length ? temperatures[Math.floor(temperatures.length / 2)] : null,
      windKmh: winds.length ? Math.max(...winds) : null,
      level: classifyRain(mm),
      rainVotes: valid.filter((p) => p.risk).length,
      validSources: valid.length,
      providers,
    };
  });
  const windows: WeatherSummary["rainWindows"] = [];
  for (const slot of slots.filter((s) => hasConsensus(s))) {
    const last = windows.at(-1),
      end = new Date(new Date(slot.time).getTime() + 3600000).toISOString();
    if (last && last.end === slot.time) {
      last.end = end;
      last.rainVotes = Math.min(last.rainVotes, slot.rainVotes);
    } else windows.push({ start: slot.time, end, rainVotes: slot.rainVotes });
  }
  return {
    demo,
    fetchedAt: new Date().toISOString(),
    providers: sources.map(({ hours, snapshotId, ...status }) => status),
    slots,
    rainWindows: windows,
    confidenceText: `${demo ? "DEMO — số liệu mưa giả lập. " : ""}Chỉ cảnh báo khi có ít nhất hai nguồn hợp lệ và quá nửa đồng thuận. Xác suất hiển thị là giá trị cao nhất từ các nguồn; lượng mưa là trung vị trên. Đây không phải xác suất tổng hợp hay bảo đảm chính xác. Các nguồn có thể dùng chung mô hình nền; dữ liệu giờ không xác định phút bắt đầu mưa.`,
  };
}
export async function getWeather(
  group: any,
  mode: "demo" | "live",
  location?: { latitude: number; longitude: number },
): Promise<WeatherBundle> {
  const date = dateOnly(group.trip_date);
  if (mode === "demo") {
    const sources: ProviderResult[] = PROVIDERS.map((provider, index) => ({
      provider,
      status: "OK",
      fetchedAt: new Date().toISOString(),
      message: "DEMO: số liệu giả lập, không phải dự báo thật.",
      snapshotId: null,
      hours: Array.from({ length: 24 }, (_, hour) => ({
        time: atHour(date, hour),
        rainMmH: hour >= 11 && hour <= 15 ? (index === 2 ? 0.5 : 3.2) : 0,
        probabilityPct: hour >= 11 && hour <= 15 ? (index === 2 ? 65 : 85) : 15,
      })),
    }));
    return { summary: aggregateWeather(date, sources, true), sources };
  }
  const city =
    location ||
    (await one<any>("SELECT latitude,longitude FROM cities WHERE id=$1", [
      group.city_id,
    ]));
  const sources = await Promise.all(
    PROVIDERS.map((p) => source(p, city.latitude, city.longitude, date)),
  );
  return { summary: aggregateWeather(date, sources, false), sources };
}
