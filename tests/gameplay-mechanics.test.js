"use strict";

const assert = require("assert");

function isStoneEligibleForScoring(distToButtonCenter, stoneRadius, outerBlueRadius) {
  return distToButtonCenter - stoneRadius <= outerBlueRadius + 1e-6;
}

function computeEndResult(stones, outerBlueRadius) {
  const epsilon = 1e-6;
  const eligible = stones
    .filter((s) => isStoneEligibleForScoring(s.dist, s.radius, outerBlueRadius))
    .sort((a, b) => a.dist - b.dist);

  if (!eligible.length) {
    return { winnerTeam: null, points: 0 };
  }

  const winnerTeam = eligible[0].team;
  const nearestOpponentDist =
    eligible.find((s) => s.team !== winnerTeam)?.dist ?? Number.POSITIVE_INFINITY;

  const points = eligible.filter((s) => s.team === winnerTeam && s.dist + epsilon < nearestOpponentDist).length;
  return { winnerTeam, points };
}

function isSweepBlocked(active, stones, sweepBlockMultiplier) {
  for (const s of stones) {
    if (s === active) continue;
    const dx = active.x - s.x;
    const dy = active.y - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const blockDist = Math.max(active.r, s.r) * sweepBlockMultiplier;
    if (dist <= blockDist) return true;
  }
  return false;
}

function chargeLevelAtMs(heldMs, rampUpMs, holdMs, rampDownMs) {
  const cycleMs = rampUpMs + holdMs + rampDownMs;
  const phase = heldMs % cycleMs;
  if (phase < rampUpMs) return phase / rampUpMs;
  if (phase < rampUpMs + holdMs) return 1;
  const downT = (phase - rampUpMs - holdMs) / rampDownMs;
  return Math.max(0, 1 - downT);
}

function launchVelocityY(charge, minReleaseCharge, minLaunchVY, maxLaunchVY) {
  const power = Math.max(minReleaseCharge, Math.min(1, charge));
  const curvedPower = Math.pow(power, 1.05);
  return minLaunchVY + (maxLaunchVY - minLaunchVY) * curvedPower;
}

function simulateStoppingY(hackY, vy) {
  let y = hackY;
  for (let i = 0; i < 5000; i++) {
    y += vy;
    vy = Math.max(0, vy * 0.9976 - 0.0036);
    if (vy < 0.16) break;
  }
  return y;
}

function powerForTargetY(targetY, hackY, minReleaseCharge, minLaunchVY, maxLaunchVY) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const vy = minLaunchVY + (maxLaunchVY - minLaunchVY) * Math.pow(Math.max(minReleaseCharge, mid), 1.05);
    const stopY = simulateStoppingY(hackY, vy);
    if (stopY < targetY) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function isStoneRemoved(stoneY, removalRadius, lowerGreenY) {
  return stoneY - removalRadius >= lowerGreenY;
}

function isHogLineViolation(stoneY, hogLineY, speed, aliveMs) {
  return aliveMs > 1800 && speed < 0.06 && stoneY < hogLineY;
}

function determineMatchWinner(score0, score1) {
  if (score0 > score1) return 0;
  if (score1 > score0) return 1;
  return null;
}

function areAllStonesStopped(speeds, threshold) {
  for (const s of speeds) {
    if (s > threshold) return false;
  }
  return true;
}

function applyFriction(vx, vy, dtRatio, sweepFactor) {
  const nextVX = vx * Math.pow(0.8, dtRatio);
  const forwardFriction = 0.0036 * (1 - 0.0525 * sweepFactor) * dtRatio;
  const glideRetention = Math.pow(0.9976 + 0.000126 * sweepFactor, dtRatio);
  const nextVY = Math.max(0, vy * glideRetention - forwardFriction);
  return { vx: nextVX, vy: nextVY };
}

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    console.error(err.stack || err.message || String(err));
    process.exitCode = 1;
  }
}

// --- Scoring eligibility ---

run("scoring eligibility: touching blue ring counts", () => {
  assert.strictEqual(isStoneEligibleForScoring(120, 20, 100), true);
});

run("scoring eligibility: fully outside blue ring does not count", () => {
  assert.strictEqual(isStoneEligibleForScoring(121.1, 20, 100), false);
});

run("scoring eligibility: just inside epsilon tolerance counts", () => {
  assert.strictEqual(isStoneEligibleForScoring(120 + 1e-7, 20, 100), true);
});

run("scoring eligibility: beyond epsilon tolerance does not count", () => {
  assert.strictEqual(isStoneEligibleForScoring(120 + 1e-5, 20, 100), false);
});

// --- End scoring ---

run("end scoring: winner gets points for stones closer than nearest opponent", () => {
  const stones = [
    { team: 0, dist: 12, radius: 20 },
    { team: 0, dist: 22, radius: 20 },
    { team: 0, dist: 30, radius: 20 },
    { team: 1, dist: 36, radius: 20 },
    { team: 1, dist: 52, radius: 20 },
  ];
  const res = computeEndResult(stones, 100);
  assert.strictEqual(res.winnerTeam, 0);
  assert.strictEqual(res.points, 3);
});

run("end scoring: stones outside house are ignored", () => {
  const stones = [
    { team: 0, dist: 135, radius: 20 },
    { team: 1, dist: 118, radius: 20 },
  ];
  const res = computeEndResult(stones, 100);
  assert.strictEqual(res.winnerTeam, 1);
  assert.strictEqual(res.points, 1);
});

run("end scoring: no eligible stones yields no winner", () => {
  const stones = [
    { team: 0, dist: 200, radius: 20 },
    { team: 1, dist: 200, radius: 20 },
  ];
  const res = computeEndResult(stones, 100);
  assert.strictEqual(res.winnerTeam, null);
  assert.strictEqual(res.points, 0);
});

run("end scoring: tied distances do not score (epsilon guard)", () => {
  const stones = [
    { team: 0, dist: 50, radius: 20 },
    { team: 1, dist: 50, radius: 20 },
  ];
  const res = computeEndResult(stones, 100);
  assert.strictEqual(res.points, 0);
});

run("end scoring: only one team has stones in house", () => {
  const stones = [
    { team: 0, dist: 40, radius: 20 },
    { team: 0, dist: 60, radius: 20 },
    { team: 1, dist: 200, radius: 20 },
  ];
  const res = computeEndResult(stones, 100);
  assert.strictEqual(res.winnerTeam, 0);
  assert.strictEqual(res.points, 2);
});

// --- Sweep blocking ---

run("sweep blocking: blocked within configured proximity", () => {
  const active = { x: 0, y: 0, r: 20 };
  const close = { x: 45, y: 0, r: 20 };
  const far = { x: 80, y: 0, r: 20 };
  assert.strictEqual(isSweepBlocked(active, [active, close], 2.6), true);
  assert.strictEqual(isSweepBlocked(active, [active, far], 2.6), false);
});

run("sweep blocking: exactly at threshold is blocked", () => {
  const active = { x: 0, y: 0, r: 20 };
  const atThreshold = { x: 52, y: 0, r: 20 };
  assert.strictEqual(isSweepBlocked(active, [active, atThreshold], 2.6), true);
});

run("sweep blocking: just beyond threshold is not blocked", () => {
  const active = { x: 0, y: 0, r: 20 };
  const justBeyond = { x: 52.1, y: 0, r: 20 };
  assert.strictEqual(isSweepBlocked(active, [active, justBeyond], 2.6), false);
});

run("sweep blocking: active stone alone is not blocked", () => {
  const active = { x: 0, y: 0, r: 20 };
  assert.strictEqual(isSweepBlocked(active, [active], 2.6), false);
});

// --- Charge cycle ---

run("charge cycle: ramps up, holds max, then ramps down", () => {
  const up = chargeLevelAtMs(600, 1200, 220, 1000);
  const hold = chargeLevelAtMs(1250, 1200, 220, 1000);
  const down = chargeLevelAtMs(2000, 1200, 220, 1000);
  assert(up > 0.45 && up < 0.55);
  assert.strictEqual(hold, 1);
  assert(down < 0.5);
});

run("charge cycle: t=0 returns 0", () => {
  assert.strictEqual(chargeLevelAtMs(0, 1200, 220, 1000), 0);
});

run("charge cycle: exact ramp-up/hold boundary returns 1", () => {
  assert.strictEqual(chargeLevelAtMs(1200, 1200, 220, 1000), 1);
});

run("charge cycle: wraps correctly after full cycle", () => {
  const cycleMs = 1200 + 220 + 1000;
  const midRamp = 600;
  const a = chargeLevelAtMs(midRamp, 1200, 220, 1000);
  const b = chargeLevelAtMs(cycleMs * 2 + midRamp, 1200, 220, 1000);
  assert(Math.abs(a - b) < 1e-9);
});

// --- Launch velocity ---

run("launch velocity: bounded by min/max and uses minimum release power floor", () => {
  const minCharge = 0.38;
  const minV = 4.8;
  const maxV = 19.8;
  const low = launchVelocityY(0, minCharge, minV, maxV);
  const mid = launchVelocityY(0.5, minCharge, minV, maxV);
  const high = launchVelocityY(1, minCharge, minV, maxV);
  assert(low > minV);
  assert(mid > low);
  assert(high <= maxV + 1e-9);
});

run("launch velocity: zero charge floors to minReleaseCharge", () => {
  const v0 = launchVelocityY(0, 0.38, 4.8, 19.8);
  const vFloor = launchVelocityY(0.38, 0.38, 4.8, 19.8);
  assert(Math.abs(v0 - vFloor) < 1e-9);
});

run("launch velocity: charge above 1 is clamped", () => {
  const v1 = launchVelocityY(1.0, 0.38, 4.8, 19.8);
  const v2 = launchVelocityY(1.5, 0.38, 4.8, 19.8);
  assert(Math.abs(v1 - v2) < 1e-9);
});

// --- Stone removal ---

run("stone removal: fully past lower green line is removed", () => {
  assert.strictEqual(isStoneRemoved(500, 15, 480), true);
});

run("stone removal: center past but radius not fully past is kept", () => {
  assert.strictEqual(isStoneRemoved(490, 15, 480), false);
});

run("stone removal: exactly at boundary is removed", () => {
  assert.strictEqual(isStoneRemoved(495, 15, 480), true);
});

// --- Hog line violation ---

run("hog line: stone stopping before hog line after 1800ms is violation", () => {
  assert.strictEqual(isHogLineViolation(100, 200, 0.03, 2000), true);
});

run("hog line: stone past hog line is not violation", () => {
  assert.strictEqual(isHogLineViolation(300, 200, 0.03, 2000), false);
});

run("hog line: stone before 1800ms is not violation yet", () => {
  assert.strictEqual(isHogLineViolation(100, 200, 0.03, 1000), false);
});

run("hog line: stone still moving is not violation", () => {
  assert.strictEqual(isHogLineViolation(100, 200, 0.1, 2000), false);
});

// --- Match winner ---

run("match winner: higher score wins", () => {
  assert.strictEqual(determineMatchWinner(5, 3), 0);
  assert.strictEqual(determineMatchWinner(3, 5), 1);
});

run("match winner: tied scores return null", () => {
  assert.strictEqual(determineMatchWinner(4, 4), null);
});

// --- All stones stopped ---

run("all stones stopped: speeds below threshold", () => {
  assert.strictEqual(areAllStonesStopped([0.01, 0.02, 0.04], 0.045), true);
});

run("all stones stopped: speed at threshold is not stopped", () => {
  assert.strictEqual(areAllStonesStopped([0.01, 0.046], 0.045), false);
});

run("all stones stopped: empty list is stopped", () => {
  assert.strictEqual(areAllStonesStopped([], 0.045), true);
});

// --- Physics: friction model ---

run("friction: lateral velocity decays each tick", () => {
  const result = applyFriction(1.0, 5.0, 1.0, 0);
  assert(result.vx < 1.0);
  assert(Math.abs(result.vx - 0.8) < 1e-9);
});

run("friction: forward velocity decays each tick", () => {
  const result = applyFriction(0, 5.0, 1.0, 0);
  assert(result.vy < 5.0);
  assert(result.vy > 0);
});

run("friction: dtRatio=2 produces more decay than dtRatio=1", () => {
  const r1 = applyFriction(1.0, 5.0, 1.0, 0);
  const r2 = applyFriction(1.0, 5.0, 2.0, 0);
  assert(r2.vx < r1.vx);
  assert(r2.vy < r1.vy);
});

run("friction: sweeping reduces forward friction", () => {
  const noSweep = applyFriction(0, 5.0, 1.0, 0);
  const withSweep = applyFriction(0, 5.0, 1.0, 1);
  assert(withSweep.vy > noSweep.vy);
});

run("friction: two dtRatio=1 steps match one dtRatio=2 step for exponential decay", () => {
  const step1 = applyFriction(1.0, 5.0, 1.0, 0);
  const step2 = applyFriction(step1.vx, step1.vy, 1.0, 0);
  const single = applyFriction(1.0, 5.0, 2.0, 0);
  assert(Math.abs(step2.vx - single.vx) < 1e-9);
});

// --- AI simulation helpers ---

run("simulateStoppingY: stone travels forward from hack", () => {
  const hackY = 100;
  const stopY = simulateStoppingY(hackY, 8.0);
  assert(stopY > hackY);
});

run("simulateStoppingY: higher velocity stops further", () => {
  const hackY = 100;
  const lowStop = simulateStoppingY(hackY, 6.0);
  const highStop = simulateStoppingY(hackY, 12.0);
  assert(highStop > lowStop);
});

run("powerForTargetY: round-trip produces consistent result", () => {
  const hackY = 100;
  const targetY = 4500;
  const minRC = 0.38;
  const minV = 4.8;
  const maxV = 19.8;
  const power = powerForTargetY(targetY, hackY, minRC, minV, maxV);
  const vy = launchVelocityY(power, minRC, minV, maxV);
  const stopY = simulateStoppingY(hackY, vy);
  assert(Math.abs(stopY - targetY) < 20);
});
