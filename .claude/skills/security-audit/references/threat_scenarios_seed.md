# Threat Scenarios Seed

Phase 3에서 재활용 가능한 **위협 모델 시나리오 카탈로그**. Phase 2 Agent가 잡을 수 없는 **비즈니스 로직 결함**에 집중한다.

매 감사에서:

1. 아래 시나리오가 **여전히 유효한지** 재검토
2. 새로운 공격 경로를 발견하면 **신규 시나리오 추가**
3. 완화된 항목은 `Retired` 섹션으로 이관

각 시나리오 형식:

```
## S-N: <한 줄 제목>
- 전제: 공격자 사전 지식/권한
- 스텝: 1~3 단계 공격 경로
- 영향: 비용 / 데이터 / 신뢰 피해
- 완화: 구체적 방어 + 구현 비용
- 우선순위: Critical / High / Medium / Low
- 상태: Active / Mitigated / Watch
```

---

## Active Scenarios

### S-1: demo.ts Gemini 쿼터 소진 (DoS via 비용 증폭)

- **전제**: demo worker가 인증 없이 공개 엔드포인트 (`demo.ropeman.dev`). Rate limit은 V8 isolate별 인메모리 Map.
- **스텝**:
  1. 공격자가 다수 IP (또는 프록시)에서 동시 요청을 분산 전송
  2. Cloudflare가 여러 worker isolate에 분배 → 각 isolate의 카운터가 독립적으로 작동 → 글로벌 limit 우회
  3. 분당 10/IP + 일일 200/전역 제한을 실질적으로 수백 배 초과 가능
- **영향**: Google Gemini API 과금 폭증 (서버 key 기준). 일일 예산 소진 시 정상 사용자 차단.
- **완화**:
  - (저비용) Cloudflare Rate Limiting Rules (무료 티어 10k req/day) — zone 레벨에서 하드 limit
  - (중비용) KV 또는 Durable Objects 기반 분산 카운터
  - (비용 0) `GEMINI_API_KEY`에 일일 예산 한도 설정 (Google Cloud Console)
- **우선순위**: High
- **상태**: Active

### S-2: Explore 스냅샷 오염 (admin 토큰 유출 시나리오)

- **전제**: `EXPLORE_ADMIN_TOKEN` 유출 (devtools 화면 공유, 클립보드 유출, PC 침해 등)
- **스텝**:
  1. 공격자가 토큰 획득
  2. `POST /explore/react`로 악성 snapshot 업로드 (`isValidSnapshot` 통과하는 최소 구조)
  3. `semanticLevels[__root__].nodes[].label`에 긴 텍스트나 오해 유발 콘텐츠 주입 → 방문자가 React 아키텍처로 오인
- **영향**: 브랜드 신뢰 훼손. XSS는 `{@html}` 경로가 아니므로 낮음 (validateSnapshot 통과 후 텍스트로만 렌더되는 한).
- **완화**:
  - 토큰 회전 정책: 유출 감지 시 즉시 `wrangler secret put`로 재발급
  - GET `/explore/{slug}` 응답에 `updatedAt`/`uploaderSignature` 메타를 추가해 이상 변경 감지
  - Phase 2 Agent B가 실제로 `node.label`/`description` 값이 `{@html}` 없이 텍스트로만 렌더되는지 매 감사에서 확인
- **우선순위**: Medium
- **상태**: Active

### S-3: 서버 측 URL 조립 경유 SSRF

- **전제**: 사용자 입력(owner, repo, ref, path)으로 업스트림 URL을 조립하던 GitHub 프록시 워커
- **상태**: Retired (2026-11-11). 워커가 배포된 적 없이 삭제되어 이 공격면은 사라졌다. 새 워커가 사용자 입력으로 URL을 조립하면 이 유형으로 다시 연다.

### S-4: Share slug 열거 (비공개 정보 유출)

- **전제**: share slug는 base62 8자 (62^8 ≈ 218조) — 무차별 대입 비현실적
- **스텝**:
  1. 공격자가 `/share/{slug}` 무작위 GET 시도
  2. 404와 200 응답 차이로 valid slug 존재 여부 확인
  3. 특정 사용자의 share 링크가 어디 공유됐는지 검색(OSINT) 후 stealing
- **영향**: 매우 낮음 (공간 크기 때문에 brute force 불가). 다만 SNS에 slug 노출 시 누구나 볼 수 있음 (현재 의도된 동작).
- **완화**:
  - 이미 `crypto.getRandomValues()` 사용으로 예측 불가
  - 14일 TTL로 자연 만료
  - GET rate limit 추가 고려 (현재 POST만 제한)
- **우선순위**: Low
- **상태**: Active

### S-5: Bridge WebSocket prompt injection

- **전제**: Bridge는 localhost 전용이지만 사용자 브라우저가 `ws://localhost:9800`으로 연결
- **스텝**:
  1. 공격자가 사용자 브라우저에서 임의 페이지를 열도록 유도 (피싱 링크)
  2. 해당 페이지의 JS가 `ws://localhost:9800`로 연결 (같은 origin 정책이 WebSocket엔 다르게 적용)
  3. `analyze` 메시지의 payload에 CLI prompt injection (`rm -rf ~` 같은 shell command는 통하지 않지만, LLM prompt 조작으로 로컬 파일 요약을 악의적으로 변경)
- **영향**: 로컬 파일 내용을 조작된 답변으로 사용자에게 보여줄 수 있음. 파일 자체 변경은 없음.
- **완화**:
  - Bridge WebSocket upgrade 시 `Origin` 헤더 검증 (`http://localhost:5173` 또는 `https://ropeman.dev`만 허용)
  - prompt 길이 제한 (예: 32KB)
  - CLI stdin에 전달 전 shell metacharacter (`&`, `|`, `$`, backtick) sanitize
- **우선순위**: Medium
- **상태**: Active

### S-6: 의존성 공급망 공격 (typosquatting / compromise)

- **전제**: Ropeman은 `@xyflow/svelte`, `@mlc-ai/web-llm`, `marked`, `prismjs` 등 상위 15개 + 전이 의존성 수백 개 사용
- **스텝**:
  1. 공격자가 저명한 deps의 유지보수 계정 탈취 (과거 `node-ipc` 사례처럼)
  2. 악성 버전 publish → 다음 `bun install` 시 포함
  3. 빌드 산출물에 XSS/exfiltration payload 삽입
- **영향**: Critical — 전 사용자 브라우저에서 임의 코드 실행
- **완화**:
  - CI에 `npm audit --audit-level=high` 스텝 추가
  - Dependabot 활성화 (의존성 자동 업데이트 PR)
  - 주요 deps는 lockfile에 integrity hash 확인 (`bun.lock` / `package-lock.json`의 `integrity`)
  - 선택: `npm ci` 대신 `npm ci --ignore-scripts`로 설치 스크립트 차단
- **우선순위**: High
- **상태**: Active (완화 조치 미구현)

---

## Mitigated / Retired Scenarios

(비어있음 — 본 스킬이 처음 실행되면서 등록된 초기 시나리오만 존재)

---

## Scenario 발굴 가이드

새로운 시나리오를 찾을 때 던지는 질문:

1. **이 엔드포인트가 인증 없이 호출되면 비용이 얼마나 늘어날 수 있나?** (S-1 유형)
2. **admin 토큰이 유출되면 데이터 무결성/평판에 어떤 피해가?** (S-2 유형)
3. **사용자 입력이 서버 측 URL/파일 경로 조립에 쓰이는 지점은?** (S-3 유형)
4. **슬러그/ID가 열거 가능한가? 정보 유출 경로가 있나?** (S-4 유형)
5. **로컬/내부 서비스가 브라우저에서 접근 가능한가? Origin 검증은?** (S-5 유형)
6. **외부 의존성이 빌드에 주입되는 경로에 가드가 있나?** (S-6 유형)
