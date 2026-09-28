import { GameLoop, fitCanvasToContainer } from '../../shared/js/engine.js';
import { Role, HumanAgent, ComputerAgent, DifficultyCurve, createRoleAssignmentControl } from '../../shared/js/agent.js';

// ---------------------------------------------------------------------
// Grid setup
// ---------------------------------------------------------------------
const GRID = { cols: 20, rows: 20, cellSize: 24 };
const canvas = document.getElementById('game-canvas');
const ctx = fitCanvasToContainer(canvas, GRID.cols * GRID.cellSize, GRID.rows * GRID.cellSize);

const ROLES = {
  steerer: new Role('steerer', 'Steerer'),
  placer: new Role('placer', 'Apple Placer'),
};

// ---------------------------------------------------------------------
// Grid helpers
// ---------------------------------------------------------------------
function cellsEqual(a, b) { return a.x === b.x && a.y === b.y; }
function inBounds({ x, y }) { return x >= 0 && x < GRID.cols && y >= 0 && y < GRID.rows; }

function emptyCells(state) {
  const out = [];
  for (let y = 0; y < GRID.rows; y++) {
    for (let x = 0; x < GRID.cols; x++) {
      const cell = { x, y };
      if (!state.snake.some((s) => cellsEqual(s, cell))) out.push(cell);
    }
  }
  return out;
}

// BFS distance map from `start` over cells not blocked by the snake body.
function floodFill(state, start) {
  const dist = new Map();
  const key = (c) => `${c.x},${c.y}`;
  const blocked = new Set(state.snake.map(key));
  // Note: `start` itself may be part of the snake (e.g. the head when the
  // placer strategy seeds from it) -- only block *neighbors*, not the seed.
  const queue = [start];
  dist.set(key(start), 0);
  const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
  while (queue.length) {
    const cur = queue.shift();
    const d = dist.get(key(cur));
    for (const dir of dirs) {
      const next = { x: cur.x + dir.x, y: cur.y + dir.y };
      if (!inBounds(next) || blocked.has(key(next)) || dist.has(key(next))) continue;
      dist.set(key(next), d + 1);
      queue.push(next);
    }
  }
  return dist;
}

// BFS shortest path from head to target, returns first-step direction or null.
function pathFirstStep(state, from, to) {
  const key = (c) => `${c.x},${c.y}`;
  const blocked = new Set(state.snake.map(key));
  const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
  const cameFrom = new Map();
  const visited = new Set([key(from)]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    if (cellsEqual(cur, to)) {
      // walk back to the step adjacent to `from`
      let step = cur;
      while (cameFrom.has(key(step)) && !cellsEqual(cameFrom.get(key(step)), from)) {
        step = cameFrom.get(key(step));
      }
      return { x: step.x - from.x, y: step.y - from.y };
    }
    for (const dir of dirs) {
      const next = { x: cur.x + dir.x, y: cur.y + dir.y };
      if (!inBounds(next) || blocked.has(key(next)) || visited.has(key(next))) continue;
      visited.add(key(next));
      cameFrom.set(key(next), cur);
      queue.push(next);
    }
  }
  return null; // no path
}

// ---------------------------------------------------------------------
// Human input bindings
// ---------------------------------------------------------------------
function createSteererHumanBinding() {
  let dir = null;
  const map = {
    ArrowUp: { x: 0, y: -1 }, KeyW: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 }, KeyS: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 }, KeyA: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 }, KeyD: { x: 1, y: 0 },
  };
  function handleKey(e) {
    if (map[e.code]) { dir = map[e.code]; e.preventDefault(); }
  }
  return {
    attach() { window.addEventListener('keydown', handleKey); },
    detach() { window.removeEventListener('keydown', handleKey); },
    read() { return dir; },
  };
}

function createPlacerHumanBinding() {
  let queued = null;
  function handleClick(e) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * GRID.cols);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * GRID.rows);
    queued = { x, y };
  }
  return {
    attach() { canvas.addEventListener('click', handleClick); },
    detach() { canvas.removeEventListener('click', handleClick); },
    read(state) {
      if (!queued) return null;
      const cell = queued;
      queued = null;
      if (!inBounds(cell) || state.snake.some((s) => cellsEqual(s, cell))) return null;
      return cell;
    },
  };
}

// ---------------------------------------------------------------------
// Computer strategies
// ---------------------------------------------------------------------
// Memoized path, recomputed less often at low difficulty (staleness = mistakes).
let lastPath = { dir: null, ticksSinceRecompute: 99 };

function steererStrategy(state, difficulty) {
  const recomputeEvery = difficulty > 0.6 ? 1 : difficulty > 0.3 ? 2 : 3;
  lastPath.ticksSinceRecompute++;

  let dir = lastPath.dir;
  const needsFresh = dir === null || lastPath.ticksSinceRecompute >= recomputeEvery;

  if (needsFresh && state.apple) {
    dir = pathFirstStep(state, state.snake[0], state.apple);
    lastPath.ticksSinceRecompute = 0;
  }

  // Random mistake chance shrinks as difficulty rises.
  const mistakeChance = (1 - difficulty) * 0.15;
  const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
  const head = state.snake[0];
  const safeDirs = dirs.filter((d) => {
    const next = { x: head.x + d.x, y: head.y + d.y };
    return inBounds(next) && !state.snake.some((s) => cellsEqual(s, next));
  });

  if (Math.random() < mistakeChance && safeDirs.length) {
    dir = safeDirs[Math.floor(Math.random() * safeDirs.length)];
  }

  // No path to apple (or no apple yet): survive by heading toward the
  // safe direction with the most open space (flood-fill lookahead).
  if (!dir || !safeDirs.some((d) => d.x === dir.x && d.y === dir.y)) {
    let best = null, bestScore = -1;
    for (const d of safeDirs) {
      const next = { x: head.x + d.x, y: head.y + d.y };
      const space = floodFill(state, next).size;
      if (space > bestScore) { bestScore = space; best = d; }
    }
    dir = best;
  }

  lastPath.dir = dir;
  return dir;
}

function placerStrategy(state, difficulty) {
  const head = state.snake[0];
  const dist = floodFill(state, head);
  const candidates = emptyCells(state).filter((c) => dist.has(`${c.x},${c.y}`));
  if (!candidates.length) return null;

  const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
  const risk = candidates.map((c) => {
    const openNeighbors = dirs.filter((d) => {
      const n = { x: c.x + d.x, y: c.y + d.y };
      return inBounds(n) && !state.snake.some((s) => cellsEqual(s, n));
    }).length;
    // Low distance + few open neighbors = risky/tight placement.
    const distance = dist.get(`${c.x},${c.y}`);
    return { cell: c, score: distance * 0.5 + openNeighbors * 4 };
  });
  risk.sort((a, b) => a.score - b.score); // ascending: riskiest (lowest) first

  const idx = Math.min(risk.length - 1, Math.floor(difficulty * (risk.length - 1)));
  // difficulty 0 -> pick from the safe/easy end; difficulty 1 -> pick risky end
  const pick = risk[Math.round((risk.length - 1) - idx)];
  return pick.cell;
}

// ---------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------
let state, agents, running = false, gameOverFlag = false;
let moveAccumulator = 0;
const globalDifficulty = new DifficultyCurve({ min: 0, max: 1, rampSeconds: 90 });

function speedForElapsed(elapsedSeconds) {
  const d = globalDifficulty.at(elapsedSeconds);
  const maxMs = 220, minMs = 95;
  return maxMs - (maxMs - minMs) * d;
}

function resetState() {
  const startX = Math.floor(GRID.cols / 2);
  const startY = Math.floor(GRID.rows / 2);
  state = {
    snake: [{ x: startX, y: startY }, { x: startX - 1, y: startY }, { x: startX - 2, y: startY }],
    dir: { x: 1, y: 0 },
    apple: null,
    score: 0,
  };
  gameOverFlag = false;
  moveAccumulator = 0;
  lastPath = { dir: null, ticksSinceRecompute: 99 };
}

function buildAgents(assignment) {
  agents = {
    steerer: assignment.steerer === 'human'
      ? new HumanAgent(ROLES.steerer, createSteererHumanBinding())
      : new ComputerAgent(ROLES.steerer, steererStrategy, new DifficultyCurve({ min: 0.1, max: 0.85, rampSeconds: 45 })),
    placer: assignment.placer === 'human'
      ? new HumanAgent(ROLES.placer, createPlacerHumanBinding())
      : new ComputerAgent(ROLES.placer, placerStrategy, new DifficultyCurve({ min: 0.05, max: 0.95, rampSeconds: 45 })),
  };
  agents.steerer.attach();
  agents.placer.attach();
}

// ---------------------------------------------------------------------
// Role assignment UI
// ---------------------------------------------------------------------
const roleControl = createRoleAssignmentControl({
  container: document.getElementById('role-assignment'),
  roles: [ROLES.steerer, ROLES.placer],
  defaults: { steerer: 'human', placer: 'computer' },
  onChange: (assignment) => {
    agents?.steerer.detach();
    agents?.placer.detach();
    buildAgents(assignment);
  },
});
buildAgents(roleControl.get());

// ---------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------
const hudScore = document.getElementById('hud-score');
const hudSpeed = document.getElementById('hud-speed');
const hudStatus = document.getElementById('hud-status');

function tickMovement() {
  const desired = agents.steerer.getInput(state);
  if (desired && !(desired.x === -state.dir.x && desired.y === -state.dir.y)) {
    state.dir = desired;
  }
  const head = state.snake[0];
  const next = { x: head.x + state.dir.x, y: head.y + state.dir.y };

  if (!inBounds(next) || state.snake.some((s) => cellsEqual(s, next))) {
    gameOverFlag = true;
    hudStatus.textContent = 'Game Over';
    return;
  }

  state.snake.unshift(next);
  if (state.apple && cellsEqual(next, state.apple)) {
    state.score++;
    state.apple = null;
  } else {
    state.snake.pop();
  }
}

function tickPlacement() {
  if (state.apple) return;
  const placed = agents.placer.getInput(state);
  if (placed) state.apple = placed;
}

const moveIntervalMsRef = { value: 220 };

const loop = new GameLoop({
  canvas,
  update(dt, elapsed) {
    agents.steerer.tick?.(dt);
    agents.placer.tick?.(dt);

    if (!running || gameOverFlag) return;

    tickPlacement();
    if (!state.apple) return; // waiting on placer

    moveIntervalMsRef.value = speedForElapsed(elapsed);
    moveAccumulator += dt * 1000;
    if (moveAccumulator >= moveIntervalMsRef.value) {
      moveAccumulator = 0;
      tickMovement();
    }

    hudScore.textContent = String(state.score);
    hudSpeed.textContent = Math.round(1000 / moveIntervalMsRef.value * 10) / 10 + '/s';
    if (!gameOverFlag) hudStatus.textContent = state.apple ? 'Playing' : 'Waiting for apple…';
  },
  render(ctx2) {
    draw(ctx2);
  },
});

function draw(ctx2) {
  const w = GRID.cols * GRID.cellSize, h = GRID.rows * GRID.cellSize;
  ctx2.fillStyle = '#000';
  ctx2.fillRect(0, 0, w, h);

  ctx2.strokeStyle = 'rgba(255,255,255,0.04)';
  for (let x = 0; x <= GRID.cols; x++) {
    ctx2.beginPath(); ctx2.moveTo(x * GRID.cellSize, 0); ctx2.lineTo(x * GRID.cellSize, h); ctx2.stroke();
  }
  for (let y = 0; y <= GRID.rows; y++) {
    ctx2.beginPath(); ctx2.moveTo(0, y * GRID.cellSize); ctx2.lineTo(w, y * GRID.cellSize); ctx2.stroke();
  }

  if (state.apple) {
    ctx2.fillStyle = '#ff2d95';
    const p = 3;
    ctx2.fillRect(state.apple.x * GRID.cellSize + p, state.apple.y * GRID.cellSize + p, GRID.cellSize - p * 2, GRID.cellSize - p * 2);
  }

  state.snake.forEach((seg, i) => {
    ctx2.fillStyle = i === 0 ? '#2de2ff' : '#1a8fa8';
    ctx2.fillRect(seg.x * GRID.cellSize + 1, seg.y * GRID.cellSize + 1, GRID.cellSize - 2, GRID.cellSize - 2);
  });

  if (gameOverFlag) {
    ctx2.fillStyle = 'rgba(0,0,0,0.6)';
    ctx2.fillRect(0, 0, w, h);
    ctx2.fillStyle = '#ffe94a';
    ctx2.font = '20px monospace';
    ctx2.textAlign = 'center';
    ctx2.fillText('GAME OVER', w / 2, h / 2);
    ctx2.font = '13px monospace';
    ctx2.fillText(`Score: ${state.score}`, w / 2, h / 2 + 24);
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
