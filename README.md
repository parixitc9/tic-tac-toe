# Tic & Tris

Tic-Tac-Toe and Tetris in one clean, minimal web app. No frameworks, no build step — plain HTML, CSS and JavaScript.

## Games
- **Tic-Tac-Toe** — vs Computer (Easy / Medium / Hard, where Hard never loses) or 2 players on one device. Win/loss/draw record and best streak saved per difficulty.
- **Tetris** — Solo, or 2-player pass & play (higher score wins). SRS rotation with wall kicks, 7-bag pieces, ghost piece, hold, next queue, levels 1–15, top-5 scores.

Sound effects (synthesised with Web Audio), vibration on line clears where supported, pause/restart, and light / dark / auto themes. Scores are stored in the browser (`localStorage`).

## Controls (Tetris)
- **Touch:** tap to rotate, drag to move, flick down to drop, swipe up to hold — or use the on-screen buttons.
- **Keyboard:** ← → move, ↓ soft drop, ↑ / X rotate, Z rotate back, Space hard drop, C hold, P / Esc pause.
- The phone's back button pauses the game; back again resumes.

## Run locally
Open `index.html` in a browser, or serve the folder:
```
npx serve .
```

## Files
| File | What it does |
| --- | --- |
| `index.html` | Screens and layout |
| `app.css` | Styles and light/dark theme tokens |
| `core.js` | Storage, settings, sound, vibration, theme, navigation |
| `ttt.js` | Tic-Tac-Toe rules and computer player (minimax) |
| `tetris.js` | Tetris engine, rendering and touch controls |
| `app.js` | Home, setup screens, settings, back-button handling |

Live: https://tic-tac-toe-omega.vercel.app — deployed on Vercel as a static site (`vercel.json` sets headers only). Pushes to `main` deploy automatically.
