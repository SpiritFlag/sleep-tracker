import pg from "pg";
import { attachDatabasePool } from "@vercel/functions";
import type { Session } from "./sleep";
export interface Database {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
}
let pool: pg.Pool | undefined;
export function database(): Database {
  if (!process.env.DATABASE_URL) throw new Error("database-not-configured");
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 10000,
      query_timeout: 15000,
    });
    attachDatabasePool(pool);
  }
  return pool as unknown as Database;
}
const projection = `id, started_at, ended_at, sleep_type, note, deleted_at, version`;
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
export function session(row: Record<string, unknown>): Session {
  return {
    id: String(row.id),
    start: iso(row.started_at),
    end: row.ended_at ? iso(row.ended_at) : null,
    type: row.sleep_type as Session["type"],
    note: String(row.note),
    deletedAt: row.deleted_at ? iso(row.deleted_at) : null,
    version: Number(row.version),
  };
}
export async function readSessions(db: Database = database()) {
  const { rows } = await db.query(
    `SELECT ${projection} FROM sleep_sessions ORDER BY started_at DESC, id`,
  );
  return rows.map(session);
}
export type Mutation =
  | {
      action: "create";
      id: string;
      start: string;
      end: string | null;
      type: Session["type"];
      note: string;
    }
  | {
      action: "update";
      id: string;
      version: number;
      start: string;
      end: string | null;
      type: Session["type"];
      note: string;
    }
  | { action: "trash" | "restore" | "purge"; id: string; version: number };
export async function mutate(input: Mutation, db: Database = database()) {
  let result;
  if (input.action === "create") {
    result = await db.query(
      `INSERT INTO sleep_sessions (id,started_at,ended_at,sleep_type,note) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [input.id, input.start, input.end, input.type, input.note],
    );
  } else if (input.action === "update") {
    result = await db.query(
      `UPDATE sleep_sessions SET started_at=$3,ended_at=$4,sleep_type=$5,note=$6,version=version+1,updated_at=now() WHERE id=$1 AND version=$2 AND deleted_at IS NULL RETURNING id`,
      [input.id, input.version, input.start, input.end, input.type, input.note],
    );
  } else if (input.action === "purge") {
    result = await db.query(
      `DELETE FROM sleep_sessions WHERE id=$1 AND version=$2 AND deleted_at IS NOT NULL RETURNING id`,
      [input.id, input.version],
    );
  } else {
    result = await db.query(
      `UPDATE sleep_sessions SET deleted_at=${input.action === "trash" ? "now()" : "NULL"},version=version+1,updated_at=now() WHERE id=$1 AND version=$2 AND deleted_at IS ${input.action === "trash" ? "NULL" : "NOT NULL"} RETURNING id`,
      [input.id, input.version],
    );
  }
  if (!result.rows.length)
    throw Object.assign(new Error("stale-record"), { code: "STALE" });
}
