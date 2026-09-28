import { GameLoop, fitCanvasToContainer } from '../../shared/js/engine.js';
import { Role, HumanAgent, ComputerAgent, DifficultyCurve, createRoleAssignmentControl } from '../../shared/js/agent.js';

// ---------------------------------------------------------------------
// Field & physics constants
// ---------------------------------------------------------------------
const FIELD = { width: 640, height: 480 };
const SHIP = { radius: 9, thrustAccel: 240, rotateSpeed: 3.4, drag: 0.6 };
const ASTEROID_RADIUS = 14;

const canvas = document.getElementById('game-canvas');
fitCanvasToContainer(canvas, FIELD.width, FIELD.height);

const ROLES = {
  pilot: new Role('pilot', 'Pilot'),
  sender: new Role('sender', 'Asteroid Sender'),
};

const globalDifficulty = new DifficultyCurve({ min: 0, max: 1, rampSeconds: 75 });
function asteroidSpeedForElapsed(elapsed) {
  const d = globalDifficulty.at(elapsed);
  return 140 + (260 - 140) * d;
}
function spawnCooldownForElapsed(elapsed) {
  const d = globalDifficulty.at(elapsed);
  return 1300 - (1300 - 550) * d; // ms
}

function wrap(v, max) {
  if (v < 0) return v + max;
  if (v >= max) return v - max;
  return v;
}
function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ---------------------------------------------------------------------
// Human input: pilot (held keys), sender (click sets aim target).
// ---------------------------------------------------------------------
function createPilotHumanBinding() {
  const held = new Set();
  const codes = ['ArrowLeft', 'ArrowRight', 'ArrowUp'];
  function onDown(e) { if (codes.includes(e.code)) { held.add(e.code); e.preventDefault(); } }
  function onUp(e) { held.delete(e.code); }
  return {
    attach() { window.addEventListener('keydown', onDown); window.addEventListener('keyup', onUp); },
    detach() { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); held.clear(); },
    read() {
      let rotate = 0;
      if (held.has('ArrowLeft')) rotate -= 1;
      if (held.has('ArrowRight')) rotate += 1;
      return { rotate, thrust: held.has('ArrowUp') };
    },
  };
}

function createSenderHumanBinding() {
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
    read() {
      const target = queued;
      queued = null;
      return { spawnTarget: target };
    },
  };
}

// ---------------------------------------------------------------------
// Computer strategies
// ---------------------------------------------------------------------
// Steers away from the nearest asteroid: rotate toward the flee heading,
// thrust once roughly facing it. Reaction latency + angle jitter shrink as
// difficulty rises -- never a perfect, instant dodge.
function createPilotStrategy() {
  let ticksSinceUpdate = 99;
  let fleeHeading = 0;
  let hasThreat = false;
  return function strategy(state, difficulty) {
    const recomputeEvery = difficulty > 0.7 ? 1 : difficulty > 0.4 ? 2 : 4;
    ticksSinceUpdate++;

    if (ticksSinceUpdate >= recomputeEvery) {
      ticksSinceUpdate = 0;
      let nearest = null, nearestDist = Infinity;
      for (const a of state.asteroids) {
        const dx = a.x - state.ship.x, dy = a.y - state.ship.y;
        const dist = Math.hypot(dx, dy);
        if (dist < nearestDist) { nearestDist = dist; nearest = a; }
      }
      hasThreat = !!nearest && nearestDist < 260;
      if (hasThreat) {
        const angleToThreat = Math.atan2(nearest.y - state.ship.y, nearest.x - state.ship.x);
        const jitter = (1 - difficulty) * 0.6 * (Math.random() * 2 - 1);
        fleeHeading = angleToThreat + Math.PI + jitter;
      }
    }

    if (!hasThreat) return { rotate: 0, thrust: false };

    const diff = angleDiff(state.ship.angle, fleeHeading);
    const rotate = Math.abs(diff) < 0.08 ? 0 : (diff > 0 ? 1 : -1);
    const thrust = Math.abs(diff) < 0.5;
    return { rotate, thrust };
  };
}

// Aims at the ship's current position (not predicted), with jitter that
// shrinks as difficulty rises. Spawn point is always on the field edge, so
// there's always some minimum travel time -- never a point-blank hit.
function createSenderStrategy() {
  return function strategy(state, difficulty) {
    const jitterRadius = (1 - difficulty) * 140;
    const angle = Math.random() * Math.PI * 2;
    const target = {
      x: state.ship.x + Math.cos(angle) * jitterRadius * Math.random(),
      y: state.ship.y + Math.sin(angle) * jitterRadius * Math.random(),
    };
    return { spawnTarget: target };
  };
}

// ---------------------------------------------------------------------
// State
// ---------------------------------------------------------------------
let state, agents, running = false, gameOverFlag = false;

function resetState() {
  state = {
    ship: { x: FIELD.width / 2, y: FIELD.height / 2, vx: 0, vy: 0, angle: -Math.PI / 2 },
    asteroids: [],
    score: 0,
    elapsed: 0,
    nextSpawnReadyAt: 0,
  };
  gameOverFlag = false;
}

function buildAgents(assignment) {
  agents = {
    pilot: assignment.pilot === 'human'
      ? new HumanAgent(ROLES.pilot, createPilotHumanBinding())
      : new ComputerAgent(ROLES.pilot, createPilotStrategy(), new DifficultyCurve({ min: 0.15, max: 0.88, rampSeconds: 45 })),
    sender: assignment.sender === 'human'
      ? new HumanAgent(ROLES.sender, createSenderHumanBinding())
      : new ComputerAgent(ROLES.sender, createSenderStrategy(), new DifficultyCurve({ min: 0.1, max: 0.9, rampSeconds: 45 })),
  };
  agents.pilot.attach();
  agents.sender.attach();
}

const roleControl = createRoleAssignmentControl({
  container: document.getElementById('role-assignment'),
  roles: [ROLES.pilot, ROLES.sender],
  defaults: { pilot: 'human', sender: 'computer' },
  onChange: (assignment) => {
    agents?.pilot.detach();
    agents?.sender.detach();
    buildAgents(assignment);
  },
});
buildAgents(roleControl.get());

// ---------------------------------------------------------------------
// Physics
// ---------------------------------------------------------------------
function spawnAsteroidToward(target, speed) {
  const edge = Math.floor(Math.random() * 4);
  let x, y;
  if (edge === 0) { x = Math.random() * FIELD.width; y = -ASTEROID_RADIUS; }
  else if (edge === 1) { x = FIELD.width + ASTEROID_RADIUS; y = Math.random() * FIELD.height; }
  else if (edge === 2) { x = Math.random() * FIELD.width; y = FIELD.height + ASTEROID_RADIUS; }
  else { x = -ASTEROID_RADIUS; y = Math.random() * FIELD.height; }

  const dx = target.x - x, dy = target.y - y;
  const dist = Math.hypot(dx, dy) || 1;
  state.asteroids.push({
    x, y,
    vx: (dx / dist) * speed,
    vy: (dy / dist) * speed,
  });
}

function stepPhysics(dt, elapsed) {
  if (gameOverFlag) return;
  state.elapsed = elapsed;
  const speed = asteroidSpeedForElapsed(elapsed);

  // Sender
  const senderAction = agents.sender.getInput(state);
  if (senderAction.spawnTarget && elapsed >= state.nextSpawnReadyAt) {
    spawnAsteroidToward(senderAction.spawnTarget, speed);
    state.nextSpawnReadyAt = elapsed + spawnCooldownForElapsed(elapsed) / 1000;
  }

  // Pilot
  const pilotAction = agents.pilot.getInput(state);
  state.ship.angle += pilotAction.rotate * SHIP.rotateSpeed * dt;
  if (pilotAction.thrust) {
    state.ship.vx += Math.cos(state.ship.angle) * SHIP.thrustAccel * dt;
    state.ship.vy += Math.sin(state.ship.angle) * SHIP.thrustAccel * dt;
  }
  const dragFactor = Math.max(0, 1 - SHIP.drag * dt);
  state.ship.vx *= dragFactor;
  state.ship.vy *= dragFactor;
  state.ship.x = wrap(state.ship.x + state.ship.vx * dt, FIELD.width);
  state.ship.y = wrap(state.ship.y + state.ship.vy * dt, FIELD.height);

  // Asteroids: move, collide, remove off-screen
  for (const a of state.asteroids) {
    a.x += a.vx * dt;
    a.y += a.vy * dt;
  }
  for (const a of state.asteroids) {
    const dist = Math.hypot(a.x - state.ship.x, a.y - state.ship.y);
    if (dist < ASTEROID_RADIUS + SHIP.radius) {
      gameOverFlag = true;
      return;
    }
  }
  const before = state.asteroids.length;
  state.asteroids = state.asteroids.filter((a) =>
    a.x > -40 && a.x < FIELD.width + 40 && a.y > -40 && a.y < FIELD.height + 40
  );
  state.score += before - state.asteroids.length;
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
    agents.pilot.tick?.(dt);
    agents.sender.tick?.(dt);
    if (!running) return;

    stepPhysics(dt, elapsed);

    hudScore.textContent = String(state.score);
    hudSpeed.textContent = Math.round(asteroidSpeedForElapsed(elapsed)) + 'px/s';
    hudStatus.textContent = gameOverFlag ? 'Destroyed!' : 'Playing';
  },
  render(ctx) {
    draw(ctx);
  },
});

function draw(ctx) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);

  // ship
  ctx.save();
  ctx.translate(state.ship.x, state.ship.y);
  ctx.rotate(state.ship.angle);
  ctx.strokeStyle = '#2de2ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.lineTo(-9, 7);
  ctx.lineTo(-5, 0);
  ctx.lineTo(-9, -7);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // asteroids
  ctx.fillStyle = '#ffe94a';
  state.asteroids.forEach((a) => {
    ctx.beginPath();
    ctx.arc(a.x, a.y, ASTEROID_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  });

  if (gameOverFlag) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.fillStyle = '#ff2d95';
    ctx.font = '26px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('DESTROYED', FIELD.width / 2, FIELD.height / 2);
    ctx.fillStyle = '#f2f2f8';
    ctx.font = '14px monospace';
    ctx.fillText(`Dodged: ${state.score}`, FIELD.width / 2, FIELD.height / 2 + 26);
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
