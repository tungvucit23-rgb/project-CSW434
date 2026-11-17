import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { config } from "./config.js";
import { db, one } from "./db.js";
import { auth, membership, signToken, userView } from "./auth.js";
import {
  activity,
  alertView,
  cityView,
  commentSelect,
  commentView,
  groupView,
  membersView,
  notificationView,
  placeView,
  plansView,
  planView,
  wishlistRows,
} from "./store.js";
import {
  assert,
  dateOnly,
  hashPassword,
  HttpError,
  id,
  iso,
  route,
  verifyPassword,
} from "./utils.js";
import { emitGroup } from "./events.js";
import {
  checkWeather,
  generatePlan,
  rainReport,
  validateMode,
  verificationStats,
  vote,
} from "./services.js";
import { getWeather } from "./weather.js";
import { recommend } from './recommendations.js';
import { TRAVEL_STYLES } from './travel-facts.js';

export const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || config.corsOrigins.includes(origin)) cb(null, true);
      else cb(new HttpError(403, "Nguồn truy cập chưa được cho phép."));
    },
  }),
);
app.use(express.json({ limit: "128kb" }));
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Thao tác quá nhanh. Hãy thử lại sau." },
  }),
);
const api = express.Router();
app.use("/api", api);
const key = (value: any) => String(value);
const credentials = z.object({
  email: z
    .email()
    .max(200)
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(8).max(128),
});
const loginLimit = rateLimit({
  windowMs: 15 * 60000,
  limit: 40,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Quá nhiều lần đăng nhập; vui lòng chờ." },
});
api.get(
  "/health",
  route(async (_req, res) => {
    await db.query("SELECT 1");
    res.json({
      status: "ok",
      database: db.kind,
      llmConfigured: !!config.openaiKey,
      demoEnabled: config.allowDemo,
    });
  }),
);
api.post(
  "/auth/demo",
  loginLimit,
  route(async (req, res) => {
    assert(config.allowDemo, 403, "Đăng nhập DEMO đã tắt.");
    const body = z
      .object({ persona: z.enum(["leader", "member", "third"]).optional() })
      .parse(req.body || {});
    const uid = `demo-${body.persona || "leader"}`;
    const user = await one<any>("SELECT * FROM users WHERE id=$1", [uid]);
    assert(user, 404, "Chưa nạp dữ liệu DEMO.");
    res.json({ token: signToken(user.id), user: userView(user) });
  }),
);
api.post(
  "/auth/register",
  loginLimit,
  route(async (req, res) => {
    const data = credentials
      .extend({ name: z.string().trim().min(2).max(80) })
      .parse(req.body);
    assert(
      !data.email.endsWith("@dichung.demo"),
      400,
      "Địa chỉ này dành cho tài khoản DEMO.",
    );
    assert(
      !(await one("SELECT id FROM users WHERE email=$1", [data.email])),
      409,
      "Email đã được sử dụng.",
    );
    const hash = await hashPassword(data.password);
    const user = (
      await db.query(
        "INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4) RETURNING *",
        [id(), data.name, data.email, hash],
      )
    ).rows[0];
    res.status(201).json({ token: signToken(user.id), user: userView(user) });
  }),
);
api.post(
  "/auth/login",
  loginLimit,
  route(async (req, res) => {
    const data = credentials.parse(req.body);
    const user = await one<any>("SELECT * FROM users WHERE email=$1", [
      data.email,
    ]);
    assert(
      user &&
        !user.email.endsWith("@dichung.demo") &&
        (await verifyPassword(data.password, user.password_hash)),
      401,
      "Email hoặc mật khẩu không đúng.",
    );
    res.json({ token: signToken(user.id), user: userView(user) });
  }),
);
api.use(auth);
api.get(
  "/auth/me",
  route(async (req, res) => {
    const u = await one<any>("SELECT * FROM users WHERE id=$1", [req.userId]);
    assert(u, 401, "Tài khoản không còn tồn tại.");
    res.json(userView(u));
  }),
);
api.patch(
  "/auth/me",
  route(async (req, res) => {
    const body = z
      .object({
        name: z.string().trim().min(2).max(80),
        avatarColor: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional(),
      })
      .parse(req.body);
    const row = (
      await db.query(
        "UPDATE users SET name=$1,avatar_color=COALESCE($2,avatar_color),updated_at=now() WHERE id=$3 RETURNING *",
        [body.name, body.avatarColor || null, req.userId],
      )
    ).rows[0];
    assert(row, 404, "Không tìm thấy tài khoản.");
    res.json(userView(row));
  }),
);
api.get(
  "/cities",
  route(async (_req, res) =>
    res.json(
      (await db.query("SELECT * FROM cities ORDER BY id")).rows.map(cityView),
    ),
  ),
);
api.get(
  "/places",
  route(async (req, res) => {
    const q = z
      .object({
        cityId: z.string().optional(),
        q: z.string().max(100).optional(),
        environment: z.enum(["INDOOR", "OUTDOOR"]).optional(),
        category: z.string().max(80).optional(),
      })
      .parse(req.query);
    res.json(
      (
        await db.query(
          `SELECT p.* FROM places p JOIN cities c ON c.id=p.city_id WHERE ($1::text IS NULL OR p.city_id=$1) AND ($2::text IS NULL OR p.name ILIKE '%'||$2||'%' OR p.category ILIKE '%'||$2||'%' OR c.name ILIKE '%'||$2||'%') AND ($3::text IS NULL OR p.environment=$3) AND ($4::text IS NULL OR p.category=$4)
           AND NOT (p.id IN ('dalat-02','dalat-05','dalat-12','dalat-16','dalat-17','dalat-21','dalat-22','dalat-28','dalat-31','dalat-33','dalat-34','dalat-36','dalat-37','dalat-38','dalat-39') AND p.data_quality LIKE 'THAM KHẢO:%') ORDER BY p.id`,
          [
            q.cityId || null,
            q.q || null,
            q.environment || null,
            q.category || null,
          ],
        )
      ).rows.map(placeView),
    );
  }),
);
api.get(
  "/places/:id",
  route(async (req, res) => {
    const p = await one("SELECT * FROM places WHERE id=$1", [
      key(req.params.id),
    ]);
    assert(p, 404, "Không tìm thấy địa điểm.");
    res.json(placeView(p));
  }),
);
api.get(
  "/groups",
  route(async (req, res) => {
    const groups = (
      await db.query(
        `SELECT g.*,c.name AS city_name FROM groups g JOIN cities c ON c.id=g.city_id JOIN group_members m ON m.group_id=g.id WHERE m.user_id=$1 AND m.status='ACTIVE' ORDER BY g.created_at DESC`,
        [req.userId],
      )
    ).rows;
    res.json(await Promise.all(groups.map((g) => groupView(g, req.userId))));
  }),
);
const groupInput = z.object({
  name: z.string().trim().min(2).max(100),
  cityId: z.enum(["dalat", "vungtau"]),
  tripDate: z.iso.date(),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(1).max(24),
  budgetPerPersonVnd: z.number().int().min(0).max(100000000),
  mode: z.enum(["DEMO", "LIVE"]).optional(),
});
api.post(
  "/groups",
  route(async (req, res) => {
    const body = groupInput.parse(req.body);
    assert(
      body.startHour < body.endHour,
      400,
      "Giờ kết thúc phải sau giờ bắt đầu.",
    );
    assert(
      body.mode !== "DEMO" || config.allowDemo,
      403,
      "Chế độ DEMO đã tắt.",
    );
    const gid = id(),
      code = randomBytes(4).toString("hex").toUpperCase();
    await db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO groups(id,name,city_id,trip_date,start_hour,end_hour,budget_per_person_vnd,invite_code,invite_expires_at,mode) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          gid,
          body.name,
          body.cityId,
          body.tripDate,
          body.startHour,
          body.endHour,
          body.budgetPerPersonVnd,
          code,
          new Date(Date.now() + 30 * 86400000).toISOString(),
          body.mode || "LIVE",
        ],
      );
      await tx.query(
        "INSERT INTO group_members(group_id,user_id,role) VALUES($1,$2,'LEADER')",
        [gid, req.userId],
      );
    });
    res
      .status(201)
      .json(
        await groupView(
          await one("SELECT * FROM groups WHERE id=$1", [gid]),
          req.userId,
        ),
      );
  }),
);
api.post(
  "/groups/join",
  route(async (req, res) => {
    const { code } = z
      .object({
        code: z
          .string()
          .trim()
          .min(4)
          .max(16)
          .transform((v) => v.toUpperCase()),
      })
      .parse(req.body);
    const g = await one<any>(
      "SELECT * FROM groups WHERE invite_code=$1 AND invite_expires_at>now()",
      [code],
    );
    assert(g, 404, "Mã mời không đúng hoặc đã hết hạn.");
    await db.query(
      `INSERT INTO group_members(group_id,user_id,role) VALUES($1,$2,'MEMBER') ON CONFLICT(group_id,user_id) DO UPDATE SET status='ACTIVE'`,
      [g.id, req.userId],
    );
    await activity(
      g.id,
      req.userId,
      "MEMBER_JOINED",
      "Một thành viên đã tham gia nhóm.",
    );
    emitGroup(g.id, "group:updated", {});
    res.json(await groupView(g, req.userId));
  }),
);
api.get(
  "/groups/:id",
  route(async (req, res) => {
    const gid = key(req.params.id),
      g = await membership(gid, req.userId);
    const [group, members, wishlist, plans, currentPlan] = await Promise.all([
      groupView(g, req.userId),
      membersView(gid),
      wishlistRows(gid).then((rows) => rows.map(placeView)),
      plansView(gid, req.userId),
      g.current_plan_id
        ? planView(g.current_plan_id, req.userId)
        : Promise.resolve(null),
    ]);
    res.json({ group, members, wishlist, plans, currentPlan });
  }),
);
api.patch(
  "/groups/:id",
  route(async (req, res) => {
    const gid = key(req.params.id);
    await membership(gid, req.userId, true);
    const body = z
      .object({
        name: z.string().trim().min(2).max(100).optional(),
        budgetPerPersonVnd: z.number().int().min(0).max(100000000).optional(),
        mode: z.enum(["DEMO", "LIVE"]).optional(),
        tripDate: z.iso.date().optional(),
        startHour: z.number().int().min(0).max(23).optional(),
        endHour: z.number().int().min(1).max(24).optional(),
        expectedRevision: z.number().int().positive().optional(),
      })
      .strict()
      .parse(req.body);
    assert(
      body.mode !== "DEMO" || config.allowDemo,
      403,
      "Chế độ DEMO đã tắt.",
    );
    const result = await db.transaction(async (tx) => {
      const before = await one<any>(
        "SELECT * FROM groups WHERE id=$1 FOR UPDATE",
        [gid],
        tx,
      );
      assert((body.startHour ?? before.start_hour) < (body.endHour ?? before.end_hour), 422, 'Giờ kết thúc phải sau giờ bắt đầu.');
      if (
        (body.mode && body.mode !== before.mode) ||
        (body.budgetPerPersonVnd !== undefined &&
          body.budgetPerPersonVnd !== before.budget_per_person_vnd) ||
        (body.tripDate !== undefined && body.tripDate !== dateOnly(before.trip_date)) ||
        (body.startHour !== undefined && body.startHour !== before.start_hour) ||
        (body.endHour !== undefined && body.endHour !== before.end_hour)
      ) {
        // Do not let a demo-approved plan silently become the basis of a live itinerary.
        await tx.query(
          "UPDATE plans SET status='STALE' WHERE group_id=$1 AND status='VOTING'",
          [gid],
        );
      }
      const row = (
        await tx.query(
          `UPDATE groups SET name=COALESCE($1,name),budget_per_person_vnd=COALESCE($2,budget_per_person_vnd),mode=COALESCE($3,mode),
    current_plan_id=CASE WHEN $3::text IS NOT NULL AND $3<>mode THEN NULL ELSE current_plan_id END,trip_date=COALESCE($5::date,trip_date),start_hour=COALESCE($6,start_hour),end_hour=COALESCE($7,end_hour),revision=revision+1,updated_at=now() WHERE id=$4 RETURNING *`,
          [
            body.name || null,
            body.budgetPerPersonVnd ?? null,
            body.mode || null,
            gid,
            body.tripDate ?? null,
            body.startHour ?? null,
            body.endHour ?? null,
          ],
        )
      ).rows[0];
      const overwrite =
        body.expectedRevision !== undefined &&
        body.expectedRevision !== before.revision;
      const log = await recordEdit(gid, req.userId, overwrite, before, row, tx);
      return { row, log };
    });
    emitGroup(gid, "group:updated", {});
    emitGroup(gid, "activity:created", result.log);
    res.json(await groupView(result.row, req.userId));
  }),
);
async function recordEdit(
  gid: string,
  uid: string,
  overwrite: boolean,
  before: any,
  after: any,
  tx: any,
) {
  const { recordActivity } = await import("./store.js");
  return recordActivity(
    gid,
    uid,
    "GROUP_EDITED",
    overwrite
      ? "Dữ liệu nhóm đã được ghi đè bởi chỉnh sửa đến sau."
      : "Thông tin nhóm đã được cập nhật.",
    before,
    after,
    tx,
  );
}
api.get(
  "/groups/:id/wishlist",
  route(async (req, res) => {
    const gid = key(req.params.id);
    await membership(gid, req.userId);
    res.json((await wishlistRows(gid)).map(placeView));
  }),
);
api.get(
  "/groups/:id/preferences",
  route(async (req, res) => {
    const gid = key(req.params.id);
    await membership(gid, req.userId);
    const row = await one<any>(
      "SELECT preferences FROM group_members WHERE group_id=$1 AND user_id=$2",
      [gid, req.userId],
    );
    res.json({
      categories: Array.isArray(row.preferences?.categories)
        ? row.preferences.categories
        : [],
      environmentPreference: row.preferences?.environmentPreference || 'ANY',
      travelStyles: row.preferences?.travelStyles || [],
    });
  }),
);
api.patch(
  "/groups/:id/preferences",
  route(async (req, res) => {
    const gid = key(req.params.id),
      group = await membership(gid, req.userId),
      body = z
        .object({ categories: z.array(z.string().min(1).max(80)).max(10), environmentPreference: z.enum(['ANY', 'INDOOR', 'OUTDOOR']).optional(), travelStyles: z.array(z.enum(TRAVEL_STYLES)).max(7).optional() })
        .strict()
        .parse(req.body);
    const allowed = (
      await db.query("SELECT DISTINCT category FROM places WHERE city_id=$1", [
        group.city_id,
      ])
    ).rows.map((p) => p.category);
    assert(
      body.categories.every((c) => allowed.includes(c)),
      400,
      "Sở thích phải là loại địa điểm có trong thành phố.",
    );
    const categories = [...new Set(body.categories)];
    const updated = await db.query(
      "UPDATE group_members SET preferences=preferences || $1::jsonb WHERE group_id=$2 AND user_id=$3 RETURNING preferences",
      [JSON.stringify({ categories, ...(body.environmentPreference === undefined ? {} : { environmentPreference: body.environmentPreference }), ...(body.travelStyles === undefined ? {} : { travelStyles: body.travelStyles }) }), gid, req.userId],
    );
    await activity(
      gid,
      req.userId,
      "PREFERENCES_UPDATED",
      "Một thành viên đã cập nhật sở thích cho chuyến đi.",
    );
    emitGroup(gid, "group:updated", {});
    res.json({ categories, environmentPreference: updated.rows[0].preferences.environmentPreference || 'ANY', travelStyles: updated.rows[0].preferences.travelStyles || [] });
  }),
);
api.post(
  "/groups/:id/wishlist",
  route(async (req, res) => {
    const gid = key(req.params.id),
      g = await membership(gid, req.userId),
      { placeId } = z.object({ placeId: z.string() }).parse(req.body);
    const p = await one<any>("SELECT * FROM places WHERE id=$1", [placeId]);
    assert(
      p && p.city_id === g.city_id,
      400,
      "Địa điểm phải thuộc thành phố của nhóm.",
    );
    await db.query(
      "INSERT INTO wishlist_items(id,group_id,place_id,added_by) VALUES($1,$2,$3,$4) ON CONFLICT(group_id,place_id) DO NOTHING",
      [id(), gid, placeId, req.userId],
    );
    const wishlist = (await wishlistRows(gid)).map(placeView);
    emitGroup(gid, "wishlist:updated", { wishlist });
    res.json(wishlist);
  }),
);
api.delete(
  "/groups/:id/wishlist/:placeId",
  route(async (req, res) => {
    const gid = key(req.params.id);
    await membership(gid, req.userId);
    await db.query(
      "DELETE FROM wishlist_items WHERE group_id=$1 AND place_id=$2",
      [gid, key(req.params.placeId)],
    );
    const wishlist = (await wishlistRows(gid)).map(placeView);
    emitGroup(gid, "wishlist:updated", { wishlist });
    res.json(wishlist);
  }),
);
api.get(
  "/groups/:id/plans",
  route(async (req, res) => {
    const gid = key(req.params.id);
    await membership(gid, req.userId);
    res.json(await plansView(gid, req.userId));
  }),
);
api.get(
  "/plans/:id",
  route(async (req, res) => {
    const p = await one<any>("SELECT * FROM plans WHERE id=$1", [
      key(req.params.id),
    ]);
    assert(p, 404, "Không tìm thấy phương án.");
    await membership(p.group_id, req.userId);
    res.json(await planView(p, req.userId));
  }),
);
const modeBody = z.object({ mode: z.enum(["demo", "live"]) });
const expensiveLimit = rateLimit({
  windowMs: 60000,
  limit: 12,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Đang xử lý quá nhiều yêu cầu. Hãy chờ một chút." },
});
const discoveryLimit = rateLimit({ windowMs: 60000, limit: 6, keyGenerator: req => req.userId!, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Gợi ý đang được xử lý. Hãy chờ trước khi thử lại.', code: 'DISCOVERY_RATE_LIMIT' } });
api.post('/ai/recommendations', discoveryLimit, route(async (req, res) => res.json(await recommend(req.userId, req.body))));
api.post(
  "/groups/:id/plans/generate",
  expensiveLimit,
  route(async (req, res) => {
    const body = modeBody
      .extend({ task: z.enum(["INITIAL", "RAIN_CHANGE"]).optional(), placeIds: z.array(z.string().min(1).max(150)).min(1).max(20).optional() })
      .parse(req.body);
    res
      .status(201)
      .json(
        await generatePlan(
          key(req.params.id),
          req.userId,
          body.mode,
          body.task || "INITIAL",
          undefined,
          { placeIds: body.placeIds },
        ),
      );
  }),
);
api.post(
  "/plans/:id/votes",
  route(async (req, res) => {
    const { choice } = z
      .object({ choice: z.enum(["YES", "NO"]) })
      .parse(req.body);
    res.json(await vote(key(req.params.id), req.userId, choice));
  }),
);
export async function validateCommentTarget(
  groupId: string,
  userId: string,
  target: { placeId?: string; planId?: string },
) {
  const g = await membership(groupId, userId);
  assert(
    Number(!!target.placeId) + Number(!!target.planId) === 1,
    400,
    "Bình luận phải gắn với đúng một địa điểm hoặc phương án.",
  );
  if (target.placeId) {
    const p = await one<any>(
      `SELECT p.id FROM places p WHERE p.id=$1 AND p.city_id=$2 AND
  (EXISTS(SELECT 1 FROM wishlist_items w WHERE w.group_id=$3 AND w.place_id=p.id) OR EXISTS(SELECT 1 FROM plan_items i JOIN plans l ON l.id=i.plan_id WHERE l.group_id=$3 AND i.place_id=p.id))`,
      [target.placeId, g.city_id, groupId],
    );
    assert(p, 404, "Địa điểm chưa thuộc danh sách hoặc lịch của nhóm.");
  }
  if (target.planId)
    assert(
      await one("SELECT id FROM plans WHERE id=$1 AND group_id=$2", [
        target.planId,
        groupId,
      ]),
      404,
      "Phương án không thuộc nhóm.",
    );
  return g;
}
const commentTarget = z.object({
  placeId: z.string().min(1).optional(),
  planId: z.string().min(1).optional(),
});
const content = z.string().trim().min(1).max(2000);
api.get(
  "/groups/:id/comments",
  route(async (req, res) => {
    const gid = key(req.params.id),
      target = commentTarget.parse(req.query);
    await validateCommentTarget(gid, req.userId, target);
    res.json(
      (
        await db.query(
          `${commentSelect} WHERE c.group_id=$1 AND c.deleted_at IS NULL AND (($2::text IS NOT NULL AND c.place_id=$2) OR ($3::text IS NOT NULL AND c.proposal_plan_id=$3)) ORDER BY c.created_at LIMIT 300`,
          [gid, target.placeId || null, target.planId || null],
        )
      ).rows.map(commentView),
    );
  }),
);
api.post(
  "/groups/:id/comments",
  route(async (req, res) => {
    const gid = key(req.params.id),
      body = commentTarget.extend({ content }).parse(req.body);
    await validateCommentTarget(gid, req.userId, body);
    const cid = id();
    await db.query(
      "INSERT INTO comments(id,group_id,author_id,place_id,proposal_plan_id,content) VALUES($1,$2,$3,$4,$5,$6)",
      [
        cid,
        gid,
        req.userId,
        body.placeId || null,
        body.planId || null,
        body.content,
      ],
    );
    const item = commentView(
      await one(`${commentSelect} WHERE c.id=$1`, [cid]),
    );
    emitGroup(gid, "comment:created", item);
    res.status(201).json(item);
  }),
);
api.patch(
  "/comments/:id",
  route(async (req, res) => {
    const cid = key(req.params.id),
      c = await one<any>(
        "SELECT * FROM comments WHERE id=$1 AND deleted_at IS NULL",
        [cid],
      );
    assert(c, 404, "Bình luận không tồn tại.");
    await membership(c.group_id, req.userId);
    assert(c.author_id === req.userId, 403, "Chỉ tác giả được sửa bình luận.");
    const body = z.object({ content }).parse(req.body);
    await db.query(
      "UPDATE comments SET content=$1,edited_at=now() WHERE id=$2",
      [body.content, cid],
    );
    const item = commentView(
      await one(`${commentSelect} WHERE c.id=$1`, [cid]),
    );
    emitGroup(c.group_id, "comment:updated", item);
    res.json(item);
  }),
);
api.delete(
  "/comments/:id",
  route(async (req, res) => {
    const cid = key(req.params.id),
      c = await one<any>(
        "SELECT * FROM comments WHERE id=$1 AND deleted_at IS NULL",
        [cid],
      );
    assert(c, 404, "Bình luận không tồn tại.");
    await membership(c.group_id, req.userId);
    assert(c.author_id === req.userId, 403, "Chỉ tác giả được xóa bình luận.");
    await db.query("UPDATE comments SET deleted_at=now() WHERE id=$1", [cid]);
    emitGroup(c.group_id, "comment:deleted", { id: cid });
    res.json({ ok: true });
  }),
);
api.get(
  "/groups/:id/weather",
  expensiveLimit,
  route(async (req, res) => {
    const g = await membership(key(req.params.id), req.userId),
      { mode } = modeBody.parse({ mode: req.query.mode || "live" });
    validateMode(g, mode);
    res.json((await getWeather(g, mode)).summary);
  }),
);
api.post(
  "/groups/:id/weather/check",
  expensiveLimit,
  route(async (req, res) => {
    const { mode } = modeBody.parse(req.body);
    res.json(await checkWeather(key(req.params.id), req.userId, mode));
  }),
);
api.post(
  "/groups/:id/demo/rain",
  expensiveLimit,
  route(async (req, res) =>
    res.json(await checkWeather(key(req.params.id), req.userId, "demo", true)),
  ),
);
api.post(
  "/groups/:id/rain-reports",
  route(async (req, res) => {
    const gid = key(req.params.id),
      g = await membership(gid, req.userId);
    const body = z
      .object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        accuracyM: z.number().min(0).max(10000),
        condition: z.enum(["RAIN", "DRY"]),
        observedAt: z.iso.datetime({ offset: true }).optional(),
      })
      .parse(req.body);
    res.status(201).json(await rainReport(g, req.userId, body));
  }),
);
api.get(
  "/groups/:id/alerts",
  route(async (req, res) => {
    const gid = key(req.params.id);
    await membership(gid, req.userId);
    res.json(
      (
        await db.query(
          "SELECT * FROM alerts WHERE group_id=$1 ORDER BY created_at DESC LIMIT 100",
          [gid],
        )
      ).rows.map(alertView),
    );
  }),
);
api.get(
  "/groups/:id/verification",
  route(async (req, res) => {
    const gid = key(req.params.id);
    await membership(gid, req.userId);
    res.json(await verificationStats(gid));
  }),
);
api.get(
  "/groups/:id/activity",
  route(async (req, res) => {
    const gid = key(req.params.id);
    await membership(gid, req.userId);
    res.json(
      (
        await db.query(
          "SELECT * FROM activity_logs WHERE group_id=$1 ORDER BY created_at DESC LIMIT 100",
          [gid],
        )
      ).rows.map((a) => ({
        id: a.id,
        action: a.action,
        message: a.message,
        createdAt: iso(a.created_at),
      })),
    );
  }),
);
api.get(
  "/notifications",
  route(async (req, res) =>
    res.json(
      (
        await db.query(
          "SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200",
          [req.userId],
        )
      ).rows.map(notificationView),
    ),
  ),
);
api.patch(
  "/notifications/:id/read",
  route(async (req, res) => {
    const row = (
      await db.query(
        "UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2 RETURNING *",
        [key(req.params.id), req.userId],
      )
    ).rows[0];
    assert(row, 404, "Không tìm thấy thông báo.");
    res.json(notificationView(row));
  }),
);
let radarCache: { at: number; value: any } | null = null;
api.get(
  "/radar",
  route(async (_req, res) => {
    if (radarCache && Date.now() - radarCache.at < 5 * 60000)
      return res.json(radarCache.value);
    try {
      const response = await fetch(
        "https://api.rainviewer.com/public/weather-maps.json",
        { signal: AbortSignal.timeout(10000) },
      );
      assert(response.ok, 502, "Không tải được dữ liệu radar.");
      const raw: any = await response.json();
      assert(
        typeof raw.host === "string" &&
          /^https:\/\/([a-z0-9-]+\.)*rainviewer\.com$/.test(raw.host),
        502,
        "Máy chủ radar trả về không hợp lệ.",
      );
      const frames = Array.isArray(raw.radar?.past)
        ? raw.radar.past
            .filter(
              (f: any) =>
                Number.isFinite(f.time) &&
                f.time <= Date.now() / 1000 &&
                typeof f.path === "string" &&
                /^\/v2\/radar\/[a-zA-Z0-9_/-]+$/.test(f.path),
            )
            .map((f: any) => ({ time: f.time, path: f.path }))
            .sort((a: any, b: any) => a.time - b.time)
        : [];
      const value = {
        host: raw.host,
        frames,
        maxZoom: 7,
        attribution:
          "Weather radar data © RainViewer · Chỉ khung quá khứ; độ phủ cần kiểm tra tại vị trí.",
        coverageUrl:
          "https://tilecache.rainviewer.com/v2/coverage/0/256/{z}/{x}/{y}/0/0_0.png",
      };
      radarCache = { at: Date.now(), value };
      return res.json(value);
    } catch {
      throw new HttpError(
        502,
        "Chưa tải được RainViewer. Hãy thử lại; bản đồ trống không có nghĩa là không mưa.",
        "RADAR_UNAVAILABLE",
      );
    }
  }),
);
app.use((_req, _res, next) => next(new HttpError(404, "Không tìm thấy API.")));
app.use(
  (
    error: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof z.ZodError)
      return res
        .status(400)
        .json({
          error: "Dữ liệu chưa hợp lệ.",
          code: "VALIDATION_ERROR",
          details: error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
    if (error instanceof HttpError)
      return res
        .status(error.status)
        .json({ error: error.message, code: error.code });
    if (error?.code === "23505")
      return res
        .status(409)
        .json({ error: "Dữ liệu đã tồn tại hoặc vừa được thay đổi." });
    if (error?.type === "entity.parse.failed")
      return res.status(400).json({ error: "Nội dung JSON không hợp lệ." });
    console.error(
      "API error:",
      error?.code || error?.name || "UnknownError",
      process.env.NODE_ENV === "production" ? "" : error?.message,
    );
    return res
      .status(500)
      .json({
        error: "Có lỗi xử lý. Hãy thử lại sau.",
        code: "INTERNAL_ERROR",
      });
  },
);
