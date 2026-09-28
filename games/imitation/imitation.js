// Imitation: pairs two browsers over serverless WebRTC (Trystero, Nostr
// relay strategy -- verified live, no account/server needed) via a
// lobby-then-private-room handoff, then runs a timed chat + guess.
//
// This file currently only implements the HUMAN-vs-HUMAN path. The
// human-vs-AI path is a separate, not-yet-built piece (see
// ARCHITECTURE.md's open decisions) -- `startMatchmaking()` is the seam
// where it will plug in: once built, a coin flip there will route either
// to `connectToHumanOpponent()` (this file) or an AI connector, both
// funneling into the same `enterChatPhase()` so the player can't tell
// which one they got from timing or UI alone.

import { joinRoom, selfId } from 'https://cdn.jsdelivr.net/npm/@trystero-p2p/nostr/+esm';

const APP_ID = 'cocktail-cabinet-imitation-v1';
const LOBBY_ROOM_ID = 'lobby';
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
// off into a fresh private room, then both leave the lobby.
// ---------------------------------------------------------------------
let lobby = null;
let matchRoom = null;
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
      joinMatchRoom(roomId, onPaired);
    }
  };

  proposeMatch.onMessage = (data) => {
    if (paired) return;
    paired = true;
    joinMatchRoom(data.roomId, onPaired);
  };
}

function joinMatchRoom(roomId, onPaired) {
  lobby.leave();
  lobby = null;
  matchRoom = joinRoom({ appId: APP_ID }, roomId);
  const chat = matchRoom.makeAction('chat');
  onPaired({ room: matchRoom, chat, opponentType: 'human' });
}

// ---------------------------------------------------------------------
// Chat phase
// ---------------------------------------------------------------------
const chatLog = document.getElementById('chat-log');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatTimerEl = document.getElementById('chat-timer');
const btnReadyGuess = document.getElementById('btn-ready-guess');

let activeChat = null;
let chatTimerHandle = null;
let opponentType = null;
let opponentLeft = false;

function appendMessage(kind, text) {
  const div = document.createElement('div');
  div.className = 'imitation-msg imitation-msg--' + kind;
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function enterChatPhase({ room, chat, opponentType: type }) {
  activeChat = chat;
  opponentType = type;
  opponentLeft = false;
  chatLog.innerHTML = '';
  chatInput.value = '';
  chatInput.disabled = false;
  showScreen('chat');

  chat.onMessage = (text) => appendMessage('them', text);
  room.onPeerLeave = () => {
    opponentLeft = true;
    appendMessage('system', 'Your opponent disconnected.');
    chatInput.disabled = true;
  };

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

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || !activeChat) return;
  appendMessage('me', text);
  activeChat.send(text);
  chatInput.value = '';
});

btnReadyGuess.addEventListener('click', () => {
  clearInterval(chatTimerHandle);
  goToGuessPhase();
});

// ---------------------------------------------------------------------
// Guess + result
// ---------------------------------------------------------------------
const resultTextEl = document.getElementById('result-text');

function goToGuessPhase() {
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
  if (matchRoom) {
    matchRoom.leave();
    matchRoom = null;
  }
  if (lobby) {
    lobby.leave();
    lobby = null;
  }
  activeChat = null;
}

// ---------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------
function startMatchmaking() {
  beginMatchmakingUI();
  // TODO(AI mode): once the Claude Artifact integration is built, decide
  // here whether to route to connectToHumanOpponent or an AI connector.
  // Both must funnel into transitionOnceMinimumElapsed(() => enterChatPhase(...))
  // so the player can't tell which one they got from timing.
  connectToHumanOpponent((result) => {
    transitionOnceMinimumElapsed(() => enterChatPhase(result));
  });
}

document.getElementById('btn-find-match').addEventListener('click', startMatchmaking);

document.getElementById('btn-play-again').addEventListener('click', () => {
  showScreen('intro');
});
