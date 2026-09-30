(function () {
  'use strict';
  const { createSim, pickSeed, CFG, T } = window.Backburn;
  const $ = (id) => document.getElementById(id);
  const cv = $('game'), ctx = cv.getContext('2d');
  const compass = $('compass'), cctx = compass.getContext('2d');
  const terrain = document.createElement('canvas'), tctx = terrain.getContext('2d');

  let sim, seed, cs = 16, dpr = 1, state = 'title', paused = false, mode = 'cut';
  let acc = 0, last = performance.now(), now = 0, shake = 0, endShown = false;
  let hover = null, stroke = null, toastLog = {};
  const smoke = [], sparks = [], streaks = [], drops = [];

  // ---------- sprites ----------
  function makeGlow(inner, mid) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, inner); gr.addColorStop(0.35, mid); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c;
  }
  const GLOW = makeGlow('rgba(255,210,120,0.9)', 'rgba(255,90,10,0.35)');
  const GLOW_SOFT = makeGlow('rgba(255,120,30,0.45)', 'rgba(255,60,0,0.12)');

  // ---------- setup ----------
  function newGame(s) {
    seed = s;
    sim = createSim(seed);
    acc = 0; endShown = false; shake = 0; toastLog = {};
    smoke.length = sparks.length = drops.length = 0;
    $('toast').innerHTML = '';
    buildHouseIcons();
    resize();
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const stage = $('stage').getBoundingClientRect();
    cs = Math.max(6, Math.floor(Math.min((stage.width - 16) / CFG.W, (stage.height - 12) / CFG.H)));
    const w = CFG.W * cs, h = CFG.H * cs;
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    cv.width = terrain.width = Math.round(w * dpr); cv.height = terrain.height = Math.round(h * dpr);
    if (sim) { for (let i = 0; i < sim.N; i++) drawCell(i); sim.changed.length = 0; }
  }

  // ---------- terrain cache ----------
  function hash(i, k) { let h = (i * 374761393 + k * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

  function drawCell(i) {
    const s = sim, x = (i % s.W) * cs * dpr, y = ((i / s.W) | 0) * cs * dpr, c = cs * dpr;
    const ty = s.type[i], st = s.st[i], tn = s.tone[i], g = tctx;
    const rect = (col) => { g.fillStyle = col; g.fillRect(x, y, c + 0.5, c + 0.5); };
    const dot = (px, py, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(x + px * c, y + py * c, r * c, 0, 7); g.fill(); };

    if (st === 2) {
      rect(`hsl(20,8%,${8 + tn * 5}%)`);
      for (let k = 0; k < 4; k++) dot(hash(i, k), hash(i, k + 9), 0.05 + hash(i, k + 3) * 0.05, `rgba(120,110,100,${0.25 + hash(i, k + 5) * 0.3})`);
      if (ty === T.HOUSE) {
        g.fillStyle = '#1a1210'; g.fillRect(x + c * 0.15, y + c * 0.35, c * 0.7, c * 0.55);
        g.strokeStyle = '#3a2a22'; g.lineWidth = c * 0.08; g.beginPath();
        g.moveTo(x + c * 0.2, y + c * 0.9); g.lineTo(x + c * 0.2, y + c * 0.4); g.lineTo(x + c * 0.45, y + c * 0.55);
        g.moveTo(x + c * 0.8, y + c * 0.9); g.lineTo(x + c * 0.8, y + c * 0.5); g.stroke();
      }
      return;
    }
    if (st === 1) { rect(`hsl(12,45%,${10 + tn * 4}%)`); return; }

    switch (ty) {
      case T.GRASS: {
        rect(`hsl(${78 + tn * 14},${38 + tn * 10}%,${33 + tn * 7}%)`);
        g.strokeStyle = `hsla(${70 + tn * 20},50%,${48 + tn * 10}%,.55)`; g.lineWidth = Math.max(1, c * 0.05);
        g.beginPath();
        for (let k = 0; k < 3; k++) { const px = x + hash(i, k) * c, py = y + (0.4 + hash(i, k + 4) * 0.55) * c; g.moveTo(px, py); g.lineTo(px + c * 0.05, py - c * 0.22); }
        g.stroke(); break;
      }
      case T.FOREST: {
        rect(`hsl(${105 + tn * 10},35%,${16 + tn * 4}%)`);
        for (let k = 0; k < 3; k++) {
          const px = 0.22 + hash(i, k) * 0.56, py = 0.22 + hash(i, k + 7) * 0.56, r = 0.2 + hash(i, k + 2) * 0.12;
          dot(px + 0.04, py + 0.05, r, 'rgba(0,0,0,.3)');
          dot(px, py, r, `hsl(${120 + hash(i, k + 5) * 25},${35 + tn * 15}%,${20 + hash(i, k + 8) * 10}%)`);
          dot(px - r * 0.3, py - r * 0.3, r * 0.45, `hsla(${100 + tn * 20},45%,40%,.35)`);
        }
        break;
      }
      case T.ROCK:
        rect(`hsl(${75 + tn * 10},25%,${28 + tn * 5}%)`);
        dot(0.52, 0.56, 0.36, `hsl(30,6%,${30 + tn * 8}%)`);
        dot(0.44, 0.46, 0.26, `hsl(30,6%,${44 + tn * 10}%)`);
        break;
      case T.WATER: rect(`hsl(${200 + tn * 10},50%,${27 + tn * 5}%)`); break;
      case T.BREAK: {
        rect(`hsl(28,${30 + tn * 10}%,${24 + tn * 5}%)`);
        g.strokeStyle = 'rgba(40,22,10,.55)'; g.lineWidth = Math.max(1, c * 0.07); g.beginPath();
        for (let k = 1; k < 4; k++) { g.moveTo(x + c * 0.1, y + (k / 4) * c); g.lineTo(x + c * 0.9, y + (k / 4) * c + c * 0.05); }
        g.stroke(); break;
      }
      case T.HOUSE: {
        rect(`hsl(${85 + tn * 10},35%,${36 + tn * 5}%)`);
        g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x + c * 0.2, y + c * 0.5, c * 0.72, c * 0.45);
        g.fillStyle = '#e9d6b5'; g.fillRect(x + c * 0.15, y + c * 0.45, c * 0.7, c * 0.45);
        g.fillStyle = `hsl(${4 + tn * 20},55%,${36 + tn * 8}%)`; g.beginPath();
        g.moveTo(x + c * 0.05, y + c * 0.5); g.lineTo(x + c * 0.5, y + c * 0.1); g.lineTo(x + c * 0.95, y + c * 0.5); g.fill();
        g.fillStyle = '#ffd37a'; g.fillRect(x + c * 0.42, y + c * 0.6, c * 0.16, c * 0.16);
        break;
      }
    }
  }

  // ---------- HUD ----------
  function buildHouseIcons() {
    const box = $('houseIcons'); box.innerHTML = '';
    sim.houses.forEach(() => { const d = document.createElement('div'); d.className = 'hi'; box.appendChild(d); });
    $('needMark').textContent = 'need ' + sim.need;
    const pips = $('pips'); pips.innerHTML = '';
    for (let k = 0; k < CFG.MAX_CHARGES; k++) { const p = document.createElement('div'); p.className = 'pip'; p.appendChild(document.createElement('i')); pips.appendChild(p); }
  }

  function updateHud() {
    const s = sim, left = Math.max(0, CFG.RAIN - s.t);
    $('rainSecs').textContent = Math.ceil(left);
    $('rainFill').style.width = Math.min(100, (s.t / CFG.RAIN) * 100) + '%';
    const icons = $('houseIcons').children; let lost = 0;
    s.houses.forEach((h, k) => { const l = s.st[h] !== 0; lost += l; icons[k].classList.toggle('lost', l); });
    $('houseCount').textContent = s.houses.length - lost;
    const pips = $('pips').children;
    for (let k = 0; k < pips.length; k++) {
      pips[k].classList.toggle('full', k < s.charges);
      pips[k].firstChild.style.width = (k === s.charges ? (s.chargeAcc / CFG.REFILL) * 100 : 0) + '%';
    }
    drawCompass();
  }

  function arrow(g, ang, len, col, dash) {
    g.save(); g.translate(48, 48); g.rotate(ang);
    g.strokeStyle = g.fillStyle = col; g.lineWidth = 5; g.setLineDash(dash ? [7, 6] : []);
    g.beginPath(); g.moveTo(-len, 0); g.lineTo(len - 10, 0); g.stroke(); g.setLineDash([]);
    g.beginPath(); g.moveTo(len + 2, 0); g.lineTo(len - 14, -10); g.lineTo(len - 14, 10); g.fill();
    g.restore();
  }
  function drawCompass() {
    const s = sim, g = cctx; g.clearRect(0, 0, 96, 96);
    g.strokeStyle = '#4a3426'; g.lineWidth = 3; g.beginPath(); g.arc(48, 48, 44, 0, 7); g.stroke();
    if (s.warned && !s.shifted) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 10);
      arrow(g, s.shiftTo, 32, `rgba(255,179,71,${0.4 + pulse * 0.6})`, true);
    }
    arrow(g, s.windAngle, 32, '#f3e6d8', false);
  }

  function toast(msg, cls = '', life = 2.6, key) {
    if (key) { if (toastLog[key] && now - toastLog[key] < 6) return; toastLog[key] = now; }
    const el = document.createElement('div'); el.className = 't ' + cls; el.textContent = msg;
    el.style.setProperty('--life', life + 's');
    $('toast').appendChild(el); setTimeout(() => el.remove(), (life + 0.5) * 1000);
  }

  function handleEvents() {
    const s = sim;
    for (const e of s.events) {
      if (e.type === 'windWarn') toast('Wind is about to shift \u2014 watch the compass', 'warn', 4);
      else if (e.type === 'windShift') toast('The wind has turned!', 'warn', 2.6);
      else if (e.type === 'spot') toast('Spot fire! Embers jumped the line', 'bad', 2, 'spot');
      else if (e.type === 'houseLost') { shake = 0.5; const l = s.housesLost(); toast(`A home is burning (${l}/${s.houses.length} lost)`, 'bad', 2.4); }
      else if (e.type === 'rain') toast('Rain!', 'good', 3);
    }
    s.events.length = 0;
    if (s.t > 7 && s.stats.backburns === 0 && !toastLog.tip) {
      toastLog.tip = now; toast('Psst \u2014 you can start fires. Hold / right-click to light a backburn.', 'warn', 5);
    }
  }

  // ---------- rendering ----------
  function render(dt) {
    const s = sim, c = cs * dpr, W = s.W, H = s.H;
    for (const i of s.changed) drawCell(i);
    s.changed.length = 0;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (shake > 0) { shake -= dt; const m = shake * 6 * dpr; ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m); }
    ctx.drawImage(terrain, 0, 0);

    const rainK = Math.max(0, Math.min(1, (s.t - (CFG.RAIN - 6)) / 6));

    // water shimmer + heat tint
    for (let i = 0; i < s.N; i++) {
      const x = (i % W) * c, y = ((i / W) | 0) * c, h = s.heat[i];
      if (s.type[i] === T.WATER) {
        const a = 0.08 + 0.08 * Math.sin(now * 2 + (i % W) * 0.7 + ((i / W) | 0) * 0.4);
        ctx.fillStyle = `rgba(180,220,255,${a})`; ctx.fillRect(x, y + c * 0.3, c, c * 0.12);
        if (h > 0.05) { ctx.fillStyle = `rgba(255,120,40,${h * 0.25})`; ctx.fillRect(x, y, c, c); }
      } else if (s.st[i] === 0 && h > 0.04) {
        ctx.fillStyle = `rgba(255,${70 + (1 - h) * 60},10,${Math.min(0.5, h * 0.45)})`; ctx.fillRect(x, y, c, c);
      }
    }

    // flames
    const wx = Math.cos(s.windAngle), wy = Math.sin(s.windAngle);
    for (const i of s.burning) {
      const x = (i % W) * c, y = ((i / W) | 0) * c, it = s.inten[i];
      const f = 0.75 + 0.25 * Math.sin(now * 17 + i * 1.7) * Math.sin(now * 7.3 + i);
      const k = it * f;
      ctx.fillStyle = `rgb(${120 + k * 135 | 0},${20 + k * 90 | 0},${k * 10 | 0})`; ctx.fillRect(x, y, c + 0.5, c + 0.5);
      const big = s.type[i] === T.FOREST || s.type[i] === T.HOUSE ? 1.25 : 1;
      const r = c * 0.32 * (0.6 + k * 0.6) * big;
      const cx = x + c * 0.5 + wx * c * 0.12 * f, cy = y + c * 0.5 + wy * c * 0.12 * f;
      ctx.fillStyle = `rgba(255,${190 + k * 60 | 0},${80 + k * 80 | 0},${0.55 + k * 0.4})`;
      ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 1.15, s.windAngle, 0, 7); ctx.fill();
      if (s.type[i] === T.HOUSE) {
        ctx.fillStyle = 'rgba(40,10,0,.8)';
        ctx.beginPath(); ctx.moveTo(x + c * 0.1, y + c * 0.55); ctx.lineTo(x + c * 0.5, y + c * 0.2); ctx.lineTo(x + c * 0.9, y + c * 0.55); ctx.fill();
      }
      if (Math.random() < 0.04 * it) smoke.push({ x: x / c + 0.5, y: y / c + 0.5, r: 0.4, a: 0.22 + Math.random() * 0.1, life: 0, max: 2.5 + Math.random() * 2 });
      if (Math.random() < 0.05 * it) sparks.push({ x: x / c + Math.random(), y: y / c + Math.random(), vx: wx * 1.5 + (Math.random() - 0.5), vy: wy * 1.5 - 1 - Math.random(), life: 0, max: 0.5 + Math.random() * 0.6 });
    }

    // smoke
    for (let k = smoke.length - 1; k >= 0; k--) {
      const p = smoke[k]; p.life += dt;
      if (p.life > p.max || smoke.length > 400) { smoke[k] = smoke[smoke.length - 1]; smoke.pop(); continue; }
      p.x += wx * 1.4 * s.windSpeed * dt; p.y += (wy * 1.4 * s.windSpeed - 0.25) * dt; p.r += 0.5 * dt;
      const a = p.a * Math.sin(Math.PI * p.life / p.max);
      ctx.fillStyle = `rgba(40,34,30,${a})`; ctx.beginPath(); ctx.arc(p.x * c, p.y * c, p.r * c, 0, 7); ctx.fill();
    }

    // wind streaks
    if (streaks.length < 26 && Math.random() < 0.3) streaks.push({ x: Math.random() * W, y: Math.random() * H, life: 0, max: 1.2 + Math.random() });
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = Math.max(1, c * 0.06);
    ctx.beginPath();
    for (let k = streaks.length - 1; k >= 0; k--) {
      const p = streaks[k]; p.life += dt;
      if (p.life > p.max) { streaks[k] = streaks[streaks.length - 1]; streaks.pop(); continue; }
      p.x += wx * 5 * s.windSpeed * dt; p.y += wy * 5 * s.windSpeed * dt;
      ctx.moveTo(p.x * c, p.y * c); ctx.lineTo((p.x - wx * 1.5) * c, (p.y - wy * 1.5) * c);
    }
    ctx.stroke();

    // additive glow pass
    ctx.globalCompositeOperation = 'lighter';
    for (const i of s.burning) {
      const it = s.inten[i], f = 0.8 + 0.2 * Math.sin(now * 13 + i * 2.1);
      const sz = c * (1.8 + it * 1.8) * f * (s.type[i] === T.HOUSE ? 1.5 : 1);
      ctx.globalAlpha = 0.55 * it;
      ctx.drawImage(GLOW_SOFT, (i % W + 0.5) * c - sz, (((i / W) | 0) + 0.5) * c - sz, sz * 2, sz * 2);
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < s.N; i++) {
      if (s.st[i] !== 2) continue;
      const age = s.t - s.burntAt[i];
      if (age > 8) continue;
      const k = (1 - age / 8) * (0.5 + 0.5 * Math.sin(now * 5 + i * 3.3));
      ctx.fillStyle = `rgba(255,${90 + k * 60 | 0},20,${k * 0.6})`;
      const x = (i % W) * c, y = ((i / W) | 0) * c;
      ctx.fillRect(x + hash(i, 1) * c * 0.7, y + hash(i, 2) * c * 0.7, c * 0.18, c * 0.18);
      ctx.fillRect(x + hash(i, 3) * c * 0.7, y + hash(i, 4) * c * 0.7, c * 0.12, c * 0.12);
    }
    for (let k = sparks.length - 1; k >= 0; k--) {
      const p = sparks[k]; p.life += dt;
      if (p.life > p.max || sparks.length > 400) { sparks[k] = sparks[sparks.length - 1]; sparks.pop(); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const a = 1 - p.life / p.max;
      ctx.fillStyle = `rgba(255,${160 + a * 80 | 0},60,${a})`; ctx.fillRect(p.x * c, p.y * c, c * 0.1, c * 0.1);
    }
    for (const e of s.embers) {
      const f = e.t / e.dur, x = e.x0 + (e.tx - e.x0) * f, y = e.y0 + (e.ty - e.y0) * f - Math.sin(Math.PI * f) * 1.3;
      const sz = c * (0.9 + Math.sin(now * 30 + e.x0) * 0.2);
      ctx.drawImage(GLOW, x * c - sz / 2, y * c - sz / 2, sz, sz);
      ctx.fillStyle = '#fff2c0'; ctx.fillRect(x * c - c * 0.07, y * c - c * 0.07, c * 0.14, c * 0.14);
    }
    ctx.globalCompositeOperation = 'source-over';

    // threatened homes
    for (const h of s.houses) {
      if (s.st[h] !== 0 || s.heat[h] < 0.2) continue;
      const x = (h % W) * c, y = ((h / W) | 0) * c;
      ctx.strokeStyle = `rgba(255,80,30,${0.4 + 0.4 * Math.sin(now * 12)})`; ctx.lineWidth = Math.max(1, c * 0.1);
      ctx.strokeRect(x + 1, y + 1, c - 2, c - 2);
    }

    // rain
    if (rainK > 0) {
      ctx.fillStyle = `rgba(20,30,50,${rainK * 0.35})`; ctx.fillRect(0, 0, cv.width, cv.height);
    }
    if (s.raining) {
      while (drops.length < 260) drops.push({ x: Math.random() * W * 1.2, y: Math.random() * -H, v: 25 + Math.random() * 15 });
      ctx.strokeStyle = 'rgba(170,200,255,0.45)'; ctx.lineWidth = Math.max(1, c * 0.05); ctx.beginPath();
      for (const d of drops) {
        d.y += d.v * dt; d.x += wx * 4 * dt;
        if (d.y > H) { d.y = -Math.random() * 4; d.x = Math.random() * W * 1.2 - W * 0.1; }
        ctx.moveTo(d.x * c, d.y * c); ctx.lineTo((d.x - wx * 0.2) * c, (d.y - 0.9) * c);
      }
      ctx.stroke();
    }

    // cursor
    if (hover && state === 'play' && !s.result) {
      const m = stroke && stroke.mode ? stroke.mode : currentMode(), cost = s.costAt(hover.x, hover.y, m);
      const x = hover.x * c, y = hover.y * c;
      ctx.lineWidth = Math.max(1, 2 * dpr);
      ctx.strokeStyle = cost < 0 ? 'rgba(255,60,40,.7)' : cost > s.charges ? 'rgba(255,170,60,.5)' : m === 'burn' ? '#ffb347' : '#f3e6d8';
      ctx.strokeRect(x + 1, y + 1, c - 2, c - 2);
      if (cost > 0 && c > 14) {
        ctx.fillStyle = ctx.strokeStyle; ctx.font = `bold ${Math.round(c * 0.4)}px system-ui`;
        ctx.fillText((m === 'burn' ? '\u{1F525}' : '') + cost, x + c + 2, y + c * 0.4);
      }
    }
    if (stroke && !stroke.mode && stroke.touch) {
      const f = Math.min(1, (performance.now() - stroke.start) / HOLD_MS);
      const x = (stroke.cell.x + 0.5) * c, y = (stroke.cell.y + 0.5) * c;
      ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 3 * dpr;
      ctx.beginPath(); ctx.arc(x, y, c * 1.2, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); ctx.stroke();
    }

    if (paused) {
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = '#f3e6d8'; ctx.font = `bold ${28 * dpr}px system-ui`; ctx.textAlign = 'center';
      ctx.fillText('Paused', cv.width / 2, cv.height / 2); ctx.textAlign = 'start';
    }
  }

  // ---------- input ----------
  const HOLD_MS = 380;
  const currentMode = () => mode;
  function cellAt(e) {
    const r = cv.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / cs), y = Math.floor((e.clientY - r.top) / cs);
    return x >= 0 && y >= 0 && x < CFG.W && y < CFG.H ? { x, y } : null;
  }
  function act(cell, m) {
    if (!cell || state !== 'play' || paused) return;
    const r = m === 'burn' ? sim.backburn(cell.x, cell.y) : sim.cut(cell.x, cell.y);
    if (r === 'nocharge') { const p = $('pips'); p.classList.remove('flash'); void p.offsetWidth; p.classList.add('flash'); }
    else if (r === 'ok') {
      for (let k = 0; k < (m === 'burn' ? 10 : 5); k++) {
        sparks.push({ x: cell.x + 0.5, y: cell.y + 0.5, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4 - 1, life: 0, max: 0.3 + Math.random() * 0.4 });
      }
      if (m === 'burn' && sim.stats.backburns === 1) toast('Same rule, your fire. Let it eat toward the front.', 'warn', 3.5);
    }
  }
  function line(a, b, m) {
    let x0 = a.x, y0 = a.y; const dx = Math.abs(b.x - x0), dy = -Math.abs(b.y - y0), sx = x0 < b.x ? 1 : -1, sy = y0 < b.y ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (x0 !== a.x || y0 !== a.y) act({ x: x0, y: y0 }, m);
      if (x0 === b.x && y0 === b.y) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerdown', (e) => {
    const cell = cellAt(e); if (!cell) return;
    cv.setPointerCapture(e.pointerId);
    const touch = e.pointerType !== 'mouse';
    stroke = { id: e.pointerId, cell, last: cell, touch, start: performance.now(), mode: null };
    if (!touch || mode === 'burn') {
      stroke.mode = e.button === 2 || e.shiftKey || mode === 'burn' ? 'burn' : 'cut';
      act(cell, stroke.mode);
    } else {
      stroke.timer = setTimeout(() => {
        if (stroke && !stroke.mode) { stroke.mode = 'burn'; act(stroke.cell, 'burn'); if (navigator.vibrate) navigator.vibrate(15); }
      }, HOLD_MS);
    }
    hover = cell;
  });
  cv.addEventListener('pointermove', (e) => {
    const cell = cellAt(e); hover = cell;
    if (!stroke || e.pointerId !== stroke.id || !cell) return;
    if (!stroke.mode) {
      if (cell.x === stroke.cell.x && cell.y === stroke.cell.y) return;
      clearTimeout(stroke.timer); stroke.mode = 'cut'; act(stroke.cell, 'cut');
    }
    if (cell.x !== stroke.last.x || cell.y !== stroke.last.y) { line(stroke.last, cell, stroke.mode); stroke.last = cell; }
  });
  const endStroke = (e) => {
    if (!stroke || e.pointerId !== stroke.id) return;
    clearTimeout(stroke.timer);
    if (!stroke.mode) act(stroke.cell, 'cut');
    stroke = null;
    if (e.pointerType !== 'mouse') hover = null;
  };
  cv.addEventListener('pointerup', endStroke);
  cv.addEventListener('pointercancel', endStroke);
  cv.addEventListener('pointerleave', () => { if (!stroke) hover = null; });

  function setMode(m) {
    mode = m;
    document.querySelectorAll('.mode').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  }
  document.querySelectorAll('.mode').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); if (state === 'play' && !sim.result) paused = !paused; }
    else if (e.key === 'b' || e.key === 'B' || e.key === 'Tab') { e.preventDefault(); setMode(mode === 'cut' ? 'burn' : 'cut'); }
    else if (e.key === 'r' || e.key === 'R') start(true);
    else if (e.key === 'Enter' && state !== 'play') start(state === 'end' ? false : true);
  });
  window.addEventListener('resize', resize);

  // ---------- flow ----------
  function start(fresh) {
    newGame(fresh ? pickSeed((Math.random() * 2 ** 32) >>> 0) : seed);
    state = 'play'; paused = false;
    $('title').classList.add('hidden'); $('end').classList.add('hidden');
  }
  $('startBtn').onclick = () => start(true);
  $('retryBtn').onclick = () => start(false);
  $('newBtn').onclick = () => start(true);

  function showEnd() {
    const s = sim, saved = s.houses.length - s.housesLost(), win = s.result === 'win';
    $('endTitle').textContent = win ? 'The rain came.' : 'The village is lost.';
    $('endTitle').style.color = win ? '#bcd9ff' : '#ff8a5a';
    $('endLine').textContent = win
      ? (saved === s.houses.length ? 'Every home still standing. The fire ate only what you let it.' : `${saved} of ${s.houses.length} homes stand in the steam.`)
      : `The front reached the homes with ${Math.ceil(CFG.RAIN - s.resultAt)}s left before the rain.`;
    $('endStats').innerHTML = `Homes saved: <b>${saved}/${s.houses.length}</b><br>Firebreaks cut: ${s.stats.cuts} &middot; Backburns lit: ${s.stats.backburns} &middot; Spot fires: ${s.stats.spots}<br>Land burned: ${Math.round(100 * s.stats.burned / s.N)}%`;
    $('end').classList.remove('hidden');
    state = 'end';
  }

  function frame(t) {
    const dt = Math.min(0.1, (t - last) / 1000); last = t; now = t / 1000;
    if (sim && (state === 'play' || state === 'end') && !paused) {
      acc += dt;
      while (acc >= 0.1) { acc -= 0.1; if (sim.t < CFG.RAIN + 12) sim.step(0.1); }
      handleEvents();
      if (sim.result && !endShown && sim.t - sim.resultAt > (sim.result === 'win' ? 3 : 2)) { endShown = true; showEnd(); }
    }
    if (sim) { render(paused ? 0 : dt); updateHud(); }
    requestAnimationFrame(frame);
  }

  // Idle background: a demo map burning behind the title screen.
  newGame(pickSeed(1234567));
  state = 'title';
  (function demo() { if (state === 'title') { sim.step(0.1); sim.events.length = 0; setTimeout(demo, 100); } })();
  requestAnimationFrame(frame);
})();
