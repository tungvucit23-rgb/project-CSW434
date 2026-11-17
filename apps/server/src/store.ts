import { db, one, type Queryable } from "./db.js";
import { userView } from "./auth.js";
import { dateOnly, distanceKm, id, iso, json } from "./utils.js";
import { emitGroup, emitUser } from "./events.js";
import { placeView } from './places.js';
export { placeView } from './places.js';
export const cityView = (c: any) => ({
  id: c.id,
  name: c.name,
  latitude: c.latitude,
  longitude: c.longitude,
  imageUrl: c.image_url,
});
export async function groupView(g: any, userId: string, q: Queryable = db) {
  const members = (
    await q.query(
      "SELECT user_id,role FROM group_members WHERE group_id=$1 AND status=$2",
      [g.id, "ACTIVE"],
    )
  ).rows;
  const city = g.city_name
    ? { name: g.city_name }
    : await one<any>("SELECT name FROM cities WHERE id=$1", [g.city_id], q);
  return {
    id: g.id,
    name: g.name,
    cityId: g.city_id,
    cityName: city?.name || "",
    tripDate: dateOnly(g.trip_date),
    startHour: g.start_hour,
    endHour: g.end_hour,
    budgetPerPersonVnd: g.budget_per_person_vnd,
    inviteCode: g.invite_code,
    currentPlanId: g.current_plan_id,
    memberCount: members.length,
    role: members.find((m) => m.user_id === userId)?.role || "MEMBER",
    mode: g.mode,
    revision: g.revision,
  };
}
export async function membersView(groupId: string) {
  return (
    await db.query(
      "SELECT u.*,m.role FROM users u JOIN group_members m ON m.user_id=u.id WHERE m.group_id=$1 AND m.status=$2 ORDER BY m.joined_at,u.id",
      [groupId, "ACTIVE"],
    )
  ).rows.map((u) => ({ ...userView(u), role: u.role }));
}
export async function wishlistRows(groupId: string, q: Queryable = db) {
  return (
    await q.query(
      "SELECT p.* FROM places p JOIN wishlist_items w ON w.place_id=p.id WHERE w.group_id=$1 ORDER BY w.created_at,w.id",
      [groupId],
    )
  ).rows;
}
export async function planItemsRows(planId: string, q: Queryable = db) {
  return (
    await q.query(
      "SELECT i.*,p.latitude,p.longitude FROM plan_items i JOIN places p ON p.id=i.place_id WHERE i.plan_id=$1 ORDER BY position",
      [planId],
    )
  ).rows;
}
export async function planView(plan: any, userId: string, q: Queryable = db) {
  const p =
    typeof plan === "string"
      ? await one<any>("SELECT * FROM plans WHERE id=$1", [plan], q)
      : plan;
  if (!p) return null;
  const itemRows = (
    await q.query(
      "SELECT * FROM plan_items WHERE plan_id=$1 ORDER BY position",
      [p.id],
    )
  ).rows;
  const places = (
    await q.query("SELECT * FROM places WHERE id=ANY($1::text[])", [
      itemRows.map((i) => i.place_id),
    ])
  ).rows;
  const items = itemRows.map((i) => ({
    id: i.id,
    placeId: i.place_id,
    place: placeView(places.find((p) => p.id === i.place_id)),
    position: i.position,
    startTime: iso(i.starts_at),
    endTime: iso(i.ends_at),
    travelMin: i.travel_from_prev_min,
    costVnd: i.estimated_cost_vnd,
    reason: i.reason,
    factIds: i.fact_refs,
  }));
  const ballots = (
    await q.query("SELECT * FROM plan_ballots WHERE plan_id=$1", [p.id])
  ).rows;
  const constraints = p.constraints_json || {};
  const tripGroup = !constraints.cityId || !constraints.tripDate ? await one<any>('SELECT * FROM groups WHERE id=$1', [p.group_id], q) : null;
  const tripContext = { cityId: constraints.cityId || tripGroup?.city_id, tripDate: constraints.tripDate || (items[0] ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(items[0].startTime)) : dateOnly(tripGroup?.trip_date)), startHour: constraints.startHour ?? tripGroup?.start_hour, endHour: constraints.endHour ?? tripGroup?.end_hour, budgetPerPersonVnd: constraints.budgetPerPersonVnd ?? tripGroup?.budget_per_person_vnd };
  let straightLineKm = 0;
  for (let i = 1; i < items.length; i++) if (items[i - 1].place.geographyVerified && items[i].place.geographyVerified) straightLineKm += distanceKm(items[i - 1].place, items[i].place);
  return {
    id: p.id,
    groupId: p.group_id,
    tripContext,
    totalDurationMin: items.length ? Math.round((Date.parse(items.at(-1)!.endTime) - Date.parse(items[0].startTime)) / 60000) : 0,
    totalTravelMin: items.reduce((sum, item) => sum + item.travelMin, 0),
    unknownCostCount: items.filter(item => item.place.visitorInfo.entranceFeeVnd == null).length,
    route: { kind: 'STRAIGHT_LINE', straightLineKm: Math.round(straightLineKm * 100) / 100, unmappedPlaceIds: items.filter(item => !item.place.geographyVerified).map(item => item.placeId), travelTimePolicy: 'Haversine*1.3;25km/h;+5min;rounded5;not live driving directions' },
    version: p.version_no,
    basePlanId: p.base_plan_id,
    kind: p.kind,
    status: p.status,
    engine: p.engine,
    demo: p.demo,
    summary: p.summary,
    items,
    totalCostVnd: items.reduce((n, i) => n + i.costVnd, 0),
    yesVotes: ballots.filter((b) => b.choice === "YES").length,
    noVotes: ballots.filter((b) => b.choice === "NO").length,
    eligibleCount: ballots.length,
    requiredYesVotes: Math.floor(ballots.length / 2) + 1,
    myVote: ballots.find((b) => b.user_id === userId)?.choice || null,
    deadline: iso(p.vote_deadline),
    createdAt: iso(p.created_at),
  };
}
export async function plansView(groupId: string, userId: string) {
  const rows = (
    await db.query(
      "SELECT * FROM plans WHERE group_id=$1 ORDER BY version_no DESC",
      [groupId],
    )
  ).rows;
  return Promise.all(rows.map((p) => planView(p, userId)));
}
export const commentView = (c: any) => ({
  id: c.id,
  groupId: c.group_id,
  userId: c.author_id,
  userName: c.user_name || c.name,
  avatarColor: c.avatar_color,
  placeId: c.place_id,
  planId: c.proposal_plan_id,
  content: c.content,
  createdAt: iso(c.created_at),
  editedAt: c.edited_at ? iso(c.edited_at) : null,
});
export const commentSelect = `SELECT c.*,u.name AS user_name,u.avatar_color FROM comments c JOIN users u ON u.id=c.author_id`;
export const alertView = (a: any) => ({
  id: a.id,
  groupId: a.group_id,
  message: a.message,
  demo: !!a.demo_run_id,
  planId: a.proposal_plan_id,
  createdAt: iso(a.created_at),
  status: a.status,
});
export const notificationView = (n: any) => ({
  id: n.id,
  groupId: n.group_id,
  title: n.title,
  message: n.message,
  type: n.type,
  readAt: n.read_at ? iso(n.read_at) : null,
  createdAt: iso(n.created_at),
  planId: n.plan_id,
});
export async function recordActivity(
  groupId: string,
  actorId: string | null,
  action: string,
  message: string,
  before?: any,
  after?: any,
  q: Queryable = db,
) {
  const row = (
    await q.query(
      `INSERT INTO activity_logs(id,group_id,actor_id,action,message,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) RETURNING *`,
      [
        id(),
        groupId,
        actorId,
        action,
        message,
        before ? json(before) : null,
        after ? json(after) : null,
      ],
    )
  ).rows[0];
  return {
    id: row.id,
    groupId,
    action: row.action,
    message: row.message,
    createdAt: iso(row.created_at),
  };
}
export async function notifyGroup(
  groupId: string,
  title: string,
  message: string,
  type: string,
  planId: string | null = null,
  alertId: string | null = null,
) {
  const notifications = await db.transaction(async (tx) => {
    const members = (
      await tx.query(
        "SELECT user_id FROM group_members WHERE group_id=$1 AND status=$2",
        [groupId, "ACTIVE"],
      )
    ).rows;
    const out: any[] = [];
    for (const m of members) {
      const row = (
        await tx.query(
          "INSERT INTO notifications(id,user_id,group_id,title,message,type,plan_id,alert_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
          [id(), m.user_id, groupId, title, message, type, planId, alertId],
        )
      ).rows[0];
      out.push(row);
    }
    return out;
  });
  for (const n of notifications)
    emitUser(n.user_id, "notification:created", notificationView(n));
}
export async function activity(
  groupId: string,
  actorId: string | null,
  action: string,
  message: string,
  before?: any,
  after?: any,
) {
  const item = await recordActivity(
    groupId,
    actorId,
    action,
    message,
    before,
    after,
  );
  emitGroup(groupId, "activity:created", item);
  return item;
}
