import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.GEMINI_API_KEY = 'k';
const { handle } = await import('../gemini-mcp/server.mjs');

test('gemini_research: 그라운딩 출처를 구조화해 돌려준다', async () => {
  let sent;
  globalThis.fetch = async (url, init) => {
    sent = { url, body: JSON.parse(init.body), headers: init.headers };
    return { ok: true, json: async () => ({ candidates: [{
      content: { parts: [{ text: '노트' }] },
      groundingMetadata: { groundingChunks: [{ web: { uri: 'https://a', title: 'A' } }, { web: { uri: 'https://a', title: 'A' } }] },
    }] }) };
  };
  const r = await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'gemini_research', arguments: { query: 'q', context: 'c' } } });
  assert.equal(r.result.structuredContent.text, '노트');
  assert.deepEqual(r.result.structuredContent.sources, [{ url: 'https://a', title: 'A' }]);
  assert.deepEqual(sent.body.tools, [{ google_search: {} }]);
  assert.equal(sent.headers['x-goog-api-key'], 'k');
});

test('gemini_ask: 검색 도구 없이 호출, 오류는 isError', async () => {
  let body;
  globalThis.fetch = async (_u, init) => { body = JSON.parse(init.body); return { ok: false, status: 429, text: async () => 'quota' }; };
  const r = await handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'gemini_ask', arguments: { prompt: 'p' } } });
  assert.equal(body.tools, undefined);
  assert.equal(r.result.isError, true);
  assert.match(r.result.content[0].text, /429/);
});

test('알림에는 응답하지 않는다', async () => {
  assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
});
