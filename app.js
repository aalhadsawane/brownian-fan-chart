// Brownian fan chart: a branching random walk pruned by what has already happened.
//
// Port of a raylib demo. Every root->leaf path is one complete possible future;
// as the present line advances, reality takes one branch and everything on the
// other side of it stops being a possible future -- Bayes' rule, applied directly
// to the tree instead of a formula. See main.cpp in this repo for the original C
// version and a fuller explanation of the tree/heap layout used below.

(() => {
  const DEPTH = 10; // time steps; leaves = 2^10 = 1024 possible histories
  const NODES = 1 << (DEPTH + 1); // heap layout, 1-based: root = 1, children of i are 2i, 2i+1
  const START_YEAR = 2016;
  let PAD_X = 56;
  let PAD_TOP = 40;
  let PAD_BOTTOM = 36;

  const COLOR_DEAD = "rgba(111, 118, 144, 0.28)";
  const COLOR_LIVE = "rgba(90, 200, 255, 0.55)";
  const COLOR_TRUTH = "#ffb23c";
  const COLOR_PRESENT = "#ef4444";
  const COLOR_AXIS = "rgba(255, 255, 255, 0.18)";
  const COLOR_AXIS_TEXT = "rgba(255, 255, 255, 0.4)";

  const pos = new Float32Array(NODES); // pos[i] = walk value at node i
  const real = new Int32Array(DEPTH + 1); // real[d] = node index of the history that happened, at depth d
  let maxAbs = 1e-6;

  const canvas = document.getElementById("chart");
  const ctx = canvas.getContext("2d");

  const playBtn = document.getElementById("playBtn");
  const speedDown = document.getElementById("speedDown");
  const speedUp = document.getElementById("speedUp");
  const speedLabel = document.getElementById("speedLabel");
  const scrub = document.getElementById("scrub");
  const reseedBtn = document.getElementById("reseedBtn");
  const yearLabel = document.getElementById("yearLabel");
  const futuresLabel = document.getElementById("futuresLabel");
  const eliminatedLabel = document.getElementById("eliminatedLabel");

  scrub.max = String(DEPTH);

  let cssWidth = 0;
  let cssHeight = 0;
  let dpr = Math.max(1, window.devicePixelRatio || 1);

  let tNow = 0; // continuous cursor; integer part = steps resolved
  let speed = 1.2; // steps per second
  let paused = false;
  let scrubbing = false;
  let lastTime = performance.now();

  // -------------------------------------------------------------- generation

  function gaussian() {
    let u1 = Math.random();
    if (u1 <= 0) u1 = 1e-9;
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function build() {
    pos[1] = 0;
    for (let i = 2; i < NODES; i++) pos[i] = pos[i >> 1] + gaussian();

    real[0] = 1;
    for (let d = 1; d <= DEPTH; d++) real[d] = 2 * real[d - 1] + (Math.random() < 0.5 ? 0 : 1);

    let m = 1e-6;
    for (let i = 1; i < NODES; i++) {
      const a = Math.abs(pos[i]);
      if (a > m) m = a;
    }
    maxAbs = m;
  }

  // Is node i (at depth d) still a possible world, given reality has reached
  // node real[dNow] at depth dNow? One shift and one compare, no traversal.
  function alive(i, d, dNow) {
    return d >= dNow ? i >> (d - dNow) === real[dNow] : real[dNow] >> (dNow - d) === i;
  }

  // -------------------------------------------------------------- geometry

  function plotHeight() {
    return cssHeight - PAD_TOP - PAD_BOTTOM;
  }

  function xAt(t) {
    return PAD_X + (t / DEPTH) * (cssWidth - 2 * PAD_X);
  }

  function yAt(v) {
    const yScale = (plotHeight() / 2) / maxAbs;
    return PAD_TOP + plotHeight() / 2 - v * yScale;
  }

  // -------------------------------------------------------------- canvas setup

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.max(1, window.devicePixelRatio || 1);
    cssWidth = rect.width;
    cssHeight = rect.height;
    // Backing store matches CSS size * devicePixelRatio exactly, so nothing
    // gets upscaled/blurred by the browser -- this is what keeps thin lines
    // (like the present marker) crisp instead of soft or blocky.
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Padding scales down on narrow (phone) widths so the plot area doesn't
    // shrink to a sliver once axis labels are accounted for.
    const small = cssWidth < 480;
    PAD_X = small ? 28 : 56;
    PAD_TOP = small ? 30 : 40;
    PAD_BOTTOM = small ? 28 : 36;
  }

  // Snap a CSS-space x coordinate to the nearest device pixel so a stroke
  // drawn there lands on a crisp pixel boundary instead of straddling two
  // and rendering as a soft, muddy band.
  function snap(xCss) {
    return Math.round(xCss * dpr) / dpr;
  }

  // -------------------------------------------------------------- drawing

  function drawAxis(dNow) {
    ctx.strokeStyle = COLOR_AXIS;
    ctx.lineWidth = 1;
    const axisY = snap(cssHeight - PAD_BOTTOM) + 0.5 / dpr;
    ctx.beginPath();
    ctx.moveTo(PAD_X, axisY);
    ctx.lineTo(cssWidth - PAD_X, axisY);
    ctx.stroke();

    // On narrow screens there isn't room for a label every year without
    // overlap, so thin them out (always keeping the present year).
    const labelStep = cssWidth < 380 ? 3 : cssWidth < 560 ? 2 : 1;

    ctx.font = "12px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let d = 0; d <= DEPTH; d++) {
      const isNow = d === dNow;
      if (d % labelStep !== 0 && !isNow) continue;
      const x = xAt(d);
      ctx.fillStyle = isNow ? "rgba(239, 68, 68, 0.9)" : COLOR_AXIS_TEXT;
      ctx.fillText(String(START_YEAR + d), snap(x), cssHeight - PAD_BOTTOM + 8);
    }
  }

  function drawEdges(dNow, wantAlive) {
    ctx.strokeStyle = wantAlive ? COLOR_LIVE : COLOR_DEAD;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let d = 1; d <= DEPTH; d++) {
      const lo = 1 << d;
      const hi = 1 << (d + 1);
      for (let i = lo; i < hi; i++) {
        if (alive(i, d, dNow) !== wantAlive) continue;
        ctx.moveTo(xAt(d - 1), yAt(pos[i >> 1]));
        ctx.lineTo(xAt(d), yAt(pos[i]));
      }
    }
    ctx.stroke();
  }

  function drawTruth(dNow, frac) {
    ctx.strokeStyle = COLOR_TRUTH;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let d = 1; d <= dNow; d++) {
      ctx.moveTo(xAt(d - 1), yAt(pos[real[d - 1]]));
      ctx.lineTo(xAt(d), yAt(pos[real[d]]));
    }
    let headX = xAt(dNow);
    let headY = yAt(pos[real[dNow]]);
    if (dNow < DEPTH) {
      const nx = xAt(dNow + 1);
      const ny = yAt(pos[real[dNow + 1]]);
      headX += (nx - headX) * frac;
      headY += (ny - headY) * frac;
      ctx.moveTo(xAt(dNow), yAt(pos[real[dNow]]));
      ctx.lineTo(headX, headY);
    }
    ctx.stroke();

    ctx.fillStyle = COLOR_TRUTH;
    ctx.beginPath();
    ctx.arc(headX, headY, 4.5, 0, Math.PI * 2);
    ctx.fill();

    return { x: headX, y: headY };
  }

  function drawPresentLine(headX) {
    const width = 2; // CSS px
    const x = snap(headX);
    const top = PAD_TOP * 0.3;
    const bottom = cssHeight - PAD_BOTTOM * 0.55;

    ctx.save();
    ctx.shadowColor = "rgba(239, 68, 68, 0.55)";
    ctx.shadowBlur = 6;
    ctx.fillStyle = COLOR_PRESENT;
    ctx.fillRect(x - width / 2, top, width, bottom - top);
    ctx.restore();
  }

  function render(dNow, frac) {
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = "#0e1016";
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    drawAxis(dNow);
    drawEdges(dNow, false);
    drawEdges(dNow, true);
    const head = drawTruth(dNow, frac);
    drawPresentLine(head.x);
  }

  // -------------------------------------------------------------- HUD / controls

  function updateHud(dNow) {
    const year = START_YEAR + dNow;
    yearLabel.textContent = String(year);

    const total = 1 << DEPTH;
    const left = 1 << (DEPTH - dNow);
    futuresLabel.textContent = `${left.toLocaleString()} of ${total.toLocaleString()} futures possible (${((100 * left) / total).toFixed(2)}%)`;
    eliminatedLabel.textContent = `${(total - left).toLocaleString()} eliminated by history`;
  }

  function setPaused(next) {
    paused = next;
    playBtn.textContent = paused ? "Play" : "Pause";
  }

  function setSpeed(next) {
    speed = Math.min(8, Math.max(0.1, next));
    speedLabel.textContent = `${speed.toFixed(1)}×`;
  }

  function reseed() {
    build();
    tNow = 0;
  }

  // -------------------------------------------------------------- main loop

  const keys = { left: false, right: false };

  function frame(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    if (keys.right) tNow += 4 * dt;
    if (keys.left) tNow -= 4 * dt;
    if (!paused && !scrubbing) tNow += speed * dt;

    tNow = Math.min(DEPTH, Math.max(0, tNow));

    const dNow = Math.floor(tNow);
    const frac = tNow - dNow;

    render(dNow, frac);
    updateHud(dNow);
    if (!scrubbing) scrub.value = String(tNow);

    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resizeCanvas);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", resizeCanvas);
  }

  playBtn.addEventListener("click", () => setPaused(!paused));
  speedDown.addEventListener("click", () => setSpeed(speed / 1.5));
  speedUp.addEventListener("click", () => setSpeed(speed * 1.5));
  reseedBtn.addEventListener("click", reseed);

  scrub.addEventListener("pointerdown", () => {
    scrubbing = true;
  });
  scrub.addEventListener("input", () => {
    tNow = parseFloat(scrub.value);
  });
  window.addEventListener("pointerup", () => {
    scrubbing = false;
  });

  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLElement && e.target.tagName === "INPUT" && e.key !== " ") return;
    switch (e.key) {
      case " ":
        e.preventDefault();
        setPaused(!paused);
        break;
      case "r":
      case "R":
        reseed();
        break;
      case "ArrowRight":
        keys.right = true;
        break;
      case "ArrowLeft":
        keys.left = true;
        break;
      case "ArrowUp":
        e.preventDefault();
        setSpeed(speed * 1.5);
        break;
      case "ArrowDown":
        e.preventDefault();
        setSpeed(speed / 1.5);
        break;
      default:
        break;
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowRight") keys.right = false;
    if (e.key === "ArrowLeft") keys.left = false;
  });

  // -------------------------------------------------------------- boot

  resizeCanvas();
  build();
  setSpeed(speed);
  requestAnimationFrame((t) => {
    lastTime = t;
    requestAnimationFrame(frame);
  });
})();
