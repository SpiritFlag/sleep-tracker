export const DAY = 86_400_000;
export const KST = 9 * 3_600_000;
export const TYPES = { unspecified: "미지정", night: "밤잠", nap: "낮잠" } as const;
export type SleepType = keyof typeof TYPES;
export interface Session {
  id: string; start: string; end: string | null; type: SleepType;
  note: string; deletedAt: string | null; version: number;
}
export function localInput(time: string | number = Date.now()) {
  return new Date(new Date(time).getTime() + KST).toISOString().slice(0, 16);
}
export function parseLocal(input: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) throw new Error("날짜와 시각을 입력해 주세요.");
  const value = new Date(`${input}:00+09:00`).getTime();
  if (!Number.isFinite(value) || localInput(value) !== input) throw new Error("올바른 날짜와 시각을 입력해 주세요.");
  return new Date(value).toISOString();
}
export function dateKey(time: string | number = Date.now()) {
  return new Date(new Date(time).getTime() + KST).toISOString().slice(0, 10);
}
export function addDays(day: string, count: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + count * DAY).toISOString().slice(0, 10);
}
export function attributedDate(start: string) {
  const time = new Date(start).getTime() + KST;
  return new Date(time + (new Date(time).getUTCHours() >= 12 ? DAY : 0)).toISOString().slice(0, 10);
}
export const duration = (s: Session) => s.end ? Date.parse(s.end) - Date.parse(s.start) : 0;
export function formatDuration(ms: number | null) {
  if (ms === null) return "—";
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (ms > 0 && minutes === 0) return "1분 미만";
  return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
}
export function formatTime(time: string) { return localInput(time).slice(11); }
export function formatDateTime(time: string) {
  const local = localInput(time);
  return `${local.slice(5, 10).replace("-", "/")} ${local.slice(11)}`;
}
export function totals(sessions: Session[]) {
  const days = new Map<string, number>();
  for (const s of sessions) {
    if (!s.end || s.deletedAt) continue;
    const day = attributedDate(s.start);
    days.set(day, (days.get(day) ?? 0) + duration(s));
  }
  return days;
}
export function stats(sessions: Session[], from: string, to: string) {
  const rows = sessions.filter(s => !s.deletedAt && s.end && attributedDate(s.start) >= from && attributedDate(s.start) <= to);
  const days = totals(rows);
  const sum = rows.reduce((v, s) => v + duration(s), 0);
  const calendarDays = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1);
  return { sum, count: rows.length, recordedDays: days.size, calendarDays,
    recordedAverage: days.size ? sum / days.size : null,
    calendarAverage: sum / calendarDays,
    longest: rows.reduce((v, s) => Math.max(v, duration(s)), 0),
    longestDay: Math.max(0, ...days.values()) };
}
export function overlaps(a: Pick<Session, "start" | "end">, b: Pick<Session, "start" | "end">) {
  return Date.parse(a.start) < (b.end ? Date.parse(b.end) : Infinity) && Date.parse(b.start) < (a.end ? Date.parse(a.end) : Infinity);
}
