CREATE TABLE IF NOT EXISTS cpap_daily (
  usage_date date PRIMARY KEY CHECK (usage_date BETWEEN DATE '1970-01-01' AND DATE '2100-12-31'),
  minutes integer NOT NULL CHECK (minutes BETWEEN 0 AND 1440),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
