import {
  randomUUID,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { NextFunction, Request, Response } from "express";
const scrypt = promisify(scryptCallback);
export const id = () => randomUUID();
export const json = (value: unknown) => JSON.stringify(value);
export const iso = (value: any): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();
export const dateOnly = (value: any) =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
export const todayVN = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function atHour(date: string, hour: number): string {
  return new Date(`${date}T00:00:00+07:00`).getTime() + hour * 3600000 > 0
    ? new Date(
        new Date(`${date}T00:00:00+07:00`).getTime() + hour * 3600000,
      ).toISOString()
    : "";
}
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const rad = (v: number) => (v * Math.PI) / 180;
  const dlat = rad(b.latitude - a.latitude),
    dlon = rad(b.longitude - a.longitude);
  const x =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(dlon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
export const travelMinutes = (
  a: { latitude: number; longitude: number } | null,
  b: { latitude: number; longitude: number },
) => (a ? Math.ceil((((distanceKm(a, b) * 1.3) / 25) * 60 + 5) / 5) * 5 : 0);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, hex] = stored.split(":");
  if (!salt || !hex) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hex, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
export function assert(
  condition: unknown,
  status: number,
  message: string,
  code?: string,
): asserts condition {
  if (!condition) throw new HttpError(status, message, code);
}
export const route =
  (fn: (req: Request, res: Response, next: NextFunction) => unknown) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);
