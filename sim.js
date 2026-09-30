(function (root) {
  'use strict';

  const GRASS = 0, FOREST = 1, ROCK = 2, WATER = 3, HOUSE = 4, BREAK = 5;
  const FLAM = [1.25, 0.8, 0, 0, 0.9, 0];
  const FUEL = [1.8, 6.5, 0, 0, 8, 0];
  const CFG = {
    W: 48, H: 32, RAIN: 60, MAX_CHARGES: 12, REFILL: 1.0,
    BASE: 0.15, WIND_K: 1.6, EMBER_RATE: 0.008, EMBER_IGNITE: 0.4,
    HOUSES: 12, CUT_COST: [1, 2], BURN_COST: 1,
  };
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function valueNoise(rng, W, H, scale) {
    const gw = Math.ceil(W / scale) + 2, gh = Math.ceil(H / scale) + 2;
    const g = new Float32Array(gw * gh).map(() => rng());
    const out = new Float32Array(W * H);
    const sm = (t) => t * t * (3 - 2 * t);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const fx = x / scale, fy = y / scale, ix = fx | 0, iy = fy | 0;
      const tx = sm(fx - ix), ty = sm(fy - iy);
      const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
      out[y * W + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
    return out;
  }

  function createSim(seed) {
    const rng = mulberry32((seed >>> 0) || 1);
    const { W, H } = CFG, N = W * H;
    const type = new Uint8Array(N), st = new Uint8Array(N);
    const fuel = new Float32Array(N), age = new Float32Array(N), inten = new Float32Array(N);
    const heat = new Float32Array(N), heatTmp = new Float32Array(N), tone = new Float32Array(N);
    const burntAt = new Float32Array(N), backburnt = new Uint8Array(N);
    const idx = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? -1 : y * W + x;

    const n1 = valueNoise(rng, W, H, 7), n2 = valueNoise(rng, W, H, 3), n3 = valueNoise(rng, W, H, 4);
    for (let i = 0; i < N; i++) {
      const v = n1[i] * 0.7 + n2[i] * 0.3;
      type[i] = n3[i] > 0.84 ? ROCK : v > 0.55 ? FOREST : GRASS;
      tone[i] = rng();
    }

    const cx0 = Math.floor(W * 0.4 + rng() * W * 0.14), phase = rng() * 6.28;
    const y0 = Math.floor(rng() * H * 0.4), len = Math.floor(H * (0.45 + rng() * 0.2));
    for (let y = y0; y < Math.min(H, y0 + len); y++) {
      const x = Math.round(cx0 + Math.sin(y * 0.22 + phase) * 3);
      for (const xx of [x, x + 1]) { const i = idx(xx, y); if (i >= 0) type[i] = WATER; }
    }

    const vx = W - 9 - Math.floor(rng() * 3), vy = Math.floor(H / 2 + (rng() - 0.5) * 10);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - vx, y - vy), i = y * W + x;
      if (d < 5.8 && type[i] !== WATER) type[i] = GRASS;
    }
    const houses = [];
    for (let tries = 0; houses.length < CFG.HOUSES && tries < 5000; tries++) {
      const x = vx + Math.round((rng() * 2 - 1) * 5), y = vy + Math.round((rng() * 2 - 1) * 5);
      const i = idx(x, y);
      if (i < 0 || Math.hypot(x - vx, y - vy) > 5.3 || type[i] !== GRASS) continue;
      if (houses.some((h) => Math.max(Math.abs(h % W - x), Math.abs(((h / W) | 0) - y)) < 2)) continue;
      houses.push(i); type[i] = HOUSE;
    }

    const s = {
      W, H, N, type, st, fuel, age, inten, heat, tone, burntAt, backburnt, houses, idx,
      t: 0, charges: CFG.MAX_CHARGES, chargeAcc: 0,
      windAngle0: (rng() - 0.5) * 0.5, windSpeed: 1, windAngle: 0,
      shiftAt: 24 + rng() * 10, shiftTo: 0, warned: false, shifted: false,
      embers: [], burning: [], events: [], changed: [],
      result: null, resultAt: 0, raining: false, village: { x: vx, y: vy },
      need: Math.ceil(houses.length / 2),
      stats: { cuts: 0, backburns: 0, spots: 0, burned: 0 },
    };
    s.windAngle = s.windAngle0;
    s.shiftTo = s.windAngle0 + (rng() < 0.5 ? -1 : 1) * (1.0 + rng() * 0.9);
    const ev = (type, data) => s.events.push({ type, data, t: s.t });

    function ignite(i) {
      if (st[i] !== 0 || FLAM[type[i]] <= 0) return false;
      st[i] = 1; age[i] = 0; inten[i] = 0.35;
      fuel[i] = FUEL[type[i]] * (0.8 + rng() * 0.4);
      s.burning.push(i); s.changed.push(i);
      if (type[i] === HOUSE) ev('houseLost', i);
      return true;
    }

    const fy = Math.floor(H / 2 + (rng() - 0.5) * 12);
    for (const [x, y] of [[0, fy - 1], [0, fy], [0, fy + 1], [1, fy], [0, fy + 5 + Math.floor(rng() * 4)]]) {
      const i = idx(x, y); if (i < 0) continue;
      type[i] = GRASS; ignite(i);
    }

    s.housesLost = () => houses.reduce((n, h) => n + (st[h] !== 0 ? 1 : 0), 0);

    s.cut = function (x, y) {
      const i = idx(x, y);
      if (i < 0 || s.result || st[i] !== 0 || (type[i] !== GRASS && type[i] !== FOREST)) return 'invalid';
      const cost = CFG.CUT_COST[type[i]];
      if (s.charges < cost) return 'nocharge';
      s.charges -= cost; type[i] = BREAK; s.stats.cuts++; s.changed.push(i);
      return 'ok';
    };

    s.backburn = function (x, y) {
      const i = idx(x, y);
      if (i < 0 || s.result || s.raining || st[i] !== 0 || FLAM[type[i]] <= 0 || type[i] === HOUSE) return 'invalid';
      if (s.charges < CFG.BURN_COST) return 'nocharge';
      s.charges -= CFG.BURN_COST; backburnt[i] = 1; ignite(i); s.stats.backburns++;
      return 'ok';
    };

    s.costAt = function (x, y, mode) {
      const i = idx(x, y);
      if (i < 0 || st[i] !== 0) return -1;
      if (mode === 'burn') return FLAM[type[i]] > 0 && type[i] !== HOUSE ? CFG.BURN_COST : -1;
      return type[i] === GRASS || type[i] === FOREST ? CFG.CUT_COST[type[i]] : -1;
    };

    s.step = function (dt) {
      s.t += dt;
      if (s.charges < CFG.MAX_CHARGES) {
        s.chargeAcc += dt;
        if (s.chargeAcc >= CFG.REFILL) { s.chargeAcc -= CFG.REFILL; s.charges++; }
      } else s.chargeAcc = 0;

      if (!s.warned && s.t >= s.shiftAt - 5) { s.warned = true; ev('windWarn'); }
      if (s.t >= s.shiftAt) {
        const f = Math.min(1, (s.t - s.shiftAt) / 2.5), e = f * f * (3 - 2 * f);
        s.windAngle = s.windAngle0 + (s.shiftTo - s.windAngle0) * e;
        s.windSpeed = 1 + 0.25 * e;
        if (!s.shifted) { s.shifted = true; ev('windShift'); }
      }
      if (!s.raining && s.t >= CFG.RAIN) { s.raining = true; ev('rain'); }
      const raining = s.raining;

      const wx = Math.cos(s.windAngle), wy = Math.sin(s.windAngle);
      const dirF = DIRS.map(([dx, dy]) => {
        const l = Math.hypot(dx, dy);
        return (l > 1 ? 0.55 : 1) * Math.exp(CFG.WIND_K * s.windSpeed * (dx * wx + dy * wy) / l);
      });

      const newly = [];
      const b = s.burning;
      for (let k = b.length - 1; k >= 0; k--) {
        const i = b[k];
        age[i] += dt; fuel[i] -= dt * (raining ? 5 : 1);
        if (fuel[i] <= 0) {
          st[i] = 2; inten[i] = 0; burntAt[i] = s.t; s.stats.burned++; s.changed.push(i);
          b[k] = b[b.length - 1]; b.pop(); continue;
        }
        const it = inten[i] = Math.min(1, 0.35 + age[i] / 0.8) * Math.min(1, fuel[i] / 1.2);
        if (raining) continue;
        const x = i % W, y = (i / W) | 0;
        for (let d = 0; d < 8; d++) {
          const j = idx(x + DIRS[d][0], y + DIRS[d][1]);
          if (j < 0 || st[j] !== 0) continue;
          const fl = FLAM[type[j]];
          if (fl > 0 && rng() < CFG.BASE * fl * dirF[d] * it * dt) newly.push(j);
        }
        const big = type[i] === FOREST || type[i] === HOUSE ? 2 : 1;
        if (rng() < CFG.EMBER_RATE * it * s.windSpeed * big * dt * 10) {
          const ang = s.windAngle + (rng() + rng() + rng() - 1.5) * 0.6;
          const dist = 1.8 + rng() * rng() * 6.5 * s.windSpeed;
          const x0 = x + 0.5, y0 = y + 0.5;
          s.embers.push({ x0, y0, tx: x0 + Math.cos(ang) * dist, ty: y0 + Math.sin(ang) * dist, t: 0, dur: 0.4 + dist * 0.12 });
        }
      }
      for (const j of newly) ignite(j);

      for (let k = s.embers.length - 1; k >= 0; k--) {
        const e = s.embers[k];
        e.t += dt;
        if (e.t < e.dur) continue;
        s.embers[k] = s.embers[s.embers.length - 1]; s.embers.pop();
        const j = idx(Math.floor(e.tx), Math.floor(e.ty));
        if (!raining && j >= 0 && st[j] === 0 && rng() < CFG.EMBER_IGNITE * FLAM[type[j]]) {
          if (ignite(j)) { s.stats.spots++; ev('spot', j); }
        }
      }

      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        let m = 0;
        if (x > 0) m = Math.max(m, heat[i - 1]);
        if (x < W - 1) m = Math.max(m, heat[i + 1]);
        if (y > 0) m = Math.max(m, heat[i - W]);
        if (y < H - 1) m = Math.max(m, heat[i + W]);
        heatTmp[i] = Math.max(st[i] === 1 ? inten[i] : 0, heat[i] * (raining ? 0.8 : 0.93), m * 0.6);
      }
      heat.set(heatTmp);

      if (!s.result) {
        const lost = s.housesLost();
        if (lost > houses.length - s.need) { s.result = 'lose'; s.resultAt = s.t; ev('lose'); }
        else if (raining) { s.result = 'win'; s.resultAt = s.t; ev('win'); }
      }
    };

    return s;
  }

  // Pick a seed where doing nothing loses, so every map is a real threat.
  function pickSeed(start) {
    let seed = start >>> 0;
    for (let k = 0; k < 12; k++, seed = (seed * 1103515245 + 12345) >>> 0) {
      const s = createSim(seed);
      while (s.t < CFG.RAIN && !s.result) s.step(0.1);
      if (s.result === 'lose') return seed;
    }
    return seed;
  }

  const api = { createSim, pickSeed, CFG, T: { GRASS, FOREST, ROCK, WATER, HOUSE, BREAK }, FLAM };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Backburn = api;
})(typeof window !== 'undefined' ? window : globalThis);
