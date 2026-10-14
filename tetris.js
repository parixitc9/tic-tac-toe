/* Tetris: SRS rotation with wall kicks, 7-bag, ghost, hold, lock delay. Solo or 2-player pass & play. */
'use strict';

const Tetris = (() => {
  const COLS = 10, ROWS = 22, HIDDEN = 2, VIS = ROWS - HIDDEN;
  const LOCK_DELAY = 0.5, MAX_RESETS = 15, CLEAR_TIME = 0.24, DAS = 0.16, ARR = 0.05;
  const COLORS = { I: '#4CB8E8', O: '#F0C24B', T: '#A070E0', S: '#4FC48A', Z: '#EE5E5E', J: '#4F7DF0', L: '#F39A4B' };
  const SHAPES = {
    I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    O: [[1,1],[1,1]],
    T: [[0,1,0],[1,1,1],[0,0,0]],
    S: [[0,1,1],[1,1,0],[0,0,0]],
    Z: [[1,1,0],[0,1,1],[0,0,0]],
    J: [[1,0,0],[1,1,1],[0,0,0]],
    L: [[0,0,1],[1,1,1],[0,0,0]],
  };
  // SRS kick tables (x right, y up), keyed "from>to".
  const K_JLSTZ = {
    '0>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]], '1>0': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    '1>2': [[0,0],[1,0],[1,-1],[0,2],[1,2]],     '2>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    '2>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],    '3>2': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    '3>0': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],  '0>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  };
  const K_I = {
    '0>1': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],   '1>0': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
    '1>2': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],   '2>1': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
    '2>3': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],   '3>2': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    '3>0': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],   '0>3': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
  };
  const rotCW = m => m.map((row, y) => row.map((_, x) => m[m.length - 1 - x][y]));
  const ROT = {};
  for (const t of Object.keys(SHAPES)) {
    ROT[t] = [];
    let m = SHAPES[t];
    for (let r = 0; r < 4; r++) {
      const cells = [];
      m.forEach((row, y) => row.forEach((v, x) => { if (v) cells.push([x, y]); }));
      ROT[t].push(cells);
      m = rotCW(m);
    }
  }
  const gravity = lvl => Math.pow(Math.max(0.05, 0.8 - (lvl - 1) * 0.007), lvl - 1);
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  /* ---------- DOM ---------- */
  const boardCv = $('#t-board'), holdCv = $('#t-hold'), nextCv = $('#t-next');
  const overlay = $('#t-overlay'), panel = $('#t-panel'), holdBox = $('#t-hold-box');
  let bctx, hctx, nctx, cell = 24, mini = 14;
  let theme = { board: '#E9E8E3', grid: '#DFDDD7', flash: '#FFFFFF' };

  /* ---------- State ---------- */
  let G = null;
  let session = { mode: 'solo', startLevel: 1, player: 1, results: [] };
  let raf = 0, last = 0;
  const rep = { dir: 0, t: 0, charged: false };

  function newGame() {
    G = {
      grid: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
      bag: [], queue: [], piece: null, hold: null, holdUsed: false,
      score: 0, lines: 0, level: session.startLevel,
      acc: 0, lockT: 0, resets: 0, lowest: 0, soft: false,
      clearing: null, over: false, paused: false, sideDirty: true,
    };
    fillQueue(); spawn();
  }
  function fillQueue() {
    while (G.queue.length < 5) {
      if (!G.bag.length) G.bag = shuffle(['I', 'O', 'T', 'S', 'Z', 'J', 'L']);
      G.queue.push(G.bag.pop());
    }
  }
  function collides(type, rot, x, y) {
    for (const [cx, cy] of ROT[type][rot]) {
      const X = x + cx, Y = y + cy;
      if (X < 0 || X >= COLS || Y >= ROWS) return true;
      if (Y >= 0 && G.grid[Y][X]) return true;
    }
    return false;
  }
  function spawn(type) {
    const t = type || G.queue.shift();
    fillQueue();
    G.piece = { type: t, rot: 0, x: t === 'O' ? 4 : 3, y: 0 };
    G.acc = 0; G.lockT = 0; G.resets = 0; G.sideDirty = true;
    if (collides(t, 0, G.piece.x, G.piece.y)) { G.piece = null; return gameOver(); }
    if (!collides(t, 0, G.piece.x, 1)) G.piece.y = 1;
    G.lowest = G.piece.y;
  }
  const grounded = () => G.piece && collides(G.piece.type, G.piece.rot, G.piece.x, G.piece.y + 1);
  function touched() { if (G.resets < MAX_RESETS) { G.lockT = 0; G.resets++; } }
  function reachedLower() {
    if (G.piece.y > G.lowest) { G.lowest = G.piece.y; G.resets = 0; G.lockT = 0; return true; }
    return false;
  }
  function move(dx, dy) {
    const p = G.piece;
    if (!p || collides(p.type, p.rot, p.x + dx, p.y + dy)) return false;
    p.x += dx; p.y += dy;
    if (!reachedLower() && dx) touched();
    return true;
  }
  function rotate(dir) {
    const p = G.piece;
    if (!p || p.type === 'O') return false;
    const to = (p.rot + dir + 4) % 4;
    const kicks = (p.type === 'I' ? K_I : K_JLSTZ)[p.rot + '>' + to];
    for (const [kx, ky] of kicks) {
      if (!collides(p.type, to, p.x + kx, p.y - ky)) {
        p.x += kx; p.y -= ky; p.rot = to;
        if (!reachedLower()) touched();
        Sound.play('rotate');
        return true;
      }
    }
    return false;
  }
  function ghostY() {
    const p = G.piece; let y = p.y;
    while (!collides(p.type, p.rot, p.x, y + 1)) y++;
    return y;
  }
  function hardDrop() {
    if (!G.piece) return;
    let n = 0;
    while (move(0, 1)) n++;
    G.score += 2 * n;
    Sound.play('hard');
    lock(true);
  }
  function hold() {
    if (!G.piece || G.holdUsed || G.clearing) return;
    const cur = G.piece.type;
    if (G.hold) { const t = G.hold; G.hold = cur; spawn(t); }
    else { G.hold = cur; spawn(); }
    G.holdUsed = true; G.sideDirty = true;
    Sound.play('hold');
  }
  function lock(quiet) {
    const p = G.piece; let above = true;
    for (const [cx, cy] of ROT[p.type][p.rot]) {
      const X = p.x + cx, Y = p.y + cy;
      if (Y >= 0) G.grid[Y][X] = p.type;
      if (Y >= HIDDEN) above = false;
    }
    G.piece = null; G.holdUsed = false; G.sideDirty = true;
    if (above) return gameOver();
    const full = [];
    for (let y = 0; y < ROWS; y++) if (G.grid[y].every(Boolean)) full.push(y);
    if (full.length) {
      const n = full.length, before = G.level;
      G.lines += n;
      G.score += [0, 100, 300, 500, 800][n] * G.level;
      G.level = session.startLevel + Math.floor(G.lines / 10);
      G.clearing = { rows: full, t: 0 };
      Sound.play(n === 4 ? 'tetris' : 'clear');
      buzz(n === 4 ? 140 : n > 1 ? 70 : 40);
      if (G.level > before) setTimeout(() => Sound.play('level'), 200);
    } else {
      if (!quiet) Sound.play('lock');
      spawn();
    }
  }
  function finishClear() {
    for (const y of G.clearing.rows) { G.grid.splice(y, 1); G.grid.unshift(Array(COLS).fill(null)); }
    G.clearing = null;
    spawn();
  }

  /* ---------- Loop ---------- */
  function update(dt) {
    if (!G || G.over || G.paused) return;
    if (G.clearing) {
      G.clearing.t += dt;
      if (G.clearing.t >= CLEAR_TIME) finishClear();
      return;
    }
    if (!G.piece) return;
    if (rep.dir) {
      rep.t += dt;
      if (!rep.charged) {
        if (rep.t >= DAS) { rep.charged = true; rep.t = 0; if (move(rep.dir, 0)) Sound.play('move'); }
      } else {
        while (rep.t >= ARR) { rep.t -= ARR; if (!move(rep.dir, 0)) { rep.t = 0; break; } }
      }
    }
    const g = gravity(G.level);
    const interval = G.soft ? Math.min(g, 0.035) : g;
    G.acc += dt;
    while (G.acc >= interval) {
      G.acc -= interval;
      if (move(0, 1)) { if (G.soft) G.score += 1; }
      else { G.acc = 0; break; }
    }
    if (!G.piece) return;
    if (grounded()) { G.lockT += dt; if (G.lockT >= LOCK_DELAY) lock(); }
    else G.lockT = 0;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    update(dt);
    render();
  }
  function startLoop() { if (raf) return; last = performance.now(); raf = requestAnimationFrame(frame); }
  function stopLoop() { cancelAnimationFrame(raf); raf = 0; }

  /* ---------- Rendering ---------- */
  function setCanvas(cv, w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }
  function layout() {
    const main = $('#t-main'), side = $('.t-side');
    const cs = getComputedStyle(main);
    const gap = parseFloat(getComputedStyle($('.t-play')).columnGap) || 10;
    const w = main.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - side.offsetWidth - gap;
    const h = main.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    cell = Math.max(10, Math.floor(Math.min(w / COLS, h / VIS)));
    bctx = setCanvas(boardCv, cell * COLS, cell * VIS);
    mini = Math.max(9, Math.min(15, Math.floor(cell * 0.55)));
    hctx = setCanvas(holdCv, 66, mini * 2 + 10);
    nctx = setCanvas(nextCv, 66, (mini * 2 + 14) * 3);
    readTheme();
    if (G) G.sideDirty = true;
    render();
  }
  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    const dark = document.documentElement.dataset.theme === 'dark';
    theme = { board: cs.getPropertyValue('--board').trim(), grid: cs.getPropertyValue('--grid').trim(), flash: dark ? '#EDEDEF' : '#FFFFFF' };
    if (G) G.sideDirty = true;
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  function block(ctx, x, y, s, color) {
    const pad = Math.max(1, Math.round(s * 0.06));
    ctx.fillStyle = color;
    rr(ctx, x + pad, y + pad, s - pad * 2, s - pad * 2, s * 0.2);
    ctx.fill();
  }
  function render() {
    if (!bctx) return;
    const ctx = bctx, W = cell * COLS, H = cell * VIS;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = theme.board; rr(ctx, 0, 0, W, H, 12); ctx.fill();
    ctx.strokeStyle = theme.grid; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 1; x < COLS; x++) { ctx.moveTo(x * cell + 0.5, 4); ctx.lineTo(x * cell + 0.5, H - 4); }
    for (let y = 1; y < VIS; y++) { ctx.moveTo(4, y * cell + 0.5); ctx.lineTo(W - 4, y * cell + 0.5); }
    ctx.stroke();
    if (!G) return;
    ctx.globalAlpha = G.over ? 0.4 : 1;
    for (let y = HIDDEN; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const t = G.grid[y][x];
        if (t) block(ctx, x * cell, (y - HIDDEN) * cell, cell, COLORS[t]);
      }
    }
    ctx.globalAlpha = 1;
    if (G.clearing) {
      const k = Math.min(1, G.clearing.t / CLEAR_TIME);
      ctx.fillStyle = theme.flash;
      ctx.globalAlpha = Math.min(1, k * 1.8);
      for (const y of G.clearing.rows) { rr(ctx, 2, (y - HIDDEN) * cell + 1, W - 4, cell - 2, cell * 0.2); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    const p = G.piece;
    if (p && !G.over) {
      const gy = ghostY(), color = COLORS[p.type];
      for (const [cx, cy] of ROT[p.type][p.rot]) {
        const Y = gy + cy - HIDDEN; if (Y < 0) continue;
        const pad = Math.max(1, Math.round(cell * 0.06));
        ctx.globalAlpha = 0.16; block(ctx, (p.x + cx) * cell, Y * cell, cell, color);
        ctx.globalAlpha = 0.55; ctx.strokeStyle = color; ctx.lineWidth = 1.5;
        rr(ctx, (p.x + cx) * cell + pad + 0.75, Y * cell + pad + 0.75, cell - pad * 2 - 1.5, cell - pad * 2 - 1.5, cell * 0.2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      for (const [cx, cy] of ROT[p.type][p.rot]) {
        const Y = p.y + cy - HIDDEN; if (Y < 0) continue;
        block(ctx, (p.x + cx) * cell, Y * cell, cell, color);
      }
    }
    if (G.sideDirty) { drawSide(); G.sideDirty = false; }
    updateHUD();
  }
  function drawMini(ctx, type, cx, cy) {
    const cells = ROT[type][0];
    const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const ox = cx - ((maxX - minX + 1) * mini) / 2 - minX * mini;
    const oy = cy - ((maxY - minY + 1) * mini) / 2 - minY * mini;
    for (const [x, y] of cells) block(ctx, ox + x * mini, oy + y * mini, mini, COLORS[type]);
  }
  function drawSide() {
    const hw = 66, hh = mini * 2 + 10, slot = mini * 2 + 14;
    hctx.clearRect(0, 0, hw, hh);
    if (G.hold) drawMini(hctx, G.hold, hw / 2, hh / 2);
    holdBox.classList.toggle('used', G.holdUsed);
    nctx.clearRect(0, 0, hw, slot * 3);
    for (let i = 0; i < 3; i++) drawMini(nctx, G.queue[i], hw / 2, slot * i + slot / 2);
  }
  const hudCache = {};
  function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; document.getElementById(id).textContent = v; } }
  function updateHUD() {
    setText('t-score', fmt(G.score));
    setText('t-level', String(G.level));
    setText('t-lines', String(G.lines));
    setText('t-best', fmt(Math.max(bestScore(), G.score)));
  }

  /* ---------- Scores ---------- */
  function bestScore() { const s = Store.data.tetris.scores; return s.length ? s[0].s : 0; }
  function saveScore() {
    if (G.score <= 0) return;
    const list = Store.data.tetris.scores;
    list.push({ s: G.score, l: G.lines, lv: G.level, d: Date.now() });
    list.sort((a, b) => b.s - a.s);
    Store.data.tetris.scores = list.slice(0, 5);
    Store.save();
  }

  /* ---------- Flow ---------- */
  function gameOver() {
    G.over = true; G.piece = null; G.soft = false; rep.dir = 0;
    Sound.play('over');
    const prevBest = bestScore();
    saveScore();
    setTimeout(() => { if (G && G.over) showOver(prevBest); }, 650);
  }
  function startGame() {
    hideOverlay();
    newGame();
    const tag = $('#t-player');
    tag.textContent = 'P' + session.player;
    tag.classList.toggle('show', session.mode === '2p');
    for (const k in hudCache) delete hudCache[k];
    startLoop();
  }
  function pause() {
    if (!G || G.over || G.paused) return;
    G.paused = true; G.soft = false; rep.dir = 0;
    const restartLabel = session.mode === '2p' ? 'Restart match' : 'Restart';
    showPanel(`
      <h3>Paused</h3>
      <p class="sub">${session.mode === '2p' ? 'Player ' + session.player + ' · ' : ''}Score ${fmt(G.score)}</p>
      <button class="btn primary" data-a="resume">Resume</button>
      <button class="btn" data-a="restart">${restartLabel}</button>
      <button class="text-btn" data-a="quit">Quit</button>`);
  }
  function resume() {
    if (!G || !G.paused) return;
    G.paused = false; hideOverlay(); last = performance.now();
  }
  function showOver(prevBest) {
    if (session.mode === 'solo') {
      const newBest = G.score > prevBest && G.score > 0;
      if (newBest) buzz(80);
      showPanel(`
        <h3>Game over</h3>
        ${newBest ? '<span class="badge">New best</span>' : `<p class="sub">Best ${fmt(Math.max(prevBest, G.score))}</p>`}
        <div class="big-score">${fmt(G.score)}</div>
        <div class="stats-row"><span>Lines <b>${G.lines}</b></span><span>Level <b>${G.level}</b></span></div>
        <button class="btn primary" data-a="again">Play again</button>
        <button class="text-btn" data-a="home">Home</button>`);
      return;
    }
    session.results[session.player - 1] = G.score;
    if (session.player === 1) {
      showPanel(`
        <h3>Player 1 done</h3>
        <div class="big-score">${fmt(G.score)}</div>
        <p class="sub">Pass the phone to Player 2</p>
        <button class="btn primary" data-a="next-player">Start Player 2</button>
        <button class="text-btn" data-a="home">Home</button>`);
      return;
    }
    const [a, b] = session.results;
    const title = a === b ? "It's a tie!" : (a > b ? 'Player 1 wins!' : 'Player 2 wins!');
    if (a !== b) { Sound.play('win'); buzz(80); }
    showPanel(`
      <h3>${title}</h3>
      <div class="vs">
        <div class="${a > b ? 'win' : ''}"><small>Player 1</small><b>${fmt(a)}</b></div>
        <div class="${b > a ? 'win' : ''}"><small>Player 2</small><b>${fmt(b)}</b></div>
      </div>
      <button class="btn primary" data-a="rematch">Rematch</button>
      <button class="text-btn" data-a="home">Home</button>`);
  }
  function showPanel(html) { panel.innerHTML = html; overlay.classList.add('show'); }
  function hideOverlay() { overlay.classList.remove('show'); }

  panel.addEventListener('click', e => {
    const btn = e.target.closest('[data-a]'); if (!btn) return;
    Sound.play('tap');
    switch (btn.dataset.a) {
      case 'resume': resume(); break;
      case 'restart': if (session.mode === '2p') { session.player = 1; session.results = []; } startGame(); break;
      case 'again': startGame(); break;
      case 'next-player': session.player = 2; startGame(); break;
      case 'rematch': session.player = 1; session.results = []; startGame(); break;
      case 'quit': Nav.back(); break;
      case 'home': Nav.home(); break;
    }
  });

  /* ---------- Input ---------- */
  const canPlay = () => G && !G.over && !G.paused;
  function startDir(d) { rep.dir = d; rep.t = 0; rep.charged = false; if (move(d, 0)) Sound.play('move'); }
  function stopDir(d) { if (rep.dir === d) rep.dir = 0; }
  function actDown(a) {
    if (!canPlay()) return;
    if (a === 'left') startDir(-1);
    else if (a === 'right') startDir(1);
    else if (a === 'soft') G.soft = true;
    else if (a === 'hard') hardDrop();
    else if (a === 'rotate') rotate(1);
  }
  function actUp(a) {
    if (a === 'left') stopDir(-1);
    else if (a === 'right') stopDir(1);
    else if (a === 'soft' && G) G.soft = false;
  }
  $$('.ctl').forEach(btn => {
    const a = btn.dataset.act;
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      Sound.unlock();
      try { btn.setPointerCapture(e.pointerId); } catch (err) {}
      btn.classList.add('down');
      actDown(a);
    });
    const up = () => { btn.classList.remove('down'); actUp(a); };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
  });
  holdBox.addEventListener('click', () => { if (canPlay()) hold(); });
  $('#t-pause').addEventListener('click', () => { Sound.play('tap'); pause(); });

  // Board gestures: tap = rotate, drag = move, flick down = hard drop, swipe up = hold.
  let ges = null;
  boardCv.addEventListener('pointerdown', e => {
    if (!canPlay()) return;
    Sound.unlock();
    try { boardCv.setPointerCapture(e.pointerId); } catch (err) {}
    const now = performance.now();
    ges = { id: e.pointerId, x0: e.clientX, y0: e.clientY, ax: e.clientX, ay: e.clientY, t0: now, moved: false, samples: [[now, e.clientY]] };
  });
  boardCv.addEventListener('pointermove', e => {
    if (!ges || e.pointerId !== ges.id || !canPlay()) return;
    const now = performance.now();
    ges.samples.push([now, e.clientY]);
    while (ges.samples.length > 2 && now - ges.samples[0][0] > 90) ges.samples.shift();
    const step = cell * 0.9;
    let dx = e.clientX - ges.ax;
    while (Math.abs(dx) >= step) {
      const d = Math.sign(dx);
      if (move(d, 0)) Sound.play('move');
      ges.ax += d * step; dx -= d * step; ges.moved = true;
    }
    let dy = e.clientY - ges.ay;
    while (dy >= step * 1.1) {
      if (move(0, 1)) G.score += 1;
      ges.ay += step * 1.1; dy -= step * 1.1; ges.moved = true;
    }
    if (dy < -step) ges.ay = e.clientY + (-step);
  });
  const endGesture = e => {
    if (!ges || e.pointerId !== ges.id) return;
    const g = ges; ges = null;
    if (!canPlay()) return;
    const now = performance.now();
    const tx = e.clientX - g.x0, ty = e.clientY - g.y0, dur = now - g.t0;
    const first = g.samples[0];
    const vy = (e.clientY - first[1]) / Math.max(16, now - first[0]); // px per ms
    if (!g.moved && Math.hypot(tx, ty) < 12 && dur < 320) { rotate(1); return; }
    if (ty > cell * 2 && vy > 0.9 && Math.abs(tx) < ty * 0.7) { hardDrop(); return; }
    if (ty < -cell * 2 && Math.abs(tx) < -ty * 0.7) hold();
  };
  boardCv.addEventListener('pointerup', endGesture);
  boardCv.addEventListener('pointercancel', e => { if (ges && e.pointerId === ges.id) ges = null; });

  // Keyboard (handy when testing in a browser).
  document.addEventListener('keydown', e => {
    if (Nav.current() !== 'tetris-game' || !G) return;
    const k = e.key;
    if (k === 'p' || k === 'P' || k === 'Escape') { G.paused ? resume() : pause(); e.preventDefault(); return; }
    if (!canPlay()) return;
    if (k === 'ArrowLeft') { if (!e.repeat) startDir(-1); }
    else if (k === 'ArrowRight') { if (!e.repeat) startDir(1); }
    else if (k === 'ArrowDown') G.soft = true;
    else if (k === 'ArrowUp' || k === 'x' || k === 'X') rotate(1);
    else if (k === 'z' || k === 'Z') rotate(-1);
    else if (k === ' ') { if (!e.repeat) hardDrop(); }
    else if (k === 'c' || k === 'C' || k === 'Shift') hold();
    else return;
    e.preventDefault();
  });
  document.addEventListener('keyup', e => {
    if (!G) return;
    if (e.key === 'ArrowLeft') stopDir(-1);
    else if (e.key === 'ArrowRight') stopDir(1);
    else if (e.key === 'ArrowDown') G.soft = false;
  });

  window.addEventListener('resize', () => { if (Nav.current() === 'tetris-game') layout(); });
  window.addEventListener('themechange', () => { readTheme(); render(); });

  return {
    begin(mode, level) { session = { mode, startLevel: level, player: 1, results: [] }; startGame(); },
    enter() { layout(); },
    leave() { stopLoop(); hideOverlay(); G = null; rep.dir = 0; },
    pause,
    back() {
      if (!G) return false;
      if (G.over) return false;          // leave to setup
      if (G.paused) { resume(); return true; }
      pause(); return true;
    },
    bestScore,
    // exposed for automated checks
    _debug: { get G() { return G; }, ROT, rotate, move, hardDrop, hold, gravity },
  };
})();
