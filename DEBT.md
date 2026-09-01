# DEBT — what the blind critic would still flag

- DONE (Task 3): city now mirrors in the wet road via analytic azimuth-grid
  window streaks on the reflection ray (fake SSR) — buildings, not just the 12
  neon lights, read in the asphalt. Still not true SSR; hit-point artifacts
  (ring smears) were fixed by anchoring windows to reflection direction.
- DONE (Task 2): per-instance window UV density — instance scale rescales the
  emissive UVs in-shader (windows ~3.2 m / floors ~3.4 m) + per-building hash
  offset; rebuilt window texture as clean 4x8 tile. No more stretched windows.
- DONE (Task 4): moon-direction shadows without shadow maps — tight dark
  contact core (grounds the car) + soft elongated cast plane swung per-frame
  to SHADOW_DIR (fixed world azimuth from the moon light), heading-compensated
  so all four cars cast consistently regardless of orientation. Still an
  analytic rig, not shadow maps; no per-frame allocations.
- DONE (Task 5): car bodies no longer read as pure-black blobs — `rimify()`
  shader hook (`onBeforeCompile`, MeshStandardMaterial profile kept) injects a
  fresnel rim (cool moonlit 0x9fc8e8) + neon ground-bounce tinted with the
  car's underglow color near world-Y low band; glass canopy got a faint cabin
  emissive (0x0c1826 @ 1.4) so the roofline isn't a void. Strength 0.55 tuned
  over 3 critic passes on fresh captures: rim edge visible on roofline/haunches
  in all shots, no blown bloom hotspots from the rim (bloom sources remain
  light bars/rails), no banding/streaking artifacts. All shader-side: compile-
  once per body material (4 total), zero per-frame JS cost, no new deps.
- DONE (residual — AI avoidance): AI cars now scan a 24 m corridor ahead each
  fixed step and blend a lateral escape offset into their lane target (smoothed
  at 5/s, clamped inside the barriers), plus a throttle lift when a car sits
  dead ahead (speed eases toward the car in front instead of ramming it into
  every corner). Allocation-free (loop over the 4-car array, scalars only);
  `AIController.update` gained a `cars` param, call site updated. Verified on
  fresh captures: rivals run nose-to-tail through corners without locking up.
- DONE (residual — "GO!" dismissal): the 0.8 s "GO!" lifetime is now `goT`,
  decremented in `fixedUpdate` (same clock as the countdown) and cleared in
  `restart()`. No `setTimeout` anywhere in the game loop; verified on captures
  — GO! visible at 0.62 s race time, gone by 1.32 s, every restart.
- DONE (residual — gamepad + touch): `Input.poll()` runs each frame and merges
  gamepad state into the existing key model — left stick steer with 0.14
  deadzone (analog, keyboard still wins when held), RT/LT analog throttle and
  brake, A/B/X/Y and d-pad as virtual keys (edge-triggered), Start → Enter,
  pad-unplug releases held keys. Touch devices (pointer: coarse) get an overlay
  (◀ ▶ / GAS·BRK·NITRO) injected from `input.ts` that injects virtual key codes;
  any tap doubles as Enter (only consumed on attract/finished, so mid-race taps
  are harmless). Pointerdown also unlocks Web Audio on mobile. Not verified on
  real hardware (no gamepad/touch device in this env) — logic is typechecked
  and the desktop path is regression-verified on fresh captures.
- DONE (residual — MAX=12 road lights): the shader still compiles once with
  fixed MAX=12 uniform arrays, but `roadMaterial.ts` now attaches a
  `streamNeon(x, z)` closure that rewrites those arrays in-place with the 12
  nearest neon lights (insertion-select over the light list, throttled to runs
  only after the camera moves ≥6 m). `game.ts` calls it per frame with the
  camera position — no shader recompiles, no per-frame allocations, uniform
  object identity preserved. Wet-road reflections now track the lights nearest
  the viewer everywhere on the circuit.
- DONE (residual — hot rail bloom): bloom strength 0.85 → 0.70, threshold
  0.55 → 0.60 (postfx.ts). Three critic passes on fresh captures: rail cores
  keep teal/magenta hue instead of blooming to a white bar; the brightest
  near-camera rail still has a hot core, which reads as intentional neon, not
  blowout. Center-lane reflectivity unchanged by this fix (see the FIXED
  center-lane entry below).
- DONE (residual — GPU perf profiling): added an in-page perf overlay
  (`main.ts`, toggle **P**): EMA frame time + FPS + draw calls / triangles /
  device pixel ratio, for real-GPU profiling on desktop Chrome. Honest status:
  this repo has only been run under headless SwiftShader here, which cannot
  verify 60 fps. Procedure to close it out: `npm run dev` on a real desktop
  Chrome machine → press **P** → check ≥ 60 FPS / ≤ 16.7 ms with the overlay
  during a full 3-lap race (rails + city + rain visible); Chrome Task Manager
  or `chrome://tracing` / DevTools Performance panel (GPU track) for deeper
  attribution if the overlay shows drops.
- DONE (Task 1): Skid marks (instanced ring-buffer, velocity-aligned), pooled
  spark particles on scrapes/contacts, camera-locked rain streaks, and a 112 BPM
  pulse synced into sign/shaft/streetlight materials + road neon streaks.
- (fixed above) Countdown "GO!" is driven by the fixed-step clock, not setTimeout.
- (fixed above) Gamepad + touch inputs supported; keyboard unchanged.
- (fixed above) Road shader still compiles once with MAX=12, but the 12 nearest
  lights are now streamed into the uniform arrays by proximity.

## From blind-critic verdict (shots/CRITIC.md) — PASS, residual polish
- FIXED (bloom residual): dialled to strength 0.70 / threshold 0.60 — see
  DONE entry above; verified over three critic passes on fresh captures.
- FIXED (center-lane reflectivity): road shader adds a broad moon sheen —
  elongated hotspot along the moon's reflection direction (moon at
  (-120, 200, -90), same key light as the analytic shadows) + patchy damp tint
  from low-frequency noise, so the center lane reads wet, not just the rail
  strips. roughness 0.42 → 0.36 / metalness 0.05 → 0.10 lets real streetlight
  and headlight speculars stretch further inboard; fake-SSR city mirror
  brightened (0.12→0.18 base, fade exp(-R.y·3.2) → exp(-R.y·2.4)). Compile-once
  shader edit, no per-frame cost; sheen peak ≈ 0.44 stays under bloom threshold 0.60.
- FIXED (Task 5): car bodies read as pure-black blobs — fresnel rim + neon
  ground-bounce + cabin emissive added (see DONE Task 5 above).

- FIXED (flipped steering — user-reported): A/D and ←/→ drove the car the
  wrong way. Root cause: `car.ts` integrated `heading += (vf/2.6)·tan(steer)`
  while the car's `right` vector was actually its left in the right-handed
  Y-up world (fwd = +Z ⇒ +X = left), so steer +1 rotated the nose toward
  screen-left. Fixed the physics sign (`heading -= ...`), which also makes
  reverse steering realistic (wheels right + reversing = nose swings left),
  and flipped the three consumers that were self-consistent with the old
  convention: handbrake drift kick (`vlat += +steer·...`, slip now correctly
  lands OUTSIDE the turn), front-wheel visual pivots (`rotation.y =
  -steerAngle·1.1`), and the AI steer mapping (`ai.ts`: `steer = -err·2.4`;
  stuck-recovery reverses to `steer = +sign(err)` because reversing inverts
  yaw response). fx skid strength / audio skid gain use `Math.abs(vlat)` —
  sign-agnostic; gamepad/touch feed the same steer model so they are fixed
  automatically. Verified: `tsc --noEmit` clean; numeric harness
  (esbuild-bundled real `Car`/`Track`/`AIController`, 120 Hz): D ⇒ dHeading
  −0.88 rad, A ⇒ +0.88 rad, right-drift ⇒ vlat +1.49, AI laps 607 m in 20 s
  within barriers — all PASS; fresh full-race captures show D steering right
  on screen (04-corner) and A tracking the left curve (06-corner2).
- FIXED (screenshot rig timing): headless SwiftShader renders below 60 fps and
  `dt` is clamped, so game time dilates vs the wall clock and fixed sleeps
  landed mid-countdown. `scripts/screenshot.mjs` now polls the HUD race timer
  via `page.evaluate` and schedules all driving inputs/captures in race time —
  dilation-proof. Puppeteer restored as an explicit devDependency (capture
  tooling only, never bundled); Chrome binaries were already cached locally.

## Open polish (critic pass 2 — car-UI focus, non-blocking)
- Rail-light bloom ~15–20% hot in corner frames; dial UnrealBloom strength or rail
  emissive down slightly.
- Boost center-lane wet-road reflectivity so the road reads wet everywhere, not just
  near rails.
- Car-UI dashboard (speed gauge / nitro cluster / position delta / DRIFT tag) shipped;
  ▲/▼ flash and magenta boost skin not capturable headlessly — eyeball on real GPU.

## Perf evidence
- `scripts/screenshot.mjs` full-race run after the residual fixes: zero page
  errors (only the pre-existing favicon 404); 7 fresh captures reviewed over
  3 critic passes.
- `scripts/perf.mjs` (headless rAF-delta probe): two post-fix attempts both
  hit a 30 s navigation timeout (headless env flake; the same page loads and
  races fine via screenshot.mjs). Prior passing run: 44 frames / 12 s, avg
  275 ms, p95 417 ms — SwiftShader software GL, i.e. correctness smoke only,
  NOT a 60 fps verification. Real-GPU desktop Chrome profiling still owed;
  use the in-page overlay (press **P**) per the procedure documented above.
