// 실제 API 대신 fetch 를 가로채 Claude/Gemini 응답 형식을 흉내 내고 전체 흐름을 검증한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.ANTHROPIC_API_KEY = 'test';
process.env.GEMINI_API_KEY = 'test';
process.env.MOCK = '0';
const { runTurn } = await import('../lib/orchestrator.mjs');

const calls = [];
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  calls.push({ url, body });
  const json = (o) => ({ ok: true, json: async () => o });
  if (url.includes('anthropic')) {
    if (/JSON 한 개만/.test(body.system)) {
      return json({ stop_reason: 'end_turn', content: [{ type: 'text', text: '계획: {"summary":"s","claude_tasks":["c1"],"gemini_tasks":["g1"]}' }] });
    }
    return json({ stop_reason: 'end_turn', content: [
      { type: 'web_search_tool_result', content: [{ url: 'https://a.example', title: 'A' }] },
      { type: 'text', text: 'Claude 결과', citations: [{ url: 'https://a.example', title: 'A' }] },
    ] });
  }
  return json({ candidates: [{
    content: { parts: [{ text: 'Gemini 결과' }] },
    groundingMetadata: { groundingChunks: [{ web: { uri: 'https://g.example', title: 'G' } }] },
  }] });
};

test('협업 모드: 계획→조사→교차검증→종합', async () => {
  const events = [];
  await runTurn({ question: '테스트 질문', emit: (e) => events.push(e) });
  const done = events.filter((e) => e.type === 'step' && e.status === 'done').map((e) => `${e.agent}:${e.phase}`);
  assert.deepEqual(done.sort(), ['claude:plan', 'claude:research', 'claude:review', 'claude:synthesis', 'gemini:research', 'gemini:review'].sort());
  const final = events.find((e) => e.type === 'final');
  assert.equal(final.content, 'Claude 결과');
  assert.deepEqual(final.sources.map((s) => s.url), ['https://a.example', 'https://g.example']);
  // 계획에서 배정된 과제가 조사 프롬프트에 전달됐는지
  assert.ok(calls.some((c) => c.url.includes('googleapis') && c.body.contents[0].parts[0].text.includes('g1')));
  assert.ok(calls.some((c) => c.url.includes('googleapis') && c.body.tools?.[0]?.google_search));
  assert.ok(calls.some((c) => c.url.includes('anthropic') && c.body.tools?.[0]?.type === 'web_search_20250305'));
});

test('한쪽 실패 시 나머지로 계속 진행', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => url.includes('googleapis')
    ? { ok: false, status: 500, text: async () => 'boom' } : orig(url, init);
  const events = [];
  await runTurn({ question: 'q', emit: (e) => events.push(e) });
  globalThis.fetch = orig;
  assert.ok(events.some((e) => e.agent === 'gemini' && e.status === 'error'));
  assert.ok(events.some((e) => e.type === 'final'));
});
