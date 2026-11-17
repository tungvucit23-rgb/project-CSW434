import "dotenv/config";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";

export const dataDir =
  process.env.PGLITE_DATA_DIR === ":memory:"
    ? ":memory:"
    : resolve(process.env.PGLITE_DATA_DIR || ".data");
function secret() {
  if (process.env.JWT_SECRET?.trim()) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === "production")
    throw new Error("JWT_SECRET is required in production");
  if (dataDir === ":memory:") return randomBytes(48).toString("hex");
  mkdirSync(dataDir, { recursive: true });
  const path = resolve(dataDir, ".jwt-secret");
  if (!existsSync(path))
    writeFileSync(path, randomBytes(48).toString("hex"), { mode: 0o600 });
  return readFileSync(path, "utf8").trim();
}
export const config = {
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || "0.0.0.0",
  jwtSecret: secret(),
  allowDemo:
    process.env.ALLOW_DEMO === "true" ||
    (process.env.NODE_ENV !== "production" &&
      process.env.ALLOW_DEMO !== "false"),
  seedDemo: process.env.SEED_DEMO !== "false",
  databaseUrl: process.env.DATABASE_URL,
  dataDir,
  corsOrigins: (
    process.env.CORS_ORIGINS || "http://localhost:8081,http://127.0.0.1:8081"
  )
    .split(",")
    .map((v) => v.trim()),
  weatherApiKey: process.env.WEATHERAPI_KEY,
  tomorrowKey: process.env.TOMORROW_API_KEY,
  openaiKey: process.env.OPENAI_API_KEY,
  openaiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  openaiBaseUrl: (
    process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
  ).replace(/\/$/, ""),
  cacheMinutes: Math.max(10, Number(process.env.WEATHER_CACHE_MINUTES || 15)),
  pollMinutes: Math.max(1, Number(process.env.WEATHER_POLL_MINUTES || 5)),
  workerEnabled: process.env.ENABLE_WORKER !== "false",
};
