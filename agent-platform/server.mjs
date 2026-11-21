import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { config } from './lib/config.mjs';
import { runTurn } from './lib/orchestrator.mjs';

const PUBLIC = join(config.root, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

async function readJson(req, limit = 1_000_000) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error('요청이 너무 큽니다.');
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/api/status') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({
      mock: config.mock,
      claude: { configured: !!config.anthropicKey, model: config.claudeModel },
      gemini: { configured: !!config.geminiKey, model: config.geminiModel },
    }));
  }

  if (req.method === 'POST' && url.pathname === '/api/chat') {
    let body;
    try { body = await readJson(req); } catch (e) {
      res.writeHead(400); return res.end(e.message);
    }
    const question = String(body.question || '').trim();
    if (!question) { res.writeHead(400); return res.end('question 이 비었습니다.'); }

    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive' });
    const ac = new AbortController();
    res.on('close', () => ac.abort());
    const emit = (ev) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(ev)}\n\n`); };
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    try {
      await runTurn({
        question,
        history: Array.isArray(body.history) ? body.history.filter((h) => h && (h.role === 'user' || h.role === 'assistant')) : [],
        mode: ['collab', 'claude', 'gemini'].includes(body.mode) ? body.mode : 'collab',
        webSearch: body.webSearch !== false,
        emit,
        signal: ac.signal,
      });
    } catch (e) {
      if (!ac.signal.aborted) emit({ type: 'error', message: e.message });
    } finally {
      clearInterval(ping);
      emit({ type: 'done' });
      res.end();
    }
    return;
  }

  if (req.method === 'GET') {
    const rel = normalize(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^(\.\.[/\\])+/, '');
    const file = join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
    try {
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      return res.end(data);
    } catch { /* fallthrough */ }
  }
  res.writeHead(404); res.end('Not found');
});

server.listen(config.port, () => {
  console.log(`Duo Research 실행 중: http://localhost:${config.port}`);
  if (config.mock) console.log('MOCK 모드: 실제 API를 호출하지 않습니다.');
  else {
    if (!config.anthropicKey) console.warn('경고: ANTHROPIC_API_KEY 가 없습니다.');
    if (!config.geminiKey) console.warn('경고: GEMINI_API_KEY 가 없습니다.');
  }
});
