# Backburn

Static, dependency-free browser game.

- Run: `python3 -m http.server 8765` then open http://localhost:8765/
- `sim.js`: pure simulation (no DOM), also loadable in Node via `require('./sim.js')` for balance testing.
  Tuning knobs live in `CFG` (spread `BASE`, `WIND_K`, `EMBER_RATE`, crew `MAX_CHARGES`/`REFILL`).
- `game.js`: rendering, HUD, input. `index.html`: layout/CSS.
- Balance target (30 seeds, `node /tmp/bbtest.js none|ring`-style harness): with no input the village is
  lost in ~75% of runs, first house hit ~20-28s; a naive firebreak ring wins ~2/3.
  `pickSeed` rejects maps where doing nothing survives.
- Syntax check: `node --check game.js && node --check sim.js`
