# Sleep Observatory

평가 없이, 있는 그대로. 수면시간과 패턴을 직접 기록하고 관찰하는 개인용 웹사이트.

- 수면 시작·종료와 수동 입력, 유형과 메모
- 수면시간 그래프, 실제 시간 타임라인, 귀속일 캘린더
- 한국 시간 정오 경계의 시작 시각 기준 날짜 귀속
- 휴지통·복구, 중복 수면 차단, 소유자 전용 Universe 로그인

제품의 의도와 규칙은 [VISION.md](VISION.md), 시스템과 실행 방법은 [ATLAS.md](ATLAS.md)를 참고한다.

```sh
npm ci
npm run typecheck
npm test
npm run build
```

`.env.example`의 변수명을 참고해 로컬과 Vercel 환경을 구성한다. 실제 인증정보나 개인 수면 기록은 저장소에 포함하지 않는다.
