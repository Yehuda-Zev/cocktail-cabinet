# Delegation Log — Summary

Condensed version of [`DELEGATION_LOG.md`](DELEGATION_LOG.md), which has the
full bug write-ups and test notes. Project: **The Cocktail Cabinet**, seven
arcade games that each play human-or-computer on either side, live at
https://decor8.online.

**"Verified by" key**
- **Claude** = driven in a browser from a local server (mostly computer vs.
  computer). That test browser can't hold keys down or open popups, so some
  human-control paths could not be checked this way.
- **Student** = tested in my own real browser and accounts.

---

### 1. Framework + Snake (09-28)
- **Asked:** a basic framework for the assignment. I chose vanilla JS/canvas,
  Tetris as game 7 (later swapped), serverless networking for Imitation, and
  had a domain but no repo.
- **Returned:** shared Role/Agent/DifficultyCurve framework, hub page, Snake
  (human or computer on either side), stub pages, `ARCHITECTURE.md`,
  `netlify.toml`.
- **Verified:** Claude ran it in-browser and found two real bugs (computer
  could never place an apple; game loop never resumed after a tab switch),
  fixed both, then watched a full computer-vs-computer game (score 46).
  Student launched it locally and confirmed it worked.

### 2. Breakout, Splat, Asteroids, Missile Command (09-28)
- **Asked:** build each next, same pattern. For Missile Command, Claude
  explained the original game first, then I approved its flip design.
- **Returned:** Breakout (two-paddle), Splat (flappy-style runner whose
  computer side can only react to locked columns), Asteroids (ship vs. asteroid
  sender), Missile Command (interceptor defender vs. missile attacker).
- **Verified:** Claude ran computer-vs-computer for each (rallies, tracking,
  dodging, a full intercept-and-score loop). **Not verified:** held-key human
  controls, Splat's human layout clicks, actually crashing in Asteroids,
  Missile Command's loss screen. Left for student playtest.

### 3. Playtest bugs (09-28)
- **Asked (student, after playing):** "the AI in Splat is really bad" and
  "missiles in Missile Command are way too small."
- **Returned:** Splat's computer runner had an aim bias that hovered it ~60px
  above gap center (rewritten); missiles were drawn as a 2px sliver (now a
  5px head with a trail).
- **Verified:** student found both. Claude fixed them and re-checked in the
  browser (runner tracking gap center; missile clearly visible).

### 4. Imitation, human vs. human (09-28)
- **Asked:** matchmaking first.
- **Returned:** serverless peer-to-peer matchmaking and chat (Trystero),
  90-second timer, Human/AI guess and reveal. Live testing showed the planned
  BitTorrent strategy never connected, so it uses Nostr relays instead.
- **Verified:** Claude paired two real browser tabs, chatted both ways,
  guessed, saw the reveal and the disconnect message. Also fixed a CSS bug
  that stacked all screens at once.

### 5. Imitation, AI opponent (09-29)
- **Asked:** how to get the AI version working (professor allowed a Claude
  Artifact).
- **Returned:** "Turing Booth" artifact that asks Claude to play an in-character
  human. Testing showed claude.ai blocks iframing, so the game links out to it.
- **Verified:** student made the artifact public and chatted with it signed in:
  it stays in character and denies being an AI. Claude tested the iframe block
  and the fallback links.

### 6. Imitation fix (09-30)
- **Asked (student, from real use):** "imitation is broken. why use a popup?
  open a new tab, and make the artifact version identical to the PvP version."
- **Returned:** plain new tab instead of a sized popup; artifact stripped down
  to the same layout as the human chat page and republished.
- **Verified:** Claude re-ran matchmaking and screenshotted the artifact.
  **Pending:** student re-test of the new-tab flow in a real browser.

### 7. Minesweeper replaces Tetris (09-30)
- **Asked (student):** swap Tetris for Minesweeper so the flip is who places
  the bombs vs. who guesses.
- **Returned:** Minesweeper with a layout role and a sweeper role; computer
  sweeper uses real deduction and never sees hidden mines; mines increase per
  level.
- **Verified:** Claude ran computer-vs-computer, a human-placed row of mines
  fully solved by the computer, and level 2 starting at 14 mines. Found and
  fixed a hidden-element CSS bug.

### 8. Netlify + custom domain (09-30)
- **Asked:** connect `decor8.online` (GoDaddy) to the Netlify project.
- **Returned:** step-by-step guidance. After I corrected it on Netlify's
  current "projects" wording, Claude checked the live docs before advising.
- **Verified:** student did every click: set Project visibility to Public,
  edited the existing `www` CNAME at GoDaddy, cleared Chrome's DNS cache.
  Claude confirmed the site loads from a fresh browser; student confirmed
  `decor8.online` shows in the URL.

### 9. Subdomain `games.decor8.online` (in progress)
- **Asked:** how complicated moving the live URL to a subdomain would be.
- **Returned:** CNAME `games` -> `my-cocktail-cabinet.netlify.app`, then set it
  as the primary domain.
- **Verified:** not yet confirmed done.

### 10. Depths of Danger, Unity build as 8th game (10-14)
- **Asked:** how to include a Unity project; a build walkthrough for Unity 6.3;
  help with a failed first build; then "make these files into a new game page."
- **Returned:** build steps checked against the 6.3 docs; forum-reported fixes
  for Unity's "Internal build system error"; then the game page in
  `games/dungeons/` (cabinet styling, back link) plus an 8th hub card.
- **Verified:** student rebuilt successfully on their machine. Claude ran the
  build locally: it loads, shows the menu, and Play enters a dungeon room.
  **Not verified:** real gameplay. Student confirmed it is human-only (no
  computer side), so it is the one game that doesn't meet the both-directions
  requirement; the hub subtitle says only the first seven do.

### 11. Sound effects and level-skip cheat (10-14)
- **Asked:** add sound effects (no music) to the first seven games, and a cheat
  code to jump straight to a high level in all of them.
- **Returned:** synthesized sounds plus a mute button in every game; typing
  `levelup` jumps difficulty to ~95% of max (Minesweeper: level 6). Also fixed
  a real bug: Restart (or idling before Start) used to leave games at full
  speed instead of starting easy.
- **Verified:** Claude checked in the browser that sounds fire, the cheat
  raises speed (e.g. Snake 4.6 → 9.9/s, Minesweeper level 1 → 6), and Restart
  resets it. **Not verified:** how the sounds sound to a person (student
  listen).

---

**Standing instruction from student:** read current documentation before
advising on any external tool or service.

**Still open:** human-control playtests (held keys, Splat clicks, loss screens),
re-test of Imitation's new-tab flow, subdomain switch, Slack posts.
