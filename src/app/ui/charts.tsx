"use client";
import {
  addDays,
  DAY,
  formatDateTime,
  formatDuration,
  formatTime,
  duration,
  totals,
  type Session,
} from "@/lib/sleep";
export function Trend({
  sessions,
  from,
  to,
  select,
}: {
  sessions: Session[];
  from: string;
  to: string;
  select: (day: string) => void;
}) {
  const data = totals(sessions);
  const span = Math.max(
    1,
    Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1,
  );
  // Long archives are bucketed into at most 120 bars without changing statistics.
  const bucket = Math.max(1, Math.ceil(span / 120));
  const bars: {
    day: string;
    end: string;
    total: number;
    recorded: number;
    count: number;
  }[] = [];
  for (let offset = 0; offset < span; offset += bucket) {
    const day = addDays(from, offset),
      end = addDays(from, Math.min(span - 1, offset + bucket - 1));
    let total = 0,
      recorded = 0;
    for (let n = offset; n < Math.min(span, offset + bucket); n++) {
      const v = data.get(addDays(from, n));
      if (v !== undefined) {
        total += v;
        recorded++;
      }
    }
    bars.push({
      day,
      end,
      total,
      recorded,
      count: Math.min(bucket, span - offset),
    });
  }
  const values = bars.map((b) => (b.recorded ? b.total / b.recorded : 0));
  const maxHours = Math.max(
    12,
    Math.ceil(Math.max(0, ...values) / 3600000 / 4) * 4,
  );
  return (
    <div>
      <div className="chart-layout">
        <div className="y-axis">
          {[maxHours, maxHours * 0.75, maxHours * 0.5, maxHours * 0.25, 0].map(
            (v) => (
              <span key={v}>{v}h</span>
            ),
          )}
        </div>
        <div className="trend-plot">
          <div className="chart-grid">
            {[0, 1, 2, 3, 4].map((v) => (
              <i key={v} />
            ))}
          </div>
          <div className="bars">
            {bars.map((b, i) => (
              <button
                key={b.day}
                className={`bar-column ${b.recorded ? "" : "missing"}`}
                onClick={() => select(b.day)}
                aria-label={`${b.day}${bucket > 1 ? `부터 ${b.end}까지 기록일 평균` : ""}: ${b.recorded ? formatDuration(values[i]) : "기록 없음"}`}
                title={`${b.day}${bucket > 1 ? ` ~ ${b.end} · 기록일 평균` : ""}\n${b.recorded ? formatDuration(values[i]) : "기록 없음"}`}
              >
                <span
                  className="bar-fill"
                  style={{
                    height: `${(values[i] / (maxHours * 3600000)) * 100}%`,
                  }}
                />
                <span className="bar-empty" />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="x-axis">
        <span>{from.replaceAll("-", ".")}</span>
        <span>{to.replaceAll("-", ".")}</span>
      </div>
      <p className="field-help chart-help">
        <i className="legend-dot" />{" "}
        {bucket > 1
          ? `${bucket}일 단위 · 막대는 기록한 날의 평균`
          : "귀속일별 총 수면시간"}
        <span>점은 기록 없는 날 · 막대를 누르면 기록 확인</span>
      </p>
    </div>
  );
}
export function Timeline({
  sessions,
  from,
  to,
  now,
  edit,
}: {
  sessions: Session[];
  from: string;
  to: string;
  now: number;
  edit: (session: Session) => void;
}) {
  const first = Date.parse(`${from}T00:00:00+09:00`),
    last = Date.parse(`${to}T00:00:00+09:00`) + DAY;
  const rows: { day: string; start: number; sessions: Session[] }[] = [];
  const count = Math.round((last - first) / DAY);
  for (let i = 0; i < count; i++) {
    const start = first + i * DAY;
    const matches = sessions.filter(
      (s) =>
        !s.deletedAt &&
        Date.parse(s.start) < start + DAY &&
        (s.end ? Date.parse(s.end) : now) > start,
    );
    if (matches.length || count <= 31)
      rows.push({ day: addDays(from, i), start, sessions: matches });
  }
  return (
    <>
      <p className="muted small">
        실제 잠든 구간을 한국 시간으로 표시해요. 자정을 넘긴 구간은 다음 행으로
        이어져요.
      </p>
      <div className="timeline-scroll">
        <div className="timeline">
          <div className="timeline-head">
            <span>실제 날짜</span>
            <div>
              {[0, 6, 12, 18, 24].map((h) => (
                <span key={h}>{String(h).padStart(2, "0")}:00</span>
              ))}
            </div>
          </div>
          {rows.map((row) => (
            <div className="timeline-row" key={row.day}>
              <span className="timeline-date">
                {row.day.slice(5).replace("-", "/")}
              </span>
              <div className="timeline-track">
                {[0, 25, 50, 75, 100].map((p) => (
                  <i key={p} style={{ left: `${p}%` }} />
                ))}
                {row.sessions.map((s) => {
                  const start = Math.max(row.start, Date.parse(s.start)),
                    end = Math.min(
                      row.start + DAY,
                      s.end ? Date.parse(s.end) : now,
                    );
                  return (
                    <button
                      key={s.id}
                      className={`sleep-block ${s.type} ${s.end ? "" : "running-block"}`}
                      onClick={() => edit(s)}
                      style={{
                        left: `${((start - row.start) / DAY) * 100}%`,
                        width: `${Math.max(0.2, ((end - start) / DAY) * 100)}%`,
                      }}
                      title={`${formatDateTime(s.start)} → ${s.end ? formatDateTime(s.end) : "진행 중"}\n${s.note}`}
                      aria-label={`${formatDateTime(s.start)}부터 ${s.end ? formatDateTime(s.end) : "진행 중"}, 기록 수정`}
                    >
                      <span>
                        {formatTime(s.start)}
                        {s.end ? ` — ${formatTime(s.end)}` : " · 진행 중"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      {!rows.length && (
        <div className="empty compact">이 기간에 수면 기록이 없어요.</div>
      )}
      <p className="field-help">
        타임라인의 날짜는 실제 날짜예요. 통계와 캘린더의 귀속일과 다를 수
        있어요.
      </p>
    </>
  );
}
