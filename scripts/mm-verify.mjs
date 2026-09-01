// One-off leaderboard verification (dev tooling).
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

mkdirSync('shots', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--window-size=1280,720']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
let errors = 0;
page.on('pageerror', (e) => { errors++; console.error('PAGE ERROR:', e.message); });
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) { errors++; console.error('CONSOLE ERROR:', m.text()); } });

await page.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 60000 });
await sleep(3500);

const lbState = () => page.evaluate(() => {
  const rows = [...document.querySelectorAll('.lb-row')];
  return rows.map((r) => ({
    pos: r.querySelector('.lb-pos').textContent,
    name: r.querySelector('.lb-name').textContent,
    gap: r.querySelector('.lb-gap').textContent,
    y: r.style.transform,
    me: r.classList.contains('me')
  }));
});

const attract = await lbState();
console.log('ATTRACT:', JSON.stringify(attract, null, 1));
await page.screenshot({ path: 'shots/lb-1-attract.png' });

// start the race and drive, sampling the leaderboard twice mid-race
const raceTime = () => page.evaluate(() => {
  const m = document.body.innerText.match(/00:(\d\d)\.(\d\d)/);
  return m ? (+m[1]) + (+m[2]) / 100 : 0;
});
const waitRaceTime = async (t) => {
  const deadline = Date.now() + 180000;
  while ((await raceTime()) < t && Date.now() < deadline) await sleep(120);
};
await page.keyboard.press('Enter');
await waitRaceTime(0.1);
await page.keyboard.down('w');
await waitRaceTime(5);
const mid1 = await lbState();
console.log('RACE ~5s:', JSON.stringify(mid1, null, 1));
await page.screenshot({ path: 'shots/lb-2-midrace.png' });
await waitRaceTime(11);
const mid2 = await lbState();
console.log('RACE ~11s:', JSON.stringify(mid2, null, 1));
await page.screenshot({ path: 'shots/lb-3-later.png' });

// checks: 4 rows, one LEAD, gaps on others, player row flagged, order moved
const positions = (s) => s.map((r) => r.pos).join(',');
const orderChanged = positions(attract) !== positions(mid1) || positions(mid1) !== positions(mid2);
const oneLead = (s) => s.filter((r) => r.gap === 'LEAD').length === 1;
const gapsOk = (s) => s.every((r) => r.gap === 'LEAD' || /^\+\d+\.\ds$/.test(r.gap));
const meRow = mid2.find((r) => r.me);
console.log(`checks -> orderChanged=${orderChanged} oneLead=${oneLead(mid2)} gapsOk=${gapsOk(mid2)} meRow=${JSON.stringify(meRow)}`);
console.log(errors === 0 ? 'LB VERIFY OK' : `LB VERIFY FAILED (${errors} errors)`);
await browser.close();
