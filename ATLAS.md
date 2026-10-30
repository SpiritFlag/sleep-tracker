# Sleep Observatory — 시스템

## 구성

Next.js 16 App Router, React 19, TypeScript, 일반 CSS를 사용한다. 차트는 HTML/CSS로 직접 렌더링한다. Neon Postgres에 저장하며 `pg` 풀과 Vercel Fluid의 `attachDatabasePool`을 사용한다. Vercel 실행 지역은 Singapore (`sin1`), Node 24다.

소스 저장소: `SpiritFlag/sleep-tracker` (public). Vercel 프로젝트 `sleep-tracker`, SpiritFlag Universe 팀. 운영 주소는 https://sleep-tracker.spiritflag.work 이며 Cloudflare의 DNS 전용 CNAME으로 연결한다. Neon 전용 프로젝트 `dark-base-18573667` (Singapore). 기존 서비스의 데이터베이스는 사용하지 않는다.

## 저장과 API

`db/001-initial.sql`의 `sleep_sessions`가 실제 시작/종료 시각(`timestamptz`), 유형, 메모, 휴지통 이동 시각, 버전을 보존한다. 종료가 NULL이면 진행 중이다. 파생 귀속일을 저장하지 않으며 `src/lib/sleep.ts`에서 KST 기준으로 계산한다.

DB의 부분 exclusion constraint가 휴지통을 제외한 `tstzrange(started_at, ended_at, '[)')`의 겹침을 차단한다. 끝이 NULL이면 열린 구간이다. 부분 unique index도 진행 중 세션을 하나로 제한한다. 동시 저장·복구에도 적용되며 별도 확장이 필요 없다. 수정·휴지통·복구·영구 삭제는 버전으로 오래된 요청을 거부한다. 영구 삭제는 휴지통 안의 기록에만 가능하다.

`GET /api/sessions`는 전체 개인 세션을 반환한다. `POST`는 create/update/trash/restore/purge 동작을 검증한다. 인증을 먼저 확인하고 변경 요청은 APP_URL과 Origin이 일치해야 한다. JSON 크기와 메모 길이, 유효한 시각·종료 순서·미래 시각을 검증한다. 응답은 private/no-store이며 원본 DB 오류를 노출하지 않는다. 현재 개인 규모를 가정해 전체 기록을 불러오며 대규모 기록의 서버 페이지네이션은 구현하지 않았다.

## 양압기 기록

`db/002-cpap.sql`의 `cpap_daily`는 사용 날짜를 기본키로 하루 총 사용시간(정수 분, 0~1440)과 수정 버전을 저장한다. 수면 테이블·귀속일과 독립적이다. 같은 날짜의 수정은 기존 총 시간을 교체하며 오래된 버전의 덮어쓰기는 거부한다. 0시간을 저장해 잘못 입력한 시간을 바로잡을 수 있다.

`GET /api/cpap?month=YYYY-MM`은 한 달의 기록, `POST /api/cpap`는 `{date, minutes, version}`를 받는다. 신규 날짜는 version 0, 수정은 조회한 버전을 보낸다. 소유자 인증·Origin 검증·JSON 크기 제한을 적용하고 미래 날짜와 하루 24시간 초과를 거부한다. 응답은 private/no-store이며 에러에 DB 정보를 노출하지 않는다.

`src/lib/cpap.ts`가 월별 일수(윤년 포함), 총 분, 0시간인 날을 포함한 평균, 120분 × 월 일수, 부족시간을 계산한다. 현재 월 평균 분모에는 오늘을 포함한다. 남은 기간의 하루 필요시간은 내일부터 말일까지를 분모로 하여 분 단위 올림한다. 월 마지막 날에는 남은 일수로 나누지 않고 오늘 추가 사용 필요 여부를 표시한다. 충족 여부는 화면 표시용으로 버린 소수점이 아닌 원본 합계로 판정한다.

양압기 탭은 월 변경·명시적 새로고침 때 조회하고 저장 성공 응답으로 해당 날짜와 통계를 갱신한다. 기록 없는 날은 0시간이며 날짜 선택으로 기존 총 시간을 불러와 수정한다. 다른 탭에서 수정된 기록과 충돌하면 재조회를 안내한다. 수면 기록의 휴지통과 별개이며 사용시간 초기화는 해당 날짜를 0시간으로 저장한다.

마이그레이션 실행기는 `db/`의 번호가 붙은 SQL을 순서대로 트랜잭션 안에서 실행한다. 현재 두 스키마 파일은 재실행 가능하다. 양압기 스키마는 별도 개발 브랜치에서 먼저 검증하며 운영 반영은 추가 테이블 생성뿐이다. 화면 저장→수정→재조회는 개발 브랜치에서, 실제 운영 DB API 검증은 롤백되는 트랜잭션으로 수행한다.

## 인증

기존 Universe Clerk 인스턴스를 사용한다. `src/proxy.ts`가 APP_URL을 authorized party로 제한하고 페이지와 API가 검증된 세션의 사용자 ID를 OWNER_CLERK_USER_ID와 비교한다. 비로그인/다른 사용자/설정 실패는 각각 401/403/503으로 처리하며 DB를 읽지 않는다. 개발환경에도 인증 우회가 없다. production은 live Clerk 키를 요구한다.

필수 환경변수: DATABASE_URL (pooled), NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, OWNER_CLERK_USER_ID, APP_URL. 마이그레이션에는 DATABASE_URL_DIRECT를 추가한다. 값은 로컬 `.env.local`과 Vercel 환경변수로 관리하고 Git에는 저장하지 않는다. Preview에 운영 DB/인증 변수를 자동 공유하지 않는다.

## 화면과 집계

서버에서 인증 후 초기 기록을 읽는다. 클라이언트가 60초마다, 탭으로 돌아올 때, 저장 후 다시 읽는다. 조회 실패 시 기존 기록을 유지하고 오류를 표시한다. 진행 중 경과시간은 10초마다 갱신하며 브라우저를 닫아도 DB 기록은 남는다. 미완료·휴지통은 모든 통계에서 제외한다.

`stats`는 귀속일별 합계로 기록일 평균과 전체 날짜 평균을 계산한다. 빈 기록일은 그래프에 점으로 구분한다. 장기간 그래프는 최대 120개 막대로 묶어 기록일 평균을 표시하지만 전체 통계는 원본으로 계산한다. 타임라인은 실제 자정 기준 행에 연속 구간을 시각적으로 나눠 그리며 원본 세션을 수정하지 않는다. 31일보다 긴 타임라인은 기록이 있는 날짜만 표시한다.

## 개발

`npm ci`, `npm run typecheck`, `npm test`, `npm run build`를 사용한다. Vercel 프로젝트 연결과 환경변수 준비 후 `npm run db:migrate`로 스키마를 적용한다. `npm run dev`는 `http://127.0.0.1:3001`에 바인딩한다. 로컬 Clerk 사용 시 APP_URL도 그 origin으로 설정하고 해당 origin을 Clerk에서 허용해야 한다.

테스트는 한국 시간 정오 경계·분할 수면·집계, 인증·출처·입력 검증, PGlite의 실제 Postgres 제약과 수정/휴지통/복구를 검증한다. 실제 Neon DB에서도 합성 기록의 저장·조회·수정·휴지통·복구를 트랜잭션 안에서 확인하고 롤백했다. 데스크톱·375px 모바일 화면은 운영 DB와 분리한 임시 가상 기록으로 확인했으며 임시 화면은 소스에서 제거했다. 새로운 대화형 로그인 및 실제 수면의 장시간 시작→재접속→종료는 별도 사용 검증이 필요하다.
