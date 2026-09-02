import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
p.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()); });
await p.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
await p.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
await new Promise(r => setTimeout(r, 3500));
console.log(await p.evaluate(() => ({
  coarse: matchMedia('(pointer: coarse)').matches,
  mobileMode: document.body.classList.contains('mobile-mode'),
  touchUI: !!document.getElementById('touchUI'),
  joy: !!document.getElementById('joy'),
  hud: !!document.getElementById('minimap')
})));
await b.close();
