import { SignInButton, UserButton } from "@clerk/nextjs";
import { access } from "@/lib/access";
import { readSessions } from "@/lib/store";
import Dashboard from "./ui/dashboard";
export const dynamic = "force-dynamic";
export default async function Page() {
  const state = await access();
  if (state !== "owner")
    return (
      <main className="gate">
        <span className="moon-logo">☾</span>
        <p className="eyebrow">YOUR PRIVATE SLEEP ARCHIVE</p>
        <h1>
          잠이 쌓이는 시간<span>.</span>
        </h1>
        <p>
          잠든 시간과 깨어난 시간.
          <br />
          평가 없이, 나의 수면을 차곡차곡.
        </p>
        <div className="gate-action">
          {state === "signed-out" ? (
            <SignInButton mode="modal" forceRedirectUrl="/">
              <button className="button accent">Universe 로그인</button>
            </SignInButton>
          ) : state === "forbidden" ? (
            <>
              <p>이 기록실은 소유자 전용이에요.</p>
              <UserButton />
            </>
          ) : (
            <p role="status">
              인증 설정을 확인하고 있어요. 잠시 후 다시 방문해 주세요.
            </p>
          )}
        </div>
        <small>Sleep Observatory · 개인 수면 기록실</small>
      </main>
    );
  let sessions = null;
  try {
    sessions = await readSessions();
  } catch {
    /* Dashboard offers a retry without exposing DB errors. */
  }
  return (
    <Dashboard
      initial={sessions}
      initialTime={Date.now()}
      account={<UserButton />}
    />
  );
}
