# /gauntlet <milestone 1..5> — build → verify → blind critic → bounded iterate

Run exactly one milestone per invocation. Time-box: max 3 critique cycles.

Milestones:
1. Wet road + camera fly — circuit reads at night, palette committed.
2. Player car — weighty handling, drift+boost, bouncy collisions, spring camera.
3. Neon city dressing — instanced props, emissive canvas signs, light shafts.
4. Race — 3 AI (rubber-band), lap logic, 3 laps, countdown/finish/restart, HUD.
5. Polish — bloom, headlights on road, taillights, Web Audio, final QC.

Loop:
1. Take a checkpoint.
2. Implement the milestone.
3. Verify: `npx tsc --noEmit` and `npm run build` — fix all errors.
4. Blind critic: run `npm run dev` in the background, open the game with the browser tool, screenshot chase view / track level / corner apex. Judge ONLY the pixels against a night NFS/Ridge Racer frame.
5. Reject as "tutorial" on: unlit default materials, brown/gray mush, non-wet road, boxy car, no bloom, dead sky, stock UI text, frame drops.
6. If rejected: fix, re-screenshot. After 3 rejections: restore the best checkpoint, log remaining debt in DEBT.md, move on.
7. Report and STOP. Never start the next milestone unprompted.

Milestone 5 is the end of the run. Deliverables: runnable repo, README with
`npm run dev` + controls table, DEBT.md.
