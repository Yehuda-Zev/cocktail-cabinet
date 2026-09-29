// The bare chat popup for human-vs-human Imitation matches. Opened by
// imitation.js with ?room=<id> once a lobby pairing has already happened
// there -- this page's only job is to join that specific private room
// directly and relay messages. No timer, no guess UI: those stay on the
// opener page so the flow is identical regardless of who's on the other
// end (see openOpponentWindow() in imitation.js).

import { joinRoom, selfId } from 'https://cdn.jsdelivr.net/npm/@trystero-p2p/nostr/+esm';

const APP_ID = 'cocktail-cabinet-imitation-v1';

const logEl = document.getElementById('chat-log');
const formEl = document.getElementById('chat-form');
const inputEl = document.getElementById('chat-input');
const sendBtn = formEl.querySelector('button');

function appendMessage(kind, text) {
  const div = document.createElement('div');
  div.className = 'imitation-msg imitation-msg--' + kind;
  div.textContent = text;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}

const roomId = new URLSearchParams(location.search).get('room');
if (!roomId) {
  appendMessage('system', 'No match room specified.');
} else {
  const room = joinRoom({ appId: APP_ID }, roomId);
  const chat = room.makeAction('chat');

  chat.onMessage = (text) => appendMessage('them', text);
  room.onPeerLeave = () => {
    appendMessage('system', 'Your opponent disconnected.');
    inputEl.disabled = true;
    sendBtn.disabled = true;
  };

  inputEl.disabled = false;
  sendBtn.disabled = false;
  inputEl.focus();

  formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = inputEl.value.trim();
    if (!text) return;
    appendMessage('me', text);
    chat.send(text);
    inputEl.value = '';
  });
}
