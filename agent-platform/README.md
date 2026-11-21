# Duo Research — Claude × Gemini 협업 에이전트 플랫폼

Claude와 Gemini가 한 팀으로 **자료조사 → 교차 검증 → 종합/작업**을 수행하는 대화형 웹 앱입니다.
Node.js 하나로 돌아가며 외부 패키지 의존성이 없습니다.

## 동작 방식 (협업 리서치 모드)

| 단계 | 담당 | 내용 |
|---|---|---|
| 1. 계획 | Claude | 질문을 해석하고 하위 과제를 나눠 Claude/Gemini에 배정 (JSON) |
| 2. 자료조사 | 둘 다 (동시) | Claude는 Anthropic `web_search` 도구, Gemini는 Google 검색 그라운딩(`google_search`)으로 조사 |
| 3. 교차 검증 | 둘 다 (동시) | 서로의 조사 노트를 "확인됨 / 수정 필요 / 확인 불가 / 보완"으로 검토 (검색으로 재확인) |
| 4. 종합 | Claude | 검증 결과를 반영해 최종 답변·결과물 작성, 수집된 출처 목록의 번호 `[n]`으로 인용 |

- 모든 단계에 "출처 없는 내용을 지어내지 않고, 확인 못 한 내용은 `[미확인]`으로 표시"하는 원칙이 들어갑니다.
- 한쪽 에이전트가 실패해도 다른 쪽 결과로 계속 진행합니다.
- 화면에서 단계별 진행 상황과 각 에이전트의 노트·출처를 펼쳐 볼 수 있습니다.
- 이전 대화(최근 8개 메시지)가 맥락으로 이어집니다.
- 그 외 모드: **Claude 단독**, **Gemini 단독**. 웹 검색은 끌 수 있습니다.

## 실행

```bash
cd agent-platform
cp .env.example .env      # ANTHROPIC_API_KEY, GEMINI_API_KEY 입력
npm start                 # http://localhost:8787
```

- API 키 발급: Anthropic Console(console.anthropic.com), Google AI Studio(aistudio.google.com)
- 키 없이 화면과 흐름만 보려면 `npm run mock` (가짜 응답, 실제 조사 아님)
- 테스트: `npm test` (API를 흉내 낸 응답으로 전체 파이프라인 검증)

## 설정 (`.env`)

| 변수 | 기본값 | 설명 |
|---|---|---|
| `CLAUDE_MODEL` | `claude-opus-5-5` | 비용을 줄이려면 `claude-sonnet-5-5` 등 |
| `GEMINI_MODEL` | `gemini-2.5-flash` | 계정에서 쓸 수 있는 최신 모델로 바꿔도 됩니다. 목록: https://ai.google.dev/gemini-api/docs/models |
| `PORT` | `8787` | |
| `MOCK` | `0` | `1`이면 API 호출 없이 가짜 응답 |

## 비용 참고
협업 모드 한 번에 API 호출이 약 6회(Claude 4회, Gemini 2회) 발생하고, 검색 도구 사용료가 별도로 붙습니다.
Gemini 3 계열은 Google 검색 그라운딩 과금 방식이 2.5 이하와 다릅니다(Google 문서 참고).

## 구조

```
server.mjs            HTTP 서버, /api/chat (SSE 스트리밍), /api/status
lib/orchestrator.mjs  협업 파이프라인과 프롬프트
lib/claude.mjs        Anthropic Messages API + web_search
lib/gemini.mjs        Gemini generateContent + google_search 그라운딩
lib/mock.mjs          MOCK 모드 응답
public/               채팅 UI (index.html, app.js, markdown.js, style.css)
```

## 한계
- 대화 기록은 브라우저 메모리에만 있어 새로고침하면 사라집니다.
- 로그인/인증이 없으므로 로컬(개인 PC)에서 쓰는 것을 전제로 합니다. 외부에 공개하려면 인증을 추가하세요.
- 실제 API 키로는 이 저장소에서 아직 실행 검증하지 않았습니다(MOCK과 형식 흉내 테스트만 통과).
