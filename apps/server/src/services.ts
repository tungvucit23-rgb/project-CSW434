import { db, one } from "./db.js";
import { config } from "./config.js";
import { membership } from "./auth.js";
import {
  activity,
  alertView,
  groupView,
  notifyGroup,
  planItemsRows,
  planView,
  recordActivity,
  wishlistRows,
} from "./store.js";
import {
  assert,
  atHour,
  dateOnly,
  distanceKm,
  HttpError,
  id,
  iso,
  json,
} from "./utils.js";
import { emitGroup } from "./events.js";
import {
  getWeather,
  hasConsensus,
  PROVIDERS,
  RULE_VERSION,
  type WeatherBundle,
  type WeatherSlot,
} from "./weather.js";
import { makeProposal, minuteOf } from "./planner.js";
import { planningPlace } from './travel-facts.js';
import { placeView } from './places.js';

export function validateMode(group: any, mode: "demo" | "live") {
  assert(
    mode !== "demo" || (config.allowDemo && group.mode === "DEMO"),
    403,
    "Giả lập chỉ dùng trong nhóm DEMO đã được cho phép.",
  );
}
export function planConstraints(group: any) {
  return {
    cityId: group.city_id,
    tripDate: dateOnly(group.trip_date),
    startHour: group.start_hour,
    endHour: group.end_hour,
    budgetPerPersonVnd: group.budget_per_person_vnd,
    mode: group.mode,
  };
}
export const sameConstraints = (a: any, b: any) =>
  !!a &&
  !!b &&
  Object.keys(a).length === Object.keys(b).length &&
  Object.keys(b).every((key) => a[key] === b[key]);
export async function generatePlan(
  groupId: string,
  userId: string,
  mode: "demo" | "live",
  task: "INITIAL" | "RAIN_CHANGE",
  bundle?: WeatherBundle,
  options?: {
    now?: Date;
    trigger?: any;
    checkId?: string;
    skipNotify?: boolean;
    placeIds?: string[];
  },
) {
  const group = await membership(groupId, userId, true);
  validateMode(group, mode);
  assert(
    (group.mode === "DEMO") === (mode === "demo"),
    409,
    "Chế độ tạo phương án phải trùng chế độ của nhóm.",
    "MODE_MISMATCH",
  );
  const constraints = planConstraints(group);
  const wish = await wishlistRows(groupId);
  let requested = wish;
  if (options?.placeIds) {
    requested = (await db.query('SELECT * FROM places WHERE city_id=$1 AND id=ANY($2::text[]) ORDER BY id', [group.city_id, options.placeIds])).rows;
    assert(new Set(options.placeIds).size === options.placeIds.length && requested.length === options.placeIds.length && requested.every(p => placeView(p).geographyVerified), 422, 'Điểm chọn phải có tọa độ nguồn, không trùng và cùng thành phố của nhóm.', 'INVALID_PLANNER_PLACES');
  }
  assert(requested.length > 0, 422, "Hãy thêm địa điểm vào danh sách chung hoặc chọn điểm có tọa độ nguồn.");
  const current = group.current_plan_id
    ? await planItemsRows(group.current_plan_id)
    : [];
  assert(task !== 'RAIN_CHANGE' || current.every(i => dateOnly(i.starts_at) === dateOnly(group.trip_date)), 422, 'Lịch hiện tại khác ngày chuyến đi. Hãy tạo phương án mới thay vì điều chỉnh vì mưa.', 'RAIN_CHANGE_DATE_MISMATCH');
  assert(
    task !== "RAIN_CHANGE" || current.length > 0,
    422,
    "Cần có lịch chính thức trước khi đề xuất đổi vì mưa.",
  );
  let places = requested;
  if (task === "RAIN_CHANGE") {
    // Alternative indoor stops still come from the city database, never from the LLM.
    const alternatives = (
      await db.query(
        `SELECT * FROM places WHERE city_id=$1 AND environment='INDOOR' ORDER BY price_vnd,id LIMIT 8`,
        [group.city_id],
      )
    ).rows;
    const fixedPlaces = (
      await db.query("SELECT * FROM places WHERE id=ANY($1::text[])", [
        current.map((i) => i.place_id),
      ])
    ).rows;
    places = [
      ...new Map(
        [...requested, ...alternatives, ...fixedPlaces].map((p) => [p.id, p]),
      ).values(),
    ];
  }
  const weather = bundle || (await getWeather(group, mode));
  const prefs = (
    await db.query(
      "SELECT preferences FROM group_members WHERE group_id=$1 AND status=$2",
      [groupId, "ACTIVE"],
    )
  ).rows.map((r) => r.preferences);
  // Keep the LLM input compact. Explicit selections are bounded by the API; large wishlists
  // are shortlisted deterministically, with current-plan places retained for locked prefixes.
  if (places.length > 20) {
    const lockedIds = new Set(current.map(p => p.place_id));
    places = places.sort((a, b) => Number(lockedIds.has(b.id)) - Number(lockedIds.has(a.id)) ||
      prefs.filter(p => p.categories?.includes(b.category)).length - prefs.filter(p => p.categories?.includes(a.category)).length || a.price_vnd - b.price_vnd || a.id.localeCompare(b.id)).slice(0, 20);
  }
  places = places.map(p => planningPlace(p, dateOnly(group.trip_date)));
  const planningNow =
    options?.now ||
    (mode === "demo"
      ? new Date(atHour(dateOnly(group.trip_date), group.start_hour))
      : new Date());
  const draft = await makeProposal({
    group,
    places,
    weather: weather.summary,
    task,
    currentItems: current,
    planningNow,
    demo: mode === "demo",
    trigger: options?.trigger,
    preferences: prefs,
  });
  const planId = id(),
    demoRun = mode === "demo" ? `demo:${planId}` : null;
  let log: any;
  await db.transaction(async (tx) => {
    const latest = await one<any>(
      "SELECT * FROM groups WHERE id=$1 FOR UPDATE",
      [groupId],
      tx,
    );
    assert(
      latest.current_plan_id === group.current_plan_id,
      409,
      "Lịch đã thay đổi trong khi tạo phương án. Hãy thử lại.",
      "STALE_BASE",
    );
    assert(
      sameConstraints(planConstraints(latest), constraints),
      409,
      "Ràng buộc chuyến đi đã thay đổi trong khi tạo phương án. Hãy thử lại.",
      "CONSTRAINTS_CHANGED",
    );
    const ver = await one<any>(
      "SELECT COALESCE(MAX(version_no),0)+1 AS next FROM plans WHERE group_id=$1",
      [groupId],
      tx,
    );
    await tx.query(
      `INSERT INTO plans(id,group_id,version_no,base_plan_id,kind,status,engine,demo,summary,created_by,llm_run_id,weather_check_id,vote_deadline,demo_run_id,constraints_json)
   VALUES($1,$2,$3,$4,$5,'VOTING',$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)`,
      [
        planId,
        groupId,
        ver.next,
        group.current_plan_id,
        task,
        draft.engine,
        mode === "demo",
        draft.output.summary,
        userId,
        draft.llmRunId,
        options?.checkId || null,
        new Date(Date.now() + 30 * 60000).toISOString(),
        demoRun,
        json(constraints),
      ],
    );
    const items = [...draft.fixedItems, ...draft.items];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await tx.query(
        `INSERT INTO plan_items(id,plan_id,place_id,position,starts_at,ends_at,travel_from_prev_min,estimated_cost_vnd,reason,fact_refs)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
        [
          id(),
          planId,
          item.placeId,
          i,
          atHour(dateOnly(group.trip_date), item.startMinute / 60),
          atHour(dateOnly(group.trip_date), item.endMinute / 60),
          item.travelMin,
          item.costVnd,
          item.reason,
          json(item.factIds),
        ],
      );
    }
    await tx.query(
      `INSERT INTO plan_ballots(plan_id,user_id) SELECT $1,user_id FROM group_members WHERE group_id=$2 AND status='ACTIVE'`,
      [planId, groupId],
    );
    log = await recordActivity(
      groupId,
      userId,
      "PLAN_PROPOSED",
      `${mode === "demo" ? "DEMO — " : ""}Đã mở biểu quyết phương án ${ver.next}, tạo bằng ${draft.engine}.`,
      null,
      { planId },
      tx,
    );
  });
  emitGroup(groupId, "plan:created", { planId });
  emitGroup(groupId, "activity:created", log);
  if (!options?.skipNotify)
    await notifyGroup(
      groupId,
      "Phương án cần biểu quyết",
      `${mode === "demo" ? "DEMO — " : ""}Một phương án lịch mới đang chờ ý kiến của nhóm.`,
      "PLAN_VOTE",
      planId,
    );
  return (await planView(planId, userId))!;
}
export async function vote(
  planId: string,
  userId: string,
  choice: "YES" | "NO",
) {
  const existing = await one<any>("SELECT * FROM plans WHERE id=$1", [planId]);
  assert(existing, 404, "Không tìm thấy phương án.");
  await membership(existing.group_id, userId);
  const outcome = await db.transaction(async (tx) => {
    const group = await one<any>(
      "SELECT * FROM groups WHERE id=$1 FOR UPDATE",
      [existing.group_id],
      tx,
    );
    const plan = await one<any>(
      "SELECT * FROM plans WHERE id=$1 FOR UPDATE",
      [planId],
      tx,
    );
    if (plan.status !== "VOTING")
      return { error: "Biểu quyết này đã kết thúc.", code: "VOTE_CLOSED" };
    if (new Date(plan.vote_deadline).getTime() <= Date.now()) {
      await tx.query("UPDATE plans SET status='EXPIRED' WHERE id=$1", [planId]);
      return { error: "Biểu quyết đã hết hạn.", code: "VOTE_EXPIRED" };
    }
    const ballot = await one<any>(
      "SELECT * FROM plan_ballots WHERE plan_id=$1 AND user_id=$2",
      [planId, userId],
      tx,
    );
    assert(
      ballot,
      403,
      "Bạn tham gia sau khi mở biểu quyết nên không thuộc danh sách cử tri.",
      "NOT_ELIGIBLE",
    );
    if (group.current_plan_id !== plan.base_plan_id) {
      await tx.query("UPDATE plans SET status='STALE' WHERE id=$1", [planId]);
      return {
        error: "Lịch nền đã thay đổi. Cần tạo phương án mới.",
        code: "STALE_BASE",
      };
    }
    if (
      plan.demo !== (group.mode === "DEMO") ||
      !sameConstraints(plan.constraints_json, planConstraints(group))
    ) {
      await tx.query("UPDATE plans SET status='STALE' WHERE id=$1", [planId]);
      return {
        error:
          "Ràng buộc hoặc chế độ chuyến đi đã thay đổi. Cần tạo phương án mới.",
        code: "CONSTRAINTS_CHANGED",
      };
    }
    await tx.query(
      "UPDATE plan_ballots SET choice=$1,voted_at=now() WHERE plan_id=$2 AND user_id=$3",
      [choice, planId, userId],
    );
    const tally = await one<any>(
      `SELECT count(*) AS eligible,count(*) FILTER(WHERE choice='YES') AS yes,count(*) FILTER(WHERE choice='NO') AS no FROM plan_ballots WHERE plan_id=$1`,
      [planId],
      tx,
    );
    const required = Math.floor(Number(tally.eligible) / 2) + 1;
    let applied = false;
    if (Number(tally.yes) >= required) {
      await tx.query("UPDATE plans SET status='APPROVED' WHERE id=$1", [
        planId,
      ]);
      await tx.query(
        "UPDATE groups SET current_plan_id=$1,revision=revision+1,updated_at=now() WHERE id=$2",
        [planId, group.id],
      );
      await tx.query(
        "UPDATE plans SET status='STALE' WHERE group_id=$1 AND id<>$2 AND status='VOTING'",
        [group.id, planId],
      );
      await tx.query(
        "UPDATE alerts SET status='RESOLVED' WHERE proposal_plan_id=$1",
        [planId],
      );
      applied = true;
    } else if (Number(tally.no) > Number(tally.eligible) - required) {
      await tx.query("UPDATE plans SET status='REJECTED' WHERE id=$1", [
        planId,
      ]);
    }
    const log = await recordActivity(
      group.id,
      userId,
      applied ? "PLAN_APPLIED" : "PLAN_VOTE",
      applied
        ? "Đa số cử tri đã đồng ý; lịch chính thức được cập nhật."
        : `Một thành viên đã chọn ${choice === "YES" ? "Đồng ý" : "Từ chối"}.`,
      null,
      { planId, choice },
      tx,
    );
    return { applied, log };
  });
  emitGroup(existing.group_id, "plan:updated", { planId });
  if ("error" in outcome)
    throw new HttpError(409, outcome.error!, outcome.code);
  emitGroup(existing.group_id, "activity:created", outcome.log);
  if (outcome.applied) {
    emitGroup(existing.group_id, "plan:applied", { planId });
    emitGroup(existing.group_id, "group:updated", {});
    await notifyGroup(
      existing.group_id,
      "Đã chốt lịch",
      "Đa số thành viên đồng ý. Lịch chung đã được cập nhật.",
      "PLAN_APPLIED",
      planId,
    );
  }
  return (await planView(planId, userId))!;
}
function slotAt(bundle: WeatherBundle, time: Date): WeatherSlot | undefined {
  return bundle.summary.slots.find(
    (s) =>
      new Date(s.time).getTime() <= time.getTime() &&
      new Date(s.time).getTime() + 3600000 > time.getTime(),
  );
}
export async function checkWeather(
  groupId: string,
  userId: string,
  mode: "demo" | "live",
  forceDemo = false,
) {
  const group = await membership(groupId, userId, forceDemo);
  validateMode(group, mode);
  assert(
    !forceDemo || mode === "demo",
    400,
    "Giả lập phải chạy trong chế độ DEMO.",
  );
  const items = group.current_plan_id
    ? await planItemsRows(group.current_plan_id)
    : [];
  let now = new Date(),
    target = items.find((i) => new Date(i.starts_at) > now);
  if (forceDemo) {
    const outdoors = await db.query(
      "SELECT id FROM places WHERE environment=$1",
      ["OUTDOOR"],
    );
    const outdoorSet = new Set(outdoors.rows.map((p) => p.id));
    target =
      items.find((i, index) => index > 0 && outdoorSet.has(i.place_id)) ||
      items.find((i) => outdoorSet.has(i.place_id));
    assert(
      target,
      422,
      "Lịch hiện tại cần ít nhất một điểm ngoài trời để giả lập mưa.",
    );
    now = new Date(new Date(target.starts_at).getTime() - 45 * 60000);
  }
  const location = target
    ? { latitude: target.latitude, longitude: target.longitude }
    : undefined;
  const bundle = await getWeather(group, mode, location);
  if (forceDemo && target) {
    const targetMs = new Date(target.starts_at).getTime();
    for (const source of bundle.sources) {
      for (const h of source.hours)
        if (
          new Date(h.time).getTime() <= targetMs &&
          new Date(h.time).getTime() + 3600000 > targetMs
        ) {
          h.rainMmH = 3.2;
          h.probabilityPct = 85;
        }
    }
    const { aggregateWeather } = await import("./weather.js");
    bundle.summary = aggregateWeather(
      dateOnly(group.trip_date),
      bundle.sources,
      true,
    );
  }
  emitGroup(groupId, "weather:updated", { weather: bundle.summary });
  let alert: any = null,
    proposal: any = null;
  if (!target) return { weather: bundle.summary, alert, proposal };
  const p = await one<any>("SELECT * FROM places WHERE id=$1", [
    target.place_id,
  ]);
  const minutesAhead =
    (new Date(target.starts_at).getTime() - now.getTime()) / 60000;
  const slot = slotAt(bundle, new Date(target.starts_at));
  const warning =
    p.environment === "OUTDOOR" &&
    minutesAhead >= 0 &&
    minutesAhead <= 60 &&
    !!slot &&
    hasConsensus(slot);
  const checkId = id(),
    demoRun = mode === "demo" ? `demo:${checkId}` : null;
  await db.transaction(async (tx) => {
    await tx.query(
      `INSERT INTO weather_checks(id,group_id,plan_item_id,target_from,target_to,rule_version,decision,demo_run_id)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        checkId,
        groupId,
        target.id,
        iso(target.starts_at),
        new Date(new Date(target.starts_at).getTime() + 3600000).toISOString(),
        RULE_VERSION,
        warning ? "WARN" : "NO_CONSENSUS_OR_NOT_IMMINENT",
        demoRun,
      ],
    );
    for (const source of bundle.sources) {
      const fact = slot?.providers.find((p) => p.provider === source.provider);
      await tx.query(
        `INSERT INTO weather_check_sources(check_id,provider,snapshot_id,selected_facts,is_usable,is_rain_risk,unusable_reason)
    VALUES($1,$2,$3,$4::jsonb,$5,$6,$7)`,
        [
          checkId,
          source.provider,
          source.snapshotId,
          json(fact || {}),
          fact?.usable || false,
          fact?.risk || false,
          fact?.usable ? null : source.message,
        ],
      );
    }
    // Sample the +30-minute horizon independently of the alert's arrival time.
    const sampleTime = new Date(now.getTime() + 30 * 60000),
      sample = slotAt(bundle, sampleTime);
    for (const provider of [...PROVIDERS, "CONSENSUS"]) {
      const fact = sample?.providers.find((p) => p.provider === provider);
      const predicted =
        provider === "CONSENSUS"
          ? sample && sample.validSources >= 2
            ? hasConsensus(sample)
            : null
          : fact?.usable
            ? fact.risk
            : null;
      await tx.query(
        `INSERT INTO forecast_verifications(id,check_id,provider,target_from,target_to,due_at,predicted_rain,demo_run_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          id(),
          checkId,
          provider,
          new Date(sampleTime.getTime() - 5 * 60000).toISOString(),
          new Date(sampleTime.getTime() + 5 * 60000).toISOString(),
          sampleTime.toISOString(),
          predicted,
          demoRun,
        ],
      );
    }
  });
  if (warning && slot) {
    const dedupeKey = `${groupId}:${group.current_plan_id}:${target.place_id}:${slot.time}:${mode}`;
    const existing = await one<any>(
      "SELECT * FROM alerts WHERE dedupe_key=$1",
      [dedupeKey],
    );
    if (existing) {
      alert = alertView(existing);
      proposal = existing.proposal_plan_id
        ? await planView(existing.proposal_plan_id, userId)
        : null;
      return { weather: bundle.summary, alert, proposal };
    }
    const alertId = id(),
      message = `${mode === "demo" ? "DEMO — " : ""}Có nguy cơ mưa tại ${p.name} trong khung giờ dự kiến; ${slot.rainVotes}/${slot.validSources} nguồn đồng thuận. Dữ liệu theo giờ, không xác định chính xác phút bắt đầu. Nhóm có thể cân nhắc đổi lịch.`;
    const row = (
      await db.query(
        `INSERT INTO alerts(id,group_id,weather_check_id,dedupe_key,message,demo_run_id)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(dedupe_key) DO NOTHING RETURNING *`,
        [alertId, groupId, checkId, dedupeKey, message, demoRun],
      )
    ).rows[0];
    if (!row) {
      const current = await one<any>(
        "SELECT * FROM alerts WHERE dedupe_key=$1",
        [dedupeKey],
      );
      return {
        weather: bundle.summary,
        alert: alertView(current),
        proposal: current.proposal_plan_id
          ? await planView(current.proposal_plan_id, userId)
          : null,
      };
    }
    // A member may request a check; proposal generation is performed on behalf of the actual leader.
    const leader = await one<any>(
      "SELECT user_id FROM group_members WHERE group_id=$1 AND role='LEADER' AND status='ACTIVE'",
      [groupId],
    );
    try {
      proposal = await generatePlan(
        groupId,
        leader.user_id,
        mode,
        "RAIN_CHANGE",
        bundle,
        {
          now,
          trigger: {
            placeId: p.id,
            weatherFactId: `weather:${slot.time}`,
            minutesAhead: Math.round(minutesAhead),
          },
          checkId,
          skipNotify: true,
        },
      );
      await db.query("UPDATE alerts SET proposal_plan_id=$1 WHERE id=$2", [
        proposal.id,
        alertId,
      ]);
      row.proposal_plan_id = proposal.id;
    } catch (error) {
      await activity(
        groupId,
        null,
        "PROPOSAL_UNAVAILABLE",
        "Đã cảnh báo mưa nhưng chưa tạo được phương án khả thi; trưởng nhóm cần xem lại lịch.",
      );
    }
    alert = alertView(row);
    emitGroup(groupId, "alert:created", { alert });
    await notifyGroup(
      groupId,
      "Cân nhắc điều chỉnh lịch",
      message,
      "RAIN_ALERT",
      proposal?.id || null,
      alertId,
    );
  }
  return { weather: bundle.summary, alert, proposal };
}
export async function rainReport(
  group: any,
  userId: string,
  input: {
    latitude: number;
    longitude: number;
    accuracyM: number;
    condition: "RAIN" | "DRY";
    observedAt?: string;
  },
) {
  const observedAt = input.observedAt ? new Date(input.observedAt) : new Date();
  assert(
    Math.abs(Date.now() - observedAt.getTime()) <= 5 * 60000,
    400,
    "Báo cáo phải được quan sát trong vòng năm phút gần nhất.",
  );
  const places = await wishlistRows(group.id);
  const nearby = places.some((p) => distanceKm(input, p) * 1000 <= 500);
  const trustedGps = input.accuracyM <= 100 && nearby;
  const reportId = id(),
    demoRun = group.mode === "DEMO" ? `demo-report:${reportId}` : null;
  let verified = trustedGps,
    method = trustedGps ? "GPS_NEAR_PLACE" : null;
  await db.transaction(async (tx) => {
    // Serialize simultaneous reports for one group, so two concurrent first reports
    // can corroborate each other on PostgreSQL as well as on the embedded engine.
    await tx.query("SELECT id FROM groups WHERE id=$1 FOR UPDATE", [group.id]);
    // Demo IDs differ per record; filter by group mode rather than matching a run ID.
    const recent = (
      await tx.query(
        `SELECT * FROM rain_reports WHERE group_id=$1 AND user_id<>$2 AND condition=$3
   AND reported_at>now()-interval '10 minutes' AND gps_accuracy_m<=200`,
        [group.id, userId, input.condition],
      )
    ).rows;
    const matches =
      input.accuracyM <= 200
        ? recent.filter(
            (r) =>
              Boolean(r.demo_run_id) === (group.mode === "DEMO") &&
              distanceKm(input, r) * 1000 <= 500,
          )
        : [];
    if (matches.length) {
      verified = true;
      method = "TWO_DISTINCT_MEMBERS";
      await tx.query(
        "UPDATE rain_reports SET validation_status='VERIFIED',verification_method='TWO_DISTINCT_MEMBERS' WHERE id=ANY($1::text[])",
        [matches.map((r) => r.id)],
      );
    }
    await tx.query(
      `INSERT INTO rain_reports(id,group_id,user_id,latitude,longitude,gps_accuracy_m,reported_at,condition,validation_status,verification_method,demo_run_id)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        reportId,
        group.id,
        userId,
        input.latitude,
        input.longitude,
        input.accuracyM,
        observedAt.toISOString(),
        input.condition,
        verified ? "VERIFIED" : "PENDING",
        method,
        demoRun,
      ],
    );
  });
  await verifyForecasts();
  emitGroup(group.id, "weather:updated", { reportId, verified });
  return {
    id: reportId,
    verified,
    message: verified
      ? "Đã xác nhận theo quy tắc vị trí hoặc thành viên; đây vẫn là báo cáo cộng đồng."
      : "Đã ghi nhận; cần thêm thành viên ở gần xác nhận hoặc vị trí đủ chính xác gần điểm đến.",
  };
}
export async function verifyForecasts() {
  const pending = (
    await db.query(`SELECT v.*,c.group_id,c.plan_item_id FROM forecast_verifications v JOIN weather_checks c ON c.id=v.check_id
  WHERE v.outcome='UNKNOWN' AND v.verified_at IS NULL AND v.target_to+interval '5 minutes'<=now() AND v.demo_run_id IS NULL ORDER BY v.due_at LIMIT 200`)
  ).rows;
  for (const v of pending) {
    const place = await one<any>(
      "SELECT p.latitude,p.longitude FROM places p JOIN plan_items i ON i.place_id=p.id WHERE i.id=$1",
      [v.plan_item_id],
    );
    const reports = place
      ? (
          await db.query(
            `SELECT * FROM rain_reports WHERE group_id=$1 AND validation_status='VERIFIED' AND demo_run_id IS NULL AND reported_at BETWEEN $2 AND $3`,
            [v.group_id, v.target_from, v.target_to],
          )
        ).rows.filter((r) => distanceKm(r, place) * 1000 <= 500)
      : [];
    const conditions = new Set(reports.map((r) => r.condition));
    if (!place || conditions.size !== 1 || v.predicted_rain === null) {
      const reason = !place
        ? "NO_TARGET_LOCATION"
        : v.predicted_rain === null
          ? "NO_USABLE_PREDICTION"
          : conditions.size > 1
            ? "CONFLICTING_OBSERVATIONS"
            : "NO_VERIFIED_OBSERVATION";
      await db.query(
        "UPDATE forecast_verifications SET verified_at=now(),evidence=$1::jsonb WHERE id=$2 AND verified_at IS NULL",
        [
          json({
            finalized: true,
            reason,
            reportIds: reports.map((r) => r.id),
          }),
          v.id,
        ],
      );
      continue;
    }
    const observed = reports[0].condition === "RAIN",
      predicted = v.predicted_rain;
    const outcome = predicted
      ? observed
        ? "TP"
        : "FP"
      : observed
        ? "FN"
        : "TN";
    await db.query(
      "UPDATE forecast_verifications SET observed_rain=$1,outcome=$2,verified_at=now(),evidence=$3::jsonb WHERE id=$4 AND verified_at IS NULL",
      [
        observed,
        outcome,
        json({
          finalized: true,
          type: "VERIFIED_COMMUNITY_REPORTS",
          reportIds: reports.map((r) => r.id),
          limitation: "Không phải trạm khí tượng; GPS và báo cáo có thể sai.",
        }),
        v.id,
      ],
    );
  }
}
export async function verificationStats(groupId: string) {
  await verifyForecasts();
  const row = await one<any>(
    `SELECT count(*) AS total,count(*) FILTER(WHERE outcome IN ('TP','TN')) AS correct,
 count(*) FILTER(WHERE outcome IN ('FP','FN')) AS incorrect,count(*) FILTER(WHERE outcome='UNKNOWN') AS unknown
 FROM forecast_verifications v JOIN weather_checks c ON c.id=v.check_id WHERE c.group_id=$1 AND v.provider='CONSENSUS' AND v.demo_run_id IS NULL`,
    [groupId],
  );
  const correct = Number(row.correct),
    incorrect = Number(row.incorrect),
    verified = correct + incorrect;
  return {
    verified,
    correct,
    incorrect,
    unknown: Number(row.unknown),
    accuracyPct: verified ? Math.round((correct / verified) * 1000) / 10 : null,
    note: "Chỉ tính mẫu thật có bằng chứng cộng đồng đã xác minh tại đúng vị trí và thời gian. Thiếu hoặc mâu thuẫn bằng chứng là UNKNOWN; dữ liệu DEMO bị loại. Mẫu nhỏ và thiên lệch báo cáo không đại diện độ chính xác khí tượng.",
  };
}
export function startWorker() {
  if (!config.workerEnabled) return () => {};
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const expired = (
        await db.query(
          "UPDATE plans SET status='EXPIRED' WHERE status='VOTING' AND vote_deadline<=now() RETURNING id,group_id",
        )
      ).rows;
      for (const plan of expired)
        emitGroup(plan.group_id, "plan:updated", { planId: plan.id });
      const groups = (
        await db.query(`SELECT g.*,m.user_id FROM groups g JOIN group_members m ON m.group_id=g.id AND m.role='LEADER' AND m.status='ACTIVE'
    WHERE g.mode='LIVE' AND g.current_plan_id IS NOT NULL AND g.trip_date=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`)
      ).rows;
      for (const g of groups) {
        const hour = minuteOf(dateOnly(g.trip_date), new Date()) / 60;
        if (hour >= g.start_hour - 1 && hour <= g.end_hour)
          await checkWeather(g.id, g.user_id, "live");
      }
      await verifyForecasts();
    } catch {
      console.warn(
        "Worker: không hoàn tất lần kiểm tra; sẽ thử lại ở chu kỳ tiếp theo.",
      );
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void tick(), config.pollMinutes * 60000);
  timer.unref();
  return () => clearInterval(timer);
}
