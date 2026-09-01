import * as THREE from 'three';
import type { Track } from '../track/track.js';
import type { NeonLight } from '../track/roadMaterial.js';
import type { PulseMat } from '../fx/fx.js';

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function trackDist(track: Track, x: number, z: number): number {
  let m = Infinity;
  for (let i = 0; i < track.count; i += 6) {
    const p = track.pts[i];
    const d = (x - p.x) * (x - p.x) + (z - p.z) * (z - p.z);
    if (d < m) m = d;
  }
  return Math.sqrt(m);
}

function makeWindowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#05070b';
  g.fillRect(0, 0, 256, 512);
  // 4 window columns x 8 floors per tile — big clean cells so tiling stays
  // crisp at distance instead of dissolving into static.
  const palette = ['#2af5e4', '#ff2bd6', '#ffd28a', '#7ad7ff', '#9fffe0'];
  const cellW = 64, cellH = 64;
  for (let cy = 0; cy < 8; cy++) {
    for (let cx = 0; cx < 4; cx++) {
      const x = cx * cellW + 14;
      const y = cy * cellH + 16;
      if (Math.random() < 0.26) {
        g.fillStyle = palette[(Math.random() * palette.length) | 0];
        g.globalAlpha = 0.4 + Math.random() * 0.5;
        g.shadowColor = g.fillStyle;
        g.shadowBlur = 10;
        g.fillRect(x, y, 36, 30);
        g.shadowBlur = 0;
        // brighter core strip
        g.fillStyle = '#ffffff';
        g.globalAlpha = 0.16;
        g.fillRect(x + 6, y + 6, 24, 8);
      }
    }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const SIGN_TEXTS: Array<[string, string]> = [
  ['NITRO', '#2af5e4'], ['電光', '#ff2bd6'], ['TURBO', '#ff2bd6'],
  ['NIGHT GP', '#2af5e4'], ['レーサー', '#2af5e4'], ['GARAGE 9', '#ffb14a'],
  ['DRIFT', '#ff2bd6'], ['ネオン', '#2af5e4'], ['MOTEL', '#ff5d8f'],
  ['RAMEN 拉麺', '#ffd28a'], ['CLUB VOLT', '#2af5e4'], ['CYBER 競争', '#ff2bd6'],
  ['PIT STOP', '#7ad7ff'], ['SPEED', '#ff2bd6'],
];

function makeSignTexture(text: string, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 512, 128);
  g.font = 'italic 900 64px "Segoe UI", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 28;
  g.fillStyle = color;
  for (let i = 0; i < 3; i++) g.fillText(text, 256, 66);
  g.shadowBlur = 0;
  g.fillStyle = '#ffffff';
  g.globalAlpha = 0.55;
  g.fillText(text, 256, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeShaftTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 256);
  return new THREE.CanvasTexture(c);
}

function makeCheckerTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const g = c.getContext('2d')!;
  const sq = 16;
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 === 0 ? '#e8eef4' : '#0a0d12';
      g.fillRect(x * sq, y * sq, sq, sq);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeBannerTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#070a10';
  g.fillRect(0, 0, 1024, 128);
  g.strokeStyle = '#2af5e4';
  g.lineWidth = 6;
  g.strokeRect(6, 6, 1012, 116);
  g.font = 'italic 900 72px "Segoe UI", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = '#ff2bd6';
  g.shadowBlur = 24;
  g.fillStyle = '#ff4de0';
  g.fillText('NIGHT CIRCUIT', 512, 68);
  g.shadowColor = '#2af5e4';
  g.fillStyle = '#2af5e4';
  for (let i = 0; i < 6; i++) g.fillRect(20 + i * 12, 40, 6, 48);
  for (let i = 0; i < 6; i++) g.fillRect(934 + i * 12, 40, 6, 48);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const DARK_POLE = new THREE.MeshStandardMaterial({ color: 0x11141a, roughness: 0.8, metalness: 0.3 });

function buildBuildings(scene: THREE.Scene, track: Track, rng: () => number): THREE.Vector3[] {
  const winTex = makeWindowTexture();
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x0b0e13, roughness: 0.85, metalness: 0.1,
    emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.58
  });
  // Per-instance window density: the box UVs span 0..1 per face, so the shared
  // window texture would stretch with instance scale. Rescale the emissive UVs
  // by the instance's world dimensions (windows every ~3 m, floors every ~3.1 m)
  // and hash a per-building offset so lit patterns never repeat visibly.
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <uv_vertex>', `#include <uv_vertex>
#ifdef USE_INSTANCING
  float bSx = length(instanceMatrix[0].xyz);
  float bSy = length(instanceMatrix[1].xyz);
  float bSz = length(instanceMatrix[2].xyz);
  vec2 bSeed = floor(instanceMatrix[3].xz);
#else
  float bSx = 1.0, bSy = 1.0, bSz = 1.0;
  vec2 bSeed = vec2(0.0);
#endif
float bFaceW = abs(normal.x) > 0.5 ? bSz : bSx;
float bHash = fract(sin(dot(bSeed, vec2(12.9898, 78.233))) * 43758.5453);
// window every ~3.2 m horizontally, floor every ~3.4 m; texture tile = 4x8 windows
vEmissiveMapUv = uv * vec2(bFaceW / 12.8, bSy / 27.2) + bHash * 7.31;`);
  };
  const COUNT = 160;
  const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const placed: THREE.Vector3[] = [];
  let made = 0;
  for (let tries = 0; tries < 4000 && made < COUNT; tries++) {
    const x = (rng() * 2 - 1) * 300;
    const z = (rng() * 2 - 1) * 300;
    const d = trackDist(track, x, z);
    if (d < track.halfWidth + 12 || d > 330) continue;
    const sx = 10 + rng() * 14;
    const sy = 18 + rng() * rng() * 75;
    const sz = 10 + rng() * 14;
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, rng() * Math.PI, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(made, dummy.matrix);
    const v = 0.75 + rng() * 0.5;
    tint.setRGB(v * (0.9 + rng() * 0.2), v, v * (0.95 + rng() * 0.2));
    mesh.setColorAt(made, tint);
    placed.push(new THREE.Vector3(x, sy, z));
    made++;
  }
  mesh.count = made;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  scene.add(mesh);

  // far skyline silhouettes + aviation beacons
  const farGeo = new THREE.BoxGeometry(1, 1, 1);
  farGeo.translate(0, 0.5, 0);
  const farMat = new THREE.MeshStandardMaterial({ color: 0x05070c, roughness: 1 });
  const FAR = 70;
  const far = new THREE.InstancedMesh(farGeo, farMat, FAR);
  const beaconGeo = new THREE.SphereGeometry(1.6, 6, 4);
  const beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.35, 0.35), toneMapped: false });
  const beacons = new THREE.InstancedMesh(beaconGeo, beaconMat, 24);
  let b = 0;
  for (let i = 0; i < FAR; i++) {
    const a = rng() * Math.PI * 2;
    const r = 480 + rng() * 300;
    const h = 70 + rng() * 160;
    dummy.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    dummy.rotation.set(0, rng() * Math.PI, 0);
    dummy.scale.set(40 + rng() * 55, h, 40 + rng() * 55);
    dummy.updateMatrix();
    far.setMatrixAt(i, dummy.matrix);
    if (i % 3 === 0 && b < 24) {
      dummy.position.y = h + 2;
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      beacons.setMatrixAt(b++, dummy.matrix);
    }
  }
  far.instanceMatrix.needsUpdate = true;
  beacons.count = b;
  beacons.instanceMatrix.needsUpdate = true;
  scene.add(far, beacons);
  return placed;
}

function buildSigns(scene: THREE.Scene, track: Track, rng: () => number, pulseMats: PulseMat[]): NeonLight[] {
  const lights: NeonLight[] = [];
  const shaftTex = makeShaftTexture();
  const n = track.count;
  for (let s = 0; s < SIGN_TEXTS.length; s++) {
    const [text, col] = SIGN_TEXTS[s];
    const i = Math.floor((s / SIGN_TEXTS.length) * n + rng() * 20) % n;
    const p = track.pts[i];
    const pp = track.perps[i];
    const side = s % 2 === 0 ? 1 : -1;
    const dist = track.halfWidth + 7 + rng() * 16;
    const x = p.x + pp.x * side * dist;
    const z = p.z + pp.z * side * dist;
    const h = 8 + rng() * 12;
    const w = 7 + rng() * 5;

    const mat = new THREE.MeshBasicMaterial({
      map: makeSignTexture(text, col), transparent: true,
      side: THREE.DoubleSide, toneMapped: false, depthWrite: false
    });
    mat.color.setScalar(2.3);
    pulseMats.push({ mat, base: mat.color.clone() });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), mat);
    sign.position.set(x, h, z);
    sign.rotation.y = Math.atan2(p.x - x, p.z - z);
    sign.renderOrder = 10;
    scene.add(sign);

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, h - 1.2, 6), DARK_POLE);
    pole.position.set(x, (h - 1.2) / 2, z);
    scene.add(pole);

    const shaftMat = new THREE.MeshBasicMaterial({
        map: shaftTex, transparent: true, opacity: 0.14,
        blending: THREE.AdditiveBlending, depthWrite: false,
        side: THREE.DoubleSide, toneMapped: false, color: new THREE.Color(col)
      });
    pulseMats.push({ mat: shaftMat, base: shaftMat.color.clone() });
    const shaft = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.8, h - 0.8),
      shaftMat);
    shaft.position.set(x, (h - 0.8) / 2, z);
    shaft.rotation.y = sign.rotation.y;
    scene.add(shaft);

    lights.push({ pos: new THREE.Vector3(x, h, z), color: new THREE.Color(col), intensity: 2.4 });
  }
  return lights;
}

function buildStreetLights(scene: THREE.Scene, track: Track, pulseMats: PulseMat[]): NeonLight[] {
  const n = track.count;
  const step = Math.max(1, Math.round(26 * (n / track.length)));
  const slots = Math.floor(n / step);
  const dummy = new THREE.Object3D();
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 6.4, 6);
  poleGeo.translate(0, 3.2, 0);
  const poles = new THREE.InstancedMesh(poleGeo, DARK_POLE, slots);
  const headGeo = new THREE.BoxGeometry(0.7, 0.16, 0.3);
  const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.85, 2.2), toneMapped: false });
  pulseMats.push({ mat: headMat, base: headMat.color.clone() });
  const heads = new THREE.InstancedMesh(headGeo, headMat, slots);
  const lights: NeonLight[] = [];
  for (let s = 0; s < slots; s++) {
    const i = (s * step) % n;
    const p = track.pts[i];
    const pp = track.perps[i];
    const t = track.tangents[i];
    const sgn = s % 2 === 0 ? 1 : -1;
    const x = p.x + pp.x * sgn * (track.halfWidth + 1.8);
    const z = p.z + pp.z * sgn * (track.halfWidth + 1.8);
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, Math.atan2(t.x, t.z), 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poles.setMatrixAt(s, dummy.matrix);
    // arm reaches over the barrier toward the road
    const hx = p.x + pp.x * sgn * (track.halfWidth + 0.6);
    const hz = p.z + pp.z * sgn * (track.halfWidth + 0.6);
    dummy.position.set(hx, 6.3, hz);
    dummy.updateMatrix();
    heads.setMatrixAt(s, dummy.matrix);
    if (s % 3 === 0) {
      lights.push({ pos: new THREE.Vector3(hx, 6.3, hz), color: new THREE.Color(0.45, 0.7, 1.0), intensity: 0.85 });
    }
  }
  poles.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  scene.add(poles, heads);
  return lights;
}

function buildStartGantry(scene: THREE.Scene, track: Track): void {
  const p = track.pts[0];
  const t = track.tangents[0];
  const pp = track.perps[0];
  const hw = track.halfWidth;
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x12151c, roughness: 0.6, metalness: 0.4 });
  for (let side = 0; side < 2; side++) {
    const sgn = side === 0 ? 1 : -1;
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 8.6, 0.7), pillarMat);
    pillar.position.set(p.x + pp.x * sgn * (hw + 1.6), 4.3, p.z + pp.z * sgn * (hw + 1.6));
    scene.add(pillar);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry((hw + 1.6) * 2 + 0.7, 1.5, 0.8), pillarMat);
  beam.position.set(p.x, 8.1, p.z);
  beam.rotation.y = Math.atan2(-pp.z, pp.x);
  scene.add(beam);

  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(hw * 2 + 2.5, 1.7),
    new THREE.MeshBasicMaterial({
      map: makeBannerTexture(), side: THREE.DoubleSide, toneMapped: false
    }));
  banner.position.set(p.x - t.x * 0.5, 8.1, p.z - t.z * 0.5);
  banner.rotation.y = Math.atan2(-t.x, -t.z);
  scene.add(banner);

  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(hw * 2, 2.2),
    new THREE.MeshBasicMaterial({ map: makeCheckerTexture(), toneMapped: false }));
  line.position.set(p.x, 0.06, p.z);
  line.rotation.set(-Math.PI / 2, 0, -Math.atan2(t.x, t.z));
  scene.add(line);
}

export interface CityResult { lights: NeonLight[]; pulseMats: PulseMat[]; }

export function buildCity(scene: THREE.Scene, track: Track): CityResult {
  const rng = makeRng(1337);
  buildBuildings(scene, track, rng);
  const pulseMats: PulseMat[] = [];
  const lights = buildSigns(scene, track, rng, pulseMats);
  lights.push(...buildStreetLights(scene, track, pulseMats));
  buildStartGantry(scene, track);

  // Pick 12 lights, spread around the circuit, signs prioritized over poles.
  const sorted = lights.slice().sort((a, b) => b.intensity - a.intensity);
  const picked: NeonLight[] = [];
  for (const l of sorted) {
    let ok = true;
    for (const p of picked) {
      if (p.pos.distanceToSquared(l.pos) < 70 * 70) { ok = false; break; }
    }
    if (ok) picked.push(l);
    if (picked.length >= 12) break;
  }
  return { lights: picked, pulseMats };
}
