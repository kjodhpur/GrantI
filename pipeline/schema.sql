-- App tables only. Raw grants stay in Parquet (data/interim) and are queried with DuckDB.
CREATE TABLE IF NOT EXISTS foundations (
  object_id        text PRIMARY KEY,          -- IRS filing id
  ein              text NOT NULL,
  name             text,
  state            text,
  tax_period_end   date,
  only_preselected boolean,                   -- true = "contributions only to preselected charities"
  open_to_apps     boolean,                   -- true = not preselected-only AND lists application info
  contact_name     text,
  contact_email    text,
  contact_phone    text,
  deadlines        text,
  grants_paid_n    integer,
  grants_paid_usd  bigint,
  median_grant_usd numeric,
  foreign_grants_n integer,
  approved_future_n integer,
  approved_future_usd bigint,
  xml_batch_id     text
);
CREATE INDEX IF NOT EXISTS foundations_ein_idx  ON foundations (ein);
CREATE INDEX IF NOT EXISTS foundations_open_idx ON foundations (open_to_apps, grants_paid_usd DESC);

-- Customer outcomes: the moat. Written by the app, never by the pipeline.
CREATE TABLE IF NOT EXISTS outcomes (
  id          bigserial PRIMARY KEY,
  org_id      text NOT NULL,
  foundation_ein text NOT NULL,
  status      text NOT NULL CHECK (status IN ('approached','funded','declined')),
  amount_usd  bigint,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- One row per foundation (EIN), rolled up over all loaded filing years. This is what the matcher reads.
-- Written by build_profiles.py (truncate + reload). Never written by the app.
CREATE TABLE IF NOT EXISTS foundation_profiles (
  ein               text PRIMARY KEY,
  name              text,
  state             text,
  latest_tax_period date,
  years             integer[],               -- tax years included in the rollup
  only_preselected  boolean,
  open_to_apps      boolean,
  contact_name      text,
  contact_email     text,
  contact_phone     text,
  deadlines         text,
  app_materials     text,
  app_restrictions  text,
  grants_n          integer NOT NULL DEFAULT 0,
  grants_usd        bigint  NOT NULL DEFAULT 0,
  median_grant_usd  numeric,
  p25_grant_usd     numeric,
  p75_grant_usd     numeric,
  max_grant_usd     bigint,
  foreign_share     numeric,                 -- share of grant dollars paid to non-US recipients
  classified_share  numeric,                 -- share of grant dollars with a cause label (excl. unclassified + pass-through)
  causes            text[]  NOT NULL DEFAULT '{}',  -- causes with >=10% of classified dollars (fast filter)
  states            text[]  NOT NULL DEFAULT '{}',  -- US recipient states with >=5% of US dollars (fast filter)
  countries         text[]  NOT NULL DEFAULT '{}',  -- foreign recipient countries with any grants
  cause_mix         jsonb   NOT NULL DEFAULT '{}',  -- {cause: {usd, n}}
  geo_states        jsonb   NOT NULL DEFAULT '{}',  -- {ST: {usd, n}}
  geo_countries     jsonb   NOT NULL DEFAULT '{}',  -- {CC: {usd, n}}
  top_recipients    jsonb   NOT NULL DEFAULT '[]',  -- [{name, state, country, cause, usd}]
  trend             jsonb   NOT NULL DEFAULT '{}'   -- {year: {usd, n}}
);
CREATE INDEX IF NOT EXISTS fp_causes_idx    ON foundation_profiles USING gin (causes);
CREATE INDEX IF NOT EXISTS fp_states_idx    ON foundation_profiles USING gin (states);
CREATE INDEX IF NOT EXISTS fp_countries_idx ON foundation_profiles USING gin (countries);
CREATE INDEX IF NOT EXISTS fp_open_idx      ON foundation_profiles (open_to_apps, grants_usd DESC);
