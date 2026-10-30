import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import {
  cpapStats,
  monthBounds,
  validDate,
  type CpapEntry,
} from "../src/lib/cpap";
import { handleCpap } from "../src/lib/cpap-api";
import { readCpap, saveCpap } from "../src/lib/cpap-store";
import type { Database } from "../src/lib/store";
test("month length includes leap years and December rollover", () => {
  assert.equal(monthBounds("2028-02").days, 29);
  assert.equal(monthBounds("2027-02").days, 28);
  assert.equal(monthBounds("2026-04").days, 30);
  assert.equal(monthBounds("2026-12").last, "2026-12-31");
  assert.equal(validDate("2026-02-30"), false);
  assert.throws(() => monthBounds("2026-13"));
});
test("missing days count as zero; current month averages through today and targets the full month", () => {
  const s = cpapStats(
    [
      { date: "2026-10-01", minutes: 180, version: 1 },
      { date: "2026-10-02", minutes: 120, version: 1 },
    ],
    "2026-10",
    "2026-10-03",
  );
  assert.equal(s.total, 300);
  assert.equal(s.average, 100);
  assert.equal(s.elapsedDays, 3);
  assert.equal(s.required, 3720);
  assert.equal(s.requiredToDate, 360);
  assert.equal(s.balanceToDate, -60);
  assert.equal(s.shortfall, 3420);
  assert.equal(s.remainingDays, 28);
  assert.equal(s.remainingDaily, 123);
});
test("past month uses all days, exact threshold and excess are computed from unrounded totals", () => {
  const entry = { date: "2026-09-01", minutes: 1440, version: 1 };
  const rows = [
    entry,
    { ...entry, date: "2026-09-02" },
    { ...entry, date: "2026-09-03", minutes: 720 },
  ];
  const exact = cpapStats(rows, "2026-09", "2026-10-30");
  assert.equal(exact.average, 120);
  assert.equal(exact.met, true);
  assert.equal(exact.shortfall, 0);
  assert.equal(
    cpapStats([{ ...entry, minutes: 0 }], "2026-09", "2026-10-30").average,
    0,
  );
  assert.equal(
    cpapStats([{ ...entry, minutes: 1 }], "2026-09", "2026-10-30").met,
    false,
  );
  assert.equal(
    cpapStats(
      [...rows, { ...entry, date: "2026-09-04", minutes: 1 }],
      "2026-09",
      "2026-10-30",
    ).shortfall,
    0,
  );
});
test("last day and future periods never divide by zero; other month and future records excluded", () => {
  const rows = [
    { date: "2026-10-31", minutes: 120, version: 1 },
    { date: "2026-09-30", minutes: 120, version: 1 },
  ];
  assert.equal(cpapStats(rows, "2026-10", "2026-10-30").total, 0);
  const last = cpapStats([], "2026-10", "2026-10-31");
  assert.equal(last.remainingDays, 0);
  assert.equal(last.remainingDaily, null);
  assert.equal(cpapStats([], "2026-11", "2026-10-30").average, null);
});
const post = (body: unknown, origin = "https://sleep.example") =>
  new Request("https://sleep.example/api/cpap", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin },
    body: JSON.stringify(body),
  });
test("CPAP authorization and request validation happen before database access", async () => {
  let calls = 0;
  const db: Database = {
    query: async () => {
      calls++;
      return { rows: [] };
    },
  };
  for (const [state, status] of [
    ["signed-out", 401],
    ["forbidden", 403],
    ["unavailable", 503],
  ] as const) {
    assert.equal(
      (
        await handleCpap(
          new Request("https://sleep.example/api/cpap?month=2026-10"),
          { db, authorize: async () => state },
        )
      ).status,
      status,
    );
  }
  const deps = {
    db,
    authorize: async () => "owner" as const,
    origin: "https://sleep.example",
    today: "2026-10-30",
  };
  const valid = { date: "2026-10-30", minutes: 120, version: 0 };
  assert.equal(
    (await handleCpap(post(valid, "https://other.example"), deps)).status,
    403,
  );
  for (const bad of [
    { ...valid, date: "2026-10-31" },
    { ...valid, date: "2026-02-30" },
    { ...valid, minutes: 1441 },
    { ...valid, minutes: -1 },
    { ...valid, minutes: 1.5 },
    { ...valid, version: -1 },
    { ...valid, extra: true },
  ])
    assert.equal((await handleCpap(post(bad), deps)).status, 400);
  assert.equal(
    (
      await handleCpap(
        new Request("https://sleep.example/api/cpap?month=2026-13"),
        deps,
      )
    ).status,
    400,
  );
  assert.equal(calls, 0);
});
test("CPAP failures keep credentials private and stale writes return 409", async () => {
  for (const code of ["STALE", "OTHER"]) {
    const res = await handleCpap(
      post({ date: "2026-10-30", minutes: 120, version: 0 }),
      {
        authorize: async () => "owner",
        origin: "https://sleep.example",
        today: "2026-10-30",
        db: {
          query: async () => {
            throw Object.assign(Error("postgres://private"), { code });
          },
        },
      },
    );
    assert.equal(res.status, code === "STALE" ? 409 : 503);
    assert.ok(!(await res.text()).includes("postgres://"));
  }
});
test("Postgres stores one total per day, preserves zero and rejects stale edits without touching sleep", async () => {
  const pg = new PGlite(),
    db = pg as unknown as Database;
  try {
    await pg.exec(
      await readFile(new URL("../db/001-initial.sql", import.meta.url), "utf8"),
    );
    await pg.exec(
      await readFile(new URL("../db/002-cpap.sql", import.meta.url), "utf8"),
    );
    const entry = await saveCpap(
      { date: "2026-10-30", minutes: 180, version: 0 },
      db,
    );
    assert.equal(entry.version, 1);
    await assert.rejects(() => saveCpap({ ...entry, version: 0 }, db), {
      code: "STALE",
    });
    const edited = await saveCpap({ ...entry, minutes: 240 }, db);
    assert.equal(edited.version, 2);
    await assert.rejects(() => saveCpap({ ...entry, minutes: 300 }, db), {
      code: "STALE",
    });
    const zero = await saveCpap({ ...edited, minutes: 0 }, db);
    assert.equal(zero.minutes, 0);
    assert.deepEqual(await readCpap("2026-10", db), [zero]);
    assert.deepEqual(await readCpap("2026-09", db), []);
    const res = await handleCpap(
      post({ date: "2026-10-29", minutes: 1440, version: 0 }),
      {
        db,
        authorize: async () => "owner",
        origin: "https://sleep.example",
        today: "2026-10-30",
      },
    );
    assert.equal(res.status, 200);
    assert.equal(
      (
        await pg.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM sleep_sessions",
        )
      ).rows[0].count,
      0,
    );
    await assert.rejects(() =>
      pg.query(
        "INSERT INTO cpap_daily (usage_date,minutes) VALUES ('2026-10-28',1441)",
      ),
    );
  } finally {
    await pg.close();
  }
});
