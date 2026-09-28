# Delegation Log

Required by the assignment: what we asked Claude to do, what it produced,
and how we verified it. Kept as we go, not written after the fact.

---

### 2026-09-28 — Two bugs from actual playtesting

**Asked:** "The AI in Splat is really bad" and "the missiles in Missile
Command are way too small, you can barely ever hit them" — both reported
directly from playing the deployed games, not from reading code.

**Found and fixed:**
- **Splat's runner AI had a real aim bias**, not just weak tuning. The old
  flap controller compared its lookahead against `decisionTargetY - margin`
  (margin 10–20px) *and* the physics of a flap-triggered rise naturally
  overshoots ~50px above the trigger point — combined, the runner's hover
  equilibrium sat 60–70px above the true gap center at every difficulty
  level. With gaps shrinking to 110px tall (half = 55px) at high
  difficulty, that bias alone was enough to clip the top wall on gaps the
  runner was correctly "aiming" at. Rewrote it as a proper one-tick-ahead
  controller (`games/splat/splat.js`): flap now if unpowered gravity for
  one more physics step would sink below the target line, checked every
  tick (not just every `recomputeEvery` ticks — that latency now only
  gates *which column* it's tracking, not the flap decision itself).
  Difficulty now affects a `mistakeChance` of skipping a needed flap and
  aim jitter on target selection, not where the controller aims.
- **Missile Command's missiles were rendered as a 2–6px, 2px-wide line**
  (`m.x - m.vx * 0.03`, trail length scaled by a tiny 0.03s) — visually
  almost nothing against a 640×480 field, making it genuinely hard for a
  human to track and lead. Not a hit-detection bug (collision is explosion
  radius vs. missile point, unaffected by render size) but a real
  usability bug. Fixed by drawing a 5px filled head plus a 0.15s trail at
  3px width (`games/missile-command/missile-command.js`).

**Verified:** Local server, live browser, both fixes. Splat: ran a full
computer-vs-computer match after the fix, watched the runner hover
tightly around the gap center (not biased high) across multiple columns
and clear at least one column cleanly with no collision. Missile Command:
confirmed the missile now renders as a clearly visible dot-with-trail
instead of a near-invisible sliver.

---

### 2026-09-28 — Missile Command

**Asked:** Design and build Missile Command's flip (the assignment left it
open), fifth real game.

**Produced:** `games/missile-command/missile-command.js` + updated
`games/missile-command/index.html`. Explained the original 1980 arcade game
first, then proposed and built: Defender (fires interceptors that detonate
into an expanding/fading blast radius on arrival, destroying any missile
caught in it) vs. Attacker (aims missiles at one of five cities along the
ground). Computer defender predicts an intercept point via a few rounds of
fixed-point iteration (interceptor travel time depends on where it's
going, which depends on travel time — solved by iterating ~5 times rather
than deriving a closed form), with aim jitter and reaction latency shrinking
as difficulty rises, same recipe as every other computer opponent in this
project. Fire rate is capped by a *constant* cooldown shared by human and
computer defenders alike (350ms) — deliberately not difficulty-scaled,
since that's the skill a human exercises, unlike the attacker's spawn
cooldown which does tighten with global difficulty (1600ms → 700ms).
Updated `ARCHITECTURE.md`'s flip table, which had gone stale since
Breakout (Splat and Asteroids were marked "not built" despite being
shipped) — fixed all four rows while in there.

**Verified:** Local server, live browser, computer-vs-computer. This one
went better than prior sessions: watched the defender actually predict,
fire, and successfully intercept an incoming missile (score went 0 → 1),
with the explosion rendering and fading correctly on screen, all cities
staying alive (5/5) across the observed window. This is the strongest
live confirmation yet of a full simulation loop in this project — spawn,
predict, intercept, explode, score all observed working together in one
sitting, not just inferred from partial evidence. Did **not** observe a
missile actually hitting a city (defender was simply too effective in the
window I watched) or the "Overrun" game-over screen, and did not test
human click-to-aim for either role (same harness limitation as prior
entries). **Recommend playtesting** a losing scenario and both human
control schemes.

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
