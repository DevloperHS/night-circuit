import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 720 });
await p.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
await new Promise(r => setTimeout(r, 3000));
// visual check only: fill the nitro bar to 45% to see border-vs-fill match
await p.evaluate(() => { document.getElementById('boostFill').style.width = '45%'; });
await new Promise(r => setTimeout(r, 300));
const clip = await p.evaluate(() => { const r = document.getElementById('boostWrap').getBoundingClientRect(); return { x: r.x - 20, y: r.y - 20, width: r.width + 40, height: r.height + 40 }; });
await p.screenshot({ path: 'shots/fix-nitro-bar.png', clip });
const chip = await p.evaluate(() => !!document.getElementById('mobChip'));
await p.screenshot({ path: 'shots/fix-desktop.png' });
console.log('CHIP_PRESENT=' + chip);
await b.close();
