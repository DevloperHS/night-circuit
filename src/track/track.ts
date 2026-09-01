import * as THREE from 'three';

export interface TrackQuery { index: number; lateral: number; progress: number; }

const CONTROL: Array<[number, number]> = [
  [0, -150], [85, -152], [150, -115], [178, -55], [152, 5], [185, 62],
  [150, 122], [70, 152], [-30, 146], [-95, 100], [-62, 40], [-128, 10],
  [-170, -55], [-130, -120], [-65, -160],
];

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class Track {
  readonly count = 1024;
  readonly halfWidth = 7;
  readonly pts: THREE.Vector3[] = [];
  readonly tangents: THREE.Vector3[] = [];
  readonly perps: THREE.Vector3[] = [];
  readonly curvature: Float32Array;
  readonly cum: Float32Array; // length count+1, cumulative arc distance
  readonly length: number;

  private _q: TrackQuery = { index: 0, lateral: 0, progress: 0 };

  constructor() {
    const curve = new THREE.CatmullRomCurve3(
      CONTROL.map((p) => new THREE.Vector3(p[0], 0, p[1])), true, 'catmullrom', 0.5);
    const spaced = curve.getSpacedPoints(this.count); // count+1 points, last == first
    const n = this.count;
    for (let i = 0; i < n; i++) this.pts.push(spaced[i]);
    for (let i = 0; i < n; i++) {
      const a = this.pts[(i - 1 + n) % n];
      const b = this.pts[(i + 1) % n];
      const t = new THREE.Vector3().subVectors(b, a).setY(0).normalize();
      this.tangents.push(t);
      this.perps.push(new THREE.Vector3(-t.z, 0, t.x)); // left normal
    }
    this.cum = new Float32Array(n + 1);
    for (let i = 1; i <= n; i++) {
      this.cum[i] = this.cum[i - 1] + this.pts[i % n].distanceTo(this.pts[i - 1]);
    }
    this.length = this.cum[n];

    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t0 = this.tangents[(i - 2 + n) % n];
      const t1 = this.tangents[(i + 2) % n];
      const ang = Math.abs(wrapAngle(Math.atan2(t1.x, t1.z) - Math.atan2(t0.x, t0.z)));
      const ds = this.pts[(i + 2) % n].distanceTo(this.pts[(i - 2 + n) % n]);
      raw[i] = ang / Math.max(ds, 0.5);
    }
    this.curvature = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = -3; j <= 3; j++) s += raw[(i + j + n) % n];
      this.curvature[i] = s / 7;
    }
  }

  /** Nearest sample lookup with a windowed hint (O(65)); hint=-1 does a full scan. */
  nearest(pos: THREE.Vector3, hint: number, out: TrackQuery = this._q): TrackQuery {
    const n = this.count;
    let best = 0;
    let bestD = Infinity;
    if (hint >= 0) {
      for (let j = -32; j <= 32; j++) {
        const i = (hint + j + n) % n;
        const p = this.pts[i];
        const d = (pos.x - p.x) * (pos.x - p.x) + (pos.z - p.z) * (pos.z - p.z);
        if (d < bestD) { bestD = d; best = i; }
      }
    } else {
      for (let i = 0; i < n; i++) {
        const p = this.pts[i];
        const d = (pos.x - p.x) * (pos.x - p.x) + (pos.z - p.z) * (pos.z - p.z);
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    const p = this.pts[best];
    const pp = this.perps[best];
    const t = this.tangents[best];
    const dx = pos.x - p.x;
    const dz = pos.z - p.z;
    out.index = best;
    out.lateral = dx * pp.x + dz * pp.z;
    out.progress = this.cum[best] + (dx * t.x + dz * t.z);
    return out;
  }

  /** Max curvature within `meters` ahead of sample index `from`. */
  maxCurvature(from: number, meters: number): number {
    const n = this.count;
    const steps = Math.max(1, Math.round(meters * (n / this.length)));
    let m = 0;
    for (let j = 0; j <= steps; j += 3) {
      const k = this.curvature[(from + j) % n];
      if (k > m) m = k;
    }
    return m;
  }

  buildRoad(material: THREE.Material): THREE.Mesh {
    const n = this.count;
    const hw = this.halfWidth;
    const positions = new Float32Array(n * 2 * 3);
    const normals = new Float32Array(n * 2 * 3);
    const uvs = new Float32Array(n * 2 * 2);
    const indices = new Uint32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const p = this.pts[i];
      const pp = this.perps[i];
      const o = i * 6;
      positions[o] = p.x + pp.x * hw; positions[o + 1] = 0.02; positions[o + 2] = p.z + pp.z * hw;
      positions[o + 3] = p.x - pp.x * hw; positions[o + 4] = 0.02; positions[o + 5] = p.z - pp.z * hw;
      normals[o + 1] = 1; normals[o + 4] = 1;
      const uo = i * 4;
      const v = this.cum[i] / 6;
      uvs[uo] = 0; uvs[uo + 1] = v;
      uvs[uo + 2] = 1; uvs[uo + 3] = v;
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = i * 2, b = a + 1, c = j * 2, d = c + 1;
      const o = i * 6;
      indices[o] = a; indices[o + 1] = c; indices[o + 2] = b;
      indices[o + 3] = b; indices[o + 4] = c; indices[o + 5] = d;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    return mesh;
  }

  buildBarriers(scene: THREE.Scene): void {
    const n = this.count;
    const hw = this.halfWidth;
    const stepM = 5.5;
    const step = Math.max(1, Math.round(stepM * (n / this.length)));
    const slots = Math.floor(n / step);
    const count = slots * 2;
    const dummy = new THREE.Object3D();

    const wallGeo = new THREE.BoxGeometry(0.4, 1.0, stepM + 0.55);
    wallGeo.translate(0, 0.5, 0);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x14171d, roughness: 0.65, metalness: 0.15 });
    const walls = new THREE.InstancedMesh(wallGeo, wallMat, count);

    const stripeGeo = new THREE.BoxGeometry(0.44, 0.14, stepM + 0.55);
    stripeGeo.translate(0, 1.06, 0);
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const stripes = new THREE.InstancedMesh(stripeGeo, stripeMat, count);

    const teal = new THREE.Color(0.3, 2.4, 2.2);
    const mag = new THREE.Color(2.6, 0.42, 2.1);
    let k = 0;
    for (let s = 0; s < slots; s++) {
      const i = (s * step) % n;
      const p = this.pts[i];
      const pp = this.perps[i];
      const t = this.tangents[i];
      dummy.rotation.set(0, Math.atan2(t.x, t.z), 0);
      for (let side = 0; side < 2; side++) {
        const sgn = side === 0 ? 1 : -1;
        dummy.position.set(p.x + pp.x * sgn * (hw + 0.9), 0, p.z + pp.z * sgn * (hw + 0.9));
        dummy.updateMatrix();
        walls.setMatrixAt(k, dummy.matrix);
        stripes.setMatrixAt(k, dummy.matrix);
        stripes.setColorAt(k, (s % 8) < 4 ? teal : mag);
        k++;
      }
    }
    walls.instanceMatrix.needsUpdate = true;
    stripes.instanceMatrix.needsUpdate = true;
    if (stripes.instanceColor) stripes.instanceColor.needsUpdate = true;
    scene.add(walls, stripes);
  }
}
