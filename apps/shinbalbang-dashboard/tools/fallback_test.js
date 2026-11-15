// 앱(자바) 통신이 모두 실패할 때 WebView XHR 경로로 날씨가 뜨는지 확인
const { chromium } = require('playwright');
const [,, assets, webOk = '1'] = process.argv;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1404, height: 1872 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript({ path: __dirname + '/mock.js' });
  await p.addInitScript(`window.AndroidNet.fetch = function (id, url) { setTimeout(function () { window.__nativeCb(id, false, 'SSLHandshakeException: 테스트용 실패'); }, 30); };`);
  const hits = [];
  await p.route(/open-meteo\.com/, async (route) => {
    hits.push(route.request().url().split('?')[0]);
    if (webOk !== '1') return route.abort();
    const body = await p.evaluate(u => window.__mockBody(u), route.request().url());
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body });
  });
  await p.goto('file://' + assets + '/index.html'); await p.waitForTimeout(2500);
  console.log(JSON.stringify({ upd: await p.textContent('#upd'), temp: await p.textContent('#nowTemp'), webHits: hits, errs }));
  await b.close();
})();
