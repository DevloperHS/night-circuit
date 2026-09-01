import * as THREE from 'three';
import { Track } from '../track/track.js';
import { createRoadMaterial } from '../track/roadMaterial.js';
import { buildCity } from '../city/city.js';
import { createSky } from '../city/sky.js';
import { createCarVisual } from '../car/carFactory.js';
import { Car } from '../car/car.js';
import type { CarInput } from '../car/car.js';
import { AIController } from '../ai/ai.js';
import type { RacePhase } from '../ai/ai.js';
import { createPostFX } from '../fx/postfx.js';
import type { PostFX } from '../fx/postfx.js';
import { HUD } from '../ui/hud.js';
import { AudioEngine } from '../audio/audio.js';
import { Input } from '../core/input.js';
import { GameFX } from '../fx/fx.js';

const STEP = 1 / 120;
const LAPS = 3;

interface CarSpec {
  color: number;
  glow: number;
  skill: number;
  lane: number;
}

const CAR_SPECS: CarSpec[] = [
  { color: 0x10161f, glow: 0x2af5e4, skill: 0.97, lane: -2.6 }, // AI 1
  { color: 0x1a0f1a, glow: 0xff2bd6, skill: 0.99, lane: 0 },    // AI 2
  { color: 0x0e1a20, glow: 0x35ffd0, skill: 1.0, lane: 0 },     // PLAYER
  { color: 0x14101e, glow: 0x9a6bff, skill: 1.01, lane: 2.6 },  // AI 3
];

export class Game {
  readonly camera: THREE.PerspectiveCamera;
  readonly scene = new THREE.Scene();
  readonly track: Track;
  readonly input = new Input();
  readonly hud = new HUD();
  readonly audio = new AudioEngine();

  private postfx: PostFX;
  private roadMat: THREE.MeshStandardMaterial;
  private fx: GameFX;
  private cars: Car[] = [];
  private player!: Car;
  private ais: AIController[] = [];
  private aiByCar = new Map<Car, AIController>();
  private playerInput: CarInput = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };

  state: RacePhase = 'attract';
  private accum = 0;
  private raceTime = 0;
  private countdownT = 0;
  private lastCdNum = 99;
  private goT = 0; // fixed-step "GO!" dismissal timer (no setTimeout)
  private bestLap = 0;
  private playerTotalTime = 0;
  private playerFinishPos = 1;
  private attractT = 0;
  private finT = 0;
  private paused = false; // ESC pause: world sim frozen, rendering continues
  private lookCur = new THREE.Vector3();

  private _v1 = new THREE.Vector3();
  private _v2 = new THREE.Vector3();
  private _v3 = new THREE.Vector3();

  constructor(renderer: THREE.WebGLRenderer) {
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 3000);
    this.camera.position.set(0, 60, -260);

    this.scene.fog = new THREE.FogExp2(0x04060a, 0.0042);
    this.scene.add(createSky());

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(4000, 4000),
      new THREE.MeshStandardMaterial({ color: 0x06080c, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    this.scene.add(ground);

    this.scene.add(new THREE.AmbientLight(0x18202c, 1.4));
    const hemi = new THREE.HemisphereLight(0x223448, 0x0a0c12, 0.9);
    this.scene.add(hemi);
    const moon = new THREE.DirectionalLight(0x4a6a8a, 0.55);
    moon.position.set(-120, 200, -90);
    this.scene.add(moon);

    this.track = new Track();
    this.track.buildBarriers(this.scene);
    const city = buildCity(this.scene, this.track);
    this.roadMat = createRoadMaterial(city.lights);
    this.fx = new GameFX(this.scene, city.pulseMats, CAR_SPECS.length);
    this.scene.add(this.track.buildRoad(this.roadMat));

    // cars: [ai0, ai1, player, ai2] — player starts 3rd on the grid
    const order = [0, 1, 2, 3];
    for (const i of order) {
      const spec = CAR_SPECS[i];
      const isPlayer = i === 2;
      const visual = createCarVisual({ bodyColor: spec.color, glowColor: spec.glow, isPlayer });
      this.scene.add(visual.group);
      const car = new Car(visual, isPlayer);
      car.aiSkill = spec.skill;
      this.cars.push(car);
      if (isPlayer) this.player = car;
      else {
        const ai = new AIController(car, this.track, spec.lane);
        this.ais.push(ai);
        this.aiByCar.set(car, ai);
      }
      car.onBoost = () => { if (car.isPlayer) this.audio.whoosh(); };
      car.onScrape = (s) => {
        // sparks at the barrier contact point (all cars)
        if (s > 1.2) {
          const q = car.query;
          const bp = this.track.pts[q.index];
          const perp = this.track.perps[q.index];
          const lim = this.track.halfWidth - 0.4;
          const sgn = Math.sign(q.lateral) || 1;
          this.fx.scrape(
            bp.x + perp.x * sgn * lim, bp.z + perp.z * sgn * lim,
            -perp.x * sgn, -perp.z * sgn, s);
        }
        if (car.isPlayer && s > 2) this.audio.thud(Math.min(1, s / 14));
      };
      car.onLap = () => this.handleLap(car);
    }

    // minimap + leaderboard: one entry per car (colors = car neon glow, player 3rd)
    const glowHex = CAR_SPECS.map((s) => '#' + s.glow.toString(16).padStart(6, '0'));
    this.hud.buildMinimap(this.track.pts, glowHex, 2);
    this.hud.buildLeaderboard(['KAITO', 'VEGA', 'YOU', 'NOVA'], glowHex, 2);

    this.postfx = createPostFX(renderer, this.scene, this.camera);
    this.resetGrid();
    this.hud.showStart();
    this.hud.setPauseHandlers(
      () => this.resume(),
      () => this.restart());
    window.addEventListener('keydown', () => this.audio.init());
    window.addEventListener('pointerdown', () => this.audio.init(), { passive: true });
  }

  private gridTransform(i: number): { pos: THREE.Vector3; heading: number; hint: number } {
    const n = this.track.count;
    const back = [12, 20, 28, 36][i];
    const idx = (n - back) % n;
    const p = this.track.pts[idx];
    const t = this.track.tangents[idx];
    const pp = this.track.perps[idx];
    const lat = i % 2 === 0 ? 2.4 : -2.4;
    return {
      pos: new THREE.Vector3(p.x + pp.x * lat, 0, p.z + pp.z * lat),
      heading: Math.atan2(t.x, t.z),
      hint: idx
    };
  }

  private resetGrid(): void {
    this.cars.forEach((car, i) => {
      const g = this.gridTransform(i);
      car.reset(g.pos, g.heading, g.hint);
      car.updateVisual(0);
    });
    this.raceTime = 0;
    this.bestLap = 0;
    this.accum = 0;
    this.lookCur.copy(this.player.pos);
    this.syncCameraToGrid();
  }

  restart(): void {
    this.paused = false; // any restart clears the pause screen
    this.resetGrid();
    this.fx.reset();
    this.hud.resetRace();
    this.state = 'countdown';
    this.countdownT = 3.999;
    this.lastCdNum = 99;
    this.goT = 0;
    this.hud.hidePause();
  }

  /** ESC during racing/countdown: freeze the world behind the pause menu. */
  private pause(): void {
    this.paused = true;
    this.accum = 0; // drop pending fixed steps so resume doesn't fast-forward
    this.hud.showPause();
  }

  private resume(): void {
    this.paused = false;
    this.hud.hidePause();
  }

  private syncCameraToGrid(): void {
    const p = this.player;
    const fwd = this._v1.set(Math.sin(p.heading), 0, Math.cos(p.heading));
    this.camera.position.copy(p.pos).addScaledVector(fwd, -8).add(this._v2.set(0, 3, 0));
    this.lookCur.copy(p.pos).addScaledVector(fwd, 9);
    this.camera.lookAt(this.lookCur);
  }

  private handleLap(car: Car): void {
    if (car.isPlayer) {
      const lt = this.raceTime - car.lapStart;
      car.lapStart = this.raceTime;
      if (car.lap >= 2 && (this.bestLap === 0 || lt < this.bestLap)) this.bestLap = lt;
    }
  }

  private fixedUpdate(dt: number): void {
    if (this.state === 'countdown') {
      this.countdownT -= dt;
      const num = Math.ceil(this.countdownT);
      if (num !== this.lastCdNum && num > 0 && num <= 3) {
        this.lastCdNum = num;
        this.hud.countdown(String(num));
        this.audio.beep(440, 0.15);
      }
      if (this.countdownT <= 0) {
        this.state = 'racing';
        this.raceTime = 0;
        for (const c of this.cars) c.lapStart = 0;
        this.hud.countdown('GO!');
        this.hud.flash();
        this.audio.beep(880, 0.4);
        this.goT = 0.8;
      }
    }
    // fixed-step "GO!" dismissal — deterministic across restarts/pauses
    if (this.goT > 0) {
      this.goT -= dt;
      if (this.goT <= 0) {
        this.goT = 0;
        this.hud.countdown(null);
      }
    }
    if (this.state === 'racing' || this.state === 'finished') this.raceTime += dt;

    // gather inputs
    const inp = this.input;
    this.playerInput.throttle = this.state === 'racing' ? inp.throttle : 0;
    this.playerInput.brake = this.state === 'racing' ? inp.brake : 0;
    this.playerInput.steer = this.state === 'racing' ? inp.steer : 0;
    this.playerInput.handbrake = this.state === 'racing' && inp.handbrake;
    this.playerInput.boost = this.state === 'racing' && inp.boostKey;

    for (const ai of this.ais) ai.update(dt, this.player, this.state, this.cars);
    for (const car of this.cars) {
      const input = car.isPlayer ? this.playerInput : this.aiFor(car).input;
      car.step(dt, input, this.track);
    }
    this.collide();

    // standings
    const order = this.cars.map((_, i) => i).sort((a, b) => this.cars[b].progress - this.cars[a].progress);
    for (let r = 0; r < order.length; r++) this.cars[order[r]].rank = r + 1;

    // finish
    if (this.state === 'racing' && this.player.lap >= LAPS + 1) {
      this.state = 'finished';
      this.finT = 0;
      this.playerFinishPos = this.player.rank;
      this.playerTotalTime = this.raceTime;
      this.hud.showFinish(this.playerFinishPos, this.playerTotalTime, this.bestLap);
      this.audio.beep(660, 0.5);
    }
  }

  private aiFor(car: Car): AIController {
    return this.aiByCar.get(car)!;
  }

  private collide(): void {
    const R = 2.3;
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        const a = this.cars[i];
        const b = this.cars[j];
        const dx = a.pos.x - b.pos.x;
        const dz = a.pos.z - b.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < R * R && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const nz = dz / d;
          const push = (R - d) / 2;
          a.pos.x += nx * push; a.pos.z += nz * push;
          b.pos.x -= nx * push; b.pos.z -= nz * push;
          const rel = (a.vel.x - b.vel.x) * nx + (a.vel.z - b.vel.z) * nz;
          if (rel < 0) {
            const imp = -rel * 0.65;
            a.vel.x += nx * imp; a.vel.z += nz * imp;
            b.vel.x -= nx * imp; b.vel.z -= nz * imp;
            const s = Math.min(1, -rel / 15);
            a.impact = Math.max(a.impact, s * 0.7);
            b.impact = Math.max(b.impact, s * 0.7);
            if ((a.isPlayer || b.isPlayer) && s > 0.06) this.audio.thud(s);
            if (s > 0.05) this.fx.contact((a.pos.x + b.pos.x) / 2, (a.pos.z + b.pos.z) / 2, s);
          }
        }
      }
    }
  }

  /** Per-frame update: input one-shots, fixed-timestep physics, visuals, camera, HUD. */
  update(dtFrame: number): void {
    const inp = this.input;
    inp.poll();
    if (inp.pressed('Escape')) {
      if (this.paused) this.resume();
      else if (this.state === 'racing' || this.state === 'countdown') this.pause();
    }
    if (inp.pressed('Enter') && (this.state === 'attract' || this.state === 'finished')) {
      this.audio.init();
      this.restart();
    }
    if (inp.pressed('KeyR') && this.state !== 'attract') this.restart();
    if (inp.pressed('KeyM')) this.audio.setMuted(!this.audio.muted);

    if (this.paused) {
      // world frozen: no physics, camera, fx or shader time — but keep the
      // HUD synced and the engine audio silent until resume.
      if (inp.pressed('Enter')) this.resume();
      this.hud.tick(dtFrame);
      this.syncHud();
      this.audio.update(0, 0, 0, false, false);
      inp.endFrame();
      return;
    }

    this.accum += dtFrame;
    let iters = 0;
    while (this.accum >= STEP && iters < 6) {
      this.fixedUpdate(STEP);
      this.accum -= STEP;
      iters++;
    }
    if (iters === 6) this.accum = 0;

    for (const c of this.cars) c.updateVisual(dtFrame);

    const shader = this.roadMat.userData.shader as { uniforms: { uTime: { value: number } } } | null;
    if (shader) {
      shader.uniforms.uTime.value = (performance.now() / 1000) % 120;
      this.fx.attachRoad(shader);
    }
    const streamNeon = this.roadMat.userData.streamNeon as ((x: number, z: number) => void) | undefined;
    streamNeon?.(this.camera.position.x, this.camera.position.z);
    this.fx.update(dtFrame, this.cars, this.camera);

    this.updateCamera(dtFrame);
    this.hud.tick(dtFrame);
    this.syncHud();
    this.audio.update(
      this.player.vf, this.player.vlat, this.playerInput.throttle,
      this.player.boostTimer > 0, this.state === 'racing' || this.state === 'finished');
    inp.endFrame();
  }

  private syncHud(): void {
    this.hud.setSpeed(Math.abs(this.player.vf) * 3.6);
    this.hud.setLap(Math.min(this.player.lap + 1, LAPS));
    this.hud.setPosition(this.player.rank);
    this.hud.setBoost(
      this.player.boostTimer > 0 ? this.player.boostTimer / 2.4 : this.player.driftCharge,
      this.player.boostTimer > 0);
    this.hud.setDrift(this.player.drifting && this.state === 'racing');
    this.hud.setTime(this.state === 'finished' ? this.playerTotalTime : this.raceTime);
    this.hud.setBest(this.bestLap);
    for (let i = 0; i < this.cars.length; i++) {
      const p = this.cars[i].pos;
      this.hud.setMinimapDot(i, p.x, p.z);
    }
    // leaderboard: ranks are maintained in fixedUpdate; gap = dist-to-leader
    // over that car's speed (seconds behind), leader flagged as LEAD.
    let leaderProgress = 0;
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i];
      this.hud.setLeaderboardSlot(i, c.rank);
      if (c.rank === 1) leaderProgress = c.progress;
    }
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i];
      if (c.rank === 1) { this.hud.setLeaderboardGap(i, 0, true); continue; }
      this.hud.setLeaderboardGap(i, (leaderProgress - c.progress) / Math.max(Math.abs(c.vf), 15), false);
    }
  }

  private updateCamera(dt: number): void {
    const cam = this.camera;
    if (this.state === 'attract') {
      this.attractT += dt;
      const a = this.attractT * 0.07;
      cam.position.set(Math.cos(a) * 265, 85 + Math.sin(this.attractT * 0.13) * 18, Math.sin(a) * 265);
      cam.lookAt(0, 6, 0);
      if (Math.abs(cam.fov - 62) > 0.01) { cam.fov = 62; cam.updateProjectionMatrix(); }
      return;
    }
    if (this.state === 'finished') {
      this.finT += dt;
      const a = this.finT * 0.45;
      const p = this.player;
      cam.position.set(p.pos.x + Math.cos(a) * 11, 4.2, p.pos.z + Math.sin(a) * 11);
      cam.lookAt(p.pos.x, 0.9, p.pos.z);
      return;
    }

    // spring chase
    const p = this.player;
    const fwd = this._v1.set(Math.sin(p.heading), 0, Math.cos(p.heading));
    const dist = 7.4 + p.vf * 0.055;
    const h = 2.75 + p.vf * 0.013;
    this._v2.copy(p.pos).addScaledVector(fwd, -dist);
    this._v2.y = h;
    cam.position.lerp(this._v2, 1 - Math.exp(-5.2 * dt));
    if (p.impact > 0.01) {
      cam.position.x += (Math.random() - 0.5) * p.impact * 0.5;
      cam.position.y += (Math.random() - 0.5) * p.impact * 0.3;
    }
    this._v3.copy(p.pos).addScaledVector(fwd, 9);
    this._v3.y = 1.1;
    this.lookCur.lerp(this._v3, 1 - Math.exp(-8 * dt));
    cam.lookAt(this.lookCur);

    const fovT = 60 + (Math.min(Math.abs(p.vf), 70) / 70) * 11 + (p.boostTimer > 0 ? 7 : 0);
    if (Math.abs(cam.fov - fovT) > 0.02) {
      cam.fov += (fovT - cam.fov) * Math.min(1, 4 * dt);
      cam.updateProjectionMatrix();
    }
  }

  resize(w: number, h: number): void {
    this.postfx.resize(w, h);
  }

  render(): void {
    this.postfx.composer.render();
  }
}
