import { config } from './config.mjs';

const API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Claude Messages API 호출.
 * webSearch=true 이면 Anthropic 서버측 web_search 도구를 붙인다.
 * 반환: { text, sources: [{url, title}] }
 */
export async function callClaude({ system, messages, webSearch = false, maxTokens = 4096, signal }) {
  if (!config.anthropicKey) throw new Error('ANTHROPIC_API_KEY 가 설정되지 않았습니다.');

  const body = { model: config.claudeModel, max_tokens: maxTokens, system, messages };
  if (webSearch) body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }];

  let convo = [...messages];
  const blocks = [];
  // 서버측 도구가 길게 돌면 stop_reason=pause_turn 으로 끊기므로 이어서 요청한다.
  for (let i = 0; i < 4; i++) {
    const res = await fetch(API_URL, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ ...body, messages: convo }),
    });
    if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 500)}`);
    const data = await res.json();
    blocks.push(...(data.content || []));
    if (data.stop_reason !== 'pause_turn') break;
    convo = [...convo, { role: 'assistant', content: data.content }];
  }

  const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const sources = [];
  for (const b of blocks) {
    if (b.type === 'text' && Array.isArray(b.citations)) {
      for (const c of b.citations) if (c.url) sources.push({ url: c.url, title: c.title || c.url });
    }
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
      for (const r of b.content) if (r.url) sources.push({ url: r.url, title: r.title || r.url });
    }
  }
  return { text: text.trim(), sources: dedupe(sources) };
}

export function dedupe(sources) {
  const seen = new Set();
  return sources.filter((s) => (seen.has(s.url) ? false : seen.add(s.url)));
}
