import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULTS,
  computeLive,
  reanchor,
  addTokens,
  setDrain,
  setStarting,
  setPrizeSettings,
  play,
  pause,
  reset,
} from '../js/state.js';

const MIN = 60000;
const T0 = 1_700_000_000_000;

function running(overrides = {}) {
  return { ...DEFAULTS, running: true, anchorAt: T0, ...overrides };
}

test('drain: tokens decrease at drainPerMin while running', () => {
  const s = running({ tokensAtAnchor: 500, drainPerMin: 5 });
  assert.equal(computeLive(s, T0).tokens, 500);
  assert.equal(computeLive(s, T0 + MIN).tokens, 495);
  assert.equal(computeLive(s, T0 + 12000).tokens, 499);
  assert.equal(Math.ceil(computeLive(s, T0 + 11999).tokens), 500);
  assert.equal(computeLive(s, T0 + 10 * MIN).tokens, 450);
  assert.equal(computeLive(s, T0 + 10 * MIN).playMs, 10 * MIN);
});

test('drain: tokens and playMs do not move while paused', () => {
  const s = { ...DEFAULTS, running: false, anchorAt: T0, tokensAtAnchor: 300, playMsAtAnchor: 5000 };
  const live = computeLive(s, T0 + 60 * MIN);
  assert.equal(live.tokens, 300);
  assert.equal(live.playMs, 5000);
  assert.equal(live.hitZero, false);
});

test('drain: zero drain rate keeps tokens constant but play time advances', () => {
  const s = running({ tokensAtAnchor: 42, drainPerMin: 0 });
  const live = computeLive(s, T0 + 15 * MIN);
  assert.equal(live.tokens, 42);
  assert.equal(live.playMs, 15 * MIN);
  assert.equal(live.prize, 900);
});

test('zero clamp: tokens clamp to 0, hitZero is set, playMs stops at the crossing', () => {
  // 10 tokens at 5/min hits zero after exactly 2 minutes.
  const s = running({ tokensAtAnchor: 10, drainPerMin: 5, playMsAtAnchor: 1000 });
  const atZero = computeLive(s, T0 + 2 * MIN);
  assert.equal(atZero.tokens, 0);
  assert.equal(atZero.hitZero, true);
  assert.equal(atZero.playMs, 1000 + 2 * MIN);

  const muchLater = computeLive(s, T0 + 500 * MIN);
  assert.equal(muchLater.tokens, 0);
  assert.equal(muchLater.hitZero, true);
  assert.equal(muchLater.playMs, 1000 + 2 * MIN);
  assert.equal(muchLater.prize, 1000);

  const before = computeLive(s, T0 + 2 * MIN - 1);
  assert.equal(before.hitZero, false);
  assert.ok(before.tokens > 0);
});

test('zero clamp: non-integer crossing yields exact 0, not a float residue', () => {
  const s = running({ tokensAtAnchor: 7.3, drainPerMin: 3.7 });
  const live = computeLive(s, T0 + 1000 * MIN);
  assert.equal(live.tokens, 0);
  assert.equal(Math.ceil(live.tokens), 0);
});

test('zero clamp: paused game at 0 tokens does not report hitZero', () => {
  const s = { ...DEFAULTS, running: false, anchorAt: T0, tokensAtAnchor: 0 };
  assert.equal(computeLive(s, T0 + MIN).hitZero, false);
});

test('prize: drops by prizeStep exactly at each interval boundary', () => {
  const s = running({ tokensAtAnchor: 1e9, drainPerMin: 5 });
  assert.equal(computeLive(s, T0).prize, 1000);
  assert.equal(computeLive(s, T0 + 10 * MIN - 1).prize, 1000);
  assert.equal(computeLive(s, T0 + 10 * MIN).prize, 900);
  assert.equal(computeLive(s, T0 + 20 * MIN - 1).prize, 900);
  assert.equal(computeLive(s, T0 + 20 * MIN).prize, 800);
});

test('prize: floors at 0', () => {
  const s = running({ tokensAtAnchor: 1e9, drainPerMin: 5 });
  assert.equal(computeLive(s, T0 + 100 * MIN).prize, 0);
  assert.equal(computeLive(s, T0 + 1000 * MIN).prize, 0);
});

test('prize: msUntilNextPrizeDrop counts down to the next boundary', () => {
  const s = running({ tokensAtAnchor: 1e9 });
  assert.equal(computeLive(s, T0).msUntilNextPrizeDrop, 10 * MIN);
  assert.equal(computeLive(s, T0 + 3 * MIN).msUntilNextPrizeDrop, 7 * MIN);
  assert.equal(computeLive(s, T0 + 10 * MIN).msUntilNextPrizeDrop, 10 * MIN);
});

test('pause freezes tokens, playMs and prize', () => {
  const s = running({ tokensAtAnchor: 500, playMsAtAnchor: 9 * MIN });
  const pausedAt = T0 + 3 * MIN;
  const paused = pause(s, pausedAt);
  assert.equal(paused.running, false);
  assert.equal(paused.anchorAt, pausedAt);

  const right = computeLive(paused, pausedAt);
  const later = computeLive(paused, pausedAt + 999 * MIN);
  assert.deepEqual(later, right);
  assert.equal(right.tokens, 485);
  assert.equal(right.playMs, 12 * MIN);
  assert.equal(right.prize, 900);
});

test('play resumes from the frozen anchor', () => {
  const paused = { ...DEFAULTS, running: false, anchorAt: T0, tokensAtAnchor: 100, playMsAtAnchor: 2 * MIN };
  const resumedAt = T0 + 50 * MIN;
  const resumed = play(paused, resumedAt);
  assert.equal(resumed.running, true);
  assert.equal(resumed.anchorAt, resumedAt);
  assert.equal(resumed.tokensAtAnchor, 100);
  assert.equal(resumed.playMsAtAnchor, 2 * MIN);
  assert.equal(computeLive(resumed, resumedAt + MIN).tokens, 95);
  assert.equal(computeLive(resumed, resumedAt + MIN).playMs, 3 * MIN);
});

test('play is safe when already running', () => {
  const s = running({ tokensAtAnchor: 500 });
  const again = play(s, T0 + MIN);
  assert.equal(again.running, true);
  assert.equal(again.tokensAtAnchor, 495);
  assert.equal(computeLive(again, T0 + 2 * MIN).tokens, computeLive(s, T0 + 2 * MIN).tokens);
});

test('reanchor folds live values into a new anchor and applies the patch', () => {
  const s = running({ tokensAtAnchor: 500, playMsAtAnchor: 0 });
  const now = T0 + 4 * MIN;
  const next = reanchor(s, now, { drainPerMin: 10 });
  assert.equal(next.anchorAt, now);
  assert.equal(next.tokensAtAnchor, 480);
  assert.equal(next.playMsAtAnchor, 4 * MIN);
  assert.equal(next.drainPerMin, 10);
  assert.equal(next.running, true);
  assert.equal(computeLive(next, now + MIN).tokens, 470);
});

test('addTokens re-anchors then adds, and live value at anchor time matches', () => {
  const s = running({ tokensAtAnchor: 500 });
  const now = T0 + 2 * MIN;
  const next = addTokens(s, now, 50);
  assert.equal(next.tokensAtAnchor, 540);
  assert.equal(next.playMsAtAnchor, 2 * MIN);
  assert.equal(next.anchorAt, now);
  assert.equal(computeLive(next, now).tokens, next.tokensAtAnchor);
});

test('addTokens clamps at 0 for large negative amounts', () => {
  const s = running({ tokensAtAnchor: 30 });
  const next = addTokens(s, T0, -100);
  assert.equal(next.tokensAtAnchor, 0);
  assert.equal(computeLive(next, T0).hitZero, true);
});

test('addTokens revives a game that ran dry without crediting dead time', () => {
  const s = running({ tokensAtAnchor: 5, drainPerMin: 5 }); // zero at T0 + 1 min
  const now = T0 + 30 * MIN;
  const next = addTokens(s, now, 10);
  assert.equal(next.tokensAtAnchor, 10);
  assert.equal(next.playMsAtAnchor, MIN);
});

test('setDrain re-anchors and clamps to >= 0', () => {
  const s = running({ tokensAtAnchor: 500 });
  const next = setDrain(s, T0 + MIN, 20);
  assert.equal(next.tokensAtAnchor, 495);
  assert.equal(next.drainPerMin, 20);
  assert.equal(setDrain(s, T0, -3).drainPerMin, 0);
});

test('setStarting changes startingTokens without touching current tokens', () => {
  const s = running({ tokensAtAnchor: 500 });
  const next = setStarting(s, T0 + MIN, 1234);
  assert.equal(next.startingTokens, 1234);
  assert.equal(next.tokensAtAnchor, 495);
});

test('setPrizeSettings merges only provided valid fields', () => {
  const s = running({ tokensAtAnchor: 1e9 });
  const next = setPrizeSettings(s, T0 + MIN, { prizeStart: 2000, prizeIntervalMin: 5 });
  assert.equal(next.prizeStart, 2000);
  assert.equal(next.prizeStep, DEFAULTS.prizeStep);
  assert.equal(next.prizeIntervalMin, 5);
  assert.equal(next.playMsAtAnchor, MIN);

  const ignored = setPrizeSettings(s, T0, { prizeIntervalMin: 0 });
  assert.equal(ignored.prizeIntervalMin, DEFAULTS.prizeIntervalMin);
});

test('reset restores starting tokens, zeroes play time, keeps settings', () => {
  const s = running({
    tokensAtAnchor: 12,
    playMsAtAnchor: 45 * MIN,
    drainPerMin: 7,
    startingTokens: 800,
    prizeStart: 5000,
    prizeStep: 250,
    prizeIntervalMin: 3,
  });
  const now = T0 + 5 * MIN;
  const r = reset(s, now);
  assert.equal(r.running, false);
  assert.equal(r.anchorAt, now);
  assert.equal(r.tokensAtAnchor, 800);
  assert.equal(r.playMsAtAnchor, 0);
  assert.equal(r.drainPerMin, 7);
  assert.equal(r.startingTokens, 800);
  assert.equal(r.prizeStart, 5000);
  assert.equal(r.prizeStep, 250);
  assert.equal(r.prizeIntervalMin, 3);

  const live = computeLive(r, now + 100 * MIN);
  assert.equal(live.tokens, 800);
  assert.equal(live.playMs, 0);
  assert.equal(live.prize, 5000);
});

test('missing fields fall back to DEFAULTS', () => {
  const live = computeLive({ running: false }, T0);
  assert.equal(live.tokens, DEFAULTS.tokensAtAnchor);
  assert.equal(live.prize, DEFAULTS.prizeStart);
});
