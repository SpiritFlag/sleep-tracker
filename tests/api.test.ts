import test from "node:test";
import assert from "node:assert/strict";
import { access } from "../src/lib/access";
import { handle, validateMutation } from "../src/lib/api";
import type { Database } from "../src/lib/store";
const env = {
  NODE_ENV: "production",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_test",
  CLERK_SECRET_KEY: "sk_live_test",
  OWNER_CLERK_USER_ID: "owner",
  APP_URL: "https://sleep.example",
};
test("owner auth fails closed and only accepts verified owner", async () => {
  assert.equal(await access({}, async () => "owner"), "unavailable");
  assert.equal(
    await access(
      { ...env, CLERK_SECRET_KEY: "sk_test_bad" },
      async () => "owner",
    ),
    "unavailable",
  );
  assert.equal(await access(env, async () => null), "signed-out");
  assert.equal(await access(env, async () => "other"), "forbidden");
  assert.equal(await access(env, async () => "owner"), "owner");
  assert.equal(
    await access(env, async () => {
      throw Error("sensitive");
    }),
    "unavailable",
  );
});
test("unauthorized requests rejected before database access", async () => {
  let reads = 0;
  const db: Database = {
    query: async () => {
      reads++;
      return { rows: [] };
    },
  };
  for (const [state, status] of [
    ["signed-out", 401],
    ["forbidden", 403],
    ["unavailable", 503],
  ] as const) {
    const r = await handle(new Request("https://sleep.example/api/sessions"), {
      authorize: async () => state,
      db,
    });
    assert.equal(r.status, status);
  }
  assert.equal(reads, 0);
});
const valid = {
  action: "create",
  id: crypto.randomUUID(),
  start: "2026-10-29T14:00:00.000Z",
  end: "2026-10-29T22:00:00.000Z",
  type: "night",
  note: "hello",
};
const post = (body: unknown, origin = "https://sleep.example") =>
  new Request("https://sleep.example/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin },
    body: JSON.stringify(body),
  });
test("cross-origin writes and invalid payloads never touch DB", async () => {
  let calls = 0;
  const db: Database = {
    query: async () => {
      calls++;
      return { rows: [] };
    },
  };
  const deps = {
    db,
    origin: "https://sleep.example",
    authorize: async () => "owner" as const,
  };
  assert.equal(
    (await handle(post(valid, "https://evil.example"), deps)).status,
    403,
  );
  assert.equal(
    (await handle(post({ ...valid, end: valid.start }), deps)).status,
    400,
  );
  assert.equal(
    (
      await handle(
        post({ ...valid, start: "2099-01-01T00:00:00Z", end: null }),
        deps,
      )
    ).status,
    400,
  );
  assert.equal(
    (await handle(post({ ...valid, owner: "forged" }), deps)).status,
    400,
  );
  assert.equal(calls, 0);
});
test("mutation validation requires versions and valid finite historical intervals", () => {
  assert.throws(() => validateMutation({ ...valid, action: "update" }));
  assert.throws(() => validateMutation({ ...valid, start: "infinity" }));
  assert.throws(() => validateMutation({ ...valid, note: "x".repeat(10001) }));
  assert.doesNotThrow(() =>
    validateMutation(valid, Date.parse("2026-10-30T00:00:00Z")),
  );
});
test("DB overlap, stale version and unavailable errors are safe and actionable", async () => {
  for (const [code, status] of [
    ["23P01", 409],
    ["23505", 409],
    ["STALE", 409],
    ["OTHER", 503],
  ]) {
    const r = await handle(post(valid), {
      authorize: async () => "owner",
      origin: "https://sleep.example",
      db: {
        query: async () => {
          throw Object.assign(Error("postgres://secret"), { code });
        },
      },
    });
    assert.equal(r.status, status);
    assert.ok(!(await r.text()).includes("postgres://"));
    assert.equal(r.headers.get("cache-control"), "private, no-store");
  }
});
