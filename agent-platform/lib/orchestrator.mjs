import { config } from './config.mjs';
import { callClaude, dedupe } from './claude.mjs';
import { callGemini } from './gemini.mjs';
import { mockCall } from './mock.mjs';

/** 모든 단계에 공통으로 들어가는 원칙 */
const PRINCIPLES = `원칙:
- 출처가 없거나 타당성이 불분명한 내용을 꾸미거나 지어내지 않는다.
- 검색으로 확인한 사실과 추론·의견을 구분한다. 확인하지 못한 내용은 [미확인]으로 표시한다.
- 모르는 것은 모른다고 쓴다.
- 사용자의 언어(기본 한국어)로 답한다.`;

function agentCall(agent, opts) {
  if (config.mock) return mockCall(agent, opts);
  return agent === 'claude' ? callClaude(opts) : callGemini(opts);
}

function historyBlock(history) {
  if (!history?.length) return '';
  const lines = history
    .slice(-8)
    .map((h) => `[${h.role === 'user' ? '사용자' : '팀 답변'}]\n${String(h.content).slice(0, 3000)}`);
  return `\n\n이전 대화 맥락:\n${lines.join('\n\n')}`;
}

function parseJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

const list = (arr) => arr.map((t, i) => `${i + 1}. ${t}`).join('\n');

/**
 * 한 번의 사용자 질문을 처리한다.
 * mode: 'collab' | 'claude' | 'gemini'
 * emit(event) 로 진행 상황을 스트리밍한다.
 */
export async function runTurn({ question, history = [], mode = 'collab', webSearch = true, emit, signal }) {
  const ctx = historyBlock(history);

  // ── 단독 모드 ───────────────────────────────────────────
  if (mode === 'claude' || mode === 'gemini') {
    emit({ type: 'step', agent: mode, phase: 'answer', status: 'running', title: '답변 작성 중' });
    const r = await agentCall(mode, {
      system: `너는 자료조사와 작업을 돕는 어시스턴트다.\n${PRINCIPLES}`,
      messages: [...history.slice(-8).map((h) => ({ role: h.role, content: h.content })), { role: 'user', content: question }],
      webSearch,
      signal,
    });
    emit({ type: 'step', agent: mode, phase: 'answer', status: 'done', title: '답변', content: r.text, sources: r.sources });
    emit({ type: 'final', content: r.text, sources: r.sources });
    return;
  }

  // ── 1. 계획 (Claude) ────────────────────────────────────
  emit({ type: 'step', agent: 'claude', phase: 'plan', status: 'running', title: '작업 계획 세우는 중' });
  let plan = { summary: '', claude_tasks: [question], gemini_tasks: [question] };
  try {
    const r = await agentCall('claude', {
      system: `너는 Claude와 Gemini 두 에이전트로 이뤄진 리서치 팀의 리더다. 사용자 요청을 분석해 작업 계획을 세운다.
- Gemini는 Google 검색 그라운딩에 강하다: 최신 동향, 수치, 뉴스, 제품 정보 등을 맡긴다.
- Claude(너)는 웹 검색과 깊은 분석에 강하다: 개념 정리, 비교·논증, 원문 문서 확인, 작업 결과물 작성을 맡는다.
반드시 다음 JSON 한 개만 출력한다:
{"summary": "요청 해석 한두 문장", "claude_tasks": ["..."], "gemini_tasks": ["..."]}
각 목록은 1~3개의 구체적인 하위 과제로 쓴다.${ctx}`,
      messages: [{ role: 'user', content: question }],
      maxTokens: 1024,
      signal,
    });
    const p = parseJson(r.text);
    if (p?.claude_tasks?.length && p?.gemini_tasks?.length) plan = p;
    emit({
      type: 'step', agent: 'claude', phase: 'plan', status: 'done', title: '작업 계획',
      content: `${plan.summary || ''}\n\n**Claude 담당**\n${list(plan.claude_tasks)}\n\n**Gemini 담당**\n${list(plan.gemini_tasks)}`,
    });
  } catch (e) {
    emit({ type: 'step', agent: 'claude', phase: 'plan', status: 'error', title: '계획 실패 — 질문 전체를 양쪽에 맡깁니다', content: e.message });
  }

  // ── 2. 병렬 자료조사 ────────────────────────────────────
  const researchSystem = (name) => `너는 리서치 팀의 ${name}다. 맡은 하위 과제를 웹 검색으로 조사해 근거 중심의 조사 노트를 쓴다.
- 핵심 사실마다 출처(사이트명 또는 URL)를 붙인다.
- 서로 다른 출처가 엇갈리면 그대로 밝힌다.
${PRINCIPLES}${ctx}`;
  const researchPrompt = (tasks) => `사용자 원 질문: ${question}\n\n네가 맡은 하위 과제:\n${list(tasks)}`;

  emit({ type: 'step', agent: 'claude', phase: 'research', status: 'running', title: '자료조사 중' });
  emit({ type: 'step', agent: 'gemini', phase: 'research', status: 'running', title: '자료조사 중' });
  const [cR, gR] = await Promise.allSettled([
    agentCall('claude', { system: researchSystem('Claude'), messages: [{ role: 'user', content: researchPrompt(plan.claude_tasks) }], webSearch, signal }),
    agentCall('gemini', { system: researchSystem('Gemini'), messages: [{ role: 'user', content: researchPrompt(plan.gemini_tasks) }], webSearch, signal }),
  ]);
  const research = {};
  for (const [agent, r] of [['claude', cR], ['gemini', gR]]) {
    if (r.status === 'fulfilled') {
      research[agent] = r.value;
      emit({ type: 'step', agent, phase: 'research', status: 'done', title: '조사 노트', content: r.value.text, sources: r.value.sources });
    } else {
      emit({ type: 'step', agent, phase: 'research', status: 'error', title: '조사 실패', content: r.reason?.message || String(r.reason) });
    }
  }
  if (!research.claude && !research.gemini) throw new Error('두 에이전트 모두 자료조사에 실패했습니다. API 키와 모델 ID를 확인하세요.');

  // ── 3. 교차 검증 (서로의 노트를 검토) ───────────────────
  const reviewSystem = (name) => `너는 리서치 팀의 ${name}다. 동료가 쓴 조사 노트를 검증한다.
- 사실 주장 중 의심스럽거나 출처가 약한 것을 짚고, 가능하면 검색으로 확인해 바로잡는다.
- 빠진 중요한 관점이나 정보를 보완한다.
- 형식: "확인됨 / 수정 필요 / 확인 불가 / 보완" 항목으로 간결하게.
${PRINCIPLES}`;
  const reviews = {};
  const jobs = [];
  if (research.gemini) {
    emit({ type: 'step', agent: 'claude', phase: 'review', status: 'running', title: 'Gemini 노트 검증 중' });
    jobs.push(['claude', agentCall('claude', {
      system: reviewSystem('Claude'),
      messages: [{ role: 'user', content: `원 질문: ${question}\n\nGemini의 조사 노트:\n${research.gemini.text}` }],
      webSearch, signal,
    })]);
  }
  if (research.claude) {
    emit({ type: 'step', agent: 'gemini', phase: 'review', status: 'running', title: 'Claude 노트 검증 중' });
    jobs.push(['gemini', agentCall('gemini', {
      system: reviewSystem('Gemini'),
      messages: [{ role: 'user', content: `원 질문: ${question}\n\nClaude의 조사 노트:\n${research.claude.text}` }],
      webSearch, signal,
    })]);
  }
  const settled = await Promise.allSettled(jobs.map((j) => j[1]));
  settled.forEach((r, i) => {
    const agent = jobs[i][0];
    const other = agent === 'claude' ? 'Gemini' : 'Claude';
    if (r.status === 'fulfilled') {
      reviews[agent] = r.value;
      emit({ type: 'step', agent, phase: 'review', status: 'done', title: `${other} 노트 검증`, content: r.value.text, sources: r.value.sources });
    } else {
      emit({ type: 'step', agent, phase: 'review', status: 'error', title: '검증 실패', content: r.reason?.message || String(r.reason) });
    }
  });

  // ── 4. 종합 (Claude) ───────────────────────────────────
  const allSources = dedupe([
    ...(research.claude?.sources || []), ...(research.gemini?.sources || []),
    ...(reviews.claude?.sources || []), ...(reviews.gemini?.sources || []),
  ]);
  const srcList = allSources.map((s, i) => `[${i + 1}] ${s.title} — ${s.url}`).join('\n') || '(수집된 출처 없음)';
  const section = (label, r) => (r ? `### ${label}\n${r.text}` : `### ${label}\n(없음)`);

  emit({ type: 'step', agent: 'claude', phase: 'synthesis', status: 'running', title: '최종 답변 종합 중' });
  const final = await agentCall('claude', {
    system: `너는 리서치 팀 리더다. 팀의 조사 노트와 교차 검증 결과를 종합해 사용자에게 최종 답변을 쓴다.
- 교차 검증에서 "수정 필요"로 지적된 내용은 고쳐서 반영하고, "확인 불가"는 [미확인]으로 남기거나 뺀다.
- 사실 문장에는 아래 출처 목록의 번호를 [n] 형식으로 붙인다. 목록에 없는 출처를 만들어내지 않는다.
- 두 에이전트 의견이 갈린 지점이 있으면 짧게 밝힌다.
- 요청이 작업(문서·코드·표 작성 등)이면 결과물을 직접 만든다.
${PRINCIPLES}${ctx}`,
    messages: [{
      role: 'user',
      content: `사용자 질문: ${question}\n\n${section('Claude 조사 노트', research.claude)}\n\n${section('Gemini 조사 노트', research.gemini)}\n\n${section('Claude의 Gemini 노트 검증', reviews.claude)}\n\n${section('Gemini의 Claude 노트 검증', reviews.gemini)}\n\n### 출처 목록\n${srcList}`,
    }],
    maxTokens: 8000,
    signal,
  });
  emit({ type: 'step', agent: 'claude', phase: 'synthesis', status: 'done', title: '종합 완료' });
  emit({ type: 'final', content: final.text, sources: allSources });
}
