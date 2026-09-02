/**
 * Mobile-mode verification rig (dev tooling, not part of the game).
 * Emulates a phone: checks auto-detected on-screen arrow controls, tap-to-start,
 * and that holding ▲ actually drives the car. Then checks that desktop has NO
 * touch UI (auto-detection correct) and that keyboard driving still works.
 */
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

mkdirSync('shots', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const fail = (msg) => { console.error('FAIL:', msg); fails.push(msg); };

// Headless SwiftShader dilates game time vs the wall clock, so poll the HUD
// race timer (same dilation-proof trick as screenshot.mjs).
const raceTime = (page) => page.evaluate(() => {
  const m = document.body.innerText.match(/00:(\d\d)\.(\d\d)/);
  return m ? (+m[1]) + (+m[2]) / 100 : -1;
});
const waitRace = async (page, t) => {
  while ((await raceTime(page)) < t) await sleep(150);
};
const centerOf = (page, id) => page.evaluate((elId) => {
  const r = document.getElementById(elId).getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, id);

const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'
  ]
});

// ---------------- phone (touch, portrait) ----------------
const phone = await browser.newPage();
await phone.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
phone.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
await phone.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 60000 });
await sleep(3500);

const ui = await phone.evaluate(() => ({
  present: !!document.getElementById('touchUI'),
  parts: ['joy', 'joyKnob', 'bNitro', 'bBrake', 'bDrift']
    .filter((id) => !!document.getElementById(id)),
  hint: document.getElementById('startHint')?.textContent ?? '',
  pixelRatio: window.devicePixelRatio
}));
if (!ui.present) fail('touchUI missing on touch device');
if (ui.parts.length !== 5) fail('joystick/circles missing, only: ' + ui.parts.join(','));
if (ui.hint !== 'TAP TO START') fail('start hint is "' + ui.hint + '"');
console.log('PHONE UI:', JSON.stringify(ui));
await phone.screenshot({ path: 'shots/mob-1-attract.png' });

// tap = Enter → countdown → race; then push joystick up (throttle) and hold
const joy = await centerOf(phone, 'joy');
await phone.touchscreen.touchStart(joy.x, joy.y);
await phone.touchscreen.touchEnd();
await waitRace(phone, 0.2);
await phone.touchscreen.touchStart(joy.x, joy.y);
await phone.touchscreen.touchMove(joy.x, joy.y - 50);
await waitRace(phone, 3.5);
const speed = await phone.evaluate(() => +document.getElementById('speedVal').textContent || 0);
if (speed <= 0) fail('no speed after pushing joystick up (speed=' + speed + ')');
else console.log('JOY GAS OK — speed', speed, 'km/h');
await phone.touchscreen.touchEnd();

// joystick left = analog steering (knob offsets)
await phone.touchscreen.touchStart(joy.x, joy.y);
await phone.touchscreen.touchMove(joy.x - 50, joy.y);
await sleep(500);
const steered = await phone.evaluate(() =>
  /calc\(-50%\s*-\s*[\d.]+px/.test(document.getElementById('joyKnob').style.transform || ''));
await phone.touchscreen.touchEnd();
if (!steered) fail('joystick steering never moved the knob');
else console.log('JOY STEER OK');

// circular NITRO registers a press while we roll
const nitro = await centerOf(phone, 'bNitro');
await phone.touchscreen.touchStart(nitro.x, nitro.y);
await sleep(500);
const pressed = await phone.evaluate(() => document.getElementById('bNitro').classList.contains('on'));
await phone.touchscreen.touchEnd();
if (!pressed) fail('bNitro press state never registered');
else console.log('CIRCLE PRESS OK');
await phone.screenshot({ path: 'shots/mob-2-racing.png' });
await phone.close();

// ---------------- desktop (no touch) ----------------
// Auto-detection: no chip, no touch UI, no compact HUD on desktop —
// and keyboard driving works untouched.
const desk = await browser.newPage();
await desk.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await desk.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 60000 });
await sleep(2500);

if (await desk.evaluate(() => !!document.getElementById('touchUI'))) {
  fail('touchUI visible on desktop (auto-detect false positive)');
}
if (await desk.evaluate(() => !!document.getElementById('mobChip'))) {
  fail('📱 MOBILE chip still exists — should be removed');
}
if ((await desk.evaluate(() => document.getElementById('startHint').textContent)) !== 'PRESS ENTER') {
  fail('desktop hint should be PRESS ENTER');
}
await desk.keyboard.press('Enter');
// SwiftShader dilates game time — poll the race timer before judging speed
const waitDeskRace = async (t) => {
  while ((await desk.evaluate(() => {
    const m = document.body.innerText.match(/00:(\d\d)\.(\d\d)/);
    return m ? (+m[1]) + (+m[2]) / 100 : -1;
  })) < t) await sleep(150);
};
await waitDeskRace(0.2);
await desk.keyboard.down('w');
await waitDeskRace(3.5);
const dSpeed = await desk.evaluate(() => +document.getElementById('speedVal').textContent || 0);
if (dSpeed <= 0) fail('keyboard driving broken on desktop (speed=' + dSpeed + ')');
else console.log('DESKTOP AUTO-DETECT + KEYBOARD OK — speed', dSpeed, 'km/h');
await desk.screenshot({ path: 'shots/mob-3-desktop-mobilemode.png' });
await desk.keyboard.up('w');
await desk.close();

await browser.close();
console.log(fails.length ? 'MOBILE VERIFY: FAILURES (' + fails.length + ')' : 'MOBILE VERIFY: ALL PASS');
process.exit(fails.length ? 1 : 0);