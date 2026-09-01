/**
 * Blind-critic screenshot rig (dev tooling, not part of the game).
 * Drives the real game headlessly and captures frames for review.
 */
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

mkdirSync('shots', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--window-size=1280,720'
  ]
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE ERROR:', m.text()); });

await page.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 60000 });
await sleep(4500);
await page.screenshot({ path: 'shots/01-attract.png' });

// start race -> countdown
await page.keyboard.press('Enter');
await sleep(1400);
await page.screenshot({ path: 'shots/02-countdown.png' });

// Headless SwiftShader runs well below 60 fps, so game time dilates vs the
// wall clock and fixed sleeps land mid-countdown. Poll the HUD race timer
// (DOM) instead — dilation-proof scheduling.
const raceTime = () => page.evaluate(() => {
  const m = document.body.innerText.match(/00:(\d\d)\.(\d\d)/);
  return m ? (+m[1]) + (+m[2]) / 100 : 0;
});
const waitRaceTime = async (t) => {
  while ((await raceTime()) < t) await sleep(120);
};

// GO: hold throttle from the first tick of race time
await waitRaceTime(0.1);
await page.keyboard.down('w');
await waitRaceTime(4);
await page.screenshot({ path: 'shots/03-launch.png' });

// steer into a corner
await page.keyboard.down('d');
await waitRaceTime(6.5);
await page.keyboard.up('d');
await waitRaceTime(8);
await page.screenshot({ path: 'shots/04-corner.png' });

// long full-throttle stretch
await waitRaceTime(12.5);
await page.screenshot({ path: 'shots/05-straight.png' });

// left corner
await page.keyboard.down('a');
await waitRaceTime(15);
await page.keyboard.up('a');
await waitRaceTime(16.5);
await page.screenshot({ path: 'shots/06-corner2.png' });

// drift: handbrake tap
await page.keyboard.down('Space');
await waitRaceTime(18.5);
await page.keyboard.up('Space');
await waitRaceTime(19.5);
await page.screenshot({ path: 'shots/07-drift.png' });

const errors = await page.evaluate(() => window.__errors || []);
console.log('CAPTURE COMPLETE', JSON.stringify(errors));
await browser.close();
