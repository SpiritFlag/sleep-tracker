import { addDays, dateKey, DAY } from "./sleep";
export interface CpapEntry {
  date: string;
  minutes: number;
  version: number;
}
export const DAILY_REQUIRED_MINUTES = 120;
export function validDate(date: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    date >= "1970-01-01" &&
    date <= "2100-12-31" &&
    Number.isFinite(Date.parse(`${date}T00:00:00Z`)) &&
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date
  );
}
export function validMonth(month: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && validDate(`${month}-01`);
}
export function monthBounds(month: string) {
  if (!validMonth(month)) throw new Error("invalid-month");
  const first = `${month}-01`,
    next = new Date(`${first}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const days = Math.round((next.getTime() - Date.parse(first)) / DAY);
  return { first, last: addDays(first, days - 1), days };
}
export function cpapStats(
  entries: CpapEntry[],
  month: string,
  today = dateKey(),
) {
  const { first, last, days } = monthBounds(month);
  const elapsedDays =
    today < first ? 0 : today >= last ? days : Number(today.slice(8));
  const rows = entries.filter(
    (e) => e.date >= first && e.date <= last && e.date <= today,
  );
  const total = rows.reduce((n, e) => n + e.minutes, 0);
  const required = days * DAILY_REQUIRED_MINUTES;
  const requiredToDate = elapsedDays * DAILY_REQUIRED_MINUTES;
  const shortfall = Math.max(0, required - total),
    remainingDays = days - elapsedDays;
  return {
    first,
    last,
    days,
    elapsedDays,
    total,
    average: elapsedDays ? total / elapsedDays : null,
    required,
    requiredToDate,
    balanceToDate: total - requiredToDate,
    shortfall,
    remainingDays,
    remainingDaily: remainingDays ? Math.ceil(shortfall / remainingDays) : null,
    usedDays: rows.filter((e) => e.minutes > 0).length,
    met: total >= required,
    current: month === today.slice(0, 7),
    future: today < first,
  };
}
