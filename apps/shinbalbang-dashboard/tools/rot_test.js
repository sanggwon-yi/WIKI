// [가로] 버튼 전환 테스트: 세로 고정 뷰포트에서 버튼으로 세로 → 가로 → 가로 반대 → 세로
const { chromium } = require('playwright');
const [,, assets, out, W = '1404', H = '1872'] = process.argv;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: +W, height: +H } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript({ path: __dirname + '/mock.js' });
  await p.goto('file://' + assets + '/index.html'); await p.waitForTimeout(1200);
  const info = async () => p.evaluate(() => {
    const a = document.getElementById('app').getBoundingClientRect();
    const g = document.querySelector('.hgraph');
    const over = ['.wxTop', '.mid', '.bot'].map(s => { const e = document.querySelector(s); return e.scrollHeight > e.clientHeight + 1; });
    return { cls: document.documentElement.className, btn: document.getElementById('bRot').textContent,
      appBox: [a.left, a.top, a.width, a.height].map(Math.round), graphW: g && g.getAttribute('width'), overflow: over,
      pageScroll: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight };
  });
  const res = [];
  res.push(await info()); await p.screenshot({ path: out + '/0_portrait.png' });
  for (const n of ['1_land_r', '2_land_l', '3_portrait']) {
    await p.click('#bRot'); await p.waitForTimeout(500);
    res.push(await info()); await p.screenshot({ path: `${out}/${n}.png` });
    if (n === '1_land_r') {
      await p.click('#bLoc'); await p.waitForTimeout(300);
      res.push({ sheetOpenedByTapInRotated: (await p.getAttribute('#sheet', 'class')) });
      await p.click('#bClose'); await p.waitForTimeout(300);
    }
  }
  await p.click('#bRot'); await p.waitForTimeout(300); await p.reload(); await p.waitForTimeout(1200);
  res.push({ afterReload: (await info()).cls });
  res.push({ errs });
  console.log(JSON.stringify(res, null, 0).replace(/\},\{/g, '},\n{'));
  await b.close();
})();
