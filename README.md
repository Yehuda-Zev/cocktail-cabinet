# The Cocktail Cabinet

Seven arcade games, one static page. Every game can be played by a human or
the computer on either side. No server, no API keys, no build step.

## Structure

```
index.html              the cabinet hub — links to all seven games
shared/
  css/cabinet.css        hub page styling
  css/game.css            shared per-game chrome (header, role picker, HUD)
  js/engine.js            fixed-timestep game loop
  js/agent.js              Role/Agent/DifficultyCurve framework (see ARCHITECTURE.md)
  js/matchmaking.js         fake-queue delay, used by Imitation
games/
  snake/                  fully implemented — read this first, it's the reference
  breakout/ splat/ asteroids/ missile-command/ imitation/ tetris/
    scaffolded stub pages, not yet built
```

Read [`ARCHITECTURE.md`](ARCHITECTURE.md) before building the next game —
it explains the Role/Agent pattern Snake demonstrates and lists the open
decisions that still need a human call.

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

1. **Push this to GitHub.** From this folder:
   ```bash
   git init
   git add .
   git commit -m "Initial cocktail cabinet scaffold"
   git branch -M main
   git remote add origin <your-empty-github-repo-url>
   git push -u origin main
   ```
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

## What's done vs. what's left

- **Snake** — fully playable, both directions, computer opponent verified
  end-to-end (see `DELEGATION_LOG.md` for how it was tested).
- **Breakout, Splat, Asteroids, Missile Command, Tetris, Imitation** —
  stubbed with their planned flip design, not yet implemented.
- **Imitation's AI mode** needs a decision + a build: see the "Open
  decisions" section of `ARCHITECTURE.md`.

## Delegation log

See [`DELEGATION_LOG.md`](DELEGATION_LOG.md) — required by the assignment.
Add an entry every time you hand Claude a real chunk of work, not just at
the end.
