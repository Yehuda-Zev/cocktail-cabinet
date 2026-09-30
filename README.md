# The Cocktail Cabinet

Seven arcade games, one static page. Every game can be played by a human or
the computer on either side. No server, no API keys, no build step.

## Structure

```
index.html              the cabinet hub — links to all seven games
shared/
  css/cabinet.css        hub page styling
  css/game.css            shared per-game chrome (header, role picker, HUD)
  js/engine.js            fixed-timestep game loop (canvas-based games)
  js/agent.js              Role/Agent/DifficultyCurve framework (see ARCHITECTURE.md)
  js/matchmaking.js         fake-queue delay helper
games/
  snake/                  the reference implementation — read this first
  breakout/ splat/ asteroids/ missile-command/ minesweeper/
    each a full implementation, same Role/Agent pattern
  imitation/               human-vs-human (Trystero) + human-vs-AI (Claude Artifact)
```

Read [`ARCHITECTURE.md`](ARCHITECTURE.md) for how the Role/Agent pattern
works and the per-game design notes — worth reading before touching any
game's code, especially Imitation's and Minesweeper's (both depart from
the canvas/GameLoop pattern the other five use, for good reasons explained
there).

## Local development

No build step. Any static file server works:

```bash
python -m http.server 8000
```

or

```bash
npx serve .
```

Then open `http://localhost:8000`. A `.claude/launch.json` is already set
up for Claude Code's browser preview if you're using that.

## Deploying (Netlify + your own domain)

1. **Push this to GitHub** (already done — this repo is connected to
   `origin`; just `git push`).
2. **Connect Netlify to the repo.** New site from Git → pick the repo.
   Build command: none. Publish directory: `.` (repo root) — already set
   in `netlify.toml`.
3. **Continuous deployment** is automatic once connected: every push to
   `main` redeploys.
4. **Point your domain at it.** In Netlify: Domain settings → Add custom
   domain → enter your domain (or a subdomain like `games.yourdomain.com`).
   Netlify gives you either a CNAME record (for a subdomain) or nameservers
   (if you want Netlify DNS) — add that at your registrar. Wait for DNS to
   propagate, Netlify auto-provisions HTTPS once it does.
5. Submit the final `https://games.yourdomain.com`-style URL on Canvas —
   not a `netlify.app` address.

**Status:** not yet connected to Netlify — this is the main remaining
non-game task.

## What's done vs. what's left

All seven games are implemented and computer-vs-computer verified live
in-browser: **Snake, Breakout, Splat, Asteroids, Missile Command,
Minesweeper, Imitation**. See `ARCHITECTURE.md` for each game's design
and `DELEGATION_LOG.md` for exactly how each was tested.

**Verification gaps worth a real playtest before calling this finished**
(each flagged in detail in `DELEGATION_LOG.md` as it came up — this is a
summary, not the full picture):
- Held-key controls (Breakout's paddles, Asteroids' rotate/thrust) —
  correct at the event level, never confirmed by an actual held-key
  session, since the automated test tool can't simulate holding a key.
- Splat's human click-to-place layout, and watching an actual scored pass
  or splat happen (the sandbox's slow real-time rendering made this
  impractical to wait out).
- Missile Command's actual "Overrun" loss state, and both human click
  controls.
- Imitation's AI mode: the persona itself is confirmed working (tested
  live by a human), and the new-tab flow was fixed after a real-browser
  bug report, but hasn't been re-confirmed end-to-end in a real browser
  since that fix.

**Non-game assignment requirements, not yet done:**
- Netlify deployment + custom domain (domain is owned, Netlify site not
  yet connected)
- Slack posts about challenges hit, and replies to classmates' posts

## Delegation log

See [`DELEGATION_LOG.md`](DELEGATION_LOG.md) — required by the assignment.
Add an entry every time you hand Claude a real chunk of work, not just at
the end.
