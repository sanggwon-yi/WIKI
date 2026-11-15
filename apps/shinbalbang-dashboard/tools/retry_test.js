// Wi-Fi 지연 모의: 처음 N번은 네트워크 오류, 이후 정상 → 자동 재시도로 날씨가 뜨는지 확인
const { chromium } = require('playwright');
const [,, assets, failN = '2'] = process.argv;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1404, height: 1872 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript({ path: __dirname + '/mock.js' });
  await p.addInitScript(`(function(){ var real = window.AndroidNet.fetch, n = 0;
    window.AndroidNet.fetch = function (id, url) {
      if (url.indexOf('open-meteo') >= 0 && url.indexOf('air-quality') < 0 && n++ < ${failN}) {
        setTimeout(function () { window.__nativeCb(id, false, 'UnknownHostException: api.open-meteo.com'); }, 30); return; }
      real(id, url); }; })();`);
  const t0 = Date.now(); await p.goto('file://' + assets + '/index.html');
  const log = []; let last = '';
  while (Date.now() - t0 < 60000) {
    const s = await p.evaluate(() => [document.getElementById('upd').textContent, document.getElementById('nowTemp').textContent]);
    if (s.join('|') !== last) { last = s.join('|'); log.push(Math.round((Date.now() - t0) / 1000) + 's  ' + last); }
    if (s[0].indexOf('최근 갱신') === 0) break;
    await p.waitForTimeout(500);
  }
  console.log(log.join('\n')); console.log('errs', errs); await b.close();
})();
