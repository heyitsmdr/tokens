import {
  DEFAULTS,
  computeLive,
  addTokens,
  setDrain,
  setStarting,
  setPrizeSettings,
  play,
  pause,
  reset,
} from "./state.js";
import { getRoomId, serverNow, subscribe, writeState, ensureRoom, onConnectionChange } from "./db.js";

const TICK_MS = 250;

const $ = (id) => document.getElementById(id);
const els = {
  roomId: $("room-id"),
  connDot: $("conn-dot"),
  error: $("error"),
  tokens: $("out-tokens"),
  prize: $("out-prize"),
  nextDrop: $("out-next-drop"),
  status: $("out-status"),
  toggle: $("btn-toggle"),
  customAmount: $("custom-amount"),
  customPlus: $("btn-custom-plus"),
  customMinus: $("btn-custom-minus"),
  settingsForm: $("settings-form"),
  starting: $("set-starting"),
  drain: $("set-drain"),
  prizeForm: $("prize-form"),
  prizeStart: $("set-prize-start"),
  prizeStep: $("set-prize-step"),
  prizeInterval: $("set-prize-interval"),
  reset: $("btn-reset"),
  obsUrl: $("obs-url"),
  copy: $("btn-copy"),
};

const roomId = getRoomId();
let latestState = null;
let prevHitZero = false;
const shown = {};

function setText(el, text) {
  if (shown[el.id] !== text) {
    shown[el.id] = text;
    el.textContent = text;
  }
}

function showError(message) {
  els.error.textContent = message;
  els.error.hidden = !message;
}

function formatCountdown(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = String(totalSec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

// Always derive the mutation from the most recent state we know about, and adopt the
// result locally right away so a second rapid click builds on the first.
function mutate(fn) {
  if (!latestState) return;
  const next = fn({ ...DEFAULTS, ...latestState }, serverNow());
  latestState = next;
  render();
  writeState(roomId, next)
    .then(() => showError(""))
    .catch((err) => {
      console.error("writeState failed", err);
      showError(`Write failed: ${err.message || err}`);
    });
}

// Update an input from the DB only when the DB value changed, so unsaved edits survive ticks.
function syncInput(input, value) {
  const str = String(value);
  if (input.dataset.synced !== str) {
    input.dataset.synced = str;
    input.value = str;
  }
}

function setControlsEnabled(enabled) {
  document.querySelectorAll("button:not(#btn-copy)").forEach((b) => {
    b.disabled = !enabled;
  });
}

function render() {
  if (!latestState) return;
  const state = { ...DEFAULTS, ...latestState };
  const live = computeLive(state, serverNow());
  const tokens = Math.ceil(live.tokens);

  setText(els.tokens, String(tokens));
  setText(els.prize, String(Math.round(live.prize)));
  setText(els.nextDrop, live.prize > 0 ? formatCountdown(live.msUntilNextPrizeDrop) : "-");
  setText(els.status, state.running ? "Playing" : "Paused");
  els.status.className = state.running ? "playing" : "paused";

  setText(els.toggle, state.running ? "Pause" : "Play");
  els.toggle.classList.toggle("is-running", state.running);
  // Playing with zero tokens would just auto-pause immediately.
  els.toggle.disabled = !state.running && tokens <= 0;

  // Auto-pause once per zero crossing.
  const justHitZero = state.running && live.hitZero && !prevHitZero;
  prevHitZero = live.hitZero;
  if (justHitZero) mutate(pause);
}

// --- Wiring ---

els.roomId.textContent = roomId;
els.obsUrl.value = new URL(`view.html?room=${encodeURIComponent(roomId)}`, location.href).href;

els.toggle.addEventListener("click", () => {
  mutate((s, now) => (s.running ? pause(s, now) : play(s, now)));
});

document.querySelectorAll("[data-amount]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const amount = Number(btn.dataset.amount);
    mutate((s, now) => addTokens(s, now, amount));
  });
});

function applyCustom(sign) {
  const amount = Number(els.customAmount.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    els.customAmount.focus();
    return;
  }
  mutate((s, now) => addTokens(s, now, sign * amount));
}
els.customPlus.addEventListener("click", () => applyCustom(1));
els.customMinus.addEventListener("click", () => applyCustom(-1));

els.settingsForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const starting = Number(els.starting.value);
  const drain = Number(els.drain.value);
  mutate((s, now) => setDrain(setStarting(s, now, starting), now, drain));
});

els.prizeForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const settings = {
    prizeStart: Number(els.prizeStart.value),
    prizeStep: Number(els.prizeStep.value),
    prizeIntervalMin: Number(els.prizeInterval.value),
  };
  mutate((s, now) => setPrizeSettings(s, now, settings));
});

els.reset.addEventListener("click", () => {
  if (confirm("Reset the game? Tokens go back to the starting amount, play time and prize reset, and the game pauses.")) {
    mutate(reset);
  }
});

els.copy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(els.obsUrl.value);
    els.copy.textContent = "Copied!";
  } catch {
    els.obsUrl.select();
    els.copy.textContent = "Press Ctrl+C";
  }
  setTimeout(() => {
    els.copy.textContent = "Copy";
  }, 1500);
});

onConnectionChange((connected) => {
  els.connDot.classList.toggle("online", connected);
  els.connDot.title = connected ? "Connected" : "Disconnected";
});

subscribe(roomId, (state) => {
  latestState = state;
  if (!state) {
    setControlsEnabled(false);
    return;
  }
  const s = { ...DEFAULTS, ...state };
  syncInput(els.starting, s.startingTokens);
  syncInput(els.drain, s.drainPerMin);
  syncInput(els.prizeStart, s.prizeStart);
  syncInput(els.prizeStep, s.prizeStep);
  syncInput(els.prizeInterval, s.prizeIntervalMin);
  setControlsEnabled(true);
  render();
});

ensureRoom(roomId, DEFAULTS).catch((err) => {
  console.error("ensureRoom failed", err);
  showError(`Could not reach the database: ${err.message || err}`);
});

setInterval(render, TICK_MS);
