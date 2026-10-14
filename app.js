/* App shell: home, setup screens, settings, Android hooks. */
'use strict';

(() => {
  const S = Store.data;

  /* ---------- Home ---------- */
  function refreshHome() {
    const t = S.ttt;
    const w = t.easy.w + t.medium.w + t.hard.w, l = t.easy.l + t.medium.l + t.hard.l, d = t.easy.d + t.medium.d + t.hard.d;
    $('#home-ttt-stat').textContent = (w + l + d) ? `vs CPU: ${w} W · ${l} L · ${d} D` : '';
    const best = Tetris.bestScore();
    $('#home-tetris-stat').textContent = best ? `Best ${fmt(best)}` : '';
  }
  $$('[data-go]').forEach(b => b.addEventListener('click', () => { Sound.play('tap'); Nav.go(b.dataset.go); }));
  $$('[data-back]').forEach(b => b.addEventListener('click', () => { Sound.play('tap'); Nav.back(); }));
  Nav.on('home', { enter: refreshHome });

  /* ---------- Tic-Tac-Toe setup ---------- */
  function refreshTTTSetup() {
    selectIn($('#ttt-mode'), S.ttt.mode);
    selectIn($('#ttt-diff'), S.ttt.diff);
    $('#ttt-diff-wrap').style.display = S.ttt.mode === 'cpu' ? '' : 'none';
    const r = S.ttt[S.ttt.diff];
    $('#ttt-record').innerHTML =
      `<div><small>Wins</small><b>${r.w}</b></div><div><small>Losses</small><b>${r.l}</b></div>` +
      `<div><small>Draws</small><b>${r.d}</b></div><div><small>Best streak</small><b>${r.best}</b></div>`;
  }
  $('#ttt-mode').addEventListener('click', e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    S.ttt.mode = b.dataset.v; Store.save(); Sound.play('tap'); refreshTTTSetup();
  });
  $('#ttt-diff').addEventListener('click', e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    S.ttt.diff = b.dataset.v; Store.save(); Sound.play('tap'); refreshTTTSetup();
  });
  $('#ttt-start').addEventListener('click', () => {
    Sound.play('tap');
    Nav.go('ttt-game');
    TTT.begin(S.ttt.mode, S.ttt.diff);
  });
  Nav.on('ttt-setup', { enter: refreshTTTSetup });
  Nav.on('ttt-game', { leave: () => TTT.stop() });

  /* ---------- Tetris setup ---------- */
  function refreshTetrisSetup() {
    selectIn($('#tetris-mode'), S.tetris.mode);
    $('#lvl-val').textContent = S.tetris.level;
    const list = S.tetris.scores;
    const fmtDate = ts => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    $('#tetris-best').innerHTML = list.length
      ? list.map((r, i) => `<li><span class="rank">${i + 1}</span><span class="pts">${fmt(r.s)}</span><span class="meta">${r.l} lines · ${fmtDate(r.d)}</span></li>`).join('')
      : '<li class="empty">No scores yet</li>';
  }
  $('#tetris-mode').addEventListener('click', e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    S.tetris.mode = b.dataset.v; Store.save(); Sound.play('tap'); refreshTetrisSetup();
  });
  const stepLevel = d => { S.tetris.level = Math.min(15, Math.max(1, S.tetris.level + d)); Store.save(); Sound.play('tap'); refreshTetrisSetup(); };
  $('#lvl-minus').addEventListener('click', () => stepLevel(-1));
  $('#lvl-plus').addEventListener('click', () => stepLevel(1));
  $('#tetris-start').addEventListener('click', () => {
    Sound.play('tap');
    Nav.go('tetris-game');
    Tetris.begin(S.tetris.mode, S.tetris.level);
  });
  Nav.on('tetris-setup', { enter: refreshTetrisSetup });
  Nav.on('tetris-game', { enter: () => Tetris.enter(), leave: () => Tetris.leave(), back: () => Tetris.back() });

  /* ---------- Settings sheet ---------- */
  const sheet = $('#settings-sheet');
  let resetArmed = 0;
  function openSettings() {
    $('#set-sound').checked = S.settings.sound;
    $('#set-vib').checked = S.settings.vib;
    selectIn($('#set-theme'), S.settings.theme);
    resetArmed = 0; $('#reset-data').textContent = 'Reset all scores';
    sheet.classList.add('show');
  }
  const closeSettings = () => sheet.classList.remove('show');
  $('#open-settings').addEventListener('click', () => { Sound.play('tap'); openSettings(); });
  $('#close-settings').addEventListener('click', () => { Sound.play('tap'); closeSettings(); });
  sheet.addEventListener('click', e => { if (e.target === sheet) closeSettings(); });
  $('#set-sound').addEventListener('change', e => { S.settings.sound = e.target.checked; Store.save(); Sound.unlock(); Sound.play('tap'); });
  $('#set-vib').addEventListener('change', e => { S.settings.vib = e.target.checked; Store.save(); buzz(30); });
  $('#set-theme').addEventListener('click', e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    S.settings.theme = b.dataset.v; Store.save(); selectIn($('#set-theme'), b.dataset.v); Theme.apply(); Sound.play('tap');
  });
  $('#reset-data').addEventListener('click', () => {
    const btn = $('#reset-data');
    if (!resetArmed) {
      resetArmed = setTimeout(() => { resetArmed = 0; btn.textContent = 'Reset all scores'; }, 3000);
      btn.textContent = 'Tap again to confirm';
      return;
    }
    clearTimeout(resetArmed); resetArmed = 0;
    Store.resetScores(); refreshHome();
    btn.textContent = 'Reset all scores';
    toast('All scores cleared');
  });

  /* ---------- Android + lifecycle hooks ---------- */
  window.onAndroidBack = () => {
    if (sheet.classList.contains('show')) { closeSettings(); return true; }
    return Nav.handleBack();
  };
  window.onAndroidPause = () => { if (Nav.current() === 'tetris-game') Tetris.pause(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) window.onAndroidPause(); });
  // Browser fallback for the back gesture when testing outside the app.
  document.addEventListener('keydown', e => { if (e.key === 'Backspace') window.onAndroidBack(); });

  /* ---------- Web only: browser back button ---------- */
  if (!Bridge) {
    // Keep one extra history entry while away from home, so the browser/phone back
    // button steps back inside the game instead of leaving the site.
    if (window.history && history.pushState) {
      let armed = false, ignorePop = false;
      const needGuard = () => Nav.current() !== 'home' || sheet.classList.contains('show');
      const sync = () => {
        const need = needGuard();
        if (need && !armed) { history.pushState({ tictris: 1 }, ''); armed = true; }
        else if (!need && armed) { armed = false; ignorePop = true; history.back(); }
      };
      window.addEventListener('popstate', () => {
        if (ignorePop) { ignorePop = false; return; }
        armed = false;
        window.onAndroidBack();
        setTimeout(sync, 0);
      });
      document.addEventListener('click', () => setTimeout(sync, 0), true);
      document.addEventListener('keyup', () => setTimeout(sync, 0), true);
    }
  }

  document.addEventListener('pointerdown', () => Sound.unlock(), { once: true });
  document.addEventListener('contextmenu', e => e.preventDefault());

  /* ---------- Boot ---------- */
  Theme.apply();
  Nav.go('home');
})();
