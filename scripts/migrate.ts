import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
const url = process.env.DATABASE_URL_DIRECT;
if (!url) throw new Error("DATABASE_URL_DIRECT is required");
const client = new pg.Client({
  connectionString: url,
  connectionTimeoutMillis: 15000,
});
try {
  await client.connect();
  await client.query("BEGIN");
  const directory = new URL("../db/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort()) {
    await client.query(await readFile(new URL(file, directory), "utf8"));
  }
  await client.query("COMMIT");
  console.log("Sleep schema ready.");
} catch {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Migration failed; no credentials logged.");
  process.exitCode = 1;
} finally {
  await client.end();
}
