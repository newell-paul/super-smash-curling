// Olympic Curling POC by Paul Newell and Codex - 2026 
// 
// Version: 0.0.1

(() => {
  if (!window.Matter) {
    const msg = document.createElement("div");
    msg.style.position = "fixed";
    msg.style.inset = "0";
    msg.style.display = "grid";
    msg.style.placeItems = "center";
    msg.style.background = "#eef8ff";
    msg.style.color = "#163949";
    msg.style.fontFamily = "\"Trebuchet MS\", \"Segoe UI\", sans-serif";
    msg.style.fontSize = "18px";
    msg.style.padding = "20px";
    msg.style.textAlign = "center";
    msg.textContent = "Matter.js failed to load. In Brave, disable Shields for this file and reload.";
    document.body.appendChild(msg);
    return;
  }

  const {
    Engine,
    Render,
    Runner,
    Bodies,
    Body,
    Composite,
    Events,
    Vector,
  } = Matter;

  const W = window.innerWidth;
  const H = window.innerHeight;
  const renderPixelRatio = Math.min(2, window.devicePixelRatio || 1);
  const topPad = 24;
  const bottomPad = 24;
  const hudLeft = 12;
  const hudWidth = Math.min(520, Math.max(320, Math.floor(W * 0.4)));
  const hudRight = hudLeft + hudWidth;
  const desiredSheetWidth = Math.min(525, W * 0.625);
  const rightAreaWidth = Math.max(240, W - hudRight);
  const fittedSheetWidth = Math.min(desiredSheetWidth, Math.max(220, rightAreaWidth - 24));
  const sideGap = Math.max(12, (rightAreaWidth - fittedSheetWidth) * 0.5);
  const sheet = {
    x: hudRight + sideGap + fittedSheetWidth * 0.5,
    width: fittedSheetWidth,
    top: topPad,
    height: H * 4.2,
    houseY: topPad + H * 3.05,
  };

  const twelveFootRadius = sheet.width * 0.38;
  const feetToPx = twelveFootRadius / 6;
  const stoneRadius = 20;
  const blueRingRadius = 6 * feetToPx;
  const whiteRingRadius = 4.5 * feetToPx;
  const greenRingRadius = 1.9 * feetToPx;
  const centerIceRadius = stoneRadius * 1.15;
  const greenRingRadiusExpanded = greenRingRadius * 1.2;
  const centerIceRadiusExpanded = centerIceRadius + (greenRingRadiusExpanded - greenRingRadius);
  const lineY = {
    tee: sheet.houseY,
    hog: sheet.houseY - 21 * feetToPx,
    out: sheet.top + sheet.height - 140,
  };

  const house = {
    x: sheet.x,
    y: sheet.houseY,
    rings: [blueRingRadius, whiteRingRadius, greenRingRadiusExpanded, centerIceRadiusExpanded],
  };
  const lowerGreenY = lineY.tee + house.rings[0] + 200;
  const hackOffset = 0.65 * feetToPx;
  const hackY = sheet.top + 96;
  const hackMarkWidth = 18;
  const leftHackX = house.x - 26 - hackOffset;
  const rightHackX = house.x + 8 + hackOffset;
  const curlLimiterExpand = 112;
  const maxSpinInfluence = 0.5;
  const maxCurlPerTick = 0.032;
  const sweepBlockMultiplier = 2.6;
  const sweepTapWindowMs = 180;
  const preReleaseLeftLimit = leftHackX + hackMarkWidth - curlLimiterExpand;
  const preReleaseRightLimit = rightHackX + curlLimiterExpand;

  const teams = [
    { name: "Great Britain", short: "GB", color: "#d62828", count: 0, score: 0, dotClass: "red" },
    { name: "United States", short: "USA", color: "#fcbf49", count: 0, score: 0, dotClass: "yellow" },
  ];
  const totalEnds = 3;
  const stonesPerTeam = 6;
  const shotsPerEnd = stonesPerTeam * 2;

  const ui = {
    gbDots: document.getElementById("gbDots"),
    gbScore: document.getElementById("gbScore"),
    gerDots: document.getElementById("gerDots"),
    gerScore: document.getElementById("gerScore"),
    endBadge: document.getElementById("endBadge"),
  };
  const titleScreenEl = document.getElementById("titleScreen");
  const hudEl = document.querySelector(".hud");
  if (hudEl) hudEl.style.width = hudWidth + "px";

  const engine = Engine.create({
    gravity: { x: 0, y: 0 },
  });
  const world = engine.world;

  const render = Render.create({
    element: document.body,
    engine,
    options: {
      width: W,
      height: H,
      wireframes: false,
      background: "transparent",
      hasBounds: true,
      pixelRatio: renderPixelRatio,
    },
  });

  const runner = Runner.create({ delta: 1000 / 60, isFixed: true });

  let pointer = { x: W * 0.5, y: H * 0.42 };
  let pointerTargetX = W * 0.5;
  let turnIndex = 0;
  let nextTeamIdx = 0;
  let totalShots = 0;
  let isCharging = false;
  let charge = 0;
  let chargeStartAt = 0;
  let chargingStone = null;
  let activeStone = null;
  let shotReleased = false;
  let scrub = 0;
  let lastSweepInputAt = 0;
  let aimLeftHeld = false;
  let aimRightHeld = false;
  let spaceHeld = false;
  let cameraY = 0;
  let awaitingNextShotReset = false;
  let awaitingNextEndKey = false;
  let pendingNextEndSetup = false;
  let endFlashActive = false;
  let endFlashStartedAt = 0;
  let endFlashPromptText = "";
  const endFlashStoneIds = new Set();
  const endFlashCycles = 3;
  const endFlashCycleMs = 420;
  let cameraResetRequested = false;
  let awaitingAllStonesStop = false;
  let allStoppedFrames = 0;
  let gameStarted = false;
  let done = false;
  let postEndInputLockUntil = 0;
  let currentEnd = 1;
  let winnerTeamIdx = null;
  const allStones = [];
  const uiState = {
    gbLeft: -1,
    usaLeft: -1,
    gbScore: -1,
    usaScore: -1,
    endShown: -1,
  };
  let audioCtx = null;
  let slideNoise = null;
  let slideFilter = null;
  let slideGain = null;
  let sweepFilter = null;
  let sweepGain = null;
  let icePattern = null;
  const flagImages = {
    0: Object.assign(new Image(), { src: "images/union-flag.png" }),
    1: Object.assign(new Image(), { src: "images/star-spangled-banner.png" }),
  };
  const flagFallbackEls = [
    document.querySelector('img[src="images/union-flag.png"]'),
    document.querySelector('img[src="images/star-spangled-banner.png"]'),
  ];
  const winnerBanner = Object.assign(new Image(), { src: "images/winner.png" });
  const stoneSprites = {
    red: Object.assign(new Image(), { src: "images/red-stone.png" }),
    yellow: Object.assign(new Image(), { src: "images/yellow-stone.png" }),
  };
  const broomRightSprite = Object.assign(new Image(), { src: "images/broom-right.png" });
  const centerTargetImage = Object.assign(new Image(), { src: "images/score-header.png" });
  const houseRingFillColors = [
    "rgba(31, 104, 182, 0.72)",
    "rgba(255, 255, 255, 0.64)",
    "rgba(31, 168, 79, 0.72)",
    "rgba(255, 255, 255, 0.74)",
  ];
  const houseRingEdgeColors = [
    "rgba(109, 168, 199, 0.55)",
    "rgba(109, 168, 199, 0.38)",
    "rgba(43, 108, 176, 0.8)",
    "rgba(43, 108, 176, 0.8)",
  ];

  const minLaunchVY = 4.8;
  const maxLaunchVY = 14.6;
  const powerRampUpMs = 1200;
  const powerHoldMs = 220;
  const powerRampDownMs = 1000;
  const powerCycleMs = powerRampUpMs + powerHoldMs + powerRampDownMs;
  const minReleaseCharge = 0.38;
  const referenceDt = 1 / 60; // physics tuned at 60fps

  function getIcePattern(ctx) {
    if (icePattern) return icePattern;
    const tile = document.createElement("canvas");
    tile.width = 256;
    tile.height = 256;
    const tc = tile.getContext("2d");
    if (!tc) return null;

    // Pebble texture (characteristic of real curling ice).
    tc.fillStyle = "rgba(200, 230, 248, 0.18)";
    for (let i = 0; i < 800; i += 1) {
      const x = Math.random() * tile.width;
      const y = Math.random() * tile.height;
      const r = 1.0 + Math.random() * 2.4;
      tc.beginPath();
      tc.arc(x, y, r, 0, Math.PI * 2);
      tc.fill();
    }

    // Fine frosty grain.
    tc.fillStyle = "rgba(255, 255, 255, 0.12)";
    for (let i = 0; i < 2000; i += 1) {
      const x = Math.random() * tile.width;
      const y = Math.random() * tile.height;
      const s = 0.4 + Math.random() * 1.2;
      tc.fillRect(x, y, s, s);
    }

    // Directional scratches (near-horizontal curling marks).
    tc.strokeStyle = "rgba(120, 170, 200, 0.28)";
    tc.lineWidth = 0.8;
    for (let i = 0; i < 65; i += 1) {
      const x = Math.random() * tile.width;
      const y = Math.random() * tile.height;
      const len = 20 + Math.random() * 70;
      const ang = -0.3 + Math.random() * 0.15;
      tc.beginPath();
      tc.moveTo(x, y);
      tc.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      tc.stroke();
    }

    // Cross scratches (from stone travel).
    tc.strokeStyle = "rgba(140, 190, 218, 0.18)";
    tc.lineWidth = 0.6;
    for (let i = 0; i < 28; i += 1) {
      const x = Math.random() * tile.width;
      const y = Math.random() * tile.height;
      const len = 30 + Math.random() * 90;
      const ang = -1.5 + Math.random() * 0.3;
      tc.beginPath();
      tc.moveTo(x, y);
      tc.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      tc.stroke();
    }

    // Frost patches.
    for (let i = 0; i < 12; i += 1) {
      const x = Math.random() * tile.width;
      const y = Math.random() * tile.height;
      const r = 10 + Math.random() * 22;
      const grad = tc.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, "rgba(255, 255, 255, 0.12)");
      grad.addColorStop(1, "rgba(255, 255, 255, 0)");
      tc.fillStyle = grad;
      tc.fillRect(x - r, y - r, r * 2, r * 2);
    }

    icePattern = ctx.createPattern(tile, "repeat");
    return icePattern;
  }

  function initAudio() {
    if (audioCtx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();

    const noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * 0.35;

    slideNoise = audioCtx.createBufferSource();
    slideNoise.buffer = noiseBuffer;
    slideNoise.loop = true;

    slideFilter = audioCtx.createBiquadFilter();
    slideFilter.type = "bandpass";
    slideFilter.frequency.value = 420;
    slideFilter.Q.value = 0.8;

    slideGain = audioCtx.createGain();
    slideGain.gain.value = 0;
    sweepFilter = audioCtx.createBiquadFilter();
    sweepFilter.type = "bandpass";
    sweepFilter.frequency.value = 1800;
    sweepFilter.Q.value = 0.9;
    sweepGain = audioCtx.createGain();
    sweepGain.gain.value = 0;

    const master = audioCtx.createGain();
    master.gain.value = 0.85;

    slideNoise.connect(slideFilter);
    slideFilter.connect(slideGain);
    slideGain.connect(master);
    slideNoise.connect(sweepFilter);
    sweepFilter.connect(sweepGain);
    sweepGain.connect(master);
    master.connect(audioCtx.destination);
    slideNoise.start();
  }

  function updateSlideAudio() {
    if (!audioCtx || !slideGain || !slideFilter) return;
    let movingCount = 0;
    let speedSum = 0;
    let maxSpeed = 0;
    for (const s of allStones) {
      const sp = stoneSpeed(s);
      if (sp > 0.03) {
        movingCount += 1;
        speedSum += sp;
        if (sp > maxSpeed) maxSpeed = sp;
      }
    }

    const intensity = movingCount === 0 ? 0 : Math.min(1, maxSpeed / 11 + speedSum / 60);
    const now = audioCtx.currentTime;
    slideGain.gain.setTargetAtTime(0.18 * intensity, now, 0.05);
    slideFilter.frequency.setTargetAtTime(320 + 1550 * intensity, now, 0.07);
    slideFilter.Q.setTargetAtTime(0.7 + 1.8 * intensity, now, 0.09);

    if (sweepGain && sweepFilter) {
      const sweepTouchActive = performance.now() - lastSweepInputAt < sweepTapWindowMs;
      const sweepActive =
        shotReleased &&
        activeStone &&
        scrub > 0.08 &&
        sweepTouchActive &&
        !isSweepBlockedForActiveStone();
      const sweepIntensity = sweepActive ? Math.min(1, scrub / 2.2) : 0;
      sweepGain.gain.setTargetAtTime(0.08 * sweepIntensity, now, 0.05);
      sweepFilter.frequency.setTargetAtTime(1500 + 900 * sweepIntensity, now, 0.07);
      sweepFilter.Q.setTargetAtTime(0.8 + 0.8 * sweepIntensity, now, 0.08);
    }
  }

  function playCollisionSound(impact) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const i = Math.min(1, Math.max(0, impact / 6));
    if (i < 0.06) return;

    const tone = audioCtx.createOscillator();
    tone.type = "triangle";
    tone.frequency.setValueAtTime(720 + 520 * i, now);
    tone.frequency.exponentialRampToValueAtTime(250, now + 0.05);

    const toneGain = audioCtx.createGain();
    toneGain.gain.setValueAtTime(0.0001, now);
    toneGain.gain.exponentialRampToValueAtTime(0.04 + 0.09 * i, now + 0.002);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

    const noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.035, audioCtx.sampleRate);
    const n = noiseBuffer.getChannelData(0);
    for (let j = 0; j < n.length; j += 1) n[j] = (Math.random() * 2 - 1) * 0.55;
    const hitNoise = audioCtx.createBufferSource();
    hitNoise.buffer = noiseBuffer;

    const hitFilter = audioCtx.createBiquadFilter();
    hitFilter.type = "highpass";
    hitFilter.frequency.value = 1450;

    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.02 + 0.05 * i, now + 0.0015);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);

    tone.connect(toneGain).connect(audioCtx.destination);
    hitNoise.connect(hitFilter).connect(noiseGain).connect(audioCtx.destination);

    tone.start(now);
    tone.stop(now + 0.06);
    hitNoise.start(now);
    hitNoise.stop(now + 0.035);
  }

  const laneLeft = sheet.x - sheet.width * 0.5;
  const laneRight = sheet.x + sheet.width * 0.5;
  const wallThickness = 80;
  const sideWallColor = "rgba(43, 108, 176, 0.85)";

  const boundaries = [
    Bodies.rectangle(sheet.x, sheet.top - wallThickness * 0.5, sheet.width + wallThickness * 2, wallThickness, {
      isStatic: true,
      render: { visible: false },
    }),
    Bodies.rectangle(sheet.x, sheet.top + sheet.height + wallThickness * 0.5, sheet.width + wallThickness * 2, wallThickness, {
      isStatic: true,
      render: { visible: false },
    }),
    Bodies.rectangle(laneLeft - wallThickness * 0.5, sheet.top + sheet.height * 0.5, wallThickness, sheet.height, {
      isStatic: true,
      render: { visible: false },
    }),
    Bodies.rectangle(laneRight + wallThickness * 0.5, sheet.top + sheet.height * 0.5, wallThickness, sheet.height, {
      isStatic: true,
      render: { visible: false },
    }),
  ];
  Composite.add(world, boundaries);

  // Pre-render ice strip to offscreen canvas (drawn once, blitted every frame).
  const iceGrW = 9;
  const iceBlW = 60;
  const iceBorder = iceGrW + iceBlW + iceGrW;
  const iceStripW = Math.ceil(sheet.width + iceBorder * 2);
  const iceStripH = Math.ceil(sheet.height);
  const iceStrip = document.createElement("canvas");
  iceStrip.width = iceStripW;
  iceStrip.height = iceStripH;
  const iceStripCtx = iceStrip.getContext("2d");
  if (iceStripCtx) {
    const oL = iceBorder;
    const oR = iceBorder + sheet.width;
    const h = iceStripH;
    const bGrey = "rgba(98, 106, 114, 0.9)";

    // Left border: grey | blue | grey
    iceStripCtx.fillStyle = bGrey;
    iceStripCtx.fillRect(0, 0, iceGrW, h);
    iceStripCtx.fillStyle = sideWallColor;
    iceStripCtx.fillRect(iceGrW, 0, iceBlW, h);
    iceStripCtx.fillStyle = bGrey;
    iceStripCtx.fillRect(iceGrW + iceBlW, 0, iceGrW, h);

    // Right border: grey | blue | grey
    iceStripCtx.fillStyle = bGrey;
    iceStripCtx.fillRect(oR, 0, iceGrW, h);
    iceStripCtx.fillStyle = sideWallColor;
    iceStripCtx.fillRect(oR + iceGrW, 0, iceBlW, h);
    iceStripCtx.fillStyle = bGrey;
    iceStripCtx.fillRect(oR + iceGrW + iceBlW, 0, iceGrW, h);

    // Ice gradient
    const iceGrad = iceStripCtx.createLinearGradient(oL, 0, oR, 0);
    iceGrad.addColorStop(0, "#deeff8");
    iceGrad.addColorStop(0.5, "#ecf8ff");
    iceGrad.addColorStop(1, "#deeff8");
    iceStripCtx.fillStyle = iceGrad;
    iceStripCtx.fillRect(oL, 0, sheet.width, h);

    // Ice texture overlay
    const pat = getIcePattern(iceStripCtx);
    if (pat) {
      iceStripCtx.save();
      iceStripCtx.globalAlpha = 0.9;
      iceStripCtx.fillStyle = pat;
      iceStripCtx.fillRect(oL, 0, sheet.width, h);
      iceStripCtx.restore();
    }

    // Large-scale frost glare bands (horizontal shimmer).
    for (let i = 0; i < 18; i += 1) {
      const by = Math.random() * h;
      const bh = 40 + Math.random() * 120;
      const grad = iceStripCtx.createLinearGradient(oL, by, oL, by + bh);
      grad.addColorStop(0, "rgba(255, 255, 255, 0)");
      grad.addColorStop(0.5, "rgba(240, 250, 255, " + (0.06 + Math.random() * 0.08) + ")");
      grad.addColorStop(1, "rgba(255, 255, 255, 0)");
      iceStripCtx.fillStyle = grad;
      iceStripCtx.fillRect(oL, by, sheet.width, bh);
    }

    // Long scratch marks spanning the ice surface.
    iceStripCtx.save();
    iceStripCtx.beginPath();
    iceStripCtx.rect(oL, 0, sheet.width, h);
    iceStripCtx.clip();
    for (let i = 0; i < 40; i += 1) {
      const sx = oL + Math.random() * sheet.width;
      const sy = Math.random() * h;
      const len = 80 + Math.random() * 300;
      const ang = -1.5 + Math.random() * 0.2;
      iceStripCtx.strokeStyle = "rgba(160, 210, 235, " + (0.1 + Math.random() * 0.15) + ")";
      iceStripCtx.lineWidth = 0.4 + Math.random() * 0.8;
      iceStripCtx.beginPath();
      iceStripCtx.moveTo(sx, sy);
      iceStripCtx.lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len);
      iceStripCtx.stroke();
    }
    iceStripCtx.restore();

    // Scattered frost sparkle spots.
    for (let i = 0; i < 60; i += 1) {
      const fx = oL + Math.random() * sheet.width;
      const fy = Math.random() * h;
      const fr = 3 + Math.random() * 8;
      const sparkle = iceStripCtx.createRadialGradient(fx, fy, 0, fx, fy, fr);
      sparkle.addColorStop(0, "rgba(255, 255, 255, " + (0.15 + Math.random() * 0.2) + ")");
      sparkle.addColorStop(1, "rgba(255, 255, 255, 0)");
      iceStripCtx.fillStyle = sparkle;
      iceStripCtx.fillRect(fx - fr, fy - fr, fr * 2, fr * 2);
    }

    // Edge strokes
    iceStripCtx.strokeStyle = "rgba(98, 156, 188, 0.9)";
    iceStripCtx.lineWidth = 3;
    iceStripCtx.beginPath();
    iceStripCtx.moveTo(oL, 0);
    iceStripCtx.lineTo(oL, h);
    iceStripCtx.moveTo(oR, 0);
    iceStripCtx.lineTo(oR, h);
    iceStripCtx.moveTo(oL, h);
    iceStripCtx.lineTo(oR, h);
    iceStripCtx.stroke();

    // Repaint inner grey to cover blue seam from edge stroke
    iceStripCtx.fillStyle = bGrey;
    iceStripCtx.fillRect(iceGrW + iceBlW, 0, iceGrW, h);
    iceStripCtx.fillRect(oR, 0, iceGrW, h);
  }

  function drawIceBase() {
    const c = render.context;
    const texTop = Math.max(sheet.top, render.bounds.min.y - 24);
    const texBottom = Math.min(sheet.top + sheet.height, render.bounds.max.y + 24);
    const texHeight = texBottom - texTop;
    if (texHeight <= 0) return;
    const sy = texTop - sheet.top;
    c.drawImage(iceStrip, 0, sy, iceStripW, texHeight,
      laneLeft - iceBorder, texTop, iceStripW, texHeight);
  }

  function drawSheetDecor() {
    const c = render.context;
    c.save();

    c.strokeStyle = "#71aecd";
    c.lineWidth = 2;

    c.strokeStyle = "rgba(136, 136, 136, 0.42)";
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(house.x, sheet.top + 8);
    c.lineTo(house.x, sheet.top + sheet.height - 8);
    c.stroke();

    c.strokeStyle = "rgba(42, 157, 79, 0.45)";
    c.lineWidth = 9;
    c.beginPath();
    c.moveTo(laneLeft, lowerGreenY);
    c.lineTo(laneRight, lowerGreenY);
    c.stroke();

    // Thin center horizontal line through the target (tee line).
    c.strokeStyle = "rgba(136, 136, 136, 0.42)";
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(laneLeft, lineY.tee);
    c.lineTo(laneRight, lineY.tee);
    c.stroke();

    // Bottom red removal line (stones are removed only after crossing this).
    c.strokeStyle = "#d45151";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(laneLeft, lineY.out);
    c.lineTo(laneRight, lineY.out);
    c.stroke();

    c.strokeStyle = "rgba(42, 157, 79, 0.45)";
    c.lineWidth = 9;
    c.beginPath();
    c.moveTo(laneLeft, lineY.hog);
    c.lineTo(laneRight, lineY.hog);
    c.stroke();

    for (let i = 0; i < house.rings.length; i += 1) {
      c.beginPath();
      c.fillStyle = houseRingFillColors[i];
      c.arc(house.x, house.y, house.rings[i], 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = houseRingEdgeColors[i];
      c.lineWidth = 1;
      c.stroke();
    }

    // Center emblem inside the white button.
    if (centerTargetImage.complete && centerTargetImage.naturalWidth > 0) {
      const centerR = house.rings[3];
      const maxBox = centerR * 1.9;
      const iw = centerTargetImage.naturalWidth;
      const ih = centerTargetImage.naturalHeight;
      const s = Math.min(maxBox / iw, maxBox / ih);
      const dw = iw * s;
      const dh = ih * s;
      const dx = house.x - dw * 0.5;
      const dy = house.y - dh * 0.5;
      c.save();
      c.beginPath();
      c.arc(house.x, house.y, centerR * 0.98, 0, Math.PI * 2);
      c.clip();
      c.globalAlpha = 0.58;
      c.drawImage(centerTargetImage, dx, dy, dw, dh);
      c.restore();
    }

    // Visual aim limiters: keep these aligned with the actual pre-release clamp.
    // Aim limit markers: outward-facing blue arrows.
    const arrowY = hackY + 3;
    const arrowH = 16;
    const arrowW = 12;
    c.fillStyle = "rgba(220, 64, 64, 0.55)";
    c.strokeStyle = "rgba(255, 186, 186, 0.66)";
    c.lineWidth = 1;

    // Left arrow (points outward to the left).
    c.beginPath();
    c.moveTo(preReleaseLeftLimit - arrowW, arrowY);
    c.lineTo(preReleaseLeftLimit, arrowY - arrowH * 0.5);
    c.lineTo(preReleaseLeftLimit, arrowY + arrowH * 0.5);
    c.closePath();
    c.fill();
    c.stroke();

    // Right arrow (points outward to the right).
    c.beginPath();
    c.moveTo(preReleaseRightLimit + arrowW, arrowY);
    c.lineTo(preReleaseRightLimit, arrowY - arrowH * 0.5);
    c.lineTo(preReleaseRightLimit, arrowY + arrowH * 0.5);
    c.closePath();
    c.fill();
    c.stroke();

    c.restore();
  }

  function drawStonesOverlay() {
    const c = render.context;
    c.save();
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "high";
    const flashElapsed = performance.now() - endFlashStartedAt;
    const flashOn = Math.floor(flashElapsed / (endFlashCycleMs * 0.5)) % 2 === 0;
    for (const stone of allStones) {
      if (endFlashActive && endFlashStoneIds.has(stone.id) && !flashOn) continue;
      const team = teams[stone.plugin.teamIdx];
      const r = stone.circleRadius || stoneRadius;
      const x = stone.position.x;
      const y = stone.position.y;
      const sprite = team.dotClass === "red" ? stoneSprites.red : stoneSprites.yellow;
      const drawSize = r * 2.55;

      if (sprite && sprite.complete && sprite.naturalWidth > 0) {
        const srcSide = Math.min(sprite.naturalWidth, sprite.naturalHeight);
        const sx = (sprite.naturalWidth - srcSide) * 0.5;
        const sy = (sprite.naturalHeight - srcSide) * 0.5;
        c.save();
        c.translate(x, y);
        c.rotate(stone.plugin.handleAngle || 0);
        c.drawImage(
          sprite,
          sx,
          sy,
          srcSide,
          srcSide,
          -drawSize * 0.5,
          -drawSize * 0.5,
          drawSize,
          drawSize
        );
        c.restore();
      } else {
        // Fallback marker while sprite is loading.
        c.beginPath();
        c.fillStyle = team.color;
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.restore();
  }

  function drawSweepGhost() {
    const sweepTouchActive = performance.now() - lastSweepInputAt < sweepTapWindowMs;
    if (!shotReleased || !activeStone || scrub <= 0.08 || !sweepTouchActive || isSweepBlockedForActiveStone()) return;
    const speed = stoneSpeed(activeStone);
    if (speed < 0.05) return;
    if (!broomRightSprite.complete || broomRightSprite.naturalWidth <= 0) return;

    const c = render.context;
    const x = activeStone.position.x;
    const y = activeStone.position.y;
    const t = performance.now() * 0.006;
    const vigor = Math.min(1, scrub / 2.2);

    // Draw a small transparent broom sprite near the running stone.
    const bob = Math.sin(t * 2.2) * (5.2 + 3.2 * vigor);
    const sweepX = Math.sin(t * 2.8) * (10 + 10 * vigor);
    const bw = 90 + 30 * vigor;
    const bh = bw * (broomRightSprite.naturalHeight / broomRightSprite.naturalWidth);
    const bx = x + sweepX + 2;
    const by = y + stoneRadius * 2.5 + bob - 6;
    const angle = 0.24 + Math.sin(t * 2.4) * (0.1 + 0.05 * vigor);

    c.save();
    c.globalAlpha = 0.45 + 0.28 * vigor;
    c.translate(bx, by);
    c.rotate(angle);
    c.drawImage(broomRightSprite, -bw * 0.5, -bh * 0.5, bw, bh);
    c.restore();
  }

  function createStone(team, x, y, teamIdx) {
    const stone = Bodies.circle(x, y, stoneRadius, {
      restitution: 0.08,
      friction: 0.003,
      frictionStatic: 0.022,
      frictionAir: 0.0008,
      density: 0.0035,
      slop: 0.01,
      label: `stone-${team.name.toLowerCase()}`,
      render: { visible: false },
    });

    stone.plugin = {
      teamName: team.name,
      teamIdx,
      moving: false,
      spin: 0,
      spinDir: 0,
      spinStrength: 0,
      handleAngle: 0,
      hitDampingTime: 0,
      releasedAt: 0,
    };
    Body.setMass(stone, 10);

    Composite.add(world, stone);
    allStones.push(stone);
    return stone;
  }

  function clampAimX(x) {
    return Math.max(preReleaseLeftLimit, Math.min(preReleaseRightLimit, x));
  }

  function launchSpotX() {
    return clampAimX(pointer.x);
  }

  function spawnNextStone() {
    if (done) return;
    if (totalShots >= shotsPerEnd) {
      finalizeEnd();
      return;
    }
    const teamIdx = nextTeamIdx;
    const team = teams[teamIdx];
    // New stone always starts centered; player can then aim left/right.
    pointerTargetX = sheet.x;
    pointer.x = sheet.x;
    const x = sheet.x;
    const y = sheet.top + 96;
    chargingStone = createStone(team, x, y, teamIdx);
    activeStone = chargingStone;
    shotReleased = false;
    scrub = 0;
    spaceHeld = false;
    isCharging = false;
    charge = 0;
    chargeStartAt = 0;
    pointerTargetX = clampAimX(pointerTargetX);
    pointer.x = clampAimX(pointer.x);
    updateUi("Aim with mouse or arrows. Hold Space to charge, release Space to throw.");
  }

  function releaseStone() {
    if (!chargingStone || shotReleased) return;

    const p = chargingStone.position;
    const clampedX = clampAimX(pointer.x);
    const lateralNorm = (clampedX - sheet.x) / ((sheet.width * 0.5) - stoneRadius - 10);
    const limitedNorm = Math.max(-1, Math.min(1, lateralNorm));
    const spinNorm = Math.max(-maxSpinInfluence, Math.min(maxSpinInfluence, limitedNorm));

    // Bounded release power curve: realistic cap, no excessive over-boost.
    const power = Math.max(minReleaseCharge, Math.min(1, charge));
    const curvedPower = Math.pow(power, 1.05);
    const launchVX = 0;
    const launchVY = minLaunchVY + (maxLaunchVY - minLaunchVY) * curvedPower;
    Body.setVelocity(chargingStone, { x: launchVX, y: launchVY });
    chargingStone.plugin.spin = spinNorm * 0.001;
    chargingStone.plugin.spinStrength = Math.abs(spinNorm);
    chargingStone.plugin.spinDir = spinNorm === 0 ? 0 : -Math.sign(spinNorm);
    chargingStone.plugin.handleAngle = 0;
    chargingStone.plugin.moving = true;
    chargingStone.plugin.releasedAt = engine.timing.timestamp;

    shotReleased = true;
    isCharging = false;
    spaceHeld = false;
    charge = 0;
    chargeStartAt = 0;
    chargingStone = null;

    updateUi("Stone released. Tap Space rapidly to sweep.");
  }

  function stoneSpeed(stone) {
    const v = stone.velocity;
    return Math.sqrt(v.x * v.x + v.y * v.y);
  }

  function completeShotAndAdvanceTurn() {
    const shotTeamIdx = activeStone?.plugin?.teamIdx ?? (turnIndex % 2);
    activeStone = null;
    shotReleased = false;
    scrub = 0;
    totalShots += 1;
    teams[shotTeamIdx].count += 1;
    nextTeamIdx = 1 - shotTeamIdx;
    turnIndex = nextTeamIdx;
    isCharging = false;
    charge = 0;
    chargeStartAt = 0;
    chargingStone = null;
    spaceHeld = false;

    if (totalShots >= shotsPerEnd) {
      finalizeEnd();
      return;
    }

    awaitingNextShotReset = true;
    cameraResetRequested = false;
    updateUi("Shot finished. Press Space to scroll back for next stone.");
  }

  function areAllStonesStopped() {
    for (const stone of allStones) {
      if (stoneSpeed(stone) > 0.045) return false;
    }
    return true;
  }

  function beginSettlePhase(statusText) {
    activeStone = null;
    shotReleased = false;
    scrub = 0;
    awaitingAllStonesStop = true;
    allStoppedFrames = 0;
    updateUi(statusText || "Waiting for all stones to stop...");
  }

  function removeStoneFromPlay(stone) {
    Composite.remove(world, stone);
    const idx = allStones.indexOf(stone);
    if (idx >= 0) allStones.splice(idx, 1);
  }

  function clearAllStones() {
    for (const stone of allStones) Composite.remove(world, stone);
    allStones.length = 0;
  }

  function resetForNextEnd() {
    clearAllStones();
    teams[0].count = 0;
    teams[1].count = 0;
    nextTeamIdx = 0;
    turnIndex = 0;
    totalShots = 0;
    activeStone = null;
    chargingStone = null;
    shotReleased = false;
    isCharging = false;
    spaceHeld = false;
    charge = 0;
    chargeStartAt = 0;
    scrub = 0;
    lastSweepInputAt = 0;
    awaitingAllStonesStop = false;
    allStoppedFrames = 0;
    awaitingNextShotReset = false;
    awaitingNextEndKey = false;
    pendingNextEndSetup = false;
    endFlashActive = false;
    endFlashStartedAt = 0;
    endFlashPromptText = "";
    endFlashStoneIds.clear();
    cameraResetRequested = false;
  }

  function stageNextEnd(scoredMsg, flashingStoneBodies) {
    currentEnd += 1;
    pendingNextEndSetup = true;
    awaitingNextShotReset = false;
    awaitingNextEndKey = false;
    cameraResetRequested = false;
    endFlashPromptText = `${scoredMsg} Press any key for End ${currentEnd}.`;
    endFlashStoneIds.clear();
    for (const s of flashingStoneBodies || []) endFlashStoneIds.add(s.id);
    if (endFlashStoneIds.size > 0) {
      endFlashActive = true;
      endFlashStartedAt = performance.now();
      updateUi(scoredMsg);
    } else {
      endFlashActive = false;
      awaitingNextEndKey = true;
      updateUi(endFlashPromptText);
    }
  }

  function maybeEndShot() {
    if (!activeStone || !shotReleased) return;

    const speed = stoneSpeed(activeStone);
    const aliveMs = engine.timing.timestamp - activeStone.plugin.releasedAt;

    if (aliveMs > 1800 && speed < 0.06) {
      if (activeStone.position.y < lineY.hog) {
        removeStoneFromPlay(activeStone);
        beginSettlePhase("Stone did not cross hog line and is removed. Waiting for stones to stop.");
        return;
      }
      Body.setVelocity(activeStone, { x: 0, y: 0 });
      Body.setAngularVelocity(activeStone, 0);
      activeStone.plugin.moving = false;
      beginSettlePhase("Waiting for all stones to stop...");
    }
  }

  function isSweepBlockedForActiveStone() {
    if (!activeStone) return false;
    const ax = activeStone.position.x;
    const ay = activeStone.position.y;
    const ar = activeStone.circleRadius || stoneRadius;
    for (const stone of allStones) {
      if (stone === activeStone) continue;
      const bx = stone.position.x;
      const by = stone.position.y;
      const br = stone.circleRadius || stoneRadius;
      const dx = ax - bx;
      const dy = ay - by;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Use visual-size-aware threshold so sweeping is blocked before stones appear to overlap.
      const blockDist = Math.max(ar, br) * sweepBlockMultiplier;
      if (dist <= blockDist) return true;
    }
    return false;
  }

  function finalizeEnd() {
    const scoringStones = allStones
      .map((s) => ({
        stone: s,
        team: teams[s.plugin.teamIdx],
        dist: Vector.magnitude(Vector.sub(s.position, { x: house.x, y: house.y })),
        radius: s.circleRadius || stoneRadius,
      }))
      // Only stones with any part touching/breaking the outer blue ring are eligible.
      // Equivalent rule: center distance minus stone radius <= blue ring radius.
      .filter((x) => x.dist - x.radius <= house.rings[0] + 1e-6)
      .sort((a, b) => a.dist - b.dist);

    if (!scoringStones.length) {
      const scoredMsg = `End ${currentEnd} complete. No stones in the house.`;
      if (currentEnd < totalEnds) {
        stageNextEnd(scoredMsg, []);
        return;
      }

      done = true;
      if (teams[0].score > teams[1].score) {
        winnerTeamIdx = 0;
      } else if (teams[1].score > teams[0].score) {
        winnerTeamIdx = 1;
      } else {
        winnerTeamIdx = null;
      }
      updateUi(`${scoredMsg} Match finished.`);
      return;
    }

    const winningTeam = scoringStones[0].team;
    const nearestOpponentDist =
      scoringStones.find((x) => x.team !== winningTeam)?.dist ?? Infinity;

    // Curling end scoring: winner gets one point per stone closer than opponent's nearest.
    const epsilon = 1e-6;
    const points = scoringStones.filter(
      (x) => x.team === winningTeam && x.dist + epsilon < nearestOpponentDist
    ).length;
    const pointStones = scoringStones
      .filter((x) => x.team === winningTeam && x.dist + epsilon < nearestOpponentDist)
      .map((x) => x.stone);
    winningTeam.score += points;
    const scoredMsg = `End ${currentEnd} complete. ${winningTeam.name} scores ${points}.`;

    if (currentEnd < totalEnds) {
      stageNextEnd(scoredMsg, pointStones);
      return;
    }

    done = true;
    if (teams[0].score > teams[1].score) {
      winnerTeamIdx = 0;
    } else if (teams[1].score > teams[0].score) {
      winnerTeamIdx = 1;
    } else {
      winnerTeamIdx = null;
    }
    updateUi(`${scoredMsg} Match finished.`);
  }

  function updateUi(statusText) {
    void statusText;
    updateStonesLeftTable();
  }

  function renderDots(el, count, dotClass) {
    if (!el) return;
    const safeCount = Math.max(0, Math.min(stonesPerTeam, count));
    el.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "dots";
    for (let i = 0; i < safeCount; i += 1) {
      const dot = document.createElement("span");
      dot.className = `dot ${dotClass}`;
      wrap.appendChild(dot);
    }
    el.appendChild(wrap);
  }

  function updateStonesLeftTable() {
    const gbLeft = stonesPerTeam - teams[0].count;
    const usaLeft = stonesPerTeam - teams[1].count;
    const shownEnd = Math.min(currentEnd, totalEnds);

    if (gbLeft !== uiState.gbLeft) {
      renderDots(ui.gbDots, gbLeft, teams[0].dotClass);
      uiState.gbLeft = gbLeft;
    }
    if (usaLeft !== uiState.usaLeft) {
      renderDots(ui.gerDots, usaLeft, teams[1].dotClass);
      uiState.usaLeft = usaLeft;
    }
    if (teams[0].score !== uiState.gbScore) {
      if (ui.gbScore) ui.gbScore.textContent = String(teams[0].score);
      uiState.gbScore = teams[0].score;
    }
    if (teams[1].score !== uiState.usaScore) {
      if (ui.gerScore) ui.gerScore.textContent = String(teams[1].score);
      uiState.usaScore = teams[1].score;
    }
    if (shownEnd !== uiState.endShown) {
      if (ui.endBadge) ui.endBadge.textContent = String(shownEnd);
      uiState.endShown = shownEnd;
    }
  }

  function restartMatchFromEnd() {
    clearAllStones();
    teams[0].count = 0;
    teams[1].count = 0;
    teams[0].score = 0;
    teams[1].score = 0;
    currentEnd = 1;
    nextTeamIdx = 0;
    turnIndex = 0;
    totalShots = 0;
    activeStone = null;
    chargingStone = null;
    shotReleased = false;
    isCharging = false;
    charge = 0;
    chargeStartAt = 0;
    spaceHeld = false;
    scrub = 0;
    lastSweepInputAt = 0;
    awaitingNextShotReset = false;
    awaitingNextEndKey = false;
    cameraResetRequested = false;
    awaitingAllStonesStop = false;
    allStoppedFrames = 0;
    cameraY = 0;
    done = false;
    postEndInputLockUntil = performance.now() + 900;
    winnerTeamIdx = null;
    uiState.gbLeft = -1;
    uiState.usaLeft = -1;
    uiState.gbScore = -1;
    uiState.usaScore = -1;
    uiState.endShown = -1;
    updateUi("New game started.");
    spawnNextStone();
  }

  function updatePointerFromEvent(e) {
    const targetX = clampAimX(e.clientX);
    // Dampen direct mouse/trackpad aim to reduce sensitivity.
    pointerTargetX += (targetX - pointerTargetX) * 0.18;
  }

  // Use pointer events only to avoid duplicate mouse+pointer updates.
  window.addEventListener("pointermove", updatePointerFromEvent);

  function isSpaceEvent(e) {
    return e.code === "Space" || e.key === " " || e.keyCode === 32;
  }

  function onKeyDown(e) {
    if (!gameStarted) return;
    if (done) {
      e.preventDefault();
      restartMatchFromEnd();
      return;
    }
    if (endFlashActive) return;
    if (performance.now() < postEndInputLockUntil) return;
    if (awaitingNextEndKey) {
      e.preventDefault();
      if (pendingNextEndSetup) resetForNextEnd();
      awaitingNextEndKey = false;
      cameraResetRequested = true;
      return;
    }
    if (e.code === "ArrowLeft") {
      e.preventDefault();
      aimLeftHeld = true;
      return;
    }
    if (e.code === "ArrowRight") {
      e.preventDefault();
      aimRightHeld = true;
      return;
    }
    if (isSpaceEvent(e)) {
      e.preventDefault();
      e.stopPropagation();
      if (awaitingAllStonesStop) return;
      if (awaitingNextShotReset) {
        cameraResetRequested = true;
        return;
      }
      if (shotReleased && activeStone) {
        if (e.repeat) return;
        if (isSweepBlockedForActiveStone()) {
          scrub = 0;
          return;
        }
        scrub = Math.max(0, Math.min(2.2, scrub + 0.5));
        lastSweepInputAt = performance.now();
        return;
      }
      spaceHeld = true;
      if (chargingStone && !shotReleased && !isCharging) {
        isCharging = true;
        chargeStartAt = performance.now();
      }
    }
  }

  function onKeyUp(e) {
    if (!gameStarted || done) return;
    if (performance.now() < postEndInputLockUntil) return;
    if (e.code === "ArrowLeft") {
      e.preventDefault();
      aimLeftHeld = false;
      return;
    }
    if (e.code === "ArrowRight") {
      e.preventDefault();
      aimRightHeld = false;
      return;
    }
    if (isSpaceEvent(e)) {
      e.preventDefault();
      e.stopPropagation();
      if (shotReleased && activeStone) return;
      spaceHeld = false;
      if (awaitingAllStonesStop) return;
      if (awaitingNextShotReset) return;
      if (isCharging && chargingStone && !shotReleased) {
        releaseStone();
      }
    }
  }

  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp, { passive: false });

  window.addEventListener("blur", () => {
    if (!gameStarted || done) return;
    spaceHeld = false;
    aimLeftHeld = false;
    aimRightHeld = false;
    if (isCharging && !shotReleased && chargingStone) releaseStone();
  });

  window.addEventListener("click", () => {
    render.canvas.focus();
  });

  render.canvas.tabIndex = 0;
  render.canvas.focus();
  document.body.style.overscrollBehavior = "none";

  Events.on(engine, "beforeUpdate", () => {
    if (done) return;
    if (endFlashActive) {
      const elapsed = performance.now() - endFlashStartedAt;
      if (elapsed >= endFlashCycles * endFlashCycleMs) {
        endFlashActive = false;
        awaitingNextEndKey = true;
        updateUi(endFlashPromptText || `Press any key for End ${currentEnd}.`);
      }
    }
    if (performance.now() < postEndInputLockUntil) {
      spaceHeld = false;
      isCharging = false;
      charge = 0;
    }

    const frameDt = Math.min(0.033, (engine.timing.delta || 16.666) / 1000);
    const dtRatio = frameDt / referenceDt;
    if (!shotReleased) {
      const aimInput = (aimRightHeld ? 1 : 0) - (aimLeftHeld ? 1 : 0);
      if (aimInput !== 0) {
        const keyAimSpeed = 150; // px/sec
        pointerTargetX = clampAimX(pointerTargetX + aimInput * keyAimSpeed * frameDt);
      }
      const smoothing = aimInput !== 0 ? 0.2 : 0.32;
      pointer.x = clampAimX(pointer.x + (pointerTargetX - pointer.x) * (1 - Math.pow(1 - smoothing, dtRatio)));
    }

    if (chargingStone && !shotReleased) {
      Body.setPosition(chargingStone, { x: launchSpotX(), y: chargingStone.position.y });
      Body.setVelocity(chargingStone, { x: 0, y: 0 });
      Body.setAngularVelocity(chargingStone, 0);
    }

    if (chargingStone && !shotReleased) {
      if (spaceHeld && !isCharging) {
        isCharging = true;
        if (chargeStartAt === 0) chargeStartAt = performance.now();
      }
      if (!spaceHeld && isCharging) releaseStone();
    }

    if (isCharging) {
      const heldMs = Math.max(0, performance.now() - chargeStartAt);
      const phase = heldMs % powerCycleMs;
      if (phase < powerRampUpMs) {
        charge = phase / powerRampUpMs;
      } else if (phase < powerRampUpMs + powerHoldMs) {
        charge = 1;
      } else {
        const downT = (phase - powerRampUpMs - powerHoldMs) / powerRampDownMs;
        charge = Math.max(0, 1 - downT);
      }
      updateUi("Charging... release Space to throw.");
    }

    if (shotReleased && activeStone) {
      const v = activeStone.velocity;
      const speed = stoneSpeed(activeStone);
      if (speed > 0.001) {
        const sweepTouchActive = performance.now() - lastSweepInputAt < sweepTapWindowMs;
        const sweepBlocked = isSweepBlockedForActiveStone();
        if (sweepBlocked) scrub = 0;
        const effectiveScrub = sweepBlocked || !sweepTouchActive ? 0 : scrub;
        // Smooth down-screen glide on ice: kill lateral drift, gently decay forward speed.
        // All per-frame multipliers scaled by dtRatio for frame-rate independence.
        const sweepFactor = Math.min(1, effectiveScrub / 2.2);
        let nextVX = v.x * Math.pow(0.8, dtRatio);
        const forwardFriction = 0.0036 * (1 - 0.05 * sweepFactor) * dtRatio;
        const glideRetention = Math.pow(0.9976 + 0.00012 * sweepFactor, dtRatio);
        let nextVY = Math.max(0, v.y * glideRetention - forwardFriction);

        // Subtle curl: direction depends on release side, strength scales with offset from center.
        const speedNorm = Math.min(1, speed / 8);
        const lateCurl = 0.7 + 0.9 * (1 - speedNorm);
        const offsetBoost = activeStone.plugin.spinStrength * activeStone.plugin.spinStrength;
        const forwardFactor = Math.min(1, Math.max(0, (nextVY - 0.35) / 2.6));
        const rawCurlDelta =
          activeStone.plugin.spinDir *
          (0.006 + 0.024 * activeStone.plugin.spinStrength + 0.012 * offsetBoost) *
          lateCurl *
          forwardFactor;
        const curlDelta = Math.max(-maxCurlPerTick, Math.min(maxCurlPerTick, rawCurlDelta));
        nextVX += curlDelta * dtRatio;

        if (effectiveScrub > 0.01) {
          nextVY += 0.00022 * effectiveScrub * dtRatio;
        }
        nextVX = Math.max(-1.2, Math.min(1.2, nextVX));
        nextVY = Math.max(0, nextVY);

        // Hard settle near the end so stones stop instead of drifting sideways forever.
        if (nextVY < 0.16 && Math.abs(nextVX) < 0.12) {
          nextVX = 0;
          nextVY = 0;
        }

        if (activeStone.plugin.hitDampingTime > 0) {
          nextVX *= Math.pow(0.8, dtRatio);
          nextVY *= Math.pow(0.82, dtRatio);
          activeStone.plugin.hitDampingTime -= frameDt;
        }

        Body.setVelocity(activeStone, { x: nextVX, y: nextVY });
      }

      const sweepTouchActive = performance.now() - lastSweepInputAt < sweepTapWindowMs;
      scrub *= isSweepBlockedForActiveStone()
        ? 0
        : Math.pow(sweepTouchActive ? 0.82 : 0.45, dtRatio);
      maybeEndShot();
    }

    // Apply ice-slide damping to every other moving stone so hit stones do not coast unrealistically.
    for (const stone of allStones) {
      if (stone === activeStone) continue;
      const v = stone.velocity;
      const speed = stoneSpeed(stone);
      if (speed < 0.001) continue;

      let nextVX = v.x * Math.pow(0.925, dtRatio);
      let nextVY = Math.max(0, v.y * Math.pow(0.998, dtRatio) - 0.0034 * dtRatio);
      if (stone.plugin.hitDampingTime > 0) {
        nextVX *= Math.pow(0.955, dtRatio);
        nextVY *= Math.pow(0.965, dtRatio);
        stone.plugin.hitDampingTime -= frameDt;
      }
      if (nextVY < 0.16 && Math.abs(nextVX) < 0.12) {
        nextVX = 0;
        nextVY = 0;
      }
      Body.setVelocity(stone, { x: nextVX, y: nextVY });
    }

    for (let i = allStones.length - 1; i >= 0; i -= 1) {
      const stone = allStones[i];
      const removalRadius = (stone.circleRadius || stoneRadius) * 1.275;
      if (stone.position.y - removalRadius >= lowerGreenY) {
        const wasActive = stone === activeStone;
        removeStoneFromPlay(stone);
        if (wasActive) {
          beginSettlePhase("Stone crossed below the lower green line and is removed. Waiting for stones to stop.");
        }
      }
    }

    if (awaitingAllStonesStop) {
      if (areAllStonesStopped()) {
        allStoppedFrames += 1;
        if (allStoppedFrames >= 8) {
          awaitingAllStonesStop = false;
          completeShotAndAdvanceTurn();
        }
      } else {
        allStoppedFrames = 0;
      }
    }

    for (const stone of allStones) {
      const speed = stoneSpeed(stone);
      if (speed < 0.03 || !stone.plugin.spinDir) continue;
      const speedNorm = Math.min(1, speed / 14);
      const spinRate =
        (3.8 + 8.4 * speedNorm) * (0.45 + 1.15 * stone.plugin.spinStrength);
      stone.plugin.handleAngle += stone.plugin.spinDir * spinRate * frameDt;
      Body.setAngularVelocity(stone, stone.plugin.spinDir * spinRate * 0.28);
    }

    const maxCameraY = Math.max(0, sheet.top + sheet.height - H - bottomPad);
    if (shotReleased && activeStone) {
      const desiredY = activeStone.position.y - H * 0.68;
      cameraY += (desiredY - cameraY) * (1 - Math.pow(1 - 0.09, dtRatio));
    } else if (cameraResetRequested) {
      // Smooth, slower return to hack/top for the next player's turn.
      cameraY += (0 - cameraY) * (1 - Math.pow(1 - 0.045, dtRatio));
      if (Math.abs(cameraY) < 1.2) {
        cameraY = 0;
        cameraResetRequested = false;
        awaitingNextShotReset = false;
        spawnNextStone();
      }
    } else if (awaitingAllStonesStop || awaitingNextShotReset || awaitingNextEndKey) {
      // After each shot, drift to the house so players can review current stone positions.
      const targetViewY = house.y - H * 0.58;
      cameraY += (targetViewY - cameraY) * (1 - Math.pow(1 - 0.03, dtRatio));
    }
    cameraY = Math.max(0, Math.min(maxCameraY, cameraY));
    render.bounds.min.x = 0;
    render.bounds.max.x = W;
    render.bounds.min.y = cameraY;
    render.bounds.max.y = cameraY + H;

    updateSlideAudio();
    updateUi("");
  });

  Events.on(engine, "collisionStart", (evt) => {
    for (const pair of evt.pairs) {
      const a = pair.bodyA;
      const b = pair.bodyB;
      if (!a.label.startsWith("stone-") || !b.label.startsWith("stone-")) continue;

      // Damped heavy-stone contact: reduce post-impact translational and spin energy.
      const av = a.velocity;
      const bv = b.velocity;
      const impact = Vector.magnitude(Vector.sub(av, bv));
      playCollisionSound(impact);
      Body.setVelocity(a, { x: av.x * 0.74, y: Math.max(0, av.y * 0.82) });
      Body.setVelocity(b, { x: bv.x * 0.74, y: Math.max(0, bv.y * 0.82) });
      Body.setAngularVelocity(a, a.angularVelocity * 0.76);
      Body.setAngularVelocity(b, b.angularVelocity * 0.76);
      if (a.plugin) a.plugin.hitDampingTime = 4 / 60;
      if (b.plugin) b.plugin.hitDampingTime = 4 / 60;
    }
  });

  Events.on(render, "afterRender", () => {
    Render.startViewTransform(render);
    drawIceBase();
    drawSheetDecor();
    drawStonesOverlay();
    drawSweepGhost();

    const c = render.context;
    c.save();
    if (chargingStone && !shotReleased && isCharging && spaceHeld) {
      const p = chargingStone.position;
      const meterW = 16;
      const meterH = 132;
      const mx = p.x - meterW * 0.5;
      const my = p.y + 34;
      const level = Math.max(0, Math.min(1, charge));
      const pointerY = my + 2 + (meterH - 4) * level;

      // Meter track.
      c.fillStyle = "rgba(34, 76, 100, 0.22)";
      c.strokeStyle = "rgba(176, 214, 235, 0.82)";
      c.lineWidth = 1.6;
      c.beginPath();
      c.roundRect(mx, my, meterW, meterH, 5);
      c.fill();
      c.stroke();

      // Color band so power levels are always visible.
      const bandGrad = c.createLinearGradient(mx, my + 2, mx, my + meterH - 2);
      bandGrad.addColorStop(0, "rgba(255, 236, 74, 0.98)");
      bandGrad.addColorStop(0.52, "rgba(255, 160, 44, 0.98)");
      bandGrad.addColorStop(0.76, "rgba(246, 106, 48, 0.99)");
      bandGrad.addColorStop(0.9, "rgba(232, 58, 44, 1)");
      bandGrad.addColorStop(1, "rgba(198, 34, 34, 1)");
      c.fillStyle = bandGrad;
      c.beginPath();
      c.roundRect(mx + 2.2, my + 2.2, meterW - 4.4, meterH - 4.4, 4);
      c.fill();

      // Soft gloss to give the meter a cleaner, more polished look.
      c.fillStyle = "rgba(255, 255, 255, 0.2)";
      c.beginPath();
      c.roundRect(mx + 2.8, my + 3.2, meterW - 8.2, (meterH - 8) * 0.42, 3);
      c.fill();

      // Pointer marker (color shifts with power).
      const powerColor =
        level < 0.5
          ? "rgba(255, 190, 72, 0.98)"
          : level < 0.82
            ? "rgba(255, 124, 58, 0.98)"
            : "rgba(226, 68, 52, 0.98)";
      c.fillStyle = powerColor;
      c.strokeStyle = "rgba(255, 255, 255, 0.7)";
      c.lineWidth = 0.9;
      c.beginPath();
      c.moveTo(mx + meterW + 7, pointerY);
      c.lineTo(mx + meterW + 1.5, pointerY - 4.5);
      c.lineTo(mx + meterW + 1.5, pointerY + 4.5);
      c.closePath();
      c.fill();
      c.stroke();

      // Downward tip at the end of the meter to indicate power direction.
      c.fillStyle = "rgba(176, 214, 235, 0.86)";
      c.strokeStyle = "rgba(255, 255, 255, 0.7)";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(mx + meterW * 0.5, my + meterH + 8);
      c.lineTo(mx + meterW * 0.5 - 4.5, my + meterH + 1.5);
      c.lineTo(mx + meterW * 0.5 + 4.5, my + meterH + 1.5);
      c.closePath();
      c.fill();
      c.stroke();
    }

    c.restore();
    Render.endViewTransform(render);

    if (done) {
      // Keep winner visuals centered over the ice sheet area.
      const cx = sheet.x;
      const cy = H * 0.46;
      const t = performance.now();
      if (winnerTeamIdx == null && teams[0].score !== teams[1].score) {
        winnerTeamIdx = teams[0].score > teams[1].score ? 0 : 1;
      }

      c.save();
      if (winnerBanner.complete && winnerBanner.naturalWidth > 0) {
        const bannerW = Math.min(420, W * 0.46);
        const bannerH = bannerW * (winnerBanner.naturalHeight / winnerBanner.naturalWidth);
        const bx = cx - bannerW * 0.5;
        const by = cy - bannerH * 0.9;
        const flash = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 0.012));
        c.shadowColor = "rgba(0, 0, 0, 0.24)";
        c.shadowBlur = 14;
        c.globalAlpha = flash;
        c.drawImage(winnerBanner, bx, by, bannerW, bannerH);
        c.globalAlpha = 1;
        c.shadowBlur = 0;
      }

      if (winnerTeamIdx != null) {
        const primary = flagImages[winnerTeamIdx];
        const fallback = flagFallbackEls[winnerTeamIdx];
        const flag =
          primary && primary.naturalWidth > 0
            ? primary
            : (fallback && fallback.naturalWidth > 0 ? fallback : null);
        if (flag) {
          const targetW = 280;
          const targetH = targetW * (flag.naturalHeight / flag.naturalWidth);
          const fx = cx - targetW * 0.5;
          const fy = cy + 46;
          c.shadowColor = "rgba(0, 0, 0, 0.28)";
          c.shadowBlur = 16;
          c.globalAlpha = 0.5;
          // Draw the flag in horizontal strips with phase-shifted offsets for a ripple effect.
          const slices = 24;
          const sliceH = targetH / slices;
          for (let i = 0; i < slices; i += 1) {
            const sy = (flag.naturalHeight * i) / slices;
            const sh = flag.naturalHeight / slices;
            const wave =
              Math.sin((i / slices) * Math.PI * 3 + t * 0.01) *
              (5.5 - (i / slices) * 1.8);
            c.drawImage(
              flag,
              0,
              sy,
              flag.naturalWidth,
              sh,
              fx + wave,
              fy + i * sliceH,
              targetW,
              sliceH + 1
            );
          }
          c.globalAlpha = 1;
          c.shadowBlur = 0;
        }
      }
      c.restore();
    }

  });

  window.addEventListener("resize", () => {
    location.reload();
  });

  function startGame() {
    if (gameStarted) return;
    gameStarted = true;
    initAudio();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    if (titleScreenEl) titleScreenEl.classList.add("hidden");
    if (hudEl) hudEl.classList.add("ready");
    spawnNextStone();
    Render.run(render);
    Runner.run(runner, engine);
  }

  function startFromAnyInput() {
    startGame();
  }

  window.addEventListener("keydown", startFromAnyInput, { once: true });
  window.addEventListener("mousedown", startFromAnyInput, { once: true });
  window.addEventListener("touchstart", startFromAnyInput, { once: true });
  updateStonesLeftTable();
})();
