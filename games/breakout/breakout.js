import { GameLoop, fitCanvasToContainer } from '../../shared/js/engine.js';
import { Role, HumanAgent, ComputerAgent, DifficultyCurve, createRoleAssignmentControl } from '../../shared/js/agent.js';

// ---------------------------------------------------------------------
// Field
// ---------------------------------------------------------------------
const FIELD = { width: 480, height: 640 };
const PADDLE = { width: 90, height: 12, speed: 360, margin: 22 };
const BALL_RADIUS = 7;
const WIN_SCORE = 7;
const BRICKS = { rows: 3, cols: 8, width: 50, height: 16, gap: 6, top: 260 };

const canvas = document.getElementById('game-canvas');
fitCanvasToContainer(canvas, FIELD.width, FIELD.height);

const ROLES = {
  bottom: new Role('bottom', 'Bottom Paddle'),
  top: new Role('top', 'Top Paddle'),
};

const globalDifficulty = new DifficultyCurve({ min: 0, max: 1, rampSeconds: 70 });
function ballSpeedForElapsed(elapsedSeconds) {
  const d = globalDifficulty.at(elapsedSeconds);
  const minSpeed = 210, maxSpeed = 400;
  return minSpeed + (maxSpeed - minSpeed) * d;
}

// ---------------------------------------------------------------------
// Human input: held-key tracking so paddles move continuously while held.
// ---------------------------------------------------------------------
function createPaddleHumanBinding(leftCode, rightCode) {
  const held = new Set();
  function onDown(e) {
    if (e.code === leftCode || e.code === rightCode) { held.add(e.code); e.preventDefault(); }
  }
  function onUp(e) {
    held.delete(e.code);
  }
  return {
    attach() {
      window.addEventListener('keydown', onDown);
      window.addEventListener('keyup', onUp);
    },
    detach() {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      held.clear();
    },
    read() {
      let dir = 0;
      if (held.has(leftCode)) dir -= 1;
      if (held.has(rightCode)) dir += 1;
      return { dir };
    },
  };
}

// ---------------------------------------------------------------------
// Computer paddle strategy factory. `which` selects which paddle/ball-y
// relationship this instance tracks; both sides reuse the same logic.
// ---------------------------------------------------------------------
function createPaddleStrategy(which) {
  let trackedTargetX = FIELD.width / 2;
  let ticksSinceUpdate = 99;

  return function strategy(state, difficulty) {
    const paddle = which === 'bottom' ? state.paddleBottom : state.paddleTop;
    const approaching = which === 'bottom' ? state.ball.vy > 0 : state.ball.vy < 0;

    const recomputeEvery = difficulty > 0.7 ? 1 : difficulty > 0.4 ? 2 : 4;
    ticksSinceUpdate++;

    if (ticksSinceUpdate >= recomputeEvery) {
      ticksSinceUpdate = 0;
      if (approaching) {
        // Predictive lead scales with difficulty: 0 = react to current ball
        // x only, 1 = full straight-line prediction of where it'll land.
        const paddleY = which === 'bottom'
          ? FIELD.height - PADDLE.margin
          : PADDLE.margin;
        const dy = paddleY - state.ball.y;
        const predictedX = state.ball.vy !== 0
          ? state.ball.x + state.ball.vx * (dy / state.ball.vy)
          : state.ball.x;
        const lead = predictedX * difficulty + state.ball.x * (1 - difficulty);
        const jitter = (1 - difficulty) * 60 * (Math.random() * 2 - 1);
        trackedTargetX = lead + jitter;
      } else {
        // Ball moving away: drift back toward center, unhurried.
        trackedTargetX = FIELD.width / 2;
      }
    }

    const diff = trackedTargetX - paddle.x;
    const deadzone = 6;
    if (Math.abs(diff) < deadzone) return { dir: 0 };
    return { dir: diff > 0 ? 1 : -1 };
  };
}

// ---------------------------------------------------------------------
// State
// ---------------------------------------------------------------------
let state, agents, running = false, winner = null;

function makeBricks() {
  const rowsWidth = BRICKS.cols * BRICKS.width + (BRICKS.cols - 1) * BRICKS.gap;
  const startX = (FIELD.width - rowsWidth) / 2;
  const bricks = [];
  for (let r = 0; r < BRICKS.rows; r++) {
    for (let c = 0; c < BRICKS.cols; c++) {
      bricks.push({
        x: startX + c * (BRICKS.width + BRICKS.gap),
        y: BRICKS.top + r * (BRICKS.height + BRICKS.gap),
        w: BRICKS.width,
        h: BRICKS.height,
        alive: true,
      });
    }
  }
  return bricks;
}

function serveBall(towardBottom) {
  const angle = (Math.random() * 0.5 - 0.25) * Math.PI; // +-45deg-ish ejector
  const speed = ballSpeedForElapsed(state ? state.elapsed : 0);
  return {
    x: FIELD.width / 2,
    y: FIELD.height / 2,
    vx: Math.sin(angle) * speed,
    vy: (towardBottom ? 1 : -1) * Math.cos(angle) * speed,
  };
}

function resetState() {
  state = {
    paddleBottom: { x: FIELD.width / 2 },
    paddleTop: { x: FIELD.width / 2 },
    ball: serveBall(Math.random() < 0.5),
    bricks: makeBricks(),
    scoreBottom: 0,
    scoreTop: 0,
    elapsed: 0,
    serving: false,
  };
  winner = null;
}

function buildAgents(assignment) {
  agents = {
    bottom: assignment.bottom === 'human'
      ? new HumanAgent(ROLES.bottom, createPaddleHumanBinding('ArrowLeft', 'ArrowRight'))
      : new ComputerAgent(ROLES.bottom, createPaddleStrategy('bottom'), new DifficultyCurve({ min: 0.15, max: 0.88, rampSeconds: 45 })),
    top: assignment.top === 'human'
      ? new HumanAgent(ROLES.top, createPaddleHumanBinding('KeyA', 'KeyD'))
      : new ComputerAgent(ROLES.top, createPaddleStrategy('top'), new DifficultyCurve({ min: 0.15, max: 0.88, rampSeconds: 45 })),
  };
  agents.bottom.attach();
  agents.top.attach();
}

const roleControl = createRoleAssignmentControl({
  container: document.getElementById('role-assignment'),
  roles: [ROLES.bottom, ROLES.top],
  defaults: { bottom: 'human', top: 'computer' },
  onChange: (assignment) => {
    agents?.bottom.detach();
    agents?.top.detach();
    buildAgents(assignment);
  },
});
buildAgents(roleControl.get());

// ---------------------------------------------------------------------
// Physics
// ---------------------------------------------------------------------
function movePaddle(paddle, dir, dt) {
  paddle.x += dir * PADDLE.speed * dt;
  const half = PADDLE.width / 2;
  paddle.x = Math.max(half, Math.min(FIELD.width - half, paddle.x));
}

function reflectOffPaddle(ball, paddle, towardNegativeY) {
  const half = PADDLE.width / 2;
  const offset = Math.max(-1, Math.min(1, (ball.x - paddle.x) / half));
  const speed = Math.hypot(ball.vx, ball.vy);
  const maxAngle = Math.PI / 3; // 60 degrees max off vertical
  const angle = offset * maxAngle;
  ball.vx = Math.sin(angle) * speed;
  ball.vy = (towardNegativeY ? -1 : 1) * Math.cos(angle) * speed;
}

function stepPhysics(dt) {
  if (winner) return;

  if (state.serving) {
    state.serveTimer -= dt;
    if (state.serveTimer <= 0) state.serving = false;
    // Paddles can still move during serve so it isn't a free reposition window.
  }

  const bottomDir = agents.bottom.getInput(state).dir;
  const topDir = agents.top.getInput(state).dir;
  movePaddle(state.paddleBottom, bottomDir, dt);
  movePaddle(state.paddleTop, topDir, dt);

  if (state.serving) return;

  const ball = state.ball;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  // Walls
  if (ball.x - BALL_RADIUS < 0) { ball.x = BALL_RADIUS; ball.vx *= -1; }
  if (ball.x + BALL_RADIUS > FIELD.width) { ball.x = FIELD.width - BALL_RADIUS; ball.vx *= -1; }

  // Bricks (first overlap wins for this frame)
  for (const b of state.bricks) {
    if (!b.alive) continue;
    if (ball.x + BALL_RADIUS > b.x && ball.x - BALL_RADIUS < b.x + b.w &&
        ball.y + BALL_RADIUS > b.y && ball.y - BALL_RADIUS < b.y + b.h) {
      b.alive = false;
      ball.vy *= -1;
      break;
    }
  }

  // Bottom paddle
  const pb = state.paddleBottom;
  const paddleBottomY = FIELD.height - PADDLE.margin;
  if (ball.vy > 0 && ball.y + BALL_RADIUS >= paddleBottomY &&
      ball.y - BALL_RADIUS <= paddleBottomY + PADDLE.height &&
      ball.x >= pb.x - PADDLE.width / 2 && ball.x <= pb.x + PADDLE.width / 2) {
    ball.y = paddleBottomY - BALL_RADIUS;
    reflectOffPaddle(ball, pb, true);
  }

  // Top paddle
  const pt = state.paddleTop;
  const paddleTopY = PADDLE.margin;
  if (ball.vy < 0 && ball.y - BALL_RADIUS <= paddleTopY + PADDLE.height &&
      ball.y + BALL_RADIUS >= paddleTopY &&
      ball.x >= pt.x - PADDLE.width / 2 && ball.x <= pt.x + PADDLE.width / 2) {
    ball.y = paddleTopY + PADDLE.height + BALL_RADIUS;
    reflectOffPaddle(ball, pt, false);
  }

  // Scoring
  if (ball.y > FIELD.height + BALL_RADIUS * 2) {
    state.scoreTop++;
    startRally(true);
  } else if (ball.y < -BALL_RADIUS * 2) {
    state.scoreBottom++;
    startRally(false);
  }

  if (state.scoreBottom >= WIN_SCORE) winner = 'Bottom';
  if (state.scoreTop >= WIN_SCORE) winner = 'Top';
}

function startRally(towardBottom) {
  state.ball = serveBall(towardBottom);
  state.bricks = makeBricks();
  state.serving = true;
  state.serveTimer = 0.8;
}

// ---------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------
const hudBottom = document.getElementById('hud-score-bottom');
const hudTop = document.getElementById('hud-score-top');
const hudSpeed = document.getElementById('hud-speed');
const hudStatus = document.getElementById('hud-status');

const loop = new GameLoop({
  canvas,
  update(dt, elapsed) {
    agents.bottom.tick?.(dt);
    agents.top.tick?.(dt);
    if (!running) return;

    state.elapsed = elapsed;
    stepPhysics(dt);

    hudBottom.textContent = String(state.scoreBottom);
    hudTop.textContent = String(state.scoreTop);
    hudSpeed.textContent = Math.round(ballSpeedForElapsed(elapsed)) + 'px/s';
    hudStatus.textContent = winner ? `${winner} Wins!` : state.serving ? 'Serving…' : 'Playing';
  },
  render(ctx) {
    draw(ctx);
  },
});

function draw(ctx) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);

  // center line
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.moveTo(0, FIELD.height / 2);
  ctx.lineTo(FIELD.width, FIELD.height / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // bricks
  state.bricks.forEach((b) => {
    if (!b.alive) return;
    ctx.fillStyle = '#ffe94a';
    ctx.fillRect(b.x, b.y, b.w, b.h);
  });

  // paddles
  ctx.fillStyle = '#2de2ff';
  ctx.fillRect(state.paddleBottom.x - PADDLE.width / 2, FIELD.height - PADDLE.margin, PADDLE.width, PADDLE.height);
  ctx.fillStyle = '#ff2d95';
  ctx.fillRect(state.paddleTop.x - PADDLE.width / 2, PADDLE.margin, PADDLE.width, PADDLE.height);

  // ball
  ctx.fillStyle = '#f2f2f8';
  ctx.beginPath();
  ctx.arc(state.ball.x, state.ball.y, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  if (winner) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.fillStyle = '#ffe94a';
    ctx.font = '24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${winner.toUpperCase()} WINS`, FIELD.width / 2, FIELD.height / 2);
  }
}

resetState();
loop.start();

document.getElementById('btn-start').addEventListener('click', () => {
  running = true;
  hudStatus.textContent = 'Playing';
});

document.getElementById('btn-restart').addEventListener('click', () => {
  resetState();
  running = true;
  hudStatus.textContent = 'Playing';
});
