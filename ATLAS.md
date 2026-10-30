# Sleep Observatory — 시스템

## 구성

Next.js 16 App Router, React 19, TypeScript, 일반 CSS를 사용한다. 차트는 HTML/CSS로 직접 렌더링한다. Neon Postgres에 저장하며 `pg` 풀과 Vercel Fluid의 `attachDatabasePool`을 사용한다. Vercel 실행 지역은 Singapore (`sin1`), Node 24다.

소스 저장소: `SpiritFlag/sleep-tracker` (public). Vercel 프로젝트 `sleep-tracker`, SpiritFlag Universe 팀. Neon 전용 프로젝트 `dark-base-18573667` (Singapore). 기존 서비스의 데이터베이스는 사용하지 않는다.

## 저장과 API

`db/001-initial.sql`의 `sleep_sessions`가 실제 시작/종료 시각(`timestamptz`), 유형, 메모, 휴지통 이동 시각, 버전을 보존한다. 종료가 NULL이면 진행 중이다. 파생 귀속일을 저장하지 않으며 `src/lib/sleep.ts`에서 KST 기준으로 계산한다.

DB의 부분 exclusion constraint가 휴지통을 제외한 `tstzrange(started_at, ended_at, '[)')`의 겹침을 차단한다. 끝이 NULL이면 열린 구간이다. 부분 unique index도 진행 중 세션을 하나로 제한한다. 동시 저장·복구에도 적용되며 별도 확장이 필요 없다. 수정·휴지통·복구·영구 삭제는 버전으로 오래된 요청을 거부한다. 영구 삭제는 휴지통 안의 기록에만 가능하다.

`GET /api/sessions`는 전체 개인 세션을 반환한다. `POST`는 create/update/trash/restore/purge 동작을 검증한다. 인증을 먼저 확인하고 변경 요청은 APP_URL과 Origin이 일치해야 한다. JSON 크기와 메모 길이, 유효한 시각·종료 순서·미래 시각을 검증한다. 응답은 private/no-store이며 원본 DB 오류를 노출하지 않는다. 현재 개인 규모를 가정해 전체 기록을 불러오며 대규모 기록의 서버 페이지네이션은 구현하지 않았다.

## 인증

기존 Universe Clerk 인스턴스를 사용한다. `src/proxy.ts`가 APP_URL을 authorized party로 제한하고 페이지와 API가 검증된 세션의 사용자 ID를 OWNER_CLERK_USER_ID와 비교한다. 비로그인/다른 사용자/설정 실패는 각각 401/403/503으로 처리하며 DB를 읽지 않는다. 개발환경에도 인증 우회가 없다. production은 live Clerk 키를 요구한다.

필수 환경변수: DATABASE_URL (pooled), NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, OWNER_CLERK_USER_ID, APP_URL. 마이그레이션에는 DATABASE_URL_DIRECT를 추가한다. 값은 로컬 `.env.local`과 Vercel 환경변수로 관리하고 Git에는 저장하지 않는다. Preview에 운영 DB/인증 변수를 자동 공유하지 않는다.

## 화면과 집계

서버에서 인증 후 초기 기록을 읽는다. 클라이언트가 60초마다, 탭으로 돌아올 때, 저장 후 다시 읽는다. 조회 실패 시 기존 기록을 유지하고 오류를 표시한다. 진행 중 경과시간은 10초마다 갱신하며 브라우저를 닫아도 DB 기록은 남는다. 미완료·휴지통은 모든 통계에서 제외한다.

`stats`는 귀속일별 합계로 기록일 평균과 전체 날짜 평균을 계산한다. 빈 기록일은 그래프에 점으로 구분한다. 장기간 그래프는 최대 120개 막대로 묶어 기록일 평균을 표시하지만 전체 통계는 원본으로 계산한다. 타임라인은 실제 자정 기준 행에 연속 구간을 시각적으로 나눠 그리며 원본 세션을 수정하지 않는다. 31일보다 긴 타임라인은 기록이 있는 날짜만 표시한다.

## 개발

`npm ci`, `npm run typecheck`, `npm test`, `npm run build`를 사용한다. Vercel 프로젝트 연결과 환경변수 준비 후 `npm run db:migrate`로 스키마를 적용한다. `npm run dev`는 `http://127.0.0.1:3001`에 바인딩한다. 로컬 Clerk 사용 시 APP_URL도 그 origin으로 설정하고 해당 origin을 Clerk에서 허용해야 한다.

테스트는 한국 시간 정오 경계·분할 수면·집계, 인증·출처·입력 검증, PGlite의 실제 Postgres 제약과 수정/휴지통/복구를 검증한다. 실제 로그인과 화면 검증 여부는 작업 결과에서 별도로 보고한다.
