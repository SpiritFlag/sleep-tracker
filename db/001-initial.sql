CREATE TABLE IF NOT EXISTS sleep_sessions (
  id uuid PRIMARY KEY,
  started_at timestamptz NOT NULL CHECK (isfinite(started_at)),
  ended_at timestamptz CHECK (ended_at IS NULL OR isfinite(ended_at)),
  sleep_type text NOT NULL DEFAULT 'unspecified' CHECK (sleep_type IN ('unspecified','night','nap')),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 10000),
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at > started_at),
  EXCLUDE USING gist (tstzrange(started_at, ended_at, '[)') WITH &&) WHERE (deleted_at IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_running_sleep ON sleep_sessions ((true)) WHERE ended_at IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS sleep_sessions_start ON sleep_sessions (started_at DESC);
