const { chromium } = require('playwright');
const [,, assets, out] = process.argv;
(async () => {
  const b = await chromium.launch();
  const sizes = [['portrait_1404x1872',1404,1872],['landscape_1872x1404',1872,1404],['landscape_1448x1072',1448,1072],['landscape_1264x1680r',1680,1264]];
  const res = {};
  for (const [n,w,h] of sizes) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    const errs=[]; p.on('pageerror', e=>errs.push(e.message));
    await p.addInitScript({ path: __dirname + '/mock.js' });
    await p.goto('file://' + assets + '/index.html'); await p.waitForTimeout(1500);
    await p.screenshot({ path: `${out}/${n}.png` });
    res[n] = await p.evaluate(() => {
      const r = id => { const e=document.querySelector(id); if(!e) return null; const b=e.getBoundingClientRect(); return [Math.round(b.left),Math.round(b.top),Math.round(b.width),Math.round(b.height), e.scrollHeight>e.clientHeight+1]; };
      return { vw: innerWidth, vh: innerHeight, docOverflow: document.documentElement.scrollHeight > innerHeight || document.documentElement.scrollWidth > innerWidth,
        top:r('.top'), wx:r('.wxTop'), mid:r('.mid'), bot:r('.bot'), foot:r('.foot'), hours:r('#hours'), svgW: (document.querySelector('.hgraph')||{}).getAttribute && document.querySelector('.hgraph').getAttribute('width'), upd: document.getElementById('upd').textContent };
    });
    res[n].errs = errs; await p.close();
  }
  // 회전 테스트: 세로로 열고 가로로 바꿈
  const p = await b.newPage({ viewport: { width: 1404, height: 1872 } });
  await p.addInitScript({ path: __dirname + '/mock.js' });
  await p.goto('file://' + assets + '/index.html'); await p.waitForTimeout(1500);
  const before = await p.evaluate(() => [document.querySelector('.hgraph').getAttribute('width'), document.getElementById('hours').clientWidth]);
  await p.setViewportSize({ width: 1872, height: 1404 }); await p.waitForTimeout(800);
  const after = await p.evaluate(() => [document.querySelector('.hgraph').getAttribute('width'), document.getElementById('hours').clientWidth]);
  await p.screenshot({ path: `${out}/rotated_to_landscape.png` });
  await p.setViewportSize({ width: 1404, height: 1872 }); await p.waitForTimeout(800);
  const back = await p.evaluate(() => [document.querySelector('.hgraph').getAttribute('width'), document.getElementById('hours').clientWidth]);
  res.rotate = { before, after, back };
  console.log(JSON.stringify(res, null, 1));
  await b.close();
})();
