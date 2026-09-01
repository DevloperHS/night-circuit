import * as THREE from 'three';

export interface NeonLight { pos: THREE.Vector3; color: THREE.Color; intensity: number; }

const MAX = 12; // compile-once shader array size — lights are streamed, not recompiled

/**
 * Wet asphalt: MeshStandardMaterial so real lights (headlights, streetlights)
 * still respond, with injected emissive streaks that mirror neon signs along
 * the view-reflection ray — the classic "wet street" read.
 */
export function createRoadMaterial(lights: NeonLight[]): THREE.MeshStandardMaterial {
  const posArr: THREE.Vector3[] = [];
  const colArr: THREE.Vector3[] = [];
  const intArr: number[] = [];
  const black = new THREE.Vector3(0, -500, 0);
  for (let i = 0; i < MAX; i++) {
    const l = lights[i];
    if (l) {
      posArr.push(l.pos.clone());
      colArr.push(new THREE.Vector3(l.color.r, l.color.g, l.color.b).multiplyScalar(l.intensity));
      intArr.push(1);
    } else {
      posArr.push(black.clone());
      colArr.push(new THREE.Vector3(0, 0, 0));
      intArr.push(0);
    }
  }

  const mat = new THREE.MeshStandardMaterial({ color: 0x0d0f14, roughness: 0.36, metalness: 0.10 });
  mat.defines = { USE_UV: '' };
  mat.userData.shader = null;
  mat.onBeforeCompile = (shader) => {
    mat.userData.shader = shader;
    shader.uniforms.uNeonPos = { value: posArr };
    shader.uniforms.uNeonCol = { value: colArr };
    shader.uniforms.uNeonOn = { value: intArr };
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uPulse = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
      .replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWorldPos;
uniform vec3 uNeonPos[${MAX}];
uniform vec3 uNeonCol[${MAX}];
uniform float uNeonOn[${MAX}];
uniform float uTime;
uniform float uPulse;
float rc_hash(vec2 p){ p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
float rc_noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rc_hash(i), rc_hash(i + vec2(1.0, 0.0)), f.x),
             mix(rc_hash(i + vec2(0.0, 1.0)), rc_hash(i + vec2(1.0, 1.0)), f.x), f.y);
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec3 V = normalize(cameraPosition - vWorldPos);
  // rippled wet normal: mostly up, shimmering slightly over time
  vec2 np = vWorldPos.xz * 0.55 + vec2(uTime * 0.2, uTime * 0.13);
  vec3 Nw = normalize(vec3(rc_noise(np) - 0.5, 6.0, rc_noise(np.yx * 1.37 + 7.0) - 0.5));
  vec3 R = reflect(-V, Nw);
  R.y = abs(R.y) * 0.6 + 0.08; // keep reflections sweeping across the surface
  vec3 streak = vec3(0.0);
  for (int i = 0; i < ${MAX}; i++) {
    if (uNeonOn[i] < 0.5) continue;
    vec3 toL = uNeonPos[i] - vWorldPos;
    float along = dot(toL, R);
    if (along > 0.5) {
      float d = length(toL - R * along);
      streak += uNeonCol[i] / (1.0 + d * d * 0.09);
    }
  }
  streak *= 1.0 + uPulse * 0.55;
  float u = vUv.x;
  float v = vUv.y;
  // asphalt patchiness
  float asphalt = rc_noise(vWorldPos.xz * 2.1) * 0.6 + rc_noise(vWorldPos.xz * 7.7) * 0.4;
  diffuseColor.rgb *= 0.82 + asphalt * 0.36;
  // neon edge lines (teal left, magenta right)
  float edgeT = (1.0 - smoothstep(0.006, 0.030, u));
  float edgeM = smoothstep(0.970, 0.994, u);
  totalEmissiveRadiance += vec3(0.10, 0.95, 0.90) * edgeT * 0.6;
  totalEmissiveRadiance += vec3(1.00, 0.17, 0.84) * edgeM * 0.6;
  // center dashes
  float dash = step(0.5, fract(v)) * (1.0 - smoothstep(0.0022, 0.0048, abs(u - 0.5)));
  totalEmissiveRadiance += vec3(0.75, 0.85, 0.95) * dash * 0.32;
  totalEmissiveRadiance += streak;
  // Fake SSR: mirror the city into the wet asphalt. Windows are anchored to
  // the reflection direction (azimuth x elevation) — stable vertical smears
  // that brighten toward the horizon, exactly how far city lights read on
  // wet tarmac. No hit-point math, so no ripple artifacts.
  {
    float az = atan(R.z, R.x);
    vec2 gp = vec2(az * 28.0, R.y * 22.0);
    vec2 cellId = floor(gp);
    vec2 cellUv = fract(gp);
    float h1 = rc_hash(cellId);
    if (h1 < 0.22) {
      vec2 wq = abs(cellUv - 0.5);
      float win = (1.0 - smoothstep(0.10, 0.34, wq.x)) * (1.0 - smoothstep(0.14, 0.40, wq.y));
      float h2 = rc_hash(cellId + 19.7);
      vec3 wc = h2 < 0.32 ? vec3(0.16, 0.95, 0.90)
              : h2 < 0.62 ? vec3(1.00, 0.17, 0.84)
              : h2 < 0.84 ? vec3(1.00, 0.82, 0.54)
                          : vec3(0.48, 0.84, 1.00);
      float fade = exp(-R.y * 2.4); // far buildings cluster near the horizon
      vec3 mirror = wc * win * fade * (0.18 + 0.32 * rc_noise(cellId * 1.71));
      totalEmissiveRadiance += mirror * (1.0 + uPulse * 0.4);
    }
  }
  // Broad moon sheen — an elongated hotspot along the moon's reflection
  // direction plus a patchy cool dampness tint, so the full lane width
  // (center included) reads wet, not just the strips near the rails.
  vec3 moonDir = normalize(vec3(-120.0, 200.0, -90.0));
  float moon = pow(max(dot(R, moonDir), 0.0), 24.0);
  float damp = 0.6 + 0.4 * rc_noise(vWorldPos.xz * 0.9 + 3.1);
  totalEmissiveRadiance += vec3(0.45, 0.62, 0.80)
    * (moon * 0.55 + 0.05 * damp) * (1.0 + uPulse * 0.25);
}`);
  };

  // Stream the MAX nearest neon lights into the compile-once uniform arrays
  // whenever the camera moves ≥6 m. In-place writes into the existing Vector3
  // objects keep uniform identity stable — no recompiles, no per-frame allocs.
  if (lights.length > MAX) {
    const sel = new Int32Array(MAX);
    const selD2 = new Float64Array(MAX);
    let lastX = NaN;
    let lastZ = NaN;
    mat.userData.streamNeon = (cx: number, cz: number): void => {
      const mdx = cx - lastX;
      const mdz = cz - lastZ;
      if (!Number.isNaN(lastX) && mdx * mdx + mdz * mdz < 36) return;
      lastX = cx;
      lastZ = cz;
      for (let s = 0; s < MAX; s++) { sel[s] = -1; selD2[s] = Infinity; }
      for (let i = 0; i < lights.length; i++) {
        const lp = lights[i].pos;
        const dx = lp.x - cx;
        const dz = lp.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= selD2[MAX - 1]) continue;
        let s = MAX - 1;
        while (s > 0 && selD2[s - 1] > d2) {
          selD2[s] = selD2[s - 1];
          sel[s] = sel[s - 1];
          s--;
        }
        selD2[s] = d2;
        sel[s] = i;
      }
      for (let s = 0; s < MAX; s++) {
        const i = sel[s];
        if (i >= 0) {
          const l = lights[i];
          posArr[s].copy(l.pos);
          colArr[s].set(l.color.r * l.intensity, l.color.g * l.intensity, l.color.b * l.intensity);
          intArr[s] = 1;
        } else {
          posArr[s].set(0, -500, 0);
          colArr[s].set(0, 0, 0);
          intArr[s] = 0;
        }
      }
    };
  }
  return mat;
}
