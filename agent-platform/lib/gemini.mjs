import { config } from './config.mjs';
import { dedupe } from './claude.mjs';

/**
 * Gemini generateContent 호출.
 * webSearch=true 이면 Google 검색 그라운딩(google_search 도구)을 켠다.
 * messages 는 [{role:'user'|'assistant', content:string}] 형식.
 * 반환: { text, sources: [{url, title}] }
 */
export async function callGemini({ system, messages, webSearch = false, signal }) {
  if (!config.geminiKey) throw new Error('GEMINI_API_KEY 가 설정되지 않았습니다.');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.geminiModel)}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
  };
  if (webSearch) body.tools = [{ google_search: {} }];

  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', 'x-goog-api-key': config.geminiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const data = await res.json();

  const cand = data.candidates?.[0];
  if (!cand) {
    const reason = data.promptFeedback?.blockReason;
    throw new Error(`Gemini 응답이 비었습니다${reason ? ` (차단 사유: ${reason})` : ''}.`);
  }
  const text = (cand.content?.parts || []).map((p) => p.text || '').join('');
  const sources = (cand.groundingMetadata?.groundingChunks || [])
    .map((c) => c.web)
    .filter((w) => w?.uri)
    .map((w) => ({ url: w.uri, title: w.title || w.uri }));
  return { text: text.trim(), sources: dedupe(sources) };
}
