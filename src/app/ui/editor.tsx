"use client";
import { useEffect, useRef, useState } from "react";
import {
  attributedDate,
  formatDuration,
  localInput,
  parseLocal,
  TYPES,
  type Session,
  type SleepType,
} from "@/lib/sleep";
import type { Mutation } from "@/lib/store";
export type EditorState = { session?: Session; finish?: boolean; day?: string };
export default function Editor({
  state,
  close,
  save,
}: {
  state: EditorState;
  close: () => void;
  save: (input: Mutation) => Promise<boolean>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [id] = useState(() => state.session?.id ?? crypto.randomUUID());
  const [start, setStart] = useState(
    state.session
      ? localInput(state.session.start)
      : state.day
        ? `${state.day}T02:00`
        : localInput(Date.now() - 8 * 3600000),
  );
  const [end, setEnd] = useState(
    state.session?.end
      ? localInput(state.session.end)
      : state.session && !state.finish
        ? ""
        : state.day
          ? `${state.day}T08:00`
          : localInput(),
  );
  const [type, setType] = useState<SleepType>(
    state.session?.type ?? "unspecified",
  );
  const [note, setNote] = useState(state.session?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  let attributed = "—",
    elapsed: number | null = null;
  try {
    attributed = attributedDate(parseLocal(start));
    if (end)
      elapsed = Date.parse(parseLocal(end)) - Date.parse(parseLocal(start));
  } catch {
    /* An incomplete field remains editable. */
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const fields = {
        id,
        start: parseLocal(start),
        end: end ? parseLocal(end) : null,
        type,
        note,
      };
      if (
        (!state.session || state.finish || state.session.end) &&
        !fields.end
      ) {
        setError("기상 시각을 입력해 주세요.");
        return;
      }
      setBusy(true);
      const ok = await save(
        state.session
          ? { action: "update", version: state.session.version, ...fields }
          : { action: "create", ...fields },
      );
      if (ok) close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "입력을 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="editor"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
      aria-labelledby="editor-title"
    >
      <form onSubmit={submit}>
        <div className="section-head">
          <div>
            <p className="eyebrow">SLEEP SESSION</p>
            <h2 id="editor-title">
              {state.finish
                ? "수면 마무리"
                : state.session
                  ? "기록 수정"
                  : "수면 기록 추가"}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={close}
            disabled={busy}
            aria-label="닫기"
          >
            ×
          </button>
        </div>
        <p className="muted">
          {state.finish
            ? "실제로 잠들고 깨어난 시각으로 조정할 수 있어요."
            : "기억나는 시간을 적어 주세요. 나중에 수정할 수 있어요."}
        </p>
        <div className="form-grid">
          <label>
            취침 시각 <span>KST</span>
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              required
            />
          </label>
          <label>
            기상 시각 <span>KST</span>
            <input
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              required={!state.session || state.finish || !!state.session.end}
            />
          </label>
        </div>
        <div className="attribution">
          <span>
            귀속일 <strong>{attributed}</strong>
          </span>
          <span>
            {elapsed !== null && elapsed > 0
              ? formatDuration(elapsed)
              : end
                ? "시간을 확인해 주세요"
                : "진행 중"}
          </span>
        </div>
        <p className="field-help">
          취침 시각이 정오 12시부터면 다음 날에 귀속해요.
        </p>
        <label>
          수면 유형 <span>선택 사항</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as SleepType)}
          >
            {Object.entries(TYPES).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          메모 <span>선택 사항</span>
          <textarea
            rows={4}
            maxLength={10000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="이날의 잠에 남겨두고 싶은 이야기"
          />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="button"
            onClick={close}
            disabled={busy}
          >
            취소
          </button>
          <button className="button accent" disabled={busy}>
            {busy ? "저장 중…" : "기록 저장"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
