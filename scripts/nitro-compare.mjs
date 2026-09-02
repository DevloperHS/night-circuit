import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [w, h, touch, name] of [[1280, 720, false, 'desktop'], [390, 844, true, 'phone-portrait'], [740, 360, true, 'phone-landscape']]) {
  const p = await b.newPage();
  await p.setViewport({ width: w, height: h, hasTouch: touch, isMobile: touch });
  await p.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3000));
  const info = await p.evaluate(() => {
    const f = document.getElementById('boostFill');
    const bar = document.getElementById('boostBar');
    f.style.width = '78%';
    const cs = getComputedStyle(f), cb = getComputedStyle(bar);
    return {
      mobileMode: document.body.classList.contains('mobile-mode'),
      fillBg: cs.backgroundImage, fillShadow: cs.boxShadow.slice(0, 60),
      barBorder: cb.borderColor, barW: bar.getBoundingClientRect().width
    };
  });
  console.log('==', name, JSON.stringify(info));
  const clip = await p.evaluate(() => { const r = document.getElementById('boostWrap').getBoundingClientRect(); return { x: r.x - 14, y: r.y - 14, width: r.width + 28, height: r.height + 28 }; });
  await p.screenshot({ path: 'shots/cmp-' + name + '.png', clip });
  await p.close();
}
await b.close();
console.log('DONE');
