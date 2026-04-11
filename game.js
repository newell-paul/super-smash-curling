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
  const isMobile = W <= 768 || ("ontouchstart" in window && W < 1024);
  const halfW = isMobile ? W : Math.floor(W / 2);
  const hudWidth = Math.min(520, Math.max(280, (isMobile ? W : Math.floor(W / 2)) - 32));
  const sheetBorderW = isMobile ? 32 : 78;
  const fittedSheetWidth = isMobile
    ? Math.min(525, Math.max(220, W - sheetBorderW * 2 - 16))
    : Math.min(525, Math.max(220, halfW - sheetBorderW * 2 - 24));
  const sheetRefH = 850;
  const sheet = {
    x: isMobile ? Math.floor(W / 2) : Math.floor(W / 2) + Math.floor(W / 4),
    width: fittedSheetWidth,
    top: topPad,
    height: sheetRefH * 4.2,
    houseY: topPad + sheetRefH * 3.05,
  };

  const twelveFootRadius = sheet.width * 0.38;
  const feetToPx = twelveFootRadius / 6;
  const stoneRadius = isMobile ? 16 : 20;
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
  const lowerGreenY = lineY.tee + (lineY.tee - lineY.hog);
  const hackOffset = 0.65 * feetToPx;
  const hackY = sheet.top + 96;
  let startLineY = hackY + 160;
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

  const miniMapCenterX = sheet.x;
  const miniMapCenterY = startLineY + (H - startLineY) / 2;

  const teams = [
    { name: "Great Britain", short: "GB", color: "#d62828", count: 0, score: 0, dotClass: "red" },
    { name: "United States", short: "USA", color: "#fcbf49", count: 0, score: 0, dotClass: "yellow" },
  ];
  let totalEnds = 5;
  const stonesPerTeam = 6;
  const shotsPerEnd = stonesPerTeam * 2;

  const ui = {
    gbDots: document.getElementById("gbDots"),
    gbScore: document.getElementById("gbScore"),
    gerDots: document.getElementById("gerDots"),
    gerScore: document.getElementById("gerScore"),
    endBadge: document.getElementById("endBadge"),
    rowP1: document.getElementById("rowP1"),
    rowP2: document.getElementById("rowP2"),
  };
  const titleScreenEl = document.getElementById("titleScreen");
  const hudEl = document.querySelector(".hud");
  if (hudEl) {
    if (isMobile) {
      hudEl.style.display = "none";
    } else {
      hudEl.style.width = hudWidth + "px";
      hudEl.style.left = Math.max(8, (Math.floor(W / 2) - hudWidth) / 2) + "px";
    }
  }

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
  let allStoppedSince = 0;
  let gameStarted = false;
  let done = false;
  let aiActive = false;
  let usaIsAI = true;
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
  let houseViewHeld = false;
  let statusText = "";
  let statusTextSetAt = 0;
  let shakeX = 0;
  let shakeY = 0;
  let shakeIntensity = 0;
  const particles = [];
  const maxParticles = 40;
  let hammerTeamIdx = 1;
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
  const centerTargetImage = Object.assign(new Image(), { src: "images/logo.png" });
  const houseRingFillColors = [
    "rgba(210, 38, 38, 0.58)",
    "rgba(255, 255, 255, 0.97)",
    "rgba(36, 180, 85, 0.58)",
    "rgba(255, 255, 255, 0.97)",
  ];
  const houseRingEdgeColors = [
    "rgba(180, 50, 50, 0.55)",
    "rgba(109, 168, 199, 0.38)",
    "rgba(43, 108, 176, 0.8)",
    "rgba(43, 108, 176, 0.8)",
  ];

  const minLaunchVY = 4.8;
  const maxLaunchVY = 19.8;
  const powerRampUpMs = isMobile ? 2800 : 1200;
  const powerHoldMs = isMobile ? 400 : 220;
  const powerRampDownMs = isMobile ? 2000 : 1000;
  const powerCycleMs = powerRampUpMs + powerHoldMs + powerRampDownMs;
  const minReleaseCharge = isMobile ? 0.15 : 0.38;
  const referenceDt = 1 / 60;

  function getIcePattern(ctx) {
    if (icePattern) return icePattern;
    const tile = document.createElement("canvas");
    tile.width = 256;
    tile.height = 256;
    const tc = tile.getContext("2d");
    if (!tc) return null;

    tc.fillStyle = "rgba(200, 230, 248, 0.18)";
    for (let i = 0; i < 800; i += 1) {
      const x = Math.random() * tile.width;
      const y = Math.random() * tile.height;
      const r = 1.0 + Math.random() * 2.4;
      tc.beginPath();
      tc.arc(x, y, r, 0, Math.PI * 2);
      tc.fill();
    }

    tc.fillStyle = "rgba(255, 255, 255, 0.12)";
    for (let i = 0; i < 2000; i += 1) {
      const x = Math.random() * tile.width;
      const y = Math.random() * tile.height;
      const s = 0.4 + Math.random() * 1.2;
      tc.fillRect(x, y, s, s);
    }

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

    for (let i = 0; i < 50; i += 1) {
      const x = Math.random() * tile.width;
      const y = Math.random() * tile.height;
      const len = 40 + Math.random() * 100;
      const ang = -1.5 + Math.random() * 0.3;
      tc.strokeStyle = "rgba(130, 185, 215, " + (0.18 + Math.random() * 0.14) + ")";
      tc.lineWidth = 0.7 + Math.random() * 1.0;
      tc.beginPath();
      tc.moveTo(x, y);
      tc.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      tc.stroke();
    }

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
      const sweepIntensity = sweepActive ? Math.min(1, scrub / 1.6) : 0;
      sweepGain.gain.setTargetAtTime(0.35 * sweepIntensity, now, 0.03);
      sweepFilter.frequency.setTargetAtTime(1200 + 1200 * sweepIntensity, now, 0.04);
      sweepFilter.Q.setTargetAtTime(0.6 + 1.2 * sweepIntensity, now, 0.05);
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

  function playBellSound() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.06);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
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
    const bGrey = "rgba(108, 116, 124, 0.95)";
    iceStripCtx.fillStyle = bGrey;
    iceStripCtx.fillRect(0, 0, iceGrW, h);
    iceStripCtx.fillStyle = sideWallColor;
    iceStripCtx.fillRect(iceGrW, 0, iceBlW, h);
    iceStripCtx.fillStyle = bGrey;
    iceStripCtx.fillRect(iceGrW + iceBlW, 0, iceGrW, h);

    iceStripCtx.fillStyle = bGrey;
    iceStripCtx.fillRect(oR, 0, iceGrW, h);
    iceStripCtx.fillStyle = sideWallColor;
    iceStripCtx.fillRect(oR + iceGrW, 0, iceBlW, h);
    iceStripCtx.fillStyle = bGrey;
    iceStripCtx.fillRect(oR + iceGrW + iceBlW, 0, iceGrW, h);

    const iceGrad = iceStripCtx.createLinearGradient(oL, 0, oR, 0);
    iceGrad.addColorStop(0, "#deeff8");
    iceGrad.addColorStop(0.5, "#ecf8ff");
    iceGrad.addColorStop(1, "#deeff8");
    iceStripCtx.fillStyle = iceGrad;
    iceStripCtx.fillRect(oL, 0, sheet.width, h);

    const pat = getIcePattern(iceStripCtx);
    if (pat) {
      iceStripCtx.save();
      iceStripCtx.globalAlpha = 0.9;
      iceStripCtx.fillStyle = pat;
      iceStripCtx.fillRect(oL, 0, sheet.width, h);
      iceStripCtx.restore();
    }

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

    iceStripCtx.save();
    iceStripCtx.beginPath();
    iceStripCtx.rect(oL, 0, sheet.width, h);
    iceStripCtx.clip();
    for (let i = 0; i < 55; i += 1) {
      const sx = oL + Math.random() * sheet.width;
      const sy = Math.random() * h;
      const len = 100 + Math.random() * 350;
      const ang = -1.5 + Math.random() * 0.2;
      iceStripCtx.strokeStyle = "rgba(145, 200, 228, " + (0.12 + Math.random() * 0.14) + ")";
      iceStripCtx.lineWidth = 0.6 + Math.random() * 1.2;
      iceStripCtx.beginPath();
      iceStripCtx.moveTo(sx, sy);
      iceStripCtx.lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len);
      iceStripCtx.stroke();
    }
    iceStripCtx.restore();

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

    iceStripCtx.fillStyle = bGrey;
    iceStripCtx.fillRect(iceGrW + iceBlW, 0, iceGrW, h);
    iceStripCtx.fillStyle = bGrey;
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

    c.strokeStyle = "rgba(200, 32, 32, 0.28)";
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(laneLeft, startLineY);
    c.lineTo(laneRight, startLineY);
    c.stroke();

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

    c.strokeStyle = "rgba(136, 136, 136, 0.42)";
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(laneLeft, lineY.tee);
    c.lineTo(laneRight, lineY.tee);
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

    const arrowY = hackY + 3;
    const arrowH = 22;
    const arrowW = 16;
    const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(performance.now() * 0.005));
    c.fillStyle = `rgba(220, 64, 64, ${(0.8 * pulse).toFixed(3)})`;
    c.strokeStyle = `rgba(255, 186, 186, ${(0.85 * pulse).toFixed(3)})`;
    c.lineWidth = 1.5;

    c.beginPath();
    c.moveTo(preReleaseLeftLimit - arrowW, arrowY);
    c.lineTo(preReleaseLeftLimit, arrowY - arrowH * 0.5);
    c.lineTo(preReleaseLeftLimit, arrowY + arrowH * 0.5);
    c.closePath();
    c.fill();
    c.stroke();

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

  function drawAimGuide() {
    if (!chargingStone || shotReleased || aiActive) return;
    const c = render.context;
    const clampedX = clampAimX(pointer.x);
    const lateralNorm = (clampedX - sheet.x) / ((sheet.width * 0.5) - stoneRadius - 10);
    const limitedNorm = Math.max(-1, Math.min(1, lateralNorm));
    const spinNorm = Math.max(-maxSpinInfluence, Math.min(maxSpinInfluence, limitedNorm));
    const spinStrength = Math.abs(spinNorm);
    const spinDir = spinNorm === 0 ? 0 : -Math.sign(spinNorm);
    const offsetBoost = spinStrength * spinStrength;

    let x = clampedX;
    let vx = 0;
    let vy = 8;
    const points = [{ x, y: chargingStone.position.y }];
    for (let i = 0; i < 300; i++) {
      vx *= 0.8;
      vy = Math.max(0, vy * 0.9976 - 0.0036);
      const speed = Math.sqrt(vx * vx + vy * vy);
      if (speed < 0.16) break;
      const speedNorm = Math.min(1, speed / 8);
      const lateCurl = 0.7 + 0.9 * (1 - speedNorm);
      const forwardFactor = Math.min(1, Math.max(0, (vy - 0.35) / 2.6));
      const rawCurl = spinDir * (0.006 + 0.024 * spinStrength + 0.012 * offsetBoost) * lateCurl * forwardFactor;
      const curl = Math.max(-maxCurlPerTick, Math.min(maxCurlPerTick, rawCurl));
      vx += curl;
      x += vx;
      points.push({ x, y: points[points.length - 1].y + vy });
    }

    c.save();
    c.setLineDash([8, 12]);
    c.strokeStyle = "rgba(200, 230, 255, 0.25)";
    c.lineWidth = 2;
    c.beginPath();
    for (let i = 0; i < points.length; i++) {
      if (i === 0) c.moveTo(points[i].x, points[i].y);
      else c.lineTo(points[i].x, points[i].y);
    }
    c.stroke();
    c.setLineDash([]);
    c.restore();
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function spawnCollisionParticles(x, y, impact) {
    const count = Math.min(12, Math.floor(3 + impact * 1.5));
    for (let i = 0; i < count && particles.length < maxParticles; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 80 * Math.min(1, impact / 6);
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.3 + Math.random() * 0.2,
        maxLife: 0.5,
      });
    }
  }

  function drawParticles() {
    if (!particles.length) return;
    const c = render.context;
    c.save();
    for (const p of particles) {
      const alpha = Math.max(0, p.life / p.maxLife) * 0.7;
      const size = 2 + (1 - p.life / p.maxLife) * 2;
      c.globalAlpha = alpha;
      c.fillStyle = "#d0eaff";
      c.beginPath();
      c.arc(p.x, p.y, size, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  function drawStatusOverlay() {
    if (!statusText || done || isMobile) return;
    const elapsed = performance.now() - statusTextSetAt;
    const fadeIn = Math.min(1, elapsed / 300);
    const c = render.context;
    c.save();
    const pr = renderPixelRatio;
    c.setTransform(pr, 0, 0, pr, 0, 0);
    c.globalAlpha = fadeIn * 0.85;
    c.font = "bold 15px 'Trebuchet MS', sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    const tx = W / 2;
    const ty = isTouchDevice ? H - 140 : H - 30;
    const metrics = c.measureText(statusText);
    const pw = metrics.width + 28;
    const ph = 30;
    const rx = tx - pw / 2;
    const ry = ty - ph / 2;
    const r = 10;
    c.fillStyle = "rgba(10, 30, 50, 0.75)";
    c.beginPath();
    c.moveTo(rx + r, ry);
    c.lineTo(rx + pw - r, ry);
    c.quadraticCurveTo(rx + pw, ry, rx + pw, ry + r);
    c.lineTo(rx + pw, ry + ph - r);
    c.quadraticCurveTo(rx + pw, ry + ph, rx + pw - r, ry + ph);
    c.lineTo(rx + r, ry + ph);
    c.quadraticCurveTo(rx, ry + ph, rx, ry + ph - r);
    c.lineTo(rx, ry + r);
    c.quadraticCurveTo(rx, ry, rx + r, ry);
    c.closePath();
    c.fill();
    c.fillStyle = "#dff5ff";
    c.fillText(statusText, tx, ty);
    c.restore();
  }

  function drawMobileScoreHud() {
    if (!isMobile || !gameStarted) return;
    const c = render.context;
    const pr = renderPixelRatio;
    c.save();
    c.setTransform(pr, 0, 0, pr, 0, 0);

    const cx = W / 2;
    const ty = 8;
    const barW = Math.min(300, W - 40);
    const barH = 42;
    const bx = cx - barW / 2;

    c.globalAlpha = 0.8;
    c.fillStyle = "rgba(10, 30, 50, 0.7)";
    const r = 10;
    c.beginPath();
    c.moveTo(bx + r, ty);
    c.lineTo(bx + barW - r, ty);
    c.quadraticCurveTo(bx + barW, ty, bx + barW, ty + r);
    c.lineTo(bx + barW, ty + barH - r);
    c.quadraticCurveTo(bx + barW, ty + barH, bx + barW - r, ty + barH);
    c.lineTo(bx + r, ty + barH);
    c.quadraticCurveTo(bx, ty + barH, bx, ty + barH - r);
    c.lineTo(bx, ty + r);
    c.quadraticCurveTo(bx, ty, bx + r, ty);
    c.closePath();
    c.fill();

    c.globalAlpha = 1;
    c.textBaseline = "middle";
    const midY = ty + barH / 2;

    c.font = "bold 17px 'Trebuchet MS', sans-serif";
    c.textAlign = "left";
    c.fillStyle = teams[0].color;
    c.fillText("P1", bx + 14, midY);
    c.fillStyle = "#fff";
    c.fillText(String(teams[0].score), bx + 40, midY);

    c.textAlign = "center";
    c.fillStyle = "rgba(180, 210, 230, 0.7)";
    c.font = "bold 14px 'Trebuchet MS', sans-serif";
    const endText = `END ${Math.min(currentEnd, totalEnds)}`;
    c.fillText(endText, cx, midY - 7);
    c.font = "12px 'Trebuchet MS', sans-serif";
    c.fillStyle = "#f5c542";
    const hammerLabel = hammerTeamIdx === 0 ? "P1" : (usaIsAI ? "AI" : "P2");
    c.fillText(`🔨 ${hammerLabel}`, cx, midY + 10);

    c.font = "bold 17px 'Trebuchet MS', sans-serif";
    c.textAlign = "right";
    c.fillStyle = teams[1].color;
    c.fillText(usaIsAI ? "AI" : "P2", bx + barW - 38, midY);
    c.fillStyle = "#fff";
    c.fillText(String(teams[1].score), bx + barW - 14, midY);

    const gbLeft = stonesPerTeam - teams[0].count;
    const usaLeft = stonesPerTeam - teams[1].count;
    const dotR = 4;
    const dotY = ty + barH + 6;
    c.globalAlpha = 0.6;
    for (let i = 0; i < gbLeft; i++) {
      c.fillStyle = teams[0].color;
      c.beginPath();
      c.arc(bx + 10 + i * (dotR * 2 + 2), dotY, dotR, 0, Math.PI * 2);
      c.fill();
    }
    for (let i = 0; i < usaLeft; i++) {
      c.fillStyle = teams[1].color;
      c.beginPath();
      c.arc(bx + barW - 10 - i * (dotR * 2 + 2), dotY, dotR, 0, Math.PI * 2);
      c.fill();
    }

    c.restore();
  }

  function drawMiniMap() {
    if (!gameStarted || done) return;
    if (shotReleased || !chargingStone) return;
    const c = render.context;
    const pr = renderPixelRatio;
    c.save();
    c.setTransform(pr, 0, 0, pr, 0, 0);
    c.globalAlpha = 0.35;

    const ox = miniMapCenterX - house.x;
    const oy = miniMapCenterY - house.y;
    c.translate(ox, oy);

    for (let i = 0; i < house.rings.length; i++) {
      c.beginPath();
      c.fillStyle = houseRingFillColors[i];
      c.arc(house.x, house.y, house.rings[i], 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = houseRingEdgeColors[i];
      c.lineWidth = 1;
      c.stroke();
    }

    if (centerTargetImage.complete && centerTargetImage.naturalWidth > 0) {
      const centerR = house.rings[3];
      const maxBox = centerR * 1.9;
      const iw = centerTargetImage.naturalWidth;
      const ih = centerTargetImage.naturalHeight;
      const s = Math.min(maxBox / iw, maxBox / ih);
      const dw = iw * s;
      const dh = ih * s;
      c.save();
      c.beginPath();
      c.arc(house.x, house.y, centerR * 0.98, 0, Math.PI * 2);
      c.clip();
      c.globalAlpha = 0.3;
      c.drawImage(centerTargetImage, house.x - dw * 0.5, house.y - dh * 0.5, dw, dh);
      c.restore();
    }

    c.strokeStyle = "rgba(0, 0, 0, 0.1)";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(house.x - house.rings[0], house.y);
    c.lineTo(house.x + house.rings[0], house.y);
    c.stroke();
    c.beginPath();
    c.moveTo(house.x, house.y - house.rings[0]);
    c.lineTo(house.x, house.y + house.rings[0]);
    c.stroke();

    c.globalAlpha = 0.7;
    for (const stone of allStones) {
      const team = teams[stone.plugin.teamIdx];
      const r = stone.circleRadius || stoneRadius;
      c.beginPath();
      c.fillStyle = team.color;
      c.strokeStyle = "rgba(0,0,0,0.4)";
      c.lineWidth = 1.5;
      c.arc(stone.position.x, stone.position.y, r, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }

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
      hitCount: 0,
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
    pointerTargetX = sheet.x;
    pointer.x = sheet.x;
    const x = sheet.x;
    const y = hackY;
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
    for (const s of allStones) s.plugin.hitCount = 0;
    updateUi("");
    const ta = document.getElementById("touchAction");
    if (ta) ta.textContent = "HOLD";
    if (teamIdx === 1 && usaIsAI && !done) aiTakeTurn();
  }

  function releaseStone() {
    if (!chargingStone || shotReleased) return;

    const p = chargingStone.position;
    const clampedX = clampAimX(pointer.x);
    const lateralNorm = (clampedX - sheet.x) / ((sheet.width * 0.5) - stoneRadius - 10);
    const limitedNorm = Math.max(-1, Math.min(1, lateralNorm));
    const spinNorm = Math.max(-maxSpinInfluence, Math.min(maxSpinInfluence, limitedNorm));

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

    updateUi("");
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
    updateUi("");

    if (nextTeamIdx === 1 && usaIsAI) {
      setTimeout(() => {
        if (awaitingNextShotReset && !cameraResetRequested) {
          cameraResetRequested = true;
        }
      }, 1200);
    }
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
    allStoppedSince = 0;
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
    nextTeamIdx = hammerTeamIdx === 0 ? 1 : 0;
    turnIndex = nextTeamIdx;
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
    allStoppedSince = 0;
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
      if (teams[0].score === teams[1].score) {
        totalEnds += 1;
        stageNextEnd(`${scoredMsg} Tied! Extra end.`, []);
        return;
      }
      done = true;
      winnerTeamIdx = teams[0].score > teams[1].score ? 0 : 1;
      updateUi(`${scoredMsg} Match finished.`);
      return;
    }

    const winningTeam = scoringStones[0].team;
    const winningTeamIdx = teams.indexOf(winningTeam);
    const nearestOpponentDist =
      scoringStones.find((x) => x.team !== winningTeam)?.dist ?? Infinity;

    const epsilon = 1e-6;
    const points = scoringStones.filter(
      (x) => x.team === winningTeam && x.dist + epsilon < nearestOpponentDist
    ).length;
    const pointStones = scoringStones
      .filter((x) => x.team === winningTeam && x.dist + epsilon < nearestOpponentDist)
      .map((x) => x.stone);
    hammerTeamIdx = 1 - winningTeamIdx;
    const scoredMsg = `End ${currentEnd} complete. ${winningTeam.name} scores ${points}.`;

    let awarded = 0;
    function tickScore() {
      if (awarded >= points) {
        if (currentEnd < totalEnds) {
          stageNextEnd(scoredMsg, pointStones);
        } else {
          if (teams[0].score === teams[1].score) {
            totalEnds += 1;
            stageNextEnd(`${scoredMsg} Tied! Extra end.`, pointStones);
          } else {
            done = true;
            winnerTeamIdx = teams[0].score > teams[1].score ? 0 : 1;
            updateUi(`${scoredMsg} Match finished.`);
          }
        }
        return;
      }
      winningTeam.score += 1;
      awarded += 1;
      playBellSound();
      updateUi(scoredMsg);
      setTimeout(tickScore, 500);
    }
    tickScore();
  }

  function updateUi(text) {
    if (text && text !== statusText) {
      statusText = text;
      statusTextSetAt = performance.now();
    }
    updateStonesLeftTable();
    if (ui.rowP1) ui.rowP1.classList.toggle("active-turn", nextTeamIdx === 0 && !done);
    if (ui.rowP2) ui.rowP2.classList.toggle("active-turn", nextTeamIdx === 1 && !done);
  }

  function renderDots(el, count, dotClass) {
    if (!el) return;
    const safeCount = Math.max(0, Math.min(stonesPerTeam, count));
    const wrap = el.querySelector(".dots");
    if (!wrap) {
      el.innerHTML = "";
      const w = document.createElement("div");
      w.className = "dots";
      for (let i = 0; i < safeCount; i += 1) {
        const dot = document.createElement("span");
        dot.className = `dot ${dotClass}`;
        w.appendChild(dot);
      }
      el.appendChild(w);
      return;
    }
    const currentCount = wrap.children.length;
    if (safeCount < currentCount) {
      const removing = wrap.children[currentCount - 1];
      removing.classList.add("dot-spin-out");
      removing.addEventListener("animationend", () => removing.remove(), { once: true });
    } else if (safeCount > currentCount) {
      for (let i = currentCount; i < safeCount; i += 1) {
        const dot = document.createElement("span");
        dot.className = `dot ${dotClass}`;
        wrap.appendChild(dot);
      }
    }
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
      if (ui.gbScore) {
        ui.gbScore.textContent = String(teams[0].score);
        ui.gbScore.classList.remove("pulse");
        void ui.gbScore.offsetWidth;
        ui.gbScore.classList.add("pulse");
      }
      uiState.gbScore = teams[0].score;
    }
    if (teams[1].score !== uiState.usaScore) {
      if (ui.gerScore) {
        ui.gerScore.textContent = String(teams[1].score);
        ui.gerScore.classList.remove("pulse");
        void ui.gerScore.offsetWidth;
        ui.gerScore.classList.add("pulse");
      }
      uiState.usaScore = teams[1].score;
    }
    if (shownEnd !== uiState.endShown) {
      if (ui.endBadge) ui.endBadge.textContent = String(shownEnd);
      uiState.endShown = shownEnd;
    }
    const hammerEl = document.getElementById("hammerIndicator");
    if (hammerEl) hammerEl.textContent = `🔨 ${teams[hammerTeamIdx].short}`;
    const totalEndsEl = document.getElementById("totalEndsBadge");
    if (totalEndsEl) totalEndsEl.textContent = String(totalEnds);
  }

  function restartMatchFromEnd() {
    clearAllStones();
    teams[0].count = 0;
    teams[1].count = 0;
    teams[0].score = 0;
    teams[1].score = 0;
    currentEnd = 1;
    totalEnds = 5;
    hammerTeamIdx = 1;
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
    allStoppedSince = 0;
    pendingNextEndSetup = false;
    endFlashActive = false;
    endFlashStartedAt = 0;
    endFlashPromptText = "";
    endFlashStoneIds.clear();
    cameraY = 0;
    done = false;
    aiActive = false;
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

  const usaLabelEl = document.getElementById("usaLabel");

  function updateUsaLabel() {
    if (usaLabelEl) usaLabelEl.textContent = usaIsAI ? "AI" : "P2";
  }

  function toggleUsaAI() {
    usaIsAI = !usaIsAI;
    updateUsaLabel();
    playBellSound();
  }

  function gaussianRandom(mean, stddev) {
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
    return mean + z * stddev;
  }

  function simulateStoppingY(vy) {
    let y = hackY;
    for (let i = 0; i < 5000; i++) {
      y += vy;
      vy = Math.max(0, vy * 0.9976 - 0.0036);
      if (vy < 0.16) break;
    }
    return y;
  }

  function powerForTargetY(targetY) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      const vy = minLaunchVY + (maxLaunchVY - minLaunchVY) * Math.pow(Math.max(minReleaseCharge, mid), 1.05);
      const stopY = simulateStoppingY(vy);
      if (stopY < targetY) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function simulateLateralDisplacement(aimX, power) {
    const lateralNorm = (aimX - sheet.x) / ((sheet.width * 0.5) - stoneRadius - 10);
    const limitedNorm = Math.max(-1, Math.min(1, lateralNorm));
    const spinNorm = Math.max(-maxSpinInfluence, Math.min(maxSpinInfluence, limitedNorm));
    const spinStrength = Math.abs(spinNorm);
    const spinDir = spinNorm === 0 ? 0 : -Math.sign(spinNorm);
    const offsetBoost = spinStrength * spinStrength;

    let x = aimX;
    let vx = 0;
    let vy = minLaunchVY + (maxLaunchVY - minLaunchVY) *
      Math.pow(Math.max(minReleaseCharge, Math.min(1, power)), 1.05);

    for (let i = 0; i < 5000; i++) {
      const speed = Math.sqrt(vx * vx + vy * vy);
      if (speed < 0.001) break;
      vx *= 0.8;
      vy = Math.max(0, vy * 0.9976 - 0.0036);
      const speedNorm = Math.min(1, speed / 8);
      const lateCurl = 0.7 + 0.9 * (1 - speedNorm);
      const forwardFactor = Math.min(1, Math.max(0, (vy - 0.35) / 2.6));
      const rawCurlDelta = spinDir *
        (0.006 + 0.024 * spinStrength + 0.012 * offsetBoost) *
        lateCurl * forwardFactor;
      const curlDelta = Math.max(-maxCurlPerTick, Math.min(maxCurlPerTick, rawCurlDelta));
      vx += curlDelta;
      vx = Math.max(-1.2, Math.min(1.2, vx));
      vy = Math.max(0, vy);
      if (vy < 0.16 && Math.abs(vx) < 0.12) break;
      x += vx;
    }
    return x;
  }

  function aimXForTargetX(targetX, power) {
    if (Math.abs(targetX - sheet.x) < 3) return sheet.x;
    let lo = preReleaseLeftLimit;
    let hi = preReleaseRightLimit;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      const finalX = simulateLateralDisplacement(mid, power);
      if (finalX < targetX) lo = mid;
      else hi = mid;
    }
    return clampAimX((lo + hi) / 2);
  }

  function evaluateBoard() {
    const buttonPos = { x: house.x, y: house.y };
    const stones = allStones
      .filter(s => s !== chargingStone)
      .map(s => ({
        body: s,
        teamIdx: s.plugin.teamIdx,
        dist: Vector.magnitude(Vector.sub(s.position, buttonPos)),
        x: s.position.x,
        y: s.position.y,
      }))
      .sort((a, b) => a.dist - b.dist);

    const inHouse = stones.filter(s => s.dist - stoneRadius <= house.rings[0]);
    const aiInHouse = inHouse.filter(s => s.teamIdx === 1);
    const opponentInHouse = inHouse.filter(s => s.teamIdx === 0);
    const opponentStones = stones.filter(s => s.teamIdx === 0);

    const closestStone = inHouse.length > 0 ? inHouse[0] : null;
    const weHoldShot = closestStone !== null && closestStone.teamIdx === 1;
    const opponentHoldsShot = closestStone !== null && closestStone.teamIdx === 0;

    let scoringTeam = null;
    let scoringPoints = 0;
    if (inHouse.length > 0) {
      scoringTeam = inHouse[0].teamIdx;
      const nearestOpp = inHouse.find(s => s.teamIdx !== scoringTeam);
      const nearestOppDist = nearestOpp ? nearestOpp.dist : Infinity;
      scoringPoints = inHouse.filter(
        s => s.teamIdx === scoringTeam && s.dist < nearestOppDist
      ).length;
    }

    return {
      stones,
      inHouse,
      aiInHouse,
      opponentInHouse,
      opponentStones,
      closestStone,
      weHoldShot,
      opponentHoldsShot,
      scoringTeam,
      scoringPoints,
      aiStonesRemaining: stonesPerTeam - teams[1].count,
      houseEmpty: inHouse.length === 0,
    };
  }

  function selectStrategy(board) {
    // 10% chance of strategic mistake — fall back to a simple draw.
    if (Math.random() < 0.10) return "draw";
    if (board.houseEmpty) return "draw";
    if (board.opponentHoldsShot) return "takeout";
    if (board.weHoldShot) {
      if (board.opponentInHouse.length > 0) {
        return Math.random() < 0.4 ? "freeze" : "draw";
      }
      if (board.aiStonesRemaining > 2 && Math.random() < 0.35) return "guard";
      return "draw";
    }
    return "draw";
  }

  function calculateShot(strategy, board) {
    let targetX, targetY, extraPower = 0, shouldSweep = false;

    switch (strategy) {
      case "draw": {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * greenRingRadius * 0.6;
        targetX = house.x + Math.cos(angle) * radius;
        targetY = house.y + Math.sin(angle) * radius;
        shouldSweep = Math.random() < 0.6;
        break;
      }
      case "takeout": {
        const target = board.opponentInHouse[0] || board.opponentStones[0];
        if (target) {
          targetX = target.x;
          targetY = target.y;
          extraPower = 0.08;
          shouldSweep = Math.random() < 0.6;
        } else {
          targetX = house.x;
          targetY = house.y;
          shouldSweep = Math.random() < 0.6;
        }
        break;
      }
      case "guard": {
        targetX = house.x + (Math.random() - 0.5) * 40;
        targetY = lineY.hog + (house.y - lineY.hog) * 0.3;
        shouldSweep = Math.random() < 0.4;
        break;
      }
      case "freeze": {
        const target = board.aiInHouse[0] || { x: house.x, y: house.y };
        targetX = target.x + (Math.random() - 0.5) * 20;
        targetY = target.y - stoneRadius * 2.5;
        shouldSweep = Math.random() < 0.5;
        break;
      }
      default: {
        targetX = house.x;
        targetY = house.y;
        shouldSweep = Math.random() < 0.6;
      }
    }

    let power = powerForTargetY(targetY);
    power = Math.min(1, power + extraPower);
    const aimX = aimXForTargetX(targetX, power);

    return {
      aimX: clampAimX(aimX + gaussianRandom(0, 12)),
      power: Math.max(minReleaseCharge, Math.min(1, power + gaussianRandom(0, 0.04))),
      shouldSweep,
    };
  }

  function aiTakeTurn() {
    aiActive = true;
    aimLeftHeld = false;
    aimRightHeld = false;

    const thinkTime = 600 + Math.random() * 600;

    setTimeout(() => {
      if (done || !chargingStone) { aiActive = false; return; }

      const board = evaluateBoard();
      const strategy = selectStrategy(board);
      const shot = calculateShot(strategy, board);

      // Phase: Aim — smooth pointer slide to target.
      const aimTime = 400 + Math.random() * 400;
      const startX = pointer.x;
      const aimStart = performance.now();

      function animateAim() {
        if (done || !chargingStone) { aiActive = false; return; }
        const t = Math.min(1, (performance.now() - aimStart) / aimTime);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        pointerTargetX = startX + (shot.aimX - startX) * eased;
        if (t < 1) { requestAnimationFrame(animateAim); return; }
        pointerTargetX = shot.aimX;
        beginCharge();
      }

      // Phase: Charge — hold space for calculated duration.
      function beginCharge() {
        if (done || !chargingStone || shotReleased) { aiActive = false; return; }
        spaceHeld = true;
        isCharging = true;
        chargeStartAt = performance.now();
        const aiPower = isMobile ? Math.min(1, shot.power * 1.2) : shot.power;
        const chargeTime = aiPower * powerRampUpMs;
        setTimeout(() => {
          if (done || shotReleased) { aiActive = false; return; }
          spaceHeld = false;
          // beforeUpdate detects spaceHeld===false while isCharging and calls releaseStone().
          if (shot.shouldSweep) setTimeout(beginSweep, 200);
          else setTimeout(pollShotDone, 200);
        }, chargeTime);
      }

      // Phase: Sweep — rapid taps while stone is moving fast enough.
      function beginSweep() {
        if (done || !activeStone || !shotReleased) { pollShotDone(); return; }
        const sweepEnd = performance.now() + 800 + Math.random() * 600;
        function tap() {
          if (done || !activeStone || !shotReleased) { pollShotDone(); return; }
          if (performance.now() > sweepEnd || stoneSpeed(activeStone) < 0.5) {
            pollShotDone();
            return;
          }
          if (!isSweepBlockedForActiveStone()) {
            scrub = Math.max(0, Math.min(2.2, scrub + 0.5));
            lastSweepInputAt = performance.now();
          }
          setTimeout(tap, 150);
        }
        tap();
      }

      // Phase: Wait for shot to fully resolve, then auto-advance.
      function pollShotDone() {
        function check() {
          if (done) { aiActive = false; return; }
          if (awaitingNextShotReset) {
            // Camera reset is auto-triggered from completeShotAndAdvanceTurn.
            aiActive = false;
            return;
          }
          if (awaitingNextEndKey) {
            aiActive = false;
            return;
          }
          setTimeout(check, 100);
        }
        check();
      }

      requestAnimationFrame(animateAim);
    }, thinkTime);
  }

  function updatePointerFromEvent(e) {
    if (aiActive) return;
    const targetX = clampAimX(e.clientX);
    pointerTargetX += (targetX - pointerTargetX) * 0.18;
  }

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
    if (e.key === "Shift" && !aiActive) {
      toggleUsaAI();
      return;
    }
    if (aiActive) return;
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
    if (aiActive) return;
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
    houseViewHeld = false;
    if (isCharging && !shotReleased && chargingStone) releaseStone();
  });

  window.addEventListener("click", () => {
    render.canvas.focus();
  });

  render.canvas.tabIndex = 0;
  render.canvas.focus();
  document.body.style.overscrollBehavior = "none";

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (audioCtx && audioCtx.state === "running") audioCtx.suspend();
      spaceHeld = false;
      aimLeftHeld = false;
      aimRightHeld = false;
      houseViewHeld = false;
      if (isCharging && !shotReleased && chargingStone) releaseStone();
    } else {
      if (audioCtx && audioCtx.state === "suspended" && gameStarted) audioCtx.resume();
    }
  });

  const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  if (isTouchDevice) {
    const modeToggle = document.querySelector(".mode-toggle");
    if (modeToggle) modeToggle.style.display = "none";

    let canvasTouchId = null;
    let canvasTouchStartX = 0;
    render.canvas.addEventListener("touchstart", (e) => {
      if (!gameStarted) return;
      if (done) { restartMatchFromEnd(); return; }
      const t0 = e.changedTouches[0];
      const scoreBarW = Math.min(300, W - 40);
      const scoreBarX = W / 2 - scoreBarW / 2;
      if (t0.clientY < 50 && t0.clientX > scoreBarX + scoreBarW * 0.65) {
        toggleUsaAI();
        return;
      }
      if (aiActive || endFlashActive) return;
      if (performance.now() < postEndInputLockUntil) return;
      if (awaitingNextEndKey) {
        if (pendingNextEndSetup) resetForNextEnd();
        awaitingNextEndKey = false;
        cameraResetRequested = true;
        return;
      }
      if (awaitingNextShotReset) {
        cameraResetRequested = true;
        return;
      }
      if (shotReleased && activeStone) {
        if (!isSweepBlockedForActiveStone()) {
          scrub = Math.max(0, Math.min(2.2, scrub + 0.5));
          lastSweepInputAt = performance.now();
        }
        return;
      }
      if (chargingStone && !shotReleased && !isCharging) {
        spaceHeld = true;
        isCharging = true;
        chargeStartAt = performance.now();
      }
      if (canvasTouchId !== null) return;
      const t = e.changedTouches[0];
      canvasTouchId = t.identifier;
      canvasTouchStartX = t.clientX;
    }, { passive: true });
    render.canvas.addEventListener("touchmove", (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== canvasTouchId) continue;
        const dx = t.clientX - canvasTouchStartX;
        canvasTouchStartX = t.clientX;
        if (!shotReleased && chargingStone && !aiActive) {
          pointerTargetX = clampAimX(pointerTargetX + dx * 0.8);
        }
      }
    }, { passive: true });
    render.canvas.addEventListener("touchend", (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === canvasTouchId) canvasTouchId = null;
      }
      if (isCharging && chargingStone && !shotReleased) {
        spaceHeld = false;
        releaseStone();
      }
    });
    render.canvas.addEventListener("touchcancel", () => {
      canvasTouchId = null;
      if (isCharging && chargingStone && !shotReleased) {
        spaceHeld = false;
        releaseStone();
      }
    });

    let peekTimeout = null;
    render.canvas.addEventListener("touchstart", (e) => {
      if (e.touches.length === 2) {
        houseViewHeld = true;
        return;
      }
      peekTimeout = setTimeout(() => {
        if (!shotReleased && chargingStone && !aiActive) {
          houseViewHeld = true;
        }
      }, 500);
    }, { passive: true });
    render.canvas.addEventListener("touchmove", () => {
      clearTimeout(peekTimeout);
    }, { passive: true });
    render.canvas.addEventListener("touchend", (e) => {
      clearTimeout(peekTimeout);
      if (e.touches.length < 2) houseViewHeld = false;
    });
    render.canvas.addEventListener("touchcancel", () => {
      clearTimeout(peekTimeout);
      houseViewHeld = false;
    });

  }

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
        const keyAimSpeed = 150;
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
    }

    if (shotReleased && activeStone) {
      const v = activeStone.velocity;
      const speed = stoneSpeed(activeStone);
      if (speed > 0.001) {
        const sweepTouchActive = performance.now() - lastSweepInputAt < sweepTapWindowMs;
        const sweepBlocked = isSweepBlockedForActiveStone();
        if (sweepBlocked) scrub = 0;
        const effectiveScrub = sweepBlocked || !sweepTouchActive ? 0 : scrub;
        // All per-frame multipliers scaled by dtRatio for frame-rate independence.
        const sweepFactor = Math.min(1, effectiveScrub / 2.2);
        let nextVX = v.x * Math.pow(0.8, dtRatio);
        const forwardFriction = 0.0036 * (1 - 0.0525 * sweepFactor) * dtRatio;
        const glideRetention = Math.pow(0.9976 + 0.000126 * sweepFactor, dtRatio);
        let nextVY = Math.max(0, v.y * glideRetention - forwardFriction);

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
          nextVY += 0.000231 * effectiveScrub * dtRatio;
        }
        nextVX = Math.max(-1.2, Math.min(1.2, nextVX));
        nextVY = Math.max(0, nextVY);

        // Hard settle near the end so stones stop instead of drifting sideways forever.
        if (nextVY < 0.16 && Math.abs(nextVX) < 0.12) {
          nextVX = 0;
          nextVY = 0;
        }

        if (activeStone.plugin.hitDampingTime > 0) {
          nextVX *= Math.pow(0.85, dtRatio);
          nextVY *= Math.pow(0.87, dtRatio);
          activeStone.plugin.hitDampingTime -= frameDt;
        }

        Body.setVelocity(activeStone, { x: nextVX, y: nextVY });
      }

      const sweepTouchActive = performance.now() - lastSweepInputAt < sweepTapWindowMs;
      scrub *= isSweepBlockedForActiveStone()
        ? 0
        : Math.pow(sweepTouchActive ? 0.92 : 0.6, dtRatio);
      maybeEndShot();
    }

    for (const stone of allStones) {
      if (stone === activeStone) continue;
      const v = stone.velocity;
      const speed = stoneSpeed(stone);
      if (speed < 0.001) continue;

      let nextVX = v.x * Math.pow(0.925, dtRatio);
      let nextVY = Math.max(0, v.y * Math.pow(0.997, dtRatio) - 0.0036 * dtRatio);
      if (stone.plugin.hitDampingTime > 0) {
        const hits = Math.min(stone.plugin.hitCount, 4);
        const dampX = Math.max(0.90, 0.97 - (hits - 1) * 0.025);
        const dampY = Math.max(0.92, 0.98 - (hits - 1) * 0.02);
        nextVX *= Math.pow(dampX, dtRatio);
        nextVY *= Math.pow(dampY, dtRatio);
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
      const now = performance.now();
      if (areAllStonesStopped()) {
        if (!allStoppedSince) allStoppedSince = now;
        if (now - allStoppedSince >= 133) {
          awaitingAllStonesStop = false;
          completeShotAndAdvanceTurn();
        }
      } else {
        allStoppedSince = 0;
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
    if (houseViewHeld && chargingStone && !shotReleased && !aiActive) {
      const targetViewY = house.y - H * 0.58;
      cameraY += (targetViewY - cameraY) * (1 - Math.pow(1 - 0.12, dtRatio));
    } else if (shotReleased && activeStone) {
      const desiredY = activeStone.position.y - H * 0.68;
      cameraY += (desiredY - cameraY) * (1 - Math.pow(1 - 0.09, dtRatio));
    } else if (cameraResetRequested) {
      cameraY += (0 - cameraY) * (1 - Math.pow(1 - 0.045, dtRatio));
      if (Math.abs(cameraY) < 1.2) {
        cameraY = 0;
        cameraResetRequested = false;
        awaitingNextShotReset = false;
        spawnNextStone();
      }
    } else if (awaitingAllStonesStop || awaitingNextShotReset || awaitingNextEndKey) {
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

      const av = a.velocity;
      const bv = b.velocity;
      const impact = Vector.magnitude(Vector.sub(av, bv));
      playCollisionSound(impact);
      const midX = (a.position.x + b.position.x) / 2;
      const midY = (a.position.y + b.position.y) / 2;
      spawnCollisionParticles(midX, midY, impact);
      shakeIntensity = Math.min(8, impact * 1.2);
      if (a.plugin) a.plugin.hitCount += 1;
      if (b.plugin) b.plugin.hitCount += 1;
      const aHits = a.plugin ? a.plugin.hitCount : 1;
      const bHits = b.plugin ? b.plugin.hitCount : 1;
      const aDamp = Math.max(0.70, 0.94 - (aHits - 1) * 0.06);
      const bDamp = Math.max(0.70, 0.94 - (bHits - 1) * 0.06);
      const aFwd = Math.max(0.75, 0.96 - (aHits - 1) * 0.05);
      const bFwd = Math.max(0.75, 0.96 - (bHits - 1) * 0.05);
      Body.setVelocity(a, { x: av.x * aDamp, y: Math.max(0, av.y * aFwd) });
      Body.setVelocity(b, { x: bv.x * bDamp, y: Math.max(0, bv.y * bFwd) });
      Body.setAngularVelocity(a, a.angularVelocity * 0.76);
      Body.setAngularVelocity(b, b.angularVelocity * 0.76);
      if (a.plugin) a.plugin.hitDampingTime = 15 / 60;
      if (b.plugin) b.plugin.hitDampingTime = 15 / 60;
    }
  });

  Events.on(render, "afterRender", () => {
    if (shakeIntensity > 0.1) {
      shakeX = (Math.random() - 0.5) * shakeIntensity * 2;
      shakeY = (Math.random() - 0.5) * shakeIntensity * 2;
      shakeIntensity *= 0.82;
    } else {
      shakeX = 0;
      shakeY = 0;
      shakeIntensity = 0;
    }
    render.context.save();
    render.context.translate(shakeX, shakeY);
    Render.startViewTransform(render);
    drawIceBase();
    drawSheetDecor();
    drawStonesOverlay();
    drawSweepGhost();
    drawAimGuide();
    updateParticles(1 / 60);
    drawParticles();

    const c = render.context;
    c.save();
    if (chargingStone && !shotReleased && isCharging && spaceHeld) {
      const p = chargingStone.position;
      const cx = p.x;
      const my = p.y + 34;
      const maxH = startLineY - my;
      const level = Math.max(0, Math.min(1, charge));
      const fillH = Math.max(4, maxH * level);
      const topW = isMobile ? 12 : 6;
      const botW = topW + (isMobile ? 22 : 12) * level;

      const bandGrad = c.createLinearGradient(0, my, 0, my + maxH);
      bandGrad.addColorStop(0, "rgba(255, 236, 74, 0.98)");
      bandGrad.addColorStop(0.52, "rgba(255, 160, 44, 0.98)");
      bandGrad.addColorStop(0.76, "rgba(246, 106, 48, 0.99)");
      bandGrad.addColorStop(0.9, "rgba(232, 58, 44, 1)");
      bandGrad.addColorStop(1, "rgba(198, 34, 34, 1)");
      c.fillStyle = bandGrad;
      c.strokeStyle = "rgba(176, 214, 235, 0.72)";
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(cx - topW * 0.5, my);
      c.lineTo(cx + topW * 0.5, my);
      c.lineTo(cx + botW * 0.5, my + fillH);
      c.lineTo(cx - botW * 0.5, my + fillH);
      c.closePath();
      c.fill();
      c.stroke();

      c.fillStyle = "rgba(255, 255, 255, 0.18)";
      c.beginPath();
      const glossBot = my + fillH * 0.4;
      const glossBotW = topW + (botW - topW) * 0.4;
      c.moveTo(cx - topW * 0.5, my);
      c.lineTo(cx, my);
      c.lineTo(cx - glossBotW * 0.5 + glossBotW * 0.45, glossBot);
      c.lineTo(cx - glossBotW * 0.5, glossBot);
      c.closePath();
      c.fill();
    }

    c.restore();
    Render.endViewTransform(render);
    render.context.restore();

    if (done) {
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

    drawMiniMap();
    drawMobileScoreHud();
    drawStatusOverlay();
  });

  window.addEventListener("resize", () => {
    location.reload();
  });

  function startGame() {
    if (gameStarted) return;
    gameStarted = true;
    document.body.style.touchAction = "none";
    document.documentElement.style.touchAction = "none";
    render.canvas.style.touchAction = "none";
    initAudio();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    if (titleScreenEl) titleScreenEl.classList.add("hidden");
    if (hudEl) hudEl.classList.add("ready");
    spawnNextStone();
    Render.run(render);
    const fixedDt = 1000 / 60;
    let lastUpdate = performance.now();
    let accumulator = 0;
    function gameLoop() {
      const now = performance.now();
      accumulator += now - lastUpdate;
      lastUpdate = now;
      if (accumulator > 100) accumulator = 100;
      while (accumulator >= fixedDt) {
        Engine.update(engine, fixedDt);
        accumulator -= fixedDt;
      }
      requestAnimationFrame(gameLoop);
    }
    requestAnimationFrame(gameLoop);
  }

  window.addEventListener("keydown", () => startGame(), { once: true });
  window.addEventListener("mousedown", () => startGame(), { once: true });
  window.addEventListener("touchstart", () => startGame(), { once: true });
  updateStonesLeftTable();
})();
