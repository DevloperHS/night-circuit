import * as THREE from 'three';
import { wrapAngle } from '../track/track.js';
import type { Track } from '../track/track.js';
import type { Car, CarInput } from '../car/car.js';

export type RacePhase = 'attract' | 'countdown' | 'racing' | 'finished';

export class AIController {
  readonly car: Car;
  readonly track: Track;
  private lane: number;
  private stuckT = 0;
  private avoidCur = 0; // smoothed lateral escape offset (car avoidance)
  readonly input: CarInput = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };

  constructor(car: Car, track: Track, lane: number) {
    this.car = car;
    this.track = track;
    this.lane = lane;
  }

  update(dt: number, player: Car, phase: RacePhase, cars: Car[]): void {
    const car = this.car;
    if (phase !== 'racing' && phase !== 'finished') {
      this.input.throttle = 0;
      this.input.brake = 0;
      this.input.steer = 0;
      this.input.handbrake = false;
      this.input.boost = false;
      return;
    }
    const track = this.track;
    const n = track.count;
    const spm = n / track.length; // samples per meter
    const idx = car.query.index;

    // aim at a lookahead point on a per-AI lane, bent around traffic
    const laM = 9 + car.vf * 0.55;
    const ti = (idx + Math.max(1, Math.round(laM * spm))) % n;
    const tp = track.pts[ti];
    const tpp = track.perps[ti];

    // car avoidance: scan a corridor ahead; sidestep cars inside it
    let avoid = 0;
    let blocked = 0; // 0..1 — how hard a car sits dead ahead
    const fwdX = Math.sin(car.heading);
    const fwdZ = Math.cos(car.heading);
    for (let i = 0; i < cars.length; i++) {
      const other = cars[i];
      if (other === car) continue;
      const dx = other.pos.x - car.pos.x;
      const dz = other.pos.z - car.pos.z;
      const ahead = dx * fwdX + dz * fwdZ; // distance along our heading
      if (ahead <= 0.5 || ahead > 24) continue;
      const side = dx * fwdZ - dz * fwdX; // +: other car to our right
      if (Math.abs(side) > 3.4) continue;
      const w = 1 - ahead / 24;
      avoid += (side >= 0 ? -1 : 1) * w * 4.2;
      if (ahead < 11 && Math.abs(side) < 2.2) {
        blocked = Math.max(blocked, 1 - ahead / 11);
      }
    }
    const lim = track.halfWidth - 1.6;
    avoid = THREE.MathUtils.clamp(avoid, -lim, lim);
    // ease toward the escape lane so steering doesn't snap
    this.avoidCur += (avoid - this.avoidCur) * Math.min(1, 5 * dt);
    const laneT = this.lane + this.avoidCur;
    const tx = tp.x + tpp.x * laneT;
    const tz = tp.z + tpp.z * laneT;

    const desired = Math.atan2(tx - car.pos.x, tz - car.pos.z);
    const err = wrapAngle(desired - car.heading);
    // steer +1 turns heading negative (right); negate the heading error
    this.input.steer = THREE.MathUtils.clamp(-err * 2.4, -1, 1);

    // corner speed from curvature near + far
    const k1 = track.maxCurvature(idx, 30);
    const k2 = track.maxCurvature(idx, 70);
    let vT = Math.min(
      Math.sqrt(31 / Math.max(k1, 1e-4)),
      Math.sqrt(42 / Math.max(k2, 1e-4)) + 6);

    // rubber band: stay close to the player either way
    const gap = player.progress - car.progress; // >0: player ahead
    let band = 1;
    if (gap > 25) band = 1.10;
    else if (gap > 8) band = 1.05;
    else if (gap < -25) band = 0.90;
    else if (gap < -8) band = 0.96;
    vT = Math.min(vT * band, car.topSpeed() * band);

    // ease off when tailgating so we don't ram the car in front every corner
    if (blocked > 0.05) vT = Math.min(vT, Math.max(2, car.vf - 14 * blocked));

    if (car.vf < vT - 1) {
      this.input.throttle = 1;
      this.input.brake = 0;
    } else if (car.vf > vT + 3) {
      this.input.throttle = 0;
      this.input.brake = 1;
    } else {
      this.input.throttle = 0.45;
      this.input.brake = 0;
    }

    // occasional nitro on straights when behind
    if (gap > 15 && k1 < 0.004 && car.boostTimer <= 0 && Math.random() < dt * 0.3) {
      car.boostTimer = 1.0;
    }

    // stuck recovery (reverse out of the barrier)
    if (car.vf < 2 && phase === 'racing') this.stuckT += dt;
    else this.stuckT = 0;
    if (this.stuckT > 2) {
      this.input.brake = 1;
      this.input.throttle = 0;
      // reversing inverts the yaw response, so steer WITH the error here
      this.input.steer = Math.sign(err || 1);
      if (this.stuckT > 3.4) this.stuckT = 0;
    }
  }
}
