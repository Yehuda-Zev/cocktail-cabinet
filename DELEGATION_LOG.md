# Delegation Log

Required by the assignment: what we asked Claude to do, what it produced,
and how we verified it. Kept as we go, not written after the fact.

---

### 2026-09-30 — Minesweeper (replacing Tetris)

**Asked:** Swap the "your own game" slot from Tetris to Minesweeper — the
user's call, since Minesweeper's own mechanic (lay mines / survive them)
already is the flip the assignment wants, no invented asymmetry needed.

**Produced:** `games/minesweeper/` (`index.html`, `minesweeper.js`,
`minesweeper.css`), removed `games/tetris/`. Layout role places mines
after the sweeper's opening click (excluding that cell and its neighbors,
guaranteeing a safe start); Sweeper clicks to reveal, using number clues
to deduce safe cells. A computer sweeper runs real constraint propagation
first, falling back to a guess (random at low difficulty, weighted toward
the statistically safer frontier cell at high difficulty) only when no
certain move remains — and never reads `isMine` on an unrevealed cell, so
there's no path for it to cheat even by accident. A computer layout
clusters mines near already-placed ones as difficulty rises, which
produces genuinely harder-to-deduce boards rather than just more of them.
Difficulty is keyed to level number (boards cleared), not elapsed time —
turn-based play shouldn't punish a slow thinker — reusing
`DifficultyCurve` by feeding it level count instead of seconds, since its
math doesn't care what the input represents. This game also departs from
every other one in the project by skipping `shared/js/engine.js`'s
GameLoop and rendering a plain DOM grid instead of canvas: there's no
continuous physics to animate between clicks, and DOM buttons are a much
better fit for numbers, click targets, and hover states than hand-drawn
canvas text. Full design writeup in `ARCHITECTURE.md`.

**Bug found and fixed during testing:** the mine-placement counter/confirm
UI rendered visible before the first "Start" click, when it should have
been hidden. Same root cause as the Imitation multi-screen bug from
earlier in this project: `.ms-placer-controls { display: flex }` (an
author class rule) silently overrides the browser's default
`[hidden] { display: none }`. Fixed with an explicit
`.ms-placer-controls[hidden] { display: none }` rule — this is the second
time this exact CSS gotcha has shown up in this project; worth
remembering for any future `hidden`-attribute toggling here.

**Verified:** local server, live browser, multiple full rounds. Computer
vs. computer: correct flood-fill on the opening click, correct adjacency
numbers, and a legitimate early loss at level 1 (low difficulty means
careless guessing once no certain move remains) — confirms the computer
isn't scripted to always win. Human layout vs. computer sweeper: placed
all 10 mines in a single deliberately adversarial row via the placement
UI (counter and Confirm-button enable state both correct), watched the
solver fully clear the board through pure deduction with zero guessing
needed, and confirmed level 2 correctly started at 14 mines (10 + 4).
Also directly confirmed the loss-state rendering: hit mine highlighted in
yellow, distinct from the other revealed-but-unclicked mines in pink,
game correctly stopped. Did not verify the human sweeper's click-to-reveal
path beyond the one manual test that (legitimately, per low difficulty
elsewhere) hit a mine, nor a full multi-level run past level 2 —
reasonable next playtest if you want more confidence at higher mine
densities.

---

### 2026-09-30 — Imitation: popup → plain new tab

**Asked:** The user reported Imitation broken in real use and asked why a
sized popup was used at all, plus to make the artifact tab visually
identical to the human-chat tab.

**Produced:** `games/imitation/imitation.js` now calls `window.open(url,
'_blank', 'noopener')` with no width/height — a plain new tab, not a
sized popup window (real browsers are more aggressive about blocking
popups specifically, even from a genuine click, than a bare new tab).
Republished Turing Booth (`https://claude.ai/artifact/1yeHi97ec9a9HV3iRG79Sp`,
version 2) stripped down to the exact same DOM structure as
`chat.html` — log + input form, no title, no extra copy — so the two
possible destinations read as the same surface once past claude.ai's own
unavoidable header chrome.

**Verified:** Republished and screenshotted the artifact directly — same
bare log/input layout as `chat.html`, correctly showing the "Claude
access is unavailable" fallback in this unsigned-in sandbox. Re-ran
Imitation's matchmaking in-browser after the rename; console clean,
correctly reached the human-lobby wait state. Did not get a real signed-in
browser to confirm the new tab opens cleanly end-to-end this round — that
still needs the user's own playtest, same open item as before.

---

### 2026-09-29 — Imitation, AI opponent

**Asked:** Resolve the open iframe-vs-link-out question for Imitation's AI
side, then build whichever it turned out to be.

**Produced:**
- **Turing Booth** — a separately published Claude Artifact
  (`https://claude.ai/artifact/1yeHi97ec9a9HV3iRG79Sp`) using the
  `sample` capability to have Claude play an in-character human in a
  Turing-test chat, with instructions to stay in character and deny
  being an AI if asked directly.
- Rewrote `games/imitation/imitation.js`: a 50/50 coin flip decides human
  vs. AI on "Find a Match"; both outcomes open a new bare popup window
  (`games/imitation/chat.html` + `chat.js` for the human path, the
  artifact URL for the AI path) after the same matchmaking delay, with
  the timer and guess/reveal screen staying on the main page for both
  cases so that part is identical either way.

**What we learned that changed the plan:** tested whether the artifact
could be iframed before writing any of the popup/routing logic — it
can't (claude.ai sends `frame-ancestors 'self' <extensions only>`, a
hard platform-level block). That also surfaced that the artifact needs
to be set to "Anyone with the link" sharing by its owner (done by the
user via the Share menu — not something this session can do), and that
even then a visitor still needs their own claude.ai account signed in to
actually use `sample`, though viewing the page doesn't require it. Given
link-out was the only remaining option, and the user confirmed after
testing that a plain link-out felt obviously like "being sent to an
artifact," the design shifted to minimizing that tell rather than
eliminating it: strip our own chat window down to the same bare
no-chrome layout the artifact has, and make both outcomes open a new
window through the identical mechanism and timing.

**Verified:** Chatted with the published Turing Booth artifact directly
(the user did this, since the sandboxed test browser isn't signed into
any claude.ai account) — confirmed it replies in character, denies being
an AI when asked, and never breaks. Separately verified the popup-blocked
fallback path renders the right error state in that sandboxed browser,
which turned out useful: the automation environment blocks
`window.open()` even from within a click handler, so every test ran
through the fallback link instead of a real popup — this incidentally
gave thorough coverage of that path specifically. Using the fallback
links, verified live with three browser tabs: human-vs-human matching
correctly produces the same room id on both sides, `chat.html` joins that
room directly and exchanges messages bidirectionally, the main window's
timer and "I'm Ready to Guess" transition correctly, and guessing
correctly reveals "Correct!" for both a real human match and a forced AI
match (used a temporary `?force=human|ai` URL override during testing,
removed before committing). **Not verified in this session:** an actual
successful `window.open()` popup in a real, non-sandboxed browser — the
code path is standard and the fallback is confirmed solid, but the happy
path where a popup just opens cleanly needs a real playtest.

---

### 2026-09-28 — Imitation, human-vs-human path

**Asked:** Build the human-vs-human half of Imitation (matchmaking + chat
+ guess), deferring the AI half until the iframe question is resolved.

**Produced:** `games/imitation/imitation.js`, `imitation.css`, rewritten
`index.html`. Real serverless P2P matchmaking and chat via Trystero, a
90-second timed chat phase, and a Human/AI guess screen with reveal.

**What went differently than planned, and why:** Before writing any game
code, tested the actual library integration directly in the browser
rather than trusting memory of its API — good thing, because both the
import path and the networking strategy from the original plan were
wrong:
- `trystero`'s BitTorrent-tracker strategy is what ARCHITECTURE.md
  originally named, but all three of its default tracker WebSocket
  connections failed repeatedly in live testing. Switched to the Nostr
  relay strategy instead, which connected in under 8 seconds — full
  details in `ARCHITECTURE.md`.
- The package has moved to scoped names (`@trystero-p2p/nostr`, not
  `trystero`) and needs jsDelivr's `+esm` bundling endpoint, not a
  straight `dist/*.mjs` import — the raw dist file has internal bare
  module specifiers a plain CDN fetch can't resolve.
- `makeAction()`'s return shape and the peer-join/message callback API
  are also different from what I expected (object with `.send`/
  `.onMessage` properties, not an array-destructured pair) — caught by a
  real runtime error on first attempt, not assumed.

Building this incrementally in a scratch test page (raw library import →
single ping between two tabs → full lobby/pairing protocol) caught all of
this cheaply, before it was buried inside the real game's code.

**Bug found and fixed in the real build:** all five game screens
(`intro`/`matching`/`chat`/`guess`/`result`) rendered simultaneously,
stacked in a row, instead of one at a time. Cause: `.imitation-screen
{ display: flex }` (an author class rule) overrides the browser's default
`[hidden] { display: none }` rule, since author styles win regardless of
selector specificity. Fixed with an explicit `.imitation-screen[hidden] {
display: none }` rule.

**Verified:** Opened the real page in two separate browser tabs, clicked
"Find a Match" in both, and confirmed live: lobby pairing found each
other, both transitioned to chat at the same time, messages sent from
each tab arrived correctly in the other's log, the timer counted down,
"I'm Ready to Guess" transitioned correctly, guessing "Human" revealed
the correct result ("You were actually talking to a HUMAN. Correct!"),
and closing one side correctly surfaced "Your opponent disconnected." in
the other tab's chat log.

**Not done yet:** the AI half. `startMatchmaking()` has a marked TODO
where it will plug in once the Claude Artifact / iframe question is
resolved.

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
