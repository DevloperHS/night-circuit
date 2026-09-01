// Frame-time probe: boots the game in headless Chrome, simulates a driving input,
// and samples requestAnimationFrame deltas around the render loop.
// NOTE: headless Chrome renders via SwiftShader (software GL), so numbers here are
// a LOWER bound vs real desktop Chrome + GPU. We report avg/p95/max.
import puppeteer from 'puppeteer';

const URL = process.env.URL || 'http://localhost:5173';
const SAMPLE_MS = Number(process.env.SAMPLE_MS || 12000);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
await page.keyboard.press('Enter'); // leave attract
await new Promise((r) => setTimeout(r, 3500)); // countdown 3..2..1

// Drive forward + sample rAF deltas inside the page.
await page.keyboard.down('KeyW');
const result = await page.evaluate(
  (sampleMs) =>
    new Promise((resolve) => {
      const deltas = [];
      let last = performance.now();
      const start = last;
      function tick(now) {
        deltas.push(now - last);
        last = now;
        if (now - start < sampleMs) requestAnimationFrame(tick);
        else {
          deltas.sort((a, b) => a - b);
          const n = deltas.length;
          const sum = deltas.reduce((a, b) => a + b, 0);
          resolve({
            frames: n,
            avgMs: sum / n,
            p95Ms: deltas[Math.floor(n * 0.95)],
            maxMs: deltas[n - 1],
            estFps: 1000 / (sum / n),
          });
        }
      }
      requestAnimationFrame(tick);
    }),
  SAMPLE_MS,
);
await page.keyboard.up('KeyW');
await browser.close();

console.log(JSON.stringify({ ...result, pageErrors: errors }, null, 2));
