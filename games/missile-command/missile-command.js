import { GameLoop, fitCanvasToContainer } from '../../shared/js/engine.js';
import { Role, HumanAgent, ComputerAgent, DifficultyCurve, createRoleAssignmentControl } from '../../shared/js/agent.js';

// ---------------------------------------------------------------------
// Field & constants
// ---------------------------------------------------------------------
const FIELD = { width: 640, height: 480 };
const GROUND_Y = FIELD.height - 30;
const CITY_COUNT = 5;
const CITY_WIDTH = 40;
const LAUNCH = { x: FIELD.width / 2, y: FIELD.height - 10 };
const INTERCEPTOR_SPEED = 420;
const FIRE_COOLDOWN_MS = 350; // constant -- same rate cap for human and computer
const EXPLOSION = { max: 50, grow: 0.35, hold: 0.15, fade: 0.35 };

const canvas = document.getElementById('game-canvas');
fitCanvasToContainer(canvas, FIELD.width, FIELD.height);

const ROLES = {
  defender: new Role('defender', 'Defender'),
  attacker: new Role('attacker', 'Attacker'),
};

const globalDifficulty = new DifficultyCurve({ min: 0, max: 1, rampSeconds: 80 });
function missileSpeedForElapsed(elapsed) {
  const d = globalDifficulty.at(elapsed);
  return 90 + (190 - 90) * d;
}
function missileCooldownForElapsed(elapsed) {
  const d = globalDifficulty.at(elapsed);
  return 1600 - (1600 - 700) * d; // ms
}

function cityXPositions() {
  const margin = 60;
  const usable = FIELD.width - margin * 2;
  const xs = [];
  for (let i = 0; i < CITY_COUNT; i++) {
    xs.push(margin + (usable * i) / (CITY_COUNT - 1));
  }
  return xs;
}

// ---------------------------------------------------------------------
// Human input: both roles aim by clicking, semantics differ.
// ---------------------------------------------------------------------
function createDefenderHumanBinding() {
  let queued = null;
  function onClick(e) {
    const rect = canvas.getBoundingClientRect();
    queued = {
      x: ((e.clientX - rect.left) / rect.width) * FIELD.width,
      y: ((e.clientY - rect.top) / rect.height) * FIELD.height,
    };
  }
  return {
    attach() { canvas.addEventListener('click', onClick); },
    detach() { canvas.removeEventListener('click', onClick); },
    read() { const t = queued; queued = null; return { fireAt: t }; },
  };
}

function createAttackerHumanBinding() {
  let queued = null;
  function onClick(e) {
    const rect = canvas.getBoundingClientRect();
    queued = ((e.clientX - rect.left) / rect.width) * FIELD.width;
  }
  return {
    attach() { canvas.addEventListener('click', onClick); },
    detach() { canvas.removeEventListener('click', onClick); },
    read() { const x = queued; queued = null; return { targetX: x }; },
  };
}

// ---------------------------------------------------------------------
// Computer strategies
// ---------------------------------------------------------------------
// Predicts an intercept point via a few fixed-point iterations (interceptor
// travel time depends on where it's going, which depends on travel time).
// Reaction latency + aim jitter shrink as difficulty rises.
function createDefenderStrategy() {
  let ticksSinceUpdate = 99;
  let plannedTarget = null;
  return function strategy(state, difficulty) {
    const recomputeEvery = difficulty > 0.7 ? 1 : difficulty > 0.4 ? 2 : 4;
    ticksSinceUpdate++;

    if (ticksSinceUpdate >= recomputeEvery) {
      ticksSinceUpdate = 0;
      const aliveXs = state.cities.filter((c) => c.alive).map((c) => c.x);
      let best = null, bestTime = Infinity;
      for (const m of state.missiles) {
        const willHitCity = aliveXs.some((cx) => Math.abs(cx - m.targetX) < CITY_WIDTH / 2);
        if (!willHitCity) continue;
        const timeToGround = (GROUND_Y - m.y) / m.vy;
        if (timeToGround < bestTime) { bestTime = timeToGround; best = m; }
      }
      if (best) {
        let t = Math.hypot(best.x - LAUNCH.x, best.y - LAUNCH.y) / INTERCEPTOR_SPEED;
        for (let i = 0; i < 5; i++) {
          const px = best.x + best.vx * t, py = best.y + best.vy * t;
          t = Math.hypot(px - LAUNCH.x, py - LAUNCH.y) / INTERCEPTOR_SPEED;
        }
        const jitter = (1 - difficulty) * 45;
        plannedTarget = {
          x: best.x + best.vx * t + (Math.random() * 2 - 1) * jitter,
          y: Math.min(GROUND_Y - 5, best.y + best.vy * t + (Math.random() * 2 - 1) * jitter),
        };
      } else {
        plannedTarget = null;
      }
    }
    return { fireAt: plannedTarget };
  };
}

// Targets a living city, with aim jitter that shrinks as difficulty rises.
function createAttackerStrategy() {
  return function strategy(state, difficulty) {
    const alive = state.cities.filter((c) => c.alive);
    if (!alive.length) return { targetX: null };
    const city = alive[Math.floor(Math.random() * alive.length)];
    const jitter = (1 - difficulty) * 70;
    return { targetX: city.x + (Math.random() * 2 - 1) * jitter };
  };
}

// ---------------------------------------------------------------------
// State
// ---------------------------------------------------------------------
let state, agents, running = false, gameOverFlag = false;

function resetState() {
  state = {
    cities: cityXPositions().map((x) => ({ x, alive: true })),
    missiles: [],
    interceptors: [],
    explosions: [],
    score: 0,
    elapsed: 0,
    nextMissileReadyAt: 0,
    nextFireReadyAt: 0,
  };
  gameOverFlag = false;
}

function buildAgents(assignment) {
  agents = {
    defender: assignment.defender === 'human'
      ? new HumanAgent(ROLES.defender, createDefenderHumanBinding())
      : new ComputerAgent(ROLES.defender, createDefenderStrategy(), new DifficultyCurve({ min: 0.15, max: 0.88, rampSeconds: 45 })),
    attacker: assignment.attacker === 'human'
      ? new HumanAgent(ROLES.attacker, createAttackerHumanBinding())
      : new ComputerAgent(ROLES.attacker, createAttackerStrategy(), new DifficultyCurve({ min: 0.1, max: 0.9, rampSeconds: 45 })),
  };
  agents.defender.attach();
  agents.attacker.attach();
}

const roleControl = createRoleAssignmentControl({
  container: document.getElementById('role-assignment'),
  roles: [ROLES.defender, ROLES.attacker],
  defaults: { defender: 'human', attacker: 'computer' },
  onChange: (assignment) => {
    agents?.defender.detach();
    agents?.attacker.detach();
    buildAgents(assignment);
  },
});
buildAgents(roleControl.get());

// ---------------------------------------------------------------------
// Physics
// ---------------------------------------------------------------------
function explosionRadius(explosion, elapsed) {
  const age = elapsed - explosion.startElapsed;
  const { max, grow, hold, fade } = EXPLOSION;
  if (age < grow) return max * (age / grow);
  if (age < grow + hold) return max;
  if (age < grow + hold + fade) return max * (1 - (age - grow - hold) / fade);
  return 0;
}

function stepPhysics(dt, elapsed) {
  if (gameOverFlag) return;
  state.elapsed = elapsed;
  const missileSpeed = missileSpeedForElapsed(elapsed);

  // Attacker
  const attackerAction = agents.attacker.getInput(state);
  if (attackerAction.targetX != null && elapsed >= state.nextMissileReadyAt) {
    const spawnX = Math.random() * FIELD.width;
    const dx = attackerAction.targetX - spawnX, dy = GROUND_Y - 0;
    const dist = Math.hypot(dx, dy) || 1;
    state.missiles.push({
      x: spawnX, y: 0,
      vx: (dx / dist) * missileSpeed, vy: (dy / dist) * missileSpeed,
      targetX: attackerAction.targetX,
    });
    state.nextMissileReadyAt = elapsed + missileCooldownForElapsed(elapsed) / 1000;
  }

  // Defender
  const defenderAction = agents.defender.getInput(state);
  if (defenderAction.fireAt && elapsed >= state.nextFireReadyAt) {
    const dx = defenderAction.fireAt.x - LAUNCH.x, dy = defenderAction.fireAt.y - LAUNCH.y;
    const dist = Math.hypot(dx, dy) || 1;
    state.interceptors.push({
      x: LAUNCH.x, y: LAUNCH.y,
      vx: (dx / dist) * INTERCEPTOR_SPEED, vy: (dy / dist) * INTERCEPTOR_SPEED,
      targetX: defenderAction.fireAt.x, targetY: defenderAction.fireAt.y,
    });
    state.nextFireReadyAt = elapsed + FIRE_COOLDOWN_MS / 1000;
  }

  // Move missiles
  state.missiles.forEach((m) => { m.x += m.vx * dt; m.y += m.vy * dt; });

  // Move interceptors; arrived ones become explosions
  const arrived = [];
  state.interceptors.forEach((ic) => {
    const remaining = Math.hypot(ic.targetX - ic.x, ic.targetY - ic.y);
    const step = INTERCEPTOR_SPEED * dt;
    if (remaining <= step) {
      arrived.push(ic);
    } else {
      ic.x += ic.vx * dt; ic.y += ic.vy * dt;
    }
  });
  arrived.forEach((ic) => {
    state.interceptors.splice(state.interceptors.indexOf(ic), 1);
    state.explosions.push({ x: ic.targetX, y: ic.targetY, startElapsed: elapsed });
  });

  // Explosion vs missile
  state.explosions.forEach((ex) => {
    const r = explosionRadius(ex, elapsed);
    if (r < 4) return;
    state.missiles = state.missiles.filter((m) => {
      const hit = Math.hypot(m.x - ex.x, m.y - ex.y) < r;
      if (hit) state.score++;
      return !hit;
    });
  });
  state.explosions = state.explosions.filter((ex) => explosionRadius(ex, elapsed) > 0 || elapsed - ex.startElapsed < EXPLOSION.grow);

  // Missile vs ground
  state.missiles = state.missiles.filter((m) => {
    if (m.y < GROUND_Y) return true;
    let nearest = null, nearestDist = Infinity;
    for (const c of state.cities) {
      if (!c.alive) continue;
      const d = Math.abs(c.x - m.x);
      if (d < nearestDist) { nearestDist = d; nearest = c; }
    }
    if (nearest && nearestDist <= CITY_WIDTH / 2) nearest.alive = false;
    return false;
  });

  if (state.cities.every((c) => !c.alive)) gameOverFlag = true;
}

// ---------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------
const hudScore = document.getElementById('hud-score');
const hudCities = document.getElementById('hud-cities');
const hudStatus = document.getElementById('hud-status');

const loop = new GameLoop({
  canvas,
  update(dt, elapsed) {
    agents.defender.tick?.(dt);
    agents.attacker.tick?.(dt);
    if (!running) return;

    stepPhysics(dt, elapsed);

    hudScore.textContent = String(state.score);
    const aliveCount = state.cities.filter((c) => c.alive).length;
    hudCities.textContent = `${aliveCount}/${CITY_COUNT}`;
    hudStatus.textContent = gameOverFlag ? 'Overrun!' : 'Playing';
  },
  render(ctx) {
    draw(ctx);
  },
});

function draw(ctx) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);

  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(FIELD.width, GROUND_Y);
  ctx.stroke();

  state.cities.forEach((c) => {
    ctx.fillStyle = c.alive ? '#2de2ff' : '#3a3a52';
    ctx.fillRect(c.x - CITY_WIDTH / 2, GROUND_Y - 16, CITY_WIDTH, 16);
  });

  ctx.fillStyle = '#ffe94a';
  state.missiles.forEach((m) => {
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.lineTo(m.x - m.vx * 0.03, m.y - m.vy * 0.03);
    ctx.strokeStyle = '#ffe94a';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  ctx.strokeStyle = '#f2f2f8';
  state.interceptors.forEach((ic) => {
    ctx.beginPath();
    ctx.moveTo(ic.x, ic.y);
    ctx.lineTo(LAUNCH.x, LAUNCH.y);
    ctx.stroke();
  });

  state.explosions.forEach((ex) => {
    const r = explosionRadius(ex, state.elapsed);
    if (r <= 0) return;
    ctx.fillStyle = 'rgba(255, 45, 149, 0.55)';
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, r, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = '#2de2ff';
  ctx.fillRect(LAUNCH.x - 4, LAUNCH.y - 4, 8, 8);

  if (gameOverFlag) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.fillStyle = '#ff2d95';
    ctx.font = '26px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('OVERRUN', FIELD.width / 2, FIELD.height / 2);
    ctx.fillStyle = '#f2f2f8';
    ctx.font = '14px monospace';
    ctx.fillText(`Intercepted: ${state.score}`, FIELD.width / 2, FIELD.height / 2 + 26);
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
