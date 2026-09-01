import * as THREE from 'three';
import type { Car } from '../car/car.js';

export interface PulseMat { mat: THREE.MeshBasicMaterial; base: THREE.Color; }

/** Ring-buffer skid marks. Zero per-frame allocation: one dummy, one InstancedMesh. */
class SkidMarks {
  readonly mesh: THREE.InstancedMesh;
  private head = 0;
  private readonly capacity: number;
  private readonly lastX: Float32Array; // per car per side, last stamp pos
  private readonly lastZ: Float32Array;
  private readonly dummy = new THREE.Object3D();

  constructor(capacity: number, carCount: number) {
    this.capacity = capacity;
    const geo = new THREE.PlaneGeometry(0.36, 0.95);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x030407, transparent: true, opacity: 0.55,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.lastX = new Float32Array(carCount * 2);
    this.lastZ = new Float32Array(carCount * 2);
    this.reset();
  }

  reset(): void {
    this.head = 0;
    this.lastX.fill(0);
    this.lastZ.fill(0);
    const d = this.dummy;
    d.position.set(0, -50, 0);
    d.rotation.set(0, 0, 0);
    d.scale.set(1, 1, 1);
    d.updateMatrix();
    for (let i = 0; i < this.capacity; i++) this.mesh.setMatrixAt(i, d.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** stamp: aligns each mark to the actual travel direction; strength 0..1. */
  stamp(carIdx: number, side: number, x: number, z: number, strength: number): void {
    const o = carIdx * 2 + side;
    const dx = x - this.lastX[o];
    const dz = z - this.lastZ[o];
    const d2 = dx * dx + dz * dz;
    if (d2 < 0.09) return; // ~0.3 m spacing
    const first = this.lastX[o] === 0 && this.lastZ[o] === 0;
    this.lastX[o] = x;
    this.lastZ[o] = z;
    if (first) return; // no direction known yet
    const d = this.dummy;
    d.position.set(x, 0.028, z);
    d.rotation.set(0, Math.atan2(dx, dz), 0); // face along travel
    d.scale.set(1, 1, 0.9 + strength * 1.3);
    d.updateMatrix();
    this.mesh.setMatrixAt(this.head, d.matrix);
    this.head = (this.head + 1) % this.capacity;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Pooled spark particles (barrier scrapes + car contacts). Fixed Float32 pools. */
class Sparks {
  private static readonly N = 192;
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private cursor = 0;

  constructor() {
    this.pos = new Float32Array(Sparks.N * 3);
    this.vel = new Float32Array(Sparks.N * 3);
    this.life = new Float32Array(Sparks.N);
    for (let i = 0; i < Sparks.N; i++) this.pos[i * 3 + 1] = -100;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(16, 16, 1, 16, 16, 15);
    grad.addColorStop(0, 'rgba(255,240,200,1)');
    grad.addColorStop(0.4, 'rgba(255,160,60,0.8)');
    grad.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    const mat = new THREE.PointsMaterial({
      map: new THREE.CanvasTexture(c), size: 0.34, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  burst(x: number, y: number, z: number, nx: number, nz: number, power: number): void {
    const n = Math.min(10, 3 + Math.floor(power * 10));
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % Sparks.N;
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 7 * power;
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = y + Math.random() * 0.4;
      this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = nx * sp * (0.5 + Math.random()) + Math.cos(a) * 2.2;
      this.vel[i * 3 + 1] = 1.5 + Math.random() * 5.5 * power;
      this.vel[i * 3 + 2] = nz * sp * (0.5 + Math.random()) + Math.sin(a) * 2.2;
      this.life[i] = 0.35 + Math.random() * 0.4;
    }
  }

  update(dt: number): void {
    let any = false;
    for (let i = 0; i < Sparks.N; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -100; continue; }
      this.vel[i * 3 + 1] -= 14 * dt; // gravity
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.03) { // bounce on asphalt
        this.pos[i * 3 + 1] = 0.03;
        this.vel[i * 3 + 1] *= -0.38;
        this.vel[i * 3] *= 0.7;
        this.vel[i * 3 + 2] *= 0.7;
      }
    }
    if (any) (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  reset(): void {
    this.life.fill(0);
    for (let i = 0; i < Sparks.N; i++) this.pos[i * 3 + 1] = -100;
  }
}

/** Camera-locked rain streaks, wrapped around the camera. Fixed pool. */
class Rain {
  private static readonly N = 720;
  readonly points: THREE.Points;
  private readonly pos: Float32Array;

  constructor() {
    this.pos = new Float32Array(Rain.N * 3);
    for (let i = 0; i < Rain.N; i++) {
      this.pos[i * 3] = (Math.random() - 0.5) * 76;
      this.pos[i * 3 + 1] = Math.random() * 30;
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * 76;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const c = document.createElement('canvas');
    c.width = 8; c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, 'rgba(190,235,255,0)');
    grad.addColorStop(0.5, 'rgba(190,235,255,0.9)');
    grad.addColorStop(1, 'rgba(190,235,255,0)');
    g.fillStyle = grad;
    g.fillRect(3, 0, 2, 64);
    const mat = new THREE.PointsMaterial({
      map: new THREE.CanvasTexture(c), size: 0.85, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  update(dt: number, cam: THREE.Camera): void {
    const cx = cam.position.x, cz = cam.position.z, cy = cam.position.y;
    for (let i = 0; i < Rain.N; i++) {
      let y = this.pos[i * 3 + 1] - (26 + (i % 5)) * dt;
      this.pos[i * 3] -= 4.5 * dt; // wind
      if (y < cy - 8) {
        y = cy + 24 + Math.random() * 6;
        this.pos[i * 3] = cx + (Math.random() - 0.5) * 76;
        this.pos[i * 3 + 2] = cz + (Math.random() - 0.5) * 76;
      }
      this.pos[i * 3 + 1] = y;
      if (this.pos[i * 3] - cx > 38) this.pos[i * 3] -= 76;
      else if (this.pos[i * 3] - cx < -38) this.pos[i * 3] += 76;
      if (this.pos[i * 3 + 2] - cz > 38) this.pos[i * 3 + 2] -= 76;
      else if (this.pos[i * 3 + 2] - cz < -38) this.pos[i * 3 + 2] += 76;
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}

const BEAT_PERIOD = 60 / 112; // 112 BPM — the "night drive" pulse

export class GameFX {
  private skids: SkidMarks;
  private sparks = new Sparks();
  private rain = new Rain();
  private pulseMats: PulseMat[];
  private roadShader: { uniforms: { uPulse: { value: number } } } | null = null;
  private beatT = 0;
  pulse = 0;

  constructor(scene: THREE.Scene, pulseMats: PulseMat[], carCount: number) {
    this.skids = new SkidMarks(720, carCount);
    scene.add(this.skids.mesh, this.sparks.points, this.rain.points);
    this.pulseMats = pulseMats;
  }

  attachRoad(shader: unknown): void {
    this.roadShader = shader as GameFX['roadShader'];
  }

  reset(): void {
    this.skids.reset();
    this.sparks.reset();
  }

  /** Barrier scrape — contact point + outward normal. */
  scrape(x: number, z: number, nx: number, nz: number, speed: number): void {
    this.sparks.burst(x, 0.25, z, nx, nz, Math.min(1, speed / 12));
  }

  /** Car-to-car contact. */
  contact(x: number, z: number, strength: number): void {
    this.sparks.burst(x, 0.5, z, Math.random() - 0.5, Math.random() - 0.5, strength);
  }

  /** Per rendered frame: stamps skids, updates particles + beat pulse. */
  update(dt: number, cars: Car[], cam: THREE.Camera): void {
    for (let c = 0; c < cars.length; c++) {
      const car = cars[c];
      if (!(car.drifting && Math.abs(car.vf) > 5)) continue;
      const strength = Math.min(1, Math.abs(car.vlat) / 9);
      const sinH = Math.sin(car.heading);
      const cosH = Math.cos(car.heading);
      for (let side = 0; side < 2; side++) {
        const sgn = side === 0 ? 1 : -1;
        // rear axle -1.42 in car frame; rear wheels at ±0.93 lateral
        const rx = car.pos.x - sinH * 1.42 + cosH * sgn * 0.93;
        const rz = car.pos.z - cosH * 1.42 - sinH * sgn * 0.93;
        this.skids.stamp(c, side, rx, rz, strength);
      }
    }

    this.sparks.update(dt);
    this.rain.update(dt, cam);

    this.beatT += dt;
    if (this.beatT >= BEAT_PERIOD) { this.beatT %= BEAT_PERIOD; this.pulse = 1; }
    this.pulse = Math.max(0, this.pulse - dt * 3.2);
    if (this.roadShader) this.roadShader.uniforms.uPulse.value = this.pulse;
    const glow = 1 + this.pulse * 0.45;
    for (const pm of this.pulseMats) pm.mat.color.copy(pm.base).multiplyScalar(glow);
  }
}
