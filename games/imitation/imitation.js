// Imitation: pairs the player with a human (over serverless WebRTC via
// Trystero) or the AI (a separate Claude Artifact, "Turing Booth" --
// necessary because the `sample` capability that lets it ask Claude with
// no API key only exists on a page viewed through claude.ai's own
// artifact viewer; there is no way to call it from a page on this site).
//
// Both outcomes open in a new, deliberately bare popup window (no cabinet
// chrome) after the same matchmaking delay, so the transition itself
// gives nothing away. The chat happens entirely in that popup; this page
// keeps the timer and runs the Human/AI guess + reveal once the player
// comes back, so that part of the experience is identical either way.
// Full writeup of why full disguise isn't possible: ARCHITECTURE.md.

import { joinRoom, selfId } from 'https://cdn.jsdelivr.net/npm/@trystero-p2p/nostr/+esm';

const APP_ID = 'cocktail-cabinet-imitation-v1';
const LOBBY_ROOM_ID = 'lobby';
const AI_ARTIFACT_URL = 'https://claude.ai/artifact/1yeHi97ec9a9HV3iRG79Sp';
const POPUP_FEATURES = 'width=420,height=640,noopener';
const CHAT_SECONDS = 90;
const MIN_MATCHMAKING_MS = 3000;
const STATUS_MESSAGES = [
  'Searching for an opponent…',
  'Checking the queue…',
  'Looking for a good match…',
  'Almost there…',
];

const screens = {
  intro: document.getElementById('screen-intro'),
  matching: document.getElementById('screen-matching'),
  chat: document.getElementById('screen-chat'),
  guess: document.getElementById('screen-guess'),
  result: document.getElementById('screen-result'),
};

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.hidden = key !== name;
  });
}

// ---------------------------------------------------------------------
// Matchmaking UI (real wait, with a minimum floor so it's never
// suspiciously instant -- required regardless of who/what you're paired
// with).
// ---------------------------------------------------------------------
const matchingStatusEl = document.getElementById('matching-status');
let statusCycleHandle = null;
let matchStartTime = 0;

function beginMatchmakingUI() {
  showScreen('matching');
  matchStartTime = performance.now();
  let i = 0;
  matchingStatusEl.textContent = STATUS_MESSAGES[0];
  statusCycleHandle = setInterval(() => {
    i = (i + 1) % STATUS_MESSAGES.length;
    matchingStatusEl.textContent = STATUS_MESSAGES[i];
  }, 1000);
}

function transitionOnceMinimumElapsed(onReady) {
  const elapsed = performance.now() - matchStartTime;
  const remaining = Math.max(0, MIN_MATCHMAKING_MS - elapsed);
  setTimeout(() => {
    clearInterval(statusCycleHandle);
    statusCycleHandle = null;
    onReady();
  }, remaining);
}

// ---------------------------------------------------------------------
// Human-vs-human pairing: everyone looking for a match joins a shared
// lobby room, announces themselves, and the two lowest-sorted IDs pair
// off, agreeing on a private room id. This page never joins that private
// room itself -- it hands the id to the popup and lets that page connect.
// ---------------------------------------------------------------------
let lobby = null;
let paired = false;

function connectToHumanOpponent(onPaired) {
  paired = false;
  lobby = joinRoom({ appId: APP_ID }, LOBBY_ROOM_ID);
  const hello = lobby.makeAction('hello');
  const proposeMatch = lobby.makeAction('match');

  lobby.onPeerJoin = (peerId) => {
    hello.send({ id: selfId }, { target: peerId });
  };

  hello.onMessage = (data, meta) => {
    if (paired) return;
    if (selfId < data.id) {
      paired = true;
      const roomId = 'match-' + [selfId, data.id].sort().join('-');
      proposeMatch.send({ roomId }, { target: meta.peerId });
      lobby.leave();
      lobby = null;
      onPaired(roomId);
    }
  };

  proposeMatch.onMessage = (data) => {
    if (paired) return;
    paired = true;
    lobby.leave();
    lobby = null;
    onPaired(data.roomId);
  };
}

// ---------------------------------------------------------------------
// Opening the opponent's chat window
// ---------------------------------------------------------------------
let opponentType = null;
let opponentWindow = null;

function openOpponentWindow(info, popup) {
  opponentType = info.kind;
  opponentWindow = popup;
  const url = info.kind === 'ai'
    ? AI_ARTIFACT_URL
    : `chat.html?room=${encodeURIComponent(info.roomId)}`;

  const fallbackEl = document.getElementById('popup-fallback');
  if (popup && !popup.closed) {
    popup.location.href = url;
    fallbackEl.hidden = true;
  } else {
    fallbackEl.hidden = false;
    fallbackEl.innerHTML = '';
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Your browser blocked the popup — click here to open your chat';
    link.style.color = '#2de2ff';
    fallbackEl.appendChild(link);
  }

  enterWaitingPhase();
}

// ---------------------------------------------------------------------
// Waiting phase (main window): just the timer, while chat happens in the
// popup.
// ---------------------------------------------------------------------
const chatTimerEl = document.getElementById('chat-timer');
const btnReadyGuess = document.getElementById('btn-ready-guess');
let chatTimerHandle = null;

function enterWaitingPhase() {
  showScreen('chat');
  let secondsLeft = CHAT_SECONDS;
  chatTimerEl.textContent = String(secondsLeft);
  chatTimerHandle = setInterval(() => {
    secondsLeft--;
    chatTimerEl.textContent = String(Math.max(0, secondsLeft));
    if (secondsLeft <= 0) {
      clearInterval(chatTimerHandle);
      goToGuessPhase();
    }
  }, 1000);
}

btnReadyGuess.addEventListener('click', () => {
  clearInterval(chatTimerHandle);
  goToGuessPhase();
});

// ---------------------------------------------------------------------
// Guess + result
// ---------------------------------------------------------------------
const resultTextEl = document.getElementById('result-text');

function goToGuessPhase() {
  if (opponentWindow && !opponentWindow.closed) opponentWindow.close();
  showScreen('guess');
}

function submitGuess(guess) {
  const correct = guess === opponentType;
  const truth = opponentType === 'human' ? 'a HUMAN' : 'the AI';
  resultTextEl.textContent =
    `You guessed ${guess.toUpperCase()}. You were actually talking to ${truth}. ` +
    (correct ? 'Correct!' : 'Incorrect.');
  showScreen('result');
  cleanupConnection();
}

document.getElementById('btn-guess-human').addEventListener('click', () => submitGuess('human'));
document.getElementById('btn-guess-ai').addEventListener('click', () => submitGuess('ai'));

function cleanupConnection() {
  if (lobby) {
    lobby.leave();
    lobby = null;
  }
}

// ---------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------
function startMatchmaking(popup) {
  beginMatchmakingUI();
  const isAI = Math.random() < 0.5;
  if (isAI) {
    transitionOnceMinimumElapsed(() => openOpponentWindow({ kind: 'ai' }, popup));
  } else {
    connectToHumanOpponent((roomId) => {
      transitionOnceMinimumElapsed(() => openOpponentWindow({ kind: 'human', roomId }, popup));
    });
  }
}

document.getElementById('btn-find-match').addEventListener('click', () => {
  // Open the popup synchronously, inside this click handler, so browsers
  // don't treat it as an unsolicited popup once matchmaking's async delay
  // has passed -- it's redirected to the real destination once known.
  const popup = window.open('', '_blank', POPUP_FEATURES);
  if (popup) {
    popup.document.title = 'Connecting…';
    popup.document.body.style.cssText =
      'margin:0;height:100vh;display:flex;align-items:center;justify-content:center;' +
      'background:#0b0b12;color:#9a9ab0;font-family:monospace;font-size:0.9rem;';
    popup.document.body.textContent = 'Connecting…';
  }
  startMatchmaking(popup);
});

document.getElementById('btn-play-again').addEventListener('click', () => {
  showScreen('intro');
});
