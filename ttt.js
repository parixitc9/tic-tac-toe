/* Tic-Tac-Toe: vs computer (easy / medium / unbeatable hard) or 2 players on one phone. */
'use strict';

const TTT = (() => {
  const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  const other = p => (p === 'X' ? 'O' : 'X');
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const SVG_X = '<svg viewBox="0 0 100 100"><path class="mx" d="M24 24L76 76"/><path class="mx" d="M76 24L24 76"/></svg>';
  const SVG_O = '<svg viewBox="0 0 100 100"><circle class="mo" cx="50" cy="50" r="29"/></svg>';

  /* ---------- Rules & AI ---------- */
  function result(b) {
    for (const line of LINES) {
      const [a, c, d] = line;
      if (b[a] && b[a] === b[c] && b[a] === b[d]) return { mark: b[a], line };
    }
    return b.every(Boolean) ? { mark: null, line: null } : null;
  }
  const empties = b => b.reduce((acc, v, i) => (v ? acc : acc.concat(i)), []);

  // Negamax with memo. Score is from the view of player p (to move); quicker wins score higher.
  const memo = new Map();
  function negamax(b, p) {
    const key = b.map(c => c || '-').join('') + p;
    if (memo.has(key)) return memo.get(key);
    const r = result(b);
    let best;
    if (r) best = r.mark === null ? 0 : -(1 + empties(b).length);
    else {
      best = -Infinity;
      for (let i = 0; i < 9; i++) {
        if (b[i]) continue;
        b[i] = p;
        const s = -negamax(b, other(p));
        b[i] = null;
        if (s > best) best = s;
      }
    }
    memo.set(key, best);
    return best;
  }
  function bestMoves(b, p) {
    let best = -Infinity, list = [];
    for (const i of empties(b)) {
      b[i] = p;
      const s = -negamax(b, other(p));
      b[i] = null;
      if (s > best) { best = s; list = [i]; } else if (s === best) list.push(i);
    }
    return list;
  }
  function winningMove(b, p) {
    for (const [a, c, d] of LINES) {
      const cells = [b[a], b[c], b[d]];
      if (cells.filter(v => v === p).length === 2 && cells.includes(null)) return [a, c, d][cells.indexOf(null)];
    }
    return null;
  }
  function aiMove(b, me, diff) {
    const free = empties(b);
    const win = winningMove(b, me), block = winningMove(b, other(me));
    if (diff === 'easy') {
      if (win !== null && Math.random() < 0.5) return win;
      if (block !== null && Math.random() < 0.3) return block;
      return pick(free);
    }
    if (diff === 'medium') {
      if (win !== null) return win;
      if (block !== null && Math.random() < 0.85) return block;
      return Math.random() < 0.55 ? pick(bestMoves(b, me)) : pick(free);
    }
    return pick(bestMoves(b, me)); // hard: never loses
  }

  /* ---------- State ---------- */
  const st = {
    mode: 'cpu', diff: 'medium',
    board: Array(9).fill(null), turn: 'X', starter: 'X',
    scores: { X: 0, O: 0, D: 0 }, over: false, busy: false, timer: 0,
  };
  const human = 'X', cpu = 'O';
  const boardEl = $('#ttt-board'), statusEl = $('#ttt-status'), lineEl = $('#ttt-winline'), nextBtn = $('#ttt-next');
  const cells = [];
  for (let i = 0; i < 9; i++) {
    const b = document.createElement('button');
    b.className = 'cell'; b.dataset.i = i; b.setAttribute('aria-label', 'Cell ' + (i + 1));
    b.addEventListener('click', () => onCell(i));
    boardEl.appendChild(b); cells.push(b);
  }

  const isCpuTurn = () => st.mode === 'cpu' && st.turn === cpu;
  const name = p => (st.mode === 'cpu' ? (p === human ? 'You' : 'CPU') : (p === 'X' ? 'Player 1' : 'Player 2'));

  function setStatus(text, cls) { statusEl.textContent = text; statusEl.className = 'status' + (cls ? ' ' + cls : ''); }
  function renderScores() {
    $('#ttt-s-x').textContent = st.scores.X;
    $('#ttt-s-o').textContent = st.scores.O;
    $('#ttt-s-d').textContent = st.scores.D;
    $('#ttt-n-x').textContent = name('X');
    $('#ttt-n-o').textContent = name('O');
    $('#ttt-p-x').classList.toggle('turn', !st.over && st.turn === 'X');
    $('#ttt-p-o').classList.toggle('turn', !st.over && st.turn === 'O');
  }
  function renderTurn() {
    if (st.mode === 'cpu') setStatus(st.turn === human ? 'Your turn' : 'Computer is thinking…', st.turn === human ? 'x' : '');
    else setStatus((st.turn === 'X' ? 'Player 1' : 'Player 2') + ' · ' + st.turn + ' to move', st.turn.toLowerCase());
    cells.forEach((c, i) => { c.disabled = !!st.board[i] || st.over || isCpuTurn(); });
    renderScores();
  }

  function startRound() {
    clearTimeout(st.timer);
    st.board = Array(9).fill(null); st.over = false; st.busy = false; st.turn = st.starter;
    cells.forEach(c => { c.innerHTML = ''; c.className = 'cell'; });
    boardEl.classList.remove('done');
    lineEl.classList.remove('show');
    nextBtn.classList.remove('show');
    renderTurn();
    if (isCpuTurn()) scheduleCpu();
  }

  function scheduleCpu() {
    st.busy = true;
    st.timer = setTimeout(() => {
      st.busy = false;
      if (st.over || !isCpuTurn()) return;
      place(aiMove(st.board.slice(), cpu, st.diff));
    }, 420 + Math.random() * 280);
  }

  function onCell(i) {
    if (st.over || st.busy || st.board[i] || isCpuTurn()) return;
    place(i);
  }

  function place(i) {
    const p = st.turn;
    st.board[i] = p;
    cells[i].innerHTML = p === 'X' ? SVG_X : SVG_O;
    Sound.play(p === 'X' ? 'placeX' : 'placeO');
    const r = result(st.board);
    if (r) return finish(r);
    st.turn = other(p);
    renderTurn();
    if (isCpuTurn()) scheduleCpu();
  }

  function drawWinLine(line, mark) {
    const box = boardEl.getBoundingClientRect();
    const center = i => {
      const r = cells[i].getBoundingClientRect();
      return [((r.left + r.width / 2) - box.left) / box.width * 300, ((r.top + r.height / 2) - box.top) / box.height * 300];
    };
    const [x1, y1] = center(line[0]), [x2, y2] = center(line[2]);
    const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len, ext = 30;
    const ln = lineEl.querySelector('line');
    ln.setAttribute('x1', x1 - ux * ext); ln.setAttribute('y1', y1 - uy * ext);
    ln.setAttribute('x2', x2 + ux * ext); ln.setAttribute('y2', y2 + uy * ext);
    ln.style.stroke = mark === 'X' ? 'var(--x)' : 'var(--o)';
    lineEl.classList.remove('show'); void lineEl.getBoundingClientRect(); lineEl.classList.add('show');
  }

  function finish(r) {
    st.over = true;
    cells.forEach(c => { c.disabled = true; });
    boardEl.classList.add('done');
    if (r.mark) {
      st.scores[r.mark]++;
      r.line.forEach(i => cells[i].classList.add('win-' + r.mark.toLowerCase()));
      setTimeout(() => drawWinLine(r.line, r.mark), 120);
      if (st.mode === 'cpu') {
        const won = r.mark === human;
        setStatus(won ? 'You win!' : 'Computer wins', won ? 'x' : 'o');
        Sound.play(won ? 'win' : 'lose');
        if (won) buzz(60);
        record(won ? 'w' : 'l');
      } else {
        setStatus((r.mark === 'X' ? 'Player 1' : 'Player 2') + ' wins!', r.mark.toLowerCase());
        Sound.play('win'); buzz(60);
      }
    } else {
      st.scores.D++;
      setStatus("It's a draw");
      Sound.play('draw');
      if (st.mode === 'cpu') record('d');
    }
    renderScores();
    setTimeout(() => nextBtn.classList.add('show'), 350);
  }

  function record(outcome) {
    const s = Store.data.ttt[st.diff] || (Store.data.ttt[st.diff] = Store.blankTTT());
    s[outcome]++;
    if (outcome === 'w') { s.streak++; s.best = Math.max(s.best, s.streak); }
    else if (outcome === 'l') s.streak = 0;
    Store.save();
  }

  /* ---------- Screen wiring ---------- */
  nextBtn.addEventListener('click', () => { Sound.play('tap'); st.starter = other(st.starter); startRound(); });
  $('#ttt-restart').addEventListener('click', () => { Sound.play('tap'); startRound(); });
  $('#ttt-reset').addEventListener('click', () => {
    st.scores = { X: 0, O: 0, D: 0 }; renderScores(); toast('Scores reset');
  });

  function begin(mode, diff) {
    st.mode = mode; st.diff = diff;
    st.scores = { X: 0, O: 0, D: 0 }; st.starter = 'X';
    const diffName = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }[diff];
    $('#ttt-sub').textContent = mode === 'cpu' ? 'vs Computer · ' + diffName : '2 Players';
    startRound();
  }
  function stop() { clearTimeout(st.timer); st.busy = false; }

  return { begin, stop, _debug: { aiMove, result, bestMoves } };
})();
