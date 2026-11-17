CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL, avatar_color TEXT NOT NULL DEFAULT '#437A68',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cities (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, latitude DOUBLE PRECISION NOT NULL,
 longitude DOUBLE PRECISION NOT NULL, timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh', image_url TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS places (
 id TEXT PRIMARY KEY, city_id TEXT NOT NULL REFERENCES cities(id), name TEXT NOT NULL,
 category TEXT NOT NULL, environment TEXT NOT NULL CHECK(environment IN ('INDOOR','OUTDOOR')),
 latitude DOUBLE PRECISION NOT NULL, longitude DOUBLE PRECISION NOT NULL,
 price_vnd INTEGER NOT NULL CHECK(price_vnd>=0), duration_min INTEGER NOT NULL CHECK(duration_min>0),
 open_hour INTEGER NOT NULL CHECK(open_hour BETWEEN 0 AND 23), close_hour INTEGER NOT NULL CHECK(close_hour BETWEEN 1 AND 24),
 image_url TEXT NOT NULL, description TEXT NOT NULL, data_quality TEXT NOT NULL,
 CHECK(close_hour>open_hour)
);
CREATE TABLE IF NOT EXISTS groups (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, city_id TEXT NOT NULL REFERENCES cities(id), trip_date DATE NOT NULL,
 start_hour INTEGER NOT NULL DEFAULT 8, end_hour INTEGER NOT NULL DEFAULT 20,
 budget_per_person_vnd INTEGER NOT NULL CHECK(budget_per_person_vnd>=0),
 invite_code TEXT NOT NULL UNIQUE, invite_expires_at TIMESTAMPTZ NOT NULL,
 current_plan_id TEXT, mode TEXT NOT NULL CHECK(mode IN ('DEMO','LIVE')) DEFAULT 'LIVE',
 revision INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(start_hour>=0 AND end_hour<=24 AND start_hour<end_hour)
);
CREATE TABLE IF NOT EXISTS group_members (
 group_id TEXT NOT NULL REFERENCES groups(id), user_id TEXT NOT NULL REFERENCES users(id),
 role TEXT NOT NULL CHECK(role IN ('LEADER','MEMBER')), preferences JSONB NOT NULL DEFAULT '{}',
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','LEFT')), joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(group_id,user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_leader ON group_members(group_id) WHERE role='LEADER' AND status='ACTIVE';
CREATE TABLE IF NOT EXISTS wishlist_items (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id), place_id TEXT NOT NULL REFERENCES places(id),
 added_by TEXT NOT NULL REFERENCES users(id), note TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(group_id,place_id)
);
CREATE TABLE IF NOT EXISTS llm_runs (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id), task TEXT NOT NULL,
 model TEXT NOT NULL, prompt_version TEXT NOT NULL, input_json JSONB NOT NULL, output_json JSONB,
 validation_errors JSONB NOT NULL DEFAULT '[]', attempt_no INTEGER NOT NULL, status TEXT NOT NULL,
 demo_run_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS plans (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id), version_no INTEGER NOT NULL,
 base_plan_id TEXT REFERENCES plans(id), kind TEXT NOT NULL CHECK(kind IN ('INITIAL','RAIN_CHANGE','MANUAL_CHANGE')),
 status TEXT NOT NULL CHECK(status IN ('DRAFT','VOTING','APPROVED','REJECTED','EXPIRED','STALE')),
 engine TEXT NOT NULL CHECK(engine IN ('LLM','RULE_BASED')), demo BOOLEAN NOT NULL DEFAULT false,
 summary TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id), llm_run_id TEXT REFERENCES llm_runs(id),
 weather_check_id TEXT, vote_deadline TIMESTAMPTZ NOT NULL, demo_run_id TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(group_id,version_no)
);
CREATE TABLE IF NOT EXISTS plan_items (
 id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES plans(id), place_id TEXT NOT NULL REFERENCES places(id),
 position INTEGER NOT NULL, starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ NOT NULL,
 travel_from_prev_min INTEGER NOT NULL CHECK(travel_from_prev_min>=0), estimated_cost_vnd INTEGER NOT NULL CHECK(estimated_cost_vnd>=0),
 reason TEXT NOT NULL, fact_refs JSONB NOT NULL DEFAULT '[]', UNIQUE(plan_id,position), UNIQUE(plan_id,place_id), CHECK(ends_at>starts_at)
);
CREATE TABLE IF NOT EXISTS plan_ballots (
 plan_id TEXT NOT NULL REFERENCES plans(id), user_id TEXT NOT NULL REFERENCES users(id),
 choice TEXT CHECK(choice IN ('YES','NO')), voted_at TIMESTAMPTZ, PRIMARY KEY(plan_id,user_id)
);
CREATE TABLE IF NOT EXISTS comments (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id), author_id TEXT NOT NULL REFERENCES users(id),
 place_id TEXT REFERENCES places(id), proposal_plan_id TEXT REFERENCES plans(id), content TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), edited_at TIMESTAMPTZ, deleted_at TIMESTAMPTZ,
 CHECK(num_nonnulls(place_id,proposal_plan_id)=1)
);
CREATE TABLE IF NOT EXISTS weather_snapshots (
 id TEXT PRIMARY KEY, provider TEXT NOT NULL, model_name TEXT, latitude DOUBLE PRECISION NOT NULL, longitude DOUBLE PRECISION NOT NULL,
 fetched_at TIMESTAMPTZ NOT NULL, issued_at TIMESTAMPTZ, raw_payload JSONB NOT NULL, normalized_forecast JSONB NOT NULL,
 demo_run_id TEXT
);
CREATE TABLE IF NOT EXISTS weather_checks (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id), plan_item_id TEXT REFERENCES plan_items(id),
 target_from TIMESTAMPTZ NOT NULL, target_to TIMESTAMPTZ NOT NULL, checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 rule_version TEXT NOT NULL, decision TEXT NOT NULL, demo_run_id TEXT
);
CREATE TABLE IF NOT EXISTS weather_check_sources (
 check_id TEXT NOT NULL REFERENCES weather_checks(id), provider TEXT NOT NULL, snapshot_id TEXT REFERENCES weather_snapshots(id),
 selected_facts JSONB NOT NULL, is_usable BOOLEAN NOT NULL, is_rain_risk BOOLEAN NOT NULL, unusable_reason TEXT,
 PRIMARY KEY(check_id,provider)
);
CREATE TABLE IF NOT EXISTS rain_reports (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id), user_id TEXT NOT NULL REFERENCES users(id),
 latitude DOUBLE PRECISION NOT NULL, longitude DOUBLE PRECISION NOT NULL, gps_accuracy_m DOUBLE PRECISION NOT NULL,
 reported_at TIMESTAMPTZ NOT NULL, condition TEXT NOT NULL CHECK(condition IN ('RAIN','DRY')),
 validation_status TEXT NOT NULL CHECK(validation_status IN ('PENDING','VERIFIED','REJECTED')),
 verification_method TEXT, demo_run_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS forecast_verifications (
 id TEXT PRIMARY KEY, check_id TEXT NOT NULL REFERENCES weather_checks(id), provider TEXT NOT NULL,
 target_from TIMESTAMPTZ NOT NULL, target_to TIMESTAMPTZ NOT NULL, due_at TIMESTAMPTZ NOT NULL,
 verified_at TIMESTAMPTZ, predicted_rain BOOLEAN, observed_rain BOOLEAN, evidence JSONB NOT NULL DEFAULT '{}',
 outcome TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK(outcome IN ('TP','FP','TN','FN','UNKNOWN')), demo_run_id TEXT,
 UNIQUE(check_id,provider)
);
CREATE TABLE IF NOT EXISTS alerts (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id), weather_check_id TEXT REFERENCES weather_checks(id),
 proposal_plan_id TEXT REFERENCES plans(id), dedupe_key TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'OPEN', message TEXT NOT NULL, demo_run_id TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notifications (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), group_id TEXT REFERENCES groups(id),
 type TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, alert_id TEXT REFERENCES alerts(id),
 plan_id TEXT REFERENCES plans(id), payload JSONB NOT NULL DEFAULT '{}', read_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS activity_logs (
 id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id), actor_id TEXT REFERENCES users(id),
 action TEXT NOT NULL, message TEXT NOT NULL, entity_type TEXT, entity_id TEXT,
 before_data JSONB, after_data JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS provider_request_log (
 provider TEXT NOT NULL, requested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comments_group_time ON comments(group_id,created_at);
CREATE INDEX IF NOT EXISTS notifications_user_read ON notifications(user_id,read_at,created_at DESC);
CREATE INDEX IF NOT EXISTS weather_snapshot_lookup ON weather_snapshots(provider,latitude,longitude,fetched_at DESC);
CREATE INDEX IF NOT EXISTS rain_reports_lookup ON rain_reports(group_id,reported_at DESC);
CREATE INDEX IF NOT EXISTS weather_checks_group_time ON weather_checks(group_id,checked_at DESC);
CREATE INDEX IF NOT EXISTS provider_request_time ON provider_request_log(provider,requested_at);
CREATE UNIQUE INDEX IF NOT EXISTS plan_group_id ON plans(group_id,id);
ALTER TABLE plans ADD COLUMN IF NOT EXISTS constraints_json JSONB NOT NULL DEFAULT '{}';
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='group_current_plan_same_group') THEN
  ALTER TABLE groups ADD CONSTRAINT group_current_plan_same_group FOREIGN KEY(id,current_plan_id) REFERENCES plans(group_id,id);
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='plan_weather_check_fk') THEN
  ALTER TABLE plans ADD CONSTRAINT plan_weather_check_fk FOREIGN KEY(weather_check_id) REFERENCES weather_checks(id);
 END IF;
END $$;
