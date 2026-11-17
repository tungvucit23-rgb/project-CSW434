import { db, one } from "./db.js";
import { config } from "./config.js";
import { dalatCatalog } from "./dalat-catalog.js";
import {
  atHour,
  hashPassword,
  id,
  json,
  todayVN,
  travelMinutes,
} from "./utils.js";

// Illustrative catalogue only. Coordinates, admission prices, opening hours and durations
// deliberately marked unverified in every record; do not use these as a travel directory.
const catalog: Record<string, [string, string, "INDOOR" | "OUTDOOR"][]> = {
  dalat: [
    ["Hồ Xuân Hương", "Thiên nhiên", "OUTDOOR"],
    ["Quảng trường Lâm Viên", "Tham quan", "OUTDOOR"],
    ["Bảo tàng Lâm Đồng", "Văn hóa", "INDOOR"],
    ["Nhà thờ Con Gà", "Văn hóa", "INDOOR"],
    ["Vườn hoa thành phố Đà Lạt", "Thiên nhiên", "OUTDOOR"],
    ["Dinh III Bảo Đại", "Văn hóa", "INDOOR"],
    ["Đường hầm điêu khắc", "Tham quan", "OUTDOOR"],
    ["Ga Đà Lạt", "Văn hóa", "INDOOR"],
    ["Thung lũng Tình Yêu", "Thiên nhiên", "OUTDOOR"],
    ["Đồi chè Cầu Đất", "Thiên nhiên", "OUTDOOR"],
    ["Hồ Tuyền Lâm", "Thiên nhiên", "OUTDOOR"],
    ["Thiền viện Trúc Lâm", "Văn hóa", "OUTDOOR"],
    ["Thác Datanla", "Thiên nhiên", "OUTDOOR"],
    ["Thác Prenn", "Thiên nhiên", "OUTDOOR"],
    ["Núi Langbiang", "Thiên nhiên", "OUTDOOR"],
    ["Đồi Robin", "Thiên nhiên", "OUTDOOR"],
    ["Chùa Linh Phước", "Văn hóa", "INDOOR"],
    ["Chùa Linh Sơn", "Văn hóa", "INDOOR"],
    ["Nhà thờ Domaine de Marie", "Văn hóa", "INDOOR"],
    ["Biệt thự Hằng Nga", "Tham quan", "INDOOR"],
    ["Dinh I Đà Lạt", "Văn hóa", "INDOOR"],
    ["Dinh II Đà Lạt", "Văn hóa", "INDOOR"],
    ["Vườn hoa Vạn Thành", "Thiên nhiên", "OUTDOOR"],
    ["Làng Cù Lần", "Tham quan", "OUTDOOR"],
    ["Ma Rừng Lữ Quán", "Thiên nhiên", "OUTDOOR"],
    ["Hồ Than Thở", "Thiên nhiên", "OUTDOOR"],
    ["Đồi Đa Phú", "Thiên nhiên", "OUTDOOR"],
    ["Đồi Thiên Phúc Đức", "Thiên nhiên", "OUTDOOR"],
    ["Chợ Đà Lạt", "Ẩm thực", "INDOOR"],
    ["XQ Sử Quán", "Văn hóa", "INDOOR"],
    ["Không gian cồng chiêng Tây Nguyên", "Văn hóa", "INDOOR"],
    ["Nhà lao thiếu nhi Đà Lạt", "Văn hóa", "INDOOR"],
    ["Vườn quốc gia Bidoup Núi Bà", "Thiên nhiên", "OUTDOOR"],
    ["Thác Cam Ly", "Thiên nhiên", "OUTDOOR"],
    ["Hồ Suối Vàng", "Thiên nhiên", "OUTDOOR"],
    ["Đồi cỏ hồng", "Thiên nhiên", "OUTDOOR"],
    ["Vườn ánh sáng Lumiere", "Tham quan", "INDOOR"],
    ["Bảo tàng Trà Long Đỉnh", "Văn hóa", "INDOOR"],
    ["Đà Lạt Milk Farm", "Tham quan", "OUTDOOR"],
    ["Nhà mục vụ Don Bosco Đà Lạt", "Văn hóa", "INDOOR"],
  ],
  vungtau: [
    ["Bãi Sau", "Biển", "OUTDOOR"],
    ["Bãi Trước", "Biển", "OUTDOOR"],
    ["Bảo tàng tỉnh Bà Rịa – Vũng Tàu", "Văn hóa", "INDOOR"],
    ["Bảo tàng Vũ khí cổ Robert Taylor", "Văn hóa", "INDOOR"],
    ["Mũi Nghinh Phong", "Thiên nhiên", "OUTDOOR"],
    ["Bạch Dinh", "Văn hóa", "INDOOR"],
    ["Hải đăng Vũng Tàu", "Tham quan", "OUTDOOR"],
    ["Nhà thờ Vũng Tàu", "Văn hóa", "INDOOR"],
    ["Tượng Chúa Kitô Vua", "Tham quan", "OUTDOOR"],
    ["Đồi Con Heo", "Thiên nhiên", "OUTDOOR"],
    ["Hòn Bà", "Văn hóa", "OUTDOOR"],
    ["Bãi Dứa", "Biển", "OUTDOOR"],
    ["Bãi Dâu", "Biển", "OUTDOOR"],
    ["Hồ Mây", "Tham quan", "OUTDOOR"],
    ["Núi Lớn", "Thiên nhiên", "OUTDOOR"],
    ["Núi Nhỏ", "Thiên nhiên", "OUTDOOR"],
    ["Thích Ca Phật Đài", "Văn hóa", "OUTDOOR"],
    ["Niết Bàn Tịnh Xá", "Văn hóa", "INDOOR"],
    ["Linh Sơn Cổ Tự", "Văn hóa", "INDOOR"],
    ["Đình Thắng Tam", "Văn hóa", "INDOOR"],
    ["Miếu Hòn Bà", "Văn hóa", "OUTDOOR"],
    ["Chùa Quan Âm Nam Hải", "Văn hóa", "INDOOR"],
    ["Công viên Bãi Trước", "Thiên nhiên", "OUTDOOR"],
    ["Công viên Thỏ Trắng", "Tham quan", "OUTDOOR"],
    ["Bến du thuyền Marina Vũng Tàu", "Tham quan", "OUTDOOR"],
    ["Làng bè Long Sơn", "Ẩm thực", "OUTDOOR"],
    ["Nhà Lớn Long Sơn", "Văn hóa", "INDOOR"],
    ["Núi Dinh", "Thiên nhiên", "OUTDOOR"],
    ["Chợ Vũng Tàu", "Ẩm thực", "INDOOR"],
    ["Chợ Xóm Lưới", "Ẩm thực", "INDOOR"],
    ["Nhà truyền thống cách mạng Vũng Tàu", "Văn hóa", "INDOOR"],
    ["Rạp chiếu phim Lotte Vũng Tàu", "Giải trí", "INDOOR"],
    ["Bãi Chí Linh", "Biển", "OUTDOOR"],
    ["Hồ Đá Xanh", "Thiên nhiên", "OUTDOOR"],
    ["Suối Tiên núi Dinh", "Thiên nhiên", "OUTDOOR"],
    ["Công viên Tam giác Bãi Trước", "Tham quan", "OUTDOOR"],
    ["Thư viện tỉnh Bà Rịa – Vũng Tàu", "Văn hóa", "INDOOR"],
    ["Trung tâm thương mại Lotte Mart Vũng Tàu", "Mua sắm", "INDOOR"],
    ["Đường ven biển Trần Phú", "Tham quan", "OUTDOOR"],
    ["Nhà lưu niệm Võ Thị Sáu", "Văn hóa", "INDOOR"],
  ],
};
export async function seed() {
  for (const [cityId, name, lat, lon, image] of [
    [
      "dalat",
      "Đà Lạt",
      11.9404,
      108.4583,
      "https://images.unsplash.com/photo-1570366583862-f91883984fde?auto=format&fit=crop&w=1200&q=80",
    ],
    [
      "vungtau",
      "Vũng Tàu",
      10.346,
      107.0843,
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
    ],
  ] as const) {
    await db.query(
      "INSERT INTO cities(id,name,latitude,longitude,image_url) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
      [cityId, name, lat, lon, image],
    );
    for (let i = 0; i < catalog[cityId].length; i++) {
      const [placeName, category, environment] = catalog[cityId][i];
      const price =
        category === "Biển" || i === 0 || i === 1
          ? 0
          : [30000, 50000, 80000, 100000, 40000][i % 5];
      const latOffset = ((i % 8) - 3.5) * 0.006,
        lonOffset = (Math.floor(i / 8) - 2) * 0.008;
      await db.query(
        `INSERT INTO places(id,city_id,name,category,environment,latitude,longitude,price_vnd,duration_min,open_hour,close_hour,image_url,description,data_quality)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT DO NOTHING`,
        [
          `${cityId}-${String(i + 1).padStart(2, "0")}`,
          cityId,
          placeName,
          category,
          environment,
          lat + latOffset,
          lon + lonOffset,
          price,
          [60, 45, 60, 45][i % 4],
          8,
          20,
          environment === "OUTDOOR"
            ? image
            : "https://images.unsplash.com/photo-1566127992631-137a642a90f4?auto=format&fit=crop&w=800&q=80",
          `${placeName} — địa điểm trong danh mục đồ án. Phân loại trong/ngoài trời được đơn giản hóa. Hãy xác minh thông tin thực tế trước chuyến đi.`,
          "THAM KHẢO: tọa độ mô phỏng gần trung tâm, giờ mở cửa, giá và thời gian tham quan chưa xác minh; ảnh minh họa.",
        ],
      );
    }
  }
  // Idempotent catalogue correction. Keep original IDs and every referencing row.
  // Never overwrite an operator-maintained production record with a seed update.
  for (const place of dalatCatalog) {
    await db.query(
      `INSERT INTO places(id,city_id,name,category,environment,latitude,longitude,price_vnd,duration_min,open_hour,close_hour,image_url,description,data_quality)
       VALUES($1,'dalat',$2,$3,$4,$5,$6,0,60,8,20,'',$7,$8)
       ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,category=EXCLUDED.category,environment=EXCLUDED.environment,
       latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,image_url=EXCLUDED.image_url,description=EXCLUDED.description,data_quality=EXCLUDED.data_quality
       WHERE places.data_quality LIKE 'THAM KHẢO:%' OR places.data_quality LIKE 'OSM:%'`,
      [place.id, place.name, place.category, place.environment, place.latitude, place.longitude, place.description,
       `OSM: ${place.sourceUrl} · ${place.sourceTimestamp}. ${place.coordinateKind === 'OSM_NODE' ? 'Tọa độ điểm OSM' : 'Tâm hình học OSM; không phải cổng vào'}. Chưa xác minh thực địa hoặc tình trạng hoạt động. Trong/ngoài trời ước tính. Giá, giờ và thời lượng trong trường API cũ là giả định lập lịch, không phải thông tin du lịch; dùng visitorInfo cho dữ kiện.`],
    );
  }
  if (
    !config.seedDemo ||
    !config.allowDemo ||
    (await one("SELECT id FROM groups WHERE id=$1", ["demo-group"]))
  )
    return;
  const password = await hashPassword("DemoOnly!437");
  await db.transaction(async (tx) => {
    for (const [userId, name, email, color] of [
      ["demo-leader", "Minh Anh", "leader@dichung.demo", "#397A68"],
      ["demo-member", "Hoàng Nam", "member@dichung.demo", "#D18D4B"],
      ["demo-third", "Thảo Vy", "third@dichung.demo", "#8D71AF"],
    ])
      await tx.query(
        "INSERT INTO users(id,name,email,password_hash,avatar_color) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
        [userId, name, email, password, color],
      );
    const date = todayVN();
    await tx.query(
      `INSERT INTO groups(id,name,city_id,trip_date,start_hour,end_hour,budget_per_person_vnd,invite_code,invite_expires_at,mode)
      VALUES($1,$2,$3,$4,8,20,600000,$5,$6,'DEMO')`,
      [
        "demo-group",
        "Một ngày Đà Lạt",
        "dalat",
        date,
        "DICHUNG",
        new Date(Date.now() + 365 * 86400000).toISOString(),
      ],
    );
    for (const userId of ["demo-leader", "demo-member", "demo-third"])
      await tx.query(
        "INSERT INTO group_members(group_id,user_id,role) VALUES($1,$2,$3)",
        ["demo-group", userId, userId === "demo-leader" ? "LEADER" : "MEMBER"],
      );
    for (let i = 1; i <= 8; i++)
      await tx.query(
        "INSERT INTO wishlist_items(id,group_id,place_id,added_by) VALUES($1,$2,$3,$4)",
        [
          id(),
          "demo-group",
          `dalat-${String(i).padStart(2, "0")}`,
          "demo-leader",
        ],
      );
    const planId = id();
    await tx.query(
      `INSERT INTO plans(id,group_id,version_no,kind,status,engine,demo,summary,created_by,vote_deadline,demo_run_id)
     VALUES($1,'demo-group',1,'INITIAL','APPROVED','RULE_BASED',true,$2,'demo-leader',$3,'seed-demo')`,
      [
        planId,
        "Lịch mẫu đã chốt để khám phá ứng dụng. Dữ liệu địa điểm và thời tiết minh họa; chưa sử dụng LLM.",
        atHour(date, 23),
      ],
    );
    const { rows: places } = await tx.query(
      "SELECT * FROM places WHERE id=ANY($1::text[]) ORDER BY id",
      [
        [
          "dalat-01",
          "dalat-02",
          "dalat-05",
          "dalat-03",
          "dalat-06",
          "dalat-08",
        ],
      ],
    );
    let time = new Date(atHour(date, 8)).getTime();
    let prev: any = null;
    for (let i = 0; i < places.length; i++) {
      const p = places[i];
      const travel = travelMinutes(
        prev ? { latitude: prev.latitude, longitude: prev.longitude } : null,
        p,
      );
      time += travel * 60000;
      const end = time + p.duration_min * 60000;
      await tx.query(
        `INSERT INTO plan_items(id,plan_id,place_id,position,starts_at,ends_at,travel_from_prev_min,estimated_cost_vnd,reason,fact_refs)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
        [
          id(),
          planId,
          p.id,
          i,
          new Date(time).toISOString(),
          new Date(end).toISOString(),
          travel,
          p.price_vnd,
          "Lịch minh họa để nhóm thử biểu quyết và thay đổi phương án.",
          json([`place:${p.id}`]),
        ],
      );
      time = end;
      prev = p;
    }
    await tx.query("UPDATE groups SET current_plan_id=$1 WHERE id=$2", [
      planId,
      "demo-group",
    ]);
    for (const uid of ["demo-leader", "demo-member", "demo-third"])
      await tx.query(
        "INSERT INTO plan_ballots(plan_id,user_id,choice,voted_at) VALUES($1,$2,NULL,NULL)",
        [planId, uid],
      );
    await tx.query(
      `INSERT INTO activity_logs(id,group_id,action,message) VALUES($1,'demo-group','DEMO_SEEDED',$2)`,
      [
        id(),
        "Đã chuẩn bị nhóm DEMO với ba tài khoản. Lịch mẫu được nạp sẵn; mọi biểu quyết mới đều cần người dùng tự bấm.",
      ],
    );
  });
}
