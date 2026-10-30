"use client";
import { useEffect, useRef, useState } from "react";
import { addDays, formatDuration } from "@/lib/sleep";
import { cpapStats, monthBounds, validMonth, type CpapEntry } from "@/lib/cpap";
const time = (minutes: number | null) =>
  formatDuration(minutes === null ? null : minutes * 60000);
export default function Cpap({ today }: { today: string }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [entries, setEntries] = useState<CpapEntry[]>([]);
  const [loadedMonth, setLoadedMonth] = useState("");
  const [retry, setRetry] = useState(0);
  const [date, setDate] = useState(today);
  const [hours, setHours] = useState("0"),
    [minutes, setMinutes] = useState("0");
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const loaded = loadedMonth === month;
  const summary = cpapStats(loaded ? entries : [], month, today);
  const bounds = monthBounds(month),
    maxDate = month === today.slice(0, 7) ? today : bounds.last;
  function choose(day: string, rows = entries) {
    const entry = rows.find((e) => e.date === day);
    setDate(day);
    setHours(String(Math.floor((entry?.minutes ?? 0) / 60)));
    setMinutes(String((entry?.minutes ?? 0) % 60));
    setVersion(entry?.version ?? 0);
    setNotice("");
  }
  useEffect(() => {
    const controller = new AbortController(),
      timeout = setTimeout(
        () => controller.abort(new DOMException("timeout", "TimeoutError")),
        15000,
      );
    setError("");
    setNotice("");
    void (async () => {
      try {
        const res = await fetch(`/api/cpap?month=${month}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) throw Error(data.error ?? "기록을 불러오지 못했어요.");
        if (controller.signal.aborted) return;
        setEntries(data.entries);
        setLoadedMonth(month);
        const day =
          month === today.slice(0, 7) ? today : monthBounds(month).last;
        const entry = (data.entries as CpapEntry[]).find((e) => e.date === day);
        setDate(day);
        setHours(String(Math.floor((entry?.minutes ?? 0) / 60)));
        setMinutes(String((entry?.minutes ?? 0) % 60));
        setVersion(entry?.version ?? 0);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "기록을 불러오지 못했어요.",
          );
        else if (controller.signal.reason?.name === "TimeoutError")
          setError("조회 시간이 초과됐어요. 다시 불러와 주세요.");
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [month, retry, today]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current || !loaded) return;
    const h = Number(hours),
      m = Number(minutes);
    if (
      hours === "" ||
      minutes === "" ||
      !Number.isInteger(h) ||
      !Number.isInteger(m) ||
      h < 0 ||
      h > 24 ||
      m < 0 ||
      m > 59 ||
      h * 60 + m > 1440
    ) {
      setError("사용시간은 하루 0~24시간, 분은 0~59분으로 입력해 주세요.");
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/cpap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, minutes: h * 60 + m, version }),
        signal: AbortSignal.timeout(20000),
      });
      const data = await res.json();
      if (!res.ok) throw Error(data.error ?? "저장하지 못했어요.");
      const entry = data.entry as CpapEntry;
      setEntries((rows) => [
        ...rows.filter((e) => e.date !== entry.date),
        entry,
      ]);
      setVersion(entry.version);
      setNotice(`${date} · ${time(entry.minutes)}으로 저장했어요.`);
    } catch (e) {
      setError(
        e instanceof Error && e.name !== "TimeoutError"
          ? e.message
          : "저장 결과를 확인하지 못했어요. 다시 불러와 기록을 확인해 주세요.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function move(n: number) {
    const d = new Date(`${month}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    const next = d.toISOString().slice(0, 7);
    if (validMonth(next) && next <= today.slice(0, 7)) setMonth(next);
  }
  return (
    <div className="cpap-view">
      <div className="section-head">
        <div>
          <p className="eyebrow">CPAP · MONTHLY RECORD</p>
          <h2>양압기 사용 기록</h2>
          <p className="muted small cpap-description">
            사용일과 시간만 간단하게. 기록 없는 날은 0시간으로 계산해요.
          </p>
        </div>
        <div className="inline-actions cpap-month">
          <button
            className="button"
            aria-label="양압기 이전 달"
            onClick={() => move(-1)}
            disabled={busy || month === "1970-01"}
          >
            ←
          </button>
          <label className="sr-only" htmlFor="cpap-month">
            양압기 조회 월
          </label>
          <input
            id="cpap-month"
            type="month"
            min="1970-01"
            max={today.slice(0, 7)}
            value={month}
            disabled={busy}
            onChange={(e) => {
              if (
                validMonth(e.target.value) &&
                e.target.value <= today.slice(0, 7)
              )
                setMonth(e.target.value);
            }}
          />
          <button
            className="button"
            aria-label="양압기 다음 달"
            onClick={() => move(1)}
            disabled={busy || month >= today.slice(0, 7)}
          >
            →
          </button>
        </div>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
          <button
            className="text-button"
            disabled={busy}
            onClick={() => setRetry((n) => n + 1)}
          >
            다시 불러오기
          </button>
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      <section className="metrics" aria-label="양압기 월 통계">
        <article className="metric primary">
          <p className="metric-label">
            월 총 사용시간 <span>{Number(month.slice(5))}월</span>
          </p>
          <div className="metric-value">
            {loaded ? time(summary.total) : "—"}
          </div>
          <p className="metric-help">
            {summary.current
              ? `1일~오늘(${Number(today.slice(8))}일) 누적`
              : `1일~${summary.days}일 전체 누적`}
          </p>
        </article>
        <article className="metric">
          <p className="metric-label">
            {summary.current ? "오늘까지 하루 평균" : "하루 평균 사용시간"}
            <span>미사용일 포함</span>
          </p>
          <div className="metric-value">
            {loaded ? time(summary.average) : "—"}
          </div>
          <p className="metric-help">
            총 사용시간 ÷ {summary.elapsedDays}일 · 사용한 날{" "}
            {loaded ? summary.usedDays : "—"}일
          </p>
        </article>
        <article className="metric">
          <p className="metric-label">
            월 기준에 필요한 총 시간<span>일평균 2시간</span>
          </p>
          <div className="metric-value">{time(summary.required)}</div>
          <p className="metric-help">
            {summary.days}일 × 2시간 · 매월 1일~말일 기준
          </p>
        </article>
      </section>
      <section
        className="panel cpap-insurance"
        aria-label="보험 기준 시간 계산"
      >
        <div className="section-head">
          <div>
            <p className="eyebrow">MONTHLY COVERAGE REFERENCE</p>
            <h2>보험 기준 시간 계산</h2>
          </div>
          <span className="quiet-tag">입력 기준 · 일평균 2시간</span>
        </div>
        <div className="cpap-reference-grid">
          <div>
            <span>
              {summary.current
                ? "오늘까지 필요한 누적시간"
                : "월 필요 누적시간"}
            </span>
            <strong>{time(summary.requiredToDate)}</strong>
            <small>{summary.elapsedDays}일 × 2시간</small>
          </div>
          <div>
            <span>
              {summary.current ? "오늘까지 기준 대비" : "월 기준 대비"}
            </span>
            <strong>
              {!loaded
                ? "—"
                : `${time(Math.abs(summary.balanceToDate))} ${summary.balanceToDate >= 0 ? "초과" : "부족"}`}
            </strong>
            <small>실제 누적시간과 필요시간의 차이</small>
          </div>
          <div>
            <span>
              {summary.current ? "월말까지 더 필요한 시간" : "월 기준 부족시간"}
            </span>
            <strong>{loaded ? time(summary.shortfall) : "—"}</strong>
            <small>
              {loaded && summary.met
                ? "입력한 월 시간 기준을 채웠어요"
                : "월 전체 필요시간에서 누적시간을 뺀 값"}
            </small>
          </div>
          <div>
            <span>
              {summary.current ? "내일부터 하루 필요시간" : "월 시간 기준"}
            </span>
            <strong>
              {!loaded
                ? "—"
                : !summary.current
                  ? summary.met
                    ? "충족"
                    : "미충족"
                  : summary.remainingDays
                    ? time(summary.remainingDaily)
                    : summary.met
                      ? "충족"
                      : "오늘 추가 사용 필요"}
            </strong>
            <small>
              {summary.current
                ? summary.remainingDays
                  ? summary.remainingDaily !== null &&
                    summary.remainingDaily > 1440
                    ? `내일부터 ${summary.remainingDays}일 · 하루 24시간을 넘는 계산값이에요`
                    : `내일부터 남은 ${summary.remainingDays}일 · 분 단위 올림`
                  : "이번 달의 마지막 날이에요"
                : "기록하지 않은 날도 0시간으로 포함"}
            </small>
          </div>
        </div>
        <p className="field-help">
          사용자가 입력한 일평균 2시간 기준의 계산이에요. 이번 달 평균은 오늘을
          포함하고, 월 전체 필요시간은 말일까지 계산해요.
        </p>
      </section>
      <section className="panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">DAILY USAGE</p>
            <h2>하루 사용시간 입력</h2>
          </div>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => setRetry((n) => n + 1)}
          >
            ↻ 기록 새로고침
          </button>
        </div>
        <form className="cpap-form" onSubmit={save}>
          <label>
            사용일
            <input
              type="date"
              min={bounds.first}
              max={maxDate}
              value={date}
              required
              disabled={busy || !loaded}
              onChange={(e) => choose(e.target.value)}
            />
          </label>
          <label>
            시간
            <input
              type="number"
              min="0"
              max="24"
              step="1"
              inputMode="numeric"
              value={hours}
              required
              disabled={busy || !loaded}
              onChange={(e) => setHours(e.target.value)}
            />
          </label>
          <label>
            분
            <input
              type="number"
              min="0"
              max="59"
              step="1"
              inputMode="numeric"
              value={minutes}
              required
              disabled={busy || !loaded}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </label>
          <button className="button accent" disabled={busy || !loaded}>
            {busy ? "저장 중…" : version ? "사용시간 수정" : "사용시간 저장"}
          </button>
        </form>
        <p className="field-help">
          같은 날짜에는 하루 총 사용시간 한 건을 저장해요. 날짜를 선택하면 기존
          값이 표시돼요.
        </p>
      </section>
      <section className="panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">DAY BY DAY</p>
            <h2>{Number(month.slice(5))}월의 사용시간</h2>
          </div>
          <span className="quiet-tag">날짜를 눌러 입력·수정</span>
        </div>
        {!loaded ? (
          <p role="status" className="muted small">
            {error ? "기록을 다시 불러와 주세요." : "기록을 불러오는 중이에요…"}
          </p>
        ) : (
          <div className="cpap-days">
            {Array.from({ length: summary.days }, (_, i) => {
              const day = addDays(bounds.first, i),
                entry = entries.find((e) => e.date === day),
                future = day > today;
              return (
                <button
                  type="button"
                  key={day}
                  disabled={future || busy}
                  className={`cpap-day ${date === day ? "selected" : ""}`}
                  aria-pressed={date === day}
                  aria-label={`${day}: ${future ? "아직 오지 않은 날" : time(entry?.minutes ?? 0)}${!entry && !future ? ", 기록 없음" : ""}`}
                  onClick={() => choose(day)}
                >
                  <span className="cpap-day-number">
                    {i + 1}
                    <small>일</small>
                  </span>
                  <span className="cpap-day-meter">
                    <i
                      style={{
                        width: `${Math.min(100, ((entry?.minutes ?? 0) / 480) * 100)}%`,
                      }}
                    />
                  </span>
                  <strong>{future ? "—" : time(entry?.minutes ?? 0)}</strong>
                  <small className="cpap-entry-state">
                    {future ? "예정" : entry ? "수정" : "입력"}
                  </small>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
