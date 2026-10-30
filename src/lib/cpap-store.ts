import { database, type Database } from "./store";
import type { CpapEntry } from "./cpap";
export async function readCpap(
  month: string,
  db: Database = database(),
): Promise<CpapEntry[]> {
  const { rows } = await db.query(
    `SELECT usage_date::text AS date, minutes, version FROM cpap_daily WHERE usage_date >= $1::date AND usage_date < ($1::date + interval '1 month') ORDER BY usage_date DESC`,
    [`${month}-01`],
  );
  return rows.map((r) => ({
    date: String(r.date),
    minutes: Number(r.minutes),
    version: Number(r.version),
  }));
}
export async function saveCpap(
  input: CpapEntry,
  db: Database = database(),
): Promise<CpapEntry> {
  const { rows } =
    input.version === 0
      ? await db.query(
          `INSERT INTO cpap_daily (usage_date,minutes) VALUES ($1,$2) ON CONFLICT (usage_date) DO NOTHING RETURNING usage_date::text AS date,minutes,version`,
          [input.date, input.minutes],
        )
      : await db.query(
          `UPDATE cpap_daily SET minutes=$3,version=version+1,updated_at=now() WHERE usage_date=$1 AND version=$2 RETURNING usage_date::text AS date,minutes,version`,
          [input.date, input.version, input.minutes],
        );
  if (!rows.length)
    throw Object.assign(new Error("stale-record"), { code: "STALE" });
  const r = rows[0];
  return {
    date: String(r.date),
    minutes: Number(r.minutes),
    version: Number(r.version),
  };
}
