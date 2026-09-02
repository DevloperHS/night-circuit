import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ids = ['tLeft','tRight','tGas','tBrake','tNitro','tDrift'];
const rects = (page) => page.evaluate((ids) => ids.concat('posBox').map((id) => { const e = document.getElementById(id); if (!e) return null; const r = e.getBoundingClientRect(); return { id, x: r.x, y: r.y, w: r.width, h: r.height }; }), ids);
const hit = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const check = async (page, name, w, h) => {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));
  const rs = (await rects(page)).filter(Boolean);
  let bad = 0;
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++)
    if (hit(rs[i], rs[j])) { console.log(`OVERLAP [${name}] ${rs[i].id} x ${rs[j].id}`); bad++; }
  const onscreen = rs.every(r => r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h);
  if (!onscreen) { console.log(`OFFSCREEN [${name}]`, JSON.stringify(rs)); bad++; }
  console.log(`${name}: ${bad ? bad + ' ISSUES' : 'CLEAN'}`);
  await page.screenshot({ path: `shots/final-${name}.png` });
};
const page = await browser.newPage();
await check(page, 'portrait', 390, 844);
await check(page, 'landscape', 844, 390);
await browser.close();
