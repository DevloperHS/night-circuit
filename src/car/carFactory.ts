import * as THREE from 'three';

export interface CarVisual {
  group: THREE.Group;
  tilt: THREE.Group;
  wheels: THREE.Object3D[];
  steerPivots: THREE.Object3D[];
  tailMat: THREE.MeshStandardMaterial;
  glow: THREE.Mesh;
  flames: THREE.Mesh[];
  shadowCast: THREE.Mesh;
}

/** Horizontal direction shadows are cast in (away from the moon light). */
export const SHADOW_DIR = Math.atan2(120, 90); // moon at (-120, 200, -90)

function radialTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export const radialTex = radialTexture();

/** Side profile of the body in (length, height); extruded across the width. */
function bodyGeometry(): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  s.moveTo(-2.1, 0.18);
  s.lineTo(-2.25, 0.45);
  s.lineTo(-2.1, 0.78);
  s.lineTo(-1.35, 0.84);
  s.quadraticCurveTo(-0.9, 1.12, -0.15, 1.14);
  s.quadraticCurveTo(0.5, 1.12, 0.75, 0.88);
  s.lineTo(1.5, 0.74);
  s.quadraticCurveTo(2.05, 0.62, 2.25, 0.42);
  s.lineTo(2.25, 0.26);
  s.lineTo(1.4, 0.14);
  s.lineTo(-2.1, 0.14);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 1.68, steps: 1, bevelEnabled: true,
    bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2
  });
  geo.translate(0, 0, -0.84);
  geo.rotateY(-Math.PI / 2); // profile +x (nose) -> world +z (forward)
  return geo;
}

/** Injects a fresnel rim light + neon ground-bounce into a standard material. */
function rimify(
  mat: THREE.MeshStandardMaterial,
  rimColor: number,
  bounceColor: number | THREE.Color,
  strength = 1
): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: new THREE.Color(rimColor) };
    shader.uniforms.uBounceColor = { value: new THREE.Color(bounceColor) };
    shader.uniforms.uRimStrength = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPosR;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvWorldPosR = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWorldPosR;
uniform vec3 uRimColor;
uniform vec3 uBounceColor;
uniform float uRimStrength;`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
vec3 rimDir = normalize(vViewPosition);
float rimF = pow(1.0 - saturate(dot(normalize(normal), rimDir)), 2.5);
totalEmissiveRadiance += uRimColor * rimF * uRimStrength;
float lowF = smoothstep(0.55, 0.12, vWorldPosR.y);
totalEmissiveRadiance += uBounceColor * lowF * 0.45 * uRimStrength;`
      );
  };
}

export interface CarVisualOpts {
  bodyColor: number;
  glowColor: number;
  isPlayer: boolean;
}

export function createCarVisual(opts: CarVisualOpts): CarVisual {
  const group = new THREE.Group();
  const tilt = new THREE.Group();
  group.add(tilt);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: opts.bodyColor, metalness: 0.75, roughness: 0.3
  });
  // lift the silhouette out of the crush: moonlit rim + neon bounce off the
  // wet road, tinted with this car's underglow color
  rimify(bodyMat, 0x9fc8e8, new THREE.Color(opts.glowColor).multiplyScalar(0.5), 0.55);
  const body = new THREE.Mesh(bodyGeometry(), bodyMat);
  tilt.add(body);

  // glass canopy (faint cabin glow so the roofline isn't a void)
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.34, 1.55),
    new THREE.MeshStandardMaterial({
      color: 0x05070a, metalness: 0.9, roughness: 0.12,
      emissive: 0x0c1826, emissiveIntensity: 1.4
    }));
  glass.position.set(0, 0.94, -0.25);
  tilt.add(glass);

  // rear wing
  const wingMat = new THREE.MeshStandardMaterial({ color: 0x0c0e13, metalness: 0.6, roughness: 0.4 });
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.38), wingMat);
  wing.position.set(0, 1.02, -2.02);
  tilt.add(wing);
  for (const sx of [-0.6, 0.6]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.2), wingMat);
    strut.position.set(sx, 0.88, -2.02);
    tilt.add(strut);
  }

  // tail light bar
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0x140508, emissive: 0xff1744, emissiveIntensity: 2.2, toneMapped: false
  });
  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.09, 0.06), tailMat);
  tail.position.set(0, 0.62, -2.29);
  tilt.add(tail);

  // headlights
  const headMat = new THREE.MeshStandardMaterial({
    color: 0x1a2028, emissive: 0xdff2ff, emissiveIntensity: 4, toneMapped: false
  });
  for (const sx of [-0.55, 0.55]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.06), headMat);
    hl.position.set(sx, 0.5, 2.29);
    tilt.add(hl);
  }

  // wheels: pivots steer, wheel children spin
  const wheels: THREE.Object3D[] = [];
  const steerPivots: THREE.Object3D[] = [];
  const tireGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 18);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.95 });
  const rimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.27, 10);
  rimGeo.rotateZ(Math.PI / 2);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x9fb3c8, metalness: 1, roughness: 0.3 });
  for (const [wx, wz, front] of [[-0.93, 1.42, 1], [0.93, 1.42, 1], [-0.93, -1.42, 0], [0.93, -1.42, 0]] as const) {
    const wheel = new THREE.Group();
    wheel.add(new THREE.Mesh(tireGeo, tireMat));
    wheel.add(new THREE.Mesh(rimGeo, rimMat));
    if (front) {
      const pivot = new THREE.Group();
      pivot.position.set(wx, 0.34, wz);
      pivot.add(wheel);
      tilt.add(pivot);
      steerPivots.push(pivot);
    } else {
      wheel.position.set(wx, 0.34, wz);
      tilt.add(wheel);
    }
    wheels.push(wheel);
  }

  // two-part shadow rig: tight dark contact core + soft cast shadow that the
  // per-frame update swings to the moon direction (no shadow maps needed)
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.5, 5.3),
    new THREE.MeshBasicMaterial({ map: radialTex, color: 0x000000, transparent: true, opacity: 0.62, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.045;
  group.add(shadow);

  const shadowCast = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 9.0),
    new THREE.MeshBasicMaterial({ map: radialTex, color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
  shadowCast.rotation.x = -Math.PI / 2;
  shadowCast.rotation.order = 'YXZ'; // yaw about world-up, then lay flat
  shadowCast.position.y = 0.04;
  shadowCast.renderOrder = 1;
  group.add(shadowCast);

  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 5.2),
    new THREE.MeshBasicMaterial({
      map: radialTex, color: new THREE.Color(opts.glowColor).multiplyScalar(1.4),
      transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false
    }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.05;
  glow.renderOrder = 5;
  group.add(glow);

  // exhaust flames (boost)
  const flames: THREE.Mesh[] = [];
  const flameGeo = new THREE.ConeGeometry(0.1, 0.55, 8);
  flameGeo.rotateX(Math.PI / 2);
  const flameMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.7, 1.6, 2.6), transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
  });
  for (const sx of [-0.38, 0.38]) {
    const f = new THREE.Mesh(flameGeo, flameMat);
    f.position.set(sx, 0.34, -2.42);
    f.visible = false;
    tilt.add(f);
    flames.push(f);
  }

  // real headlight spots (player only)
  if (opts.isPlayer) {
    for (const sx of [-0.55, 0.55]) {
      const spot = new THREE.SpotLight(0xbfdcff, 380, 60, 0.5, 0.65, 1.6);
      spot.position.set(sx, 0.55, 2.3);
      const target = new THREE.Object3D();
      target.position.set(sx * 1.5, 0, 22);
      group.add(target);
      spot.target = target;
      group.add(spot);
      // faint volumetric cone
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(2.1, 15, 12, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0x8fc3ff, transparent: true, opacity: 0.045,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false
        }));
      cone.rotation.x = Math.PI / 2;
      cone.position.set(sx, 0.55, 2.3 + 7.5);
      group.add(cone);
    }
  }

  return { group, tilt, wheels, steerPivots, tailMat, glow, flames, shadowCast };
}
