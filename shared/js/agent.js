// Shared Role/Agent framework.
//
// Every game defines exactly two Roles (e.g. "steerer" and "apple-placer"
// for Snake, "left paddle" and "right paddle" for Breakout). Each Role gets
// bound to either a HumanAgent or a ComputerAgent, and the game loop just
// asks each agent for its input every frame -- it never checks "is this the
// human?" anywhere in game logic. That's what makes "plays in both
// directions" free instead of a special case per game.

// difficulty(t) eases from `min` toward `max` and never reaches either
// extreme, which is the direct implementation of "never trivial, never
// impossible": max should be tuned so the computer is beatable by a
// competent player even at full ramp, and min should be tuned so it isn't
// a free win in the first few seconds.
export class DifficultyCurve {
  constructor({ min = 0.15, max = 0.9, rampSeconds = 45 } = {}) {
    this.min = min;
    this.max = max;
    this.rampSeconds = rampSeconds;
  }

  at(elapsedSeconds) {
    const t = Math.max(0, elapsedSeconds) / this.rampSeconds;
    const eased = 1 - Math.exp(-t); // 0 -> ~1, asymptotic
    return this.min + (this.max - this.min) * eased;
  }
}

export class Role {
  constructor(id, label) {
    this.id = id;
    this.label = label;
  }
}

export class Agent {
  constructor(role) {
    this.role = role;
  }
  // Called once before the loop starts (attach DOM listeners, etc).
  attach(_context) {}
  detach() {}
  // Called every fixed tick if the agent needs its own clock (computer agents).
  tick(_dt) {}
  // Must return a game-defined input object. Never throws in production
  // games -- base class throws only to catch missing implementations.
  getInput(_state) {
    throw new Error(`Agent for role "${this.role.id}" has no getInput()`);
  }
}

// inputBinding is game-specific: an object with .attach(el)/.detach()/.read(state)
// that translates raw keyboard/pointer/touch events into the same shape the
// ComputerAgent's strategy function returns for that role.
export class HumanAgent extends Agent {
  constructor(role, inputBinding) {
    super(role);
    this.inputBinding = inputBinding;
  }
  attach(context) {
    this.inputBinding.attach?.(context);
  }
  detach() {
    this.inputBinding.detach?.();
  }
  getInput(state) {
    return this.inputBinding.read(state);
  }
}

// strategyFn(state, difficulty) -> same input shape a HumanAgent would produce.
// Keeping the return shape identical is what guarantees "no scripted wins,
// no skipped collisions" -- the computer's move is just another input fed
// through the exact same rules engine a human's move goes through.
export class ComputerAgent extends Agent {
  constructor(role, strategyFn, difficultyCurve = new DifficultyCurve()) {
    super(role);
    this.strategyFn = strategyFn;
    this.difficulty = difficultyCurve;
    this.elapsed = 0;
  }
  tick(dt) {
    this.elapsed += dt;
  }
  getInput(state) {
    return this.strategyFn(state, this.difficulty.at(this.elapsed));
  }
}

// Builds a small "who plays which side" control shared by every game page.
// roles: [Role, Role]. onChange(assignment) fires whenever either side flips,
// where assignment = { [roleId]: 'human' | 'computer' }.
export function createRoleAssignmentControl({ container, roles, defaults, onChange }) {
  const assignment = { ...defaults };
  container.innerHTML = '';
  container.className = 'role-assignment';

  roles.forEach((role) => {
    const wrap = document.createElement('label');
    wrap.className = 'role-assignment__item';

    const span = document.createElement('span');
    span.className = 'role-assignment__label';
    span.textContent = role.label;

    const select = document.createElement('select');
    select.className = 'role-assignment__select';
    ;['human', 'computer'].forEach((val) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val === 'human' ? 'Human' : 'Computer';
      if (assignment[role.id] === val) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', () => {
      assignment[role.id] = select.value;
      onChange({ ...assignment });
    });

    wrap.appendChild(span);
    wrap.appendChild(select);
    container.appendChild(wrap);
  });

  return {
    get: () => ({ ...assignment }),
  };
}
