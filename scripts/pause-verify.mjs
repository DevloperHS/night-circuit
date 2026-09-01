// One-off pause-screen verification (dev tooling).
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

mkdirSync('shots', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
let errors = 0;
page.on('pageerror', (e) => { errors++; console.error('PAGE ERROR:', e.message); });
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) { errors++; console.error('CONSOLE ERROR:', m.text()); } });

await page.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 60000 });
await sleep(3000);

const raceTime = () => page.evaluate(() => {
  const m = document.body.innerText.match(/00:(\d\d)\.(\d\d)/);
  return m ? (+m[1]) + (+m[2]) / 100 : -1;
});
const waitRaceTime = async (t) => {
  const deadline = Date.now() + 180000;
  while ((await raceTime()) < t && Date.now() < deadline) await sleep(120);
};
const menuState = () => page.evaluate(() => ({
  pauseMenu: getComputedStyle(document.getElementById('pauseMenu')).display,
  overlay: getComputedStyle(document.getElementById('overlay')).display
}));

// 1) ESC on attract screen must NOT open the pause menu
await page.keyboard.press('Escape');
await sleep(400);
const attract = await menuState();
console.log('ESC @ ATTRACT:', JSON.stringify(attract));

// 2) race, then ESC -> menu shows and the race timer freezes
await page.keyboard.press('Enter');
await waitRaceTime(0.5);
await page.keyboard.press('Escape');
await sleep(400);
const paused1 = await menuState();
const t1 = await raceTime();
await sleep(1600);
const t2 = await raceTime();
console.log('PAUSED:', JSON.stringify(paused1), `timer ${t1.toFixed(2)} -> ${t2.toFixed(2)} frozen=${t1 === t2}`);
await page.screenshot({ path: 'shots/pause-1-paused.png' });

// 3) ESC again -> resume, timer moves again
await page.keyboard.press('Escape');
await sleep(300);
const resumed = await menuState();
await sleep(1500);
const t3 = await raceTime();
console.log('RESUMED:', JSON.stringify(resumed), `timer -> ${t3.toFixed(2)} moving=${t3 > t2}`);

// 4) pause again -> RESTART button starts a fresh race
await page.keyboard.press('Escape');
await sleep(300);
await page.click('#btnRestart');
await sleep(300);
const afterRestart = await menuState();
await waitRaceTime(0.3);
const t4 = await raceTime();
console.log('BTN RESTART:', JSON.stringify(afterRestart), `fresh timer=${t4.toFixed(2)}`);

// 5) pause -> R key restart also works from pause
await page.keyboard.press('Escape');
await sleep(300);
await page.keyboard.press('KeyR');
await sleep(300);
const afterR = await menuState();
console.log('R @ PAUSE:', JSON.stringify(afterR));

// 6) pause -> RESUME button
await waitRaceTime(0.2);
await page.keyboard.press('Escape');
await sleep(300);
await page.click('#btnResume');
await sleep(300);
const afterResume = await menuState();
await sleep(1200);
const t5 = await raceTime();
console.log('BTN RESUME:', JSON.stringify(afterResume), `timer=${t5.toFixed(2)}`);

await page.screenshot({ path: 'shots/pause-2-resumed.png' });

const ok = attract.pauseMenu === 'none' &&
  paused1.pauseMenu === 'flex' && paused1.overlay === 'flex' && t1 === t2 &&
  resumed.pauseMenu === 'none' && t3 > t2 &&
  afterRestart.pauseMenu === 'none' && t4 < 3 &&
  afterR.pauseMenu === 'none' &&
  afterResume.pauseMenu === 'none' && t5 > 0;
console.log(ok && errors === 0 ? 'PAUSE VERIFY OK' : `PAUSE VERIFY FAILED (errors=${errors})`);
await browser.close();
