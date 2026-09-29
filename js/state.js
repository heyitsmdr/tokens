// Pure game logic. No Firebase, no DOM: importable from the browser and from Node tests.
//
// The database stores an "anchor": the values at one moment in time (anchorAt) plus
// whether the game is running. Every client derives live values from the anchor locally,
// so the only writes are the ones caused by user actions.

const MS_PER_MIN = 60000;

export const DEFAULTS = {
  running: false,
  anchorAt: 0,
  tokensAtAnchor: 500,
  playMsAtAnchor: 0,
  drainPerMin: 5,
  startingTokens: 500,
  prizeStart: 1000,
  prizeStep: 100,
  prizeIntervalMin: 10,
};

function withDefaults(state) {
  return { ...DEFAULTS, ...(state || {}) };
}

export function computeLive(state, now) {
  const s = withDefaults(state);
  let elapsed = s.running ? Math.max(0, now - s.anchorAt) : 0;
  let tokens = s.tokensAtAnchor;

  if (s.drainPerMin > 0) {
    const msToZero = (s.tokensAtAnchor / s.drainPerMin) * MS_PER_MIN;
    if (elapsed >= msToZero) {
      // Clamp at the zero crossing so play time (and the prize) stop advancing too.
      elapsed = msToZero;
      tokens = 0;
    } else {
      tokens = s.tokensAtAnchor - (s.drainPerMin * elapsed) / MS_PER_MIN;
    }
  }
  tokens = Math.max(0, tokens);

  const playMs = s.playMsAtAnchor + elapsed;
  const intervalMs = s.prizeIntervalMin * MS_PER_MIN;
  const prize = Math.max(0, s.prizeStart - s.prizeStep * Math.floor(playMs / intervalMs));
  const msUntilNextPrizeDrop = intervalMs - (playMs % intervalMs);
  const hitZero = s.running && tokens <= 0;

  return { tokens, prize, playMs, msUntilNextPrizeDrop, hitZero };
}

// Freeze the live values at `now` into a new anchor, then shallow-merge `patch` on top.
export function reanchor(state, now, patch = {}) {
  const s = withDefaults(state);
  const live = computeLive(s, now);
  return {
    ...s,
    tokensAtAnchor: live.tokens,
    playMsAtAnchor: live.playMs,
    anchorAt: now,
    ...patch,
  };
}

function finiteOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function addTokens(state, now, amount) {
  const next = reanchor(state, now);
  next.tokensAtAnchor = Math.max(0, next.tokensAtAnchor + finiteOr(amount, 0));
  return next;
}

export function setDrain(state, now, drainPerMin) {
  const current = withDefaults(state).drainPerMin;
  return reanchor(state, now, { drainPerMin: Math.max(0, finiteOr(drainPerMin, current)) });
}

export function setStarting(state, now, startingTokens) {
  const current = withDefaults(state).startingTokens;
  return reanchor(state, now, { startingTokens: Math.max(0, finiteOr(startingTokens, current)) });
}

export function setPrizeSettings(state, now, { prizeStart, prizeStep, prizeIntervalMin } = {}) {
  const patch = {};
  const start = Number(prizeStart);
  const step = Number(prizeStep);
  const interval = Number(prizeIntervalMin);
  if (prizeStart !== undefined && Number.isFinite(start)) patch.prizeStart = Math.max(0, start);
  if (prizeStep !== undefined && Number.isFinite(step)) patch.prizeStep = Math.max(0, step);
  if (prizeIntervalMin !== undefined && Number.isFinite(interval) && interval > 0) {
    patch.prizeIntervalMin = interval;
  }
  return reanchor(state, now, patch);
}

export function play(state, now) {
  return reanchor(state, now, { running: true });
}

export function pause(state, now) {
  return reanchor(state, now, { running: false });
}

export function reset(state, now) {
  const s = withDefaults(state);
  return {
    running: false,
    anchorAt: now,
    tokensAtAnchor: s.startingTokens,
    playMsAtAnchor: 0,
    drainPerMin: s.drainPerMin,
    startingTokens: s.startingTokens,
    prizeStart: s.prizeStart,
    prizeStep: s.prizeStep,
    prizeIntervalMin: s.prizeIntervalMin,
  };
}
