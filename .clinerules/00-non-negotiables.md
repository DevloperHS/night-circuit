# Non-negotiable constraints for this repo (always active)

- Vite + Three.js + TypeScript. `npm install && npm run dev` must drop into a race.
- Zero downloaded models/textures/HDRIs/audio. Procedural geometry, canvas/shader
  textures, Web Audio only.
- One closed circuit, one player car, three AI cars, three laps, countdown,
  finish, restart.
- 60 fps desktop Chrome: InstancedMesh for repeated props, no per-frame geometry
  rebuilds, no per-frame allocations in the hot loop.
- Stylized-cinematic art direction: crushed blacks, teal/magenta neon, bloom, wet reflective road as the hero surface. No brown default materials.
- Dependencies: only `three`, `typescript`, `vite`, `@types/three`.
