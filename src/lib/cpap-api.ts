import { z } from "zod";
import { access, type Access } from "./access";
import { dateKey } from "./sleep";
import { validDate, validMonth } from "./cpap";
import { readCpap, saveCpap } from "./cpap-store";
import type { Database } from "./store";
const schema = z
  .object({
    date: z.string().refine(validDate),
    minutes: z.number().int().min(0).max(1440),
    version: z.number().int().min(0).max(2147483646),
  })
  .strict();
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
export async function handleCpap(
  request: Request,
  deps: {
    authorize?: () => Promise<Access>;
    db?: Database;
    origin?: string;
    today?: string;
  } = {},
) {
  const state = await (deps.authorize ?? access)();
  if (state !== "owner")
    return json(
      { error: "양압기 기록에 접근할 수 없어요." },
      state === "signed-out" ? 401 : state === "forbidden" ? 403 : 503,
    );
  try {
    if (request.method === "GET") {
      const month = new URL(request.url).searchParams.get("month") ?? "";
      if (!validMonth(month))
        return json({ error: "조회할 월을 확인해 주세요." }, 400);
      return json({ entries: await readCpap(month, deps.db) });
    }
    if (request.method !== "POST")
      return json({ error: "지원하지 않는 요청이에요." }, 405);
    const origin = deps.origin ?? process.env.APP_URL;
    if (!origin || request.headers.get("origin") !== new URL(origin).origin)
      return json({ error: "요청 출처를 확인할 수 없어요." }, 403);
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return json({ error: "JSON 요청이 필요해요." }, 415);
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 2048)
      return json({ error: "입력이 너무 길어요." }, 413);
    let input;
    try {
      input = schema.parse(JSON.parse(text));
      if (input.date > (deps.today ?? dateKey())) throw Error("future");
    } catch {
      return json(
        {
          error:
            "날짜와 사용시간을 확인해 주세요. 오늘까지 하루 0~24시간을 기록할 수 있어요.",
        },
        400,
      );
    }
    return json({ entry: await saveCpap(input, deps.db) });
  } catch (e) {
    return (e as { code?: string }).code === "STALE"
      ? json(
          {
            error:
              "다른 곳에서 변경된 기록이에요. 새로고침 후 다시 입력해 주세요.",
          },
          409,
        )
      : json(
          {
            error:
              "양압기 기록을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.",
          },
          503,
        );
  }
}
