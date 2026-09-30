// Minesweeper: the flip is who lays the mines vs who sweeps them.
//
// Turn-based, not continuous, so this game doesn't use shared/js/engine.js's
// animation-loop GameLoop -- there's no physics to tick between clicks.
// It still reuses the Role/Agent/DifficultyCurve/createRoleAssignmentControl
// framework from shared/js/agent.js: agents are asked for their move at
// specific moments (an opening click, a placement decision, a sweep move)
// instead of every animation frame. Difficulty is keyed to LEVEL NUMBER
// (boards cleared) rather than elapsed seconds -- thinking time shouldn't
// count against a turn-based player -- by calling agent.tick(1) once per
// level-up instead of once per frame; DifficultyCurve's math is agnostic
// to what unit its input represents, so this is a straight reuse, not a
// fork.
import { Role, HumanAgent, ComputerAgent, DifficultyCurve, createRoleAssignmentControl } from '../../shared/js/agent.js';

const GRID_SIZE = 9;
const BASE_MINES = 10;
const MINES_PER_LEVEL = 4;
const MAX_MINES = 30;
const CELL_COUNT = GRID_SIZE * GRID_SIZE;

function mineCountForLevel(level) {
  return Math.min(MAX_MINES, BASE_MINES + (level - 1) * MINES_PER_LEVEL);
}

function idx(x, y) { return y * GRID_SIZE + x; }
function neighborsOf(i) {
  const x = i % GRID_SIZE, y = Math.floor(i / GRID_SIZE);
  const out = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) out.push(idx(nx, ny));
    }
  }
  return out;
}

const ROLES = {
  placer: new Role('placer', 'Mine Layout'),
  sweeper: new Role('sweeper', 'Sweeper'),
};

// ---------------------------------------------------------------------
// Computer strategies
// ---------------------------------------------------------------------
// Weighted placement: prefers cells next to already-placed mines (harder
// to deduce), scaled by difficulty. At difficulty 0 it's close to uniform
// random -- classic Minesweeper's baseline fairness.
function pickPlacerMines({ mineCount, excluded }, difficulty) {
  const eligible = [];
  for (let i = 0; i < CELL_COUNT; i++) if (!excluded.has(i)) eligible.push(i);
  const placed = new Set();

  for (let n = 0; n < mineCount && eligible.length; n++) {
    const weights = eligible.map((i) => {
      const adjMines = neighborsOf(i).filter((nb) => placed.has(nb)).length;
      return 1 + difficulty * adjMines * 3;
    });
    const totalW = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * totalW;
    let chosen = 0;
    for (let k = 0; k < weights.length; k++) {
      r -= weights[k];
      if (r <= 0) { chosen = k; break; }
    }
    placed.add(eligible[chosen]);
    eligible.splice(chosen, 1);
  }
  return { mines: [...placed] };
}

// Deterministic constraint propagation first (real solved information, not
// a guess, so this runs regardless of difficulty); when no certain move
// remains, difficulty decides whether the guess is uniform-random or
// weighted toward the statistically safer frontier cell. Never reads
// `isMine` on an unrevealed cell -- the view it receives doesn't have it.
function pickSweeperMove(view, difficulty) {
  const { cells } = view;
  const flagged = new Set();
  const safe = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (!c.revealed) continue;
      const nbrs = neighborsOf(i);
      const unrevealedUnflagged = nbrs.filter((n) => !cells[n].revealed && !flagged.has(n) && !safe.has(n));
      const flaggedCount = nbrs.filter((n) => flagged.has(n)).length;
      if (c.number === flaggedCount && unrevealedUnflagged.length > 0) {
        unrevealedUnflagged.forEach((n) => { if (!safe.has(n)) { safe.add(n); changed = true; } });
      } else if (c.number - flaggedCount === unrevealedUnflagged.length && unrevealedUnflagged.length > 0) {
        unrevealedUnflagged.forEach((n) => { if (!flagged.has(n)) { flagged.add(n); changed = true; } });
      }
    }
  }

  if (safe.size > 0) return { reveal: [...safe][0] };

  const unrevealedAll = cells.map((c, i) => ({ c, i })).filter(({ c, i }) => !c.revealed && !flagged.has(i));

  if (difficulty > 0.5) {
    const frontier = unrevealedAll.filter(({ i }) => neighborsOf(i).some((n) => cells[n].revealed));
    if (frontier.length) {
      let best = null, bestP = Infinity;
      for (const { i } of frontier) {
        const touching = neighborsOf(i).filter((n) => cells[n].revealed);
        let pSum = 0, pCount = 0;
        for (const n of touching) {
          const nbrs = neighborsOf(n);
          const unrev = nbrs.filter((m) => !cells[m].revealed && !flagged.has(m));
          const flC = nbrs.filter((m) => flagged.has(m)).length;
          if (unrev.length > 0) { pSum += (cells[n].number - flC) / unrev.length; pCount++; }
        }
        const p = pCount ? pSum / pCount : 1;
        if (p < bestP) { bestP = p; best = i; }
      }
      if (best != null) return { reveal: best };
    }
  }

  const pick = unrevealedAll[Math.floor(Math.random() * unrevealedAll.length)];
  return { reveal: pick.i };
}

// ---------------------------------------------------------------------
// Human input bindings
// ---------------------------------------------------------------------
// Human sweeper clicks are handled directly by onCellClick() below (calling
// handleOpening/resolveSweep with the clicked index immediately) rather than
// through a queued read(), since turn-based play has no per-frame poll to
// queue for. This binding exists so `agents.sweeper instanceof HumanAgent`
// works the same way it does for every other game in this project.
function createSweeperHumanBinding() {
  return { read() { return null; } };
}

function createPlacerHumanBinding() {
  const selected = new Set();
  return {
    toggle(i) { selected.has(i) ? selected.delete(i) : selected.add(i); },
    get selected() { return selected; },
    read() { return { mines: [...selected] }; },
    reset() { selected.clear(); },
  };
}

// ---------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------
let level = 1;
let state = null;
let agents = null;
let running = false;
let phase = 'idle'; // idle | opening | placing | sweeping | won | lost
let safeZone = new Set();
let placerBinding = null;
let sweeperBinding = null;

function newBoardState() {
  const mineCount = mineCountForLevel(level);
  return {
    mineCount,
    cells: Array.from({ length: CELL_COUNT }, () => ({ isMine: false, revealed: false, adjacent: 0 })),
  };
}

function sweeperView() {
  return {
    cells: state.cells.map((c) => (c.revealed ? { revealed: true, number: c.adjacent } : { revealed: false })),
  };
}

function buildAgents(assignment) {
  agents = {
    placer: assignment.placer === 'human'
      ? new HumanAgent(ROLES.placer, placerBinding)
      : new ComputerAgent(ROLES.placer, pickPlacerMines, new DifficultyCurve({ min: 0.1, max: 0.9, rampSeconds: 6 })),
    sweeper: assignment.sweeper === 'human'
      ? new HumanAgent(ROLES.sweeper, sweeperBinding)
      : new ComputerAgent(ROLES.sweeper, pickSweeperMove, new DifficultyCurve({ min: 0, max: 0.9, rampSeconds: 6 })),
  };
}

placerBinding = createPlacerHumanBinding();
sweeperBinding = createSweeperHumanBinding();

const roleControl = createRoleAssignmentControl({
  container: document.getElementById('role-assignment'),
  roles: [ROLES.placer, ROLES.sweeper],
  defaults: { placer: 'computer', sweeper: 'human' },
  onChange: (assignment) => {
    buildAgents(assignment);
    if (running) restartGame();
  },
});
buildAgents(roleControl.get());

// ---------------------------------------------------------------------
// HUD + rendering
// ---------------------------------------------------------------------
const boardEl = document.getElementById('ms-board');
const hudLevel = document.getElementById('hud-level');
const hudMines = document.getElementById('hud-mines');
const hudSafe = document.getElementById('hud-safe');
const hudStatus = document.getElementById('hud-status');
const placerControls = document.getElementById('ms-placer-controls');
const placerCountEl = document.getElementById('placer-count');
const placerTotalEl = document.getElementById('placer-total');
const btnConfirmMines = document.getElementById('btn-confirm-mines');

boardEl.style.gridTemplateColumns = `repeat(${GRID_SIZE}, 32px)`;

let cellButtons = [];
function buildBoardDom() {
  boardEl.innerHTML = '';
  cellButtons = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    const btn = document.createElement('button');
    btn.className = 'ms-cell';
    btn.type = 'button';
    btn.addEventListener('click', () => onCellClick(i));
    boardEl.appendChild(btn);
    cellButtons.push(btn);
  }
}
buildBoardDom();

function render() {
  const revealedSafe = state.cells.filter((c) => c.revealed && !c.isMine).length;
  hudLevel.textContent = String(level);
  hudMines.textContent = String(state.mineCount);
  hudSafe.textContent = String(CELL_COUNT - state.mineCount - revealedSafe);

  cellButtons.forEach((btn, i) => {
    const c = state.cells[i];
    btn.className = 'ms-cell';
    btn.textContent = '';
    btn.disabled = false;

    if (phase === 'placing' && agents.placer instanceof HumanAgent) {
      if (safeZone.has(i)) {
        btn.classList.add('ms-cell--safe-zone');
        btn.disabled = true;
      } else if (placerBinding.selected.has(i)) {
        btn.classList.add('ms-cell--pending-mine');
      }
      return;
    }

    if (c.revealed) {
      btn.classList.add('ms-cell--revealed');
      btn.disabled = true;
      if (c.isMine) {
        btn.classList.add(phase === 'lost' ? 'ms-cell--mine-hit' : 'ms-cell--mine');
        btn.textContent = '*';
      } else if (c.adjacent > 0) {
        btn.classList.add('ms-cell--n' + c.adjacent);
        btn.textContent = String(c.adjacent);
      }
    } else if (phase === 'lost' && c.isMine) {
      btn.classList.add('ms-cell--mine');
      btn.textContent = '*';
      btn.disabled = true;
    } else if (phase !== 'sweeping' && phase !== 'opening') {
      btn.disabled = true;
    }
  });
}

// ---------------------------------------------------------------------
// Round flow
// ---------------------------------------------------------------------
function startLevel() {
  state = newBoardState();
  safeZone = new Set();
  phase = 'opening';
  placerControls.hidden = true;
  render();
  hudStatus.textContent = 'Sweeper: pick an opening cell';

  if (agents.sweeper instanceof ComputerAgent) {
    setTimeout(() => {
      const move = agents.sweeper.getInput(sweeperView());
      handleOpening(move.reveal);
    }, 500);
  }
}

function onCellClick(i) {
  if (!running) return;
  if (phase === 'opening' && agents.sweeper instanceof HumanAgent) {
    handleOpening(i);
  } else if (phase === 'sweeping' && agents.sweeper instanceof HumanAgent) {
    resolveSweep(i);
  } else if (phase === 'placing' && agents.placer instanceof HumanAgent) {
    if (safeZone.has(i)) return;
    placerBinding.toggle(i);
    updatePlacerControls();
    render();
  }
}

function handleOpening(i) {
  safeZone = new Set([i, ...neighborsOf(i)]);
  phase = 'placing';
  render();

  if (agents.placer instanceof HumanAgent) {
    placerBinding.reset();
    placerControls.hidden = false;
    updatePlacerControls();
    hudStatus.textContent = 'Layout: place your mines';
    render();
  } else {
    hudStatus.textContent = 'Placing mines…';
    setTimeout(() => {
      const { mines } = agents.placer.getInput({ mineCount: state.mineCount, excluded: safeZone });
      finalizePlacement(mines, i);
    }, 500);
  }
}

function updatePlacerControls() {
  placerCountEl.textContent = String(placerBinding.selected.size);
  placerTotalEl.textContent = String(state.mineCount);
  btnConfirmMines.disabled = placerBinding.selected.size !== state.mineCount;
}

btnConfirmMines.addEventListener('click', () => {
  const { mines } = agents.placer.getInput();
  finalizePlacement(mines, [...safeZone][0]);
});

function finalizePlacement(mines, openingCell) {
  mines.forEach((i) => { state.cells[i].isMine = true; });
  state.cells.forEach((c, i) => {
    if (!c.isMine) c.adjacent = neighborsOf(i).filter((n) => state.cells[n].isMine).length;
  });
  placerControls.hidden = true;
  phase = 'sweeping';
  hudStatus.textContent = 'Sweeping…';
  resolveSweep(openingCell);
}

function floodReveal(i) {
  const stack = [i];
  while (stack.length) {
    const cur = stack.pop();
    const c = state.cells[cur];
    if (c.revealed) continue;
    c.revealed = true;
    if (c.adjacent === 0 && !c.isMine) {
      neighborsOf(cur).forEach((n) => { if (!state.cells[n].revealed) stack.push(n); });
    }
  }
}

function resolveSweep(i) {
  if (phase !== 'sweeping' || state.cells[i].revealed) return;
  floodReveal(i);
  render();

  if (state.cells[i].isMine) {
    endGame(false);
    return;
  }
  const revealedSafe = state.cells.filter((c) => c.revealed && !c.isMine).length;
  if (revealedSafe === CELL_COUNT - state.mineCount) {
    endGame(true);
    return;
  }

  if (agents.sweeper instanceof ComputerAgent) {
    setTimeout(() => {
      if (phase !== 'sweeping') return;
      const move = agents.sweeper.getInput(sweeperView());
      resolveSweep(move.reveal);
    }, 350);
  }
}

function endGame(won) {
  phase = won ? 'won' : 'lost';
  render();
  agents.placer.tick?.(1);
  agents.sweeper.tick?.(1);

  if (won) {
    hudStatus.textContent = `Level ${level} clear!`;
    level++;
    setTimeout(() => { if (running) startLevel(); }, 1200);
  } else {
    running = false;
    hudStatus.textContent = `Game Over — reached level ${level}`;
  }
}

function restartGame() {
  level = 1;
  running = true;
  startLevel();
}

document.getElementById('btn-start').addEventListener('click', () => {
  if (running) return;
  running = true;
  startLevel();
});

document.getElementById('btn-restart').addEventListener('click', restartGame);
