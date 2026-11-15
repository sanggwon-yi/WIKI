/* 신발방 날씨 대시보드 — e북 리더 웹뷰 호환을 위해 ES5만 사용 */
(function () {
  'use strict';
  var SVGNS = 'http://www.w3.org/2000/svg';
  var LS = null;
  try { LS = window.localStorage; if (LS) LS.getItem('dash.test'); } catch (e) { LS = null; }
  var REFRESH_MIN = 30;

  // 좌표는 대략값(동·구 중심부). 필요하면 여기 추가/수정.
  var LOCS = [
    { n: '인천 계양구 동양동', lat: 37.5568, lon: 126.7571 },
    { n: '인천 계양구 귤현동', lat: 37.5664, lon: 126.7425 },
    { n: '서울 중구 (시청)', lat: 37.5663, lon: 126.9779 },
    { n: '서울 강남구', lat: 37.5172, lon: 127.0473 },
    { n: '경기 수원시', lat: 37.2636, lon: 127.0286 },
    { n: '전북 전주시', lat: 35.8242, lon: 127.1480 }
  ];

  // 속담 + 뜻(풀이는 일반적인 의미를 짧게 정리)
  var SAYINGS = [
    ['천 리 길도 한 걸음부터', '큰일도 작은 시작에서 비롯된다.'],
    ['티끌 모아 태산', '작은 것도 모이면 큰 것이 된다.'],
    ['돌다리도 두들겨 보고 건너라', '잘 아는 일도 한 번 더 확인하라.'],
    ['낮말은 새가 듣고 밤말은 쥐가 듣는다', '어디서든 말을 조심하라.'],
    ['가는 말이 고와야 오는 말이 곱다', '내가 먼저 좋게 대해야 상대도 그렇다.'],
    ['백지장도 맞들면 낫다', '쉬운 일도 함께하면 더 수월하다.'],
    ['우물을 파도 한 우물을 파라', '한 가지 일을 꾸준히 해야 성과가 난다.'],
    ['콩 심은 데 콩 나고 팥 심은 데 팥 난다', '원인에 따라 결과가 나온다.'],
    ['소 잃고 외양간 고친다', '일이 터지기 전에 미리 대비하라.'],
    ['세 살 버릇 여든까지 간다', '어릴 때 든 습관은 오래 간다.'],
    ['고생 끝에 낙이 온다', '어려움을 견디면 좋은 날이 온다.'],
    ['아니 땐 굴뚝에 연기 날까', '원인 없는 결과는 없다.'],
    ['원숭이도 나무에서 떨어진다', '익숙한 일에도 실수는 있다.'],
    ['하늘이 무너져도 솟아날 구멍이 있다', '아무리 어려워도 길은 있다.'],
    ['말 한마디로 천 냥 빚을 갚는다', '말을 잘하면 어려운 일도 풀린다.'],
    ['서당 개 삼 년이면 풍월을 읊는다', '오래 곁에 있으면 저절로 익힌다.'],
    ['구슬이 서 말이라도 꿰어야 보배', '좋은 것도 다듬어 써야 가치가 있다.'],
    ['급할수록 돌아가라', '서두를수록 차근차근 하라.'],
    ['아는 길도 물어 가라', '익숙한 일도 확인하며 하라.'],
    ['첫술에 배부르랴', '처음부터 만족스러울 수는 없다.']
  ];

  var WMO = {
    0: ['맑음', 'sun'], 1: ['대체로 맑음', 'sun'], 2: ['구름 조금', 'part'], 3: ['흐림', 'cloud'],
    45: ['안개', 'fog'], 48: ['안개', 'fog'],
    51: ['이슬비', 'rain'], 53: ['이슬비', 'rain'], 55: ['이슬비', 'rain'], 56: ['어는 비', 'rain'], 57: ['어는 비', 'rain'],
    61: ['약한 비', 'rain'], 63: ['비', 'rain'], 65: ['강한 비', 'rain'], 66: ['어는 비', 'rain'], 67: ['어는 비', 'rain'],
    71: ['약한 눈', 'snow'], 73: ['눈', 'snow'], 75: ['많은 눈', 'snow'], 77: ['싸락눈', 'snow'],
    80: ['소나기', 'rain'], 81: ['소나기', 'rain'], 82: ['강한 소나기', 'rain'],
    85: ['눈 소나기', 'snow'], 86: ['눈 소나기', 'snow'],
    95: ['뇌우', 'storm'], 96: ['뇌우', 'storm'], 99: ['뇌우', 'storm']
  };
  function wx(c) { return WMO[c] || ['-', 'cloud']; }

  /* ---------- DOM 헬퍼 ---------- */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined && txt !== null) e.appendChild(document.createTextNode(String(txt)));
    return e;
  }
  function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); }
  function setText(id, t) { var e = $(id); clear(e); e.appendChild(document.createTextNode(t)); }
  function onTap(id, fn) { var e = $(id); if (e) e.addEventListener('click', fn, false); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  /* ---------- 아이콘 (흑백 선 SVG) ---------- */
  function svgEl(name, attrs) {
    var e = document.createElementNS(SVGNS, name);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) e.setAttribute(k, attrs[k]);
    return e;
  }
  var CLOUD = 'M7 17h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.6 1.2A3.5 3.5 0 0 0 7 17z';
  function icon(kind, size) {
    var s = svgEl('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: '#000', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    function p(d) { s.appendChild(svgEl('path', { d: d })); }
    if (kind === 'sun') {
      s.appendChild(svgEl('circle', { cx: 12, cy: 12, r: 4 }));
      p('M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4');
    } else if (kind === 'part') {
      s.appendChild(svgEl('circle', { cx: 8, cy: 8, r: 3 }));
      p('M8 2v1.5M2 8h1.5M3.8 3.8l1 1M12.2 3.8l-1 1');
      p('M9 19h9a3.5 3.5 0 0 0 0-7 4.5 4.5 0 0 0-8.6 1A3 3 0 0 0 9 19z');
    } else if (kind === 'fog') {
      p('M4 9h16M3 13h18M5 17h14');
    } else {
      p(CLOUD);
      if (kind === 'rain') p('M8 20l-1 2M12 20l-1 2M16 20l-1 2');
      if (kind === 'snow') { s.appendChild(svgEl('circle', { cx: 8, cy: 21, r: 0.6 })); s.appendChild(svgEl('circle', { cx: 12, cy: 21, r: 0.6 })); s.appendChild(svgEl('circle', { cx: 16, cy: 21, r: 0.6 })); }
      if (kind === 'storm') p('M12 17l-2 3h3l-2 3');
    }
    return s;
  }

  /* ---------- 저장 ---------- */
  function load(k, d) { try { var v = LS && LS.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function save(k, v) { try { if (LS) LS.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var loc = load('dash.loc2', LOCS[0]);
  var page = 1;

  /* ---------- 네트워크 (XHR) ---------- */
  // APK(WebView)에서는 네이티브 통신 사용 — CORS·구형 TLS 회피
  var NATIVE = window.AndroidNet || null, nCbs = {}, nSeq = 0;
  window.__nativeCb = function (id, ok, text) {
    var cb = nCbs[id]; if (!cb) return; delete nCbs[id]; cb(ok, text);
  };
  function xhr(url, ok, fail) {
    if (NATIVE) {
      var id = 'n' + (++nSeq), over = false;
      var t = setTimeout(function () { over = true; delete nCbs[id]; fail(new Error('응답 없음 40초')); }, 40000);
      nCbs[id] = function (good, text) {
        if (over) return; clearTimeout(t);
        if (good) ok({ status: 200, responseText: text, responseXML: null }); else fail(new Error(text));
      };
      try { NATIVE.fetch(id, url); } catch (e) { clearTimeout(t); delete nCbs[id]; fail(e); }
      return;
    }
    var x, finished = false;
    var timer = setTimeout(function () {
      if (finished) return; finished = true;
      try { x.abort(); } catch (e) {}
      fail(new Error('응답 없음 20초'));
    }, 20000);
    try {
      x = new XMLHttpRequest();
      x.open('GET', url, true);
      x.onreadystatechange = function () {
        if (x.readyState !== 4 || finished) return;
        finished = true; clearTimeout(timer);
        if (x.status >= 200 && x.status < 300) ok(x);
        else fail(new Error(x.status === 0 ? '접속 차단(0)' : 'HTTP ' + x.status));
      };
      x.send();
    } catch (e) { if (!finished) { finished = true; clearTimeout(timer); fail(e); } }
  }
  function get(url, asXml, ok, fail) {
    xhr(url, function (x) {
      try { ok(asXml ? (x.responseXML || new DOMParser().parseFromString(x.responseText, 'text/xml')) : JSON.parse(x.responseText)); }
      catch (e) { fail(e); }
    }, fail);
  }

  /* ---------- 시계 ---------- */
  var DAYS = ['일', '월', '화', '수', '목', '금', '토'];
  function tickClock() {
    var d = new Date();
    setText('clock', pad(d.getHours()) + ':' + pad(d.getMinutes()));
    setText('date1', d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + DAYS[d.getDay()] + ')');
    setTimeout(tickClock, (60 - d.getSeconds()) * 1000 + 50);
  }

  /* ---------- 등급 ---------- */
  function gPM10(v) { return v <= 30 ? '좋음' : v <= 80 ? '보통' : v <= 150 ? '나쁨' : '매우나쁨'; }
  function gPM25(v) { return v <= 15 ? '좋음' : v <= 35 ? '보통' : v <= 75 ? '나쁨' : '매우나쁨'; }
  function gUV(v) { return v < 3 ? '낮음' : v < 6 ? '보통' : v < 8 ? '높음' : v < 11 ? '매우높음' : '위험'; }
  function isBad(g) { return g === '나쁨' || g === '매우나쁨' || g === '높음' || g === '매우높음' || g === '위험'; }

  function tile(label, val, grade) {
    var t = el('div', 'tile');
    t.appendChild(el('div', 'l', label));
    t.appendChild(el('div', 'v', val));
    if (grade) t.appendChild(el('span', 'grade' + (isBad(grade) ? ' bad' : ''), grade));
    return t;
  }

  /* ---------- 렌더 ---------- */
  var lastW = null, lastA = null;

  function hhmm(iso) { return iso ? iso.substr(11, 5) : '-'; }

  var lastWx = null;
  // v1.10 — 화면 방향은 앱 안 버튼으로만 전환: '' 세로 → 'r' 가로(시계방향) → 'l' 가로(반시계방향) → 세로
  var ORIENTS = ['', 'r', 'l'], ORIENT_LABEL = { '': '가로', r: '가로 반대', l: '세로' };
  var orient = load('dash.orient', '');
  if (ORIENTS.indexOf(orient) < 0) orient = '';
  function applyOrient() {
    document.documentElement.className = orient ? 'land land-' + orient : '';
    setText('bRot', ORIENT_LABEL[orient]);
  }
  function renderWeather(w, a) {
    lastWx = [w, a];
    var c = w.current, h = w.hourly, dly = w.daily;
    var info = wx(c.weather_code);
    var ni = $('nowIco'); clear(ni); ni.appendChild(icon(info[1], 52));
    setText('nowTxt', info[0]);
    setText('nowTemp', c.temperature_2m.toFixed(1) + '°');
    setText('feel', '체감온도 ' + c.apparent_temperature.toFixed(1) + '°');

    // daily[0]=어제(past_days=1), daily[1]=오늘
    var ti = 1;
    setText('hilo', '최고 ' + Math.round(dly.temperature_2m_max[ti]) + '° / 최저 ' + Math.round(dly.temperature_2m_min[ti]) + '°');
    setText('pop', '강수확률 ' + (dly.precipitation_probability_max[ti] === null ? '-' : dly.precipitation_probability_max[ti] + '%'));
    setText('sun', '일출 ' + hhmm(dly.sunrise[ti]) + '  ·  일몰 ' + hhmm(dly.sunset[ti]));

    // 현재 시각 인덱스
    var nowKey = c.time.substr(0, 13);
    var idx = 0;
    for (var i = 0; i < h.time.length; i++) if (h.time[i].substr(0, 13) === nowKey) { idx = i; break; }
    if (idx >= 24) {
      var diff = c.temperature_2m - h.temperature_2m[idx - 24];
      var r = Math.round(diff * 10) / 10;
      setText('yday', r === 0 ? '어제와 같음' : '어제보다 ' + Math.abs(r) + '° ' + (r > 0 ? '높음' : '낮음'));
    } else setText('yday', '어제 비교 데이터 없음');

    // 타일
    var tl = $('tiles'); clear(tl);
    if (a && a.current) {
      tl.appendChild(tile('미세먼지 PM10', Math.round(a.current.pm10) + ' ㎍/㎥', gPM10(a.current.pm10)));
      tl.appendChild(tile('초미세 PM2.5', Math.round(a.current.pm2_5) + ' ㎍/㎥', gPM25(a.current.pm2_5)));
      tl.appendChild(tile('자외선', (a.current.uv_index === null ? '-' : a.current.uv_index.toFixed(1)), a.current.uv_index === null ? '' : gUV(a.current.uv_index)));
    } else {
      tl.appendChild(tile('대기질', '불러오기 실패', ''));
    }
    tl.appendChild(tile('습도', c.relative_humidity_2m + ' %', ''));
    tl.appendChild(tile('풍속', c.wind_speed_10m.toFixed(1) + ' m/s', ''));

    // 시간별 (3시간 간격 8칸) — 온도 꺾은선 그래프 + 시각·아이콘·강수
    var hs = $('hours'); clear(hs);
    var pts = [];
    for (var k = 0; k < 8; k++) { var j = idx + k * 3; if (j >= h.time.length) break; pts.push(j); }
    if (pts.length) {
      var W = hs.clientWidth || 700, H = Math.round((parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) * (orient ? 6 : 3.6));
      var n = pts.length, tmin = 99, tmax = -99, q;
      for (q = 0; q < n; q++) { tmin = Math.min(tmin, h.temperature_2m[pts[q]]); tmax = Math.max(tmax, h.temperature_2m[pts[q]]); }
      var rng = Math.max(2, tmax - tmin), top = H * 0.42, bot = H * 0.82;
      var g = svgEl('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, 'class': 'hgraph' });
      var path = '', xs = [], ys = [];
      for (q = 0; q < n; q++) {
        xs[q] = (q + 0.5) * W / n;
        ys[q] = bot - (h.temperature_2m[pts[q]] - tmin) / rng * (bot - top);
        path += (q ? 'L' : 'M') + xs[q].toFixed(1) + ' ' + ys[q].toFixed(1);
      }
      var area = path + 'L' + xs[n - 1].toFixed(1) + ' ' + H + 'L' + xs[0].toFixed(1) + ' ' + H + 'Z';
      g.appendChild(svgEl('path', { d: area, fill: '#d6d6d6', stroke: 'none' }));
      g.appendChild(svgEl('path', { d: path, fill: 'none', stroke: '#000', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
      for (q = 0; q < n; q++) {
        g.appendChild(svgEl('circle', { cx: xs[q], cy: ys[q], r: 4, fill: q === 0 ? '#000' : '#fff', stroke: '#000', 'stroke-width': 2 }));
        var tx = svgEl('text', { x: xs[q], y: ys[q] - 9, 'text-anchor': 'middle', 'class': 'gt' });
        tx.appendChild(document.createTextNode(Math.round(h.temperature_2m[pts[q]]) + '°'));
        g.appendChild(tx);
      }
      hs.appendChild(g);
      var row = el('div', 'hrow');
      for (q = 0; q < n; q++) {
        var cell = el('div', 'hr');
        cell.appendChild(el('div', null, q === 0 ? '지금' : h.time[pts[q]].substr(11, 2) + '시'));
        cell.appendChild(icon(wx(h.weather_code[pts[q]])[1], 22));
        cell.appendChild(el('div', 'sm', (h.precipitation_probability[pts[q]] === null ? '-' : h.precipitation_probability[pts[q]] + '%')));
        row.appendChild(cell);
      }
      hs.appendChild(row);
    }

    // 주간 (오늘부터 7일)
    var wk = $('week'); clear(wk);
    var lo = 99, hi = -99, d;
    for (d = 1; d <= 7 && d < dly.time.length; d++) { lo = Math.min(lo, dly.temperature_2m_min[d]); hi = Math.max(hi, dly.temperature_2m_max[d]); }
    var span = Math.max(1, hi - lo);
    for (d = 1; d <= 7 && d < dly.time.length; d++) {
      var dt = new Date(dly.time[d] + 'T00:00:00');
      var row = el('div', 'wk');
      row.appendChild(el('span', 'c1', (d === 1 ? '오늘' : DAYS[dt.getDay()]) + ' (' + (dt.getMonth() + 1) + '.' + dt.getDate() + ')'));
      var ic = el('span', 'c2'); ic.appendChild(icon(wx(dly.weather_code[d])[1], 16)); row.appendChild(ic);
      row.appendChild(el('span', 'c3', wx(dly.weather_code[d])[0]));
      row.appendChild(el('span', 'c4', '강수 ' + (dly.precipitation_probability_max[d] === null ? '-' : dly.precipitation_probability_max[d] + '%')));
      row.appendChild(el('span', 'c5', Math.round(dly.temperature_2m_min[d]) + '°'));
      var bc = el('span', 'c6'); var bar = el('div', 'bar'); var seg = el('i');
      var l = (dly.temperature_2m_min[d] - lo) / span * 100, rgt = (dly.temperature_2m_max[d] - lo) / span * 100;
      seg.style.left = l + '%'; seg.style.width = Math.max(2, rgt - l) + '%';
      bar.appendChild(seg);
      if (d === 1) { var dot = el('b'); dot.style.left = ((c.temperature_2m - lo) / span * 100) + '%'; bar.appendChild(dot); }
      bc.appendChild(bar); row.appendChild(bc);
      row.appendChild(el('span', 'c7', Math.round(dly.temperature_2m_max[d]) + '°'));
      wk.appendChild(row);
    }

    renderMemo(w, a);
  }

  function renderMemo(w, a) {
    var m = $('memo'); clear(m);
    var dly = w.daily, items = [];
    var t = 2; // 내일
    if (dly.time.length > t) {
      var pop = dly.precipitation_probability_max[t] || 0, code = dly.weather_code[t];
      if (pop >= 50 || (code >= 51 && code <= 82) || code >= 95) items.push('☂ 우산 챙기기 (내일 강수확률 ' + pop + '%)');
      if (code >= 71 && code <= 86) items.push('❄ 눈 예보 — 미끄럼 주의');
      if (dly.temperature_2m_min[t] <= 0) items.push('🧤 영하권 (최저 ' + Math.round(dly.temperature_2m_min[t]) + '°) — 장갑·목도리');
      else if (dly.temperature_2m_min[t] <= 5) items.push('🧥 쌀쌀함 (최저 ' + Math.round(dly.temperature_2m_min[t]) + '°) — 두꺼운 겉옷');
      if (dly.temperature_2m_max[t] - dly.temperature_2m_min[t] >= 10) items.push('↕ 일교차 ' + Math.round(dly.temperature_2m_max[t] - dly.temperature_2m_min[t]) + '° — 겹쳐 입기');
    }
    if (a && a.current && (isBad(gPM10(a.current.pm10)) || isBad(gPM25(a.current.pm2_5)))) items.push('😷 지금 미세먼지 나쁨 — 마스크');
    var tms = dayStart(Date.now()) + 86400000;
    for (var q = 0; q < calEvents.length; q++) {
      var ce = calEvents[q];
      if (ce.s >= tms && ce.s < tms + 86400000) { items.push('📅 내일 ' + (ce.a ? '종일' : tstr(ce.s)) + ' ' + ce.t + (ce.l ? ' @ ' + ce.l : '')); break; }
      if (ce.a && ce.s < tms && ce.e > tms && !ce.h) { items.push('📅 내일 ' + ce.t); break; }
    }
    if (!items.length) items.push('특별히 챙길 것 없음 — 좋은 하루!');
    for (var i = 0; i < items.length; i++) m.appendChild(el('div', null, items[i]));
  }

  function renderSaying() {
    var d = new Date();
    var start = new Date(d.getFullYear(), 0, 0);
    var day = Math.floor((d - start) / 86400000);
    var s = SAYINGS[day % SAYINGS.length];
    setText('qt', '“' + s[0] + '”');
    setText('qm', s[1]);
  }

  /* ---------- 뉴스 ---------- */
  var NEWS_CATS = [
    ['news', '전체'], ['politics', '정치'], ['economy', '경제'], ['society', '사회'],
    ['industry', '산업'], ['international', '국제'], ['culture', '문화'], ['sports', '스포츠']
  ];
  var newsCat = load('dash.newsCat', 'news');
  // 1페이지 '주요뉴스'에서 뺄 단신·공지성 제목 패턴
  var MINOR = /(게시판|인사\]|\[인사|부고|화촉|\[날씨|중간순위|전적\]|\[표\]|\[그래픽\]|\[사진\]|\[포토|오늘의 주요일정|증시 일정|로또)/;

  function rssItems(xml) {
    var out = [], items = xml.getElementsByTagName('item');
    for (var i = 0; i < items.length; i++) {
      var tt = items[i].getElementsByTagName('title')[0];
      var pd = items[i].getElementsByTagName('pubDate')[0];
      var d = pd ? new Date(pd.textContent) : null;
      out.push({ t: tt ? tt.textContent.replace(/^\s+|\s+$/g, '') : '-', d: (d && !isNaN(d.getTime())) ? d.getTime() : 0 });
    }
    return out;
  }
  function tstr(ms) { if (!ms) return ''; var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  function renderMini(list, at) {
    var ul = $('newsMini'); if (!ul) return; clear(ul);
    var n = 0;
    for (var i = 0; i < list.length && n < 5; i++) {
      if (MINOR.test(list[i].t)) continue;
      var li = el('li'); li.appendChild(el('span', 'tm', tstr(list[i].d))); li.appendChild(document.createTextNode(list[i].t));
      ul.appendChild(li); n++;
    }
    if (!n) ul.appendChild(el('li', null, '표시할 뉴스 없음'));
    setText('miniAt', at ? tstr(at) + ' 기준' : '');
  }

  function renderNewsList(list, at, stale) {
    var ol = $('news'); clear(ol);
    var n = Math.min(10, list.length);
    for (var i = 0; i < n; i++) {
      var li = el('li', null, list[i].t);
      if (list[i].d) li.appendChild(el('div', 'src', tstr(list[i].d)));
      ol.appendChild(li);
    }
    if (!n) ol.appendChild(el('li', null, '뉴스 항목 없음'));
    setText('newsAt', at ? (stale ? '저장본 ' : '') + tstr(at) + ' 기준' : '');
  }

  function renderTabs() {
    var tb = $('newsTabs'); clear(tb);
    for (var i = 0; i < NEWS_CATS.length; i++) (function (c) {
      var b = el('span', 'btn' + (c[0] === newsCat ? ' on' : ''), c[1]);
      b.addEventListener('click', function () { newsCat = c[0]; save('dash.newsCat', c[0]); renderTabs(); loadNews(c[0], false); }, false);
      tb.appendChild(b);
    })(NEWS_CATS[i]);
  }

  function loadNews(cat, mini) {
    var key = 'dash.news.' + cat;
    var cached = load(key, null);
    if (cat === newsCat && cached) renderNewsList(cached.l, cached.at, true);
    if (mini && cached) renderMini(cached.l, cached.at);
    get('https://www.yna.co.kr/rss/' + cat + '.xml', true, function (xml) {
      var l = rssItems(xml), at = Date.now();
      save(key, { l: l.slice(0, 30), at: at });
      if (cat === newsCat) renderNewsList(l, at, false);
      if (mini) renderMini(l, at);
    }, function (e) {
      if (cached) return;
      if (cat === newsCat) {
        var ol = $('news'); clear(ol);
        ol.appendChild(el('li', null, '뉴스를 불러오지 못했습니다 (' + e.message + ')'));
        ol.appendChild(el('li', 'src', '리더기 앱이 외부 RSS 요청을 막는 경우일 수 있습니다.'));
      }
      if (mini && $('newsMini')) { var ul = $('newsMini'); clear(ul); ul.appendChild(el('li', null, '뉴스 불러오기 실패 (' + e.message + ')')); }
    });
  }

  function refreshNews() {
    loadNews('news', true);
    if (newsCat !== 'news') loadNews(newsCat, false);
  }

  /* ---------- 일정 (구글 캘린더) ---------- */
  // EPUB 제작 시점(2026-11-14 19:10) 구글 캘린더 스냅샷. iCal 주소가 설정되면 실시간 데이터로 대체.
  var CAL_SNAPSHOT_AT = new Date(2026, 10, 14, 19, 10).getTime();
  var CAL_SNAPSHOT = [
    { t: 'g.ad.c 쇼케이스 페이지 업데이트 체크', s: '2026-11-15T09:00', e: '2026-11-15T09:15' },
    { t: 'g.ad.c 쇼케이스 페이지 업데이트 체크', s: '2026-11-22T09:00', e: '2026-11-22T09:15' },
    { t: '[인디스땅스] 캔트비블루', s: '2026-11-22T18:00', e: '2026-11-22T18:40', l: 'L7 광명 바이 롯데호텔' },
    { t: 'g.ad.c 쇼케이스 페이지 업데이트 체크', s: '2026-11-29T09:00', e: '2026-11-29T09:15' },
    { t: '휴가', s: '2026-12-03', e: '2026-12-05', a: 1 },
    { t: 'g.ad.c 쇼케이스 페이지 업데이트 체크', s: '2026-12-06T09:00', e: '2026-12-06T09:15' },
    { t: 'g.ad.c 쇼케이스 페이지 업데이트 체크', s: '2026-12-13T09:00', e: '2026-12-13T09:15' },
    { t: '크리스마스 이브', s: '2026-12-24', e: '2026-12-25', a: 1, h: 1 },
    { t: '성탄절', s: '2026-12-25', e: '2026-12-26', a: 1, h: 1 }
  ];
  var CAL_DAYS = 14;

  function parseLocal(str) { // 'YYYY-MM-DD' 또는 'YYYY-MM-DDTHH:MM'
    var d = new Date(+str.substr(0, 4), +str.substr(5, 2) - 1, +str.substr(8, 2), str.length > 10 ? +str.substr(11, 2) : 0, str.length > 10 ? +str.substr(14, 2) : 0);
    return d.getTime();
  }
  function snapEvents() {
    var out = [];
    for (var i = 0; i < CAL_SNAPSHOT.length; i++) {
      var x = CAL_SNAPSHOT[i];
      out.push({ t: x.t, s: parseLocal(x.s), e: parseLocal(x.e), a: !!x.a, l: x.l || '', h: !!x.h });
    }
    return out;
  }

  /* ICS 파서 (VEVENT + 기본 RRULE: DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, COUNT, UNTIL, BYDAY, EXDATE, RECURRENCE-ID) */
  function icsDate(v, params) {
    var allDay = /VALUE=DATE(?!-)/.test(params || '') || /^\d{8}$/.test(v);
    var y = +v.substr(0, 4), m = +v.substr(4, 2) - 1, d = +v.substr(6, 2);
    if (allDay) return { ms: new Date(y, m, d).getTime(), a: true };
    var hh = +v.substr(9, 2), mi = +v.substr(11, 2), ss = +v.substr(13, 2) || 0;
    if (v.charAt(v.length - 1) === 'Z') return { ms: Date.UTC(y, m, d, hh, mi, ss), a: false };
    return { ms: new Date(y, m, d, hh, mi, ss).getTime(), a: false }; // TZID는 기기 시간대(한국)로 간주
  }
  function unesc(t) { return t.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1'); }
  var BYDAY_IDX = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

  function parseICS(text, from, to) {
    var lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
    var evs = [], cur = null, overrides = {}, out = [];
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      if (ln === 'BEGIN:VEVENT') { cur = { ex: [] }; continue; }
      if (ln === 'END:VEVENT') { if (cur) evs.push(cur); cur = null; continue; }
      if (!cur) continue;
      var ci = ln.indexOf(':'); if (ci < 0) continue;
      var head = ln.substr(0, ci), val = ln.substr(ci + 1);
      var sc = head.indexOf(';'), name = sc < 0 ? head : head.substr(0, sc), params = sc < 0 ? '' : head.substr(sc + 1);
      if (name === 'SUMMARY') cur.t = unesc(val);
      else if (name === 'LOCATION') cur.l = unesc(val);
      else if (name === 'UID') cur.uid = val;
      else if (name === 'STATUS') cur.st = val;
      else if (name === 'DTSTART') cur.ds = icsDate(val, params);
      else if (name === 'DTEND') cur.de = icsDate(val, params);
      else if (name === 'RRULE') cur.rr = val;
      else if (name === 'RECURRENCE-ID') cur.rid = icsDate(val, params).ms;
      else if (name === 'EXDATE') { var xs = val.split(','); for (var k = 0; k < xs.length; k++) cur.ex.push(icsDate(xs[k], params).ms); }
    }
    for (i = 0; i < evs.length; i++) if (evs[i].rid !== undefined) overrides[evs[i].uid + '|' + evs[i].rid] = 1;

    function push(ev, s, dur) {
      if (s + dur <= from || s >= to) return;
      out.push({ t: ev.t || '(제목 없음)', s: s, e: s + dur, a: ev.ds.a, l: ev.l || '', h: false });
    }
    for (i = 0; i < evs.length; i++) {
      var ev = evs[i];
      if (!ev.ds || ev.st === 'CANCELLED') continue;
      var dur = ev.de ? ev.de.ms - ev.ds.ms : (ev.ds.a ? 86400000 : 3600000);
      if (!ev.rr || ev.rid !== undefined) { push(ev, ev.ds.ms, dur); continue; }
      var R = {}, parts = ev.rr.split(';');
      for (k = 0; k < parts.length; k++) { var kv = parts[k].split('='); R[kv[0]] = kv[1]; }
      var interval = +(R.INTERVAL || 1), count = R.COUNT ? +R.COUNT : 1e9;
      var until = R.UNTIL ? icsDate(R.UNTIL, '').ms + (R.UNTIL.length === 8 ? 86399999 : 0) : 1e15;
      var base = new Date(ev.ds.ms), n = 0, guard = 0, exset = {};
      for (k = 0; k < ev.ex.length; k++) exset[ev.ex[k]] = 1;
      var emit = function (ms) {
        if (ms < ev.ds.ms) return true;
        if (ms > until || n >= count) return false;
        n++;
        if (!exset[ms] && !overrides[ev.uid + '|' + ms]) push(ev, ms, dur);
        return ms < to;
      };
      var go = true;
      if (R.FREQ === 'WEEKLY') {
        var days = R.BYDAY ? R.BYDAY.split(',') : null;
        var wk0 = new Date(base.getFullYear(), base.getMonth(), base.getDate() - base.getDay(), base.getHours(), base.getMinutes(), base.getSeconds());
        for (var w = 0; go && guard < 3000; w += interval, guard++) {
          var list = [];
          if (days) { for (k = 0; k < days.length; k++) { var di = BYDAY_IDX[days[k].replace(/^[+-]?\d+/, '')]; if (di !== undefined) list.push(di); } list.sort(); }
          else list.push(base.getDay());
          for (k = 0; k < list.length && go; k++) {
            var dd = new Date(wk0.getFullYear(), wk0.getMonth(), wk0.getDate() + w * 7 + list[k], base.getHours(), base.getMinutes(), base.getSeconds());
            go = emit(dd.getTime());
          }
        }
      } else if (R.FREQ === 'DAILY' || R.FREQ === 'MONTHLY' || R.FREQ === 'YEARLY') {
        for (var j = 0; go && guard < 5000; j += interval, guard++) {
          var nd = R.FREQ === 'DAILY' ? new Date(base.getFullYear(), base.getMonth(), base.getDate() + j, base.getHours(), base.getMinutes(), base.getSeconds())
            : R.FREQ === 'MONTHLY' ? new Date(base.getFullYear(), base.getMonth() + j, base.getDate(), base.getHours(), base.getMinutes(), base.getSeconds())
            : new Date(base.getFullYear() + j, base.getMonth(), base.getDate(), base.getHours(), base.getMinutes(), base.getSeconds());
          if (R.FREQ !== 'DAILY' && nd.getDate() !== base.getDate()) continue; // 31일 등 없는 날 건너뜀
          go = emit(nd.getTime());
        }
      } else push(ev, ev.ds.ms, dur);
    }
    return out;
  }

  function dayStart(ms) { var d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
  function calWindow() { var f = dayStart(Date.now()); return [f, f + CAL_DAYS * 86400000]; }

  var calEvents = [];
  function renderCal(events, label) {
    calEvents = events.slice().sort(function (x, y) { return (x.s - y.s) || ((y.a ? 1 : 0) - (x.a ? 1 : 0)); });
    var box = $('cal'); clear(box);
    var win = calWindow(), now = Date.now(), any = false;
    for (var d = 0; d < CAL_DAYS; d++) {
      var ds = win[0] + d * 86400000, de = ds + 86400000, todays = [];
      for (var i = 0; i < calEvents.length; i++) if (calEvents[i].s < de && calEvents[i].e > ds) todays.push(calEvents[i]);
      if (!todays.length && d > 1) continue;
      var dt = new Date(ds);
      box.appendChild(el('div', 'day' + (d === 0 ? ' today' : ''), (d === 0 ? '오늘 ' : d === 1 ? '내일 ' : '') + (dt.getMonth() + 1) + '.' + dt.getDate() + ' (' + DAYS[dt.getDay()] + ')'));
      if (!todays.length) { box.appendChild(el('div', 'ev sm', '일정 없음')); continue; }
      for (i = 0; i < todays.length; i++) {
        var e = todays[i]; any = true;
        var row = el('div', 'ev' + (e.e <= now ? ' past' : '') + (e.h ? ' hol' : ''));
        row.appendChild(el('span', 'et', e.a ? '종일' : tstr(e.s) + '–' + tstr(e.e)));
        var tc = el('span', null, e.t); if (e.l) tc.appendChild(el('span', 'el', e.l));
        row.appendChild(tc); box.appendChild(row);
      }
    }
    if (!any) box.appendChild(el('div', 'sm', '앞으로 ' + CAL_DAYS + '일간 일정 없음'));
    setText('calAt', label);
    renderNextEvent();
    if (lastW) renderMemo(lastW, lastA);
  }
  function renderNextEvent() {
    var now = Date.now(), end = dayStart(now) + 2 * 86400000;
    for (var i = 0; i < calEvents.length; i++) {
      var e = calEvents[i];
      if (e.a) { if (e.s <= now && e.e > now && !e.h) { setText('nextEv', '오늘: ' + e.t); return; } continue; }
      if (e.s > now && e.s < end) { setText('nextEv', '다음 일정 ' + (e.s >= dayStart(now) + 86400000 ? '내일 ' : '') + tstr(e.s) + ' ' + e.t); return; }
    }
    setText('nextEv', '');
  }

  var HOLIDAY_URL = 'https://calendar.google.com/calendar/ical/ko.south_korea%23holiday%40group.v.calendar.google.com/public/basic.ics';
  // 개인 캘린더 iCal 비공개 주소를 여기에 넣으면 기본값으로 사용 (기기 설정에서 입력한 값이 우선)
  var CAL_DEFAULT_URLS = [];
  function calUrls() { var u = load('dash.calUrls', null); return (u && u.length) ? u : CAL_DEFAULT_URLS; }
  function refreshCal() {
    var personal = calUrls(), win = calWindow();
    var srcs = [HOLIDAY_URL].concat(personal);
    var cache = load('dash.calCache2', {});
    var left = srcs.length, got = {}, err = '';
    for (var u = 0; u < srcs.length; u++) (function (url) {
      getText(url, function (t) { if (t.indexOf('BEGIN:VCALENDAR') >= 0) got[url] = t; else err = '형식 오류'; done(); },
        function (e) { if (url !== HOLIDAY_URL) err = e.message; done(); });
    })(srcs[u]);
    function done() {
      if (--left) return;
      var all = [], liveCount = 0, i, j, ev;
      for (i = 0; i < srcs.length; i++) {
        var url = srcs[i], text = got[url], fromCache = false;
        if (text) { cache[url] = { t: text, at: Date.now() }; liveCount++; }
        else if (cache[url]) { text = cache[url].t; fromCache = true; }
        if (!text) continue;
        ev = parseICS(text, win[0], win[1]);
        for (j = 0; j < ev.length; j++) { if (url === HOLIDAY_URL) ev[j].h = true; all.push(ev[j]); }
      }
      save('dash.calCache2', cache);
      var holidayOk = !!(got[HOLIDAY_URL] || cache[HOLIDAY_URL]);
      var personalOk = false;
      for (i = 0; i < personal.length; i++) if (got[personal[i]] || cache[personal[i]]) personalOk = true;
      if (!personalOk || !holidayOk) {
        var snap = snapEvents();
        for (j = 0; j < snap.length; j++) {
          if (snap[j].e <= win[0]) continue;
          if (snap[j].h ? !holidayOk : !personalOk) all.push(snap[j]);
        }
      }
      var label = personal.length
        ? (personalOk ? (got[personal[0]] ? '실시간 ' + tstr(Date.now()) : '저장본') : '개인 일정 실패(' + err + ') · 앱 저장본')
        : '개인 일정: 앱 저장본 ' + mdhm(CAL_SNAPSHOT_AT);
      renderCal(all, label);
    }
  }
  function mdhm(ms) { var d = new Date(ms); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function getText(url, ok, fail) { xhr(url, function (x) { ok(x.responseText); }, fail); }

  /* ---------- 갱신 ---------- */
  function wUrl() {
    return 'https://api.open-meteo.com/v1/forecast?latitude=' + loc.lat + '&longitude=' + loc.lon +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m' +
      '&hourly=temperature_2m,weather_code,precipitation_probability' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset' +
      '&wind_speed_unit=ms&timezone=Asia%2FSeoul&past_days=1&forecast_days=8';
  }
  function aUrl() {
    return 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + loc.lat + '&longitude=' + loc.lon +
      '&current=pm10,pm2_5,uv_index&timezone=Asia%2FSeoul';
  }

  // v1.11 — 실패 시 자동 재시도 (Wi-Fi가 늦게 붙는 경우 대비): 15초·30초·1분·2분 후, 이후 5분마다
  var RETRY_SEC = [15, 30, 60, 120, 300], failCount = 0, retryT = null, busy = false, lastOk = false;
  function scheduleRetry() {
    if (retryT) clearTimeout(retryT);
    var sec = RETRY_SEC[Math.min(failCount - 1, RETRY_SEC.length - 1)];
    retryT = setTimeout(function () { retryT = null; refresh(); }, sec * 1000);
    return sec;
  }
  function refresh() {
    if (busy) return;
    busy = true;
    if (retryT) { clearTimeout(retryT); retryT = null; }
    setText('loc', loc.n);
    lastRefresh = Date.now();
    setText('upd', '갱신 중…');
    var pending = 2, wData = null, aData = null, err = '';
    function done() {
      if (--pending) return;
      busy = false;
      lastOk = !!wData;
      if (wData) failCount = 0;
      else failCount++;
      var retryMsg = wData ? '' : ' · ' + fmtSec(scheduleRetry()) + ' 후 재시도 (' + failCount + '회째)';
      if (wData) {
        lastW = wData; lastA = aData;
        save('dash.cache', { w: wData, a: aData, at: Date.now(), loc: loc.n });
        renderWeather(wData, aData);
        var d = new Date();
        setText('upd', '최근 갱신 ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + (aData ? '' : ' · 대기질 실패'));
      } else {
        var c = load('dash.cache', null);
        if (c && c.loc === loc.n) {
          renderWeather(c.w, c.a);
          var cd = new Date(c.at);
          setText('upd', '오프라인 — ' + (cd.getMonth() + 1) + '/' + cd.getDate() + ' ' + pad(cd.getHours()) + ':' + pad(cd.getMinutes()) + ' 저장본' + retryMsg);
        } else setText('upd', '불러오기 실패 (' + err + ')' + retryMsg);
      }
    }
    get(wUrl(), false, function (j) { wData = j; done(); }, function (e) { err = e.message; done(); });
    get(aUrl(), false, function (j) { aData = j; done(); }, function () { done(); });
    refreshNews();
    refreshCal();
    renderSaying();
  }

  var lastRefresh = 0;
  function fmtSec(n) { return n < 60 ? n + '초' : Math.round(n / 60) + '분'; }
  // 화면 복귀 시: 직전 갱신이 실패했으면 바로, 성공했으면 10분 지났을 때 갱신
  window.__onResume = function () { if (!lastOk || Date.now() - lastRefresh > 10 * 60000) refresh(); };
  // Wi-Fi가 다시 연결되면 바로 갱신 (WebView가 online 이벤트를 주는 경우)
  window.addEventListener('online', function () { if (!lastOk) refresh(); }, false);
  function scheduleRefresh() { setTimeout(function () { refresh(); scheduleRefresh(); }, REFRESH_MIN * 60000); }

  /* ---------- 페이지/지역 ---------- */
  var NAMES = ['날씨', '일정', '속담·준비물', '뉴스'];
  function show(p) {
    if (!$('p1')) return;
    page = (p + 3) % 4 + 1;
    for (var i = 1; i <= 4; i++) $('p' + i).className = 'page' + (i === page ? '' : ' hide');
    setText('pg', page + ' / 4 · ' + NAMES[page - 1]);
  }
  function openLoc() {
    var list = $('locList'); clear(list);
    for (var i = 0; i < LOCS.length; i++) (function (L) {
      var it = el('div', 'locItem' + (L.n === loc.n ? ' on' : ''), L.n);
      it.addEventListener('click', function () { loc = L; save('dash.loc2', L); $('sheet').className = 'sheet hide'; refresh(); }, false);
      list.appendChild(it);
    })(LOCS[i]);
    if (navigator.geolocation) {
      var g = el('div', 'locItem', '📍 현재 위치 사용');
      g.addEventListener('click', function () {
        navigator.geolocation.getCurrentPosition(function (pos) {
          loc = { n: '현재 위치', lat: Math.round(pos.coords.latitude * 1e4) / 1e4, lon: Math.round(pos.coords.longitude * 1e4) / 1e4 };
          save('dash.loc2', loc); $('sheet').className = 'sheet hide'; refresh();
        }, function () { setText('upd', '위치 권한 없음 — 목록에서 선택'); $('sheet').className = 'sheet hide'; }, { timeout: 15000 });
      }, false);
      list.appendChild(g);
    }
    $('sheet').className = 'sheet';
  }

  onTap('prev', function () { show(page - 1); });
  onTap('next', function () { show(page + 1); });
  onTap('bRot', function () {
    orient = ORIENTS[(ORIENTS.indexOf(orient) + 1) % ORIENTS.length];
    save('dash.orient', orient); applyOrient();
    if (lastWx) { try { renderWeather(lastWx[0], lastWx[1]); } catch (e) {} }
  });
  onTap('bRef', refresh);
  onTap('bLoc', openLoc);
  onTap('bClose', function () { $('sheet').className = 'sheet hide'; });

  onTap('bCal', function () { $('calUrls').value = calUrls().join('\n'); $('calSheet').className = 'sheet'; });
  onTap('bCalClose', function () { $('calSheet').className = 'sheet hide'; });
  onTap('bCalSave', function () {
    var raw = $('calUrls').value.split(/\s+/), list = [];
    for (var i = 0; i < raw.length; i++) { var u = raw[i].replace(/^webcal:/, 'https:'); if (/^https?:\/\//.test(u)) list.push(u); }
    save('dash.calUrls', list); $('calSheet').className = 'sheet hide'; refreshCal();
  });
  // v1.9 — 가로/세로 회전 시 화면 폭에 맞춰 날씨(시간별 그래프) 다시 그림
  var rsT = null, rsKey = window.innerWidth + 'x' + window.innerHeight;
  window.addEventListener('resize', function () {
    if (rsT) clearTimeout(rsT);
    rsT = setTimeout(function () {
      rsT = null;
      var k = window.innerWidth + 'x' + window.innerHeight;
      if (k === rsKey) return;
      rsKey = k;
      if (lastWx) { try { renderWeather(lastWx[0], lastWx[1]); } catch (e) {} }
    }, 300);
  }, false);
  applyOrient();
  setText('auto', '자동 갱신 ' + REFRESH_MIN + '분마다');
  renderTabs();
  tickClock();
  show(1);
  refresh();
  scheduleRefresh();
})();
