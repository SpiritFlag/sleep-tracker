import test from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  attributedDate,
  duration,
  localInput,
  overlaps,
  parseLocal,
  stats,
  totals,
  type Session,
} from "../src/lib/sleep";
const at = (value: string) => parseLocal(value);
function sleep(
  start: string,
  end: string | null,
  extra: Partial<Session> = {},
): Session {
  return {
    id: crypto.randomUUID(),
    start: at(start),
    end: end ? at(end) : null,
    type: "unspecified",
    note: "",
    deletedAt: null,
    version: 1,
    ...extra,
  };
}
for (const [start, day] of [
  ["2026-10-30T02:00", "2026-10-30"],
  ["2026-10-30T11:00", "2026-10-30"],
  ["2026-10-30T11:59", "2026-10-30"],
  ["2026-10-30T12:00", "2026-10-31"],
  ["2026-10-30T15:00", "2026-10-31"],
  ["2026-10-30T23:00", "2026-10-31"],
  ["2026-10-31T03:00", "2026-10-31"],
  ["2026-12-31T12:00", "2027-01-01"],
  ["2028-02-28T12:00", "2028-02-29"],
  ["2028-02-29T12:00", "2028-03-01"],
])
  test(`${start} belongs to ${day} in KST`, () =>
    assert.equal(attributedDate(at(start)), day));
test("original times preserved and full duration belongs to start attribution", () => {
  const s = sleep("2026-10-30T11:00", "2026-10-31T14:00");
  assert.equal(duration(s), 27 * 3600000);
  assert.equal(totals([s]).get("2026-10-30"), 27 * 3600000);
  assert.equal(totals([s]).size, 1);
});
test("split sleep totals and both averages use day totals, not session average", () => {
  const rows = [
    sleep("2026-10-29T23:00", "2026-10-30T05:00"),
    sleep("2026-10-30T06:00", "2026-10-30T08:00"),
  ];
  const s = stats(rows, "2026-10-24", "2026-10-30");
  assert.equal(s.recordedDays, 1);
  assert.equal(s.count, 2);
  assert.equal(s.recordedAverage, 8 * 3600000);
  assert.equal(s.calendarAverage, (8 * 3600000) / 7);
  assert.equal(s.longest, 6 * 3600000);
  assert.equal(s.longestDay, 8 * 3600000);
});
test("ongoing and trashed sessions never affect stats", () => {
  const rows = [
    sleep("2026-10-30T01:00", null),
    sleep("2026-10-30T03:00", "2026-10-30T08:00", {
      deletedAt: at("2026-10-30T10:00"),
    }),
  ];
  assert.equal(stats(rows, "2026-10-24", "2026-10-30").count, 0);
  assert.equal(stats(rows, "2026-10-24", "2026-10-30").recordedAverage, null);
});
test("adjacent ranges allowed; overlaps and open intervals detected", () => {
  const a = sleep("2026-10-30T01:00", "2026-10-30T08:00");
  assert.equal(
    overlaps(a, sleep("2026-10-30T08:00", "2026-10-30T09:00")),
    false,
  );
  assert.equal(
    overlaps(a, sleep("2026-10-30T07:59", "2026-10-30T09:00")),
    true,
  );
  assert.equal(overlaps(a, sleep("2026-10-30T02:00", null)), true);
});
test("local input parsing rejects invalid calendar dates and round trips independent of host timezone", () => {
  assert.throws(() => at("2026-02-30T02:00"));
  assert.throws(() => at("bad"));
  assert.equal(localInput(at("2026-10-30T12:00")), "2026-10-30T12:00");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});
