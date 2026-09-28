// Shared "simulate matchmaking" helper.
//
// Requirement: a match must not connect instantly, so that connecting to an
// AI opponent isn't obviously instant/scripted compared to waiting for a
// real human. Any game that offers a "vs AI, disguised" mode (Imitation, and
// optionally others) can reuse this instead of reinventing a fake queue.
//
// statusEl: element to receive status text updates (optional).
// Returns a Promise that resolves after a randomized delay in [minMs, maxMs].
export function simulateMatchmaking({
  statusEl = null,
  minMs = 2500,
  maxMs = 6000,
  messages = [
    'Searching for an opponent…',
    'Checking the queue…',
    'Found a candidate, verifying connection…',
    'Almost there…',
  ],
} = {}) {
  return new Promise((resolve) => {
    const delay = minMs + Math.random() * (maxMs - minMs);
    let i = 0;
    if (statusEl) statusEl.textContent = messages[0];
    const interval = setInterval(() => {
      i = (i + 1) % messages.length;
      if (statusEl) statusEl.textContent = messages[i];
    }, 900);
    setTimeout(() => {
      clearInterval(interval);
      if (statusEl) statusEl.textContent = 'Match found.';
      resolve();
    }, delay);
  });
}
