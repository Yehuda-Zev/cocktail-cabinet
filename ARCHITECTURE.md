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
| Imitation | Judge (chats, then guesses Human/AI) | opponent — human or AI | **Implemented** |

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

## Imitation: the AI opponent (resolved)

The AI side runs on a separately published Claude Artifact,
**[Turing Booth](https://claude.ai/artifact/1yeHi97ec9a9HV3iRG79Sp)**,
using the artifact runtime's `sample` capability ("ask Claude" — spends
the *viewer's* own Claude usage, no API key involved). This is the only
way to satisfy "no API keys, AI runs through Claude in your own browser":
`window.claude` and its capabilities only exist on a page rendered
through claude.ai's own artifact viewer — there is no way to call
`sample` from a page hosted on this site.

That constraint settled the two open questions from the original plan:

- **Iframe embedding is impossible, confirmed by testing.** claude.ai
  sends `Content-Security-Policy: frame-ancestors 'self' chrome-extension://...`
  — it refuses to be framed by any external origin. This is Anthropic's
  own platform policy, not something the artifact's settings or our
  code can change.
- **The artifact must be shared as "Anyone with the link."** Even then,
  a visitor still needs their own claude.ai account signed in to actually
  use `sample` (it spends their usage) — viewing the page doesn't require
  sign-in, but asking Claude does. Confirmed live: an anonymous viewer
  sees the page and UI render correctly, with a clean "Claude access is
  unavailable in this view" fallback instead of a crash.

**Design, given link-out is the only option:** both outcomes — human or
AI — open in a new, deliberately bare tab (no cabinet header, nav, or
HUD; a plain `window.open(url, '_blank', 'noopener')` with no
width/height, not a sized popup window — real browsers are more
aggressive about blocking an actual popup than a bare new tab, even from
a genuine click) after the identical matchmaking delay, so the
*transition* itself gives nothing away. `games/imitation/imitation.js`
opens the tab synchronously inside the "Find a Match" click (avoids
popup-blocker issues — see below) and only decides *where* to redirect it
once matchmaking resolves: a human match redirects to
`chat.html?room=<id>` (a bare page on this site,
`games/imitation/chat.js`, that joins the already-agreed Trystero room
directly); an AI match redirects to the Turing Booth URL, whose own page
content is kept structurally identical to `chat.html` (same log + input
form, no title, no extra copy) so the two destinations read as the same
surface. The main window keeps the timer and the Human/AI guess-and-reveal
screen for both cases, so that part of the flow is byte-for-byte identical
regardless of opponent type. What's left undisguisable: the claude.ai URL
and its own header chrome once the tab lands there — there's no way
around a real claude.ai page looking like claude.ai, given the platform
won't let it be framed. Documented here as an accepted limitation, not
something further engineering fixes.

**Popup-blocker note:** `window.open()` must be called synchronously
inside the click handler to count as a real user gesture in most
browsers — calling it after matchmaking's async delay gets silently
blocked. The page opens a blank tab immediately on click and redirects
it (`tab.location.href = ...`) once the destination is known; if it was
blocked anyway (confirmed happening in this dev sandbox even for a plain
new tab, not just sized popups), a manual link appears on the main page
as a fallback — a real anchor click is its own fresh user gesture and
isn't blocked.

## Open decisions (architect sign-off needed)

1. **Tetris's flip** — still ours to design (assignment's "your own game"
   slot), not locked in. Missile Command's flip is now resolved: Defender
   (fires interceptors that detonate into an expanding blast on arrival)
   vs. Attacker (aims missiles at the ground, five cities to defend).

## Delegation

See [`DELEGATION_LOG.md`](DELEGATION_LOG.md) — required by the assignment,
kept as a running log rather than written retroactively.
