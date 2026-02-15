"use strict";

const assert = require("assert");

function isStoneEligibleForScoring(distToButtonCenter, stoneRadius, outerBlueRadius) {
  // Any part of the stone touching/breaking the outer blue ring counts.
  return distToButtonCenter - stoneRadius <= outerBlueRadius + 1e-6;
}

function computeEndResult(stones, outerBlueRadius) {
  const eligible = stones
    .filter((s) => isStoneEligibleForScoring(s.dist, s.radius, outerBlueRadius))
    .sort((a, b) => a.dist - b.dist);

  if (!eligible.length) {
    return { winnerTeam: null, points: 0 };
  }

  const winnerTeam = eligible[0].team;
  const nearestOpponentDist =
    eligible.find((s) => s.team !== winnerTeam)?.dist ?? Number.POSITIVE_INFINITY;

  const points = eligible.filter((s) => s.team === winnerTeam && s.dist < nearestOpponentDist).length;
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

run("scoring eligibility: touching blue ring counts", () => {
  const outer = 100;
  const r = 20;
  assert.strictEqual(isStoneEligibleForScoring(120, r, outer), true);
});

run("scoring eligibility: fully outside blue ring does not count", () => {
  const outer = 100;
  const r = 20;
  assert.strictEqual(isStoneEligibleForScoring(121.1, r, outer), false);
});

run("end scoring: winner gets points for stones closer than nearest opponent", () => {
  const outer = 100;
  const stones = [
    { team: 0, dist: 12, radius: 20 },
    { team: 0, dist: 22, radius: 20 },
    { team: 0, dist: 30, radius: 20 },
    { team: 1, dist: 36, radius: 20 },
    { team: 1, dist: 52, radius: 20 },
  ];
  const res = computeEndResult(stones, outer);
  assert.strictEqual(res.winnerTeam, 0);
  assert.strictEqual(res.points, 3);
});

run("end scoring: stones outside house are ignored", () => {
  const outer = 100;
  const stones = [
    { team: 0, dist: 135, radius: 20 }, // outside
    { team: 1, dist: 118, radius: 20 }, // touching
  ];
  const res = computeEndResult(stones, outer);
  assert.strictEqual(res.winnerTeam, 1);
  assert.strictEqual(res.points, 1);
});

run("sweep blocking: blocked within configured proximity", () => {
  const active = { x: 0, y: 0, r: 20 };
  const close = { x: 45, y: 0, r: 20 };
  const far = { x: 80, y: 0, r: 20 };
  assert.strictEqual(isSweepBlocked(active, [active, close], 2.6), true);
  assert.strictEqual(isSweepBlocked(active, [active, far], 2.6), false);
});

run("charge cycle: ramps up, holds max, then ramps down", () => {
  const up = chargeLevelAtMs(600, 1200, 220, 1000);
  const hold = chargeLevelAtMs(1250, 1200, 220, 1000);
  const down = chargeLevelAtMs(2000, 1200, 220, 1000);
  assert(up > 0.45 && up < 0.55);
  assert.strictEqual(hold, 1);
  assert(down < 0.5);
});

run("launch velocity: bounded by min/max and uses minimum release power floor", () => {
  const minCharge = 0.38;
  const minV = 4.8;
  const maxV = 14.6;
  const low = launchVelocityY(0, minCharge, minV, maxV);
  const mid = launchVelocityY(0.5, minCharge, minV, maxV);
  const high = launchVelocityY(1, minCharge, minV, maxV);
  assert(low > minV);
  assert(mid > low);
  assert(high <= maxV + 1e-9);
});

