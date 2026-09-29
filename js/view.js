import { DEFAULTS, computeLive } from "./state.js";
import { getRoomId, serverNow, subscribe, ensureRoom } from "./db.js";

const TICK_MS = 250;
const PULSE_FALLBACK_MS = 1000;

const els = {
  coin: document.getElementById("coin"),
  tokens: document.getElementById("tokens"),
  paused: document.getElementById("paused-badge"),
  drain: document.getElementById("drain"),
  prize: document.getElementById("prize"),
};

const scale = Number(new URLSearchParams(location.search).get("scale"));
if (Number.isFinite(scale) && scale > 0) {
  document.documentElement.style.setProperty("--scale", String(scale));
}

const roomId = getRoomId();
let latestState = null;
let prevTokens = null;
let pulseTimer = null;
const shown = {};

function setText(key, el, text) {
  if (shown[key] !== text) {
    shown[key] = text;
    el.textContent = text;
  }
}

function formatRate(n) {
  return String(Number(n.toFixed(2)));
}

function pulse(direction) {
  const coin = els.coin;
  coin.classList.remove("pulse-up", "pulse-down");
  void coin.offsetWidth; // restart the animation if it is already running
  coin.classList.add(direction > 0 ? "pulse-up" : "pulse-down");
  clearTimeout(pulseTimer);
  pulseTimer = setTimeout(() => coin.classList.remove("pulse-up", "pulse-down"), PULSE_FALLBACK_MS);
}

els.coin.addEventListener("animationend", () => {
  els.coin.classList.remove("pulse-up", "pulse-down");
});

function render() {
  if (!latestState) return;
  const state = { ...DEFAULTS, ...latestState };
  const live = computeLive(state, serverNow());
  const tokens = Math.ceil(live.tokens);

  if (prevTokens !== null && tokens !== prevTokens) pulse(tokens - prevTokens);
  prevTokens = tokens;

  const prizeReached = tokens > live.prize;
  if (shown.prizeReached !== prizeReached) {
    shown.prizeReached = prizeReached;
    els.coin.classList.toggle("prize-reached", prizeReached);
  }

  const tokenText = String(tokens);
  if (shown.tokens !== tokenText) els.tokens.dataset.len = String(tokenText.length);
  setText("tokens", els.tokens, tokenText);
  const drain = state.drainPerMin > 0 ? `-${formatRate(state.drainPerMin)}` : "0";
  setText("drain", els.drain, `Drain: ${drain}/min`);
  setText("prize", els.prize, `Prize: ${Math.round(live.prize)}`);

  const paused = !state.running;
  if (shown.paused !== paused) {
    shown.paused = paused;
    els.paused.classList.toggle("visible", paused);
  }
}

subscribe(roomId, (state) => {
  latestState = state;
  render();
});

ensureRoom(roomId, DEFAULTS).catch((err) => console.error("ensureRoom failed", err));

setInterval(render, TICK_MS);
