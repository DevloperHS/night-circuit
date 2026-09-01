# Original Prompt & Cline Workflow Notes

## Part 1 — Original prompt used to generate the project

```
# NIGHT CIRCUIT — Neon Arcade Racer (Three.js) — Cline Task

Before you start (human setup, one time):
- Enable Checkpoints in Cline settings (they're on by default).
- Enable Auto-Approve for file edits, terminal commands, and browser actions so milestones run unattended.
- Keep this task in **Plan mode** for Phase 0. You (the human) toggle to Act when the plan is approved.

## The product
A night-time neon arcade car racer in Three.js at the level of a shipped Ridge Racer /
NFS Underground trailer — not a tutorial demo. Wet black asphalt with sharp reflections,
teal/magenta neon signs, bloom, headlight cones, a low wide sports car with a readable
silhouette, spring chase camera. Everything on screen is designed: car, track, barriers,
skyline, HUD, headlights.

## Non-negotiable constraints
- Vite + Three.js + TypeScript. `npm install && npm run dev` drops you into a race.
- Zero downloaded models, textures, HDRIs, or audio. Procedural geometry, canvas/shader
  textures, Web Audio only.
- One closed city circuit, one player car, three AI cars, three laps, countdown,
  finish screen, restart.
- Locked 60fps in desktop Chrome. InstancedMesh for repeated props. No per-frame
  geometry rebuilds, no per-frame allocations in the hot loop.
- Real game feel: throttle/brake/steer, drift with a short boost, collisions that bounce
  instead of teleport, rubber-band AI that stays close.
- Art direction: stylized-cinematic, not PBR mush. Crushed blacks, neon accents, bloom,
  light shafts, wet reflective road as the hero surface. No brown default materials.

## Phase 0 — Plan (Plan mode)
1. Use `/deep-planning` for the full architecture.
2. Fan out **subagents** (parallel, read-only) to research in parallel: Three.js post-
   processing (UnrealBloomPass) setup, reflective surface techniques that hit 60fps
   without Reflector rendering the scene twice, instancing strategies for city props,
   arcade car physics patterns (raycast-free, fixed-timestep), and Web Audio synth
   engine sounds. Synthesize their findings into the plan.
3. Deliver `PLAN.md`: module layout (`src/core`, `src/track`, `src/car`, `src/ai`,
   `src/fx`, `src/ui`), the milestone breakdown below, a fixed-timestep game loop
   design, and a performance budget (draw calls, triangle count, passes).
4. STOP. Wait for me to review PLAN.md and toggle to Act mode.

## The Gauntlet — 5 milestones (Act mode)
Invoke with the `/gauntlet` workflow (see `.clinerules/workflows/gauntlet.md`):
`/gauntlet 1`, then `/gauntlet 2`, etc.

Before Milestone 1, take a checkpoint. Take a checkpoint at the start of every milestone.
Each milestone must end runnable:

1. **Wet road + camera fly** — closed circuit on dark asphalt, a reflective road shader
   or SSR-lite pass that reads as wet, an orbital/fly camera proving the circuit reads
   at night. Commit to the black/teal/magenta palette now, not later.
2. **Player car, weighty handling** — low wide procedurally built car, fixed-timestep
   physics, throttle/brake/steer, drift + short boost, bouncy collisions with barriers,
   spring chase camera. Must *feel* like mass, not a hovercraft.
3. **Neon city dressing** — instanced buildings, neon sign planes with emissive canvas
   textures, light shafts, skyline silhouette layer, barrier arms. Skybox/gradient done
   with shaders. Every repeated prop is instanced.
4. **Race** — 3 AI cars with rubber-band pacing, checkpointed lap logic, 3 laps,
   countdown, position tracking, finish screen, restart. HUD: speed, lap, position,
   drift-boost meter — designed like an NFS Underground HUD, not default DOM text.
5. **Polish pass** — bloom tuned, headlight cones actually lighting the road, emissive
   taillights, road reflection sharpened, audio (Web Audio synth engine, tire, boost),
   one visual QC sweep of every screen.

### Per-milestone Gauntlet rules (enforced every milestone)
- **Build**: implement the milestone in Act mode.
- **Verify like a machine**: run `npx tsc --noEmit` and `npm run build`; fix all errors.
- **The blind critic**: start `npm run dev` in the background, then use the browser
  tool to open the running game and take screenshots from multiple camera angles
  (chase view, track-level, corner apex, cockpit-height). Judge ONLY what the
  screenshots show against a night NFS/Ridge Racer frame — never against "it works."
- **Reject as a tutorial** if you see: unlit default materials, brown/gray mush, roads
  with no reflection, a boxy car, no bloom, dead black sky, stock browser UI text,
  visible fps dips (report `performance.now()` frame-time deltas over a simulated lap).
- **Iterate bounded**: if the critic rejects, fix and re-screenshot — **max 3
  critique cycles per milestone**. After 3, restore the best checkpoint, keep the best
  version, note the remaining debt in `DEBT.md`, and move on. Ship a playable race
  first; polish beats perfection.
- **Report and stop** after each milestone: what shipped, screenshots judged, critic
  verdict, fps numbers, any debt. End the turn — do not start the next milestone
  unprompted. I reply "next" to continue, or restore a checkpoint if needed.

## Milestone 5 ends the run
Do not continue past Milestone 5. Final deliverables:
- Working repo where `npm install && npm run dev` starts a race.
- `README.md`: one-command run instructions and a controls table
  (arrows/WASD = drive, Space = handbrake/drift, Shift = boost, R = restart, Esc = pause).
- `DEBT.md` with anything the critic would still reject.

## Standing rules (also in .clinerules — obey without re-reading this prompt)
- No new npm packages beyond `three` and `typescript` unless PLAN.md lists them.
- Never write into the chat what a screenshot can show — show, don't tell.
- If a change would push frame time over budget, profile first, cut detail second.

```

## Part 2 — Changes made for the Cline workflow

Since cline don't have /loops and /goal, needed to perform the following to adapt the gaunlet loop for cline.

- Added `.clinerules/00-non-negotiables.md` so repo constraints survive every session and compaction.
- Added `.clinerules/workflows/gauntlet.md` defining the blind-critic screenshot judging loop (read → judge → write verdict to disk → PASS/REJECT, ≤3 fix cycles).
- Added `scripts/screenshot.mjs` (Puppeteer devDependency) to boot the game headlessly, drive it via synthetic key events, and capture the 7 gauntlet frames into `shots/`.
- Added `scripts/perf.mjs`, a headless rAF-delta frame-time probe (`URL`/`SAMPLE_MS` env-configurable) used as a correctness smoke test.
- Added `shots/CRITIC.md` — incremental, on-disk blind-critic verdict so judgments survive context compaction (written immediately after each frame read).
- Added `DEBT.md` to log residual polish items, known trade-offs, and the SwiftShader perf caveat instead of leaving them unwritten.
- Added `PLAN.md` documenting module layout, fixed-timestep loop design, draw-call/perf budget, and feel targets.
- Added `puppeteer` as a devDependency (capture tooling only; never bundled — production deps remain `three` + build toolchain).
- Captured and verified 7 screenshots (`shots/01-attract.png` … `07-drift.png`) plus a 12 s frame-time sample as evidence artifacts.
- Delivered the final gauntlet report with an honest, caveated verdict (PASS + residuals), superseding an earlier premature "run complete" claim.

