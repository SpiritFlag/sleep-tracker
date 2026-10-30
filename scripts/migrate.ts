import pg from "pg";
import { readFile } from "node:fs/promises";
const url = process.env.DATABASE_URL_DIRECT;
if (!url) throw new Error("DATABASE_URL_DIRECT is required");
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15000 });
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query(await readFile(new URL("../db/001-initial.sql", import.meta.url), "utf8"));
  await client.query("COMMIT");
  console.log("Sleep schema ready.");
} catch { await client.query("ROLLBACK").catch(() => {}); console.error("Migration failed; no credentials logged."); process.exitCode = 1; }
finally { await client.end(); }
