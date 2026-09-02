import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const sizes = [[844, 390, 'lg-big'], [740, 360, 'lg-mid'], [667, 375, 'lg-se'], [684, 344, 'lg-small'], [390, 844, 'portrait']];
for (const [w, h, name] of sizes) {
  const p = await browser.newPage();
  await p.setViewport({ width: w, height: h, hasTouch: true, isMobile: true });
  await p.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3500));
  const report = await p.evaluate(() => {
    const box = id => { const el = document.getElementById(id); if (!el) return null; const r = el.getBoundingClientRect(); return { id, l: r.left, t: r.top, r: r.right, b: r.bottom }; };
    const hud = ['minimap', 'lb', 'boostWrap', 'speedBox', 'posBox', 'driftTag', 'lapBox', 'timeBox'].map(box).filter(Boolean);
    const btns = ['joy', 'bNitro', 'bBrake', 'bDrift'].map(box).filter(Boolean);
    const inter = (a, b) => {
      const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l);
      const oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
      return (ox > 2 && oy > 2) ? Math.round(ox) + 'x' + Math.round(oy) + 'px' : null;
    };
    const hits = [];
    for (const a of hud) for (const b of btns) { const s = inter(a, b); if (s) hits.push(a.id + ' x ' + b.id + ' (' + s + ')'); }
    const hudHits = [];
    for (let i = 0; i < hud.length; i++) for (let j = i + 1; j < hud.length; j++) { const s = inter(hud[i], hud[j]); if (s) hudHits.push(hud[i].id + ' x ' + hud[j].id + ' (' + s + ')'); }
    return { vw: innerWidth, vh: innerHeight, mobileMode: document.body.classList.contains('mobile-mode'), hits, hudHits };
  });
  console.log('==', name, report.vw + 'x' + report.vh, 'mobileMode=' + report.mobileMode);
  console.log('  HUDxCTL:', report.hits.length ? report.hits.join(', ') : 'none');
  console.log('  HUDxHUD:', report.hudHits.length ? report.hudHits.join(', ') : 'none');
  await p.screenshot({ path: 'shots/fix-' + name + '.png' });
  await p.close();
}
await browser.close();
console.log('DONE');
