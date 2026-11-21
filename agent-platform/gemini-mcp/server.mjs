#!/usr/bin/env node
// Gemini MCP 브리지 (stdio). Claude 데스크톱 앱에 로컬 MCP 서버로 등록하면
// Duo Research 아티팩트가 `host:gemini` 로 이 서버의 도구를 호출한다.
// 의존성 없음. Node 18 이상. API 키는 환경 변수 GEMINI_API_KEY 로만 받는다.
import { createInterface } from 'node:readline';

const KEY = process.env.GEMINI_API_KEY || '';
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const PROTOCOL = '2025-06-18';

const RULES = `원칙:
- 출처가 없거나 타당성이 불분명한 내용을 꾸미거나 지어내지 않는다.
- 검색으로 확인한 사실과 추론을 구분하고, 확인하지 못한 내용은 [미확인]으로 표시한다.
- 핵심 사실마다 출처(사이트명)를 밝힌다. 출처끼리 엇갈리면 그대로 적는다.
- 사용자의 언어(기본 한국어)로 쓴다.`;

const TOOLS = [
  {
    name: 'gemini_research',
    description: 'Gemini가 Google 검색 그라운딩으로 웹을 조사해 근거 중심 조사 노트와 출처 목록을 돌려준다. 최신 정보·수치·뉴스·사실 확인에 사용.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '조사할 질문이나 과제' },
        context: { type: 'string', description: '배경 맥락(사용자 원 질문 등), 선택' },
      },
      required: ['query'],
    },
    annotations: { title: 'Gemini 웹 조사', readOnlyHint: true, openWorldHint: true },
  },
  {
    name: 'gemini_ask',
    description: 'Gemini에게 검색 없이 질문한다. 두 번째 의견, 아이디어, 문장 다듬기 등에 사용.',
    inputSchema: {
      type: 'object',
      properties: { prompt: { type: 'string', description: 'Gemini에게 보낼 요청' } },
      required: ['prompt'],
    },
    annotations: { title: 'Gemini에게 묻기', readOnlyHint: true, openWorldHint: false },
  },
];

export async function callGemini({ prompt, search }) {
  if (!KEY) throw new Error('GEMINI_API_KEY 환경 변수가 없습니다. Claude 데스크톱 앱의 MCP 설정에 넣어 주세요.');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: `너는 Claude와 함께 일하는 리서치 파트너 Gemini다.\n${RULES}` }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  };
  if (search) body.tools = [{ google_search: {} }];
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(110_000),
  });
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = await res.json();
  const cand = data.candidates?.[0];
  if (!cand) throw new Error(`Gemini 응답이 비었습니다${data.promptFeedback?.blockReason ? ` (차단: ${data.promptFeedback.blockReason})` : ''}.`);
  const text = (cand.content?.parts || []).map((p) => p.text || '').join('').trim();
  const seen = new Set();
  const sources = (cand.groundingMetadata?.groundingChunks || [])
    .map((c) => c.web)
    .filter((w) => w?.uri && !seen.has(w.uri) && seen.add(w.uri))
    .map((w) => ({ url: w.uri, title: w.title || w.uri }));
  return { text, sources, model: MODEL };
}

async function runTool(name, args = {}) {
  if (name === 'gemini_research') {
    const q = String(args.query || '').trim();
    if (!q) throw new Error('query 가 비었습니다.');
    const ctx = args.context ? `\n\n배경(사용자 원 질문): ${String(args.context).slice(0, 4000)}` : '';
    return callGemini({ search: true, prompt: `다음을 웹 검색으로 조사해 조사 노트를 써라.\n\n과제: ${q}${ctx}` });
  }
  if (name === 'gemini_ask') {
    const p = String(args.prompt || '').trim();
    if (!p) throw new Error('prompt 가 비었습니다.');
    return callGemini({ search: false, prompt: p });
  }
  throw new Error(`알 수 없는 도구: ${name}`);
}

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');

export async function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined) return null; // 알림(notifications/*)에는 응답하지 않는다.
  switch (method) {
    case 'initialize':
      return { jsonrpc: '2.0', id, result: {
        protocolVersion: params?.protocolVersion || PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: 'gemini', version: '0.1.0' },
      } };
    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };
    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
    case 'tools/call':
      try {
        const out = await runTool(params?.name, params?.arguments);
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(out) }], structuredContent: out } };
      } catch (e) {
        return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: e.message }], isError: true } };
      }
    default:
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const rl = createInterface({ input: process.stdin });
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch {
      return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
    const reply = await handle(msg);
    if (reply) send(reply);
  });
  if (!KEY) console.error('[gemini-mcp] 경고: GEMINI_API_KEY 가 없습니다.');
}
