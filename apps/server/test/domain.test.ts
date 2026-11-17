import test from "node:test";
import assert from "node:assert/strict";
process.env.PGLITE_DATA_DIR = ":memory:";
process.env.ENABLE_WORKER = "false";
const {
  classifyRain,
  rainRisk,
  hasConsensus,
  normalizeOpenMeteo,
  aggregateWeather,
  PROVIDERS,
} = await import("../src/weather.js");
const { buildInput, validateOutput, hasUnsupportedNumber, WEATHER_REASONS } =
  await import("../src/planner.js");
const { Database } = await import("../src/db.js");
const { sameConstraints, verifyForecasts } = await import("../src/services.js");
const { atHour, hashPassword, verifyPassword } = await import(
  "../src/utils.js"
);
const date = "2026-10-17";
const sources = (rain = true) =>
  PROVIDERS.map((provider) => ({
    provider,
    status: "OK" as const,
    fetchedAt: new Date().toISOString(),
    message: "test",
    snapshotId: null,
    hours: Array.from({ length: 24 }, (_, h) => ({
      time: atHour(date, h),
      rainMmH: rain && h === 11 ? 3 : 0,
      probabilityPct: rain && h === 11 ? 85 : 10,
    })),
  }));
test("rain classification boundaries are deterministic project rules", () => {
  assert.equal(classifyRain(null), "UNKNOWN");
  assert.equal(classifyRain(-1), "UNKNOWN");
  assert.equal(classifyRain(0.19), "NONE");
  assert.equal(classifyRain(0.2), "LIGHT");
  assert.equal(classifyRain(2.5), "MODERATE");
  assert.equal(classifyRain(7.6), "HEAVY");
  assert.equal(rainRisk(1, null), false);
  assert.equal(rainRisk(null, 90), false);
  assert.equal(rainRisk(0.2, 60), true);
  assert.equal(rainRisk(0.1, 90), false);
});
test("constraint snapshots compare structurally despite JSONB key reordering", () => {
  assert.equal(
    sameConstraints(
      { mode: "DEMO", budget: 100000, city: "dalat" },
      { city: "dalat", budget: 100000, mode: "DEMO" },
    ),
    true,
  );
  assert.equal(
    sameConstraints(
      { mode: "DEMO", budget: 100000 },
      { mode: "LIVE", budget: 100000 },
    ),
    false,
  );
  assert.equal(
    sameConstraints(
      { mode: "DEMO", budget: 100000 },
      { mode: "DEMO", budget: 90000 },
    ),
    false,
  );
  assert.equal(sameConstraints({}, { mode: "DEMO" }), false);
});
test("PostgreSQL DATE driver parser preserves the calendar day without timezone conversion", async () => {
  const { default: pg } = await import("pg");
  assert.equal(
    pg.types.getTypeParser(1082, "text")("2026-10-17"),
    "2026-10-17",
  );
});
test("majority is about providers, not a fabricated probability", () => {
  const a = sources();
  a[2].status = "MISSING" as any;
  a[2].hours = [];
  const result = aggregateWeather(date, a);
  const slot = result.slots[11];
  assert.equal(slot.rainVotes, 2);
  assert.equal(slot.validSources, 2);
  assert.equal(slot.probabilityPct, 85);
  assert.equal(hasConsensus(slot), true);
  a[1].hours[11].probabilityPct = 10;
  assert.equal(hasConsensus(aggregateWeather(date, a).slots[11]), false);
  a[1].status = "MISSING" as any;
  assert.equal(hasConsensus(aggregateWeather(date, a).slots[11]), false);
});
test("missing probability or stale data cannot vote; contiguous windows join", () => {
  const a = sources();
  a[0].hours[11].probabilityPct = null as any;
  a[1].status = "STALE" as any;
  assert.equal(aggregateWeather(date, a).slots[11].validSources, 1);
  const b = sources();
  for (const p of b) {
    p.hours[12].rainMmH = 3;
    p.hours[12].probabilityPct = 85;
  }
  assert.equal(aggregateWeather(date, b).rainWindows.length, 1);
  assert.equal(aggregateWeather(date, b).rainWindows[0].end, atHour(date, 13));
});
test("Open-Meteo preceding hour is aligned with interval start", () => {
  const time = Date.parse(atHour(date, 12)) / 1000;
  const result = normalizeOpenMeteo({
    hourly: {
      time: [time],
      precipitation: [3],
      precipitation_probability: [85],
    },
  });
  assert.equal(result[0].time, atHour(date, 11));
  assert.equal(result[0].rainMmH, 3);
});
function input(rain = true) {
  const places = [
    {
      id: "inside",
      name: "Bảo tàng",
      environment: "INDOOR",
      category: "Văn hóa",
      open_hour: 8,
      close_hour: 20,
      duration_min: 60,
      price_vnd: 50000,
      latitude: 11.94,
      longitude: 108.45,
      data_quality: "test",
    },
    {
      id: "outside",
      name: "Công viên",
      environment: "OUTDOOR",
      category: "Thiên nhiên",
      open_hour: 8,
      close_hour: 20,
      duration_min: 60,
      price_vnd: 0,
      latitude: 11.95,
      longitude: 108.46,
      data_quality: "test",
    },
  ];
  return buildInput({
    group: {
      trip_date: date,
      start_hour: 8,
      end_hour: 18,
      budget_per_person_vnd: 100000,
    },
    places,
    weather: aggregateWeather(date, sources(rain)),
    task: "INITIAL",
    currentItems: [],
    planningNow: new Date(atHour(date, 8)),
    demo: false,
  });
}
function output() {
  return {
    summary: "Ưu tiên không gian trong nhà.",
    items: [
      {
        placeId: "inside",
        startMinute: 660,
        endMinute: 720,
        reason: "Phù hợp giờ mở cửa và không gian trong nhà.",
        factIds: ["place:inside"],
      },
    ],
  };
}
test("valid indoor schedule passes without confusing không with khô", () => {
  const checked = validateOutput(output(), input());
  assert.equal(checked.items[0].costVnd, 50000);
  assert.equal(checked.items[0].travelMin, 0);
});
test("invented places, duplicate IDs, unsupported numeric prose and invalid times are rejected", () => {
  const invented = output();
  invented.items[0].placeId = "invented";
  assert.throws(() => validateOutput(invented, input()), /UNKNOWN/);
  const numeric = output();
  numeric.items[0].reason = "Giá năm trăm nghìn đồng.";
  assert.throws(() => validateOutput(numeric, input()), /UNSUPPORTED/);
  numeric.items[0].reason = "Xác suất 95%.";
  assert.throws(() => validateOutput(numeric, input()), /UNSUPPORTED/);
  const duration = output();
  duration.items[0].endMinute = 730;
  assert.throws(() => validateOutput(duration, input()), /TIME/);
  const outside = output();
  outside.items[0].placeId = "outside";
  outside.items[0].factIds = ["place:outside"];
  assert.throws(() => validateOutput(outside, input()), /OUTDOOR_IN_RAIN/);
  assert.equal(
    hasUnsupportedNumber("Có nguy cơ mưa; ưu tiên trong nhà."),
    false,
  );
});
test("weather facts must match the visit interval and claims remain probabilistic", () => {
  const wrong = output();
  wrong.items[0].factIds.push(`weather:${atHour(date, 8)}`);
  assert.throws(() => validateOutput(wrong, input()), /WRONG_INTERVAL/);
  const rain = output();
  rain.items[0].reason = "Có nguy cơ mưa.";
  assert.throws(() => validateOutput(rain, input()), /WITHOUT_FACT/);
  rain.items[0].factIds.push(`weather:${atHour(date, 11)}`);
  assert.throws(() => validateOutput(rain, input()), /NOT_APPROVED/);
  rain.items[0].reason = WEATHER_REASONS.RAIN_INDOOR;
  assert.doesNotThrow(() => validateOutput(rain, input()));
  rain.items[0].reason = "Chắc chắn mưa.";
  assert.throws(() => validateOutput(rain, input()), /CERTAINTY/);
});
test("rain claims are restricted to code-approved phrases grounded in corresponding facts", () => {
  const dry = input(false),
    claim = output();
  claim.summary = "Mưa lớn có thể ảnh hưởng chuyến đi.";
  claim.items[0].factIds.push(`weather:${atHour(date, 11)}`);
  assert.throws(() => validateOutput(claim, dry), /SUMMARY_WEATHER/);
  claim.summary = "Phương án để nhóm biểu quyết.";
  claim.items[0].reason = "Các nguồn cho thấy có nguy cơ mưa lớn tại điểm đến.";
  assert.throws(() => validateOutput(claim, dry), /NOT_APPROVED/);
  claim.items[0].reason = WEATHER_REASONS.RAIN_INDOOR;
  assert.throws(() => validateOutput(claim, dry), /NOT_APPROVED/);
  claim.items[0].reason = WEATHER_REASONS.NO_CONSENSUS;
  assert.doesNotThrow(() => validateOutput(claim, dry));
});
test("fixed prefix remains code-owned for rain changes", () => {
  const base = input();
  const places = [
    {
      id: "inside",
      name: "Bảo tàng",
      environment: "INDOOR",
      category: "Văn hóa",
      open_hour: 8,
      close_hour: 20,
      duration_min: 60,
      price_vnd: 50000,
      latitude: 11.94,
      longitude: 108.45,
    },
  ];
  const changed = buildInput({
    group: {
      trip_date: date,
      start_hour: 8,
      end_hour: 18,
      budget_per_person_vnd: 100000,
    },
    places,
    weather: aggregateWeather(date, sources()),
    task: "RAIN_CHANGE",
    currentItems: [
      {
        place_id: "inside",
        starts_at: atHour(date, 8),
        ends_at: atHour(date, 9),
        reason: "Đã bắt đầu.",
        fact_refs: ["place:inside"],
        travel_from_prev_min: 0,
        estimated_cost_vnd: 50000,
      },
    ],
    planningNow: new Date(atHour(date, 8.5)),
    demo: false,
  });
  assert.equal(changed.fixedPrefixItems.length, 1);
  assert.equal(changed.allowedPlaces.length, 0);
  assert.equal(changed.groupConstraints.remainingBudgetVnd, 50000);
});
test("PGlite transaction serializes reads and rolls back whole operations", async () => {
  const isolated = new Database(undefined, ":memory:");
  try {
    await isolated.query("CREATE TABLE counter(value integer NOT NULL)");
    await isolated.query("INSERT INTO counter VALUES(0)");
    const increment = () =>
      isolated.transaction(async (tx) => {
        const { rows } = await tx.query("SELECT value FROM counter");
        await new Promise((r) => setTimeout(r, 5));
        await tx.query("UPDATE counter SET value=$1", [rows[0].value + 1]);
      });
    await Promise.all([increment(), increment(), increment()]);
    assert.equal(
      (await isolated.query("SELECT value FROM counter")).rows[0].value,
      3,
    );
    await assert.rejects(
      isolated.transaction(async (tx) => {
        await tx.query("UPDATE counter SET value=99");
        throw new Error("rollback");
      }),
      /rollback/,
    );
    assert.equal(
      (await isolated.query("SELECT value FROM counter")).rows[0].value,
      3,
    );
  } finally {
    await isolated.close();
  }
});
test("scrypt hashes are salted and passwords compare safely", async () => {
  const first = await hashPassword("a-secure-password");
  const second = await hashPassword("a-secure-password");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("a-secure-password", first), true);
  assert.equal(await verifyPassword("wrong", first), false);
});
test("verification finalizes missing evidence without starving newer samples and waits for window closure", async () => {
  const { db } = await import("../src/db.js");
  await db.migrate();
  try {
    await db.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO cities(id,name,latitude,longitude,image_url) VALUES('test','Test',11.94,108.45,'')",
      );
      await tx.query(
        "INSERT INTO users(id,name,email,password_hash) VALUES('test-user','Test','test@example.test','not-a-real-hash')",
      );
      await tx.query(
        "INSERT INTO groups(id,name,city_id,trip_date,budget_per_person_vnd,invite_code,invite_expires_at,mode) VALUES('test-group','Test','test',CURRENT_DATE,100000,'TEST',now()+interval '1 day','LIVE')",
      );
      await tx.query(
        "INSERT INTO places(id,city_id,name,category,environment,latitude,longitude,price_vnd,duration_min,open_hour,close_hour,image_url,description,data_quality) VALUES('test-place','test','Test','Test','OUTDOOR',11.94,108.45,0,60,8,20,'','','test')",
      );
      await tx.query(
        "INSERT INTO plans(id,group_id,version_no,kind,status,engine,demo,summary,created_by,vote_deadline) VALUES('test-plan','test-group',1,'INITIAL','APPROVED','RULE_BASED',false,'Test','test-user',now())",
      );
      await tx.query(
        "INSERT INTO plan_items(id,plan_id,place_id,position,starts_at,ends_at,travel_from_prev_min,estimated_cost_vnd,reason) VALUES('test-item','test-plan','test-place',0,now()-interval '2 hours',now()+interval '1 hour',0,0,'test')",
      );
      for (const c of ["old", "new", "open"])
        await tx.query(
          "INSERT INTO weather_checks(id,group_id,plan_item_id,target_from,target_to,rule_version,decision) VALUES($1,'test-group','test-item',now()-interval '2 hours',now()+interval '1 hour','test','TEST')",
          [c],
        );
      await tx.query(
        "INSERT INTO forecast_verifications(id,check_id,provider,target_from,target_to,due_at,predicted_rain) SELECT 'old-'||n,'old','old-'||n,now()-interval '65 minutes',now()-interval '55 minutes',now()-interval '60 minutes',true FROM generate_series(1,200) n",
      );
      await tx.query(
        "INSERT INTO forecast_verifications(id,check_id,provider,target_from,target_to,due_at,predicted_rain) VALUES('new','new','CONSENSUS',now()-interval '25 minutes',now()-interval '15 minutes',now()-interval '20 minutes',true),('open','open','CONSENSUS',now()-interval '6 minutes',now()+interval '4 minutes',now()-interval '1 minute',true)",
      );
      await tx.query(
        "INSERT INTO rain_reports(id,group_id,user_id,latitude,longitude,gps_accuracy_m,reported_at,condition,validation_status) VALUES('observation','test-group','test-user',11.94,108.45,30,now()-interval '20 minutes','RAIN','VERIFIED')",
      );
    });
    await verifyForecasts();
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS count FROM forecast_verifications WHERE check_id='old' AND verified_at IS NOT NULL AND outcome='UNKNOWN'",
        )
      ).rows[0].count,
      200,
    );
    await verifyForecasts();
    assert.equal(
      (
        await db.query(
          "SELECT outcome FROM forecast_verifications WHERE id='new'",
        )
      ).rows[0].outcome,
      "TP",
    );
    assert.equal(
      (
        await db.query(
          "SELECT verified_at FROM forecast_verifications WHERE id='open'",
        )
      ).rows[0].verified_at,
      null,
    );
  } finally {
    await db.close();
  }
});
