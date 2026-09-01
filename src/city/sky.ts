import * as THREE from 'three';

/** Night sky dome: deep teal-black gradient, neon horizon band, sparse stars. */
export function createSky(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(1400, 24, 12);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vP;
      void main() {
        vP = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vP;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vP);
        float h = clamp(d.y, -0.1, 1.0);
        vec3 col = mix(vec3(0.030, 0.012, 0.048), vec3(0.004, 0.007, 0.016), smoothstep(0.0, 0.45, h));
        float band = exp(-abs(d.y) * 20.0) * smoothstep(-0.25, 0.05, d.y);
        col += vec3(0.55, 0.08, 0.50) * band * 0.38;
        col += vec3(0.0, 0.35, 0.42) * exp(-abs(d.y + 0.02) * 30.0) * 0.28;
        vec2 sp = d.xz / (d.y + 0.55) * 90.0;
        float st = step(0.9975, hash(floor(sp))) * smoothstep(0.08, 0.4, d.y);
        col += vec3(st * (0.4 + 0.6 * hash(floor(sp) + 7.0)) * 0.55);
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}
