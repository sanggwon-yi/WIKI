const $ = (s) => document.querySelector(s);
const thread = $('#thread');
const input = $('#input');
const sendBtn = $('#send');
const NAMES = { claude: 'Claude', gemini: 'Gemini' };
const PHASES = { plan: '계획', research: '자료조사', review: '교차 검증', synthesis: '종합', answer: '답변' };

let history = []; // [{role:'user'|'assistant', content}]
let busy = false;
let controller = null;

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const md = (text) => window.renderMarkdown(text);
function sourcesHtml(sources) {
  if (!sources?.length) return '';
  return `<b>출처</b><ol>${sources.map((s) => {
    const safe = /^https?:\/\//i.test(s.url) ? s.url : '#';
    return `<li><a href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${esc(s.title || s.url)}</a></li>`;
  }).join('')}</ol>`;
}
const scrollDown = () => { thread.scrollTop = thread.scrollHeight; };

async function loadStatus() {
  try {
    const s = await (await fetch('/api/status')).json();
    if (s.mock) { $('#status').innerHTML = '<span class="bad">MOCK 모드</span> · 실제 API 호출 없음'; return; }
    const part = (n, a) => `${n} <span class="${a.configured ? '' : 'bad'}">${a.configured ? esc(a.model) : '키 없음'}</span>`;
    $('#status').innerHTML = `${part('Claude', s.claude)} · ${part('Gemini', s.gemini)}`;
  } catch { $('#status').innerHTML = '<span class="bad">서버 연결 실패</span>'; }
}

function addUser(text) {
  $('#intro')?.remove();
  const el = document.createElement('div');
  el.className = 'msg user';
  el.innerHTML = `<div class="bubble">${esc(text)}</div>`;
  thread.append(el);
}

function addTurn() {
  const el = document.createElement('div');
  el.className = 'msg';
  el.innerHTML = `<div class="turn">
    <details class="process" open><summary><span class="spinner"></span><span class="label">작업 중…</span></summary><div class="steps"></div></details>
    <div class="answer"></div><div class="sources"></div><div class="actions"></div></div>`;
  thread.append(el);
  return el;
}

function upsertStep(turnEl, ev) {
  const id = `${ev.agent}-${ev.phase}`;
  let step = turnEl.querySelector(`[data-id="${id}"]`);
  if (!step) {
    step = document.createElement('div');
    step.dataset.id = id;
    step.innerHTML = `<div class="head"><span class="who ${ev.agent}">${NAMES[ev.agent] || ev.agent}</span>
      <span class="phase">${PHASES[ev.phase] || ev.phase}</span><span class="title"></span><span class="state"></span></div>
      <div class="body"></div><div class="src"></div>`;
    turnEl.querySelector('.steps').append(step);
  }
  step.className = `step ${ev.agent} ${ev.status}`;
  step.querySelector('.title').textContent = `· ${ev.title || ''}`;
  step.querySelector('.state').innerHTML = ev.status === 'running' ? '<span class="spinner"></span>' : ev.status === 'error' ? '오류' : '완료';
  if (ev.content) step.querySelector('.body').innerHTML = ev.status === 'error' ? esc(ev.content) : md(ev.content);
  if (ev.sources?.length) step.querySelector('.src').innerHTML = `<details><summary class="muted">출처 ${ev.sources.length}개</summary>${sourcesHtml(ev.sources)}</details>`;
}

async function send(question) {
  busy = true; sendBtn.disabled = true;
  addUser(question);
  const turnEl = addTurn();
  scrollDown();
  const mode = $('#mode').value;
  controller = new AbortController();
  let finalText = '';
  let failed = false;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question, history, mode, webSearch: $('#web').checked }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) throw new Error(await res.text());
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
        const line = chunk.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        const ev = JSON.parse(line.slice(6));
        if (ev.type === 'step') upsertStep(turnEl, ev);
        else if (ev.type === 'final') {
          finalText = ev.content;
          turnEl.querySelector('.answer').innerHTML = md(ev.content);
          turnEl.querySelector('.sources').innerHTML = sourcesHtml(ev.sources);
        } else if (ev.type === 'error') {
          failed = true;
          turnEl.querySelector('.answer').insertAdjacentHTML('beforebegin', `<div class="error-box">⚠ ${esc(ev.message)}</div>`);
        }
        scrollDown();
      }
    }
  } catch (e) {
    failed = true;
    turnEl.querySelector('.answer').insertAdjacentHTML('beforebegin', `<div class="error-box">⚠ ${esc(e.message || e)}</div>`);
  } finally {
    const details = turnEl.querySelector('details.process');
    details.querySelector('.spinner')?.remove();
    const n = turnEl.querySelectorAll('.step').length;
    details.querySelector('.label').textContent = `협업 과정 보기 (${n}단계)`;
    if (finalText) details.open = false;
    if (finalText) {
      history.push({ role: 'user', content: question }, { role: 'assistant', content: finalText });
      const copy = document.createElement('button');
      copy.className = 'ghost'; copy.type = 'button'; copy.textContent = '답변 복사';
      copy.onclick = () => navigator.clipboard?.writeText(finalText).then(() => (copy.textContent = '복사됨'));
      turnEl.querySelector('.actions').append(copy);
    } else if (!failed) {
      turnEl.querySelector('.answer').innerHTML = '<p class="muted">답변을 받지 못했습니다.</p>';
    }
    busy = false; sendBtn.disabled = false; controller = null;
    scrollDown();
  }
}

$('#composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = input.value.trim();
  if (!q || busy) return;
  input.value = '';
  send(q);
});
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#composer').requestSubmit(); }
});
$('#reset').addEventListener('click', () => {
  controller?.abort();
  history = [];
  thread.innerHTML = '';
  input.focus();
});

loadStatus();
