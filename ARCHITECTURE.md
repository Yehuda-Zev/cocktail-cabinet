# Architecture

This is the shared design every game builds on, plus the decisions still open
for the human architects to confirm. Written so a future session (human or
Claude) can pick up any one game without re-deriving the pattern.

## The core idea: Role + Agent

Every game defines **exactly two Roles** — the two seats in the "flip" table
from the assignment. A Role is just an id + label (`shared/js/agent.js`).
Each Role gets bound to one of two Agent types:

- `HumanAgent(role, inputBinding)` — `inputBinding` translates raw
  keyboard/pointer/touch events into a game-defined input shape.
- `ComputerAgent(role, strategyFn, difficultyCurve)` — `strategyFn(state, difficulty)`
  returns the **exact same input shape** a HumanAgent would produce for that role.

The rules engine (movement, collision, scoring) only ever calls
`agent.getInput(state)` and applies the result. It never branches on "is this
the human." That's what makes "a human or the computer can take either side"
fall out of the architecture instead of being special-cased per game — and
it's what guarantees "no scripted wins, no skipped collisions": the
computer's move has to survive the same collision checks a human's move
does, because it goes through the same code path.

Concretely, per game, "the flip" = swapping which Role is bound to Human vs
Computer via a dropdown (`createRoleAssignmentControl`). Snake demonstrates
this fully: Role A = *steerer*, Role B = *apple-placer*, and either can be
human or computer independently.

## Difficulty: never trivial, never impossible

`DifficultyCurve(elapsedSeconds) -> [min, max]`, asymptotic
(`1 - e^{-t/ramp}`), never actually reaching 0 or 1. Two places this is used:

1. **Per-agent skill** — a `ComputerAgent`'s own curve controls how good its
   strategy function plays (reaction latency, lookahead depth, deliberate
   mistake rate). Tuned so `max` is beatable by a competent human and `min`
   isn't a free win in the first few seconds.
2. **Global game pace** — independent of who's playing, e.g. Snake's move
   interval shortens over time. This is what makes the game get harder *for
   the human* even when the human is just steering against a placid
   computer placer, satisfying "whichever side the human... is playing."

Every game should tune its own `min`/`max`/`rampSeconds` — don't reuse
Snake's numbers blindly, they were tuned for a 20×20 grid.

## Shared files

| File | Purpose |
|---|---|
| `shared/js/engine.js` | Fixed-timestep `GameLoop`, DPI-correct canvas sizing. Pauses automatically on tab blur. |
| `shared/js/agent.js` | `Role`, `Agent`/`HumanAgent`/`ComputerAgent`, `DifficultyCurve`, `createRoleAssignmentControl`. |
| `shared/js/matchmaking.js` | `simulateMatchmaking()` — randomized fake-queue delay, for Imitation and any other "don't reveal you're facing an AI instantly" mode. |
| `shared/css/cabinet.css` | Hub page (the cocktail cabinet itself). |
| `shared/css/game.css` | Shared per-game chrome: header, role-assignment control, HUD, canvas frame, controls. |

Each game lives in `games/<name>/` with its own `index.html` + `<name>.js`,
importing the shared modules. No build step, no bundler — plain ES modules,
so it stays a pure static site.

## Per-game flip design

| Game | Role A | Role B | Status |
|---|---|---|---|
| Snake | Steerer (arrow keys / pathfinding) | Apple Placer (click cell / risk-scored placement) | **Implemented** — reference example |
| Breakout | Paddle (human side) | Paddle/ball-control (computer side) | Scaffolded, not built |
| Splat | Column Layout | Runner | Scaffolded, not built |
| Asteroids | Pilot | Asteroid Sender | Scaffolded, not built |
| Missile Command | *open — design ourselves* | | Not started |
| Tetris (our pick) | *open — design ourselves* | | Not started |
| Imitation | Human/AI conversant, other side | matched via network or artifact | Scaffolded, see below |

## Open decisions (architect sign-off needed)

These are flagged rather than silently decided, because they affect things
outside pure game logic (accounts, hosting, embedding):

1. **Imitation's AI mode.** Per your professor's note, the plan is to
   publish the AI conversant as a separate **Claude Artifact** using the
   artifact runtime's built-in "ask Claude" capability — this runs through
   the viewer's own claude.ai session, so it satisfies "no API keys, AI runs
   through Claude in your own browser" without us doing anything clever. Two
   integration approaches, need a decision:
   - **Link out**: the Netlify page opens the artifact's `claude.ai/artifact/...`
     URL in a new tab. Simple, always works, but breaks the "one page" framing
     a little (the assignment's overview says "single web page," though the
     per-game flip table implies separate game pages are fine — the cabinet
     hub is the "single web page").
   - **Iframe embed**: the Netlify page embeds the artifact inline. Nicer UX,
     but claude.ai's frame-ancestors policy may block this — needs testing
     before we commit to it.
   Recommendation: build the artifact first, test whether it can be iframed,
   fall back to link-out if not.
2. **Imitation's human-vs-human networking.** Defaulted to **Trystero**
   (serverless WebRTC over public trackers, no account) since it wasn't
   picked explicitly. Confirm or override before building.
3. **Missile Command's flip** and **Tetris's flip** — candidates proposed
   in their stub pages, not locked in.

## Delegation

See [`DELEGATION_LOG.md`](DELEGATION_LOG.md) — required by the assignment,
kept as a running log rather than written retroactively.
