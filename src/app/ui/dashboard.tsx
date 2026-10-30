"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  attributedDate,
  dateKey,
  duration,
  formatDateTime,
  formatDuration,
  stats,
  TYPES,
  type Session,
} from "@/lib/sleep";
import type { Mutation } from "@/lib/store";
import Editor, { type EditorState } from "./editor";
import { Timeline, Trend } from "./charts";
import Calendar from "./calendar";
type Tab = "dashboard" | "timeline" | "calendar" | "trash";
const tabs: [Tab, string][] = [
  ["dashboard", "대시보드"],
  ["timeline", "타임라인"],
  ["calendar", "캘린더"],
  ["trash", "휴지통"],
];
export default function Dashboard({
  initial,
  initialTime,
  account,
}: {
  initial: Session[] | null;
  initialTime: number;
  account: React.ReactNode;
}) {
  const [sessions, setSessions] = useState<Session[]>(initial ?? []);
  const [loaded, setLoaded] = useState(initial !== null);
  const [error, setError] = useState(
    initial === null
      ? "기록을 불러오지 못했어요. 새로고침으로 다시 시도해 주세요."
      : "",
  );
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(initialTime);
  const [busy, setBusy] = useState(false);
  const mutating = useRef(false);
  const request = useRef<AbortController | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [preset, setPreset] = useState("30");
  const [customFrom, setCustomFrom] = useState(
    addDays(dateKey(initialTime), -29),
  );
  const [customTo, setCustomTo] = useState(dateKey(initialTime));
  const [month, setMonth] = useState(dateKey(initialTime).slice(0, 7));
  const [selected, setSelected] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [limit, setLimit] = useState(10);
  const today = dateKey(now);
  const active = useMemo(
    () => sessions.filter((s) => !s.deletedAt),
    [sessions],
  );
  const running = active.find((s) => !s.end);
  const trash = sessions.filter((s) => s.deletedAt);
  const earliest = active.reduce(
    (d, s) => (attributedDate(s.start) < d ? attributedDate(s.start) : d),
    today,
  );
  const latest = active.reduce(
    (d, s) => (attributedDate(s.start) > d ? attributedDate(s.start) : d),
    today,
  );
  const from =
    preset === "custom"
      ? customFrom
      : preset === "all"
        ? earliest
        : addDays(today, 1 - Number(preset));
  const to = preset === "custom" ? customTo : preset === "all" ? latest : today;
  const validRange =
    !!from && !!to && from <= to && from >= "1970-01-01" && to <= "2100-12-31";
  const period = stats(
    active,
    validRange ? from : today,
    validRange ? to : today,
  );
  const week = stats(active, addDays(today, -6), today),
    monthly = stats(active, addDays(today, -29), today);
  const dayStats = stats(active, today, today);
  const effectiveDay = selected ?? (tab === "calendar" ? today : null);
  const visible =
    tab === "trash"
      ? trash
      : active.filter((s) =>
          effectiveDay
            ? attributedDate(s.start) === effectiveDay
            : attributedDate(s.start) >= from && attributedDate(s.start) <= to,
        );
  const refresh = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch("/api/sessions", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok)
        throw new Error(
          "기록을 불러오지 못했어요. 로그인 상태를 확인하고 다시 시도해 주세요.",
        );
      const data = await res.json();
      if (request.current !== controller) return;
      setSessions(data.sessions);
      setLoaded(true);
      setError("");
      setNow(Date.now());
    } catch (e) {
      if (request.current === controller)
        setError(
          e instanceof Error && e.name !== "AbortError"
            ? e.message
            : "기록 조회 시간이 초과됐어요. 다시 시도해 주세요.",
        );
    } finally {
      clearTimeout(timeout);
    }
  }, []);
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 10000);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible" && !mutating.current)
        void refresh();
    }, 60000);
    const resume = () => {
      if (document.visibilityState === "visible" && !mutating.current) {
        setNow(Date.now());
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", resume);
    return () => {
      clearInterval(clock);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", resume);
      request.current?.abort();
    };
  }, [refresh]);
  async function save(input: Mutation) {
    if (mutating.current) return false;
    mutating.current = true;
    setBusy(true);
    setNotice("");
    request.current?.abort();
    request.current = null;
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(20000),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "저장하지 못했어요.");
      setNotice(
        input.action === "purge"
          ? "기록을 영구 삭제했어요."
          : input.action === "trash"
            ? "휴지통으로 옮겼어요. 언제든 복구할 수 있어요."
            : input.action === "restore"
              ? "기록을 복구했어요."
              : "기록을 저장했어요.",
      );
      await refresh();
      return true;
    } catch (e) {
      throw new Error(
        e instanceof Error && e.name !== "TimeoutError"
          ? e.message
          : "저장 결과를 확인하지 못했어요. 새로고침으로 기록을 확인해 주세요.",
      );
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  }
  async function action(input: Mutation) {
    try {
      await save(input);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요.");
    }
  }
  function select(day: string) {
    setSelected(day);
    setLimit(10);
  }
  function edit(s: Session) {
    setEditor({ session: s });
  }
  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Sleep Observatory 홈">
          <span className="brand-mark">☾</span>
          <span>
            sleep<span className="brand-light"> / observatory</span>
          </span>
        </a>
        <div className="account">
          <span className="private-label">
            <i /> PRIVATE ARCHIVE
          </span>
          {account}
        </div>
      </header>
      <main>
        <section className="intro">
          <div>
            <p className="eyebrow">A LITTLE RECORD OF YOUR REST</p>
            <h1>
              잠이 쌓이는 시간<span>.</span>
            </h1>
            <p className="subtitle">
              잠든 시간과 깨어난 시간. 있는 그대로, 나의 수면을 관찰해요.
            </p>
          </div>
          <div className="intro-actions">
            <button
              className="button"
              onClick={() => setEditor({})}
              disabled={busy || !loaded}
            >
              ＋ 기록 추가
            </button>
            <button
              className="button accent"
              onClick={() =>
                action({
                  action: "create",
                  id: crypto.randomUUID(),
                  start: new Date().toISOString(),
                  end: null,
                  type: "unspecified",
                  note: "",
                })
              }
              disabled={!!running || busy || !loaded}
            >
              <span aria-hidden="true">☾</span>{" "}
              {running ? "수면 기록 중" : "수면 시작"}
            </button>
          </div>
        </section>
        {error && (
          <div className="notice error" role="alert">
            {error}
            <button
              className="text-button"
              onClick={() => void refresh()}
              disabled={busy}
            >
              다시 불러오기
            </button>
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button
              className="icon-button"
              onClick={() => setNotice("")}
              aria-label="알림 닫기"
            >
              ×
            </button>
          </div>
        )}
        {running && (
          <section className="running-panel">
            <div className="running-icon">☾</div>
            <div>
              <p className="eyebrow">SLEEP IN PROGRESS</p>
              <strong>잠든 시간을 기록하고 있어요</strong>
              <p>
                {formatDateTime(running.start)} 시작 ·{" "}
                {attributedDate(running.start)} 귀속
              </p>
            </div>
            <div className="elapsed">
              {formatDuration(now - Date.parse(running.start))}
              <small>통계에는 완료 후 반영해요</small>
            </div>
            <button
              className="button accent"
              disabled={busy}
              onClick={() => setEditor({ session: running, finish: true })}
            >
              수면 종료
            </button>
            <button
              className="text-button"
              onClick={() => edit(running)}
              disabled={busy}
            >
              수정
            </button>
          </section>
        )}
        <section className="metrics" aria-label="수면 요약">
          <article className="metric primary">
            <p className="metric-label">
              오늘의 총 수면시간 <span>{today.slice(5).replace("-", "/")}</span>
            </p>
            <div className="metric-value">
              {!loaded
                ? "—"
                : dayStats.count
                  ? formatDuration(dayStats.sum)
                  : "—"}
            </div>
            <p className="metric-help">
              {dayStats.count
                ? `${dayStats.count}개 완료 세션 · 귀속일 기준`
                : "오늘에 귀속된 완료 기록이 없어요"}
            </p>
          </article>
          <article className="metric">
            <p className="metric-label">
              최근 7일 평균 <span>7 DAYS</span>
            </p>
            <div className="metric-value">
              {loaded ? formatDuration(week.recordedAverage) : "—"}
            </div>
            <p className="metric-help">
              기록 {week.recordedDays}일 / 7일 · 전체 날짜 기준{" "}
              {formatDuration(week.calendarAverage)}
            </p>
          </article>
          <article className="metric">
            <p className="metric-label">
              최근 30일 평균 <span>30 DAYS</span>
            </p>
            <div className="metric-value">
              {loaded ? formatDuration(monthly.recordedAverage) : "—"}
            </div>
            <p className="metric-help">
              기록 {monthly.recordedDays}일 / 30일 · 전체 날짜 기준{" "}
              {formatDuration(monthly.calendarAverage)}
            </p>
          </article>
        </section>
        <div className="navigation">
          <nav aria-label="기록 보기">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                className={tab === key ? "active" : ""}
                aria-current={tab === key ? "page" : undefined}
                onClick={() => {
                  setTab(key);
                  setSelected(null);
                  setLimit(10);
                }}
              >
                {label}
                {key === "trash" && trash.length > 0 && (
                  <span className="count">{trash.length}</span>
                )}
              </button>
            ))}
          </nav>
          <button
            className="text-button refresh"
            onClick={() => void refresh()}
            disabled={busy}
          >
            ↻ 새로고침
          </button>
        </div>
        {(tab === "dashboard" || tab === "timeline") && (
          <div className="range-bar">
            <div className="segmented" aria-label="조회 기간">
              {[
                ["7", "7일"],
                ["30", "30일"],
                ["90", "90일"],
                ["all", "전체"],
                ["custom", "직접 선택"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  aria-pressed={preset === key}
                  className={preset === key ? "active" : ""}
                  onClick={() => {
                    setPreset(key);
                    setSelected(null);
                    setLimit(10);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {preset === "custom" ? (
              <div className="date-range">
                <label className="sr-only" htmlFor="range-from">
                  조회 시작일
                </label>
                <input
                  id="range-from"
                  type="date"
                  min="1970-01-01"
                  max="2100-12-31"
                  value={customFrom}
                  onChange={(e) => {
                    setCustomFrom(e.target.value);
                    setSelected(null);
                  }}
                />
                <span>—</span>
                <label className="sr-only" htmlFor="range-to">
                  조회 종료일
                </label>
                <input
                  id="range-to"
                  type="date"
                  min="1970-01-01"
                  max="2100-12-31"
                  value={customTo}
                  onChange={(e) => {
                    setCustomTo(e.target.value);
                    setSelected(null);
                  }}
                />
              </div>
            ) : (
              <span className="range-label">
                {from.replaceAll("-", ".")} — {to.replaceAll("-", ".")}
              </span>
            )}
          </div>
        )}
        {!validRange && (
          <p role="alert" className="form-error">
            시작일과 종료일을 확인해 주세요. 조회 범위는 1970–2100년이에요.
          </p>
        )}
        {tab === "dashboard" && validRange && (
          <>
            <section className="panel">
              <div className="section-head">
                <div>
                  <p className="eyebrow">THE RHYTHM OF SLEEP</p>
                  <h2>수면시간의 흐름</h2>
                </div>
                <span className="quiet-tag">완료 기록 · KST</span>
              </div>
              {loaded && period.count > 0 ? (
                <Trend sessions={active} from={from} to={to} select={select} />
              ) : (
                <div className="empty">
                  <span className="empty-moon">☾</span>
                  <h3>
                    {loaded
                      ? "아직 그려지지 않은 잠의 흐름"
                      : "기록을 불러오는 중이에요"}
                  </h3>
                  <p>
                    {loaded
                      ? "수면을 기록하면 이곳에 시간의 흐름이 쌓여요."
                      : "조회에 실패했다면 위에서 다시 불러올 수 있어요."}
                  </p>
                  {loaded && (
                    <button className="button" onClick={() => setEditor({})}>
                      첫 기록 남기기
                    </button>
                  )}
                </div>
              )}
            </section>
            <section className="period-stats" aria-label="선택 기간 통계">
              {[
                ["총 수면시간", formatDuration(period.sum)],
                ["완료 세션", `${period.count}개`],
                ["기록한 날", `${period.recordedDays}일`],
                [
                  "최장 세션",
                  period.count ? formatDuration(period.longest) : "—",
                ],
                [
                  "하루 최장 합계",
                  period.count ? formatDuration(period.longestDay) : "—",
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{loaded ? value : "—"}</strong>
                </div>
              ))}
            </section>
          </>
        )}
        {tab === "timeline" && validRange && (
          <section className="panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">WHEN SLEEP HAPPENED</p>
                <h2>잠든 시간의 지도</h2>
              </div>
              <span className="quiet-tag">실제 시각 · KST</span>
            </div>
            <Timeline
              sessions={active}
              from={from}
              to={to}
              now={now}
              edit={edit}
            />
          </section>
        )}
        {tab === "calendar" && (
          <section className="panel">
            <Calendar
              sessions={active}
              month={month}
              setMonth={setMonth}
              selected={selected ?? today}
              select={select}
            />
          </section>
        )}
        <section className="panel records">
          <div className="section-head">
            <div>
              <p className="eyebrow">
                {tab === "trash"
                  ? "RECOVER YOUR RECORDS"
                  : "SMALL MOMENTS, KEPT"}
              </p>
              <h2>
                {tab === "trash"
                  ? "휴지통"
                  : selected
                    ? `${selected.replaceAll("-", ".")}의 기록`
                    : "수면 기록"}
                <span className="heading-count">
                  {tab === "calendar" && !selected
                    ? active.filter((s) => attributedDate(s.start) === today)
                        .length
                    : visible.length}
                </span>
              </h2>
            </div>
            <div className="inline-actions">
              {selected && (
                <button
                  className="text-button"
                  onClick={() => setSelected(null)}
                >
                  선택 해제
                </button>
              )}
              {tab !== "trash" && (
                <button
                  className="text-button"
                  onClick={() => setEditor(selected ? { day: selected } : {})}
                  disabled={busy || !loaded}
                >
                  ＋ 기록 추가
                </button>
              )}
            </div>
          </div>
          {tab === "trash" && (
            <p className="muted small">
              자동으로 지워지지 않아요. 복구할 때 시간이 겹치는지 다시 확인해요.
              영구 삭제한 기록은 되돌릴 수 없어요.
            </p>
          )}
          <div className="record-list">
            {(tab === "calendar" && !selected
              ? active.filter((s) => attributedDate(s.start) === today)
              : visible
            )
              .slice(0, limit)
              .map((s) => (
                <article className="record" key={s.id}>
                  <div className={`record-symbol ${s.type}`}>
                    {s.type === "nap" ? "☀" : "☾"}
                  </div>
                  <div className="record-body">
                    <div className="record-top">
                      <strong>
                        {formatDateTime(s.start)}{" "}
                        <span className="arrow">→</span>{" "}
                        {s.end ? formatDateTime(s.end) : "진행 중"}
                      </strong>
                      <span className={`type-tag ${s.type}`}>
                        {TYPES[s.type]}
                      </span>
                    </div>
                    <div className="record-meta">
                      <span>{attributedDate(s.start)} 귀속</span>
                      <span>
                        {s.end
                          ? formatDuration(duration(s))
                          : "완료 전 통계 제외"}
                      </span>
                    </div>
                    {s.note && <p className="record-note">{s.note}</p>}
                  </div>
                  <div className="record-actions">
                    {tab === "trash" ? (
                      <>
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() =>
                            action({
                              action: "restore",
                              id: s.id,
                              version: s.version,
                            })
                          }
                        >
                          복구
                        </button>
                        <button
                          className="text-button danger"
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                "이 기록을 영구 삭제할까요? 삭제 후에는 복구할 수 없어요.",
                              )
                            )
                              void action({
                                action: "purge",
                                id: s.id,
                                version: s.version,
                              });
                          }}
                        >
                          영구 삭제
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => edit(s)}
                        >
                          수정
                        </button>
                        <button
                          className="text-button muted"
                          disabled={busy}
                          onClick={() =>
                            action({
                              action: "trash",
                              id: s.id,
                              version: s.version,
                            })
                          }
                        >
                          휴지통
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
          </div>
          {(tab === "calendar" && !selected
            ? active.filter((s) => attributedDate(s.start) === today)
            : visible
          ).length === 0 && (
            <div className="empty compact">
              <p>
                {tab === "trash"
                  ? "휴지통이 비어 있어요."
                  : "이 날짜에 귀속된 수면 기록이 없어요."}
              </p>
            </div>
          )}
          {visible.length > limit && (
            <button
              className="button load-more"
              onClick={() => setLimit((n) => n + 20)}
            >
              기록 더 보기
            </button>
          )}
        </section>
        <footer>
          <span>sleep / observatory</span>
          <span>
            평가 없이, 있는 그대로. <i /> 한국 시간 · 정오 기준 귀속
          </span>
        </footer>
      </main>
      {editor && (
        <Editor state={editor} close={() => setEditor(null)} save={save} />
      )}
    </div>
  );
}
