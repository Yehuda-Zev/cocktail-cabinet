# Delegation Log

Required by the assignment: what we asked Claude to do, what it produced,
and how we verified it. Kept as we go, not written after the fact.

---

### 2026-09-28 — Breakout

**Asked:** Build Breakout as the second real game, following the Role/Agent
pattern from Snake.

**Produced:** `games/breakout/breakout.js` + updated `games/breakout/index.html`.
Unlike Snake's asymmetric roles, the assignment's flip for Breakout
("computer plays against the human") is symmetric — so this is a
competitive two-paddle Breakout: bottom paddle vs top paddle, ball rallies
through a shared brick field in the middle, first to 7 points wins. Both
paddles are the *same* Role type, each independently bindable to Human or
Computer. Computer paddle AI predicts the ball's landing x-position with a
difficulty-scaled blend of "react to current position" vs "full straight-
line prediction," plus reaction latency and jitter that shrink as
difficulty ramps — same shape as Snake's computer opponent, not copy-pasted
but following the same recipe.

**Verified:** Ran it through a local server and drove a full
computer-vs-computer match in-browser for several minutes of real
gameplay: both paddles tracked and returned the ball repeatedly, bricks
broke correctly on contact, ball speed climbed with elapsed time (210 →
220px/s and climbing) exactly per the difficulty curve, no phantom
collisions or paddle desync observed.

Also checked the human-control path (arrow keys / A-D): confirmed via a
console log that keydown/keyup fire and match the expected key codes
correctly, so the event wiring itself is sound. Could **not** confirm the
felt experience of holding a key down, though — the automated browser tool
used for testing taps and releases keys almost instantly rather than
holding them, and this sandbox's render loop only advances during certain
tool actions, so no physics tick ever lands inside that brief press
window. That's a limitation of the test harness, not evidence the paddle
control is broken (the underlying keydown/keyup-into-a-held-Set pattern is
standard and was verified at the event level), but it's still unconfirmed
by an actual play session. **Recommend you personally playtest holding
Arrow Left/Right and A/D before considering Breakout fully done.**

---

### 2026-09-28 — Project scaffold

**Asked:** Set up the base framework for the cocktail cabinet — folder
structure, a shared Role/Agent pattern so every game can be flipped between
human and computer on either side, a shared difficulty-curve helper, the
cabinet hub page, and one fully-working reference game (Snake) to prove the
pattern before replicating it across the other six.

**Produced:**
- `shared/js/engine.js`, `shared/js/agent.js`, `shared/js/matchmaking.js` —
  the reusable framework.
- `index.html` + `shared/css/cabinet.css` — the hub page.
- `games/snake/` — full implementation: human/computer bindable to either
  the steerer or apple-placer role, BFS pathfinding + flood-fill survival
  logic for the computer steerer, risk-scored placement for the computer
  placer, a global speed curve independent of difficulty-per-agent.
- Stub pages for Breakout, Splat, Asteroids, Missile Command, Imitation,
  Tetris, each describing their planned flip.
- `ARCHITECTURE.md` documenting the pattern and flagging open decisions
  (Imitation's AI-via-Claude-Artifact plan, human-vs-human networking
  choice, undecided flips for Missile Command/Tetris).
- `netlify.toml`, `.gitignore`.

**Verified:** Ran the site through a local static server and drove it in a
real browser (not just read the code). Two real bugs turned up and got
fixed on the spot:
- `floodFill()` rejected its own starting cell whenever that cell was part
  of the snake — which is exactly the case when the computer placer seeds
  a search from the snake's head. Result: the computer placer could never
  find a legal apple spot and the game stalled forever on "waiting for
  apple." Fixed by only blocking *neighbors*, not the search's own seed
  cell (`games/snake/snake.js`).
- `GameLoop` paused itself on `visibilitychange` (tab hidden) but never
  resumed on the way back — a real player alt-tabbing mid-game would have
  permanently frozen the render loop. Added a symmetric resume
  (`shared/js/engine.js`).

After both fixes: ran a full computer-vs-computer match (steerer +
placer both AI) for ~90 seconds of real gameplay — reached score 46,
speed climbed from 4.6/s to 7.1/s exactly as the difficulty curve
intends, snake still alive and playing (confirms "never impossible" at
this tuning, not stuck in an infinite unlosable state either). Separately
verified the human-steerer path: pressed arrow keys, watched the snake
respond and correctly die on a legitimate wall collision (not scripted,
not skipped). Did not yet play-test the human-apple-placer click path or
mid-session role-swapping — worth another pass before calling Snake done.

<!-- Add new entries above this line, newest first. -->
