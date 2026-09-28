# Delegation Log

Required by the assignment: what we asked Claude to do, what it produced,
and how we verified it. Kept as we go, not written after the fact.

---

### 2026-09-28 — Asteroids

**Asked:** Build Asteroids, fourth real game, same Role/Agent pattern.

**Produced:** `games/asteroids/asteroids.js` + updated
`games/asteroids/index.html`. Classic rotate/thrust/wrap ship physics.
Default is the classic setup (human pilots, computer throws) since the
assignment's stated flip ("computer flies the ship, human sends the
asteroids") is the *alternate* mode, same convention as Snake's default.
Sender picks a target point; the asteroid always spawns from a random
field edge aimed at that point, which structurally guarantees a minimum
travel distance — never a point-blank unavoidable hit, without needing
extra fairness logic. A shared spawn cooldown (1300ms → 550ms as global
difficulty ramps) throttles both human clicking and computer spawning
identically, so the difficulty ramp applies regardless of who holds which
role. Computer pilot flees the nearest asteroid with difficulty-scaled
reaction latency and aim jitter; computer sender aims at the ship's
*current* (not predicted) position with jitter that shrinks as difficulty
rises.

**Verified:** Local server, live browser. Computer-vs-computer: ship
actively dodged multiple simultaneous asteroids over an extended run,
wrapped across edges correctly, never got hit — confirms the evasion
logic is doing real work, not coasting. Separately, tested the losing path
by leaving the (human) pilot completely idle at center while a computer
sender attacked: observed asteroids missing narrowly early on (low
difficulty → high jitter, as designed) and a near-miss later that passed
within ~31px of the ship against a 23px collision threshold — good
evidence the collision math is exactly as tight as coded, not accidentally
too forgiving. Did **not** observe an actual triggered "Destroyed" game-over
in this session (kept surviving/missing throughout the test window) — the
code path is structurally identical to the already-confirmed game-over
overlays in Snake/Breakout/Splat, but wasn't exercised live here. Human
rotate/thrust uses the same held-key pattern already verified (at the
event level) for Breakout's paddles — didn't re-test it, same harness
limitation applies. **Recommend playtesting a full human-piloted run**,
including actually crashing into an asteroid, before calling this done.

---

### 2026-09-28 — Splat

**Asked:** Build Splat, third real game, same Role/Agent pattern.

**Produced:** `games/splat/splat.js` + updated `games/splat/index.html`. Built
as a Flappy-Bird-style runner (gravity + flap impulse) rather than a literal
"columns list" — fits "get through the gap in each column" directly, and
flap-on-keypress is a discrete action rather than a held key, which matters
for testability (see Breakout's note on why held keys can't be verified
here). Fairness is architectural, not just documented: each column has a
`locked` flag; it starts editable (dashed on screen) while it scrolls in
from the right, and freezes permanently once it crosses a visible lock
line. The runner's computer strategy filters to `c.locked` columns only —
it is structurally incapable of reacting to a gap that hasn't been fixed
yet, whether a human or the computer placed it.

**Verified:** Local server, live browser, computer-vs-computer (layout AI +
runner AI). Confirmed: columns spawn and scroll correctly, transition from
dashed/editable to solid/locked exactly at the lock line, the runner's flap
decisions keep it tracking inside the gap band across multiple screenshots,
speed ramps with elapsed time (152 → 156px/s), no false game-overs. Did
**not** get a confirmed scored pass or a confirmed collision in this
session — this sandbox's render loop only advances during active tool
calls (same artifact noted for Snake/Breakout), so watching a column
actually travel the full field in real time was too slow to be worth
the tool calls. Also did not get a clean pixel-accurate confirmation of
the human-layout click handler (canvas coordinate math in this specific
browser-automation harness didn't resolve cleanly), though the handler
uses the identical getBoundingClientRect-relative pattern already verified
for Snake's placer. **Recommend playtesting a full run yourself** —
specifically watch for an actual scored pass and an actual splat, and try
clicking to steer the layout as a human.

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
