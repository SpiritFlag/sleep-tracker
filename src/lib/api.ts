import { z } from "zod";
import { access, type Access } from "./access";
import { mutate, readSessions, type Database, type Mutation } from "./store";
const fields = { start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }).nullable(), type: z.enum(["unspecified","night","nap"]), note: z.string().max(10000) };
const base = { id: z.string().uuid() };
const version = z.number().int().positive();
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), ...base, ...fields }).strict(),
  z.object({ action: z.literal("update"), ...base, version, ...fields }).strict(),
  z.object({ action: z.literal("trash"), ...base, version }).strict(),
  z.object({ action: z.literal("restore"), ...base, version }).strict(),
  z.object({ action: z.literal("purge"), ...base, version }).strict(),
]);
const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
export function validateMutation(value: unknown, now = Date.now()): Mutation {
  const input = schema.parse(value);
  if (input.action === "create" || input.action === "update") {
    const start = Date.parse(input.start), end = input.end ? Date.parse(input.end) : null;
    if (start < Date.parse("1970-01-01T00:00:00Z") || start > now || (end !== null && (end <= start || end > now))) throw new Error("invalid-time");
  }
  return input;
}
export async function handle(request: Request, deps: { authorize?: () => Promise<Access>; db?: Database; origin?: string } = {}) {
  const identity = await (deps.authorize ?? access)();
  if (identity !== "owner") return json({ error: identity === "unavailable" ? "인증 설정을 확인해 주세요." : "접근 권한이 없습니다." }, identity === "signed-out" ? 401 : identity === "forbidden" ? 403 : 503);
  try {
    if (request.method === "GET") return json({ sessions: await readSessions(deps.db) });
    if (request.method !== "POST") return json({ error: "지원하지 않는 요청입니다." }, 405);
    const origin = deps.origin ?? process.env.APP_URL;
    if (!origin || request.headers.get("origin") !== new URL(origin).origin) return json({ error: "요청 출처를 확인할 수 없습니다." }, 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "JSON 요청이 필요합니다." }, 415);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 64000) return json({ error: "메모가 너무 깁니다." }, 413);
    let input: Mutation;
    try { input = validateMutation(JSON.parse(raw)); }
    catch { return json({ error: "입력을 확인해 주세요. 종료는 시작 이후여야 하고, 미래 시각은 기록할 수 없어요." }, 400); }
    await mutate(input, deps.db);
    return json({ ok: true });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "23P01" || code === "23505") return json({ error: "다른 수면과 시간이 겹치거나 이미 저장된 기록이에요. 진행 중 수면은 한 번에 하나만 둘 수 있어요." }, 409);
    if (code === "STALE") return json({ error: "다른 곳에서 변경된 기록이에요. 새로고침 후 다시 시도해 주세요." }, 409);
    return json({ error: "기록을 처리하지 못했어요. 잠시 후 다시 시도해 주세요." }, 503);
  }
}
