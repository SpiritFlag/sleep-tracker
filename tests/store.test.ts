import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import {
  mutate,
  readSessions,
  type Database,
  type Mutation,
} from "../src/lib/store";
test("Postgres enforces overlaps, single ongoing sleep, restoration and optimistic updates", async () => {
  const pg = new PGlite();
  const db = pg as unknown as Database;
  try {
    await pg.exec(
      await readFile(new URL("../db/001-initial.sql", import.meta.url), "utf8"),
    );
    const a: Mutation = {
      action: "create",
      id: crypto.randomUUID(),
      start: "2026-10-29T23:00:00+09:00",
      end: "2026-10-30T07:00:00+09:00",
      type: "night",
      note: "original",
    };
    await mutate(a, db);
    await assert.rejects(() =>
      mutate(
        { ...a, id: crypto.randomUUID(), start: "2026-10-30T06:00:00+09:00" },
        db,
      ),
    );
    const b = {
      ...a,
      id: crypto.randomUUID(),
      start: "2026-10-30T07:00:00+09:00",
      end: "2026-10-30T08:00:00+09:00",
    };
    await mutate(b, db);
    await mutate({ action: "trash", id: a.id, version: 1 }, db);
    const c = { ...a, id: crypto.randomUUID() };
    await mutate(c, db);
    await assert.rejects(() =>
      mutate({ action: "restore", id: a.id, version: 2 }, db),
    );
    await mutate({ action: "trash", id: c.id, version: 1 }, db);
    await mutate({ action: "restore", id: a.id, version: 2 }, db);
    await assert.rejects(
      () => mutate({ ...a, action: "update", version: 1 }, db),
      { code: "STALE" },
    );
    const rows = await readSessions(db);
    assert.equal(rows.find((s) => s.id === a.id)?.version, 3);
    assert.equal(rows.find((s) => s.id === a.id)?.note, "original");
    const running = {
      ...a,
      id: crypto.randomUUID(),
      start: "2026-10-30T09:00:00+09:00",
      end: null,
    };
    await mutate(running, db);
    await assert.rejects(() =>
      mutate(
        {
          ...running,
          id: crypto.randomUUID(),
          start: "2026-10-30T10:00:00+09:00",
        },
        db,
      ),
    );
    await mutate({ action: "purge", id: c.id, version: 2 }, db);
    assert.ok(!(await readSessions(db)).find((s) => s.id === c.id));
    await assert.rejects(
      () => mutate({ action: "purge", id: a.id, version: 3 }, db),
      { code: "STALE" },
    );
    await mutate(
      {
        ...running,
        action: "update",
        version: 1,
        end: "2026-10-30T11:00:00+09:00",
      },
      db,
    );
    await mutate(
      {
        ...a,
        id: crypto.randomUUID(),
        start: "2026-10-30T11:00:00+09:00",
        end: "2026-10-30T12:00:00+09:00",
      },
      db,
    );
  } finally {
    await pg.close();
  }
});
