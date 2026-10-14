/* Core helpers shared by both games: storage, settings, sound, haptics, theme, navigation. */
'use strict';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const Bridge = window.AndroidBridge || null;

/* ---------- Storage ---------- */
const Store = (() => {
  const KEY = 'tictris.v1';
  const blankTTT = () => ({ w: 0, l: 0, d: 0, streak: 0, best: 0 });
  const defaults = () => ({
    settings: { sound: true, vib: true, theme: 'auto' },
    ttt: { mode: 'cpu', diff: 'medium', easy: blankTTT(), medium: blankTTT(), hard: blankTTT() },
    tetris: { mode: 'solo', level: 1, scores: [] },
  });
  let data = defaults();
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        const d = defaults();
        data = {
          settings: Object.assign(d.settings, saved.settings),
          ttt: Object.assign(d.ttt, saved.ttt),
          tetris: Object.assign(d.tetris, saved.tetris),
        };
      }
    } catch (e) { data = defaults(); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable */ } }
  function resetScores() {
    const d = defaults();
    data.ttt.easy = d.ttt.easy; data.ttt.medium = d.ttt.medium; data.ttt.hard = d.ttt.hard;
    data.tetris.scores = [];
    save();
  }
  load();
  return { get data() { return data; }, save, resetScores, blankTTT };
})();

/* ---------- Sound (synthesised, no audio files) ---------- */
const Sound = (() => {
  let ctx = null, master = null;
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, dur, opt = {}) {
    const c = ensure(); if (!c) return;
    const { type = 'sine', vol = 0.18, to = null, delay = 0, attack = 0.006 } = opt;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.03);
  }
  const notes = (list, step, opt) => list.forEach((f, i) => tone(f, step * 1.6, Object.assign({}, opt, { delay: i * step })));
  const fx = {
    tap:     () => tone(520, 0.05, { vol: 0.06 }),
    placeX:  () => tone(620, 0.09, { type: 'triangle', vol: 0.16, to: 520 }),
    placeO:  () => tone(440, 0.10, { type: 'triangle', vol: 0.16, to: 380 }),
    win:     () => notes([523, 659, 784, 1047], 0.08, { type: 'triangle', vol: 0.16 }),
    lose:    () => notes([392, 330, 262], 0.11, { type: 'triangle', vol: 0.14 }),
    draw:    () => notes([440, 440], 0.12, { type: 'sine', vol: 0.12 }),
    move:    () => tone(300, 0.03, { type: 'square', vol: 0.025 }),
    rotate:  () => tone(520, 0.05, { type: 'triangle', vol: 0.09, to: 700 }),
    hold:    () => tone(380, 0.07, { type: 'triangle', vol: 0.09, to: 300 }),
    lock:    () => tone(170, 0.06, { type: 'triangle', vol: 0.14, to: 120 }),
    hard:    () => tone(150, 0.10, { type: 'triangle', vol: 0.22, to: 70 }),
    clear:   () => notes([523, 659, 784], 0.06, { type: 'square', vol: 0.05 }),
    tetris:  () => notes([523, 659, 784, 1047, 1319], 0.06, { type: 'square', vol: 0.06 }),
    level:   () => tone(400, 0.35, { type: 'triangle', vol: 0.12, to: 1200 }),
    over:    () => tone(392, 0.7, { type: 'triangle', vol: 0.16, to: 98 }),
  };
  return {
    unlock() { try { if (Store.data.settings.sound) ensure(); } catch (e) {} },
    play(name) {
      if (!Store.data.settings.sound) return;
      try { fx[name] && fx[name](); } catch (e) { /* audio not available */ }
    },
  };
})();

/* ---------- Haptics ---------- */
function buzz(ms) {
  if (!Store.data.settings.vib) return;
  try {
    if (Bridge && Bridge.vibrate) Bridge.vibrate(ms);
    else if (navigator.vibrate) navigator.vibrate(ms);
  } catch (e) { /* no vibrator */ }
}

/* ---------- Theme ---------- */
const Theme = (() => {
  const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function systemDark() {
    try { if (Bridge && Bridge.isSystemDark) return !!Bridge.isSystemDark(); } catch (e) {}
    return !!(mq && mq.matches);
  }
  function apply() {
    const pref = Store.data.settings.theme;
    const dark = pref === 'dark' || (pref === 'auto' && systemDark());
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#111113' : '#F5F4F0');
    try { if (Bridge && Bridge.setDark) Bridge.setDark(dark); } catch (e) {}
    window.dispatchEvent(new Event('themechange'));
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', apply);
  window.onSystemTheme = apply;
  return { apply };
})();

/* ---------- Navigation ---------- */
const Nav = (() => {
  const stack = [];
  const hooks = {}; // id -> {enter, leave, back}
  function show(id) {
    $$('[data-screen]').forEach(s => s.classList.toggle('active', s.id === id));
  }
  function current() { return stack[stack.length - 1]; }
  function go(id) {
    const prev = current();
    if (prev && hooks[prev] && hooks[prev].leave) hooks[prev].leave();
    stack.push(id); show(id);
    if (hooks[id] && hooks[id].enter) hooks[id].enter();
  }
  function back() {
    if (stack.length <= 1) return false;
    const prev = stack.pop();
    if (hooks[prev] && hooks[prev].leave) hooks[prev].leave();
    const id = current(); show(id);
    if (hooks[id] && hooks[id].enter) hooks[id].enter();
    return true;
  }
  function home() {
    while (stack.length > 1) {
      const prev = stack.pop();
      if (hooks[prev] && hooks[prev].leave) hooks[prev].leave();
    }
    show('home');
    if (hooks.home && hooks.home.enter) hooks.home.enter();
  }
  function on(id, h) { hooks[id] = h; }
  /* Android back button. Returns true when handled, false lets the app close. */
  function handleBack() {
    const id = current();
    if (hooks[id] && hooks[id].back && hooks[id].back()) return true;
    return back();
  }
  return { go, back, home, on, current, handleBack };
})();

/* ---------- Small UI helpers ---------- */
let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}
function fmt(n) { return Number(n).toLocaleString('en-US'); }
function selectIn(container, value) {
  $$('[data-v]', container).forEach(b => b.classList.toggle('selected', b.dataset.v === value));
}
