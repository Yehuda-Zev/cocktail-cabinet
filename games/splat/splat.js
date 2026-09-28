import { GameLoop, fitCanvasToContainer } from '../../shared/js/engine.js';
import { Role, HumanAgent, ComputerAgent, DifficultyCurve, createRoleAssignmentControl } from '../../shared/js/agent.js';

// ---------------------------------------------------------------------
// Field & physics constants
// ---------------------------------------------------------------------
const FIELD = { width: 640, height: 420 };
const RUNNER_X = 110;
const RUNNER_RADIUS = 10;
const GRAVITY = 900;
const FLAP_VELOCITY = -300;
const MAX_FALL_SPEED = 480;
const COLUMN_WIDTH = 26;
const SPACING = 230;
const LOCK_X = 420; // columns become fixed once they scroll to this x
const MARGIN = 20; // top/bottom no-fly zone

const canvas = document.getElementById('game-canvas');
fitCanvasToContainer(canvas, FIELD.width, FIELD.height);

const ROLES = {
  layout: new Role('layout', 'Column Layout'),
  runner: new Role('runner', 'Runner'),
};

const globalDifficulty = new DifficultyCurve({ min: 0, max: 1, rampSeconds: 70 });
function scrollSpeedForElapsed(elapsed) {
  const d = globalDifficulty.at(elapsed);
  return 150 + (270 - 150) * d;
}
function gapHeightForElapsed(elapsed) {
  const d = globalDifficulty.at(elapsed);
  return 150 - (150 - 110) * d;
}

// ---------------------------------------------------------------------
// Human input bindings
// ---------------------------------------------------------------------
function createRunnerHumanBinding(flapCode) {
  let queued = false;
  function onDown(e) {
    if (e.code === flapCode) { queued = true; e.preventDefault(); }
  }
  return {
    attach() { window.addEventListener('keydown', onDown); },
    detach() { window.removeEventListener('keydown', onDown); },
    read() {
      const flap = queued;
      queued = false;
      return { flap };
    },
  };
}

function createLayoutHumanBinding() {
  let pendingY = null;
  function onClick(e) {
    const rect = canvas.getBoundingClientRect();
    pendingY = ((e.clientY - rect.top) / rect.height) * FIELD.height;
  }
  return {
    attach() { canvas.addEventListener('click', onClick); },
    detach() { canvas.removeEventListener('click', onClick); },
    read(state) {
      if (pendingY === null) return { assigns: [] };
      const y = pendingY;
      pendingY = null;
      const unlocked = state.columns.filter((c) => !c.locked).sort((a, b) => a.x - b.x);
      if (!unlocked.length) return { assigns: [] };
      const target = unlocked[0];
      const half = target.gapHeight / 2;
      const min = MARGIN + half, max = FIELD.height - MARGIN - half;
      return { assigns: [{ id: target.id, gapY: Math.max(min, Math.min(max, y)) }] };
    },
  };
}

// ---------------------------------------------------------------------
// Computer strategies
// ---------------------------------------------------------------------
// Picks gap positions for every not-yet-locked column. Bigger swings
// between consecutive gaps as difficulty rises -- more travel required,
// but always inside the field's valid bounds, so it's hard, never unfair.
function createLayoutStrategy() {
  const decided = new Map();
  let prevGapY = FIELD.height / 2;
  return function strategy(state, difficulty) {
    const assigns = [];
    const unlocked = state.columns.filter((c) => !c.locked).sort((a, b) => a.x - b.x);
    for (const col of unlocked) {
      if (!decided.has(col.id)) {
        const swing = 40 + difficulty * 160;
        const half = col.gapHeight / 2;
        const min = MARGIN + half, max = FIELD.height - MARGIN - half;
        let gapY = prevGapY + (Math.random() < 0.5 ? -1 : 1) * swing;
        gapY = Math.max(min, Math.min(max, gapY));
        decided.set(col.id, gapY);
        prevGapY = gapY;
      }
      assigns.push({ id: col.id, gapY: decided.get(col.id) });
    }
    return { assigns };
  };
}

// Only ever looks at `locked` columns -- structurally cannot react to a
// gap position that hasn't been revealed/fixed yet, human or computer.
function createRunnerStrategy() {
  let ticksSinceUpdate = 99;
  let decisionTargetY = FIELD.height / 2;
  return function strategy(state, difficulty) {
    const recomputeEvery = difficulty > 0.7 ? 1 : difficulty > 0.4 ? 2 : 4;
    ticksSinceUpdate++;

    if (ticksSinceUpdate >= recomputeEvery) {
      ticksSinceUpdate = 0;
      const candidates = state.columns
        .filter((c) => c.locked && c.x + COLUMN_WIDTH > RUNNER_X - RUNNER_RADIUS)
        .sort((a, b) => a.x - b.x);
      const target = candidates[0];
      if (target) {
        const jitter = (1 - difficulty) * 30 * (Math.random() * 2 - 1);
        decisionTargetY = target.gapY + jitter;
      } else {
        decisionTargetY = FIELD.height / 2;
      }
    }

    const margin = 10 + (1 - difficulty) * 10;
    const lookahead = state.runner.y + state.runner.vy * 0.05;
    return { flap: lookahead > decisionTargetY - margin };
  };
}

// ---------------------------------------------------------------------
// State
// ---------------------------------------------------------------------
let state, agents, running = false, gameOverFlag = false;

function resetState() {
  state = {
    runner: { y: FIELD.height / 2, vy: 0 },
    columns: [],
    spawnAcc: SPACING, // spawn one immediately
    nextId: 1,
    score: 0,
    elapsed: 0,
    gapHeight: gapHeightForElapsed(0),
  };
  gameOverFlag = false;
}

function buildAgents(assignment) {
  agents = {
    layout: assignment.layout === 'human'
      ? new HumanAgent(ROLES.layout, createLayoutHumanBinding())
      : new ComputerAgent(ROLES.layout, createLayoutStrategy(), new DifficultyCurve({ min: 0.1, max: 0.9, rampSeconds: 50 })),
    runner: assignment.runner === 'human'
      ? new HumanAgent(ROLES.runner, createRunnerHumanBinding('Space'))
      : new ComputerAgent(ROLES.runner, createRunnerStrategy(), new DifficultyCurve({ min: 0.15, max: 0.88, rampSeconds: 45 })),
  };
  agents.layout.attach();
  agents.runner.attach();
}

const roleControl = createRoleAssignmentControl({
  container: document.getElementById('role-assignment'),
  roles: [ROLES.layout, ROLES.runner],
  defaults: { layout: 'human', runner: 'computer' },
  onChange: (assignment) => {
    agents?.layout.detach();
    agents?.runner.detach();
    buildAgents(assignment);
  },
});
buildAgents(roleControl.get());

// ---------------------------------------------------------------------
// Physics
// ---------------------------------------------------------------------
function stepPhysics(dt, elapsed) {
  if (gameOverFlag) return;

  const scrollSpeed = scrollSpeedForElapsed(elapsed);
  state.gapHeight = gapHeightForElapsed(elapsed);
  state.elapsed = elapsed;

  state.spawnAcc += scrollSpeed * dt;
  if (state.spawnAcc >= SPACING) {
    state.spawnAcc -= SPACING;
    state.columns.push({
      id: state.nextId++,
      x: FIELD.width,
      gapY: FIELD.height / 2,
      gapHeight: state.gapHeight,
      locked: false,
      passed: false,
    });
  }

  const layoutAction = agents.layout.getInput(state);
  (layoutAction.assigns || []).forEach((a) => {
    const col = state.columns.find((c) => c.id === a.id);
    if (col && !col.locked) col.gapY = a.gapY;
  });

  state.columns.forEach((col) => {
    col.x -= scrollSpeed * dt;
    if (!col.locked && col.x <= LOCK_X) col.locked = true;
  });
  state.columns = state.columns.filter((col) => col.x + COLUMN_WIDTH > -10);

  const runnerAction = agents.runner.getInput(state);
  if (runnerAction.flap) state.runner.vy = FLAP_VELOCITY;
  state.runner.vy = Math.min(MAX_FALL_SPEED, state.runner.vy + GRAVITY * dt);
  state.runner.y += state.runner.vy * dt;

  if (state.runner.y - RUNNER_RADIUS < 0 || state.runner.y + RUNNER_RADIUS > FIELD.height) {
    gameOverFlag = true;
    return;
  }

  for (const col of state.columns) {
    const overlapsX = RUNNER_X + RUNNER_RADIUS > col.x && RUNNER_X - RUNNER_RADIUS < col.x + COLUMN_WIDTH;
    if (overlapsX && !col.passed) {
      const half = col.gapHeight / 2;
      const inGap = state.runner.y - RUNNER_RADIUS > col.gapY - half &&
                    state.runner.y + RUNNER_RADIUS < col.gapY + half;
      if (!inGap) { gameOverFlag = true; return; }
    }
    if (!col.passed && col.x + COLUMN_WIDTH < RUNNER_X - RUNNER_RADIUS) {
      col.passed = true;
      state.score++;
    }
  }
}

// ---------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------
const hudScore = document.getElementById('hud-score');
const hudSpeed = document.getElementById('hud-speed');
const hudStatus = document.getElementById('hud-status');

const loop = new GameLoop({
  canvas,
  update(dt, elapsed) {
    agents.layout.tick?.(dt);
    agents.runner.tick?.(dt);
    if (!running) return;

    stepPhysics(dt, elapsed);

    hudScore.textContent = String(state.score);
    hudSpeed.textContent = Math.round(scrollSpeedForElapsed(elapsed)) + 'px/s';
    hudStatus.textContent = gameOverFlag ? 'Splat!' : 'Playing';
  },
  render(ctx) {
    draw(ctx);
  },
});

function draw(ctx) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);

  // lock line
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.moveTo(LOCK_X, 0);
  ctx.lineTo(LOCK_X, FIELD.height);
  ctx.stroke();

  // columns
  state.columns.forEach((col) => {
    const half = col.gapHeight / 2;
    ctx.fillStyle = col.locked ? '#ffe94a' : 'rgba(255, 233, 74, 0.35)';
    ctx.fillRect(col.x, 0, COLUMN_WIDTH, col.gapY - half);
    ctx.fillRect(col.x, col.gapY + half, COLUMN_WIDTH, FIELD.height - (col.gapY + half));
    if (!col.locked) {
      ctx.strokeStyle = 'rgba(255, 233, 74, 0.6)';
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(col.x, 0, COLUMN_WIDTH, FIELD.height);
      ctx.setLineDash([]);
    }
  });

  // runner
  ctx.fillStyle = '#2de2ff';
  ctx.beginPath();
  ctx.arc(RUNNER_X, state.runner.y, RUNNER_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  if (gameOverFlag) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.fillStyle = '#ff2d95';
    ctx.font = '26px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SPLAT!', FIELD.width / 2, FIELD.height / 2);
    ctx.fillStyle = '#f2f2f8';
    ctx.font = '14px monospace';
    ctx.fillText(`Score: ${state.score}`, FIELD.width / 2, FIELD.height / 2 + 26);
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
