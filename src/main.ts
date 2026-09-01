import * as THREE from 'three';
import { Game } from './core/game.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
document.getElementById('app')?.appendChild(renderer.domElement);

const game = new Game(renderer);

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  game.camera.aspect = w / h;
  game.camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  game.resize(w, h);
});

// Perf overlay (toggle: P) — real-GPU frame-time probe for the 60 fps budget.
const perfEl = document.createElement('div');
perfEl.style.cssText =
  'position:fixed;top:14px;right:16px;z-index:40;display:none;text-align:right;' +
  'font:600 12px/1.6 ui-monospace,Menlo,monospace;color:#8fe8ff;letter-spacing:1px;' +
  'text-shadow:0 0 6px rgba(42,245,228,.5);white-space:pre;';
document.body.appendChild(perfEl);

let perfOn = false;
let emaMs = 16.7;
let emaAcc = 0;
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP') {
    perfOn = !perfOn;
    perfEl.style.display = perfOn ? 'block' : 'none';
  }
});

let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const frameMs = now - last;
  const dt = Math.min(frameMs / 1000, 0.1);
  last = now;
  game.update(dt);
  game.render();

  emaMs += (frameMs - emaMs) * 0.05;
  if (perfOn) {
    emaAcc += dt;
    if (emaAcc > 0.25) {
      emaAcc = 0;
      const i = renderer.info.render;
      perfEl.textContent =
        `${(1000 / emaMs).toFixed(1)} FPS · ${emaMs.toFixed(2)} ms\n` +
        `draws ${i.calls} · tris ${(i.triangles / 1000).toFixed(0)}k · dpr ${renderer.getPixelRatio().toFixed(2)}`;
    }
  }
});
