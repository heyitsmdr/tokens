// Thin Firebase Realtime Database I/O layer. No game math lives here (see state.js).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  get,
  set,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import { firebaseConfig, DEFAULT_ROOM } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let serverTimeOffset = 0;
onValue(ref(db, ".info/serverTimeOffset"), (snap) => {
  serverTimeOffset = Number(snap.val()) || 0;
});

function roomRef(roomId) {
  return ref(db, `games/${roomId}`);
}

export function getRoomId() {
  // Characters . # $ [ ] / are not allowed in RTDB keys, so swap them out.
  const room = (new URLSearchParams(location.search).get("room") || "")
    .trim()
    .replace(/[.#$[\]/]/g, "-");
  return room || DEFAULT_ROOM;
}

export function serverNow() {
  return Date.now() + serverTimeOffset;
}

export function subscribe(roomId, callback) {
  return onValue(roomRef(roomId), (snap) => {
    callback(snap.exists() ? snap.val() : null);
  });
}

export function writeState(roomId, state) {
  return set(roomRef(roomId), state);
}

export async function ensureRoom(roomId, defaults) {
  const snap = await get(roomRef(roomId));
  if (!snap.exists()) {
    await set(roomRef(roomId), { ...defaults, anchorAt: serverNow() });
  }
}

export function onConnectionChange(callback) {
  return onValue(ref(db, ".info/connected"), (snap) => {
    callback(snap.val() === true);
  });
}
