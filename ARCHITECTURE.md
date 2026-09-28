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
| Breakout | Bottom Paddle | Top Paddle (same Role type, symmetric flip) | **Implemented** |
| Splat | Column Layout (click to set gap, locks at a line) | Runner (flap/gravity, reacts only to locked columns) | **Implemented** |
| Asteroids | Pilot (rotate/thrust/wrap) | Asteroid Sender (click a target, spawns from a random edge) | **Implemented** |
| Missile Command | Defender (click to fire interceptor, fixed cooldown) | Attacker (click to aim missile at the ground) | **Implemented** |
| Tetris (our pick) | *open — design ourselves* | | Not started |
| Imitation | Judge (chats, then guesses Human/AI) | opponent — human (**implemented**) or AI (open) | **Human vs Human implemented**; AI side open |

## Imitation: human-vs-human networking (resolved)

Built on **Trystero**, but one detail differs from the original plan: the
**BitTorrent-tracker strategy (`@trystero-p2p/torrent`) never connected in
testing** — its three default tracker WebSockets all failed repeatedly in
this dev sandbox. Switched to the **Nostr relay strategy
(`@trystero-p2p/torrent` → `@trystero-p2p/nostr`)**, which connected in
under 8 seconds in the same environment and is Trystero's own recommended
default. Same properties either way (serverless, no account, static-site
friendly) — just a different public relay network for peer discovery.
Also worth knowing: the npm package itself moved from unscoped `trystero`
to scoped `@trystero-p2p/<strategy>` packages, and the CDN import needs
jsDelivr's `+esm` bundling endpoint (plain `dist/index.mjs` has internal
bare-specifier imports jsDelivr won't resolve on its own):

```js
import { joinRoom, selfId } from 'https://cdn.jsdelivr.net/npm/@trystero-p2p/nostr/+esm';
```

**Matchmaking protocol** (`games/imitation/imitation.js`): everyone
looking for an opponent joins one shared `lobby` room under a fixed
`appId`. On meeting a peer there, both sides exchange `selfId`s; whoever
has the lower ID proposes a fresh private room (`match-<sortedIds>`) and
both leave the lobby to join it. This avoids a real matchmaking server
while still only ever pairing two people at a time. Verified live with two
real browser tabs: lobby handshake, room handoff, bidirectional chat, and
peer-disconnect handling (opponent leaving mid-chat surfaces a system
message and disables input) all confirmed working.

The chat UI, 90-second timer, and Human/AI guess-and-reveal screen are
built and reused as-is for whichever opponent type is behind
`startMatchmaking()` — the AI path just needs to plug into the same
`enterChatPhase()` call once it exists, so the player can't tell which
they got from timing or UI differences.

## Open decisions (architect sign-off needed)

1. **Imitation's AI mode.** Per your professor's note, the plan is to
   publish the AI conversant as a separate **Claude Artifact** using the
   artifact runtime's built-in "ask Claude" capability — this runs through
   the viewer's own claude.ai session, so it satisfies "no API keys, AI runs
   through Claude in your own browser" without us doing anything clever. Two
   integration approaches, need a decision:
   - **Link out**: the Netlify page opens the artifact's `claude.ai/artifact/...`
     URL in a new tab. Simple, always works, but opening a new tab to
     claude.ai the moment you're matched with the AI is a dead giveaway —
     likely fails the "not obvious" requirement on its own.
   - **Iframe embed**: the Netlify page embeds the artifact inline,
     styled to match the human-chat UI exactly. This is the one that
     actually satisfies "not obvious" — but whether claude.ai's
     frame-ancestors policy allows being iframed by another origin is
     still untested.
   Recommendation: build the artifact first, test whether it can be
   iframed, fall back to a disguised link-out (e.g. always opening
   *something* in a new tab, human or AI, so the tab itself isn't a tell)
   if not.
2. **Tetris's flip** — still ours to design (assignment's "your own game"
   slot), not locked in. Missile Command's flip is now resolved: Defender
   (fires interceptors that detonate into an expanding blast on arrival)
   vs. Attacker (aims missiles at the ground, five cities to defend).

## Delegation

See [`DELEGATION_LOG.md`](DELEGATION_LOG.md) — required by the assignment,
kept as a running log rather than written retroactively.
