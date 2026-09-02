import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const p = await b.newPage();
await p.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
console.log(await p.evaluate(() => ({
  rootTeal: getComputedStyle(document.documentElement).getPropertyValue('--teal'),
  rootMag: getComputedStyle(document.documentElement).getPropertyValue('--mag'),
  bodyTeal: getComputedStyle(document.body).getPropertyValue('--teal'),
  neonT: getComputedStyle(document.querySelector('.neon-t')).color,
  boostFillImg: getComputedStyle(document.getElementById('boostFill')).backgroundImage.slice(0, 60)
})));
await b.close();
