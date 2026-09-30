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
