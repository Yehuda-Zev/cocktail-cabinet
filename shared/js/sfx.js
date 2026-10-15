// Shared sound effects, synthesized with the Web Audio API -- no audio files
// to load or license. Browsers only allow audio after a user gesture, so the
// AudioContext is created on the first click or keypress; sounds requested
// before then are skipped silently. Mute state persists in localStorage and
// is shared by every page on the site.

const STORAGE_KEY = 'cabinet-sfx-muted';
const MIN_GAP_MS = 30; // stops the same sound stacking up within one frame

let ctx = null;
let master = null;
let muted = false;
const lastPlayed = {};

try { muted = localStorage.getItem(STORAGE_KEY) === '1'; } catch { /* storage blocked */ }

function unlock() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = 0.25;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

function tone({ freq, to = freq, dur = 0.08, type = 'square', vol = 1, delay = 0 }) {
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to !== freq) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.3, vol = 1, cutoff = 1200, delay = 0 }) {
  const t0 = ctx.currentTime + delay;
  const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(cutoff, t0);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(gain).connect(master);
  src.start(t0);
  src.stop(t0 + dur);
}

function arpeggio(freqs, { step = 0.07, dur = 0.08, type = 'square', vol = 0.6 } = {}) {
  freqs.forEach((freq, i) => tone({ freq, dur, type, vol, delay: i * step }));
}

const SOUNDS = {
  blip: () => tone({ freq: 660, dur: 0.05, vol: 0.5 }),
  pickup: () => arpeggio([520, 880], { step: 0.06 }),
  hit: () => tone({ freq: 440, dur: 0.06, vol: 0.7 }),
  bounce: () => tone({ freq: 220, dur: 0.04, type: 'triangle', vol: 0.5 }),
  brick: () => tone({ freq: 990, dur: 0.05, type: 'triangle', vol: 0.6 }),
  point: () => arpeggio([523, 659, 784]),
  flap: () => tone({ freq: 300, to: 620, dur: 0.08, type: 'sine', vol: 0.6 }),
  shoot: () => tone({ freq: 900, to: 220, dur: 0.12, vol: 0.4 }),
  launch: () => tone({ freq: 180, to: 90, dur: 0.18, type: 'sawtooth', vol: 0.35 }),
  explode: () => noise({ dur: 0.45, vol: 0.9, cutoff: 900 }),
  crash: () => {
    noise({ dur: 0.6, vol: 1, cutoff: 600 });
    tone({ freq: 160, to: 40, dur: 0.5, type: 'sawtooth', vol: 0.5 });
  },
  lose: () => tone({ freq: 440, to: 70, dur: 0.6, type: 'sawtooth', vol: 0.5 }),
  win: () => arpeggio([523, 659, 784, 1047], { step: 0.09, dur: 0.12 }),
  levelup: () => arpeggio([392, 523, 659, 784, 1047], { step: 0.05, dur: 0.07, type: 'triangle', vol: 0.7 }),
  reveal: () => tone({ freq: 1200, dur: 0.025, vol: 0.35 }),
  place: () => tone({ freq: 330, dur: 0.05, type: 'triangle', vol: 0.6 }),
  send: () => tone({ freq: 700, dur: 0.06, type: 'sine', vol: 0.5 }),
  receive: () => arpeggio([880, 1175], { step: 0.06, dur: 0.07, type: 'sine', vol: 0.5 }),
  match: () => arpeggio([660, 990], { step: 0.1, dur: 0.12, type: 'triangle', vol: 0.8 }),
};

export function sfx(name) {
  if (muted || !ctx || ctx.state !== 'running') return;
  const now = performance.now();
  if (now - (lastPlayed[name] || 0) < MIN_GAP_MS) return;
  lastPlayed[name] = now;
  SOUNDS[name]?.();
}

// Puts a "Sound: on/off" button in the game header, in place of the empty
// spacer on its right.
export function installMuteToggle(header = document.querySelector('.game-header')) {
  if (!header) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sfx-toggle';
  const render = () => {
    btn.textContent = muted ? 'Sound: off' : 'Sound: on';
    btn.setAttribute('aria-pressed', String(!muted));
  };
  btn.addEventListener('click', () => {
    muted = !muted;
    try { localStorage.setItem(STORAGE_KEY, muted ? '1' : '0'); } catch { /* storage blocked */ }
    render();
    if (!muted) { unlock(); sfx('blip'); }
  });
  render();
  const spacer = header.querySelector(':scope > span:last-child');
  if (spacer) spacer.replaceWith(btn);
  else header.appendChild(btn);
}
