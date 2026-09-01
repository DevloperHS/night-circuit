import * as THREE from 'three';
import type { Track, TrackQuery } from '../track/track.js';
import type { CarVisual } from './carFactory.js';
import { SHADOW_DIR } from './carFactory.js';

export interface CarInput {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  boost: boolean;
}

export const ZERO_INPUT: CarInput = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();

export class Car {
  readonly visual: CarVisual;
  readonly isPlayer: boolean;
  aiSkill = 1;

  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  heading = 0;
  steerAngle = 0;
  hint = -1;

  vf = 0;          // forward speed (m/s)
  vlat = 0;        // lateral speed (m/s)
  braking = false;
  drifting = false;
  driftCharge = 0;
  boostTimer = 0;
  impact = 0;      // 0..1, decays; drives fx/shake/audio

  lap = 0;         // completed line crossings
  lapStart = 0;
  halfPassed = false;
  prevIndex = 0;
  progress = 0;
  rank = 1;

  readonly query: TrackQuery = { index: 0, lateral: 0, progress: 0 };

  onBoost?: () => void;
  onLap?: () => void;
  onScrape?: (speed: number) => void;

  constructor(visual: CarVisual, isPlayer: boolean) {
    this.visual = visual;
    this.isPlayer = isPlayer;
  }

  reset(pos: THREE.Vector3, heading: number, hint: number): void {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.heading = heading;
    this.steerAngle = 0;
    this.hint = hint;
    this.vf = 0;
    this.vlat = 0;
    this.braking = false;
    this.drifting = false;
    this.driftCharge = 0;
    this.boostTimer = 0;
    this.impact = 0;
    this.lap = 0;
    this.lapStart = 0;
    this.halfPassed = false;
    this.prevIndex = hint;
    this.rank = 1;
    this.query.index = hint;
    this.query.lateral = 0;
    this.query.progress = 0;
  }

  topSpeed(): number { return this.isPlayer ? 52 : 52 * this.aiSkill; }

  step(dt: number, input: CarInput, track: Track): void {
    const fwd = _fwd.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    const right = _right.set(Math.cos(this.heading), 0, -Math.sin(this.heading));
    let vf = this.vel.dot(fwd);
    let vlat = this.vel.dot(right);

    const boosting = this.boostTimer > 0;
    if (boosting) this.boostTimer = Math.max(0, this.boostTimer - dt);
    const top = boosting ? 70 : this.topSpeed();
    const acc = 23 * (boosting ? 1.85 : 1);

    // engine / brake / reverse
    if (input.throttle > 0) {
      const headroom = 1 - Math.min(Math.abs(vf) / top, 1);
      vf += acc * Math.pow(headroom, 1.1) * dt * (vf < 0 ? 2 : 1);
    }
    this.braking = input.brake > 0 && vf > 0.4;
    if (input.brake > 0) {
      if (vf > 0.4) vf -= 30 * dt;
      else vf = Math.max(vf - 14 * dt, -13);
    }
    // drag + rolling resistance
    vf -= (0.0012 * vf * Math.abs(vf) + 0.18 * vf) * dt;
    // handbrake speed scrub
    if (input.handbrake && Math.abs(vf) > 3) vf -= 7 * dt * Math.sign(vf);

    // steering: speed-sensitive lock, smoothed
    const maxSteer = 0.62 - 0.44 * Math.min(Math.abs(vf) / 55, 1);
    const target = input.steer * maxSteer;
    this.steerAngle += (target - this.steerAngle) * Math.min(1, 6.5 * dt);
    // steer +1 = turn RIGHT on screen (fwd rotates toward -X); positive
    // steerAngle therefore decreases heading. Also makes reverse steering
    // behave like a real car (wheels right + reversing = nose swings left).
    this.heading -= (vf / 2.6) * Math.tan(this.steerAngle) * dt;

    // drift state + lateral grip
    this.drifting = input.handbrake || Math.abs(vlat) > 4.5;
    const grip = this.drifting ? 1.9 : 9.0;
    vlat -= vlat * Math.min(1, grip * dt);
    if (input.handbrake && Math.abs(vf) > 10 && input.steer !== 0) {
      // drift kick: rear slides out, velocity ends up OUTSIDE the turn
      // (vlat is measured along the car's left axis, so a right drift is +)
      vlat += input.steer * 10 * dt * Math.min(Math.abs(vf) / 30, 1);
    }
    vlat = THREE.MathUtils.clamp(vlat, -26, 26);

    // drift charge -> nitro
    if (this.drifting && Math.abs(vf) > 16 && Math.abs(input.steer) > 0.2) {
      this.driftCharge = Math.min(this.driftCharge + dt * 0.85, 1);
    } else if (!this.drifting && !input.handbrake) {
      this.driftCharge = Math.max(0, this.driftCharge - dt * 0.05);
    }
    if (input.boost && this.driftCharge > 0.35 && !boosting) {
      this.boostTimer = 0.9 + 1.5 * this.driftCharge;
      this.driftCharge = 0;
      this.onBoost?.();
    }

    // integrate
    this.vel.copy(fwd).multiplyScalar(vf).addScaledVector(right, vlat);
    this.pos.addScaledVector(this.vel, dt);
    this.vf = vf;
    this.vlat = vlat;

    // barrier collision: clamp to track, reflect outward velocity (bounce)
    track.nearest(this.pos, this.hint, this.query);
    this.hint = this.query.index;
    const lim = track.halfWidth - 0.4;
    if (Math.abs(this.query.lateral) > lim) {
      const p = track.pts[this.query.index];
      const perp = track.perps[this.query.index];
      const s = Math.sign(this.query.lateral);
      this.pos.x = p.x + perp.x * s * lim;
      this.pos.z = p.z + perp.z * s * lim;
      const vn = this.vel.dot(perp);
      if (vn * s > 0) {
        this.vel.addScaledVector(perp, -1.45 * vn);
        this.impact = Math.min(1, Math.abs(vn) / 16);
        this.vel.multiplyScalar(0.965);
        this.onScrape?.(Math.abs(vn));
      }
    }

    // lap / progress bookkeeping
    const n = track.count;
    const prev = this.prevIndex;
    this.prevIndex = this.query.index;
    if (prev > n * 0.75 && this.query.index < n * 0.25) {
      if (this.halfPassed) {
        this.halfPassed = false;
        this.lap++;
        this.onLap?.();
      }
    } else if (prev < n * 0.25 && this.query.index > n * 0.75) {
      this.lap = Math.max(0, this.lap - 1); // reversed across the line
    }
    if (this.query.index > n * 0.45 && this.query.index < n * 0.55) this.halfPassed = true;
    this.progress = this.query.progress + this.lap * track.length;

    this.impact = Math.max(0, this.impact - dt * 2.5);
  }

  /** Per-render-frame visual sync (never called per physics substep). */
  updateVisual(dt: number): void {
    const v = this.visual;
    v.group.position.set(this.pos.x, 0, this.pos.z);
    v.group.rotation.y = this.heading;

    const rollT = THREE.MathUtils.clamp(-this.vlat * 0.014, -0.1, 0.1);
    const accel = dt > 0 ? (this.vf - this.lastVf) / dt : 0;
    this.lastVf = this.vf;
    const pitchT = THREE.MathUtils.clamp(-accel * 0.0022, -0.05, 0.05);
    v.tilt.rotation.z += (rollT - v.tilt.rotation.z) * Math.min(1, 10 * dt);
    v.tilt.rotation.x += (pitchT - v.tilt.rotation.x) * Math.min(1, 8 * dt);
    v.tilt.position.y = this.impact > 0.02 ? Math.sin(this.impact * 34) * this.impact * 0.07 : 0;

    const spin = (this.vf / 0.34) * dt;
    for (const w of v.wheels) w.rotation.x += spin;
    for (const p of v.steerPivots) p.rotation.y = -this.steerAngle * 1.1;

    v.tailMat.emissiveIntensity += ((this.braking ? 7 : 2.2) - v.tailMat.emissiveIntensity) * Math.min(1, 12 * dt);

    const boosting = this.boostTimer > 0;
    for (const f of v.flames) {
      f.visible = boosting;
      if (boosting) {
        f.scale.set(1, 1, 0.7 + Math.random() * 0.9);
        f.rotation.z = (Math.random() - 0.5) * 0.25;
      }
    }
    const glowMat = v.glow.material as THREE.MeshBasicMaterial;
    glowMat.opacity = boosting ? 0.85 : 0.45 + Math.min(0.3, Math.abs(this.vlat) * 0.012);

    // swing the soft cast shadow to the fixed moon direction (world -> local)
    const sa = SHADOW_DIR - this.heading;
    v.shadowCast.position.set(Math.sin(sa) * 2.9, 0.04, Math.cos(sa) * 2.9);
    v.shadowCast.rotation.y = sa;
  }

  lastVf = 0;
}
