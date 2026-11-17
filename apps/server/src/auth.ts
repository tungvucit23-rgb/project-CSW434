import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { config } from "./config.js";
import { db, one } from "./db.js";
import { HttpError } from "./utils.js";
declare global {
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}
export const userView = (u: any) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  avatarColor: u.avatar_color,
});
export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, config.jwtSecret, {
    algorithm: "HS256",
    expiresIn: "7d",
    issuer: "di-chung",
    audience: "di-chung-app",
  });
}
export function tokenUser(token: string) {
  const payload = jwt.verify(token, config.jwtSecret, {
    algorithms: ["HS256"],
    issuer: "di-chung",
    audience: "di-chung-app",
  });
  if (typeof payload === "string" || typeof payload.sub !== "string")
    throw new HttpError(401, "Phiên đăng nhập không hợp lệ.");
  return payload.sub;
}
export function auth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new Error();
    req.userId = tokenUser(header.slice(7));
    next();
  } catch {
    next(new HttpError(401, "Vui lòng đăng nhập lại.", "UNAUTHORIZED"));
  }
}
export async function membership(
  groupId: string,
  userId: string,
  leader = false,
) {
  const row = await one<any>(
    `SELECT g.*,c.name AS city_name,c.latitude,c.longitude,m.role FROM groups g
 JOIN cities c ON c.id=g.city_id JOIN group_members m ON m.group_id=g.id AND m.status='ACTIVE'
 WHERE g.id=$1 AND m.user_id=$2`,
    [groupId, userId],
  );
  if (!row)
    throw new HttpError(404, "Không tìm thấy nhóm hoặc bạn không thuộc nhóm.");
  if (leader && row.role !== "LEADER")
    throw new HttpError(
      403,
      "Chỉ trưởng nhóm được thực hiện thao tác này.",
      "LEADER_REQUIRED",
    );
  return row;
}
