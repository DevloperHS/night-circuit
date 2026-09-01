# PLAN — Night Circuit

## Stack
Vite + TypeScript + three@0.169 (bundled via npm). No assets, no audio files, no HDRIs.

## Module layout
```
src/
  main.ts              entry: renderer, resize, animation loop
  core/input.ts        keyboard state + one-shot presses
  core/game.ts         state machine (attract→countdown→racing→finished),
                       fixed-timestep loop, collisions, standings, camera
  track/track.ts       closed Catmull-Rom circuit, 1024 samples, road ribbon
                       geometry, instanced barriers, windowed nearest-point queries,
                       curvature field (AI + lap logic)
  track/roadMaterial.ts  wet asphalt: MeshStandardMaterial + onBeforeCompile
                       (view-ray neon streak reflections, asphalt noise, edge
                       neon lines, center dashes) — keeps real spotlight response
  city/city.ts         instanced buildings (emissive canvas windows), neon signs
                       (canvas text, overdriven for bloom), light shafts, street
                       lights, start gantry, skyline silhouettes, beacons
  city/sky.ts          shader sky dome: teal-black gradient, horizon band, stars
  car/carFactory.ts    procedural car: extruded side-profile body, glass canopy,
                       wing, light bar, wheels+steer pivots, underglow, flames,
                       player-only SpotLight headlights + volumetric cones
  car/car.ts           arcade physics: fixed 120 Hz, grip/drift model, nitro from
                       drift charge, bouncy barrier + car-car collisions, lap logic
  ai/ai.ts             lookahead steering on lanes, curvature-based target speed,
                       rubber-band pacing, stuck recovery, opportunistic nitro
  fx/postfx.ts         EffectComposer: RenderPass → UnrealBloomPass → OutputPass
  ui/hud.ts            DOM HUD (speed, lap, position, nitro meter, countdown,
                       finish screen) — neon-styled, no libraries
  audio/audio.ts       Web Audio synth: engine (saw+square→lowpass, gear steps),
                       tire rumble, skid hiss, nitro whoosh, impact thuds, beeps
```

## Game loop design
- `requestAnimationFrame` accumulates real dt (clamped 100 ms), fixed physics step
  1/120 s, max 6 substeps/frame (spiral-of-death guard).
- Physics is allocation-free in the hot loop: module-scope scratch vectors, reused
  query structs, windowed (O(65)) nearest-sample search with per-car hints.
- Visual-only updates (tilt, wheels, flames, camera) run once per rendered frame.

## Performance budget (desktop Chrome, 1080p)
- Draw calls ≈ 120 total: 4 cars × ~20 meshes + ~40 city/track (city props instanced:
  buildings, barriers, stripes, poles, heads, skyline, beacons).
- Triangles ≈ 220k worst case; post: bloom (1 pass) + output pass.
- Per-frame JS: 4 cars × ~13 floats of math + 6 pairwise collision tests. No
  geometry rebuilds, no per-frame allocations.

## Feel targets
- Top speed 52 m/s (187 km/h), nitro 70 m/s; 0–100 km/h ≈ 1.6 s.
- Drift: handbrake or >4.5 m/s lateral slip; drift charges nitro (Shift to fire).
- Camera: exponential spring (k≈5.2), look-ahead target, FOV 60→78 with speed/nitro.
- AI rubber band: +10% target speed when >25 m behind player, −10% when >25 m ahead.
