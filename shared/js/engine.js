// Shared fixed-timestep game loop used by every cabinet game.
// Games call `new GameLoop({ canvas, update, render }).start()` and only
// ever write game-specific logic inside `update(dt)` / `render(ctx, canvas)`.

export class GameLoop {
  constructor({ canvas, update, render, fixedStep = 1 / 60 }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.update = update;
    this.render = render;
    this.fixedStep = fixedStep;
    this.running = false;
    this.accumulator = 0;
    this.lastTime = 0;
    this.elapsed = 0;
    this._frame = this._frame.bind(this);

    // Pause automatically when the tab loses focus so the computer side
    // doesn't rack up "free" reaction time while the human is away, and
    // resume automatically when it's visible again -- games only call
    // start() once and rely on this to handle backgrounding by itself.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
      else if (!this.running) this.resume();
    });
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this._frame);
  }

  pause() {
    this.running = false;
  }

  resume() {
    if (this.running) return;
    this.start();
  }

  _frame(now) {
    if (!this.running) return;
    let delta = (now - this.lastTime) / 1000;
    this.lastTime = now;
    delta = Math.min(delta, 0.25); // guard against tab-switch spikes

    this.accumulator += delta;
    while (this.accumulator >= this.fixedStep) {
      this.update(this.fixedStep, this.elapsed);
      this.accumulator -= this.fixedStep;
      this.elapsed += this.fixedStep;
    }
    this.render(this.ctx, this.canvas, this.elapsed);
    requestAnimationFrame(this._frame);
  }
}

// Keeps a canvas crisp on high-DPI screens and lets games work in
// "logical" pixels (canvas.logicalWidth/Height) regardless of devicePixelRatio.
export function fitCanvasToContainer(canvas, logicalWidth, logicalHeight) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = logicalWidth * dpr;
  canvas.height = logicalHeight * dpr;
  canvas.style.width = logicalWidth + 'px';
  canvas.style.height = logicalHeight + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  canvas.logicalWidth = logicalWidth;
  canvas.logicalHeight = logicalHeight;
  return ctx;
}
